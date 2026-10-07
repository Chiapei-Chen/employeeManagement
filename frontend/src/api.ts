import type { CurrentUser, Employee, FieldError, ManagedUser, Paginated, Role } from './types'

const TOKEN_KEY = 'accessToken'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

/** 後端統一錯誤格式 → 前端例外。畫面依 `code` 判斷，不比對 message 字串 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: FieldError[]

  constructor(status: number, code: string, message: string, details: FieldError[] = []) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }

  /** 轉成 { 欄位: 錯誤訊息 }，方便表單直接顯示在對應欄位下方 */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.map((d) => [d.field, d.errors.join('、')]))
  }
}

/** token 失效時通知 auth store 登出（避免 api.ts 反過來依賴 router） */
let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get()
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    // 登入 API 本身的 401 是「帳密錯誤」，不是「token 過期」，不能觸發登出
    if (res.status === 401 && path !== '/auth/login') onUnauthorized()
    throw new ApiError(
      res.status,
      data?.code ?? 'UNKNOWN',
      data?.message ?? res.statusText,
      data?.details ?? [],
    )
  }
  return data as T
}

export interface EmployeeQuery {
  keyword?: string
  department?: string
  status?: string
  hireDateFrom?: string
  hireDateTo?: string
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export type EmployeeInput = Partial<
  Pick<
    Employee,
    | 'employeeNo'
    | 'name'
    | 'email'
    | 'phone'
    | 'department'
    | 'jobTitle'
    | 'hireDate'
    | 'status'
    | 'resignationDate'
  >
>

type TokenResponse = { accessToken: string; user: CurrentUser }

export const api = {
  login: (username: string, password: string) =>
    request<TokenResponse>('POST', '/auth/login', { username, password }),
  me: () => request<CurrentUser>('GET', '/auth/me'),
  changeOwnPassword: (currentPassword: string, newPassword: string) =>
    request<TokenResponse>('PATCH', '/auth/me/password', { currentPassword, newPassword }),

  listUsers: () => request<ManagedUser[]>('GET', '/users'),
  createUser: (input: { username: string; password: string; role: Role }) =>
    request<ManagedUser>('POST', '/users', input),
  updateUser: (id: number, input: { role?: Role; isActive?: boolean }) =>
    request<ManagedUser>('PATCH', `/users/${id}`, input),
  resetUserPassword: (id: number, newPassword: string) =>
    request<null>('POST', `/users/${id}/reset-password`, { newPassword }),

  listEmployees: (query: EmployeeQuery) => {
    // 空字串的條件不送出，否則後端會把 "" 當成「部門等於空字串」
    const params = new URLSearchParams(
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)]),
    )
    return request<Paginated<Employee>>('GET', `/employees?${params}`)
  },
  getEmployee: (id: number) => request<Employee>('GET', `/employees/${id}`),
  createEmployee: (input: EmployeeInput) => request<Employee>('POST', '/employees', input),
  updateEmployee: (id: number, input: EmployeeInput & { version: number }) =>
    request<Employee>('PATCH', `/employees/${id}`, input),
}
