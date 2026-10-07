import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  IsDateOnly,
  Trim,
} from '../../common/validation/validation.decorators.js';
import { EmployeeStatus } from '../employee.rules.js';

/**
 * 排序欄位白名單：欄位名稱會直接組進 ORDER BY，不接受任意值以避免 SQL 注入，
 * 也讓可排序的欄位成為明確的 API 合約。
 * 並非每個欄位都有 index（name、createdAt 沒有）：目前資料量小，排序成本可忽略，
 * 等實際出現慢查詢再依查詢條件建立複合 index。
 */
export const EMPLOYEE_SORT_FIELDS = [
  'employeeNo',
  'name',
  'hireDate',
  'createdAt',
] as const;
export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];

export class QueryEmployeesDto {
  /**
   * 關鍵字，模糊比對 姓名 / Email / 員工編號
   * @example 王
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  /**
   * 部門（完全比對）
   * @example Engineering
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(50)
  department?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  /**
   * 到職日起（含）
   * @example 2023-01-01
   */
  @IsOptional()
  @IsDateOnly()
  hireDateFrom?: string;

  /**
   * 到職日迄（含）
   * @example 2024-12-31
   */
  @IsOptional()
  @IsDateOnly()
  hireDateTo?: string;

  /** 頁碼，從 1 開始 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  /** 每頁筆數，上限 100，避免一次撈出整張表 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @IsOptional()
  @IsIn(EMPLOYEE_SORT_FIELDS)
  sortBy: EmployeeSortField = 'employeeNo';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
