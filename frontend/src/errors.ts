import { ApiError } from './api'

/** 依錯誤碼顯示中文說明；欄位錯誤則對應回表單欄位 */
const CODE_MESSAGES: Record<string, string> = {
  VALIDATION_FAILED: '資料有誤，請檢查標示的欄位',
  INVALID_CREDENTIALS: '帳號或密碼錯誤',
  TOO_MANY_REQUESTS: '嘗試次數過多，請稍後再試',
  FORBIDDEN: '你沒有執行此操作的權限',
  EMPLOYEE_NOT_FOUND: '找不到這位員工',
  EMPLOYEE_NO_DUPLICATED: '員工編號已存在',
  EMPLOYEE_EMAIL_DUPLICATED: 'Email 已被其他員工使用',
  EMPLOYEE_VERSION_CONFLICT: '這筆資料在你編輯期間已被其他人修改',
  INVALID_STATUS_TRANSITION: '無法變更為這個狀態',
  USER_NOT_FOUND: '找不到這個帳號',
  USERNAME_DUPLICATED: '帳號名稱已存在',
  CANNOT_MODIFY_SELF: '不能修改自己的角色、狀態或用這裡重設自己的密碼',
  LAST_ADMIN_REQUIRED: '系統中至少要保留一位啟用中的管理者',
  INVALID_CURRENT_PASSWORD: '目前的密碼不正確',
  PASSWORD_UNCHANGED: '新密碼不能與目前的密碼相同',
}

/** 屬於特定欄位的業務錯誤，顯示在欄位下方會比顯示在頁面上方更清楚 */
const CODE_FIELDS: Record<string, string> = {
  EMPLOYEE_NO_DUPLICATED: 'employeeNo',
  EMPLOYEE_EMAIL_DUPLICATED: 'email',
  INVALID_STATUS_TRANSITION: 'status',
  USERNAME_DUPLICATED: 'username',
  INVALID_CURRENT_PASSWORD: 'currentPassword',
  PASSWORD_UNCHANGED: 'newPassword',
}

export function describeError(error: unknown): {
  message: string
  fields: Record<string, string>
  code: string
} {
  if (!(error instanceof ApiError)) {
    return { message: '無法連線到伺服器', fields: {}, code: 'NETWORK' }
  }
  const message = CODE_MESSAGES[error.code] ?? error.message
  const fields = error.fieldErrors()
  const field = CODE_FIELDS[error.code]
  if (field) fields[field] = message
  return { message, fields, code: error.code }
}
