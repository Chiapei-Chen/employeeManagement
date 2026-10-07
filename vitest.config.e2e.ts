import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // 每個測試檔各自起一個 app，使用獨立的 in-memory SQLite，互不影響
    env: {
      DATABASE_PATH: ':memory:',
      JWT_SECRET: 'e2e-test-secret-at-least-16-chars',
      SEED_DEMO_DATA: 'true',
      LOGIN_THROTTLE_LIMIT: '1000',
    },
  },
});
