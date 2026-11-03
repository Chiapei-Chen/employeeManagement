# 測試與驗證方式

```bash
npm test            # unit test：26 個
npm run test:e2e    # e2e test：79 個
```

## 策略

| 類型 | 測什麼 | 為什麼用這種方式 |
|---|---|---|
| **Unit** | 業務規則（`employee.rules.ts`）、`PermissionsGuard` 的權限矩陣 | 純邏輯，情境多但不需要 I/O，用 `it.each` 列出所有組合 |
| **E2E** | 從 HTTP 到資料庫的完整流程 | Guard 順序、ValidationPipe 設定、錯誤格式、SQL、DB constraint，這些用 unit test 測不出來 |

**Service 與 Repository 沒有寫 mock 的 unit test。** Service 的工作主要是協調流程，mock 掉資料層之後剩下的判斷已經由 rules 的 unit test 涵蓋；Repository 則是 SQL 本身，mock 之後無法證明 SQL 是正確的。所以這兩層交給 e2e 測試。

**唯一的例外是 `employees.service.spec.ts`**：它只測「事先檢查通過，但寫入時被 DB unique index 擋下」時，service 會把資料層的 `UniqueConstraintException` 轉成正確的業務錯誤碼。這只有在兩個請求同時送出時才會發生，e2e 無法穩定重現：請求會被依序處理，第二個在事先檢查就被擋下。所以這裡用 stub 讓資料層直接丟出例外。

**E2E 的設定**：每個測試檔使用一個獨立的暫時 PostgreSQL 資料庫（[test/setup-db.ts](../test/setup-db.ts)，測試前建立、結束後刪除），需要先啟動 PostgreSQL（`docker compose up -d`）；資料庫由 migration 建立並寫入 seed 資料；使用與 `main.ts` 相同的 `configureApp()`。與正式環境的啟動流程一致。

## 涵蓋範圍

| 測試檔 | 重點情境 |
|---|---|
| `auth.e2e-spec.ts` | 登入成功與失敗（相同的錯誤訊息）、偽造的 token、**帳號停用後舊 token 立即失效**、權限矩陣、**migration 與 entity 一致** |
| `employees.e2e-spec.ts` | 列表的篩選、排序、分頁與各種 400；新增的正規化與重複檢查；**同時新增相同 Email 只有一個成功**；**樂觀鎖**；狀態轉換；**合併後的日期檢查** |
| `users.e2e-spec.ts` | readonly 無法管理帳號；不能修改自己；**兩位 admin 同時降級對方，最後剩一位**；**修改或重設密碼後舊 token 失效** |

## 手動驗證

- **Swagger**：http://localhost:3000/api/docs，登入後點 Authorize 貼上 token
- **Postman**：匯入 `postman/` 中的 collection，登入時會自動儲存 token
- **前端**：http://localhost:5173，分別用 admin 和 viewer 登入比較
