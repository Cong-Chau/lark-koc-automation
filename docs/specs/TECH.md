# TECH.md

## 1. Trạng thái và quyết định đã chốt

Tài liệu này là baseline kỹ thuật cho automation được mô tả trong
`lark_pool_automation_spec.md`.

Các quyết định đã được duyệt:

| Hạng mục       | Quyết định                                            |
| -------------- | ----------------------------------------------------- |
| Nguồn dữ liệu  | Google Sheets, cột A                                  |
| Target         | Lark Sheet `KOC List Official`, cột L                 |
| Lịch chạy      | Mỗi ngày lúc 09:00, `Asia/Ho_Chi_Minh`                |
| Scheduler      | Upstash QStash, 2 schedules                           |
| Runtime        | Next.js App Router trên Vercel                        |
| Google auth    | Service account, quyền Viewer trên Pool Sheet         |
| Pool layout    | Header ở dòng 1, data từ `A2:A`                       |
| Target layout  | Header ở `L1`, data bắt đầu từ `L2`                   |
| Append         | Tìm row có dữ liệu cuối cùng, ghi batch bên dưới      |
| Duplicate      | Không kiểm tra duplicate dữ liệu                      |
| Job duplicate  | Chấp nhận at-least-once; không idempotency/lock       |
| Write strategy | Một Lark batch write cho toàn bộ Pool                 |
| Retry          | Không retry ở application; QStash `retries: 0`        |
| Endpoint auth  | Public endpoint theo quyết định MVP; chấp nhận rủi ro |
| Cache          | Upstash Redis, TTL ngắn cho prepared payload          |

`TECH.md` mô tả cách triển khai kỹ thuật. Business requirement và acceptance
criteria gốc vẫn nằm trong `lark_pool_automation_spec.md`.

---

## 2. Mục tiêu kỹ thuật

Xây dựng một automation tối giản bằng TypeScript để:

1. Trigger mỗi ngày lúc 09:00 theo múi giờ `Asia/Ho_Chi_Minh`.
2. Đọc các giá trị hiện có trong Google Pool Sheet từ `A2:A`.
3. Bỏ các cell rỗng nhưng giữ nguyên thứ tự và nội dung của các cell còn lại.
4. Trước 09:00, đọc cột L của Lark target `KOC List Official`.
5. Tìm row cuối cùng có dữ liệu trong cột L và lưu sẵn append plan.
6. Đúng 09:00, ghi toàn bộ prepared Pool values vào range đã tính.
7. Không ghi đè dữ liệu cũ, không sửa Pool Sheet và không dedupe.
8. Dừng ngay khi có lỗi; không tự retry và không tự chạy bù.

Automation không lấy dữ liệu trực tiếp từ TikTok Shop. User chịu trách nhiệm
chuẩn bị Google Pool Sheet trước 09:00.

---

## 3. Kiến trúc tổng thể

```text
User cập nhật Google Pool Sheet trước 09:00
        │
        ▼
Upstash QStash Prepare Schedule
CRON_TZ=Asia/Ho_Chi_Minh 59 8 * * *
        │ POST, retries=0
        ▼
Vercel / Next.js
POST /api/prepare-koc
        │
        ├── Google Sheets API
        │     └── Read <POOL_TAB>!A2:A
        │
        └── Lark Sheets API
              └── Read <TARGET_SHEET_ID>!L1:L
        │
        ▼
Upstash Redis
        │
        ▼
Upstash QStash Append Schedule
CRON_TZ=Asia/Ho_Chi_Minh 0 9 * * *
        │ POST, retries=0
        ▼
Vercel / Next.js
POST /api/append-koc
        │
        └── Lark Sheets API
              └── Write <TARGET_SHEET_ID>!L{start}:L{end}
```

Đây là một flow read → calculate → write giữa hai provider độc lập. Không có
transaction cross-provider. Nếu một request ghi Lark thất bại, hệ thống không
cố đoán phần nào đã ghi và không tự gửi lại.

