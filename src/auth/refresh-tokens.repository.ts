import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, type Repository } from 'typeorm';
import { RefreshToken } from './refresh-token.entity.js';

/** 新增時要寫入的資料 */
export type AddRefreshTokenDb = Pick<
  RefreshToken,
  'id' | 'userId' | 'familyId' | 'expiresAt'
>;

/** 換發的結果 */
export type RotateResult =
  /** 換發成功，已新增下一筆 */
  | 'rotated'
  /** 已經用過的 token 又被拿來用（可能被偷），整個 family 已作廢 */
  | 'reused'
  /** 查不到，或已經作廢 */
  | 'invalid';

/**
 * refresh token 的資料層：所有查詢與寫入資料庫的操作都在這裡。
 */
@Injectable()
export class RefreshTokensRepository {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly repo: Repository<RefreshToken>,
  ) {}

  /** refresh token-資料庫-新增 */
  async add(data: AddRefreshTokenDb): Promise<void> {
    await this.repo.insert(data);
  }

  /** refresh token-資料庫-刪除帳號已過期的記錄 */
  async deleteExpiredOfUser(userId: number): Promise<void> {
    await this.repo.delete({ userId, expiresAt: LessThan(new Date()) });
  }

  /**
   * refresh token-資料庫-換發
   * 把 id 這一筆標記為已使用，並新增同一個 family 的下一筆
   *
   * - 尚未使用：正常換發
   * - 已使用，但在 graceMs 內：視為同一個瀏覽器的多個分頁同時 refresh（共用同一個 cookie），仍然換發
   * - 已使用，且超過 graceMs：重複使用，代表有兩個人持有同一張 token，作廢整個 family
   *
   */
  async rotate(
    id: string,
    graceMs: number,
    next: Pick<RefreshToken, 'id' | 'expiresAt'>,
  ): Promise<RotateResult> {
    return this.repo.manager.transaction(async (manager) => {
      // 先鎖定這一筆，避免同時有兩個人持有同一張 token
      const token = await manager.findOne(RefreshToken, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      // 查不到，或已經作廢
      if (!token || token.revokedAt) return 'invalid';

      const now = new Date();
      // token已使用且超過graceMs，作廢整個family
      if (token.usedAt && now.getTime() - token.usedAt.getTime() > graceMs) {
        await manager.update(
          RefreshToken,
          { familyId: token.familyId, revokedAt: IsNull() },
          { revokedAt: now },
        );
        return 'reused';
      }
      //  token沒使用過 進行標記
      if (!token.usedAt) {
        await manager.update(RefreshToken, id, { usedAt: now });
      }
      //  token沒使用過 或 token使用過但在graceMs內 進行換發
      await manager.insert(RefreshToken, {
        ...next,
        userId: token.userId,
        familyId: token.familyId,
      });
      return 'rotated';
    });
  }

  /** refresh token-資料庫-作廢 id 所屬的整個 family（登出用） */
  async revokeFamilyOf(id: string): Promise<void> {
    const token = await this.repo.findOneBy({ id });
    if (!token) return;
    await this.repo.update(
      { familyId: token.familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
