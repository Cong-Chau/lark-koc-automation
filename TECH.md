# TECH.md

## 1. Mục tiêu kỹ thuật

Xây dựng một automation tối giản bằng **TypeScript** để:

1. Chạy tự động mỗi ngày lúc **09:00 sáng** theo múi giờ `Asia/Ho_Chi_Minh`.
2. Đọc toàn bộ data hiện có trong một **Pool Sheet** trên Lark.
3. Tìm dòng cuối cùng đang có dữ liệu ở **cột L** của sheet `KOC List Official`.
4. Append toàn bộ data từ Pool Sheet xuống ngay bên dưới.
5. Không ghi đè dữ liệu cũ.
6. Không xử lý duplicate.
7. Không chỉnh sửa hoặc clear Pool Sheet.
8. Nếu lỗi thì dừng, **không retry**.

---

## 2. Kiến trúc tổng thể

```text
User cập nhật Pool Sheet trước 09:00
        ↓
Upstash QStash
        ↓
09:00 Asia/Ho_Chi_Minh
        ↓
POST /api/append-koc
        ↓
Vercel / Next.js
        ↓
Lark Open API
        ↓
Đọc Pool Sheet
        ↓
Tìm dòng cuối của Column L
        ↓
Append data mới
```

Kiến trúc ưu tiên:

- ít service;
- không database;
- không authentication layer;
- không queue riêng;
- không retry;
- chi phí vận hành gần như bằng 0;
- dễ deploy và maintain.

---

## 3. Tech Stack

### Language

- TypeScript

### Framework

- Next.js
- App Router
- Route Handlers

### Hosting

- Vercel

### Scheduler

- Upstash QStash

### Lark integration

- Lark Open API
- `@larksuiteoapi/node-sdk`

### Validation

- `zod` nếu cần validate environment variables

### Database

Không sử dụng.

### Authentication / Security layer

Không triển khai auth riêng cho endpoint automation trong scope hiện tại.

### Retry

Không retry.

---

## 4. Vì sao dùng QStash thay vì Vercel Cron

Requirement quan trọng nhất của hệ thống là job chạy sát **09:00 sáng**.

Vercel vẫn được dùng để host toàn bộ TypeScript backend, nhưng scheduler nên tách ra dùng **Upstash QStash**.

Luồng:

```text
QStash
   ↓
HTTP POST
   ↓
Vercel API Route
```

Cron mong muốn:

```text
0 9 * * *
```

Timezone:

```text
Asia/Ho_Chi_Minh
```

Retry:

```text
0
```

---

## 5. Project Structure

```text
src/
├── app/
│   └── api/
│       └── append-koc/
│           └── route.ts
│
├── lib/
│   ├── lark.ts
│   ├── pool.ts
│   └── append.ts
│
├── config.ts
└── types/
    └── index.ts
```

### `route.ts`

Entry point được QStash gọi vào lúc 09:00.

### `lark.ts`

Khởi tạo Lark client và chứa các helper chung.

### `pool.ts`

Đọc data từ Pool Sheet.

### `append.ts`

Xử lý:

- tìm dòng cuối của cột L;
- tính row bắt đầu;
- ghi data mới.

### `config.ts`

Đọc environment variables.

---

## 6. Dependencies

Ví dụ:

```bash
pnpm add @larksuiteoapi/node-sdk zod
```

Core dependencies:

```text
next
react
react-dom
typescript
@larksuiteoapi/node-sdk
zod
```

Không cần:

```text
Prisma
Drizzle
Supabase
PostgreSQL
Redis
BullMQ
NestJS
Express
Axios
```

---

## 7. Environment Variables

```env
LARK_APP_ID=
LARK_APP_SECRET=

LARK_SPREADSHEET_TOKEN=
LARK_POOL_SHEET_ID=
LARK_TARGET_SHEET_ID=
```

Nếu Pool Sheet nằm trong spreadsheet khác:

```env
LARK_POOL_SPREADSHEET_TOKEN=
LARK_TARGET_SPREADSHEET_TOKEN=
```

Nếu cùng một spreadsheet thì chỉ cần một spreadsheet token.

