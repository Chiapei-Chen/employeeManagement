import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AppConfig } from '../config/configuration.js';
import type { AuthUser } from './auth-user.js';
import { type AuthSession, AuthService } from './auth.service.js';
import {
  AuthenticatedOnly,
  CurrentUser,
  Public,
} from './decorators/access.decorators.js';
import { ChangeOwnPasswordDto } from './dto/change-own-password.dto.js';
import { CurrentUserDto } from './dto/current-user.dto.js';
import { LoginResponseDto } from './dto/login-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  REFRESH_COOKIE,
  setRefreshCookie,
} from './refresh-cookie.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** 登入：access token 放在回應 body，refresh token 放在 HttpOnly cookie */
  @Post('login')
  @Public()
  @HttpCode(200)
  // 只對 login 限流：降低暴力破解密碼的風險
  @UseGuards(ThrottlerGuard)
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS / ACCOUNT_LOCKED',
  })
  @ApiTooManyRequestsResponse({ description: 'TOO_MANY_REQUESTS' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const session = await this.authService.login(dto.username, dto.password);
    return this.respond(res, session);
  }

  /**
   * 用 cookie 中的 refresh token 換新的 access token
   * 前端在重新整理頁面、或 access token 過期時呼叫
   */
  @Post('refresh')
  @Public()
  @HttpCode(200)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    try {
      const session = await this.authService.refresh(readRefreshCookie(req));
      return this.respond(res, session);
    } catch (err) {
      // 已失效的 cookie 留著沒有用，順便清掉
      clearRefreshCookie(res, this.cookieSecure());
      throw err;
    }
  }

  /**
   * 登出：伺服器端作廢 refresh token，並清除 cookie
   * 只清 cookie 不夠：cookie 若在登出前被複製走，複製的那份仍然可以使用
   * 不需要登入：access token 可能已經過期，仍要能登出
   */
  @Post('logout')
  @Public()
  @HttpCode(204)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiNoContentResponse()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logout(readRefreshCookie(req));
    clearRefreshCookie(res, this.cookieSecure());
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
   * 成功後其他裝置上的 token（含 refresh token）全部失效，回應中附上新的 token 。
   */
  @Patch('me/password')
  @AuthenticatedOnly()
  @UseGuards(ThrottlerGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({
    description:
      'VALIDATION_FAILED / INVALID_CURRENT_PASSWORD / PASSWORD_UNCHANGED',
  })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangeOwnPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const session = await this.authService.changeOwnPassword(
      user,
      dto.currentPassword,
      dto.newPassword,
    );
    return this.respond(res, session);
  }

  /** refresh token 寫入 cookie，access token 與登入者資訊放在回應 body */
  private respond(res: Response, session: AuthSession): LoginResponseDto {
    setRefreshCookie(res, session.refreshToken, {
      secure: this.cookieSecure(),
      maxAgeSeconds: this.config.get('jwt.refreshExpiresInSeconds', {
        infer: true,
      }),
    });
    return session.response;
  }

  /** cookie 的 secure 屬性，依環境設定 */
  private cookieSecure() {
    return this.config.get('cookieSecure', { infer: true });
  }
}
