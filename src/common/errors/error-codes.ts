import { HttpStatus } from '@nestjs/common';

/**
 * 前端應該依 `code` 判斷錯誤，而不是比對 message 字串。
 */
export enum ErrorCode {
  ValidationFailed = 'VALIDATION_FAILED',
  Unauthorized = 'UNAUTHORIZED',
  InvalidCredentials = 'INVALID_CREDENTIALS',
  AccountLocked = 'ACCOUNT_LOCKED',
  Forbidden = 'FORBIDDEN',
  NotFound = 'NOT_FOUND',
  EmployeeNotFound = 'EMPLOYEE_NOT_FOUND',
  EmployeeNoDuplicated = 'EMPLOYEE_NO_DUPLICATED',
  EmployeeEmailDuplicated = 'EMPLOYEE_EMAIL_DUPLICATED',
  EmployeeVersionConflict = 'EMPLOYEE_VERSION_CONFLICT',
  InvalidStatusTransition = 'INVALID_STATUS_TRANSITION',
  UserNotFound = 'USER_NOT_FOUND',
  UsernameDuplicated = 'USERNAME_DUPLICATED',
  CannotModifySelf = 'CANNOT_MODIFY_SELF',
  LastAdminRequired = 'LAST_ADMIN_REQUIRED',
  InvalidCurrentPassword = 'INVALID_CURRENT_PASSWORD',
  PasswordUnchanged = 'PASSWORD_UNCHANGED',
  TooManyRequests = 'TOO_MANY_REQUESTS',
  InternalError = 'INTERNAL_ERROR',
}

/**
 * 每個錯誤碼對應的 HTTP 狀態碼與預設訊息，整個專案共用。
 * 各層丟出錯誤時只需要指定錯誤碼：AppException.of(ErrorCode.EmployeeNotFound)
 */
export const ERROR_DEFINITIONS: Record<
  ErrorCode,
  { status: HttpStatus; message: string }
> = {
  // 共通
  [ErrorCode.ValidationFailed]: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Request validation failed',
  },
  [ErrorCode.Unauthorized]: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Unauthorized',
  },
  [ErrorCode.InvalidCredentials]: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Invalid username or password',
  },
  // 與 INVALID_CREDENTIALS 同為 401，前端處理登入失敗的流程不需要分開
  [ErrorCode.AccountLocked]: {
    status: HttpStatus.UNAUTHORIZED,
    message:
      'Account is temporarily locked due to too many failed login attempts',
  },
  [ErrorCode.Forbidden]: {
    status: HttpStatus.FORBIDDEN,
    message: 'Forbidden',
  },
  [ErrorCode.NotFound]: {
    status: HttpStatus.NOT_FOUND,
    message: 'Not found',
  },
  [ErrorCode.TooManyRequests]: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: 'Too many requests',
  },
  [ErrorCode.InternalError]: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Internal server error',
  },

  // 員工
  [ErrorCode.EmployeeNotFound]: {
    status: HttpStatus.NOT_FOUND,
    message: 'Employee not found',
  },
  [ErrorCode.EmployeeNoDuplicated]: {
    status: HttpStatus.CONFLICT,
    message: 'Employee number already exists',
  },
  [ErrorCode.EmployeeEmailDuplicated]: {
    status: HttpStatus.CONFLICT,
    message: 'Email is already used by another employee',
  },
  [ErrorCode.EmployeeVersionConflict]: {
    status: HttpStatus.CONFLICT,
    message: 'Employee was modified by someone else. Reload and try again.',
  },
  [ErrorCode.InvalidStatusTransition]: {
    status: HttpStatus.CONFLICT,
    message: 'Invalid status transition',
  },

  // 帳號
  [ErrorCode.UserNotFound]: {
    status: HttpStatus.NOT_FOUND,
    message: 'User not found',
  },
  [ErrorCode.UsernameDuplicated]: {
    status: HttpStatus.CONFLICT,
    message: 'Username already exists',
  },
  [ErrorCode.CannotModifySelf]: {
    status: HttpStatus.CONFLICT,
    message: 'You cannot change your own role, status or password here',
  },
  [ErrorCode.LastAdminRequired]: {
    status: HttpStatus.CONFLICT,
    message: 'At least one active admin must remain',
  },
  [ErrorCode.InvalidCurrentPassword]: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Current password is incorrect',
  },
  [ErrorCode.PasswordUnchanged]: {
    status: HttpStatus.BAD_REQUEST,
    message: 'New password must be different from the current password',
  },
};

export interface FieldError {
  field: string;
  errors: string[];
}

/** 所有錯誤回應的統一格式 */
export interface ErrorResponseBody {
  statusCode: number;
  code: ErrorCode | string;
  message: string;
  details?: FieldError[];
  path: string;
  timestamp: string;
}
