import type { Request } from 'express';
import type { Role } from './permissions.js';

/** 通過 JwtAuthGuard 後掛在 request 上的使用者資訊 */
export interface AuthUser {
  id: number;
  username: string;
  role: Role;
}

export interface JwtPayload {
  sub: number;
  username: string;
  pwd: number;
  /** 區分兩種 token，避免 refresh token 被拿來當 access token 使用（反之亦然） */
  typ: 'access' | 'refresh';
}

export type AuthenticatedRequest = Request & { user?: AuthUser };
