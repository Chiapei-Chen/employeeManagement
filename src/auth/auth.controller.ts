import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthUser } from './auth-user.js';
import { AuthService } from './auth.service.js';
import {
  AuthenticatedOnly,
  CurrentUser,
  Public,
} from './decorators/access.decorators.js';
import { ChangeOwnPasswordDto } from './dto/change-own-password.dto.js';
import { CurrentUserDto } from './dto/current-user.dto.js';
import { LoginResponseDto } from './dto/login-response.dto.js';
import { LoginDto } from './dto/login.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 登入 */
  @Post('login')
  @Public()
  @HttpCode(200)
  // 只對 login 限流：降低暴力破解密碼的風險
  @UseGuards(ThrottlerGuard)
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'INVALID_CREDENTIALS' })
  @ApiTooManyRequestsResponse({ description: 'TOO_MANY_REQUESTS' })
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto.username, dto.password);
  }

  /** 取得目前登入者與其權限 */
  @Get('me')
  @AuthenticatedOnly()
  @ApiBearerAuth()
  @ApiOkResponse({ type: CurrentUserDto })
  @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
  me(@CurrentUser() user: AuthUser): CurrentUserDto {
    return this.authService.getCurrentUser(user);
  }

  /**
   * 修改自己的密碼
   * 成功後其他裝置上的 token 全部失效，回應中附上新的 token 。
   */
  @Patch('me/password')
  @AuthenticatedOnly()
  // 需要驗證目前的密碼，等於另一個猜密碼的入口，所以也套用限流
  @UseGuards(ThrottlerGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({
    description:
      'VALIDATION_FAILED / INVALID_CURRENT_PASSWORD / PASSWORD_UNCHANGED',
  })
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangeOwnPasswordDto,
  ): Promise<LoginResponseDto> {
    return this.authService.changeOwnPassword(
      user,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
