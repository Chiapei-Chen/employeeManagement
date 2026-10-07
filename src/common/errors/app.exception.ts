import { HttpException, HttpStatus } from '@nestjs/common';
import {
  ERROR_DEFINITIONS,
  ErrorCode,
  type FieldError,
} from './error-codes.js';

/**
 * 帶有業務錯誤碼的例外。Service 層丟這個，由全域 filter 統一轉成 HTTP 回應，
 * 讓 service 不需要知道回應長什麼樣子。
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details?: FieldError[],
  ) {
    super({ code, message, details }, status);
  }

  /**
   * 只指定錯誤碼，HTTP 狀態碼與預設訊息由 ERROR_DEFINITIONS 帶入。
   * 需要更具體的訊息時（例如帶上 id），可以傳入 message 覆蓋預設訊息。
   */
  static of(code: ErrorCode, message?: string, details?: FieldError[]) {
    const definition = ERROR_DEFINITIONS[code];
    return new AppException(
      definition.status,
      code,
      message ?? definition.message,
      details,
    );
  }

  /**
   * 錯誤出在某個欄位時使用，讓前端可以把訊息顯示在該欄位旁邊。
   * 欄位的錯誤訊息使用 ERROR_DEFINITIONS 的預設訊息。
   */
  static ofField(code: ErrorCode, field: string) {
    const { message } = ERROR_DEFINITIONS[code];
    return AppException.of(code, message, [{ field, errors: [message] }]);
  }

  static validation(message: string, details?: FieldError[]) {
    return new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.ValidationFailed,
      message,
      details,
    );
  }
}
