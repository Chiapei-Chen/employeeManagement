# 驗證與權限設計

## 一、驗證

### 三層防線

| 層 | 檢查什麼 | 失敗時 | 為什麼放在這一層 |
|---|---|---|---|
| **DTO + ValidationPipe** | 型別、必填、長度、格式、enum、多送的欄位 | 400，`details` 列出所有錯誤欄位 | 不需要查資料庫，一次回傳所有錯誤 |
| **邏輯層（Service / Rules）** | 唯一性、狀態轉換、合併後的一致性、版本 | 400 / 404 / 409 | 需要資料庫中的現有資料才能判斷 |
| **DB constraint** | UNIQUE、CHECK、NOT NULL | unique 轉成 409 | 唯一無法被繞過的地方，也能處理同時送出的請求 |

全域 `ValidationPipe` 開啟 `forbidNonWhitelisted`：**送了 DTO 沒有定義的欄位就回 400**。新增時送 `status`、修改時送 `employeeNo`、任何時候送 `id` 都會被拒絕，避免 client 覆寫不該由它決定的資料。

### 新增員工

| 欄位 | 規則 |
|---|---|
| employeeNo | `E` + 4~8 位數字；不可重複 |
| name / department / jobTitle | trim 後不可為空，最多 50 字 |
| email | Email 格式，轉小寫；不可重複（不分大小寫） |
| phone | 選填，8~20 碼 |
| hireDate | `YYYY-MM-DD`，必須是實際存在的日期 |
| status | 不接受輸入，一律為 `active` |

### 修改員工

**PATCH 只送部分欄位，所以規則要用「現有資料 + 這次的變更」合併後檢查。** 例如員工已離職（離職日 6/30），只送出 `{ "hireDate": "2025-07-01" }`：單看 request body 沒有問題，合併後才會發現到職日晚於離職日。

檢查順序：

1. 至少修改一個欄位；必填欄位不可為 null → 400
2. 員工存在 → 否則 404
3. version 與資料庫相同 → 否則 409
4. 狀態轉換合法 → 否則 409
5. 合併後的日期一致 → 否則 400
6. Email 沒有被其他人使用 → 否則 409
7. `UPDATE … WHERE id = ? AND version = ?`

**狀態轉換**：`active ⇄ on_leave`，兩者都可以變成 `resigned`。`resigned` 是終態：回任應建立新的任職紀錄，而不是把離職紀錄改回在職。

**新增與修改的 DTO 分開定義**：兩者目前的欄位規則相同，但沒有用 `PartialType` 從新增的 DTO 衍生，因為實務上新增與修改的規則常會各自演變（例如到職後不可再修改到職日），分開後可以獨立調整。

**必填欄位送 null**：class-validator 的 `@IsOptional()` 會把「沒送」和「送了 null」一起放行，不處理的話 `{"name": null}` 會撞到資料庫的 NOT NULL 變成 500。修改的 DTO 改用自訂的 `@IsOptionalNotNull()`：欄位可以不送，但送了就不能是 null，在 DTO 層就回 400。

### 並行：兩人同時操作

| 情境 | 作法 |
|---|---|
| **兩人同時修改同一位員工** | 樂觀鎖。修改時必須帶上讀取時的 `version`，更新條件是 `WHERE version = ?`；影響 0 筆表示已被別人改過，回 409。不用悲觀鎖，因為編輯頁可能開好幾分鐘 |
| **兩人同時新增相同的 Email** | 先查詢，給出清楚的錯誤；兩個請求同時通過查詢時，由資料庫的 unique index 擋下，再轉成相同的錯誤碼 |

共通的原則：**「先查再寫」擋不住同時送出的請求，真正的保證要放在同一條 SQL 或資料庫的 constraint 中。**

---

## 二、登入

```
POST /auth/login { username, password }
  → 限流（每個 IP 每分鐘 5 次，成功的登入也會計入）
  → 查詢帳號 → bcrypt 比對密碼 → 檢查是否啟用
  → 簽發 JWT（1 小時）

之後的每個請求：Authorization: Bearer <token>
  → JwtAuthGuard：驗證 token，回資料庫取得使用者目前的狀態與角色
  → PermissionsGuard：檢查角色是否具備所需權限
```

| 作法 | 防範什麼 |
|---|---|
| bcrypt 雜湊密碼 | 資料庫外洩時密碼不會直接曝光 |
| 帳號不存在、密碼錯誤、帳號停用 → 相同的錯誤訊息 | 從錯誤訊息猜出哪些帳號存在 |
| 帳號不存在時也執行一次 bcrypt | 從回應時間猜出哪些帳號存在 |
| 登入限流 | 暴力破解密碼 |
| JWT secret 長度不足時無法啟動 | 使用太弱的 secret |

**JWT 中不放角色，每次請求都回資料庫查詢。** 這樣停用帳號、調整角色都能在下一個請求立即生效；代價是每個請求多一次以主鍵查詢，對這個規模可以接受。

