# GitHub Actions EC2 deploy runbook

Workflow `.github/workflows/deploy-ec2.yml` tự deploy production khi `main` có
commit mới, ví dụ sau khi merge pull request từ nhánh feature.

Workflow chỉ deploy code. Các biến `.env.local` của app vẫn được cấu hình thủ
công trên EC2.

## GitHub repository secrets

Vào GitHub repository:

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

Tạo 4 secret:

```text
AWS_EC2_HOST=13.251.44.26
AWS_EC2_USER=ubuntu
AWS_EC2_APP_DIR=/home/ubuntu/lark-koc-automation
AWS_EC2_SSH_KEY=<nội dung file lark-koc-key.pem>
```

`AWS_EC2_SSH_KEY` là toàn bộ nội dung file `.pem`, gồm cả dòng:

```text
-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----
```

Không đưa `.env.local`, Google private key, Lark app secret, Gmail app password
hoặc file `.pem` vào Git.

## EC2 requirement

Trên EC2 cần có sẵn:

- repository tại `/home/ubuntu/lark-koc-automation`;
- file `.env.local` đúng production env;
- Node.js, pnpm, pm2;
- PM2 process tên `lark-koc`;
- security group cho phép GitHub-hosted runner SSH tới port `22`.

Nếu security group đang giới hạn SSH theo `My IP`, GitHub Actions sẽ không SSH
được. Khi đó có 2 lựa chọn:

1. Tạm mở SSH `0.0.0.0/0` và giữ private key an toàn trong GitHub Secrets.
2. Dùng self-hosted runner hoặc một IP cố định riêng cho deploy.

Với setup nhỏ hiện tại, cách 1 là đơn giản nhất nhưng cần hiểu là port SSH mở
rộng hơn trước.

## Deploy flow

Khi `main` có push mới, workflow sẽ SSH vào EC2 và chạy:

```bash
cd /home/ubuntu/lark-koc-automation
git fetch origin main
git switch main || git switch -c main --track origin/main
git pull --ff-only origin main
pnpm install --frozen-lockfile
NODE_OPTIONS="--max-old-space-size=2560" pnpm run build
pm2 restart lark-koc --update-env
pm2 save
curl -fsS http://127.0.0.1:3000 >/dev/null
```

Nếu server có tracked file bị sửa thủ công, `git pull --ff-only` hoặc
`git switch main` sẽ fail thay vì ghi đè. `.env.local` và `.runtime/` không bị
ảnh hưởng vì đã được ignore.

## Manual run

Có thể chạy thủ công từ GitHub:

```text
Actions -> Deploy EC2 -> Run workflow
```
