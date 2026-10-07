import { Transform } from 'class-transformer';
import { IsEnum, IsString, Matches } from 'class-validator';
import { Role } from '../../auth/permissions.js';
import { IsValidPassword, USERNAME_PATTERN } from '../user.rules.js';

export class CreateUserDto {
  /**
   * 3~50 字元，只允許英數字與 . _ -；會轉小寫，建立後不可修改
   * @example hr.amy
   */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(USERNAME_PATTERN, {
    message:
      'username must be 3-50 characters of letters, digits, ".", "_" or "-"',
  })
  username: string;

  /**
   * 初始密碼，至少 8 字元、最多 72 bytes（約 24 個中文字）
   * @example Welcome@123
   */
  @IsString()
  @IsValidPassword()
  password: string;

  @IsEnum(Role)
  role: Role;
}
