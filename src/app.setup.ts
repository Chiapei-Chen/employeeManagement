import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/errors/http-exception.filter.js';
import { validationExceptionFactory } from './common/validation/validation-exception.factory.js';

/**
 * main.ts 與 e2e 測試共用同一份設定，確保測試跑的就是正式環境的行為
 */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 移除 DTO 沒宣告的欄位
      forbidNonWhitelisted: true, // 送了沒宣告的欄位直接 400，而不是默默忽略
      transform: true, // 轉成 DTO class instance，套用 @Type / @Transform 與預設值
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  return app;
}