Kiến trúc ưu tiên:

- ít service;
- không database lâu dài;
- không queue riêng ngoài QStash;
- không lock hoặc idempotency store;
- Redis chỉ lưu prepared payload với TTL ngắn;
- một batch write duy nhất;
- dễ deploy và maintain;
- chi phí vận hành thấp.

### 3.1. Vì sao chọn QStash thay vì Vercel Cron

Vercel Cron dùng UTC và có giới hạn về độ chính xác theo plan. QStash hỗ trợ
IANA timezone trong cron bằng tiền tố `CRON_TZ`, nên biểu diễn trực tiếp được
lịch `09:00 Asia/Ho_Chi_Minh`. QStash cũng cho phép đặt số retry của message
về `0`.

Cron không cam kết dữ liệu xuất hiện tuyệt đối tại `09:00:00.000`; thời điểm
ghi thực tế vẫn phụ thuộc vào delivery, thời gian chạy function, mạng và Lark.

---

## 4. Tech stack

| Thành phần         | Công nghệ                                   |
| ------------------ | ------------------------------------------- |
| Language           | TypeScript                                  |
| Framework          | Next.js 16 App Router                       |
| API                | Next.js Route Handler                       |
| Hosting            | Vercel                                      |
| Scheduler          | `@upstash/qstash`                           |
| Prepared cache     | `@upstash/redis`                            |
| Google integration | Google Sheets API v4 qua `googleapis`       |
| Lark integration   | Lark Open API qua `@larksuiteoapi/node-sdk` |
| Validation         | `zod`                                       |
| Logging            | Vercel runtime logs                         |
| Database           | Không dùng                                  |

Dependencies hiện có trong repo:

- `next`
- `@upstash/qstash`
- `@upstash/redis`
- `@larksuiteoapi/node-sdk`
- `zod`

Dependency cần bổ sung khi implement:

```text
googleapis
```

Không cần Prisma, Drizzle, Supabase, PostgreSQL, BullMQ, Express hoặc Axios
riêng cho flow này.

---

## 5. Project structure

Repo hiện dùng App Router ở root `app/`, không dùng `src/`.

```text
app/
└── api/
    ├── prepare-koc/
    │   └── route.ts
    └── append-koc/
        └── route.ts

lib/
├── config.ts
├── google-sheets.ts
├── lark-client.ts
├── lark-sheets.ts
├── append-koc.ts
├── append-plan.ts
├── prepared-job-store.ts
└── errors.ts

types/
└── automation.ts
```

### Trách nhiệm module

`app/api/prepare-koc/route.ts`

- chỉ nhận `POST`;
- tạo `runId`;
- gọi prepare orchestration;
- map prepared payload thành HTTP response;
- không chứa logic provider.

`app/api/append-koc/route.ts`

- chỉ nhận `POST`;
- tạo `runId`;
- gọi append prepared orchestration;
- map result thành HTTP response;
- không chứa logic tìm row hoặc logic provider.

`lib/config.ts`

- đọc environment variables;
- validate bằng Zod;
- normalize private key của Google;
- không log secret.

`lib/google-sheets.ts`

- tạo Google Sheets client bằng service account;
- chỉ đọc Pool range;
- map response Google thành `PoolCellValue[]`;
- không có method write/clear.

`lib/lark-client.ts`

- khởi tạo Lark client một lần trong module scope nếu runtime cho phép;
- cấu hình Lark domain và app credentials;
- không để credential lan sang business logic.

`lib/lark-sheets.ts`

- đọc Column L;
- parse range trả về và xác định row number;
- ghi một `valueRange` duy nhất;
- kiểm tra transport error và business response code.

`lib/append-plan.ts`

- pure functions, không gọi network;
- lọc Pool cell rỗng;
- tìm last occupied row;
- tính `startRow`, `endRow`, target A1 range;
- dễ unit test độc lập.

`lib/append-koc.ts`

- orchestration prepare: Google read → empty check → Lark read → plan → Redis
  write;
