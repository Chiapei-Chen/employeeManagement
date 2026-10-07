import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { AppConfig } from './config/configuration.js';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));

  // 執行環境的設定
  app.enableCors(); // 目前允許所有網域呼叫 但在正式環境下應該限制前端網域
  app.enableShutdownHooks();

  //產生 API 文件（Swagger）
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Employee Management API')
      .setDescription(
        '員工資料管理 API。先呼叫 POST /api/v1/auth/login 取得 token，再點右上角 Authorize 貼上。',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);

  // 讀取 port
  const port = app.get(ConfigService<AppConfig, true>).get('port', {
    infer: true,
  });
  await app.listen(port);
  console.log(`API:     http://localhost:${port}/api/v1`);
  console.log(`Swagger: http://localhost:${port}/api/docs`);
}
await bootstrap();
