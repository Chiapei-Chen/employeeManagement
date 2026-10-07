import { IsBoolean, IsEnum } from 'class-validator';
import { Role } from '../../auth/permissions.js';
import { IsOptionalNotNull } from '../../common/validation/validation.decorators.js';

/**
 * 只能修改角色與啟用狀態。username 不可修改；密碼走專用的 reset-password。
 * 兩個欄位都可以不送，但送了就不能是 null（資料庫中皆為 NOT NULL）。
 */
export class UpdateUserDto {
  @IsOptionalNotNull()
  @IsEnum(Role)
  role?: Role;

  @IsOptionalNotNull()
  @IsBoolean()
  isActive?: boolean;
}
