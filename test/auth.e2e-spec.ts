import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server as App } from 'node:http';
import { DataSource } from 'typeorm';
import { createTestApp, loginAs } from './helpers.js';

function refreshCookieOf(res: request.Response): string | undefined {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  return cookies.find((c) => c.startsWith('refresh_token='));
}

/** 取出 "refresh_token=xxx"，模擬瀏覽器下次請求帶上的 Cookie header */
function cookiePair(res: request.Response): string {
  return refreshCookieOf(res)!.split(';')[0];
}

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
        expiresIn: 900,
        user: {
          username: 'viewer',
          role: 'readonly',
          permissions: ['employee:read'],
        },
      });
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('refreshToken');
    });

    it('sets the refresh token as an HttpOnly, SameSite=Strict cookie', async () => {
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ username: 'viewer', password: 'Viewer@123' })
        .expect(200);
      const cookie = refreshCookieOf(res);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
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
        SELECT 'disabled', password_hash, 'admin', FALSE FROM users WHERE username = 'admin'`);
      await http()
        .post('/api/v1/auth/login')
        .send({ username: 'disabled', password: 'Admin@123' })
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('exchanges the refresh cookie for a new access token and rotates the cookie', async () => {
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ username: 'admin', password: 'Admin@123' })
        .expect(200);

      const res = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookiePair(login))
        .expect(200);
      expect(res.body).toMatchObject({
        tokenType: 'Bearer',
        user: { username: 'admin', role: 'admin' },
      });
      expect(refreshCookieOf(res)).toBeDefined();

      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
    });

    it('401 without the refresh cookie', async () => {
      const res = await http().post('/api/v1/auth/refresh').expect(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('does not accept an access token as a refresh token', async () => {
      await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refresh_token=${adminToken}`)
        .expect(401);
    });

    it('does not accept a refresh token as an access token', async () => {
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ username: 'admin', password: 'Admin@123' })
        .expect(200);
      const refreshToken = cookiePair(login).split('=')[1];
      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(401);
    });

    it('rejects the refresh token once the account is deactivated', async () => {
      const ds = app.get(DataSource);
      await ds.query(`INSERT INTO users (username, password_hash, role)
        SELECT 'temp-refresh', password_hash, 'admin' FROM users WHERE username = 'admin'`);
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ username: 'temp-refresh', password: 'Admin@123' })
        .expect(200);

      await ds.query(
        `UPDATE users SET is_active = FALSE WHERE username = 'temp-refresh'`,
      );
      const res = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookiePair(login))
        .expect(401);
      // 失效的 cookie 會被清掉
      expect(refreshCookieOf(res)).toMatch(/refresh_token=;/);
    });

    it('POST /auth/logout clears the refresh cookie', async () => {
      const res = await http().post('/api/v1/auth/logout').expect(204);
      expect(refreshCookieOf(res)).toMatch(/refresh_token=;/);
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

      await ds.query(`UPDATE users SET is_active = FALSE WHERE username = 'temp'`);
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
