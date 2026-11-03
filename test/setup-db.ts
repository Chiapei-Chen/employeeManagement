import { randomUUID } from 'node:crypto';
import pg from 'pg';

/**
 * 每個 test app 使用一個獨立的暫時資料庫，互不影響：
 * createTestApp() 時建立，測試檔結束後刪除。
 */
const adminUrl =
  process.env.E2E_ADMIN_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/postgres';
const created: string[] = [];

async function admin(sql: string) {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

/** 建立一個空的資料庫並回傳連線字串（schema 由 app 啟動時的 migration 建立） */
export async function createTestDatabase(): Promise<string> {
  const name = `e2e_${randomUUID().replaceAll('-', '')}`;
  await admin(`CREATE DATABASE "${name}"`);
  created.push(name);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

// 這個檔案是 setupFiles，hook 最先註冊，所以會在測試檔的 afterAll（app.close()）之後才執行
afterAll(async () => {
  for (const name of created.splice(0)) {
    await admin(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  }
});
