import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../common/errors/app.exception.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { AppConfig } from '../config/configuration.js';
import { verifyPassword } from '../users/password.js';
import type { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import type { AuthUser, JwtPayload } from './auth-user.js';
import type { CurrentUserDto } from './dto/current-user.dto.js';
import type { LoginResponseDto } from './dto/login-response.dto.js';
import { permissionsOf } from './permissions.js';

/**
 * token 中記錄簽發當下的 passwordChangedAt，guard 會與 DB 的值比對。
 * 用「值是否相同」而不是比較 JWT 的 iat（簽發時間），
 * 因為 iat 只精確到秒：同一秒內修改密碼，舊 token 會被誤判為有效。
 */
export function passwordVersion(user: Pick<User, 'passwordChangedAt'>) {
  return user.passwordChangedAt?.getTime() ?? 0;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService, // 來自 UsersModule
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** 登入-帳號密碼換取 token */
  async login(username: string, password: string): Promise<LoginResponseDto> {
    // 取得帳號資料
    const user = await this.usersService.getByUsername(username);

    // 比對密碼
    // 帳號不存在時也比對一次，讓回應時間相近，避免被猜出哪些帳號存在
    const passwordOk = await verifyPassword(password, user?.passwordHash);

    // 判斷 帳號是否存在、密碼是否正確、帳號是否啟用
    // 三種情況回傳同一個錯誤，不透露是哪一種
    if (!user || !passwordOk || !user.isActive) {
      throw AppException.of(ErrorCode.InvalidCredentials);
    }

    // 簽發 token
    return this.issueToken(user);
  }

  /**
   * 登入-修改自己的密碼
   * 成功後之前的 token 全部失效（包含其他裝置），並回傳新的 token，讓目前的畫面不會被登出
   */
  async changeOwnPassword(
    actor: AuthUser,
    currentPassword: string,
    newPassword: string,
  ): Promise<LoginResponseDto> {
    // 取得目前登入者的帳號資料
    const user = await this.usersService.getActiveById(actor.id);

    // 判斷 帳號是否仍然啟用
    if (!user) {
      throw AppException.of(ErrorCode.Unauthorized, 'User no longer active');
    }

    // 判斷 目前的密碼是否正確
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw AppException.ofField(
        ErrorCode.InvalidCurrentPassword,
        'currentPassword',
      );
    }

    // 判斷 新密碼是否與目前的密碼不同
    if (await verifyPassword(newPassword, user.passwordHash)) {
      throw AppException.ofField(ErrorCode.PasswordUnchanged, 'newPassword');
    }

    // 設定新密碼，並簽發新的 token
    const updated = await this.usersService.setPassword(user.id, newPassword);
    return this.issueToken(updated);
  }

  /** 登入-目前登入者與其權限 */
  getCurrentUser(user: AuthUser): CurrentUserDto {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: [...permissionsOf(user.role)],
    };
  }

  /** 簽發 token，並附上登入者資訊 */
  private async issueToken(user: User): Promise<LoginResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      pwd: passwordVersion(user),
    };
    const expiresIn = this.config.get('jwt.expiresInSeconds', { infer: true });
    return {
      accessToken: await this.jwtService.signAsync(payload, { expiresIn }),
      tokenType: 'Bearer',
      expiresIn,
      user: this.getCurrentUser(user),
    };
  }
}
