import { applyDecorators } from '@nestjs/common';
import {
  MinLength,
  registerDecorator,
  type ValidationArguments,
} from 'class-validator';

/**
 * 帳號的業務規則。建立帳號、重設密碼、修改自己的密碼共用同一份密碼規則，
 * 集中在這裡，避免三個地方各寫一次而不一致。
 *
 * 密碼上限 72 bytes：bcrypt 只會使用前 72 bytes，超過的部分會被忽略。
 */
export const PASSWORD_RULE = { minLength: 8, maxBytes: 72 } as const;

function MaxUtf8Bytes(max: number): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) =>
    registerDecorator({
      name: 'maxUtf8Bytes',
      target: target.constructor,
      propertyName: String(propertyKey),
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= max,
        defaultMessage: (args?: ValidationArguments) =>
          `${args?.property} must not exceed ${max} bytes in UTF-8 (about ${max / 3} Chinese characters)`,
      },
    });
}

export const IsValidPassword = () =>
  applyDecorators(
    MinLength(PASSWORD_RULE.minLength),
    MaxUtf8Bytes(PASSWORD_RULE.maxBytes),
  );

/** 3~50 字元，只允許小寫英數字與 . _ - */
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,50}$/;
