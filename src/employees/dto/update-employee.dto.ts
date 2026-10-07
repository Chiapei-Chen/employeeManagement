import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  IsDateOnly,
  IsOptionalNotNull,
  NormalizeEmail,
  Trim,
} from '../../common/validation/validation.decorators.js';
import { EmployeeStatus } from '../employee.rules.js';

/**
 * 修改員工（PATCH，部分更新）。
 *
 * 刻意與 CreateEmployeeDto 分開定義，而不是用 PartialType 衍生：
 * 實務上新增與修改的規則常會各自演變（例如到職後不可再修改到職日），分開後可以獨立調整。
 *
 * - 只更新有送出的欄位；必填欄位可以不送，但送了就不能是 null（@IsOptionalNotNull）
 * - 沒有 employeeNo：業務識別碼不可修改，送了會因 forbidNonWhitelisted 回 400
 * - version 必填：樂觀鎖，避免後送出的人默默覆蓋別人的修改
 */
export class UpdateEmployeeDto {
  /** @example 王小明 */
  @IsOptionalNotNull()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name?: string;

  /**
   * 會轉小寫儲存，全系統唯一
   * @example xiaoming.wang@example.com
   */
  @IsOptionalNotNull()
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  /**
   * 選填，傳 null 表示清除
   * @example 0912-345-678
   */
  @IsOptional()
  @Trim()
  @IsString()
  @Matches(/^\+?[0-9][0-9\- ]{6,18}[0-9]$/, {
    message: 'phone must contain 8-20 digits, optionally with +, - or spaces',
  })
  phone?: string | null;

  /** @example Engineering */
  @IsOptionalNotNull()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  department?: string;

  /** @example Backend Engineer */
  @IsOptionalNotNull()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  jobTitle?: string;

  /**
   * 到職日 YYYY-MM-DD
   * @example 2024-03-01
   */
  @IsOptionalNotNull()
  @IsDateOnly()
  hireDate?: string;

  /**
   * 狀態轉換規則：active ⇄ on_leave、active/on_leave → resigned；resigned 不可再變更
   * @example on_leave
   */
  @IsOptionalNotNull()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  /**
   * 離職日 YYYY-MM-DD；status 為 resigned 時必填，其他狀態不可填
   * @example 2025-12-31
   */
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsDateOnly()
  resignationDate?: string | null;

  /**
   * 取得資料時拿到的 version，原封不動帶回來
   * @example 1
   */
  @IsInt()
  @Min(1)
  version: number;
}