---

## 8. Sheet đích

Tên:

```text
KOC List Official
```

Lark URL:

```text
https://ujp85s26f3b2.jp.larksuite.com/wiki/TfrLwYDiTi2b4vkpgpbjWyxQpmy?sheet=c69c70
```

Cột đích:

```text
L
```

Automation chỉ append vào cột L.

Không được chỉnh sửa các cột khác.

---

## 9. Pool Sheet

Pool Sheet là nơi user tự chuẩn bị dữ liệu trước 09:00.

Ví dụ:

```text
A1  Username
A2  taphoanhasua31
A3  m.v.b397
A4  memuasam20
A5  ngocnga709
```

User tự chịu trách nhiệm:

- lấy data từ TikTok Shop;
- refresh pool mỗi sáng;
- đảm bảo data đúng trước 09:00;
- xóa hoặc thay data cũ nếu cần.

Automation không xử lý lifecycle của Pool Sheet.

---

## 10. Business Logic

Pseudo-code:

```text
START

1. Read Pool Sheet

2. Lấy toàn bộ row có giá trị

3. Loại bỏ row rỗng

4. Nếu không có data:
      return success / skipped

5. Read Column L của target sheet

6. Tìm last occupied row

7. firstInsertRow = lastOccupiedRow + 1

8. Append toàn bộ Pool data từ firstInsertRow

9. Return success

Nếu xảy ra lỗi:
      throw error
      stop
      no retry
```

---

## 11. API Endpoint

Endpoint chính:

```text
POST /api/append-koc
```

Ví dụ:

```text
https://your-project.vercel.app/api/append-koc
```

Endpoint không cần request body.

Mỗi lần được gọi, endpoint sẽ đọc trạng thái hiện tại của Pool Sheet và thực hiện append.

---

## 12. Route Handler mẫu

```ts
import { NextResponse } from "next/server";
import { readPool } from "@/lib/pool";
import { getLastRowInColumnL, appendToColumnL } from "@/lib/append";

export async function POST() {
  try {
    const poolRows = await readPool();

    const values = poolRows
      .map((row) => row[0])
      .filter((value): value is string => Boolean(value));

    if (values.length === 0) {
      return NextResponse.json({
        status: "skipped",
        reason: "POOL_EMPTY",
      });
    }

    const lastRow = await getLastRowInColumnL();

    await appendToColumnL({
      startRow: lastRow + 1,
      values,
    });

    return NextResponse.json({
      status: "success",
      count: values.length,
      startRow: lastRow + 1,
      endRow: lastRow + values.length,
    });
  } catch (error) {
    console.error("append-koc failed", error);

    return NextResponse.json(
      {
        status: "error",
      },
      {
        status: 500,
      },
    );
  }
}
```

---

## 13. Append Logic

Ví dụ target hiện tại:

```text
L100 account_A
L101 account_B
L102 account_C
```

Pool:

```text
account_D
account_E
account_F
```

Automation xác định:

```text
lastOccupiedRow = 102
firstInsertRow = 103
```

Sau khi chạy:

```text
L100 account_A
L101 account_B
L102 account_C
L103 account_D
L104 account_E
L105 account_F
```

Không hard-code row bắt đầu.

---

## 14. Empty Pool Behavior

Nếu Pool Sheet không có data:

```text
Pool empty
    ↓
Không ghi gì vào Lark
    ↓
Return success/skipped
```

Không tạo row rỗng.

Không xem đây là system error.

Response gợi ý:

```json
{
  "status": "skipped",
  "reason": "POOL_EMPTY"
}
```

---

## 15. Duplicate Behavior

Không kiểm tra duplicate.

Pool:

```text
abc
xyz
abc
```

Target sẽ append:

```text
abc
xyz
abc
```

Nếu account đã có trong những ngày trước, vẫn append lại nếu hôm nay nó xuất hiện trong pool.

---

## 16. Error Behavior

Khi lỗi:

```text
Error
  ↓
Stop
  ↓
Return HTTP 500
```

Không retry.

Không tự chạy lại.

Các lỗi có thể bao gồm:

