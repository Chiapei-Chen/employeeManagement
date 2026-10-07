import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  registerDecorator,
  ValidateIf,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/** 字串前後空白去掉 */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/** Email 小寫 */
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  // 擋掉 2024-02-30 這種格式正確、但日曆上不存在的日期
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** 只接受 `YYYY-MM-DD`*/
export function IsDateOnly(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isDateOnly',
      target: target.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => isDateOnly(value),
        defaultMessage: (args?: ValidationArguments) =>
          `${args?.property} must be a valid date in YYYY-MM-DD format`,
      },
    });
}

/** PATCH 用：欄位可以不送，但送了就不能是 null。 */
export function IsOptionalNotNull(options?: ValidationOptions) {
  return applyDecorators(
    // 沒送（undefined）才跳過這個欄位的所有驗證；null 仍然會被驗證
    ValidateIf((_, value: unknown) => value !== undefined),
    (target: object, propertyKey: string | symbol) =>
      registerDecorator({
        name: 'isNotNull',
        target: target.constructor,
        propertyName: String(propertyKey),
        options,
        validator: {
          validate: (value: unknown) => value !== null,
          defaultMessage: (args?: ValidationArguments) =>
            `${args?.property} cannot be null`,
        },
      }),
  );
}
