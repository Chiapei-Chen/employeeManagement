import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { UsersService } from '../../users/users.service.js';
import type { AuthenticatedRequest, JwtPayload } from '../auth-user.js';
import { passwordVersion } from '../auth.service.js';
import { IS_PUBLIC_KEY } from '../decorators/access.decorators.js';

/**
 * Authentication
 * 全域註冊，預設所有路由都要登入；只有標 @Public() 的例外。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), // 方法上標籤
      context.getClass(), // 控制器類別上標籤
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(req.headers.authorization);
    if (!token) throw this.unauthorized('Missing bearer token');

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw this.unauthorized('Invalid or expired token');
    }
    if (payload.typ !== 'access') throw this.unauthorized('Invalid token type');

    // 判斷帳號是否仍然啟用
    const user = await this.usersService.getActiveById(payload.sub);
    if (!user) throw this.unauthorized('User no longer active');
    // 驗證密碼版本是否一致
    if (payload.pwd !== passwordVersion(user)) {
      throw this.unauthorized('Password has been changed, please log in again');
    }

    req.user = { id: user.id, username: user.username, role: user.role };
    return true;
  }

  private extractBearerToken(header?: string): string | null {
    const [type, token] = header?.split(' ') ?? [];
    return type === 'Bearer' && token ? token : null;
  }

  private unauthorized(message: string) {
    return AppException.of(ErrorCode.Unauthorized, message);
  }
}
