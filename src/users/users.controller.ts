import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user.js';
import {
  CurrentUser,
  RequirePermissions,
} from '../auth/decorators/access.decorators.js';
import { Permission } from '../auth/permissions.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';

/** 帳號管理。整個 controller 都需要 user:manage 權限 */
@ApiTags('users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
@ApiForbiddenResponse({ description: 'FORBIDDEN：需要 user:manage 權限' })
@RequirePermissions(Permission.UserManage)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** 帳號列表（帳號數量少，不分頁） */
  @Get()
  @ApiOkResponse({ type: [UserResponseDto] })
  getMany(): Promise<UserResponseDto[]> {
    return this.usersService.getMany();
  }

  /** 建立帳號 */
  @Post()
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED' })
  @ApiConflictResponse({ description: 'USERNAME_DUPLICATED' })
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  /** 修改角色或啟用狀態；停用或降級後立即生效 */
  @Patch(':id')
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'CANNOT_MODIFY_SELF / LAST_ADMIN_REQUIRED',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto, actor);
  }

  /** 管理者重設他人密碼；對方已登入的 token 會立即失效 */
  @Post(':id/reset-password')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  @ApiConflictResponse({ description: 'CANNOT_MODIFY_SELF' })
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    await this.usersService.resetPassword(id, dto.newPassword, actor);
  }

  /** 解除帳號的登入鎖定（連續輸錯密碼被暫時鎖定時） */
  @Post(':id/unlock')
  @HttpCode(200)
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  unlock(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.unlock(id);
  }
}
