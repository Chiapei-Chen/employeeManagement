import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Role } from '../auth/permissions.js';
import type { AppConfig } from '../config/configuration.js';
import { Employee } from '../employees/employee.entity.js';
import { EmployeeStatus } from '../employees/employee.rules.js';
import { hashPassword } from '../users/password.js';
import { User } from '../users/user.entity.js';

export const DEMO_USERS = [
  { username: 'admin', password: 'Admin@123', role: Role.Admin },
  { username: 'viewer', password: 'Viewer@123', role: Role.Readonly },
] as const;

const DEMO_EMPLOYEES: Array<Partial<Employee>> = [
  {
    employeeNo: 'E0001',
    name: '王小明',
    email: 'xiaoming.wang@example.com',
    phone: '0912-345-678',
    department: 'Engineering',
    jobTitle: 'Backend Engineer',
    hireDate: '2021-03-01',
  },
  {
    employeeNo: 'E0002',
    name: '陳美玲',
    email: 'meiling.chen@example.com',
    phone: '0922-111-222',
    department: 'Engineering',
    jobTitle: 'Frontend Engineer',
    hireDate: '2022-07-15',
  },
  {
    employeeNo: 'E0003',
    name: '林志豪',
    email: 'chihhao.lin@example.com',
    phone: null,
    department: 'Engineering',
    jobTitle: 'Tech Lead',
    hireDate: '2019-11-01',
  },
  {
    employeeNo: 'E0004',
    name: '張雅婷',
    email: 'yating.chang@example.com',
    phone: '0933-222-333',
    department: 'HR',
    jobTitle: 'HR Specialist',
    hireDate: '2023-02-20',
  },
  {
    employeeNo: 'E0005',
    name: '黃建宏',
    email: 'jianhong.huang@example.com',
    phone: '0955-666-777',
    department: 'Sales',
    jobTitle: 'Account Manager',
    hireDate: '2020-05-04',
    status: EmployeeStatus.OnLeave,
  },
  {
    employeeNo: 'E0006',
    name: '吳佩珊',
    email: 'peishan.wu@example.com',
    phone: null,
    department: 'Sales',
    jobTitle: 'Sales Representative',
    hireDate: '2018-09-10',
    status: EmployeeStatus.Resigned,
    resignationDate: '2024-06-30',
  },
  {
    employeeNo: 'E0007',
    name: '劉冠廷',
    email: 'kuanting.liu@example.com',
    phone: '0988-123-456',
    department: 'Finance',
    jobTitle: 'Accountant',
    hireDate: '2024-01-08',
  },
  {
    employeeNo: 'E0008',
    name: 'Alice Johnson',
    email: 'alice.johnson@example.com',
    phone: '+1 415 555 0100',
    department: 'Engineering',
    jobTitle: 'QA Engineer',
    hireDate: '2024-08-19',
  },
];

/**
 * 開發 / 面試展示用的種子資料，只在 SEED_DEMO_DATA=true 且資料表為空時寫入。
 * 正式環境應關閉，並由管理流程建立帳號。
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async onApplicationBootstrap() {
    if (!this.config.get('seedDemoData', { infer: true })) return;

    const users = this.dataSource.getRepository(User);
    if ((await users.count()) > 0) return;

    const demoUsers = await Promise.all(
      DEMO_USERS.map(async (u) => ({
        username: u.username,
        passwordHash: await hashPassword(u.password),
        role: u.role,
      })),
    );

    await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(User, demoUsers);
      const adminId = created[0].id;
      await manager.save(
        Employee,
        DEMO_EMPLOYEES.map((e) => ({
          status: EmployeeStatus.Active,
          resignationDate: null,
          ...e,
          createdBy: adminId,
          updatedBy: adminId,
        })),
      );
    });
    this.logger.log(
      `Seeded demo users (${DEMO_USERS.map((u) => u.username).join(', ')}) and ${DEMO_EMPLOYEES.length} employees`,
    );
  }
}