> **補充：為什麼用 Authorization header，而不是 HttpOnly cookie**
>
> | | Authorization header（本專案） | HttpOnly cookie |
> |---|---|---|
> | token 怎麼送出 | 前端每次手動加上 | 瀏覽器自動帶上 |
> | JavaScript 讀得到 token 嗎 | 讀得到，有 XSS 時可能被偷 | 讀不到 |
> | CSRF 風險 | 沒有，其他網站無法替使用者加上 header | 有，需要 `SameSite` 或 CSRF token 防範 |
> | 非瀏覽器的 client（App、其他服務） | 容易使用 | 處理 cookie 較麻煩 |
>
> 本專案選擇 header：設定簡單，用 Swagger、Postman 測試都很直觀，也不需要處理 CSRF。若是正式上線、只給瀏覽器使用的系統，會考慮改用 HttpOnly cookie 來防止 token 被 XSS 竊取，並同時加上 CSRF 防護。

---

## 三、授權

### 角色：依照題目設計的兩種

| 角色 | 可以做什麼 |
|---|---|
| `readonly` | 只能讀取員工列表與單一員工資料 |
| `admin` | 可以讀取、新增、修改員工資料；管理帳號 |

### 權限：依照對資料的動作（CRUD）細分

| CRUD | 權限 | readonly | admin |
|---|---|:-:|:-:|
| Create 新增 | `employee:create` | | ✅ |
| Read 讀取 | `employee:read` | ✅ | ✅ |
| Update 修改 | `employee:update` | | ✅ |
| Delete 刪除 | （沒有） | | |
| 帳號管理 | `user:manage` | | ✅ |

- **沒有刪除權限**：員工資料需要保留歷史，離職是透過修改狀態，系統中沒有刪除員工的 API
- **帳號管理沒有細分**：目前只有 admin 會管理帳號，拆開沒有實際用途。

### 為什麼分成角色與權限兩層

每個 API 只宣告「**需要哪一個權限**」，角色擁有哪些權限則集中在一張對應表中：

```ts
// src/auth/permissions.ts
readonly: ['employee:read']
admin:    ['employee:read', 'employee:create', 'employee:update', 'user:manage']

// endpoint 只宣告需要的權限
@Patch(':id')
@RequirePermissions(Permission.EmployeeUpdate)
```

日後新增角色時，例如「HR 主管：可以讀取和修改，但不能新增」，只要在對應表加一行 `hr_manager: ['employee:read', 'employee:update']`，所有 API 都不需要修改。若 API 上寫的是 `@Roles('admin')`，就得逐一找出每個 API 來修改。

### 權限怎麼被檢查

| | JwtAuthGuard | PermissionsGuard |
|---|---|---|
| 回答的問題 | 你是誰？ | 你可以做這件事嗎？ |
| 失敗時 | 401 | 403 |
| 預設 | 全部需要登入，`@Public()` 例外 | **沒有宣告權限就拒絕** |

兩個 Guard 都**全域註冊**，而不是在每個 controller 上加 `@UseGuards`。差別在於忘記時的後果：每個 controller 自己加，忘了就是 API 對外開放；全域註冊加上預設拒絕，忘了宣告只會讓 API 無法使用。

前端會從 `/auth/me` 取得權限清單，用來決定是否顯示按鈕。這只是 UX，真正的檢查一定在後端。

---

## 四、帳號管理

作業沒有要求，但帳號只能由 seed 產生的話，系統無法交給其他人使用，所以補上最小範圍：建立帳號、調整角色、停用、管理者重設密碼、自己修改密碼。不提供刪除。

**權限**：新增 `user:manage` 並給 admin。這代表 HR 也能建立其他 admin；更嚴謹的作法是獨立的 `system_admin` 角色，只需要修改權限對應表即可達成。

**防止把自己鎖在系統外**

| 規則 | 錯誤碼 |
|---|---|
| 不能修改自己的角色或狀態；不能用管理者 API 重設自己的密碼 | `CANNOT_MODIFY_SELF` |
| 系統中至少保留一位啟用中的 admin | `LAST_ADMIN_REQUIRED` |

因為不能修改自己，依序操作時不可能把最後一位 admin 降級。真正的風險是兩位 admin **同時**把對方降級。PostgreSQL 允許兩筆 UPDATE 並行，各自都會看到「對方還是 admin」，所以在同一個交易中先鎖住所有啟用中的 admin，再判斷與更新：

```sql
BEGIN;
SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE ORDER BY id FOR UPDATE;
-- 除了 :id 之外還有其他啟用中的 admin，才執行：
UPDATE users SET role = 'readonly' WHERE id = :id;
COMMIT;
```

後到的請求會在 `FOR UPDATE` 等待前一個交易 commit，再以最新的資料判斷，因此會被擋下（`LAST_ADMIN_REQUIRED`）。

**修改密碼後，舊 token 立即失效**：簽發 token 時記錄當下的 `password_changed_at`，Guard 比對與資料庫是否一致。不使用 JWT 的 `iat` 比較，因為它只精確到秒，同一秒內修改密碼會判斷錯誤。自己修改密碼時，回應會附上新的 token，目前的畫面不會被登出。

**其他規則**：帳號名稱轉小寫儲存；密碼至少 8 字元、最多 72 bytes（bcrypt 只使用前 72 bytes，所以上限以 UTF-8 bytes 計算而不是字元數：72 個中文字有 216 bytes，若以字元數計算，後 2/3 會被忽略）；修改自己的密碼也套用限流。

**已知限制：登入限流以 IP 計算，且成功的登入也會計入。** 若整個 HR 部門透過同一個對外 IP 連線，一分鐘內第 6 次登入就會被擋下。正式上線前，會改成「只計算失敗的嘗試」，並同時依帳號計數，避免同一個帳號被從多個 IP 猜密碼。
