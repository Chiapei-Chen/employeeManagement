# 員工資料管理（Nest.js）

面試作業：員工資料管理功能設計。

本專案的重點在 **Nest.js 後端**：員工列表搜尋、新增、單筆讀取與修改、JWT 登入，以及 `readonly` / `admin` 兩種權限，並著重於 API 設計、架構拆分、資料驗證與權限控管。

另附一個簡單的 Vue 3 操作畫面，用來實際操作並驗證 API 的行為；畫面僅求可用，未著重於介面設計。

## 如何閱讀設計

| 文件 | 內容 |
|---|---|
| **README.md** | 如何啟動、架構、資料流、權限設計 |
| [docs/requirements.md](docs/requirements.md) | 我對需求的理解：假設這是公司內部的小型人資系統，並由此推導出各項設計決定 |
| [docs/api-spec.md](docs/api-spec.md) | Endpoint、設計原則、request / response、錯誤碼 |
| [docs/architecture.md](docs/architecture.md) | 模組責任、分層、資料庫設計、技術選擇 |
| [docs/validation-and-auth.md](docs/validation-and-auth.md) | 新增與修改的驗證規則、登入流程、授權 |
| [docs/testing.md](docs/testing.md) | 測試策略與涵蓋範圍 |

其他：Swagger（啟動後 http://localhost:3000/api/docs）、[Postman collection](postman/)、[前端](frontend/README.md)。

