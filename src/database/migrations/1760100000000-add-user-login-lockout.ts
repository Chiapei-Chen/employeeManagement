import type { MigrationInterface, QueryRunner } from 'typeorm';

/** 依帳號計算連續登入失敗次數，達到上限就暫時鎖定 */
export class AddUserLoginLockout1760100000000 implements MigrationInterface {
  name = 'AddUserLoginLockout1760100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "failed_login_count" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "locked_until" TIMESTAMP WITH TIME ZONE`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "locked_until"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "failed_login_count"`,
    );
  }
}
