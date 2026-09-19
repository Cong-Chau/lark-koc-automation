# SPEC – Tự động append data từ Pool Sheet vào Lark lúc 09:00

## 1. Mục tiêu

Xây dựng một automation chạy **mỗi ngày lúc 09:00 sáng**, tự động lấy toàn bộ data mà user đã chuẩn bị sẵn trong một **sheet trung gian (Pool Sheet)** và **append xuống cuối cột L** của sheet đích trên Lark.

Mục tiêu chính là loại bỏ thao tác copy/paste thủ công lúc 9h và hạn chế việc bị chậm vài giây do user thao tác bằng tay.

---

## 2. Sheet đích

**Tên:** `KOC List Official`

**Lark URL:**  
https://ujp85s26f3b2.jp.larksuite.com/wiki/TfrLwYDiTi2b4vkpgpbjWyxQpmy?sheet=c69c70

**Cột cần ghi data:** `Column L`

Automation chỉ được append data vào cột L, không thay đổi các cột khác.

---

## 3. Nguồn dữ liệu – Pool Sheet

Sẽ có một sheet riêng dùng làm **Pool Sheet**.

Pool Sheet là nơi user tự chuẩn bị data mỗi buổi sáng.

Quy trình phía user:

- Mỗi sáng user tự lấy data cần thiết từ TikTok Shop.
- User tự làm mới nội dung Pool Sheet.
- User đảm bảo data hoàn chỉnh trước 09:00.
- Hệ thống không chịu trách nhiệm lấy data trực tiếp từ TikTok Shop.
- Hệ thống không chỉnh sửa hoặc làm sạch Pool Sheet.

Có thể hiểu Pool Sheet đơn giản là:

> **Data nào đang nằm trong pool trước 9h thì data đó sẽ được chạy.**

---

## 4. Luồng hoạt động

### Trước 09:00

User tự cập nhật Pool Sheet bằng data của ngày hôm đó.

Ví dụ:

```text
taphoanhasua31
m.v.b397
memuasam20
thch.nghe.asmr
ngocnga709
lingting918
em.yeuu1234
mtcha.unbox
mayyhayreview
```

### Đúng 09:00

Automation bắt đầu chạy.

Luồng xử lý:

```text
09:00
  ↓
Đọc Pool Sheet
  ↓
Lấy toàn bộ data hiện tại
  ↓
Mở KOC List Official
  ↓
Xác định dòng cuối cùng đang có data ở cột L
  ↓
Append data mới ngay bên dưới
  ↓
Kết thúc
```

---

## 5. Quy tắc append data

Data mới phải được **thêm xuống dưới data hiện tại**, không được ghi đè.

Ví dụ trước khi chạy:

| Row | Column L |
|---:|---|
| 100 | account_A |
| 101 | account_B |
| 102 | account_C |

Pool hôm nay:

```text
account_D
account_E
account_F
```

Sau khi automation chạy:

| Row | Column L |
|---:|---|
| 100 | account_A |
| 101 | account_B |
| 102 | account_C |
| 103 | account_D |
| 104 | account_E |
| 105 | account_F |

Automation phải tự xác định vị trí cuối cùng của data hiện có, không hard-code một row cố định.

---

## 6. Quy tắc đối với Pool Sheet

Pool Sheet hoàn toàn do user quản lý.

Automation:

- không xóa data trong pool;
- không clear pool sau khi chạy;
- không đánh dấu `processed`;
- không chuyển data sang sheet khác;
- không kiểm tra data hôm nay có trùng với hôm qua hay không;
- không tự refresh pool.

Sau khi chạy xong, pool vẫn giữ nguyên trạng thái.

Sáng hôm sau user sẽ **tự làm mới pool**.

---

## 7. Thời gian chạy

Automation chạy:

**Mỗi ngày lúc 09:00 sáng.**

Timezone:

**Asia/Ho_Chi_Minh – GMT+7**

Mục tiêu là trigger càng sát `09:00:00` càng tốt.

Ví dụ lịch:

```text
08:59:59 → chưa chạy

09:00:00 → trigger automation

09:00:xx → data được append vào Lark
```

Cần lưu ý rằng thời điểm trigger có thể là chính xác 09:00, nhưng thời gian data thực sự xuất hiện trong Lark còn phụ thuộc vào tốc độ request, mạng và thời gian phản hồi của Lark.

Không nên cam kết kỹ thuật rằng data chắc chắn xuất hiện chính xác tuyệt đối ở `09:00:00.000`.

---

## 8. Xử lý lỗi

Yêu cầu hiện tại:

**Nếu automation lỗi thì stop.**

Không tự retry.

Ví dụ các lỗi có thể xảy ra:

