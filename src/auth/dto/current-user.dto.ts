import type { Permission, Role } from '../permissions.js';

/** 目前登入者。登入回應與 GET /auth/me 共用 */
export class CurrentUserDto {
  id: number;
  username: string;
  role: Role;
  /** 前端可用來決定要不要顯示「新增 / 編輯」按鈕；真正的檢查仍在後端 */
  permissions: Permission[];
}
