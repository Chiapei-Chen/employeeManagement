import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Role } from '../auth/permissions.js';
import { toUniqueConstraintException } from '../common/database/unique-violation.js';
import { User } from './user.entity.js';

/** 新增時要寫入的資料 */
export type AddUserDb = Pick<User, 'username' | 'passwordHash' | 'role'>;

/** 修改時要寫入的資料，只包含有變更的欄位 */
export type UpdateUserDb = Partial<
  Pick<User, 'role' | 'isActive' | 'passwordHash' | 'passwordChangedAt'>
>;

/**
 * 帳號的資料層：所有查詢與寫入資料庫的操作都在這裡。
 */
@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  /** 帳號-資料庫-取得 */
  getById(id: number): Promise<User | null> {
    return this.repo.findOneBy({ id });
  }

  /** 帳號-資料庫-取得啟用中的帳號 */
  getActiveById(id: number): Promise<User | null> {
    return this.repo.findOneBy({ id, isActive: true });
  }

  /** 帳號-資料庫-依帳號名稱取得 */
  getByUsername(username: string): Promise<User | null> {
    return this.repo.findOneBy({ username });
  }

  /** 帳號-資料庫-查詢列表 */
  getMany(): Promise<User[]> {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  /** 帳號-資料庫-帳號名稱是否存在 */
  isUsernameExist(username: string): Promise<boolean> {
    return this.repo.existsBy({ username });
  }

  /**
   * 帳號-資料庫-新增
   * 帳號名稱重複時丟出 UniqueConstraintException
   */
  async add(data: AddUserDb): Promise<User> {
    try {
      return await this.repo.save(this.repo.create(data));
    } catch (error) {
      throw toUniqueConstraintException(error, { username: 'username' });
    }
  }

  /** 帳號-資料庫-更新 */
  async update(id: number, changes: UpdateUserDb): Promise<void> {
    await this.repo.update(id, changes);
  }

  /**
   * 帳號-資料庫-更新（必須保留至少一位啟用中的 admin）
   * 只有「其他啟用中的 admin 數量 > 0」時才會更新；否則不更新，回傳 false
   * 判斷與更新寫在同一條 UPDATE，兩個請求同時進來時，也不會把 admin 全部降級
   */
  async updateIfOtherAdminExists(
    id: number,
    changes: UpdateUserDb,
  ): Promise<boolean> {
    const otherActiveAdmins = this.repo
      .createQueryBuilder()
      .subQuery()
      .select('COUNT(*)')
      .from(User, 'u')
      .where('u.role = :admin AND u.is_active = 1 AND u.id != :id')
      .getQuery();

    const result = await this.repo
      .createQueryBuilder()
      .update(User)
      .set(changes)
      .where('id = :id')
      .andWhere(`${otherActiveAdmins} > 0`)
      .setParameters({ id, admin: Role.Admin })
      .execute();
    return !!result.affected;
  }
}
