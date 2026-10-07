import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { AuthenticatedRequest } from '../auth-user.js';
import {
  AUTHENTICATED_ONLY_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
} from '../decorators/access.decorators.js';
import { type Permission, permissionsOf } from '../permissions.js';

/**
 * 第二道關卡：Authorization（你能做什麼）
 * 在 JwtAuthGuard 之後執行，此時 req.user 已存在。
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    if (
      this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_ONLY_KEY, targets)
    ) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      targets,
    );
    // Fail closed：沒宣告存取等級的 endpoint 一律拒絕
    if (!required?.length) {
      throw this.forbidden('Endpoint has no access policy declared');
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const granted = user ? permissionsOf(user.role) : [];
    const missing = required.filter((p) => !granted.includes(p));
    if (missing.length) {
      throw this.forbidden(`Missing permission: ${missing.join(', ')}`);
    }
    return true;
  }

  private forbidden(message: string) {
    return AppException.of(ErrorCode.Forbidden, message);
  }
}
