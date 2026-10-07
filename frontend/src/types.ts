// 與後端 API 合約對應的型別（見 docs/api-spec.md）

export type Role = 'admin' | 'readonly'
export type Permission =
  | 'employee:read'
  | 'employee:create'
  | 'employee:update'
  | 'user:manage'
export type EmployeeStatus = 'active' | 'on_leave' | 'resigned'

export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: '在職',
  on_leave: '留職停薪',
  resigned: '離職',
}

/** 與後端 employee.rules.ts 相同的狀態轉換表，只用來決定下拉選單的選項；真正的檢查在後端 */
export const NEXT_STATUSES: Record<EmployeeStatus, EmployeeStatus[]> = {
  active: ['active', 'on_leave', 'resigned'],
  on_leave: ['on_leave', 'active', 'resigned'],
  resigned: ['resigned'],
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: '管理者',
  readonly: '唯讀',
}

export interface ManagedUser {
  id: number
  username: string
  role: Role
  isActive: boolean
  passwordChangedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CurrentUser {
  id: number
  username: string
  role: Role
  permissions: Permission[]
}

export interface Employee {
  id: number
  employeeNo: string
  name: string
  email: string
  phone: string | null
  department: string
  jobTitle: string
  hireDate: string
  status: EmployeeStatus
  resignationDate: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface Paginated<T> {
  items: T[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

export interface FieldError {
  field: string
  errors: string[]
}
