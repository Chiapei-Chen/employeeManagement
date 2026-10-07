import type { ValidationError } from 'class-validator';
import { AppException } from '../errors/app.exception.js';
import type { FieldError } from '../errors/error-codes.js';

/**
 * 欄位是 null 時，其他規則（必須是字串、不可為空…）也一定會失敗，
 * 只留下「不可為 null」這一則，避免使用者看到一堆重複的訊息。
 */
function messagesOf(constraints: Record<string, string>): string[] {
  return constraints.isNotNull
    ? [constraints.isNotNull]
    : Object.values(constraints);
}

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own: FieldError[] = error.constraints
      ? [{ field, errors: messagesOf(error.constraints) }]
      : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/** 把 class-validator 的錯誤整理成 `details: [{ field, errors }]`，前端可直接對應到表單欄位 */
export function validationExceptionFactory(errors: ValidationError[]) {
  return AppException.validation('Request validation failed', flatten(errors));
}
