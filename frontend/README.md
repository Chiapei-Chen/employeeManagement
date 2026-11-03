# 前端（Vue 3 + Vite + TypeScript）

簡單的操作畫面，用來展示後端 API 的權限與驗證行為。前端不是本作業的重點，因此沒有使用 UI 套件。

```bash
# 先在專案根目錄啟動後端（npm run start:dev）
cd frontend
npm install
npm run dev        # http://localhost:5173
```

開發時 Vite 會把 `/api` 轉發到 `http://localhost:3000`（見 `vite.config.ts`）。

| 檔案 | 責任 |
|---|---|
| `src/api.ts` | 呼叫 API、帶上 access token（只存在記憶體）、把後端錯誤格式轉成 `ApiError`；收到 401 時先用 refresh token 換新的 access token 並重送，失敗才登出 |
| `src/auth.ts` | 登入狀態；重新整理頁面時呼叫 `/auth/refresh` 還原登入；`can(permission)` 依照後端回傳的 `permissions` 決定是否顯示按鈕 |
| `src/router.ts` | 預設需要登入，只有 `meta.public` 的頁面例外（與後端的設計相同） |
| `src/errors.ts` | 依錯誤碼顯示中文訊息，並把錯誤對應到表單欄位 |
| `src/components/EmployeeForm.vue` | 新增與修改共用；修改時只送出有變更的欄位 + `version` |
| `src/views/*` | 登入、員工列表（搜尋 / 新增）、單一員工（檢視 / 修改）、帳號列表（查詢 / 新增 / 管理）、修改密碼 |

路由可以用 `meta.permission` 指定需要的權限（例如帳號管理頁需要 `user:manage`），沒有權限會被導回員工列表。修改自己的密碼後，前端會改用回應中的新 token，所以不會被登出。

**前端的權限判斷只影響 UX。** 隱藏按鈕不等於安全：真正的權限檢查一定在後端。