- orchestration append: Redis read → freshness check → Lark write;
- không retry;
- ghi structured logs.

`lib/prepared-job-store.ts`

- đọc/ghi prepared payload vào Upstash Redis;
- TTL ngắn;
- validate shape tối thiểu trước khi append job dùng payload.

---

## 6. Environment variables và credential

### 6.1. Runtime variables

```env
DEV=false
PREPARED_JOB_MAX_AGE_SECONDS=600

# Google service account
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
GOOGLE_POOL_SPREADSHEET_ID=
GOOGLE_POOL_SHEET_NAME=

# Lark self-built app
LARK_APP_ID=
LARK_APP_SECRET=
LARK_DOMAIN=lark
LARK_WIKI_NODE_TOKEN=
LARK_TARGET_SHEET_ID=

# Upstash Redis prepared job cache
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

`QSTASH_TOKEN` là credential dùng khi tạo/cập nhật schedule bằng CLI hoặc
script provisioning. Nó không cần được đưa vào runtime function nếu schedule
được quản lý từ QStash Console. Nếu repo có script provision schedule, script
đó đọc `QSTASH_TOKEN` từ env riêng và không bundle token vào route.

`DEV=true` bật runtime log chi tiết từng step cho local/debug. Production dùng
`DEV=false` để chỉ log sau khi ghi xong target sheet hoặc khi job lỗi.

`PREPARED_JOB_MAX_AGE_SECONDS` giới hạn tuổi payload đã chuẩn bị. Nếu append job
không chạy trong thời hạn này, job fail thay vì dùng dữ liệu cũ.

`GOOGLE_POOL_SHEET_NAME` là tên tab bên trong Google Spreadsheet, không phải
spreadsheet ID. Không hard-code tên `Sheet1`.

Lark target hiện được mô tả bởi:

- Wiki node: `LARK_WIKI_NODE_TOKEN` lấy từ URL `/wiki/<token>`;
- sheet ID: giá trị cấu hình tương ứng, hiện có thể tham chiếu từ URL nhưng
  phải lưu riêng trong env;
- column: `L`.

Runtime dùng Wiki API để resolve Wiki node sang spreadsheet object token trước
khi gọi Sheets API. Không cần cấu hình `LARK_TARGET_SPREADSHEET_TOKEN` thủ công.

### 6.2. Google service account

Quy trình cấp quyền:

1. Tạo Google Cloud project và enable Google Sheets API.
2. Tạo user-managed service account.
3. Share Pool Google Sheet cho `GOOGLE_SERVICE_ACCOUNT_EMAIL` với quyền
   `Viewer`.
4. Lưu email và private key vào Vercel Environment Variables.
5. Không commit file JSON credential vào repo.

Scope tối thiểu:

```text
https://www.googleapis.com/auth/spreadsheets.readonly
```

Private key thường được lưu trong env với escaped newline. Config loader phải
normalize:

```text
privateKey.replace(/\\n/g, "\n")
```

Nếu dùng service-account key file trong local development, file đó phải nằm
ngoài repo hoặc bị ignore; production vẫn dùng secret env. Private key là
credential nhạy cảm và không được xuất hiện trong log/error response.

### 6.3. Lark permission

Lark app phải có quyền đọc và ghi spreadsheet target. Vì target dùng Lark
domain, client phải được khởi tạo với `LARK_DOMAIN=lark` hoặc enum tương ứng,
không dùng mặc định Feishu. Lark client dùng app
credentials để lấy tenant access token theo cơ chế của SDK.

Nếu target URL ở dạng Wiki, app cũng cần quyền đọc Wiki node để resolve
underlying spreadsheet object token.

Không đưa `tenant_access_token` vào environment variable thủ công nếu SDK đã
quản lý lifecycle token.

---

## 7. Data contract

### 7.1. Google Pool

Pool layout:

```text
<GOOGLE_POOL_SHEET_NAME>!A1 = header
<GOOGLE_POOL_SHEET_NAME>!A2:A = data
```

Google request:

```text
spreadsheets.values.get(
  spreadsheetId: GOOGLE_POOL_SPREADSHEET_ID,
  range: "'<escaped tab name>'!A2:A",
  majorDimension: "ROWS",
  valueRenderOption: "UNFORMATTED_VALUE"
)
```

`valueRenderOption=UNFORMATTED_VALUE` giúp giữ scalar value thay vì ép mọi
giá trị thành formatted display string. Dữ liệu username thông thường vẫn là
string.

Supported internal values:

```ts
type PoolCellValue = string | number | boolean;
```

Rules:

- bỏ `null`, `undefined` và chuỗi rỗng;
- giữ nguyên thứ tự từ trên xuống dưới;
- không trim;
- không validate username;
- không dedupe;
- không đổi kiểu string/number/boolean;
- nếu response chứa kiểu không hỗ trợ, job fail thay vì âm thầm stringify.

Khoảng trắng không phải chuỗi rỗng; nếu user điền cell chỉ chứa khoảng trắng,
giá trị đó được coi là data và được giữ nguyên theo nguyên tắc không cleaning.

Google API có thể lược bỏ trailing empty rows. Điều này không làm mất data hợp
lệ vì các row rỗng cuối Pool vốn không được append.

### 7.2. Lark target

Target layout:

```text
L1       = header
L2:L...  = existing data
```

Lark read range:

```text
<LARK_TARGET_SHEET_ID>!L1:L
```

Rules:

- `L1` luôn được reserved cho header;
- row trống ở giữa không được lấp;
- row cuối có value quyết định vị trí append;
- nếu không có data dưới header, bắt đầu từ row 2;
- các giá trị trống được xem là không occupied;
- không sửa các cột khác.

### 7.3. Internal types

```ts
type PoolCellValue = string | number | boolean;

