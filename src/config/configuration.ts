/**
 * 集中讀取並驗證環境變數。
 */
export interface AppConfig {
  port: number;
  database: { path: string };
  jwt: { secret: string; expiresInSeconds: number };
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
    database: { path: env.DATABASE_PATH ?? 'data/employee.sqlite' },
    jwt: {
      secret: jwtSecret,
      expiresInSeconds: toInt('JWT_EXPIRES_IN', env.JWT_EXPIRES_IN, 3600),
    },
    // 預設不寫入：展示帳號的密碼是公開的，正式環境忘了設定也不會被建立
    seedDemoData: env.SEED_DEMO_DATA === 'true',
    loginThrottle: {
      limit: toInt('LOGIN_THROTTLE_LIMIT', env.LOGIN_THROTTLE_LIMIT, 5),
      ttlMs: toInt('LOGIN_THROTTLE_TTL_MS', env.LOGIN_THROTTLE_TTL_MS, 60_000),
    },
  };
};
