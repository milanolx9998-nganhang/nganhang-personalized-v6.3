# Quy trình hai host — V6.5.3

School Windows/local là chính. Home Ubuntu/Supabase là staging. Cloud chỉ thử tùy chọn sau parity Home đạt. Mỗi nơi có DB, Storage, JWT, DB password, volume và backup riêng.

## Release bất biến

1. Trong source chạy npm run package:release. Lệnh build, security/integration gate, tạo manifest và quét ZIP loại .env, secret, DB, uploads, artifacts, node_modules.
2. Lưu SHA256 ZIP ngoài kênh chuyển ZIP. Repository hiện nằm dưới Git root rộng hơn dự án nên không tạo tag/commit ở thư mục người dùng; manifest/checksum là bằng chứng freeze cục bộ.
3. Chuyển ZIP sạch đến Home, xác minh hash trước giải nén vào thư mục release mới. Không giải nén ghi đè thư mục runtime đang dùng.
4. Cài dependency lockfile bằng npm ci trong backend; tạo deploy/.env.home riêng, chmod 600. Đặt RELEASE_ZIP và VERIFIED_RELEASE_SHA256 cùng SUPABASE_HOME_DIR/HOME_BACKUP_DIR.
5. Từ release mới chạy bash scripts/home-update.sh: kiểm tra ZIP + manifest + source, backup Home, build/migrate/start/health. Tên compose project cố định giữ volume Home; đây là cập nhật có maintenance, không blue/green không downtime.
6. UAT Home, security negatives, schema parity, backup/restore, tải đồng thời và HTTPS phải đạt trước School. Script health không tự chứng nhận UAT.
7. Backup School và triển khai cùng ZIP đã duyệt theo School runbook. Không mang DB Home sang School.

## Schema parity

Chạy node scripts/schema-parity.mjs với PARITY_LOCAL_DATABASE_URL và PARITY_TEST_DATABASE_URL qua môi trường bảo mật. So sánh bảng/cột/index/constraint/trigger/function public; không so schema auth/storage/realtime/extensions. Script chỉ đọc và từ chối cùng endpoint/database. Báo cáo ở artifacts/v653-schema-parity.json. Xem từng khác biệt; không tự xóa hoặc sửa schema để làm xanh báo cáo.

## Rollback và gates

Giữ release trước và backup đã restore thử. Rollback code chỉ khi schema tương thích ngược. Nếu cần phục hồi DB thì bảo toàn ghi phát sinh, chốt thời điểm phục hồi và thực hiện maintenance có chủ đích; không tự down migration hoặc restore đè.

Các mục chưa có bằng chứng thực tế: Docker compose runtime, Home Supabase/Storage, parity hai provider, HTTPS/certificate, remote access, load Home và restore đầy đủ. Không đánh dấu D4–D12 hoàn thành chỉ từ unit test local.
