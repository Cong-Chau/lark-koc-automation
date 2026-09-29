# QStash two-job schedule

Automation production dùng 2 job để giảm thời gian ghi lúc 09:00.

## Job 1: prepare KOC

Job này chạy trước 09:00 để chuẩn bị payload.

```text
Destination: https://<vercel-domain>/api/prepare-koc
Method: POST
Cron: CRON_TZ=Asia/Ho_Chi_Minh 59 8 * * *
Retries: 0
```

Job prepare sẽ:

- đọc Google Pool;
- resolve Lark Wiki node sang spreadsheet token;
- đọc cột L của target sheet;
- tính sẵn `startRow`, `endRow`, `targetRange`;
- lưu prepared payload vào Upstash Redis.

Prepared payload mặc định chỉ hợp lệ trong `PREPARED_JOB_MAX_AGE_SECONDS`.
Giá trị khuyến nghị cho production là `600` giây.

## Job 2: append prepared KOC

Job này chạy đúng 09:00 và chỉ ghi payload đã chuẩn bị.

```text
Destination: https://<vercel-domain>/api/append-koc
Method: POST
Cron: CRON_TZ=Asia/Ho_Chi_Minh 0 9 * * *
Retries: 0
```

Job append sẽ:

- đọc prepared payload từ Upstash Redis;
- kiểm tra payload còn hạn;
- ghi thẳng vào `targetRange` đã tính sẵn;
- không đọc Google Pool;
- không resolve Wiki node;
- không đọc lại cột L.

## Environment variables

Vercel Production cần có thêm:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
PREPARED_JOB_MAX_AGE_SECONDS=600
```

Giữ `DEV=false` trong production. Khi cần debug step chi tiết, tạm đổi
`DEV=true`, redeploy, test xong đổi lại `false`.

## Manual test

Test bằng dashboard:

1. Bấm `Chuẩn bị dữ liệu`.
2. Kiểm tra log hoặc response báo số dòng và range đã chuẩn bị.
3. Bấm `Ghi dữ liệu đã chuẩn bị`.
4. Kiểm tra cột L trên Lark.

Test schedule ngắn hạn bằng 2 mốc phút cụ thể gần thời điểm hiện tại. Ví dụ nếu
đang muốn test lúc 23:30 theo giờ Việt Nam:

```text
Prepare cron: CRON_TZ=Asia/Ho_Chi_Minh 30 23 * * *
Append cron:  CRON_TZ=Asia/Ho_Chi_Minh 31 23 * * *
```

Sau khi test xong một vòng, xóa schedule test hoặc đổi về giờ production. Không
để nhiều schedule cùng gọi `/api/append-koc`, vì MVP không dedupe và có thể
append trùng.
