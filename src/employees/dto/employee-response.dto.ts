import type { Employee } from '../employee.entity.js';
import { EmployeeStatus } from '../employee.rules.js';

/**
 * 回應用的 DTO，與 Entity 分開：
 * DB 結構調整不會直接改到 API 合約，也能明確控制哪些欄位可以對外。
 */
export class EmployeeResponseDto {
  id: number;
  employeeNo: string;
  name: string;
  email: string;
  phone: string | null;
  department: string;
  jobTitle: string;
  hireDate: string;
  status: EmployeeStatus;
  resignationDate: string | null;
  /** 修改時需帶回此值 */
  version: number;
  createdAt: Date;
  updatedAt: Date;

  static from(entity: Employee): EmployeeResponseDto {
    return {
      id: entity.id,
      employeeNo: entity.employeeNo,
      name: entity.name,
      email: entity.email,
      phone: entity.phone,
      department: entity.department,
      jobTitle: entity.jobTitle,
      hireDate: entity.hireDate,
      status: entity.status,
      resignationDate: entity.resignationDate,
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
