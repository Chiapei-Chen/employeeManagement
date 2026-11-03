import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, type Repository } from 'typeorm';
import { toUniqueConstraintException } from '../common/database/unique-violation.js';
import { Employee } from './employee.entity.js';
import type { EmployeeStatus } from './employee.rules.js';

/** 有 unique constraint 的欄位：DB 欄位名稱 → entity 屬性名稱 */
const UNIQUE_COLUMNS = { employee_no: 'employeeNo', email: 'email' };

/** 列表的查詢條件 */
export interface QueryEmployeesDb {
  keyword?: string;
  department?: string;
  status?: EmployeeStatus;
  hireDateFrom?: string;
  hireDateTo?: string;
  page: number;
  pageSize: number;
  sortBy: 'employeeNo' | 'name' | 'hireDate' | 'createdAt';
  sortOrder: 'asc' | 'desc';
}

/** 新增時要寫入的資料 */
export type AddEmployeeDb = Pick<
  Employee,
  | 'employeeNo'
  | 'name'
  | 'email'
  | 'phone'
  | 'department'
  | 'jobTitle'
  | 'hireDate'
  | 'status'
  | 'resignationDate'
  | 'createdBy'
  | 'updatedBy'
>;

/** 修改時要寫入的資料，只包含有變更的欄位 */
export type UpdateEmployeeDb = Partial<
  Pick<
    Employee,
    | 'name'
    | 'email'
    | 'phone'
    | 'department'
    | 'jobTitle'
    | 'hireDate'
    | 'status'
    | 'resignationDate'
    | 'updatedBy'
  >
>;

/** ILIKE 查詢時把使用者輸入的 % _ 當成一般字元，而不是萬用字元 */
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * 員工的資料層：所有查詢與寫入資料庫的操作都在這裡。
 */
@Injectable()
export class EmployeesRepository {
  constructor(
    @InjectRepository(Employee) private readonly repo: Repository<Employee>,
  ) {}

  /** 員工-資料庫-取得 */
  getById(id: number): Promise<Employee | null> {
    return this.repo.findOneBy({ id });
  }

  /** 員工-資料庫-查詢列表 */
  async getMany(
    query: QueryEmployeesDb,
  ): Promise<{ rows: Employee[]; total: number }> {
    const { keyword, department, status, hireDateFrom, hireDateTo } = query;

    // 依照有填的條件組出查詢，沒填的條件不加入
    const qb = this.repo.createQueryBuilder('e');

    // 關鍵字：模糊比對姓名、Email、員工編號（ILIKE 不分大小寫）
    if (keyword) {
      qb.andWhere(
        `(e.name ILIKE :kw ESCAPE '\\' OR e.email ILIKE :kw ESCAPE '\\' OR e.employeeNo ILIKE :kw ESCAPE '\\')`,
        { kw: `%${escapeLike(keyword)}%` },
      );
    }
    if (department) qb.andWhere('e.department = :department', { department });
    if (status) qb.andWhere('e.status = :status', { status });
    if (hireDateFrom)
      qb.andWhere('e.hireDate >= :hireDateFrom', { hireDateFrom });
    if (hireDateTo) qb.andWhere('e.hireDate <= :hireDateTo', { hireDateTo });

    // 排序與分頁
    // 再以 id 排序，排序欄位的值相同時，分頁結果才不會重複或遺漏
    qb.orderBy(`e.${query.sortBy}`, query.sortOrder === 'desc' ? 'DESC' : 'ASC')
      .addOrderBy('e.id', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { rows, total };
  }

  /** 員工-資料庫-員工編號是否存在 */
  isEmployeeNoExist(employeeNo: string): Promise<boolean> {
    return this.repo.existsBy({ employeeNo });
  }

  /** 員工-資料庫-Email 是否存在；修改時傳入自己的 id，排除自己 */
  isEmailExist(email: string, excludeId?: number): Promise<boolean> {
    return this.repo.existsBy({
      email,
      ...(excludeId ? { id: Not(excludeId) } : {}),
    });
  }

  /**
   * 員工-資料庫-新增
   * 員工編號或 Email 重複時丟出 UniqueConstraintException
   */
  async add(data: AddEmployeeDb): Promise<Employee> {
    try {
      return await this.repo.save(this.repo.create(data));
    } catch (error) {
      throw toUniqueConstraintException(error, UNIQUE_COLUMNS);
    }
  }

  /**
   * 員工-資料庫-更新
   * 只有 version 相同才會更新；讀取之後若已被別人修改，就不會更新，回傳 false
   * Email 重複時丟出 UniqueConstraintException
   */
  async update(
    id: number,
    version: number,
    changes: UpdateEmployeeDb,
  ): Promise<boolean> {
    try {
      const result = await this.repo
        .createQueryBuilder()
        .update(Employee)
        .set(changes)
        .where('id = :id AND version = :version', { id, version })
        .execute();
      return !!result.affected;
    } catch (error) {
      throw toUniqueConstraintException(error, UNIQUE_COLUMNS);
    }
  }
}
