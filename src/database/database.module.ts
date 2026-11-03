import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppConfig } from '../config/configuration.js';
import { migrations } from './migrations/index.js';

/**
 * Schema 由 migration 管理，不使用 synchronize：
 * synchronize 會依 entity 自動改表，正式環境可能直接刪欄位造成資料遺失；
 * migration 則是可 review、可版本控制、可重播的變更紀錄。
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        type: 'postgres',
        url: config.get('database.url', { infer: true }),
        autoLoadEntities: true,
        synchronize: false,
        migrations,
        migrationsRun: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
