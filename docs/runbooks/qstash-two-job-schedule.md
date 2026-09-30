# QStash two-job schedule

> Legacy note: production hiện tại đã chuyển sang EC2 cron và local file cache.
> Không dùng hướng dẫn này cho runtime hiện tại, vì QStash/Vercel có thể chạy 2
> job trên instance khác nhau và không chia sẻ được `.runtime/prepared-job.json`.

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
- lưu prepared payload vào local file cache trên cùng server.

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

- đọc prepared payload từ local file cache trên cùng server;
- kiểm tra payload còn hạn;
- ghi thẳng vào `targetRange` đã tính sẵn;
- không đọc Google Pool;
- không resolve Wiki node;
- không đọc lại cột L.

## Environment variables

Runtime hiện tại cần có thêm:

```env
PREPARED_JOB_MAX_AGE_SECONDS=600
PREPARED_JOB_FILE_PATH=.runtime/prepared-job.json
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
