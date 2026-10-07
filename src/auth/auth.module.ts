import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import type { AppConfig } from '../config/configuration.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';

@Module({
  imports: [
    UsersModule,
    // 簽發與驗證 token
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwt.secret', { infer: true }),
      }),
    }),
    // 登入限流
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        throttlers: [
          {
            name: 'login',
            limit: config.get('loginThrottle.limit', { infer: true }),
            ttl: config.get('loginThrottle.ttlMs', { infer: true }),
          },
        ],
        // 預設訊息是 "ThrottlerException: Too Many Requests"，會帶出內部類別名稱
        errorMessage: 'Too many attempts, please try again later',
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // 註冊順序 = 執行順序：先確認身分，再檢查權限
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AuthModule {}
