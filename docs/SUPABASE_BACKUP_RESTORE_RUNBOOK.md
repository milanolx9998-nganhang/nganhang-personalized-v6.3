# Backup và restore Home Supabase

Database và object bytes phải cùng được sao lưu. Backup DB không chứa nội dung Storage. Release không phải backup dữ liệu.

## Backup

Đặt SUPABASE_HOME_DIR, HOME_BACKUP_DIR tuyệt đối; chạy bash scripts/home-backup.sh. Script tạm dừng app Home để giảm ghi đồng thời, pg_dump từ container cùng phiên bản PostgreSQL, kiểm tra danh mục dump, nén volumes/storage và tạo SHA256SUMS. App Home được khởi động lại qua trap. School không bị chạm.

Điều kiện nhất quán: không có writer ngoài Express trong cửa sổ backup (Studio, REST, tác vụ quản trị phải dừng ghi). Bản dump dùng --no-owner; không chứa role password. Sao lưu cấu hình/secret và role mapping bằng kênh mã hóa riêng.

Chưa có off-host tự động, retention tự động hoặc lịch backup trong script. Chuyển backup đã kiểm checksum sang nơi mã hóa ngoài host, hạn chế ACL và diễn tập khôi phục; không coi backup cùng ổ là bảo vệ đầy đủ.

## Restore thử

RESTORE_BACKUP_DIR trỏ backup; chạy bash scripts/home-restore-test.sh. Script kiểm tra checksum, tạo DB tên mới, restore không owner/privilege, kiểm tra bảng questions và khả năng đọc archive Storage. DB test được giữ để kiểm tra; không xóa DB/volume hiện hành.

Đây mới là diễn tập DB + archive, chưa là phục hồi đầy đủ stack. Khôi phục đầy đủ cần môi trường Supabase cô lập có cùng migrations/extensions/roles, Storage volume mới, cấu hình Storage trỏ DB đã restore và credentials riêng. Sau đó kiểm tra quyền, metadata/object mapping, ảnh, import gốc, export, 403 và UAT app. Không chỉ sửa DATABASE_URL của Express trong khi Storage vẫn dùng DB cũ.

Ghi thời gian backup/restore, checksum, số bản ghi, tệp mẫu và RPO/RTO đo được. Nếu restore không đạt, giữ bản hiện hành và điều tra; không tự rollback dữ liệu bằng migration ngược.
