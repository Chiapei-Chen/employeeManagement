import type {
  CurrentUser,
  Employee,
  FieldError,
  ManagedUser,
  Paginated,
  Role,
} from './types';

/**
 * access token 只放在記憶體，不寫入 localStorage / sessionStorage，降低被 XSS 讀走的風險。
 * 重新整理頁面後 token 會消失，改用 HttpOnly cookie 中的 refresh token 向後端換新的
 * （refresh token 由瀏覽器保管並自動帶上，JS 讀不到）。
 */
let accessToken: string | null = null;

export const tokenStore = {
  get: () => accessToken,
  set: (token: string) => {
    accessToken = token;
  },
  clear: () => {
    accessToken = null;
  },
};

/** 後端統一錯誤格式 → 前端例外。畫面依 `code` 判斷，不比對 message 字串 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: FieldError[];

  constructor(
    status: number,
    code: string,
    message: string,
    details: FieldError[] = [],
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** 轉成 { 欄位: 錯誤訊息 }，方便表單直接顯示在對應欄位下方 */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      this.details.map((d) => [d.field, d.errors.join('、')]),
    );
  }
}

/** refresh 也失敗時通知 auth store 登出（避免 api.ts 反過來依賴 router） */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

type TokenResponse = { accessToken: string; user: CurrentUser };

/** 這些 API 的 401 不代表 access token 過期，不能觸發自動 refresh */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/logout'];

/**
 * 用 cookie 中的 refresh token 換新的 access token。
 * 同時有多個請求遇到 401 時，共用同一次 refresh，不重複呼叫。
 */
let refreshing: Promise<TokenResponse> | null = null;
export function refreshSession(): Promise<TokenResponse> {
  refreshing ??= send<TokenResponse>('POST', '/auth/refresh')
    .then((res) => {
      tokenStore.set(res.accessToken);
      return res;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  try {
    return await send<T>(method, path, body);
  } catch (err) {
    if (
      !(err instanceof ApiError) ||
      err.status !== 401 ||
      AUTH_ENDPOINTS.includes(path)
    ) {
      throw err;
    }
    // access token 過期 → 換一個新的再重送一次；refresh 也失敗代表真的要重新登入
    try {
      await refreshSession();
    } catch {
      onUnauthorized();
      throw err;
    }
    return send<T>(method, path, body);
  }
}

async function send<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`/api/v1${path}`, {
    method,
    // 同網域請求預設就會帶 cookie；明確寫出來，refresh token 才一定會送到後端
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.code ?? 'UNKNOWN',
      data?.message ?? res.statusText,
      data?.details ?? [],
    );
  }
  return data as T;
}

export interface EmployeeQuery {
  keyword?: string;
  department?: string;
  status?: string;
  hireDateFrom?: string;
  hireDateTo?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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
>;

export const api = {
  login: (username: string, password: string) =>
    request<TokenResponse>('POST', '/auth/login', { username, password }),
  logout: () => request<null>('POST', '/auth/logout'),
  me: () => request<CurrentUser>('GET', '/auth/me'),
  changeOwnPassword: (currentPassword: string, newPassword: string) =>
    request<TokenResponse>('PATCH', '/auth/me/password', {
      currentPassword,
      newPassword,
    }),

  listUsers: () => request<ManagedUser[]>('GET', '/users'),
  createUser: (input: { username: string; password: string; role: Role }) =>
    request<ManagedUser>('POST', '/users', input),
  updateUser: (id: number, input: { role?: Role; isActive?: boolean }) =>
    request<ManagedUser>('PATCH', `/users/${id}`, input),
  resetUserPassword: (id: number, newPassword: string) =>
    request<null>('POST', `/users/${id}/reset-password`, { newPassword }),
  unlockUser: (id: number) =>
    request<ManagedUser>('POST', `/users/${id}/unlock`),

  listEmployees: (query: EmployeeQuery) => {
    // 空字串的條件不送出，否則後端會把 "" 當成「部門等於空字串」
    const params = new URLSearchParams(
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)]),
    );
    return request<Paginated<Employee>>('GET', `/employees?${params}`);
  },
  getEmployee: (id: number) => request<Employee>('GET', `/employees/${id}`),
  createEmployee: (input: EmployeeInput) =>
    request<Employee>('POST', '/employees', input),
  updateEmployee: (id: number, input: EmployeeInput & { version: number }) =>
    request<Employee>('PATCH', `/employees/${id}`, input),
};
