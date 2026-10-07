import { IsString } from 'class-validator';
import { IsValidPassword } from '../user.rules.js';

/** 管理者重設他人密碼 */
export class ResetPasswordDto {
  /** @example Reset@123 */
  @IsString()
  @IsValidPassword()
  newPassword: string;
}
