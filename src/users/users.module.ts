import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity.js';
import { UsersRepository } from './users.repository.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([User])], // 我要操作 users 資料表
  controllers: [UsersController],
  // 控制層 → 邏輯層 → 資料層
  providers: [UsersService, UsersRepository],
  // 只開放邏輯層給 AuthModule 使用，資料層不對外
  exports: [UsersService],
})
export class UsersModule {}
