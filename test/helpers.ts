import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server as App } from 'node:http';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { createTestDatabase } from './setup-db.js';

/** 每次呼叫都會使用一個新的資料庫，由 migration 建立 schema 並寫入 seed 資料 */
export async function createTestApp(): Promise<INestApplication<App>> {
  // 設定檔在 compile 時才讀取環境變數，所以在這之前設定
  process.env.DATABASE_URL = await createTestDatabase();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app); // 與 main.ts 相同的 pipe / filter / prefix
  await app.init();
  return app;
}

export async function loginAs(
  app: INestApplication<App>,
  username: string,
  password: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ username, password })
    .expect(200);
  return (res.body as { accessToken: string }).accessToken;
}
