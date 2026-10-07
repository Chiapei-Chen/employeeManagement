import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server as App } from 'node:http';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

export async function createTestApp(): Promise<INestApplication<App>> {
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