type AppendPlan = {
  values: PoolCellValue[];
  startRow: number;
  endRow: number;
  targetRange: string;
};

type JobResult =
  | {
      status: "success";
      count: number;
      startRow: number;
      endRow: number;
    }
  | {
      status: "skipped";
      reason: "POOL_EMPTY";
    };
```

---

## 8. Provider API strategy

### 8.1. Google Sheets API

Dùng `googleapis` và `spreadsheets.values.get` để đọc một range. Google
adapter không được quyền ghi Pool.

Provider boundary:

```ts
interface PoolReader {
  readValues(): Promise<PoolCellValue[]>;
}
```

Tên tab phải được escape đúng A1 notation nếu có khoảng trắng hoặc dấu nháy.
Không ghép range bằng cách bỏ qua việc escape tên tab.

### 8.2. Lark Sheets API

Lark SDK hiện có semantic API cho nhiều Sheets v3 resource, nhưng values
read/write cần được bọc rõ trong adapter. Nếu semantic method tương ứng không
được expose ở version đang cài, dùng `client.request` của SDK để gọi Sheets
v2 values API; không tự đoán tên method.

Các operation cần có:

```text
GET /open-apis/wiki/v2/spaces/get_node?token={wikiNodeToken}&obj_type=wiki
GET /open-apis/sheets/v2/spreadsheets/{spreadsheetToken}/values/{range}
PUT /open-apis/sheets/v2/spreadsheets/{spreadsheetToken}/values
```

`range` là path segment nên adapter phải URL-encode đúng A1 range khi tạo raw
request. Nếu endpoint/provider không chấp nhận open-ended range như `L1:L`,
adapter phải lấy row count từ sheet metadata rồi tạo bounded range, không được
hard-code một row tối đa.

Write payload:

```json
{
  "valueRange": {
    "range": "<sheet-id>!L103:L105",
    "values": [["account_D"], ["account_E"], ["account_F"]]
  }
}
```

Provider boundary:

```ts
interface TargetSheet {
  readColumnL(): Promise<unknown[][]>;
  writeColumnL(range: string, values: PoolCellValue[]): Promise<void>;
}
```

Adapter phải kiểm tra:

1. request transport không throw;
2. HTTP response thành công;
3. Lark JSON `code === 0`;
4. response có shape tối thiểu cần thiết;
5. write response có updated range/cell metadata nếu API trả về.

Không coi HTTP 200 là đủ nếu body của Lark báo business error.

---

## 9. Business algorithm

```text
START prepare-koc job