- không đọc được Pool Sheet;
- không truy cập được Lark;
- hết quyền truy cập;
- request timeout;
- API lỗi;
- sheet không tồn tại;
- cấu trúc sheet thay đổi;
- không ghi được vào cột L.

Khi gặp lỗi:

```text
Error
 ↓
Stop execution
 ↓
Không retry
```

Không append một phần data rồi tự chạy lại nếu chưa có logic kiểm soát cụ thể.

---

## 9. Không xử lý duplicate

Automation mặc định **không kiểm tra trùng dữ liệu**.

Nếu Pool Sheet chứa:

```text
abc
xyz
abc
```

thì cột L cũng sẽ được append:

```text
abc
xyz
abc
```

Nếu một account đã từng tồn tại trong cột L từ những ngày trước nhưng lại xuất hiện trong pool hôm nay, automation vẫn append bình thường.

Việc đảm bảo data đúng và không trùng thuộc trách nhiệm của user khi chuẩn bị Pool Sheet.

---

## 10. Khi Pool Sheet rỗng

Khuyến nghị behavior:

```text
Pool không có data
→ không append gì
→ kết thúc job
```

Không tạo dòng rỗng trong cột L.

Không xem trường hợp pool rỗng là lỗi hệ thống.

---

## 11. Data format

Phiên bản hiện tại coi mỗi item trong Pool Sheet là **một giá trị cần append thành một row trong cột L**.

Ví dụ:

Pool:

```text
user_1
user_2
user_3
```

Lark:

```text
L201 → user_1
L202 → user_2
L203 → user_3
```

Nếu về sau Pool Sheet có thêm nhiều cột như:

```text
username | GMV | campaign | status
```

thì cần update spec vì hiện tại scope chỉ yêu cầu ghi dữ liệu vào **cột L**.

---

## 12. Scope của automation

### Có trong scope

- Chạy mỗi ngày lúc 09:00.
- Đọc data từ Pool Sheet.
- Lấy data hiện có trong pool tại thời điểm job chạy.
- Tìm dòng trống tiếp theo của cột L.
- Append data xuống cột L.
- Giữ nguyên data cũ.
- Stop nếu xảy ra lỗi.

### Không nằm trong scope

- Tự login TikTok Shop.
- Tự lấy data từ TikTok Shop.
- Tự refresh Pool Sheet.
- Xóa Pool Sheet sau khi chạy.
- Kiểm tra duplicate.
- Validate username TikTok.
- Ghi sang các cột khác ngoài L.
- Retry khi job lỗi.
- Tự chạy bù nếu user chưa chuẩn bị data trước 9h.
- Chỉnh sửa data cũ đã có trong Lark.

---

## 13. Logic tổng quát

Pseudo-flow:

```text
START JOB – 09:00 Asia/Ho_Chi_Minh

1. Connect Pool Sheet

2. Read all active data from Pool Sheet

3. If Pool is empty:
      END

4. Connect Lark Sheet:
      KOC List Official

5. Locate Column L

6. Find last occupied row in Column L

7. Determine:
      first_insert_row = last_occupied_row + 1

8. Append Pool data starting from first_insert_row

9. If success:
      END SUCCESS

10. If any error:
      STOP
      NO RETRY
```

---

## 14. Acceptance Criteria

Automation được xem là hoàn thành khi đáp ứng được các tiêu chí sau:

1. User có thể thay data trong Pool Sheet mỗi ngày mà không cần chỉnh automation.
2. Job tự động trigger lúc 09:00 theo giờ Việt Nam.
3. Toàn bộ data hiện có trong pool được đọc.
4. Data được append xuống cuối **cột L** của `KOC List Official`.
5. Data đã có trước đó trong cột L không bị ghi đè.
6. Thứ tự data trong pool được giữ nguyên khi append.
7. Pool Sheet không bị thay đổi sau khi job chạy.
8. Pool rỗng thì không ghi bất kỳ row rỗng nào.
9. Nếu có lỗi thì job dừng.
10. Job không tự retry sau khi lỗi.

---

## 15. Tóm tắt requirement cuối cùng

> Mỗi sáng user tự lấy data từ TikTok Shop và tự làm mới một Pool Sheet trước 9h. Đúng 09:00 theo giờ Việt Nam, hệ thống tự động đọc toàn bộ data hiện có trong Pool Sheet và append lần lượt xuống cuối cột L của sheet `KOC List Official` trên Lark. Hệ thống không chỉnh sửa Pool Sheet, không kiểm tra duplicate, không ghi đè dữ liệu cũ và không tự retry nếu quá trình chạy gặp lỗi.

Đây là **spec v1 đủ để dev bắt đầu triển khai**.
