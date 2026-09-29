# Lark KOC Automation

Automation chạy hằng ngày lúc **09:00 theo giờ Việt Nam** để append dữ liệu từ
Google Sheets Pool vào **cột L** của sheet `KOC List Official` trên Lark.
Production dùng flow 2 job: chuẩn bị dữ liệu trước 09:00, rồi đến 09:00 chỉ ghi
payload đã chuẩn bị.

## Trạng thái triển khai

Subplan foundation đã hoàn thành:

- shared TypeScript contracts;
- runtime configuration validation bằng Zod;
- sanitized provider errors;
- Google Sheets dependency và static typecheck command.

Các adapter Google/Lark, orchestration route và QStash runtime được theo dõi trong
[master implementation plan](docs/plans/2026-09-19-lark-pool-automation.md).

## Luồng hoạt động

```text
User cập nhật Google Pool trước 09:00
              ↓
QStash prepare schedule: 08:59 Asia/Ho_Chi_Minh
              ↓
POST /api/prepare-koc
              ↓
Đọc Google Pool: <POOL_TAB>!A2:A
              ↓
Đọc Lark target: <SHEET_ID>!L1:L
              ↓
Tính sẵn target range và lưu Redis
              ↓
QStash append schedule: 09:00 Asia/Ho_Chi_Minh
              ↓
POST /api/append-koc
              ↓
Một batch write vào range đã chuẩn bị
```

Pool chỉ được đọc và không bị clear, sửa hoặc đánh dấu processed. Thứ tự dữ liệu
được giữ nguyên; duplicate được append nguyên trạng. Nếu Pool rỗng, job kết thúc
với trạng thái `skipped` và không chạm vào Lark.

## Công nghệ

- TypeScript
- Next.js 16 App Router và Route Handlers
- Vercel
- Google Sheets API v4 qua `googleapis`
- Lark Open API qua `@larksuiteoapi/node-sdk`
- Upstash QStash
- Upstash Redis
- Zod
- pnpm `10.33.0`

Không dùng database riêng, queue riêng, lock phân tán hoặc idempotency cho MVP.

## Yêu cầu môi trường

- Node.js `>=20.9` theo yêu cầu của Next.js 16.
- pnpm `10.33.0`.
- Một Google Cloud service account đã bật Google Sheets API.
- Google Pool spreadsheet được share cho service account với quyền `Viewer`.
- Lark app có quyền đọc/ghi spreadsheet đích.
- Upstash Redis REST database để lưu prepared payload ngắn hạn.
- Hai QStash schedules trỏ tới deployment URL trên Vercel.

## Cài đặt và chạy local

```bash
pnpm install
pnpm dev
```

Mở [http://localhost:3000](http://localhost:3000).

Các lệnh static validation:

```bash
pnpm run typecheck
pnpm run lint
```

Full lint hiện có thể báo lỗi từ các script trong `.agents/skills/`; khi đó cần
phân biệt lỗi nền của repository với lỗi trong source automation đang thay đổi.

## Environment variables

Tạo `.env.local` ở local hoặc cấu hình các biến tương ứng trong Vercel:

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

`GOOGLE_POOL_SHEET_NAME` là tên tab bên trong Google Spreadsheet, không phải
spreadsheet ID. Private key có thể được lưu dưới dạng chuỗi có `\n`; runtime sẽ
normalize thành newline thật.

`LARK_WIKI_NODE_TOKEN` là token trong URL `/wiki/<token>`. Runtime sẽ resolve
Wiki node này sang spreadsheet object token trước khi gọi Sheets API.

`DEV=true` bật log chi tiết từng step để debug local. Khi deploy production,
đặt `DEV=false` để chỉ log sau khi ghi xong target sheet hoặc khi job lỗi.

`PREPARED_JOB_MAX_AGE_SECONDS` giới hạn tuổi payload đã chuẩn bị. Production
khuyến nghị `600` giây để job ghi không dùng nhầm dữ liệu cũ.

Không commit private key, app secret, access token hoặc dữ liệu Pool vào Git.
`QSTASH_TOKEN` chỉ dùng trong môi trường provisioning schedule, không cần đưa vào
route runtime khi schedule được quản lý từ QStash Console.

## HTTP endpoint

Endpoint chuẩn bị dữ liệu:

```text
POST /api/prepare-koc
```

Endpoint ghi dữ liệu:

```text
POST /api/append-koc
```

Contract ghi dữ liệu:

| Tình huống                        |  HTTP | Response                                                 |
| --------------------------------- | ----: | -------------------------------------------------------- |
| Append thành công                 | `200` | `{ "status": "success", "count", "startRow", "endRow" }` |
| Pool rỗng                         | `200` | `{ "status": "skipped", "reason": "POOL_EMPTY" }`        |
| Method khác `POST`                | `405` | `{ "status": "error", "code": "METHOD_NOT_ALLOWED" }`    |
| Config/cache/provider/write error | `500` | `{ "status": "error" }`                                  |

MVP giữ endpoint public theo quyết định đã duyệt. Vì không có authentication,
deduplication hoặc lock, người biết URL có thể trigger lại job và tạo duplicate.

## Runtime monitor

Trang `/` hiển thị các runtime event gần nhất từ process hiện tại. App cũng cung
cấp:

```text
GET /api/logs
```

Log UI dùng in-memory ring buffer và vẫn mirror ra console/Vercel logs. Không
ghi database hoặc filesystem; khi server process restart thì log trong UI mất.
Trên serverless deployment, view này là best-effort theo instance hiện tại, phù
hợp debug live nhẹ hơn là audit history.

Dashboard có 2 nút thủ công:

- `Chuẩn bị dữ liệu`: gọi `POST /api/prepare-koc`;
- `Ghi dữ liệu đã chuẩn bị`: gọi `POST /api/append-koc`.

Nút ghi có thể append dữ liệu thật vào Lark nếu prepared payload còn hạn.

## QStash schedule

Sau khi deploy lên Vercel, tạo hoặc cập nhật 2 schedule cố định:

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

Không tạo nhiều schedule cùng gọi `/api/append-koc`. Xem hướng dẫn chi tiết tại
[QStash two-job schedule](docs/runbooks/qstash-two-job-schedule.md).

## Cấu trúc dự án

```text
app/
  page.tsx
  layout.tsx

lib/
  config.ts
  errors.ts
  google-sheets.ts       # Subplan 2
  lark-client.ts         # Subplan 3
  lark-sheets.ts         # Subplan 3
  append-plan.ts         # Subplan 4
  append-koc.ts          # Subplan 5

types/
  automation.ts

docs/
  specs/
    lark_pool_automation_spec.md
    TECH.md
  plans/
    2026-09-19-lark-pool-automation.md
    2026-09-19-lark-pool-automation-*.md
```

## Tài liệu dự án

- [Business specification](docs/specs/lark_pool_automation_spec.md)
- [Technical design](docs/specs/TECH.md)
- [Master implementation plan](docs/plans/2026-09-19-lark-pool-automation.md)
- [Foundation subplan](docs/plans/2026-09-19-lark-pool-automation-01-foundation.md)
- [AGENTS.md](AGENTS.md)

## Giới hạn MVP

- Không lấy dữ liệu trực tiếp từ TikTok Shop.
- Không tự refresh hoặc clear Google Pool.
- Không kiểm tra username hoặc duplicate.
- Không ghi vào Lark columns khác ngoài L.
- Không retry khi job lỗi.
- Không có exactly-once guarantee hoặc transaction giữa Google và Lark.
- Concurrent calls có thể tính cùng một row và ghi chồng lên nhau.