1. Create runId and load/validate config.

2. Read Google Pool range <POOL_TAB>!A2:A.

3. Map rows to scalar values.

4. Remove null/undefined/empty-string cells only.

5. If values.length === 0:
      save skipped prepared payload to Redis
      return HTTP 200 { status: "skipped", reason: "POOL_EMPTY" }

6. Resolve Lark Wiki node to spreadsheet token.

7. Read Lark target range <TARGET_SHEET_ID>!L1:L.

8. Parse the returned A1 range and values.

9. Find the last row whose L cell is occupied.

10. firstInsertRow = max(2, lastOccupiedRow + 1)
    endRow = firstInsertRow + values.length - 1

11. Build target range <TARGET_SHEET_ID>!L{firstInsertRow}:L{endRow}.

12. Save values, target range, spreadsheet token, preparedAt, expiresAt to Redis.

END prepare-koc job

START append-koc job

1. Create runId and load/validate config.

2. Read prepared payload from Redis.

3. If payload is missing, malformed, or expired:
      return HTTP 500 { status: "error" }

4. If payload is POOL_EMPTY:
      return HTTP 200 { status: "skipped", reason: "POOL_EMPTY" }

5. Build one-column matrix: values.map(value => [value]).

6. PUT one Lark values request to the precomputed target range.

7. If provider success:
      log success
      return HTTP 200 with count/startRow/endRow

8. If any step fails:
      log sanitized error
      return HTTP 500 { status: "error" }

END append-koc job
```

### Last occupied row

Không dùng một row hard-code. Adapter phải sử dụng range coordinate trả về từ
Lark làm mốc, sau đó map index của mỗi row về row number thực tế.

Ví dụ:

```text
L1 = header
L2 = account_A
L3 = empty
L4 = account_C
```

Kết quả:

```text
lastOccupiedRow = 4
firstInsertRow = 5
```

Khoảng trống L3 không bị lấp.

### Empty target

Nếu target chỉ có header ở L1 hoặc range không có data hợp lệ dưới header:

```text
firstInsertRow = 2
```

Không ghi vào L1.

---

## 10. HTTP endpoint

Prepare endpoint:

```text
POST /api/prepare-koc
```

Append endpoint:

```text
POST /api/append-koc
```

Behavior:

| Tình huống                        | HTTP | Body                     |
| --------------------------------- | ---: | ------------------------ |
| Append thành công                 |  200 | `success` + count/range  |
| Pool rỗng                         |  200 | `skipped` + `POOL_EMPTY` |
| Method khác POST                  |  405 | method error tối giản    |
| Config/cache/provider/write error |  500 | `{ "status": "error" }`  |

Route không nhận request body. Chỉ prepare endpoint đọc trạng thái mới nhất của
Google Pool và Lark target. Append endpoint chỉ đọc prepared payload còn hạn rồi
ghi thẳng vào target range đã tính.

Route không dùng cache. Không expose GET endpoint để tránh biến việc kiểm tra
trạng thái thành một operation không được thiết kế.

### Public endpoint trade-off

Theo quyết định MVP, endpoint không verify QStash signature và không yêu cầu
shared secret. Bất kỳ ai biết URL đều có thể trigger job.

Hệ quả:

- người ngoài có thể làm append ngoài lịch;
- manual call có thể append lại cùng Pool;
- không có audit identity đáng tin cậy;
- cần giữ URL kín ở mức vận hành;
- khi requirement security tăng, phải thêm QStash signature verification hoặc
  secret trước khi coi endpoint production-hardened.

Đây là limitation được chấp nhận, không phải security guarantee.

---

## 11. Retry, duplicate và concurrency

### Retry

Không retry ở các lớp sau:

- không loop retry trong route;
- không retry trong orchestration;
- QStash schedule đặt `retries: 0`;
- không tự gọi lại sau HTTP 500;
- không có scheduled catch-up.

SDK/provider defaults phải được kiểm tra khi implement để tránh vô tình thêm
retry. Nếu client cho phép cấu hình retry, đặt về 0 cho flow này.

### Duplicate data

Automation không đọc toàn bộ lịch sử để dedupe. Nếu Pool chứa:

```text
abc
xyz
abc
```

thì cả ba values được ghi vào target.

Nếu job cùng ngày được gọi lại sau một lần thành công, cùng Pool có thể được
append lại. Đây là behavior đã được chấp nhận.

### Concurrent calls

Không có distributed lock. Hai prepare request đồng thời có thể:

1. cùng đọc cùng một `lastOccupiedRow`;
2. cùng tính cùng một target range;
3. ghi đè prepared payload trong Redis.

Append request đồng thời vẫn có thể ghi cùng một prepared payload nhiều lần.
Redis trong MVP chỉ là cache ngắn hạn, không phải lock hoặc idempotency key.
Nếu sau này cần đảm bảo không mất data, phải mở một design phase mới; không
được tự thêm một cơ chế nửa vời vào implementation hiện tại.

---

## 12. Error handling

```text
Config error
  → stop, không gọi provider