- không đọc được Pool Sheet;
- Lark token/app credential lỗi;
- không truy cập được spreadsheet;
- sheet ID sai;
- Lark API timeout;
- không ghi được vào Column L.

---

## 17. Logging

Không dùng database để lưu log.

Sử dụng:

```ts
console.log(...)
console.error(...)
```

và xem trực tiếp qua Vercel Logs.

Ví dụ success:

```json
{
  "status": "success",
  "count": 9,
  "startRow": 215,
  "endRow": 223
}
```

Ví dụ skipped:

```json
{
  "status": "skipped",
  "reason": "POOL_EMPTY"
}
```

Ví dụ error:

```json
{
  "status": "error"
}
```

---

## 18. Scheduler Setup

QStash gọi:

```text
POST https://your-project.vercel.app/api/append-koc
```

Mỗi ngày:

```text
09:00
```

Timezone:

```text
Asia/Ho_Chi_Minh
```

Cron:

```text
0 9 * * *
```

Retry:

```text
0
```

---

## 19. Manual Testing

Có thể test trực tiếp bằng `curl`:

```bash
curl -X POST https://your-project.vercel.app/api/append-koc
```

Flow test:

```text
1. Điền 3 username vào Pool Sheet
2. Gọi endpoint bằng curl/Postman
3. Kiểm tra Column L
4. Verify 3 username được append đúng thứ tự
```

Không cần dashboard ở version đầu.

---

## 20. Deployment Flow

```text
Local Development
      ↓
Git Repository
      ↓
Vercel
      ↓
Set Environment Variables
      ↓
Deploy
      ↓
Create QStash Schedule
      ↓
Test thủ công
      ↓
Production
```

---

## 21. Scope kỹ thuật

### Có trong scope

- TypeScript backend.
- Next.js Route Handler.
- Deploy Vercel.
- QStash scheduler.
- Lark Open API integration.
- Read Pool Sheet.
- Append Column L.
- Skip nếu pool rỗng.
- Logging bằng Vercel.
- Stop nếu lỗi.

### Không nằm trong scope

- Database.
- User authentication.
- Admin authentication.
- Dashboard.
- Queue system.
- Retry.
- Duplicate detection.
- TikTok Shop crawler/API.
- Tự refresh Pool Sheet.
- Clear Pool Sheet.
- Job history.
- Notification system.
- Monitoring service riêng.

---

## 22. Stack cuối cùng

| Thành phần | Công nghệ |
|---|---|
| Language | TypeScript |
| Framework | Next.js |
| API | Next.js Route Handler |
| Hosting | Vercel |
| Scheduler | Upstash QStash |
| Lark Integration | Lark Open API / Node SDK |
| Pool | Lark Sheet |
| Destination | Lark Sheet - Column L |
| Database | Không |
| Auth | Không |
| Queue | Không |
| Retry | Không |
| Logging | Vercel Logs |

---

## 23. Architecture Final

```text
┌───────────────────────┐
│         USER          │
│ refresh pool mỗi sáng │
└───────────┬───────────┘
            ↓
┌───────────────────────┐
│    LARK POOL SHEET    │
└───────────────────────┘


       09:00 GMT+7
            │
            ↓
┌───────────────────────┐
│    UPSTASH QSTASH     │
│      Scheduler        │
└───────────┬───────────┘
            │
            │ POST
            ↓
┌───────────────────────┐
│       VERCEL          │
│ Next.js / TypeScript  │
│ /api/append-koc       │
└───────────┬───────────┘
            │
            ↓
┌───────────────────────┐
│     LARK OPEN API     │
└───────────┬───────────┘
            │
            ↓
┌───────────────────────┐
│   KOC List Official   │
│       Column L        │
└───────────────────────┘
```

---

## 24. Kết luận

Phiên bản đầu tiên nên giữ kiến trúc tối giản:

```text
QStash
   ↓
Vercel TypeScript Function
   ↓
Lark API
```

Không database, không auth, không queue, không retry.

Mục tiêu là có một automation nhỏ, dễ deploy, ít lỗi và đủ để đáp ứng đúng business requirement hiện tại.
