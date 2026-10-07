/**
 * 角色 (Role) 與權限 (Permission) 分開：
 * - Endpoint 只宣告「需要什麼權限」，不寫死「哪些角色可以進」
 * - 角色擁有哪些權限集中在這張表
 * 之後新增角色（例如 hr_manager）只要改這張表，不用逐一修改 controller。
 */
export enum Role {
  Admin = 'admin',
  Readonly = 'readonly',
}

export enum Permission {
  EmployeeRead = 'employee:read',
  EmployeeCreate = 'employee:create',
  EmployeeUpdate = 'employee:update',
  UserManage = 'user:manage',
}

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [Role.Readonly]: [Permission.EmployeeRead],
  [Role.Admin]: [
    Permission.EmployeeRead,
    Permission.EmployeeCreate,
    Permission.EmployeeUpdate,
    Permission.UserManage,
  ],
};

export function permissionsOf(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
