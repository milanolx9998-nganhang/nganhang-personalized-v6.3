## Trạng thái V5 — chưa nghiệm thu hạ tầng production

Đã chạy Windows Node/PostgreSQL local ở 127.0.0.1:3002. Máy làm việc hiện không có docker/podman trong PATH; chưa chạy Ubuntu, Docker build/boot, Caddy TLS, domain hay restart/persistence trên máy trường. Không dùng kiểm thử local làm bằng chứng HTTPS/production.

Compose V5 có namespace riêng, DB nganhang_personalized_v5, volumes PostgreSQL/uploads/backups/Caddy; chỉ proxy công khai 80/443, không công khai 5432. Cổng app trong container vẫn 3001 (khác cổng demo Windows 3002). Cả bốn dịch vụ có log rotation 10 MB × 5. Backup daemon thử mỗi giờ và tạo một bản thành công mỗi ngày UTC.

Trước pilot thật, IT cần: Ubuntu + Docker/Compose; domain/DNS/TLS; secrets mới (không dùng admin/demo/JWT bản sao); quyền lớp+môn đã duyệt; volume media; đích backup KHÁC thiết bị; kiểm thử import/luyện/nộp/hồ sơ/xuất, restart app/db, restore ở máy dự phòng. Không chạy seed cũ lên dữ liệu thật.

Đóng gói tại root: npm run build rồi npm run package:release. Gói releases/*.zip có RELEASE_MANIFEST.json ghi version/ngày/git nếu có/hash migration/hash build/hash từng file; không kèm .env thật, node_modules, uploads, backups, artifacts hay test DB. Cài dependencies và cấu hình secrets riêng. Manifest không phải chữ ký số.

Vận hành: npm run pilot:monitor với PILOT_ORIGIN và PILOT_ADMIN_TOKEN cấp riêng. Khôi phục theo BACKUP_RESTORE.md. IT cấu hình lịch monitor/cảnh báo thật và mount off-device vào container backup rồi đặt BACKUP_REMOTE_DIR; chưa có mount này mặc định. Kết quả copy+hash KHÔNG tự chứng minh khác thiết bị.

---

# Triển khai Ubuntu / self-host

Trạng thái kiểm chứng: bản Windows local đã chạy, migrate và health; Docker build/boot và domain HTTPS CHƯA được chạy do máy này không có Docker engine. Không coi checklist production đã đạt.

1. IT chuẩn bị Ubuntu, Docker Engine và Compose plugin, domain trỏ máy chủ, cổng 80/443 hoặc phương án tunnel riêng được trường duyệt. Không mở cổng PostgreSQL 5432 ra mạng.
2. Sao chép mã nguồn, không sao chép node_modules. Copy .env.production.example thành .env.production; đặt DOMAIN và hai secret ngẫu nhiên khác nhau. Không dùng các giá trị REPLACE. Giữ file quyền đọc riêng cho quản trị.
3. Chạy: docker compose --env-file .env.production up -d --build.
4. Kiểm tra: docker compose --env-file .env.production ps; curl https://TEN-MIEN/api/health. DB/app cần healthy. Kiểm tra proxy, đăng nhập, import Word có ảnh, một lượt luyện và tải PDF trên chính máy đích.
5. Migration chạy trước backend với advisory lock/checksum. Trước nâng cấp, chạy backup và kiểm tra bản lưu. Không chạy seed.js cũ trên DB thật vì có tài khoản mẫu.

Compose gồm PostgreSQL 16, app/build frontend, Caddy HTTPS và worker backup hằng ngày. Persistent volumes tách DB/media/backup/chứng thư. Chỉ proxy publish 80/443. Chromium xuất PDF ở tiến trình cô lập, không truy cập mạng trong khi render. Node image và browser được khóa bởi package-lock; IT nên pin thêm digest image đã smoke-test cho đợt phát hành của trường.

Bản cài trống: dùng scripts/bootstrap-admin.mjs để tạo admin riêng, rồi nhập cấu trúc/câu nguồn; hoặc restore backup V4 vào DB mới trước migrate. Không public khi còn tài khoản mật khẩu mẫu. DB role production nên tách quyền migration khỏi quyền vận hành sau khi xác nhận migration.

DEMO Supabase: backend nhận DATABASE_URL PostgreSQL, cùng bộ migration, JWT và media nội bộ; không cần chuyển auth sang Supabase. Dùng URL và TLS theo nhà cung cấp, chỉ ở server, không nhúng frontend. Cần secrets/project Supabase thật để kiểm chứng cloud. Media local phải gắn persistent volume.
