import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  IsDateOnly,
  NormalizeEmail,
  Trim,
} from '../../common/validation/validation.decorators.js';

/**
 * 新增員工。刻意「不」包含 status / resignationDate：
 * 新進員工一律從 active 開始，狀態變更走修改流程並經過狀態轉換規則檢查。
 * 也不包含 id / version / createdBy 等由系統管理的欄位；
 * 搭配全域 ValidationPipe 的 forbidNonWhitelisted，client 多送欄位會直接 400。
 */
export class CreateEmployeeDto {
  /**
   * 員工編號，格式 E + 4~8 位數字，建立後不可修改
   * @example E0011
   */
  @Trim()
  @IsString()
  @Matches(/^E\d{4,8}$/, {
    message: 'employeeNo must match format E + 4~8 digits, e.g. E0001',
  })
  employeeNo: string;

  /** @example 王小明 */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  /**
   * 會轉小寫儲存，全系統唯一
   * @example xiaoming.wang@example.com
   */
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email: string;

  /**
   * 選填，可含 +、數字、-、空白
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
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  department: string;

  /** @example Backend Engineer */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  jobTitle: string;

  /**
   * 到職日 YYYY-MM-DD
   * @example 2024-03-01
   */
  @IsDateOnly()
  hireDate: string;
}
