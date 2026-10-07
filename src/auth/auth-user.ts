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
}

export type AuthenticatedRequest = Request & { user?: AuthUser };
