import { randomUUID } from 'node:crypto';
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
import { RefreshTokensRepository } from './refresh-tokens.repository.js';

/**
 * 已使用過的 refresh token 在這段時間內再被拿來用，不視為被偷。
 * 同一個瀏覽器的多個分頁共用同一個 cookie，同時重新整理時會拿同一張 token 來換。
 */
const REFRESH_REUSE_GRACE_MS = 10_000;

/**
 * token 中記錄簽發當下的 passwordChangedAt，guard 會與 DB 的值比對。
 * 用「值是否相同」而不是比較 JWT 的 iat（簽發時間），
 * 因為 iat 只精確到秒：同一秒內修改密碼，舊 token 會被誤判為有效。
 */
export function passwordVersion(user: Pick<User, 'passwordChangedAt'>) {
  return user.passwordChangedAt?.getTime() ?? 0;
}

/** 回給前端的內容（含 access token），以及要放進 HttpOnly cookie 的 refresh token */
export interface AuthSession {
  response: LoginResponseDto;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService, // 來自 UsersModule
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly refreshTokens: RefreshTokensRepository,
  ) {}

  /** 登入-帳號密碼換取 token */
  async login(username: string, password: string): Promise<AuthSession> {
    // 取得帳號資料
    const user = await this.usersService.getByUsername(username);

    // 比對密碼
    // 帳號不存在、已鎖定時也比對一次，讓回應時間相近，避免被猜出哪些帳號存在或已被鎖定
    const passwordOk = await verifyPassword(password, user?.passwordHash);

    // 判斷 帳號是否存在、是否啟用、是否鎖定中
    // 鎖定中即使密碼正確也拒絕，否則攻擊者在鎖定期間仍然可以繼續猜
    // 與密碼錯誤回傳同一個錯誤，不透露是哪一種
    const locked = !!user?.lockedUntil && user.lockedUntil > new Date();
    if (!user || !user.isActive || locked) {
      throw AppException.of(ErrorCode.InvalidCredentials);
    }

    // 判斷 密碼是否正確
    // 錯誤時記錄失敗次數，連續失敗達到上限就暫時鎖定
    if (!passwordOk) {
      await this.usersService.recordLoginFailure(user.id);
      throw AppException.of(ErrorCode.InvalidCredentials);
    }

    // 登入成功，清除之前的失敗次數
    if (user.failedLoginCount > 0) {
      await this.usersService.clearLoginFailures(user.id);
    }

    // 簽發 token
    return this.startSession(user);
  }

  /**
   * 登入-用 refresh token 換新的 access token
   * 同時換發新的 refresh token，只要持續使用就不會被登出
   * 每張 refresh token 只能換發一次；已經用過的又被拿來用，代表可能被偷，整個 family 作廢
   * 與 access token 相同：帳號停用或密碼已修改後，refresh token 也立即失效
   */
  async refresh(refreshToken: string | null): Promise<AuthSession> {
    if (!refreshToken) throw this.unauthorized('Missing refresh token');

    let payload: JwtPayload;
    try {
      // 檢查簽章以及過期時間
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken);
    } catch {
      throw this.unauthorized('Invalid or expired refresh token');
    }
    if (payload.typ !== 'refresh' || !payload.jti) {
      throw this.unauthorized('Invalid token type');
    }

    // 判斷帳號是否仍然啟用
    const user = await this.usersService.getActiveById(payload.sub);
    if (!user) throw this.unauthorized('User no longer active');
    // 判斷密碼是否已修改
    if (payload.pwd !== passwordVersion(user)) {
      throw this.unauthorized('Password has been changed, please log in again');
    }

    // db, 把這張標記為已使用，並新增下一張
    const nextId = randomUUID();
    const result = await this.refreshTokens.rotate(
      payload.jti,
      REFRESH_REUSE_GRACE_MS, // 寬限10秒
      { id: nextId, expiresAt: this.refreshExpiresAt() },
    );
    if (result === 'reused') {
      throw this.unauthorized(
        'Refresh token reuse detected, please log in again',
      );
    }
    if (result === 'invalid') {
      throw this.unauthorized('Refresh token has been revoked');
    }

    return this.issueTokens(user, nextId);
  }

  /**
   * 登入-登出：作廢這次登入換發出來的所有 refresh token
   * token 無效或已過期時不處理，登出一律成功
   */
  async logout(refreshToken: string | null): Promise<void> {
    if (!refreshToken) return;

    const payload = await this.jwtService
      .verifyAsync<JwtPayload>(refreshToken)
      .catch(() => null);
    if (payload?.typ !== 'refresh' || !payload.jti) return;

    // db, 作廢整個 family
    await this.refreshTokens.revokeFamilyOf(payload.jti);
  }

  /**
   * 登入-修改自己的密碼
   * 成功後之前的 token 全部失效（包含其他裝置），並回傳新的 token，讓目前的畫面不會被登出
   */
  async changeOwnPassword(
    actor: AuthUser,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthSession> {
    // 取得目前登入者的帳號資料
    const user = await this.usersService.getActiveById(actor.id);

    // 判斷 帳號是否仍然啟用
    if (!user) throw this.unauthorized('User no longer active');

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
    return this.startSession(updated);
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

  /** 開始一次新的登入：refresh token 屬於新的 family */
  private async startSession(user: User): Promise<AuthSession> {
    // db, 順便清掉這個帳號已過期的記錄
    await this.refreshTokens.deleteExpiredOfUser(user.id);

    // db, 記錄這張 refresh token
    const refreshTokenId = randomUUID();
    await this.refreshTokens.add({
      id: refreshTokenId,
      userId: user.id,
      familyId: randomUUID(),
      expiresAt: this.refreshExpiresAt(),
    });

    return this.issueTokens(user, refreshTokenId);
  }

  /** 簽發 access token 與 refresh token，並附上登入者資訊 */
  private async issueTokens(
    user: User,
    refreshTokenId: string,
  ): Promise<AuthSession> {
    const base = {
      sub: user.id,
      username: user.username,
      pwd: passwordVersion(user),
    };
    const expiresIn = this.config.get('jwt.expiresInSeconds', { infer: true });
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync<JwtPayload>(
        { ...base, typ: 'access' },
        { expiresIn },
      ),
      this.jwtService.signAsync<JwtPayload>(
        { ...base, typ: 'refresh', jti: refreshTokenId },
        { expiresIn: this.refreshExpiresInSeconds() },
      ),
    ]);
    return {
      response: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn,
        user: this.getCurrentUser(user),
      },
      refreshToken,
    };
  }

  private refreshExpiresInSeconds() {
    return this.config.get('jwt.refreshExpiresInSeconds', { infer: true });
  }

  private refreshExpiresAt() {
    return new Date(Date.now() + this.refreshExpiresInSeconds() * 1000);
  }

  private unauthorized(message: string) {
    return AppException.of(ErrorCode.Unauthorized, message);
  }
}
