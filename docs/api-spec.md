# API 規格

- Base URL：`http://localhost:3000/api/v1`
- 格式：JSON（`Content-Type: application/json`）
- 認證：除了 `/auth/login`、`/auth/refresh`、`/auth/logout` 以外，所有 API 都需要在 header 帶上 `Authorization: Bearer <accessToken>`
- refresh token 放在 HttpOnly cookie `refresh_token`（`Path=/api/v1/auth`、`SameSite=Strict`），由瀏覽器自動帶上
- 互動式文件：Swagger http://localhost:3000/api/docs

## 目錄
- [Endpoint 一覽](#endpoint-一覽)
- [設計思路：從行為出發](#設計思路從行為出發)
- [共通原則](#共通原則)
- [共通規範](#共通規範)
- [POST /auth/login](#post-authlogin)
- [POST /auth/refresh](#post-authrefresh)
- [POST /auth/logout](#post-authlogout)
- [GET /auth/me](#get-authme)
- [PATCH /auth/me/password](#patch-authmepassword)
- [GET /employees](#get-employees)
- [GET /employees/:id](#get-employeesid)
- [POST /employees](#post-employees)
- [PATCH /employees/:id](#patch-employeesid)
- [帳號管理 /users](#帳號管理-users)
- [錯誤碼一覽](#錯誤碼一覽)

---

## Endpoint 一覽

| Method | Path | 用途 | 權限 |
|---|---|---|---|
| POST | `/auth/login` | 登入，取得 access token，並設定 refresh token cookie | 不需登入 |
| POST | `/auth/refresh` | 用 refresh token cookie 換新的 access token | 不需登入（需要 cookie） |
| POST | `/auth/logout` | 伺服器端作廢 refresh token，並清除 cookie | 不需登入 |
| GET | `/auth/me` | 目前登入者與其權限 | 登入即可 |
| PATCH | `/auth/me/password` | 修改自己的密碼 | 登入即可 |
| GET | `/employees` | 員工列表（搜尋、篩選、分頁、排序） | `employee:read` |
| GET | `/employees/:id` | 單一員工 | `employee:read` |
| POST | `/employees` | 新增員工 | `employee:create` |
| PATCH | `/employees/:id` | 修改員工（部分更新） | `employee:update` |
| GET | `/users` | 帳號列表 | `user:manage` |
| POST | `/users` | 建立帳號 | `user:manage` |
| PATCH | `/users/:id` | 修改角色、停用 / 啟用 | `user:manage` |
| POST | `/users/:id/reset-password` | 管理者重設他人密碼 | `user:manage` |
| POST | `/users/:id/unlock` | 解除連續輸錯密碼造成的登入鎖定 | `user:manage` |

---

## 設計思路：從行為出發

設計 API 時，我先想「**使用者實際會做什麼**」，再決定 endpoint 與規則

| 使用者的行為 | 所以 API 這樣設計 |
|---|---|
| HR 想找某一個人，或查看某個部門、誰已經離職 | `GET /employees` 提供關鍵字與篩選條件，並且分頁，而不是一次回傳全部資料 |
| 編輯員工時，通常只會改其中幾個欄位 | 用 `PATCH` 部分更新，只送出有修改的欄位。若用 `PUT`，前端漏帶的欄位會被清空 |
| 多位 HR 可能同時編輯同一位員工 | 修改時必須帶上讀取時的 `version`；資料已被別人改過就回 409，避免默默蓋掉別人的修改 |
| 員工離職，但資料仍需要保留 | 不提供 `DELETE`，離職是透過 `PATCH` 變更狀態 |
| 新進員工一定是在職狀態 | 新增時不接受 `status`，由系統設定為 `active` |
| 使用者自己改密碼，和管理者幫忘記密碼的人重設，是兩種不同的情境 | 分成兩個 API：`PATCH /auth/me/password` 需要輸入目前的密碼；`POST /users/:id/reset-password` 需要管理權限，並讓對方的 token 失效。重設是一個「動作」，所以用動詞子路徑 |

---

## 共通原則

適用於所有 API 的規則：

| 決定 | 理由 |
|---|---|
| **REST 風格**：資源用複數名詞，動作用 HTTP method | 路徑和行為可以預期，也能利用 HTTP 本身的語意 |
| **統一的錯誤格式**，包含錯誤碼 `code` 與欄位錯誤 `details` | 前端依 `code` 判斷錯誤類型，不需要比對訊息文字；`details` 一次列出所有錯誤欄位，可以直接標示在表單上 |
| **HTTP 狀態碼有一致的原則** | 400 = 請求本身有錯（修正輸入即可）；409 = 和伺服器的現有狀態衝突（資料重複、版本過舊、狀態不能這樣轉換） |
| **送出未定義的欄位或參數一律 400** | 避免前端打錯參數名稱卻以為篩選有生效；防止 client 寫入 `id`、`status` 等不該由它決定的欄位 |

---

## 共通規範

### 錯誤回應格式

所有錯誤都使用同一種格式。**前端應該依 `code` 判斷錯誤類型**；`message` 是給人看的，內容可能會修改。

```json
{
  "statusCode": 400,
  "code": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "details": [
    { "field": "email", "errors": ["email must be an email"] },
    { "field": "hireDate", "errors": ["hireDate must be a valid date in YYYY-MM-DD format"] }
  ],
  "path": "/api/v1/employees",
  "timestamp": "2026-10-07T01:43:01.251Z"
}
```

- `details` 只有在欄位驗證錯誤時才會出現，會**一次列出所有錯誤欄位**，前端可以直接對應到表單。
- 500 錯誤不會回傳 SQL、stack trace 等內部資訊，這些只記錄在 server log。

### HTTP 狀態碼的使用原則

| 狀態碼 | 意義 |
|---|---|
| 400 | 請求內容有誤（格式、必填、資料前後矛盾） |
| 401 | 沒有登入、token 無效或過期、帳號已停用、密碼已被修改 |
| 403 | 已登入，但權限不足 |
| 404 | 資源不存在 |
| 409 | 與伺服器上的**現有狀態**衝突（資料重複、版本過舊、狀態不能這樣轉換） |
| 429 | 登入嘗試次數過多 |

> **400 和 409 的區分**：400 表示「這個請求本身有問題」，換一台伺服器結果也一樣；409 表示「請求本身沒問題，但和目前資料庫的狀態衝突」。

### 日期格式
- `hireDate`、`resignationDate`：只接受 `YYYY-MM-DD`。這兩個欄位是「日期」而不是「時間點」，如果接受 ISO datetime，會因為時區不同而差一天。
- `createdAt`、`updatedAt`：ISO 8601 UTC。

---

## POST /auth/login

使用帳號密碼取得 access token。**不需要登入**。

**限流**：分成兩層（詳見 [validation-and-auth.md](validation-and-auth.md#二登入)）
- 同一個 IP 每 60 秒最多 20 次（成功的登入也會計入），超過回 429
- 同一個帳號連續輸錯 5 次，鎖定 15 分鐘。觸發鎖定的那一次與鎖定期間（即使密碼正確）都回 `401 ACCOUNT_LOCKED`，讓使用者知道原因。代價是會透露這個帳號存在

**Request**
```json
{ "username": "admin", "password": "Admin@123" }
```

| 欄位 | 型別 | 規則 |
|---|---|---|
| username | string | 必填，1~50 字，前後空白會被去除，**不分大小寫** |
| password | string | 必填，1~100 字 |

**Response 200**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "permissions": ["employee:read", "employee:create", "employee:update", "user:manage"]
  }
}
```

同時回傳 `Set-Cookie: refresh_token=...; HttpOnly; SameSite=Strict; Path=/api/v1/auth`。refresh token 不會出現在回應 body。

**錯誤**

| 狀態 | code | 情境 |
|---|---|---|
| 400 | VALIDATION_FAILED | 缺少欄位 |
| 401 | INVALID_CREDENTIALS | 帳號不存在、密碼錯誤、帳號已停用。**三種情況回傳相同的訊息**，避免被用來探測哪些帳號存在 |
| 401 | ACCOUNT_LOCKED | 連續輸錯密碼，帳號暫時鎖定中 |
| 429 | TOO_MANY_REQUESTS | 嘗試次數過多 |

---

## POST /auth/refresh

用 cookie 中的 refresh token 換新的 access token。前端在重新整理頁面、或其他 API 回 401（access token 過期）時呼叫。**不需要 Authorization header**，但必須帶上 `refresh_token` cookie。

**Response 200**：格式與登入回應相同，並換發新的 refresh token cookie。每張 refresh token 只能換發一次（10 秒內的重送除外，見 [validation-and-auth.md](validation-and-auth.md)）。

**錯誤**

| 狀態 | code | 情境 |
|---|---|---|
| 401 | UNAUTHORIZED | 沒有 cookie、refresh token 無效或過期、已作廢（登出）、已經用過（視為被偷，同一次登入換發的 token 全部作廢）、帳號已停用、密碼已被修改。同時清除 cookie |

---

## POST /auth/logout

在伺服器端作廢 refresh token（包含這次登入換發出來的所有 token），並清除 cookie。同一個帳號在其他裝置的登入不受影響。**不需要登入**（access token 可能已經過期，仍要能登出）；cookie 無效或已過期時一樣回 204。

**Response 204**

---

## GET /auth/me

取得目前登入的使用者與其權限。前端可以用 `permissions` 決定要不要顯示「新增 / 編輯」按鈕。

**權限**：登入即可

**Response 200**
```json
{ "id": 2, "username": "viewer", "role": "readonly", "permissions": ["employee:read"] }
```

---

## PATCH /auth/me/password

修改**自己**的密碼。

**權限**：登入即可　**限流**：與登入共用 IP 限流，每個 IP 每分鐘 20 次（這支 API 需要驗證目前的密碼，不限流的話可以被用來猜密碼）

**Request**
```json
{ "currentPassword": "Viewer@123", "newPassword": "MyNew@Pass1" }
```

| 欄位 | 規則 |
|---|---|
| currentPassword | 必填 |
| newPassword | 至少 8 字元、最多 72 bytes（約 24 個中文字），不可與目前的密碼相同 |

**Response 200**：格式與登入回應相同，包含一個**新的** `accessToken`，並換發新的 refresh token cookie。

**修改成功後，在這之前簽發的所有 token 都會失效**（包含 refresh token、其他裝置、以及這次請求所使用的 token），所以前端必須改用回應中的新 token。

**錯誤**

| 狀態 | code | 情境 |
|---|---|---|
| 400 | VALIDATION_FAILED | 新密碼長度不符 |
| 400 | INVALID_CURRENT_PASSWORD | 目前的密碼錯誤（`details` 對應 `currentPassword` 欄位） |
| 400 | PASSWORD_UNCHANGED | 新密碼與目前的密碼相同 |
| 429 | TOO_MANY_REQUESTS | 嘗試次數過多 |

> 「再輸入一次新密碼」只是防止打錯字的 UX，由前端檢查，不送到後端。

---

## GET /employees

員工列表，支援搜尋、篩選、分頁與排序。

**權限**：`employee:read`（readonly、admin）

**Query parameters**（全部選填）

| 參數 | 型別 | 預設 | 說明 |
|---|---|---|---|
| keyword | string ≤100 | — | 模糊比對**姓名、Email、員工編號**，不分大小寫。`%`、`_` 會被當成一般字元 |
| department | string | — | 部門，完全比對 |
| status | `active` \| `on_leave` \| `resigned` | — | 在職狀態 |
| hireDateFrom | `YYYY-MM-DD` | — | 到職日起（含） |
| hireDateTo | `YYYY-MM-DD` | — | 到職日迄（含），不可早於 hireDateFrom |
| page | int ≥1 | 1 | 頁碼 |
| pageSize | int 1~100 | 20 | 每頁筆數。上限 100，避免一次撈出整張表 |
| sortBy | `employeeNo` \| `name` \| `hireDate` \| `createdAt` | `employeeNo` | 排序欄位，**只接受白名單內的欄位** |
| sortOrder | `asc` \| `desc` | `asc` | 排序方向 |

送出未定義的參數（例如 `?foo=bar`）會回 400，避免前端打錯參數名稱卻以為篩選有生效。

**範例**
```
GET /api/v1/employees?department=Engineering&status=active&sortBy=hireDate&sortOrder=desc&page=1&pageSize=20
```

**Response 200**
```json
{
  "items": [
    {
      "id": 1,
      "employeeNo": "E0001",
      "name": "王小明",
      "email": "xiaoming.wang@example.com",
      "phone": "0912-345-678",
      "department": "Engineering",
      "jobTitle": "Backend Engineer",
      "hireDate": "2021-03-01",
      "status": "active",
      "resignationDate": null,
      "version": 1,
      "createdAt": "2026-10-07T01:42:35.000Z",
      "updatedAt": "2026-10-07T01:42:35.000Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 4, "totalPages": 1 }
}
```

**錯誤**

| 狀態 | code | 情境 |
|---|---|---|
| 400 | VALIDATION_FAILED | pageSize > 100、page < 1、sortBy 不在白名單、status 值不存在、日期格式錯誤、日期區間顛倒、未定義的參數 |
| 401 / 403 | | 見共通規範 |

---

## GET /employees/:id

取得單一員工。

**權限**：`employee:read`

**Response 200**：員工物件（格式同列表中的 item）。**修改時需要帶回其中的 `version`。**

**錯誤**

| 狀態 | code | 情境 |
|---|---|---|
| 400 | VALIDATION_FAILED | id 不是數字 |
| 404 | EMPLOYEE_NOT_FOUND | 員工不存在 |

---

## POST /employees

新增員工。

**權限**：`employee:create`（僅 admin）

**Request**
```json
{
  "employeeNo": "E0011",
  "name": "王小明",
  "email": "xiaoming.wang2@example.com",
  "phone": "0912-345-678",
  "department": "Engineering",
  "jobTitle": "Backend Engineer",
  "hireDate": "2024-03-01"
}
```

| 欄位 | 必填 | 規則 |
|---|:-:|---|
| employeeNo | ✅ | `E` + 4~8 位數字；全系統唯一；**建立後不可修改** |
| name | ✅ | 1~50 字，前後空白會被去除，不可為空字串 |
| email | ✅ | Email 格式；轉小寫後儲存；全系統唯一（不分大小寫） |
| phone | | 8~20 碼，可包含 `+`、`-`、空白 |
| department | ✅ | 1~50 字 |
| jobTitle | ✅ | 1~50 字 |
| hireDate | ✅ | `YYYY-MM-DD`，必須是實際存在的日期（`2024-02-30` 會被拒絕） |

**不接受**的欄位：`id`、`status`、`resignationDate`、`version`、`createdAt` 等由系統管理的欄位。送了會回 400。
新進員工的狀態一律是 `active`。

**Response 201**：建立後的員工物件（`status: "active"`、`version: 1`）

**錯誤**

| 狀態 | code | 情境 |
|---|---|---|
| 400 | VALIDATION_FAILED | 格式錯誤、缺少必填欄位、送了不允許的欄位。`details` 會列出所有錯誤欄位 |
| 403 | FORBIDDEN | readonly 使用者 |
| 409 | EMPLOYEE_NO_DUPLICATED | 員工編號已存在 |
| 409 | EMPLOYEE_EMAIL_DUPLICATED | Email 已被其他員工使用 |

---

## PATCH /employees/:id

部分修改員工資料：**只會更新有送出的欄位**。

**權限**：`employee:update`（僅 admin）

**Request**
```json
{
  "jobTitle": "Senior Backend Engineer",
  "phone": null,
  "version": 3
}
```

| 欄位 | 說明 |
|---|---|
| version | **必填**。取得資料時拿到的 `version`，原封不動帶回來 |
| name / email / department / jobTitle / hireDate | 規則同新增；**不可為 null** |
| phone | 傳 `null` 表示清除 |
| status | `active` / `on_leave` / `resigned`，需要符合下方的轉換規則 |
| resignationDate | `YYYY-MM-DD`；只有在狀態是 `resigned` 時才能有值 |
| employeeNo | **不可修改**，送了會回 400 |

**狀態轉換規則**
```
          ┌──────────┐
          ▼          │
 active ◀──▶ on_leave
   │           │
   └─────┬─────┘
         ▼
     resigned（終態，不可再變更狀態）
```

- 變更為 `resigned` 時，必須同時提供 `resignationDate`
- `resignationDate` 不可早於 `hireDate`（**以合併後的資料檢查**：例如只修改 hireDate，也會和既有的離職日比較）
- 已離職的員工，仍然可以修正其他欄位（例如更正電話），但不能修改狀態

**為什麼 `resigned` 不能改回 `active`？** 回任應該建立新的任職紀錄。如果把離職紀錄直接改回在職，會失去「這個人曾經離職過」的歷史。

**Response 200**：更新後的員工物件（`version` 會 +1）

**錯誤**

| 狀態 | code | 情境 |
|---|---|---|
| 400 | VALIDATION_FAILED | 格式錯誤；缺少 version；只送了 version；必填欄位送 null；送了 employeeNo；離職卻沒有離職日；非離職狀態卻填了離職日；離職日早於到職日 |
| 403 | FORBIDDEN | readonly 使用者 |
| 404 | EMPLOYEE_NOT_FOUND | 員工不存在 |
| 409 | EMPLOYEE_VERSION_CONFLICT | 資料在你讀取之後已經被別人修改。前端應該提示使用者重新載入 |
| 409 | EMPLOYEE_EMAIL_DUPLICATED | 新的 Email 已被其他員工使用 |
| 409 | INVALID_STATUS_TRANSITION | 不合法的狀態轉換（例如 resigned → active） |

**為什麼用 PATCH 而不是 PUT？** 編輯頁面通常只會修改幾個欄位。PUT 要求送出完整資料，前端如果漏帶某個欄位，那個欄位就會被清空；PATCH 只更新有送出的欄位，比較安全。

---

## 帳號管理 /users

管理可以登入系統的帳號。**全部需要 `user:manage` 權限**（目前只有 admin 具備）。

帳號（users）和員工（employees）是兩件事：帳號是「誰能操作這個系統」，員工是「被管理的資料」。

### 帳號物件

```json
{
  "id": 3,
  "username": "hr.amy",
  "role": "readonly",
  "isActive": true,
  "passwordChangedAt": null,
  "lockedUntil": null,
  "createdAt": "2026-10-07T02:22:49.000Z",
  "updatedAt": "2026-10-07T02:22:49.000Z"
}
```

**任何回應都不會包含 `passwordHash`。** `lockedUntil` 不是 `null` 且晚於現在，表示帳號因連續輸錯密碼而被暫時鎖定。

### GET /users

帳號列表，依 id 排序。帳號數量通常只有幾十個，所以不分頁。

### POST /users

建立帳號。

```json
{ "username": "hr.amy", "password": "Welcome@123", "role": "readonly" }
```

| 欄位 | 規則 |
|---|---|
| username | 3~50 字元，只允許英數字與 `.` `_` `-`；**轉小寫**儲存；不可重複；**建立後不可修改** |
| password | 至少 8 字元、最多 72 bytes（bcrypt 只會使用前 72 bytes，超過的部分會被忽略，所以不允許更長的密碼）。以 UTF-8 bytes 計算：英數字 1 byte、中文字 3 bytes，約 24 個中文字 |
| role | `admin` / `readonly` |

**Response 201**：帳號物件

| 狀態 | code | 情境 |
|---|---|---|
| 400 | VALIDATION_FAILED | 格式錯誤；送了 `isActive` 等不允許的欄位 |
| 409 | USERNAME_DUPLICATED | 帳號名稱已存在（不分大小寫） |

### PATCH /users/:id

修改角色或啟用狀態。**立即生效**：對方的下一個請求就會使用新的角色；停用後對方的 token 立即失效。

```json
{ "role": "admin" }
{ "isActive": false }
```

**Response 200**：帳號物件

| 狀態 | code | 情境 |
|---|---|---|
| 400 | VALIDATION_FAILED | 沒有送任何欄位；送了 `username` 等不允許的欄位 |
| 404 | USER_NOT_FOUND | 帳號不存在 |
| 409 | CANNOT_MODIFY_SELF | 修改的是自己（防止把自己鎖在系統外） |
| 409 | LAST_ADMIN_REQUIRED | 這次修改會讓系統中沒有任何啟用中的 admin |

### POST /users/:id/reset-password

管理者替別人重設密碼。**對方目前的 token 會立即失效**，需要用新密碼重新登入。

```json
{ "newPassword": "Reset@1234" }
```

**Response 204**（無內容）

| 狀態 | code | 情境 |
|---|---|---|
| 400 | VALIDATION_FAILED | 密碼長度不符 |
| 404 | USER_NOT_FOUND | 帳號不存在 |
| 409 | CANNOT_MODIFY_SELF | 重設的是自己。自己的密碼請用 `PATCH /auth/me/password`（需要輸入目前的密碼） |

重設密碼也會一併解除登入鎖定：密碼已經換掉，之前猜錯的次數就沒有意義了。

### POST /users/:id/unlock

解除帳號因連續輸錯密碼造成的登入鎖定，並把失敗次數歸零。鎖定可能是對方自己忘記密碼，也可能是有人故意輸錯來鎖住帳號；管理者可以不必等鎖定時間結束。帳號沒有被鎖定時呼叫也會成功（結果相同）。

**Response 200**：更新後的帳號資料，`lockedUntil` 為 `null`。

| 狀態 | code | 情境 |
|---|---|---|
| 404 | USER_NOT_FOUND | 帳號不存在 |

### 不提供刪除

理由和員工一樣，改用停用：`employees.created_by` / `updated_by` 記錄了是哪個帳號修改的，帳號被刪除後，這些紀錄就找不到人了。

---

## 錯誤碼一覽

| code | HTTP | 說明 |
|---|---|---|
| VALIDATION_FAILED | 400 | 請求格式或內容不合法 |
| UNAUTHORIZED | 401 | 沒有 token、token 無效或過期、帳號已停用、密碼已被修改 |
| INVALID_CREDENTIALS | 401 | 登入失敗 |
| ACCOUNT_LOCKED | 401 | 帳號因連續輸錯密碼暫時鎖定 |
| FORBIDDEN | 403 | 權限不足 |
| EMPLOYEE_NOT_FOUND | 404 | 員工不存在 |
| EMPLOYEE_NO_DUPLICATED | 409 | 員工編號重複 |
| EMPLOYEE_EMAIL_DUPLICATED | 409 | Email 重複 |
| EMPLOYEE_VERSION_CONFLICT | 409 | 樂觀鎖衝突 |
| INVALID_STATUS_TRANSITION | 409 | 不合法的狀態轉換 |
| USER_NOT_FOUND | 404 | 帳號不存在 |
| USERNAME_DUPLICATED | 409 | 帳號名稱重複 |
| CANNOT_MODIFY_SELF | 409 | 不能修改自己的角色、狀態，或用管理者 API 重設自己的密碼 |
| LAST_ADMIN_REQUIRED | 409 | 系統中至少要保留一位啟用中的 admin |
| INVALID_CURRENT_PASSWORD | 400 | 目前的密碼錯誤 |
| PASSWORD_UNCHANGED | 400 | 新密碼與目前的密碼相同 |
| TOO_MANY_REQUESTS | 429 | 登入嘗試次數過多 |
| INTERNAL_ERROR | 500 | 未預期的錯誤 |
