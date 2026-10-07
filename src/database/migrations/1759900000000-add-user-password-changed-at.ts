import type { MigrationInterface, QueryRunner } from 'typeorm';

/** 支援「修改密碼後，舊 token 立即失效」 */
export class AddUserPasswordChangedAt1759900000000 implements MigrationInterface {
  name = 'AddUserPasswordChangedAt1759900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "password_changed_at" datetime`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "password_changed_at"`,
    );
  }
}
