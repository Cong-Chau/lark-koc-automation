# AWS EC2 connect and setup runbook

Runbook này ghi lại các bước đã dùng để tạo EC2 Ubuntu server, mở network tối
thiểu, connect bằng SSH, và cài môi trường Node cho `lark-koc-automation`.

## 1. Chọn region

Trong AWS Console, chọn region gần Lark/Asia:

```text
Asia Pacific (Singapore) - ap-southeast-1
```

Tokyo cũng dùng được:

```text
Asia Pacific (Tokyo) - ap-northeast-1
```

## 2. Launch EC2 instance

Vào:

```text
EC2 -> Instances -> Launch instance
```

Thiết lập:

```text
Name: lark-koc-automation
AMI: Ubuntu Server 24.04 LTS
Architecture: 64-bit (x86)
Instance type: t3.micro
Storage: 8 GiB gp3
```

Ubuntu user mặc định:

```text
ubuntu
```

## 3. Key pair

Tạo key pair mới:

```text
Key pair name: lark-koc-key
Type: RSA
Format: .pem
```

AWS sẽ tải file `.pem` về máy. Giữ file này cẩn thận, không commit, không gửi
cho người khác.

Ví dụ file local:

```text
C:\Users\ADMIN\Downloads\lark-koc-key.pem
```

## 4. Network settings

Giữ:

```text
Auto-assign public IP: Enable
Create security group
```

Inbound rules:

```text
SSH
Port: 22
Source type: My IP
Source: <your-ip>/32
```

Nếu muốn mở dashboard cho mọi người truy cập tạm qua port 3000:

```text
Custom TCP
Port: 3000
Source type: Anywhere
Source: 0.0.0.0/0
Description: Next app public
```

Không mở SSH port 22 cho `0.0.0.0/0`.

Nếu chỉ cần cron nội bộ trên server gọi app qua `127.0.0.1`, port 3000 không
cần public. App hiện có endpoint ghi thật vào Lark, nên nếu public dashboard thì
nên thêm password/auth trước khi dùng lâu dài.

## 5. Launch và kiểm tra instance

Sau khi bấm `Launch instance`, vào instance detail và chờ:

```text
Instance state: Running
Status checks: 3/3 checks passed
```

Ghi lại public IP:

```text
Public IPv4 address: <public-ip>
```

Ví dụ:

```text
13.251.44.26
```

## 6. Connect bằng EC2 Instance Connect

Trong AWS Console:

```text
EC2 -> Instances -> chọn instance -> Connect
```

Tab:

```text
EC2 Instance Connect
```

Username:

```text
ubuntu
```

Bấm `Connect`.

Nếu báo lỗi `Error establishing SSH connection`, dùng SSH local bằng `.pem` ở
bước tiếp theo.

## 7. Connect bằng SSH local trên Windows

Mở PowerShell và chạy:

```powershell
ssh -i "C:\Users\ADMIN\Downloads\lark-koc-key.pem" ubuntu@<public-ip>
```

Ví dụ:

```powershell
ssh -i "C:\Users\ADMIN\Downloads\lark-koc-key.pem" ubuntu@13.251.44.26
```

Lần đầu SSH sẽ hỏi:

```text
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

Gõ đầy đủ:

```text
yes
```

Không gõ `y`.

## 8. Sửa permission cho file `.pem`

Nếu SSH báo:

```text
WARNING: UNPROTECTED PRIVATE KEY FILE!
Permissions for '<path>.pem' are too open.
```

Chạy:

```powershell
icacls "C:\Users\ADMIN\Downloads\lark-koc-key.pem" /inheritance:r
icacls "C:\Users\ADMIN\Downloads\lark-koc-key.pem" /grant ADMIN:R
```

Nếu shell không nhận `/grant:r`, dùng biến thể CMD style:

```cmd
icacls "C:\Users\ADMIN\Downloads\lark-koc-key.pem" /inheritance:r
icacls "C:\Users\ADMIN\Downloads\lark-koc-key.pem" /grant ADMIN:R
```

Sau đó SSH lại:

```powershell
ssh -i "C:\Users\ADMIN\Downloads\lark-koc-key.pem" ubuntu@<public-ip>
```

## 9. Cài Node, pnpm, pm2

Sau khi vào được terminal Ubuntu trên EC2, chạy:

```bash
sudo apt update
sudo apt install -y git curl build-essential
```

Cài Node.js 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Cài pnpm và pm2:

```bash
sudo corepack enable
corepack prepare pnpm@10.33.0 --activate
sudo npm install -g pm2
```

Kiểm tra:

```bash
node -v
npm -v
pnpm -v
pm2 -v
```

## 10. Bước tiếp theo

Sau khi server có Node/pnpm/pm2:

1. Clone repository.
2. Checkout branch production cần chạy.
3. Tạo `.env.local` trên server.
4. Chạy `pnpm install`.
5. Chạy `pnpm run build`.
6. Start app bằng `pm2`.
7. Cấp quyền chạy cho script append chính xác theo millisecond:

```bash
chmod +x /home/ubuntu/lark-koc-automation/scripts/append-at-target-time.sh
```

8. Cấu hình cron local để gọi:

```text
08:58 -> POST http://127.0.0.1:3000/api/prepare-koc
08:59 -> run append script, wait until 08:59:59.650, then POST http://127.0.0.1:3000/api/append-koc
```

Crontab mẫu:

```text
CRON_TZ=Asia/Ho_Chi_Minh
TZ=Asia/Ho_Chi_Minh
58 8 * * * date '+\%Y-\%m-\%d \%H:\%M:\%S prepare-09' >> /home/ubuntu/lark-koc-cron.log 2>&1; curl -sS -w '\nHTTP_STATUS=\%{http_code}\n' -X POST http://127.0.0.1:3000/api/prepare-koc >> /home/ubuntu/lark-koc-cron.log 2>&1
59 8 * * * /home/ubuntu/lark-koc-automation/scripts/append-at-target-time.sh 08:59:59.650
```

## 11. Prepared job cache trên EC2

Runtime hiện tại không cần Upstash Redis. Prepared payload được lưu vào file
local trên cùng EC2 instance.

Trong `.env.local`, giữ hoặc thêm:

```env
PREPARED_JOB_MAX_AGE_SECONDS=600
PREPARED_JOB_FILE_PATH=.runtime/prepared-job.json
```

Nếu `.env.local` còn 2 biến cũ này thì có thể xóa:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

App tự tạo thư mục `.runtime` khi job chuẩn bị chạy. `.runtime/` đã được ignore
khỏi Git.

## 12. Bật email notification sau khi append thành công

Tạo Gmail App Password trong Google Account rồi thêm các biến này vào
`.env.local` trên EC2:

```env
# Email notification
EMAIL_ENABLED=true
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=465
EMAIL_SMTP_SECURE=true
EMAIL_SMTP_USER=congchau206@gmail.com
EMAIL_SMTP_PASSWORD=<gmail-app-password>
EMAIL_FROM=congchau206@gmail.com
EMAIL_TO=congchau206@gmail.com
```

Không paste App Password vào chat hoặc commit vào Git.

Sau khi sửa `.env.local`, rebuild và restart app:

```bash
pnpm install
NODE_OPTIONS="--max-old-space-size=2560" pnpm run build
pm2 restart lark-koc --update-env
pm2 save
```

Kiểm tra app còn chạy:

```bash
pm2 status
curl http://127.0.0.1:3000
```

Email chỉ gửi sau khi job `/api/append-koc` ghi thành công vào Lark. Nếu SMTP lỗi,
job vẫn giữ kết quả ghi thành công và dashboard sẽ có event `email_failed`.
