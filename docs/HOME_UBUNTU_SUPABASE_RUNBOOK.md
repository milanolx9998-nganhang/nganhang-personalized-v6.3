# Home Ubuntu — Supabase staging độc lập

Chưa triển khai thực tế trên Ubuntu trong phiên này: máy hiện tại không có Docker/Caddy và chưa có đích Ubuntu/SSH hoặc cấu hình Supabase. Các lệnh dưới đây là runbook, không phải kết quả nghiệm thu.

## Điều kiện và nguồn

Ubuntu có Docker Engine + Compose hỗ trợ !reset, Node 22, Bash, đủ dung lượng cho DB/Storage/backup, LAN/VPN riêng. Cài theo nguồn chính thức; không chạy installer không kiểm tra.

Sử dụng [Supabase self-host Docker](https://supabase.com/docs/guides/self-hosting/docker), pin tag self-hosted/v0.8.1 thay vì main/latest. Docker Compose upstream phải được đọc và rà trước khi chạy. Không đưa .env upstream vào release.

## Provision

1. Lấy mã Supabase tag trên vào thư mục riêng. SUPABASE_HOME_DIR trỏ tuyệt đối đến thư mục docker có docker-compose.yml và .env.
2. Tạo secret Home mới độc lập School. Điền cấu hình upstream theo tài liệu, tắt thông tin mặc định. Không in .env hoặc docker compose config có secret ra log.
3. Giải nén clean release vào thư mục mới. Tạo deploy/.env.home từ example, chmod 600. DATABASE_URL trỏ DB Home trên service db, không dùng DB School. SUPABASE_URL dùng api-gw nội bộ. JWT_SECRET chỉ dành app, không lấy service-role key.
4. Đặt HOME_BACKUP_DIR là đường dẫn riêng ngoài release. Không dùng /, HOME hay thư mục dự án để dọn recursive.
5. Chạy bash scripts/home-start.sh. Script kiểm tra compose, khởi động stack riêng, build app, validate profile, migration, khóa truy cập public và tạo/kiểm tra ba bucket private trước health.
6. Caddy chỉ publish 80/443. Override bỏ publish gateway và pooler; Realtime/Functions là optional. Studio có thể chạy do dependency upstream nhưng không publish. Kiểm tra thực tế docker compose ps và cổng host trước nghiệm thu.
7. Cài trust CA nội bộ Caddy cho máy thử nghiệm bằng kênh quản trị tin cậy; không tắt xác minh TLS.

## Kiểm tra

bash scripts/home-status.sh; mở domain HTTPS Home. Banner phải hiển thị môi trường thử nghiệm, không nhập dữ liệu thật. Đăng nhập dùng auth Express hiện hữu, không Supabase Auth và không gọi DB/Storage trực tiếp từ frontend.

Chạy schema-parity bằng hai URL DB qua biến môi trường bảo mật, rồi UAT/security/load/restore thật. Test adapter dùng stub không thay thế kiểm tra Storage API thật. Không copy School .env, DB thật hoặc tệp cá nhân lên Home.

Ngừng dịch vụ: bash scripts/home-stop.sh. Script không xóa volume. Cần loại bỏ môi trường phải kiểm kê target và có quyết định riêng.
