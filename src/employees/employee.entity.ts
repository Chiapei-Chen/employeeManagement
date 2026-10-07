import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { EmployeeStatus } from './employee.rules.js';

/**
 * DB 層的 constraint 是最後一道防線：就算之後有人繞過 API 直接寫 DB、
 * 或程式有 bug，也不會寫進違反基本不變條件（invariant）的資料。
 */
@Entity('employees')
@Check('CHK_employees_status', `"status" IN ('active', 'on_leave', 'resigned')`)
@Check(
  'CHK_employees_resignation',
  `("status" = 'resigned') = ("resignation_date" IS NOT NULL)`,
)
@Check(
  'CHK_employees_resignation_after_hire',
  `"resignation_date" IS NULL OR "resignation_date" >= "hire_date"`,
)
export class Employee {
  @PrimaryGeneratedColumn()
  id: number;

  /** 員工編號：業務上的識別碼，建立後不可修改 */
  @Column({ name: 'employee_no', type: 'varchar', length: 20, unique: true })
  employeeNo: string;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'varchar', length: 254, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Index('IDX_employees_department')
  @Column({ type: 'varchar', length: 50 })
  department: string;

  @Column({ name: 'job_title', type: 'varchar', length: 50 })
  jobTitle: string;

  @Index('IDX_employees_hire_date')
  @Column({ name: 'hire_date', type: 'date' })
  hireDate: string;

  @Index('IDX_employees_status')
  @Column({ type: 'varchar', length: 20, default: EmployeeStatus.Active })
  status: EmployeeStatus;

  @Column({ name: 'resignation_date', type: 'date', nullable: true })
  resignationDate: string | null;

  /** 樂觀鎖版本號，每次更新 +1，用來偵測「兩人同時編輯」 */
  @VersionColumn()
  version: number;

  @Column({ name: 'created_by', type: 'integer', nullable: true })
  createdBy: number | null;

  @Column({ name: 'updated_by', type: 'integer', nullable: true })
  updatedBy: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