Google read error
  → stop, không gọi Lark

Pool empty
  → 200 skipped, không đọc/ghi target

Lark read error
  → stop, không write

Range/shape error
  → stop, không write

Prepared payload missing/expired/invalid
  → 500, không fallback sang đọc live

Lark write error
  → 500, không retry
```

Các lỗi cần phân loại trong log:

- `CONFIG_INVALID`;
- `GOOGLE_AUTH_FAILED`;
- `GOOGLE_READ_FAILED`;
- `LARK_AUTH_FAILED`;
- `LARK_READ_FAILED`;
- `TARGET_RANGE_INVALID`;
- `LARK_WRITE_FAILED`;
- `REDIS_READ_FAILED`;
- `REDIS_WRITE_FAILED`;
- `PREPARED_JOB_MISSING`;
- `PREPARED_JOB_EXPIRED`;
- `PREPARED_JOB_INVALID`;
- `PROVIDER_RESPONSE_INVALID`;
- `JOB_TIMEOUT`.

Nếu Lark write timeout hoặc response không xác định, hệ thống không được giả
định là write chắc chắn thất bại hoặc chắc chắn thành công. Vì không retry,
operator phải kiểm tra target thủ công trước khi chạy lại.

---

## 13. Logging và observability

Không dùng database cho job history. Dùng structured logs trên Vercel và một
in-memory runtime monitor cho debug nhẹ trong process hiện tại.

Mỗi run có `runId = crypto.randomUUID()` và tối thiểu các field:

```json
{
  "runId": "uuid",
  "operation": "append-koc",
  "trigger": "qstash|manual",
  "status": "success|skipped|error",
  "poolCount": 3,
  "startRow": 103,
  "endRow": 105,
  "durationMs": 842
}
```

Error log có thể thêm:

```json
{
  "runId": "uuid",
  "provider": "google|lark|qstash",
  "operation": "read|write|config",
  "errorCode": "LARK_WRITE_FAILED",
  "requestId": "provider-request-id"
}
```

Không log:

- service-account private key;
- Lark app secret hoặc access token;
- toàn bộ Pool values;
- raw provider response nếu response có dữ liệu nhạy cảm.

Runtime monitor:

- `/` hiển thị các event gần nhất;
- dashboard có manual trigger cho `POST /api/prepare-koc` và
  `POST /api/append-koc` sau confirm;
- `GET /api/logs` trả JSON snapshot;
- buffer giữ tối đa 200 event trong memory;
- restart process làm mất UI log;
- serverless deployment có thể rotate instance nên view này là best-effort,
  không thay thế Vercel logs hoặc audit storage.

Không có notification, alerting service hoặc persisted job history trong MVP.

---

## 14. Testing strategy

### 14.1. Pure unit tests

Test `append-plan.ts` với:

- Pool rỗng;
- một value;
- nhiều value và giữ thứ tự;
- duplicate values;
- empty string giữa các value;
- target chỉ có header;
- target có gap ở giữa;
- target có data ở row cuối;
- start row không bao giờ nhỏ hơn 2;
- end row đúng theo count.

### 14.2. Google adapter tests

- map `spreadsheets.values.get` response thành scalar values;
- bỏ null/undefined/empty string;
- giữ number/boolean/string;
- reject object/unsupported cell type;
- auth/config thiếu;
- Google API error;
- không có write call.

### 14.3. Lark adapter tests

- đọc range và parse row coordinate;
- map gap thành đúng row number;
- tạo đúng `valueRange` một cột;
- Lark HTTP/transport error;
- Lark body `code !== 0`;
- malformed `valueRange` response;
- không ghi các cột khác.

### 14.4. Route tests

- `POST` success;
- `POST` với Pool empty;
- Google failure không gọi Lark;
- Lark read failure không gọi write;
- Lark write failure trả 500;
- method khác POST trả 405;
- response không chứa secret hoặc raw values.

### 14.5. Manual integration test

Chỉ dùng test sheets trước khi production:

1. Tạo Google Pool test có header và 3 username ở A2:A4.
2. Tạo/copy Lark target test có header ở L1.
3. Cấu hình local env.
4. Gọi prepare rồi append:

   ```bash
   curl -X POST http://localhost:3000/api/prepare-koc
   curl -X POST http://localhost:3000/api/append-koc
   ```

5. Kiểm tra đúng thứ tự và row bắt đầu.
6. Kiểm tra Google Pool không bị thay đổi.
7. Gọi lại để xác nhận behavior duplicate đã chấp nhận.
8. Chỉ sau đó mới trỏ env sang production sheets.

Không dùng production target cho unit test và không chạy integration test tự
động trên dữ liệu thật.

---

## 15. Deployment flow

```text
Local development
      ↓
