import type { Role } from '../../auth/permissions.js';
import type { User } from '../user.entity.js';

/** 回應用的 DTO，與 Entity 分開。絕對不包含 passwordHash */
export class UserResponseDto {
  id: number;
  username: string;
  role: Role;
  isActive: boolean;
  passwordChangedAt: Date | null;
  /** 連續登入失敗而被鎖定到這個時間；null 或已過去表示沒有鎖定 */
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;

  static from(user: User): UserResponseDto {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      passwordChangedAt: user.passwordChangedAt,
      lockedUntil: user.lockedUntil,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
