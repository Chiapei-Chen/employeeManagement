import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../users/user.entity.js';

/**
 * 簽發過的 refresh token。
 * 只記錄 id（即 JWT 的 jti），不儲存 token 本身：資料庫外洩時，沒有 JWT secret 也無法偽造 token。
 *
 * 同一次登入之後換發出來的 token 屬於同一個 family，
 * 發現 token 被重複使用（可能被偷）或登出時，整個 family 一起作廢。
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryColumn('uuid')
  id: string;

  @Index('IDX_refresh_tokens_user_id')
  @Column({ name: 'user_id', type: 'integer' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Index('IDX_refresh_tokens_family_id')
  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  /** 已經拿來換發過新的 token 的時間（尚未使用為 null） */
  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  /** 作廢時間：登出或偵測到重複使用（未作廢為 null） */
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