Install googleapis
      ↓
Configure local env
      ↓
Run focused unit/route tests
      ↓
Deploy Vercel
      ↓
Set Vercel environment variables
      ↓
Verify Google service-account sharing
      ↓
Create QStash prepare and append schedules
      ↓
Manual production smoke test
      ↓
Daily 09:00 operation
```

QStash schedules cần có:

```text
Destination: https://<vercel-domain>/api/prepare-koc
Method: POST
Cron: CRON_TZ=Asia/Ho_Chi_Minh 59 8 * * *
Retries: 0
```

```text
Destination: https://<vercel-domain>/api/append-koc
Method: POST
Cron: CRON_TZ=Asia/Ho_Chi_Minh 0 9 * * *
Retries: 0
```

Nên dùng `scheduleId` cố định để tránh tạo nhiều schedule trùng nhau khi deploy
hoặc setup lại. Không tạo nhiều schedule cùng gọi append endpoint.

Manual production smoke test phải dùng Pool nhỏ và có thể kiểm tra range vừa
ghi. Vì endpoint public và không idempotent, không gọi thử nhiều lần tùy ý.

---

## 16. Acceptance checklist kỹ thuật

- [ ] Google Pool có header ở row 1 và data ở cột A từ row 2.
- [ ] Service account được share Google Pool với quyền Viewer.
- [ ] Google Sheets API đã enable.
- [ ] Lark app có quyền đọc Wiki node và đọc/ghi target spreadsheet.
- [ ] Vercel env có đủ config và không commit credential.
- [ ] Upstash Redis env đã cấu hình.
- [ ] Prepared payload có max age ngắn, khuyến nghị 600 giây.
- [ ] QStash prepare dùng `CRON_TZ=Asia/Ho_Chi_Minh 59 8 * * *`.
- [ ] QStash append dùng `CRON_TZ=Asia/Ho_Chi_Minh 0 9 * * *`.
- [ ] QStash retries được đặt bằng `0`.
- [ ] Prepare và append endpoint nhận POST và route không cache.
- [ ] Pool empty trả `200 skipped` và không chạm target.
- [ ] Target L1 được reserved; data mới bắt đầu tối thiểu từ L2.
- [ ] Khoảng trống giữa các row L không bị lấp.
- [ ] Một job chỉ tạo một batch write tới Lark.
- [ ] Không ghi cột nào ngoài L.
- [ ] Pool không bị ghi, clear hoặc đánh dấu processed.
- [ ] Duplicate không bị lọc.
- [ ] Error dừng job và không retry.
- [ ] Log có runId nhưng không lộ secret/raw values.
- [ ] Đã chạy manual smoke test trên test sheets.
- [ ] Đã ghi nhận rủi ro public endpoint và concurrent write.

---

## 17. Non-goals và giới hạn MVP

Không nằm trong implementation hiện tại:

- TikTok Shop crawler hoặc TikTok API;
- tự refresh Google Pool;
- clear Google Pool sau khi chạy;
- dedupe username;
- validate username;
- write ngược vào Google Sheet;
- ghi sang Lark columns khác ngoài L;
- database/job history;
- notification hoặc alerting service;
- dashboard/admin UI;
- authentication riêng cho endpoint;
- QStash signature verification;
- retry, catch-up hoặc dead-letter workflow;
- distributed lock/concurrency control;
- exactly-once guarantee;
- transaction giữa Google và Lark.

---

## 18. Technical risks cần giữ rõ

| Risk                | Ảnh hưởng                       | Cách xử lý MVP                                   |
| ------------------- | ------------------------------- | ------------------------------------------------ |
| Public endpoint     | Người biết URL có thể trigger   | Chấp nhận, ghi rõ limitation                     |
| Gọi lại cùng ngày   | Append trùng                    | Chấp nhận at-least-once                          |
| Concurrent calls    | Ghi chồng vùng                  | Không lock; operator tránh gọi đồng thời         |
| Lark write timeout  | Không biết write đã commit chưa | Không retry; kiểm tra thủ công                   |
| Service-account key | Lộ credential nếu quản lý sai   | Vercel secret, không commit file                 |
| Google/Lark quota   | Request fail                    | Một Google read + một Lark read + một Lark write |
| Sheet schema đổi    | Range/read/write fail           | Fail fast, log provider error                    |
| Pool chứa type lạ   | Mapping không xác định          | Reject thay vì stringify âm thầm                 |
| Trigger timing      | Không bảo đảm 09:00:00.000      | Chỉ cam kết trigger gần 09:00                    |

---

## 19. Official references

- [QStash schedules và timezone](https://upstash.com/docs/qstash/features/schedules)
- [QStash schedule retry configuration](https://upstash.com/docs/qstash/api-reference/schedules/create-a-schedule)
- [Google Sheets `spreadsheets.values.get`](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get)
- [Google service accounts](https://docs.cloud.google.com/iam/docs/service-account-overview)
- [Google server-to-server OAuth](https://developers.google.com/identity/protocols/oauth2/service-account)
- [Lark Node SDK](https://www.npmjs.com/package/@larksuiteoapi/node-sdk)

---

## 20. Kết luận

Kiến trúc MVP cuối cùng:

```text
Google Sheets Pool
      ↓ read-only
Next.js Route Handler trên Vercel
      ↑ POST lúc 09:00 từ QStash
      ↓ read/write
Lark KOC List Official - Column L
```

Đây là một automation nhỏ với ranh giới provider rõ ràng, không database và
không retry. Đổi lại, hệ thống cố ý không cung cấp exactly-once, chống gọi
trùng, bảo vệ endpoint hoặc recovery tự động. Các đặc tính đó phải được xem là
phần của contract MVP, không được vô tình hứa cao hơn trong implementation.
