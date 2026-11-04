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
  → IP 限流（每個 IP 每分鐘 20 次，成功的登入也會計入）
  → 查詢帳號 → bcrypt 比對密碼 → 檢查是否啟用、是否鎖定中
  → 密碼錯誤：失敗次數 +1，連續 5 次就鎖定 15 分鐘
    密碼正確：失敗次數歸零
  → 簽發兩個 JWT：
      access token（15 分鐘）→ 放在回應 body，前端只存在記憶體
      refresh token（7 天）  → 放在 HttpOnly cookie，前端 JS 讀不到

之後的每個請求：Authorization: Bearer <access token>
  → JwtAuthGuard：驗證 token，回資料庫取得使用者目前的狀態與角色
  → PermissionsGuard：檢查角色是否具備所需權限

重新整理頁面，或 access token 過期（API 回 401）：
POST /auth/refresh（瀏覽器自動帶上 refresh token cookie）
  → 驗證 refresh token、帳號仍啟用、密碼未修改
  → 資料庫：這張標記為已使用（用過的又被拿來用 → 整個 family 作廢）
  → 簽發新的 access token，並換發新的 refresh token cookie

POST /auth/logout → 資料庫：作廢整個 family，並清除 refresh token cookie
```

| 作法 | 防範什麼 |
|---|---|
| bcrypt 雜湊密碼 | 資料庫外洩時密碼不會直接曝光 |
| 帳號不存在、密碼錯誤、帳號停用、帳號鎖定中 → 相同的錯誤訊息 | 從錯誤訊息猜出哪些帳號存在、哪些被鎖定 |
| 帳號不存在、鎖定中也執行一次 bcrypt | 從回應時間猜出哪些帳號存在 |
| 登入限流（IP + 帳號兩層，見下方） | 暴力破解密碼 |
| JWT secret 長度不足時無法啟動 | 使用太弱的 secret |

**JWT 中不放角色，每次請求都回資料庫查詢。** 這樣停用帳號、調整角色都能在下一個請求立即生效；代價是每個請求多一次以主鍵查詢，對這個規模可以接受。

> **補充：token 放在哪裡**
>
> | | access token | refresh token |
> |---|---|---|
> | 放在哪裡 | 前端記憶體（不寫入 localStorage） | HttpOnly cookie |
> | 怎麼送出 | 前端手動加上 `Authorization` header | 瀏覽器自動帶上，只會送到 `/api/v1/auth/*` |
> | JavaScript 讀得到嗎 | 讀得到，但只存在記憶體、效期短 | 讀不到，XSS 偷不走 |
> | CSRF | 沒有風險，其他網站無法替使用者加上 header | `SameSite=Strict`，其他網站發出的請求不會帶上 cookie |
>
> 一般 API 仍使用 Authorization header，所以 Swagger、Postman 的測試方式不變。
> 兩種 token 用 `typ` 欄位區分，refresh token 不能拿來呼叫一般 API，反之亦然。
>
> **補充：refresh token 存在資料庫**
>
> access token 是無狀態的 JWT（效期短，只驗簽章）；refresh token 效期長，所以每一張都記錄在 `refresh_tokens` 資料表，伺服器可以單獨作廢某一張。
> 資料庫只存 token 的 id（JWT 的 `jti`），不存 token 本身：資料庫外洩時，沒有 JWT secret 也無法偽造 token。
>
> | 情境 | 處理方式 |
> |---|---|
> | 換發（refresh） | 舊的標記為已使用，新增下一張。每張只能換發一次 |
> | 已經用過的又被拿來用 | 代表有兩個人持有同一張（可能被偷），伺服器分不出誰是本人 → 這次登入換發出來的 token（同一個 family）全部作廢，雙方都要重新登入 |
> | 登出 | 作廢整個 family。即使 cookie 在登出前被複製走，複製的那份也不能用 |
> | 同一個帳號在其他裝置的登入 | 屬於不同 family，不受影響 |
>
> - **為什麼是「標記已使用」而不是刪除**：刪除也能擋住舊的，但伺服器會分不出「從沒發過的 token」和「發過但已經用過的 token」，就無法偵測被偷。
> - **寬限期 10 秒**：同一個瀏覽器的多個分頁共用同一個 cookie，同時重新整理時會拿同一張 token 來換。用過的 token 在 10 秒內再出現，仍然換發，不視為被偷。
> - **同時換發**：在交易中用 `FOR UPDATE` 鎖住那一筆，兩個請求同時拿同一張 token 來換時，後到的會等前一個 commit 後再判斷。
> - 過期的記錄在該帳號下次登入時清除。
> - access token 仍是無狀態的：登出後，已簽發的 access token 在剩下的效期內（最多 15 分鐘）仍然可以使用，這是刻意的取捨。

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

**修改密碼後，舊 token（包含 refresh token）立即失效**：簽發 token 時記錄當下的 `password_changed_at`，Guard 比對與資料庫是否一致。不使用 JWT 的 `iat` 比較，因為它只精確到秒，同一秒內修改密碼會判斷錯誤。自己修改密碼時，回應會附上新的 token，目前的畫面不會被登出。

**其他規則**：帳號名稱轉小寫儲存；密碼至少 8 字元、最多 72 bytes（bcrypt 只使用前 72 bytes，所以上限以 UTF-8 bytes 計算而不是字元數：72 個中文字有 216 bytes，若以字元數計算，後 2/3 會被忽略）；修改自己的密碼也套用限流。

### 登入限流：IP 與帳號兩層

原本只依 IP 限流（每分鐘 5 次，成功的登入也會計入），有兩個問題：整個 HR 部門透過同一個對外 IP 連線時，第 6 個人登入就會被擋下；而攻擊者換多個 IP 猜同一個帳號，每個 IP 只試幾次，就永遠不會被擋。所以拆成兩層，各自防範不同的攻擊：

| 層級 | 防範什麼 | 作法 |
|---|---|---|
| IP 限流 | 一個 IP 對大量帳號各猜幾次（password spraying） | `ThrottlerGuard`，每個 IP 每分鐘 20 次。上限放寬，避免誤擋共用 IP 的同事 |
| 帳號鎖定 | 從多個 IP 猜同一個帳號 | 只計算**失敗**的嘗試；連續 5 次鎖定 15 分鐘，登入成功就歸零 |

**取捨與細節**

- **鎖定會被拿來惡意鎖人**：知道帳號名稱的人，故意輸錯 5 次就能鎖住別人（包括 admin）。所以只做**暫時鎖定**，不做永久鎖定；並提供 `POST /users/:id/unlock` 讓管理者立即解鎖。管理者重設密碼時也會一併解鎖。
- **鎖定中即使密碼正確也拒絕**：如果放行正確的密碼，攻擊者在鎖定期間仍然可以繼續猜，鎖定就失去意義。
- **鎖定時回傳與密碼錯誤相同的錯誤**（`401 INVALID_CREDENTIALS`），而不是 `423 Locked`：明確的錯誤比較好用，但會透露「這個帳號存在而且被鎖住了」，與「不透露帳號是否存在」的原則衝突。被鎖住的使用者可以請管理者解鎖，管理者在帳號列表看得到 `lockedUntil`。
- **計數寫在同一條 UPDATE**：「+1、判斷是否達到上限、鎖定」用一條 SQL 完成。若先讀出次數再寫回，同時送出的錯誤嘗試會讀到相同的舊值而少算（e2e 有測試同時送出 5 次錯誤的情境）。
- **已登入的工作階段不受影響**：鎖定只擋「用密碼登入」，已經登入的人仍可以用 refresh token 繼續使用。被鎖定通常不是本人造成的，不應該把正在工作的本人踢出去。
- **不存在的帳號不計數**：沒有資料列可以記錄，交給 IP 限流處理。

**已知限制**

- IP 限流的計數存在應用程式記憶體：重新啟動會歸零，部署多台時各自計算。多台部署時要改用 Redis 等共用儲存（`@nestjs/throttler` 支援替換 storage）。
- 部署在反向代理（nginx、負載平衡器）後面時，要設定 Express 的 `trust proxy`，`req.ip` 才會是使用者的 IP，而不是代理伺服器的 IP；但只能信任自己的代理，否則 `X-Forwarded-For` 可以被偽造。
