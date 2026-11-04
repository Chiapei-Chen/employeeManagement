import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../auth/auth-user.js';
import { Role } from '../auth/permissions.js';
import { UniqueConstraintException } from '../common/database/unique-violation.js';
import { AppException } from '../common/errors/app.exception.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { AppConfig } from '../config/configuration.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { hashPassword } from './password.js';
import type { User } from './user.entity.js';
import { UsersRepository } from './users.repository.js';

/**
 * 帳號的邏輯層：負責業務判斷與流程。
 * 不直接操作資料庫，所有查詢與寫入都透過 UsersRepository。
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  // ---- 給 Auth 使用 ----

  /** 帳號-依帳號名稱取得（登入用） */
  getByUsername(username: string): Promise<User | null> {
    // db, 帳號名稱一律以小寫儲存
    return this.usersRepository.getByUsername(username.toLowerCase());
  }

  /** 帳號-取得啟用中的帳號（驗證 token 用） */
  getActiveById(id: number): Promise<User | null> {
    return this.usersRepository.getActiveById(id);
  }

  /** 帳號-設定密碼，之前簽發的 token 全部失效 */
  async setPassword(id: number, newPassword: string): Promise<User> {
    // db, 更新密碼與 passwordChangedAt
    // 密碼已經換掉，之前猜錯的次數沒有意義，一併解除鎖定（例如管理者重設被鎖住的帳號）
    await this.usersRepository.update(id, {
      passwordHash: await hashPassword(newPassword),
      passwordChangedAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
    });

    // db, 重新取得帳號資料
    // 簽發新 token 時，要放入與資料庫完全相同的 passwordChangedAt
    return this.getEntityOrThrow(id);
  }

  /** 帳號-記錄一次登入失敗，連續失敗達到上限就暫時鎖定 */
  async recordLoginFailure(id: number): Promise<void> {
    const { maxFailures, durationMs } = this.config.get('loginLockout', {
      infer: true,
    });
    await this.usersRepository.recordLoginFailure(id, maxFailures, durationMs);
  }

  /** 帳號-清除登入失敗次數與鎖定（登入成功時） */
  async clearLoginFailures(id: number): Promise<void> {
    await this.usersRepository.update(id, {
      failedLoginCount: 0,
      lockedUntil: null,
    });
  }

  // ---- 帳號管理 ----

  /** 帳號-列表 */
  async getMany(): Promise<UserResponseDto[]> {
    // db, 取得所有帳號
    const users = await this.usersRepository.getMany();

    return users.map((u) => UserResponseDto.from(u));
  }

  /** 帳號-新增 */
  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    // 判斷 帳號名稱是否重複
    if (await this.usersRepository.isUsernameExist(dto.username)) {
      throw AppException.of(ErrorCode.UsernameDuplicated);
    }

    // db, 新增帳號，密碼只儲存雜湊值
    // 兩人同時新增相同的帳號名稱時，上面的判斷會同時通過，由 DB 的 unique index 擋下
    const passwordHash = await hashPassword(dto.password);
    try {
      const user = await this.usersRepository.add({
        username: dto.username,
        passwordHash,
        role: dto.role,
      });
      return UserResponseDto.from(user);
    } catch (error) {
      if (error instanceof UniqueConstraintException) {
        throw AppException.of(ErrorCode.UsernameDuplicated);
      }
      throw error;
    }
  }

  /** 帳號-修改角色或啟用狀態 */
  async update(
    id: number,
    dto: UpdateUserDto,
    actor: AuthUser,
  ): Promise<UserResponseDto> {
    // 判斷 是否至少修改一個欄位
    if (dto.role === undefined && dto.isActive === undefined) {
      throw AppException.validation(
        'At least one of role or isActive is required',
      );
    }

    // 判斷 是否修改自己
    // 避免管理者停用自己、把自己降成 readonly，把自己鎖在系統外
    if (id === actor.id) throw AppException.of(ErrorCode.CannotModifySelf);

    // db, 取得目前的帳號資料
    const user = await this.getEntityOrThrow(id);

    // 只保留這次有修改的欄位
    const changes = {
      ...(dto.role !== undefined ? { role: dto.role } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    };

    // 判斷 這次修改是否會讓一位啟用中的 admin 失去 admin 身分
    const isActiveAdmin = user.role === Role.Admin && user.isActive;
    const willBeActiveAdmin =
      (changes.role ?? user.role) === Role.Admin &&
      (changes.isActive ?? user.isActive);

    if (isActiveAdmin && !willBeActiveAdmin) {
      // db, 更新帳號資料（還有其他啟用中的 admin 才會更新）
      const updated = await this.usersRepository.updateIfOtherAdminExists(
        id,
        changes,
      );

      // 判斷 是否更新成功
      // 失敗，表示這是最後一位啟用中的 admin
      if (!updated) throw AppException.of(ErrorCode.LastAdminRequired);
    } else {
      // db, 更新帳號資料
      await this.usersRepository.update(id, changes);
    }

    // db, 取得更新後的帳號資料並回傳
    return UserResponseDto.from(await this.getEntityOrThrow(id));
  }

  /** 帳號-重設他人密碼 */
  async resetPassword(
    id: number,
    newPassword: string,
    actor: AuthUser,
  ): Promise<void> {
    // 判斷 是否重設自己的密碼
    // 自己的密碼要走 PATCH /auth/me/password（需要輸入目前的密碼）
    if (id === actor.id) throw AppException.of(ErrorCode.CannotModifySelf);

    // 判斷 帳號是否存在
    await this.getEntityOrThrow(id);

    // db, 設定新密碼
    await this.setPassword(id, newPassword);
  }

  /**
   * 帳號-解除登入鎖定
   * 鎖定可能是對方自己忘記密碼，也可能是有人故意輸錯來鎖住帳號，
   * 讓管理者不必等鎖定時間結束
   */
  async unlock(id: number): Promise<UserResponseDto> {
    // 判斷 帳號是否存在
    await this.getEntityOrThrow(id);

    // db, 清除失敗次數與鎖定
    await this.clearLoginFailures(id);

    // db, 取得更新後的帳號資料並回傳
    return UserResponseDto.from(await this.getEntityOrThrow(id));
  }

  /** 取得帳號資料，不存在就丟出錯誤 */
  private async getEntityOrThrow(id: number): Promise<User> {
    // db, 取得帳號資料
    const user = await this.usersRepository.getById(id);

    // 判斷 帳號是否存在
    if (!user)
      throw AppException.of(ErrorCode.UserNotFound, `User ${id} not found`);
    return user;
  }
}
