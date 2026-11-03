/**
 * 集中讀取並驗證環境變數。
 */
export interface AppConfig {
  port: number;
  database: { url: string };
  jwt: {
    secret: string;
    /** access token：放在記憶體、用 Authorization header 送出，效期短 */
    expiresInSeconds: number;
    /** refresh token：放在 HttpOnly cookie，用來換新的 access token */
    refreshExpiresInSeconds: number;
  };
  /** 正式環境（HTTPS）必須為 true，cookie 才只會經由 HTTPS 傳送 */
  cookieSecure: boolean;
  seedDemoData: boolean;
  loginThrottle: { limit: number; ttlMs: number };
}

function toInt(name: string, value: string | undefined, fallback: number) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }
  return parsed;
}

export default (): AppConfig => {
  const env = process.env;

  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 16) {
    throw new Error(
      'JWT_SECRET is required and must be at least 16 characters (see .env.example)',
    );
  }

  return {
    port: toInt('PORT', env.PORT, 3000),
    database: {
      url:
        env.DATABASE_URL ??
        'postgres://postgres:postgres@localhost:5432/employee',
    },
    jwt: {
      secret: jwtSecret,
      expiresInSeconds: toInt('JWT_EXPIRES_IN', env.JWT_EXPIRES_IN, 900),
      refreshExpiresInSeconds: toInt(
        'JWT_REFRESH_EXPIRES_IN',
        env.JWT_REFRESH_EXPIRES_IN,
        7 * 24 * 3600,
      ),
    },
    // 預設依 NODE_ENV 判斷：本機 http 開發時不能加 Secure，否則瀏覽器不會送出 cookie
    cookieSecure:
      env.COOKIE_SECURE !== undefined
        ? env.COOKIE_SECURE === 'true'
        : env.NODE_ENV === 'production',
    // 預設不寫入：展示帳號的密碼是公開的，正式環境忘了設定也不會被建立
    seedDemoData: env.SEED_DEMO_DATA === 'true',
    loginThrottle: {
      limit: toInt('LOGIN_THROTTLE_LIMIT', env.LOGIN_THROTTLE_LIMIT, 5),
      ttlMs: toInt('LOGIN_THROTTLE_TTL_MS', env.LOGIN_THROTTLE_TTL_MS, 60_000),
    },
  };
};
