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

Các adapter Google/Lark và orchestration route được theo dõi trong
[master implementation plan](docs/plans/2026-09-19-lark-pool-automation.md).

## Luồng hoạt động

```text
User cập nhật Google Pool trước 09:00
              ↓
EC2 cron prepare: 08:59 Asia/Ho_Chi_Minh
              ↓
POST /api/prepare-koc
              ↓
Đọc Google Pool: <POOL_TAB>!A2:A
              ↓
Đọc Lark target: <SHEET_ID>!L1:L
              ↓
Tính sẵn target range và lưu file cache local
              ↓
EC2 cron append: 09:00 Asia/Ho_Chi_Minh
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
- AWS EC2
- Google Sheets API v4 qua `googleapis`
- Lark Open API qua `@larksuiteoapi/node-sdk`
- Linux cron
- Local filesystem prepared payload cache
- Nodemailer SMTP email
- Zod
- pnpm `10.33.0`

Không dùng database riêng, queue riêng, lock phân tán hoặc idempotency cho MVP.

## Yêu cầu môi trường

- Node.js `>=20.9` theo yêu cầu của Next.js 16.
- pnpm `10.33.0`.
- Một Google Cloud service account đã bật Google Sheets API.
- Google Pool spreadsheet được share cho service account với quyền `Viewer`.
- Lark app có quyền đọc/ghi spreadsheet đích.
- Một EC2 instance chạy cả app và cron local để dùng chung file cache ngắn hạn.
- Gmail App Password hoặc SMTP credential tương đương nếu bật email log.
- Hai cron entries trên cùng EC2 instance.

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

Tạo `.env.local` ở local hoặc trên EC2:

```env
DEV=false
PREPARED_JOB_MAX_AGE_SECONDS=600
PREPARED_JOB_FILE_PATH=.runtime/prepared-job.json

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

# Email notification
EMAIL_ENABLED=false
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=465
EMAIL_SMTP_SECURE=true
EMAIL_SMTP_USER=
EMAIL_SMTP_PASSWORD=
EMAIL_FROM=
EMAIL_TO=
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

`PREPARED_JOB_FILE_PATH` là nơi lưu prepared payload giữa job chuẩn bị và job
ghi. Nếu là relative path, app resolve từ thư mục chạy process. Production EC2
dùng mặc định `.runtime/prepared-job.json`. File cache này phù hợp khi cả 2 job
chạy trên cùng một server; không dùng cách này cho serverless nhiều instance.

`EMAIL_ENABLED=true` bật gửi email sau khi `/api/append-koc` ghi Lark thành
công. Với Gmail, dùng App Password cho `EMAIL_SMTP_PASSWORD`, không dùng mật
khẩu đăng nhập Google thường. `EMAIL_TO` có thể chứa nhiều email, phân tách bằng
dấu phẩy. Nếu gửi email lỗi, app chỉ ghi log `email_failed`; dữ liệu đã ghi vào
Lark vẫn được xem là thành công.

Không commit private key, app secret, access token hoặc dữ liệu Pool vào Git.

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

Log UI dùng in-memory ring buffer và vẫn mirror ra console/PM2 logs. Không ghi
database; khi server process restart thì log trong UI mất. Prepared payload là
file cache riêng và vẫn còn trên disk đến khi bị ghi đè hoặc hết hạn TTL.

Dashboard có 2 nút thủ công:

- `Chuẩn bị dữ liệu`: gọi `POST /api/prepare-koc`;
- `Ghi dữ liệu đã chuẩn bị`: gọi `POST /api/append-koc`.

Nút ghi có thể append dữ liệu thật vào Lark nếu prepared payload còn hạn.

## EC2 cron schedule

Sau khi deploy lên EC2, tạo hoặc cập nhật 2 cron entries cố định:

```text
TZ=Asia/Ho_Chi_Minh
59 8 * * * curl -s -X POST http://127.0.0.1:3000/api/prepare-koc >> /home/ubuntu/lark-koc-cron.log 2>&1
0 9 * * * curl -s -X POST http://127.0.0.1:3000/api/append-koc >> /home/ubuntu/lark-koc-cron.log 2>&1
```

Không tạo nhiều schedule cùng gọi `/api/append-koc`, vì MVP không dedupe và có
thể append trùng.

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
