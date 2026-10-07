import type { INestApplication } from '@nestjs/common';
import type { Server as App } from 'node:http';
import request from 'supertest';
import { Role } from '../src/auth/permissions.js';
import { UsersService } from '../src/users/users.service.js';
import { createTestApp, loginAs } from './helpers.js';

/** 種子資料：admin（id=1, admin）、viewer（id=2, readonly） */
describe('Users / account management (e2e)', () => {
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
  const as = (token: string) => ({
    get: (url: string) =>
      http().get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body?: object) =>
      http().post(url).set('Authorization', `Bearer ${token}`).send(body),
    patch: (url: string, body: object) =>
      http().patch(url).set('Authorization', `Bearer ${token}`).send(body),
  });

  let seq = 0;
  async function createUser(role: 'admin' | 'readonly' = 'readonly') {
    seq += 1;
    const username = `user${seq}`;
    const res = await as(adminToken)
      .post('/api/v1/users', { username, password: 'Initial@123', role })
      .expect(201);
    return { id: res.body.id as number, username, password: 'Initial@123' };
  }

  describe('permissions', () => {
    it('readonly gets 403 on every /users endpoint', async () => {
      const v = as(viewerToken);
      await v.get('/api/v1/users').expect(403);
      await v
        .post('/api/v1/users', { username: 'x', password: 'x', role: 'admin' })
        .expect(403);
      await v.patch('/api/v1/users/1', { isActive: false }).expect(403);
      await v
        .post('/api/v1/users/1/reset-password', { newPassword: 'Whatever@123' })
        .expect(403);
    });

    it('admin has user:manage in /auth/me', async () => {
      const res = await as(adminToken).get('/api/v1/auth/me').expect(200);
      expect(res.body.permissions).toContain('user:manage');
    });
  });

  describe('GET /users', () => {
    it('lists accounts without password hashes', async () => {
      const res = await as(adminToken).get('/api/v1/users').expect(200);
      expect(res.body.map((u: { username: string }) => u.username)).toEqual(
        expect.arrayContaining(['admin', 'viewer']),
      );
      expect(JSON.stringify(res.body)).not.toMatch(/password_?hash/i);
    });
  });

  describe('POST /users', () => {
    it('creates an account that can log in, with normalized username', async () => {
      const res = await as(adminToken)
        .post('/api/v1/users', {
          username: '  HR.Amy ',
          password: 'Welcome@123',
          role: 'readonly',
        })
        .expect(201);
      expect(res.body).toMatchObject({
        username: 'hr.amy',
        role: 'readonly',
        isActive: true,
      });
      expect(res.body).not.toHaveProperty('passwordHash');

      // 登入時大小寫不影響
      await loginAs(app, 'HR.AMY', 'Welcome@123');
    });

    it('409 for duplicated username (case-insensitive)', async () => {
      const res = await as(adminToken)
        .post('/api/v1/users', {
          username: 'ADMIN',
          password: 'Welcome@123',
          role: 'admin',
        })
        .expect(409);
      expect(res.body.code).toBe('USERNAME_DUPLICATED');
    });

    it.each([
      [
        'short password',
        { username: 'okname', password: 'short', role: 'admin' },
        'password',
      ],
      [
        'password over 72 chars',
        { username: 'okname', password: 'x'.repeat(73), role: 'admin' },
        'password',
      ],
      [
        // 25 個中文字只有 25 個字元，但 UTF-8 是 75 bytes，超過 bcrypt 的 72 bytes
        'password over 72 bytes (multi-byte chars)',
        { username: 'okname', password: '密'.repeat(25), role: 'admin' },
        'password',
      ],
      [
        'invalid username chars',
        { username: 'bad name!', password: 'Welcome@123', role: 'admin' },
        'username',
      ],
      [
        'unknown role',
        { username: 'okname', password: 'Welcome@123', role: 'root' },
        'role',
      ],
      [
        'system field',
        {
          username: 'okname',
          password: 'Welcome@123',
          role: 'admin',
          isActive: false,
        },
        'isActive',
      ],
    ])('400 for %s', async (_, body, field) => {
      const res = await as(adminToken).post('/api/v1/users', body).expect(400);
      expect(res.body.details.map((d: { field: string }) => d.field)).toContain(
        field,
      );
    });
  });

  describe('PATCH /users/:id', () => {
    it('promoting to admin takes effect on the next request with the same token', async () => {
      const u = await createUser('readonly');
      const token = await loginAs(app, u.username, u.password);
      await as(token).get('/api/v1/users').expect(403);

      await as(adminToken)
        .patch(`/api/v1/users/${u.id}`, { role: 'admin' })
        .expect(200);
      await as(token).get('/api/v1/users').expect(200);
    });

    it('deactivating revokes existing tokens immediately and blocks login', async () => {
      const u = await createUser();
      const token = await loginAs(app, u.username, u.password);
      const res = await as(adminToken)
        .patch(`/api/v1/users/${u.id}`, { isActive: false })
        .expect(200);
      expect(res.body.isActive).toBe(false);

      await as(token).get('/api/v1/employees').expect(401);
      await http()
        .post('/api/v1/auth/login')
        .send({ username: u.username, password: u.password })
        .expect(401);

      await as(adminToken)
        .patch(`/api/v1/users/${u.id}`, { isActive: true })
        .expect(200);
      await loginAs(app, u.username, u.password);
    });

    it('cannot modify yourself (prevents self lock-out)', async () => {
      const res = await as(adminToken)
        .patch('/api/v1/users/1', { role: 'readonly' })
        .expect(409);
      expect(res.body.code).toBe('CANNOT_MODIFY_SELF');
      await as(adminToken)
        .patch('/api/v1/users/1', { isActive: false })
        .expect(409);
    });

    it('400 when nothing to update, 400 for username change', async () => {
      await as(adminToken).patch('/api/v1/users/2', {}).expect(400);
      await as(adminToken)
        .patch('/api/v1/users/2', { username: 'renamed' })
        .expect(400);
    });

    it('400 (not 500) when role or isActive is null', async () => {
      const res = await as(adminToken)
        .patch('/api/v1/users/2', { role: null, isActive: null })
        .expect(400);
      expect(res.body.details).toEqual([
        { field: 'role', errors: ['role cannot be null'] },
        { field: 'isActive', errors: ['isActive cannot be null'] },
      ]);
    });

    it('404 for missing user', async () => {
      const res = await as(adminToken)
        .patch('/api/v1/users/9999', { isActive: false })
        .expect(404);
      expect(res.body.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('last active admin protection', () => {
    /**
     * 因為「不能修改自己」，依序操作時不可能把最後一位 admin 降級：
     * 能呼叫 API 的只有 admin，而只剩一位時，那位就是自己。
     * 這條規則真正要防的是並行：兩位 admin 同時把對方降級。
     */
    it('two admins demoting each other at the same time leaves exactly one admin', async () => {
      const isolated = await createTestApp();
      try {
        const server = isolated.getHttpServer();
        const a = await loginAs(isolated, 'admin', 'Admin@123');
        const created = await request(server)
          .post('/api/v1/users')
          .set('Authorization', `Bearer ${a}`)
          .send({ username: 'b.admin', password: 'Badmin@123', role: 'admin' })
          .expect(201);
        const b = await loginAs(isolated, 'b.admin', 'Badmin@123');

        const results = await Promise.all([
          request(server)
            .patch(`/api/v1/users/${created.body.id}`)
            .set('Authorization', `Bearer ${a}`)
            .send({ role: 'readonly' }),
          request(server)
            .patch('/api/v1/users/1')
            .set('Authorization', `Bearer ${b}`)
            .send({ role: 'readonly' }),
        ]);
        // 一個成功；另一個若已通過 guard 會被條件式 UPDATE 擋下（409），否則因為已不是 admin 而 403
        expect(results.map((r) => r.status).sort()).toEqual([
          200,
          expect.any(Number),
        ]);
        expect([403, 409]).toContain(results.map((r) => r.status).sort()[1]);

        const users = await isolated.get(UsersService).getMany();
        expect(
          users.filter((u) => u.role === 'admin' && u.isActive),
        ).toHaveLength(1);
      } finally {
        await isolated.close();
      }
    });

    it('the conditional UPDATE rejects removing the last active admin (LAST_ADMIN_REQUIRED)', async () => {
      const isolated = await createTestApp();
      try {
        // 模擬「請求已通過 guard，但在寫入前另一位 admin 已被降級」的狀態：
        // 此時 DB 中只剩 id=1 一位 admin，而發出請求的是另一位（id=999）
        const service = isolated.get(UsersService);
        const otherAdmin = { id: 999, username: 'other', role: Role.Admin };
        await expect(
          service.update(1, { role: Role.Readonly }, otherAdmin),
        ).rejects.toMatchObject({
          code: 'LAST_ADMIN_REQUIRED',
        });
        await expect(
          service.update(1, { isActive: false }, otherAdmin),
        ).rejects.toMatchObject({
          code: 'LAST_ADMIN_REQUIRED',
        });
        // 不影響 admin 身分的修改照常可以執行
        await expect(
          service.update(2, { isActive: false }, otherAdmin),
        ).resolves.toMatchObject({
          isActive: false,
        });
      } finally {
        await isolated.close();
      }
    });
  });

  describe('passwords', () => {
    it('admin reset-password revokes the target user tokens', async () => {
      const u = await createUser();
      const oldToken = await loginAs(app, u.username, u.password);

      await as(adminToken)
        .post(`/api/v1/users/${u.id}/reset-password`, {
          newPassword: 'Reset@1234',
        })
        .expect(204);

      await as(oldToken).get('/api/v1/employees').expect(401);
      await http()
        .post('/api/v1/auth/login')
        .send({ username: u.username, password: u.password })
        .expect(401);
      await loginAs(app, u.username, 'Reset@1234');
    });

    it('admin cannot reset own password via the admin endpoint', async () => {
      const res = await as(adminToken)
        .post('/api/v1/users/1/reset-password', { newPassword: 'Another@123' })
        .expect(409);
      expect(res.body.code).toBe('CANNOT_MODIFY_SELF');
    });

    it('PATCH /auth/me/password: any role, old tokens revoked, new token returned', async () => {
      const u = await createUser('readonly');
      const tokenA = await loginAs(app, u.username, u.password); // 例如「另一台裝置」
      const tokenB = await loginAs(app, u.username, u.password); // 目前的畫面

      const res = await as(tokenB)
        .patch('/api/v1/auth/me/password', {
          currentPassword: u.password,
          newPassword: 'Changed@123',
        })
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));

      // 修改前簽發的 token（即使是同一秒內簽發）全部失效
      await as(tokenA).get('/api/v1/employees').expect(401);
      await as(tokenB).get('/api/v1/employees').expect(401);
      // 回應中的新 token 可以繼續使用
      await as(res.body.accessToken).get('/api/v1/employees').expect(200);

      await http()
        .post('/api/v1/auth/login')
        .send({ username: u.username, password: u.password })
        .expect(401);
      await loginAs(app, u.username, 'Changed@123');
    });

    it('rejects a wrong current password and an unchanged password', async () => {
      const u = await createUser();
      const token = await loginAs(app, u.username, u.password);

      const wrong = await as(token)
        .patch('/api/v1/auth/me/password', {
          currentPassword: 'nope',
          newPassword: 'Changed@123',
        })
        .expect(400);
      expect(wrong.body.code).toBe('INVALID_CURRENT_PASSWORD');

      const same = await as(token)
        .patch('/api/v1/auth/me/password', {
          currentPassword: u.password,
          newPassword: u.password,
        })
        .expect(400);
      expect(same.body.code).toBe('PASSWORD_UNCHANGED');

      // 失敗的嘗試不會讓 token 失效
      await as(token).get('/api/v1/employees').expect(200);
    });

    it('401 without login', async () => {
      await http()
        .patch('/api/v1/auth/me/password')
        .send({ currentPassword: 'a', newPassword: 'Changed@123' })
        .expect(401);
    });
  });
});
