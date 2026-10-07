import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server as App } from 'node:http';
import { DataSource } from 'typeorm';
import { createTestApp, loginAs } from './helpers.js';

describe('Auth & authorization (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await loginAs(app, 'admin', 'Admin@123');
    viewerToken = await loginAs(app, 'viewer', 'Viewer@123');
  });
  afterAll(() => app.close());

  const http = () => request(app.getHttpServer());

  describe('POST /auth/login', () => {
    it('returns a bearer token and the user permissions', async () => {
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ username: 'viewer', password: 'Viewer@123' })
        .expect(200);
      expect(res.body).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: {
          username: 'viewer',
          role: 'readonly',
          permissions: ['employee:read'],
        },
      });
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it.each([
      ['wrong password', { username: 'admin', password: 'nope' }],
      ['unknown user', { username: 'ghost', password: 'Admin@123' }],
    ])('returns the same 401 for %s (no user enumeration)', async (_, body) => {
      const res = await http()
        .post('/api/v1/auth/login')
        .send(body)
        .expect(401);
      expect(res.body).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password',
      });
    });

    it('returns 400 when fields are missing', async () => {
      const res = await http().post('/api/v1/auth/login').send({}).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a disabled account even with the correct password', async () => {
      const ds = app.get(DataSource);
      await ds.query(`INSERT INTO users (username, password_hash, role, is_active)
        SELECT 'disabled', password_hash, 'admin', 0 FROM users WHERE username = 'admin'`);
      await http()
        .post('/api/v1/auth/login')
        .send({ username: 'disabled', password: 'Admin@123' })
        .expect(401);
    });
  });

  describe('authentication on protected routes', () => {
    it('401 without token', async () => {
      const res = await http().get('/api/v1/employees').expect(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('401 with a malformed / forged token', async () => {
      await http()
        .get('/api/v1/employees')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('immediately rejects a valid token once the account is deactivated', async () => {
      const ds = app.get(DataSource);
      await ds.query(`INSERT INTO users (username, password_hash, role)
        SELECT 'temp', password_hash, 'admin' FROM users WHERE username = 'admin'`);
      const token = await loginAs(app, 'temp', 'Admin@123');
      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await ds.query(`UPDATE users SET is_active = 0 WHERE username = 'temp'`);
      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('GET /auth/me returns the current user', async () => {
      const res = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body).toMatchObject({ username: 'admin', role: 'admin' });
    });
  });

  describe('permission matrix', () => {
    const newEmployee = {
      employeeNo: 'E0900',
      name: 'Matrix Test',
      email: 'matrix@example.com',
      department: 'QA',
      jobTitle: 'Tester',
      hireDate: '2025-01-01',
    };

    it('readonly can list and read', async () => {
      await http()
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
      await http()
        .get('/api/v1/employees/1')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });

    it('readonly cannot create or update (403)', async () => {
      const create = await http()
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send(newEmployee)
        .expect(403);
      expect(create.body.code).toBe('FORBIDDEN');

      await http()
        .patch('/api/v1/employees/1')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ jobTitle: 'Hacker', version: 1 })
        .expect(403);
    });

    it('admin can create and update', async () => {
      const created = await http()
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newEmployee)
        .expect(201);
      await http()
        .patch(`/api/v1/employees/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ jobTitle: 'Senior Tester', version: created.body.version })
        .expect(200);
    });
  });

  it('migrations produce exactly the schema the entities describe', async () => {
    const ds = app.get(DataSource);
    const pending = await ds.driver.createSchemaBuilder().log();
    expect(pending.upQueries.map((q) => q.query)).toEqual([]);
  });
});
