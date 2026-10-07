import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { UniqueConstraintException } from '../common/database/unique-violation.js';
import { AppException } from '../common/errors/app.exception.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { EmployeeResponseDto } from './dto/employee-response.dto.js';
import type { PaginatedEmployeesDto } from './dto/paginated-employees.dto.js';
import type { QueryEmployeesDto } from './dto/query-employees.dto.js';
import type { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import {
  canTransition,
  EmployeeStatus,
  validateEmployeeDates,
} from './employee.rules.js';
import { EmployeesRepository } from './employees.repository.js';

/** 哪個欄位重複 → 對應的業務錯誤碼 */
const DUPLICATED_ERRORS: Record<string, ErrorCode> = {
  employeeNo: ErrorCode.EmployeeNoDuplicated,
  email: ErrorCode.EmployeeEmailDuplicated,
};

/**
 * 員工的邏輯層：負責業務判斷與流程。
 * 不直接操作資料庫，所有查詢與寫入都透過 EmployeesRepository。
 */
@Injectable()
export class EmployeesService {
  constructor(private readonly employeesRepository: EmployeesRepository) {}

  /** 員工-列表 */
  async getMany(query: QueryEmployeesDto): Promise<PaginatedEmployeesDto> {
    // 判斷 到職日區間是否正確
    if (
      query.hireDateFrom &&
      query.hireDateTo &&
      query.hireDateFrom > query.hireDateTo
    ) {
      throw AppException.validation('Invalid hire date range', [
        {
          field: 'hireDateFrom',
          errors: ['hireDateFrom must not be later than hireDateTo'],
        },
      ]);
    }

    // db, 取得這一頁的員工與總筆數
    const { rows, total } = await this.employeesRepository.getMany(query);

    // 回傳列表與分頁資訊
    return {
      items: rows.map((row) => EmployeeResponseDto.from(row)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  /** 員工-取得單一員工 */
  async get(id: number): Promise<EmployeeResponseDto> {
    // db, 取得員工資料，轉成回傳格式
    return EmployeeResponseDto.from(await this.getEntityOrThrow(id));
  }

  /** 員工-新增 */
  async create(
    dto: CreateEmployeeDto,
    actor: AuthUser,
  ): Promise<EmployeeResponseDto> {
    // 判斷 員工編號是否重複
    if (await this.employeesRepository.isEmployeeNoExist(dto.employeeNo)) {
      throw AppException.of(ErrorCode.EmployeeNoDuplicated);
    }

    // 判斷 Email 是否重複
    await this.assertEmailAvailable(dto.email);

    // db, 新增員工資料
    // 上面的檢查擋不住同時送出的兩個請求，最後由 DB 的 unique index 擋下
    try {
      const employee = await this.employeesRepository.add({
        ...dto,
        phone: dto.phone ?? null,
        status: EmployeeStatus.Active,
        resignationDate: null,
        createdBy: actor.id,
        updatedBy: actor.id,
      });
      return EmployeeResponseDto.from(employee);
    } catch (error) {
      throw this.toDuplicatedError(error);
    }
  }

  /** 員工-修改 */
  async update(
    id: number,
    dto: UpdateEmployeeDto,
    actor: AuthUser,
  ): Promise<EmployeeResponseDto> {
    // 分開 version 與這次要修改的欄位
    const { version, ...changes } = dto;

    // 判斷 是否至少修改一個欄位
    this.assertHasChanges(changes);

    // db, 取得目前的員工資料
    const current = await this.getEntityOrThrow(id);

    // 判斷 version 是否一致
    if (current.version !== version)
      throw AppException.of(ErrorCode.EmployeeVersionConflict);

    // 判斷 有修改狀態且 狀態轉換是否合法
    if (changes.status && !canTransition(current.status, changes.status)) {
      throw AppException.of(
        ErrorCode.InvalidStatusTransition,
        `Cannot change status from ${current.status} to ${changes.status}`,
      );
    }

    // 判斷 日期是否一致
    // PATCH 只送部分欄位，目前資料 + 這次的變更 合併後再判斷
    const dateErrors = validateEmployeeDates({
      status: changes.status ?? current.status,
      hireDate: changes.hireDate ?? current.hireDate,
      resignationDate:
        changes.resignationDate !== undefined
          ? changes.resignationDate
          : current.resignationDate,
    });
    if (dateErrors.length) {
      throw AppException.validation(
        'Employee data is inconsistent',
        dateErrors,
      );
    }

    // 判斷 有修改 Email 且 不是自己原本的 Email
    if (changes.email && changes.email !== current.email) {
      await this.assertEmailAvailable(changes.email, id);
    }

    // db, 更新員工資料（version 相同才會更新）
    let updated: boolean;
    try {
      updated = await this.employeesRepository.update(id, version, {
        ...changes,
        updatedBy: actor.id,
      });
    } catch (error) {
      throw this.toDuplicatedError(error);
    }

    // 判斷 是否更新成功
    // 失敗，表示在上面的檢查與這次更新之間被別人搶先修改
    if (!updated) throw AppException.of(ErrorCode.EmployeeVersionConflict);

    // db, 取得更新後的員工資料並回傳
    return this.get(id);
  }

  /** 取得員工資料，不存在就丟出錯誤 */
  private async getEntityOrThrow(id: number) {
    // db, 取得員工資料
    const entity = await this.employeesRepository.getById(id);

    // 判斷 員工是否存在
    if (!entity)
      throw AppException.of(
        ErrorCode.EmployeeNotFound,
        `Employee ${id} not found`,
      );
    return entity;
  }

  /** 檢查 Email 是否已被其他員工使用；修改時傳入自己的 id，排除自己 */
  private async assertEmailAvailable(email: string, excludeId?: number) {
    if (await this.employeesRepository.isEmailExist(email, excludeId)) {
      throw AppException.of(ErrorCode.EmployeeEmailDuplicated);
    }
  }

  /** 資料層的 unique 錯誤轉成業務錯誤；其他錯誤原樣回傳 */
  private toDuplicatedError(error: unknown): unknown {
    if (!(error instanceof UniqueConstraintException)) return error;
    const code = DUPLICATED_ERRORS[error.field];
    return code ? AppException.of(code) : error;
  }

  /** 檢查是否至少修改一個欄位 */
  private assertHasChanges(changes: object) {
    if (Object.values(changes).every((v) => v === undefined)) {
      throw AppException.validation(
        'At least one field other than version must be provided',
      );
    }
  }
}
