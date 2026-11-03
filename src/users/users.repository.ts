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
   *
   * 兩位 admin 同時把對方降級時，PostgreSQL 允許兩筆 UPDATE 並行，
   * 若只用「UPDATE ... WHERE (其他 admin 數量) > 0」，兩邊都會看到對方還是 admin 而全部降級。
   * 所以在交易中先用 FOR UPDATE 鎖住所有啟用中的 admin：
   * 後到的請求會等前一個交易 commit，再以最新的資料判斷。
   */
  async updateIfOtherAdminExists(
    id: number,
    changes: UpdateUserDb,
  ): Promise<boolean> {
    return this.repo.manager.transaction(async (manager) => {
      const activeAdmins = await manager
        .createQueryBuilder(User, 'u')
        .select('u.id')
        .where('u.role = :admin AND u.isActive = TRUE', { admin: Role.Admin })
        .orderBy('u.id') // 固定上鎖順序，避免 deadlock
        .setLock('pessimistic_write')
        .getMany();
      if (!activeAdmins.some((u) => u.id !== id)) return false;

      const result = await manager.update(User, id, changes);
      return !!result.affected;
    });
  }
}
