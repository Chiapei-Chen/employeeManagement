import type { CookieOptions, Request, Response } from 'express';

export const REFRESH_COOKIE = 'refresh_token';

/**
 * refresh token 的 cookie 設定
 * - httpOnly：前端 JS 讀不到，XSS 也偷不走
 * - sameSite strict：其他網站發出的請求不會帶上這個 cookie，防止 CSRF
 * - path：只有 /auth 底下的 API 會收到，其他 API 一律用 Authorization header
 */
function baseOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'strict', path: '/api/v1/auth' };
}

export function setRefreshCookie(
  res: Response,
  token: string,
  opts: { secure: boolean; maxAgeSeconds: number },
) {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseOptions(opts.secure),
    maxAge: opts.maxAgeSeconds * 1000,
  });
}

/** 清除 refresh token 的 cookie */
export function clearRefreshCookie(res: Response, secure: boolean) {
  res.clearCookie(REFRESH_COOKIE, baseOptions(secure));
}

/** 只需要讀一個 cookie，不另外引入 cookie-parser */
export function readRefreshCookie(req: Request): string | null {
  for (const part of req.headers.cookie?.split(';') ?? []) {
    const [name, ...rest] = part.trim().split('=');
    if (name === REFRESH_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}
