import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server as App } from 'node:http';
import { createTestApp, loginAs } from './helpers.js';

/** 種子資料：8 位員工，其中 Engineering 4 位、E0005 on_leave、E0006 resigned */
describe('Employees (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    token = await loginAs(app, 'admin', 'Admin@123');
  });
  afterAll(() => app.close());

  const get = (url: string) =>
    request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${token}`);
  const post = (body: object) =>
    request(app.getHttpServer())
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const patch = (id: number, body: object) =>
    request(app.getHttpServer())
      .patch(`/api/v1/employees/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  let seq = 0;
  const validEmployee = () => {
    seq += 1;
    return {
      employeeNo: `E${String(5000 + seq)}`,
      name: `測試員工 ${seq}`,
      email: `tester${seq}@example.com`,
      department: 'QA',
      jobTitle: 'Tester',
      hireDate: '2025-01-15',
    };
  };

  describe('GET /employees', () => {
    it('returns paginated results with default sort by employeeNo', async () => {
      const res = await get('/api/v1/employees?pageSize=3').expect(200);
      expect(res.body.meta).toEqual({
        page: 1,
        pageSize: 3,
        total: 8,
        totalPages: 3,
      });
      expect(
        res.body.items.map((e: { employeeNo: string }) => e.employeeNo),
      ).toEqual(['E0001', 'E0002', 'E0003']);
    });

    it('filters by keyword across name / email / employeeNo', async () => {
      const byName = await get(
        `/api/v1/employees?keyword=${encodeURIComponent('王')}`,
      ).expect(200);
      expect(byName.body.items.map((e: { name: string }) => e.name)).toEqual([
        '王小明',
      ]);

      const byEmail = await get('/api/v1/employees?keyword=ALICE').expect(200);
      expect(byEmail.body.items).toHaveLength(1);

      const byNo = await get('/api/v1/employees?keyword=E0007').expect(200);
      expect(byNo.body.items[0].name).toBe('劉冠廷');
    });

    it('treats % and _ in keyword literally', async () => {
      const res = await get('/api/v1/employees?keyword=%25').expect(200);
      expect(res.body.meta.total).toBe(0);
    });

    it('combines department, status and hire date range filters', async () => {
      const res = await get(
        '/api/v1/employees?department=Engineering&status=active&hireDateFrom=2021-01-01&hireDateTo=2023-12-31',
      ).expect(200);
      expect(
        res.body.items.map((e: { employeeNo: string }) => e.employeeNo),
      ).toEqual(['E0001', 'E0002']);
    });

    it('sorts by hireDate desc', async () => {
      const res = await get(
        '/api/v1/employees?sortBy=hireDate&sortOrder=desc&pageSize=1',
      ).expect(200);
      expect(res.body.items[0].employeeNo).toBe('E0008');
    });

    it.each([
      ['pageSize over limit', 'pageSize=101'],
      ['page zero', 'page=0'],
      ['sort field not whitelisted', 'sortBy=passwordHash'],
      ['unknown status', 'status=fired'],
      ['invalid date', 'hireDateFrom=2024-13-01'],
      ['reversed date range', 'hireDateFrom=2024-12-31&hireDateTo=2024-01-01'],
      ['unknown query param', 'foo=bar'],
    ])('400 for %s', async (_, qs) => {
      const res = await get(`/api/v1/employees?${qs}`).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /employees/:id', () => {
    it('returns the employee', async () => {
      const res = await get('/api/v1/employees/1').expect(200);
      expect(res.body).toMatchObject({
        id: 1,
        employeeNo: 'E0001',
        version: 1,
      });
    });

    it('404 for missing employee', async () => {
      const res = await get('/api/v1/employees/9999').expect(404);
      expect(res.body.code).toBe('EMPLOYEE_NOT_FOUND');
    });

    it('400 for non-numeric id', async () => {
      await get('/api/v1/employees/abc').expect(400);
    });
  });

  describe('POST /employees', () => {
    it('creates an active employee and normalizes input', async () => {
      const body = {
        ...validEmployee(),
        name: '  林大華  ',
        email: '  Da.Hua@Example.COM ',
      };
      const res = await post(body).expect(201);
      expect(res.body).toMatchObject({
        name: '林大華',
        email: 'da.hua@example.com',
        status: 'active',
        resignationDate: null,
        phone: null,
        version: 1,
      });
      await get(`/api/v1/employees/${res.body.id}`).expect(200);
    });

    it('reports every invalid field at once', async () => {
      const res = await post({
        employeeNo: 'X1',
        name: '',
        email: 'not-an-email',
        phone: 'abc',
        department: 'QA',
        jobTitle: 'Tester',
        hireDate: '2024-02-30',
      }).expect(400);
      const fields = res.body.details.map((d: { field: string }) => d.field);
      expect(fields).toEqual(
        expect.arrayContaining([
          'employeeNo',
          'name',
          'email',
          'phone',
          'hireDate',
        ]),
      );
    });

    it.each([
      ['status', { status: 'resigned' }],
      ['id', { id: 999 }],
      ['version', { version: 5 }],
    ])('rejects system-managed field "%s"', async (field, extra) => {
      const res = await post({ ...validEmployee(), ...extra }).expect(400);
      expect(res.body.details[0].field).toBe(field);
    });

    it('rejects a full ISO datetime as hireDate', async () => {
      await post({
        ...validEmployee(),
        hireDate: '2025-01-15T00:00:00Z',
      }).expect(400);
    });

    it('409 for duplicated employeeNo', async () => {
      const res = await post({
        ...validEmployee(),
        employeeNo: 'E0001',
      }).expect(409);
      expect(res.body.code).toBe('EMPLOYEE_NO_DUPLICATED');
    });

    it('409 for duplicated email regardless of case', async () => {
      const res = await post({
        ...validEmployee(),
        email: 'XIAOMING.WANG@example.com',
      }).expect(409);
      expect(res.body.code).toBe('EMPLOYEE_EMAIL_DUPLICATED');
    });

    it('only one of two concurrent creates with the same email succeeds', async () => {
      const a = validEmployee();
      const b = { ...validEmployee(), email: a.email };
      const results = await Promise.all([post(a), post(b)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const conflict = results.find((r) => r.status === 409);
      expect(conflict?.body.code).toBe('EMPLOYEE_EMAIL_DUPLICATED');
    });
  });

  describe('PATCH /employees/:id', () => {
    async function createOne() {
      const res = await post(validEmployee()).expect(201);
      return res.body as { id: number; version: number; hireDate: string };
    }

    it('updates only the provided fields and bumps version', async () => {
      const emp = await createOne();
      const res = await patch(emp.id, {
        jobTitle: 'Senior Tester',
        phone: '0911-000-111',
        version: 1,
      }).expect(200);
      expect(res.body).toMatchObject({
        jobTitle: 'Senior Tester',
        phone: '0911-000-111',
        department: 'QA',
        version: 2,
      });
    });

    it('can clear the optional phone with null', async () => {
      const emp = await createOne();
      await patch(emp.id, { phone: '0911-000-111', version: 1 }).expect(200);
      const res = await patch(emp.id, { phone: null, version: 2 }).expect(200);
      expect(res.body.phone).toBeNull();
    });

    it('409 when version is stale (lost update prevention)', async () => {
      const emp = await createOne();
      await patch(emp.id, { jobTitle: 'Edited by A', version: 1 }).expect(200);
      const res = await patch(emp.id, {
        jobTitle: 'Edited by B',
        version: 1,
      }).expect(409);
      expect(res.body.code).toBe('EMPLOYEE_VERSION_CONFLICT');

      const current = await get(`/api/v1/employees/${emp.id}`).expect(200);
      expect(current.body.jobTitle).toBe('Edited by A');
    });

    it('400 when version is missing', async () => {
      const emp = await createOne();
      const res = await patch(emp.id, { jobTitle: 'x' }).expect(400);
      expect(res.body.details[0].field).toBe('version');
    });

    it('400 when nothing but version is sent', async () => {
      const emp = await createOne();
      await patch(emp.id, { version: 1 }).expect(400);
    });

    it('400 when employeeNo is sent (immutable)', async () => {
      const emp = await createOne();
      const res = await patch(emp.id, {
        employeeNo: 'E9999',
        version: 1,
      }).expect(400);
      expect(res.body.details[0].field).toBe('employeeNo');
    });

    it('400 when a required field is set to null', async () => {
      const emp = await createOne();
      const res = await patch(emp.id, { name: null, version: 1 }).expect(400);
      expect(res.body.details).toEqual([
        { field: 'name', errors: ['name cannot be null'] },
      ]);
    });

    it('reports every required field sent as null', async () => {
      const emp = await createOne();
      const res = await patch(emp.id, {
        email: null,
        hireDate: null,
        status: null,
        version: 1,
      }).expect(400);
      expect(res.body.details).toEqual([
        { field: 'email', errors: ['email cannot be null'] },
        { field: 'hireDate', errors: ['hireDate cannot be null'] },
        { field: 'status', errors: ['status cannot be null'] },
      ]);
    });

    it('409 when the new email belongs to someone else', async () => {
      const emp = await createOne();
      const res = await patch(emp.id, {
        email: 'meiling.chen@example.com',
        version: 1,
      }).expect(409);
      expect(res.body.code).toBe('EMPLOYEE_EMAIL_DUPLICATED');
    });

    it('allows keeping the same email', async () => {
      const res = await patch(1, {
        email: 'xiaoming.wang@example.com',
        jobTitle: 'Staff Engineer',
        version: 1,
      }).expect(200);
      expect(res.body.version).toBe(2);
    });

    it('404 for missing employee', async () => {
      await patch(9999, { jobTitle: 'x', version: 1 }).expect(404);
    });

    describe('status lifecycle', () => {
      it('active -> on_leave -> active', async () => {
        const emp = await createOne();
        await patch(emp.id, { status: 'on_leave', version: 1 }).expect(200);
        const res = await patch(emp.id, {
          status: 'active',
          version: 2,
        }).expect(200);
        expect(res.body.status).toBe('active');
      });

      it('resigning requires a resignationDate', async () => {
        const emp = await createOne();
        const res = await patch(emp.id, {
          status: 'resigned',
          version: 1,
        }).expect(400);
        expect(res.body.details[0].field).toBe('resignationDate');
      });

      it('resignationDate must not be earlier than hireDate', async () => {
        const emp = await createOne();
        await patch(emp.id, {
          status: 'resigned',
          resignationDate: '2020-01-01',
          version: 1,
        }).expect(400);
      });

      it('resignationDate is rejected for non-resigned status', async () => {
        const emp = await createOne();
        await patch(emp.id, {
          resignationDate: '2025-06-01',
          version: 1,
        }).expect(400);
      });

      it('moving hireDate after an existing resignationDate is rejected', async () => {
        const emp = await createOne();
        await patch(emp.id, {
          status: 'resigned',
          resignationDate: '2025-06-30',
          version: 1,
        }).expect(200);
        await patch(emp.id, { hireDate: '2025-07-01', version: 2 }).expect(400);
      });

      it('resigned is terminal (409)', async () => {
        const emp = await createOne();
        await patch(emp.id, {
          status: 'resigned',
          resignationDate: '2025-06-30',
          version: 1,
        }).expect(200);
        const res = await patch(emp.id, {
          status: 'active',
          version: 2,
        }).expect(409);
        expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
      });

      it('a resigned employee can still have other fields corrected', async () => {
        const res = await patch(6, {
          phone: '0900-000-000',
          version: 1,
        }).expect(200);
        expect(res.body.status).toBe('resigned');
      });
    });
  });
});
