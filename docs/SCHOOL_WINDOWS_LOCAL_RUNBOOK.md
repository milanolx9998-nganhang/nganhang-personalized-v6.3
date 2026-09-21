# School Windows — Local LAN, V6.5.3

Trạng thái: ứng dụng hiện tại vẫn dùng PostgreSQL + kho tệp local. Đây là hệ thống chính; không trỏ sang Home khi mạng mất. Không đồng bộ DB tự động.

## Chạy và kiểm tra

- Thư mục hiện tại: nganhang-personalized-v6.3. Không sửa các thư mục V1/V5 lưu trữ.
- Cấu hình riêng backend/.env; APP_PROFILE=local-lan, DATABASE_PROVIDER=postgres, STORAGE_PROVIDER=local. Không đưa .env vào ZIP hoặc Git.
- Chạy scripts/start-local.ps1; kiểm tra scripts/status-all.ps1. Cổng loopback mặc định 3003 phục vụ kiểm tra development.
- scripts/stop-local.ps1 chỉ dừng PID có project và thời điểm tạo khớp. Bản ghi PID cũ thiếu thời điểm tạo sẽ bị từ chối; kiểm tra command line, cổng và nguồn trước khi thay thế.
- LAN production phải dùng NODE_ENV=production, domain HTTPS qua Caddy, cookie Secure và TRUST_PROXY tương ứng đúng một reverse proxy. Không mở Node, PostgreSQL, Studio ra LAN/Internet.
- Dùng compose.yaml cho deployment có Docker; dữ liệu School dùng volume riêng, không dùng compose.home.yaml.

## Sao lưu và cập nhật

Chạy scripts/backup-all.ps1 (chỉ backup local; Home có script riêng). Kiểm tra manifest, checksum và thử restore vào DB mới trước một thay đổi có nguy cơ mất dữ liệu. Secret sao lưu riêng bằng cơ chế mã hóa, không gộp cùng release.

Chỉ nhận ZIP đã qua security gate và release scan. Kiểm tra SHA256, RELEASE_MANIFEST.json, migrations, build. UAT Home đạt trước khi đưa cùng release lên School. Backup School ngay trước migration. Không chạy seed, không ghi đè DB/uploads bằng dữ liệu Home, không dùng docker compose down -v.

DB password, JWT/session secret và Supabase service key là ba loại độc lập. Không lặp lại việc rotate của V6.5.2 khi không có sự cố mới. Khi đổi JWT, các phiên cũ cần đăng nhập lại; việc này không xác minh DB password.

## Nghiệm thu

Đăng nhập Admin/GV/HS; chọn bài/YCCĐ; làm và nộp bài; kiểm tra đáp án đúng chính sách; tạo/sửa/khóa/reset nhân sự trong phạm vi; ghi audit; từ chối ngoài phạm vi; tải ảnh/tệp có authorization; ngắt Internet nhưng giữ LAN và kiểm tra lại.

Kết quả test local không phải bằng chứng Supabase/HTTPS trên máy khác đã đạt.
