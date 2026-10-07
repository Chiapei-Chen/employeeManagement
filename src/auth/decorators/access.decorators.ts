import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { AuthenticatedRequest, AuthUser } from '../auth-user.js';
import type { Permission } from '../permissions.js';

/**
 * 主要用途是提供一組貼在 API 上的標籤，讓每個 endpoint 註明誰可以呼叫
 * 每個 endpoint 都必須明確宣告存取等級，三選一：
 *   @Public()                  不需登入（例如 login）
 *   @AuthenticatedOnly()       登入即可，不限角色（例如 /auth/me）
 *   @RequirePermissions(...)   登入且角色具備指定權限
 * 什麼都沒標的 endpoint 會被 PermissionsGuard 拒絕（fail closed），
 * 避免日後新增 API 時忘了加權限而意外對外開放。
 */
export const IS_PUBLIC_KEY = 'access:public';
export const AUTHENTICATED_ONLY_KEY = 'access:authenticatedOnly';
export const PERMISSIONS_KEY = 'access:permissions';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const AuthenticatedOnly = () =>
  SetMetadata(AUTHENTICATED_ONLY_KEY, true);
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return req.user!;
  },
);
