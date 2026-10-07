import { IsString, Length } from 'class-validator';
import { IsValidPassword } from '../../users/user.rules.js';

/**
 * 修改自己的密碼（PATCH /auth/me/password）。
 * 與管理者的 ResetPasswordDto 不同：必須提供目前的密碼。
 */
export class ChangeOwnPasswordDto {
  @IsString()
  @Length(1, 100)
  currentPassword: string;

  /** @example MyNew@Pass1 */
  @IsString()
  @IsValidPassword()
  newPassword: string;
}
