import { CurrentUserDto } from './current-user.dto.js';

/** 登入與修改自己密碼的回應 */
export class LoginResponseDto {
  accessToken: string;
  /** @example Bearer */
  tokenType: 'Bearer';
  /** token 有效秒數 */
  expiresIn: number;
  user: CurrentUserDto;
}
