import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../auth/permissions.js';

/**
 * 系統登入帳號（例如 HR 人員）。
 * 刻意與 Employee 分開：「能登入系統的人」和「被管理的員工資料」是兩件事，
 * 員工不一定有帳號，帳號也不一定是員工（例如外包 HR、系統帳號）。
 */
@Entity('users')
@Check('CHK_users_role', `"role" IN ('admin', 'readonly')`)
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  username: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 100 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 20 })
  role: Role;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /**
   * 最後一次修改密碼的時間（從未修改為 null）。
   * 簽發 token 時會把這個值放進 token，JwtAuthGuard 比對不一致就拒絕，
   * 所以修改密碼之後，之前簽發的 token 全部失效。
   */
  @Column({ name: 'password_changed_at', type: 'datetime', nullable: true })
  passwordChangedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
