import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1759800000000 implements MigrationInterface {
  name = 'InitSchema1759800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "username" varchar(50) NOT NULL, "password_hash" varchar(100) NOT NULL, "role" varchar(20) NOT NULL, "is_active" boolean NOT NULL DEFAULT (1), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"), CONSTRAINT "CHK_users_role" CHECK ("role" IN ('admin', 'readonly')))`,
    );
    await queryRunner.query(
      `CREATE TABLE "employees" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "employee_no" varchar(20) NOT NULL, "name" varchar(50) NOT NULL, "email" varchar(254) NOT NULL, "phone" varchar(20), "department" varchar(50) NOT NULL, "job_title" varchar(50) NOT NULL, "hire_date" date NOT NULL, "status" varchar(20) NOT NULL DEFAULT ('active'), "resignation_date" date, "version" integer NOT NULL, "created_by" integer, "updated_by" integer, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_d9efe9b7b295017edab1ef9d7b6" UNIQUE ("employee_no"), CONSTRAINT "UQ_765bc1ac8967533a04c74a9f6af" UNIQUE ("email"), CONSTRAINT "CHK_employees_resignation_after_hire" CHECK ("resignation_date" IS NULL OR "resignation_date" >= "hire_date"), CONSTRAINT "CHK_employees_resignation" CHECK (("status" = 'resigned') = ("resignation_date" IS NOT NULL)), CONSTRAINT "CHK_employees_status" CHECK ("status" IN ('active', 'on_leave', 'resigned')))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employees_department" ON "employees" ("department")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employees_hire_date" ON "employees" ("hire_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employees_status" ON "employees" ("status")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_employees_status"`);
    await queryRunner.query(`DROP INDEX "IDX_employees_hire_date"`);
    await queryRunner.query(`DROP INDEX "IDX_employees_department"`);
    await queryRunner.query(`DROP TABLE "employees"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
