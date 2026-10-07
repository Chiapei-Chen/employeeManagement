import type { AuthUser } from '../auth/auth-user.js';
import { Role } from '../auth/permissions.js';
import { UniqueConstraintException } from '../common/database/unique-violation.js';
import type { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { EmployeeStatus } from './employee.rules.js';
import type { EmployeesRepository } from './employees.repository.js';
import { EmployeesService } from './employees.service.js';

/**
 * 只測「事先檢查通過，但寫入時被 DB unique index 擋下」的錯誤轉換。
 * 這是兩個請求同時送出才會發生的情況，e2e 無法穩定重現，所以用 stub 讓資料層直接丟出例外。
 */
const actor: AuthUser = { id: 1, username: 'admin', role: Role.Admin };

const dto: CreateEmployeeDto = {
  employeeNo: 'E0100',
  name: '測試員工',
  email: 'test@example.com',
  department: 'Engineering',
  jobTitle: 'Engineer',
  hireDate: '2024-01-01',
};

const current = {
  id: 1,
  ...dto,
  phone: null,
  status: EmployeeStatus.Active,
  resignationDate: null,
  version: 1,
};

function serviceWhereWriteThrows(error: unknown) {
  const repository = {
    isEmployeeNoExist: async () => false,
    isEmailExist: async () => false,
    getById: async () => current,
    add: async () => {
      throw error;
    },
    update: async () => {
      throw error;
    },
  } as unknown as EmployeesRepository;
  return new EmployeesService(repository);
}

describe('EmployeesService: DB unique violation', () => {
  it.each([
    ['employeeNo', 'EMPLOYEE_NO_DUPLICATED'],
    ['email', 'EMPLOYEE_EMAIL_DUPLICATED'],
  ])('create: duplicated %s -> %s', async (field, code) => {
    const service = serviceWhereWriteThrows(
      new UniqueConstraintException(field),
    );
    await expect(service.create(dto, actor)).rejects.toMatchObject({
      code,
      status: 409,
    });
  });

  it('update: duplicated email -> EMPLOYEE_EMAIL_DUPLICATED', async () => {
    const service = serviceWhereWriteThrows(
      new UniqueConstraintException('email'),
    );
    await expect(
      service.update(1, { email: 'other@example.com', version: 1 }, actor),
    ).rejects.toMatchObject({ code: 'EMPLOYEE_EMAIL_DUPLICATED', status: 409 });
  });

  it('passes through errors that are not unique violations', async () => {
    const error = new Error('disk I/O error');
    const service = serviceWhereWriteThrows(error);
    await expect(service.create(dto, actor)).rejects.toBe(error);
  });
});
