# Lark KOC Automation

Automation chạy hằng ngày lúc **09:00 theo giờ Việt Nam** để đọc dữ liệu từ
Google Sheets Pool và append lần lượt vào **cột L** của sheet `KOC List Official`
trên Lark.

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
QStash schedule: 09:00 Asia/Ho_Chi_Minh
              ↓
Next.js Route Handler /api/append-koc
              ↓
Đọc Google Pool: <POOL_TAB>!A2:A
              ↓
Đọc Lark target: <SHEET_ID>!L1:L
              ↓
Tìm row cuối cùng có dữ liệu ở cột L
              ↓
Một batch write vào L{start}:L{end}
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
- Zod
- pnpm `10.33.0`

Không dùng database, queue riêng, lock phân tán hoặc storage idempotency cho MVP.

## Yêu cầu môi trường

- Node.js `>=20.9` theo yêu cầu của Next.js 16.
- pnpm `10.33.0`.
- Một Google Cloud service account đã bật Google Sheets API.
- Google Pool spreadsheet được share cho service account với quyền `Viewer`.
- Lark app có quyền đọc/ghi spreadsheet đích.
- Một QStash schedule trỏ tới deployment URL trên Vercel.

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
```

`GOOGLE_POOL_SHEET_NAME` là tên tab bên trong Google Spreadsheet, không phải
spreadsheet ID. Private key có thể được lưu dưới dạng chuỗi có `\n`; runtime sẽ
normalize thành newline thật.

`LARK_WIKI_NODE_TOKEN` là token trong URL `/wiki/<token>`. Runtime sẽ resolve
Wiki node này sang spreadsheet object token trước khi gọi Sheets API.

`DEV=true` bật log chi tiết từng step để debug local. Khi deploy production,
đặt `DEV=false` để chỉ log sau khi ghi xong target sheet hoặc khi job lỗi.

Không commit private key, app secret, access token hoặc dữ liệu Pool vào Git.
`QSTASH_TOKEN` chỉ dùng trong môi trường provisioning schedule, không cần đưa vào
route runtime khi schedule được quản lý từ QStash Console.

## HTTP endpoint

Endpoint mục tiêu của automation là:

```text
POST /api/append-koc
```

Endpoint được triển khai trong Subplan 5. Contract dự kiến:

| Tình huống                  |  HTTP | Response                                                 |
| --------------------------- | ----: | -------------------------------------------------------- |
| Append thành công           | `200` | `{ "status": "success", "count", "startRow", "endRow" }` |
| Pool rỗng                   | `200` | `{ "status": "skipped", "reason": "POOL_EMPTY" }`        |
| Method khác `POST`          | `405` | `{ "status": "error", "code": "METHOD_NOT_ALLOWED" }`    |
| Config/provider/write error | `500` | `{ "status": "error" }`                                  |

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

Dashboard cũng có nút `Run now` để gọi thủ công `POST /api/append-koc`. Manual
trigger dùng cùng endpoint với QStash và có thể append dữ liệu thật vào Lark nếu
Google Pool đang có dữ liệu.

## QStash schedule

Sau khi deploy lên Vercel, tạo hoặc cập nhật một schedule cố định:

```text
Destination: https://<vercel-domain>/api/append-koc
Method: POST
Cron: CRON_TZ=Asia/Ho_Chi_Minh 0 9 * * *
Retries: 0
```

Không tạo nhiều schedule cho cùng một deployment. Thời điểm trigger là mục tiêu
09:00:00 theo timezone Việt Nam; thời điểm dữ liệu thực sự xuất hiện trên Lark còn
phụ thuộc vào thời gian xử lý, mạng và phản hồi provider.

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