> 文件皆為 Markdown 格式，內含表格與流程圖。在 GitHub 上可以直接閱讀；若使用 VS Code，建議安裝 [Markdown Preview Enhanced](https://marketplace.visualstudio.com/items?itemName=shd101wyy.markdown-preview-enhanced) 擴充套件，開啟文件預覽。

## 如何啟動

需要 Node.js 20 以上與 PostgreSQL（本機可用 Docker 啟動）。啟動時會自動建立資料表並寫入展示資料。

```bash
# 資料庫
docker compose up -d          # PostgreSQL 17，localhost:5432

# 後端
npm install
cp .env.example .env          # PowerShell：Copy-Item .env.example .env
npm run start:dev             # http://localhost:3000/api/v1

# 前端（另開終端機，選用）
cd frontend && npm install && npm run dev     # http://localhost:5173

# 測試
npm test                      # unit：26 個
npm run test:e2e              # e2e：79 個
```

| 展示帳號 | 密碼 | 角色 |
|---|---|---|
| `admin` | `Admin@123` | admin：讀取、新增、修改員工；管理帳號 |
| `viewer` | `Viewer@123` | readonly：只能讀取員工 |

**使用 Swagger 測試 API**（http://localhost:3000/api/docs）

1. 在 `POST /api/v1/auth/login` 按 **Try it out** → **Execute** 登入，複製回應中 `accessToken` 的值
2. 點頁面右上方的 **Authorize**，將 token 貼上後按 **Authorize** 儲存
3. 之後呼叫的 API 都會自動帶上 token；未設定的話會收到 401

> 只需貼上 token 本身，不需要加 `Bearer `；重新整理頁面後需要重新設定。

## 架構

依**業務領域切模組**，每個模組包含自己的 controller、service、repository、entity、DTO，模組內分成控制層、邏輯層、資料層。

### 專案結構

```
src/
├── main.ts                    啟動程式、Swagger
├── app.module.ts              根模組，組合所有模組
├── app.setup.ts               全域設定：ValidationPipe、Exception Filter、路徑前綴
├── config/                    讀取並驗證環境變數
├── database/                  資料庫連線與 migrations
├── common/                    跨模組共用：錯誤碼定義、統一錯誤格式、驗證 decorator
├── auth/                      登入、JWT、Guard、角色與權限定義
├── users/                     登入帳號與帳號管理
├── employees/                 員工資料管理
│   ├── employees.module.ts        模組定義
│   ├── employees.controller.ts    控制層：路由、宣告權限
│   ├── employees.service.ts       邏輯層：業務判斷與流程
│   ├── employee.rules.ts          邏輯層：業務規則（狀態轉換、日期檢查）
│   ├── employees.repository.ts     資料層：查詢與寫入資料庫
│   ├── employee.entity.ts         資料層：資料表結構
│   └── dto/                       API 的輸入與輸出格式
└── seed/                      展示用的初始資料

test/                          e2e 測試
frontend/                      Vue 3 操作畫面
```

> **補充：為什麼業務模組沒有另外放進 `modules/` 資料夾**
>
> 我考慮過將 `auth/`、`users/`、`employees/` 集中到 `src/modules/`，與 `config/`、`database/` 等基礎設施分開。但目前業務模組只有三個，平鋪仍然一目了然；這也是 Nest CLI 產生模組時的預設結構。當業務模組增加（例如部門、稽核紀錄），我認為再移到 `modules/` 底下會更清楚。這部分也很希望能聽聽您的看法。

### 模組依賴

```
                     AppModule
          ┌──────────┬───┴──────────┐
          ▼          ▼              ▼
   DatabaseModule  AuthModule   EmployeesModule
                     │
                     ▼
                 UsersModule

全域：ConfigService、DataSource、JwtAuthGuard、PermissionsGuard（APP_GUARD）
```

- **AuthModule**：登入、JWT、兩個全域 Guard、角色與權限定義
- **UsersModule**：登入帳號與帳號管理；只 export 邏輯層 `UsersService` 給 AuthModule 使用，資料層 `UsersRepository` 不對外
- **EmployeesModule**：員工的查詢、新增、修改。**不依賴 AuthModule**，只在路由上宣告需要的權限，由全域 Guard 檢查。日後更換登入方式，員工模組不需要修改

模組內分成三層：控制層（Controller、DTO）→ 邏輯層（Service、Rules）→ 資料層（Repository、Entity），詳見 [docs/architecture.md](docs/architecture.md)。

## 資料流

以修改員工 `PATCH /api/v1/employees/:id` 為例：

```
Request
  ▼
JwtAuthGuard ──── 沒有 token / token 無效 / 帳號停用 / 密碼已修改 ────▶ 401
  ▼
PermissionsGuard ─ 沒有 employee:update 權限 ──────────────────────────▶ 403
  ▼
ValidationPipe ─── 格式錯誤 / 多送欄位 / 缺少 version ─────────────────▶ 400
  ▼
EmployeesController   取出參數，呼叫 service
  ▼
EmployeesService      業務判斷
  ├─ 找不到員工 ──────────────────────────────────────────────────────▶ 404
  ├─ version 不一致（已被別人改過）────────────────────────────────────▶ 409
  ├─ 狀態轉換不合法（resigned → active）───────────────────────────────▶ 409
  ├─ 合併後資料不一致（離職卻沒有離職日…）─────────────────────────────▶ 400
  └─ Email 已被其他人使用 ─────────────────────────────────────────────▶ 409
  ▼
EmployeesRepository   UPDATE … WHERE id = ? AND version = ?
  └─ 沒有更新到資料（檢查之後才被別人改過）───────────────────────────▶ 409
  ▼
HttpExceptionFilter   所有錯誤統一成 { statusCode, code, message, details? }
  ▼
Response 200（version + 1）
```

資料在每一層使用不同的格式：前端送來的 JSON 由 ValidationPipe 轉成 **Request DTO**；Repository 以 **Entity** 寫入資料庫；回傳時再轉成 **Response DTO**，只列出可以公開的欄位。

## 權限設計

| Endpoint | 未登入 | readonly | admin |
|---|:-:|:-:|:-:|
| `POST /auth/login` | ✅ | ✅ | ✅ |
| `GET /auth/me`、`PATCH /auth/me/password` | 401 | ✅ | ✅ |
| `GET /employees`、`GET /employees/:id` | 401 | ✅ | ✅ |
| `POST /employees`、`PATCH /employees/:id` | 401 | 403 | ✅ |
| `/users`（帳號管理） | 401 | 403 | ✅ |

**角色與權限分開**：endpoint 只宣告需要的權限（例如 `employee:update`），角色擁有哪些權限集中在 [permissions.ts](src/auth/permissions.ts) 的對應表。新增角色時不需要修改 controller。

```ts
readonly: ['employee:read']
admin:    ['employee:read', 'employee:create', 'employee:update', 'user:manage']
```

**三個設計重點**

1. **預設拒絕**：Guard 全域註冊，每個 endpoint 都必須宣告 `@Public` / `@AuthenticatedOnly` / `@RequirePermissions` 其中之一，沒有宣告就是 403。忘記加權限的結果是「無法使用」，而不是「意外開放」
2. **變更立即生效**：Guard 每次請求都回資料庫確認使用者目前的狀態與角色。停用帳號、調整角色、修改密碼後，舊的 token 在下一個請求就會失效
3. **前端只負責顯示**：`/auth/me` 回傳權限清單，讓前端決定是否顯示按鈕；真正的檢查一定在後端

登入流程與帳號管理的規則見 [docs/validation-and-auth.md](docs/validation-and-auth.md)。


### 完成了哪些

作業要求的三個部分（列表與搜尋 / 新增、單一員工的讀取與修改、登入與授權）都已完成並可以執行，五份必要文件也都已附上。加分項目中的 Swagger、Postman collection、unit 與 e2e 測試、migration、前端畫面也都有提供。

### 還不熟的部分

測試是我目前最不熟悉的部分。測試策略、涵蓋範圍與確認方式整理在 [docs/testing.md](docs/testing.md)


## 關於這份作業

這是我第一次使用 Nest.js。由於我過去曾有一小段 C#（ASP.NET Core）的開發經驗，在學習時，我會先從兩者相近的概念切入，幫助自己理解，舉例來說 :

| C#（ASP.NET Core） | Nest.js |
|---|---|
| Controller 加 `[HttpPost]` | Controller 加 `@Post()` |
| 在建構式注入 Service | 在建構式注入 Provider |
| Model 加 `[Required]`、`[EmailAddress]` | DTO 加 `@IsNotEmpty()`、`@IsEmail()` |

但相近只是幫助我理解。**實作時，我會依照 Nest 本身的設計方式。**

目前的架構依據目前對Nest理解加上曾經開發的經驗去實現。若與團隊既有的架構或風格不同，我非常樂意學習並調整 !