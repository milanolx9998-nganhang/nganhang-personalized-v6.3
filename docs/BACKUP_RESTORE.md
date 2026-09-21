## Nâng cấp V5 và diễn tập mới

Chạy node scripts/backup.mjs từ root V5 (đã chuẩn hóa uploads tương đối backend), hoặc từ backend như cũ. PostgreSQL dump và fingerprint dùng cùng exported snapshot của transaction read-only; manifest chứa số dòng/hash 8 bảng quan trọng. status.json ghi lần thành công, dung lượng, trạng thái lỗi; copy remote đối chiếu hash nhưng luôn để off_device_verified=false cho tới khi IT xác nhận thiết bị.

Restore vào DB MỚI nganhang_restore_*; từ chối DB có sẵn, kiểm tra checksum trước khôi phục. So sánh lại users/questions/question_versions/attempts/attempt_items/mastery_events/mastery_states/class_memberships. Media chỉ được giải nén vào thư mục mới, chặn đường dẫn vượt đích và link. Không xóa/ghi đè DB đang dùng.

Diễn tập V5 cuối: nganhang_restore_v5_final_20260913; artifacts/v5-restore.log và v5-integrity-report.json. 8 bảng khớp fingerprint; 81 tệp uploads đối chiếu SHA256 khớp. Có tệp nhập thử từ các lần kiểm thử cũ trong uploads bản sao; bộ integration mới đã tách cả uploads vào artifacts/integration-uploads-* để không ghi thêm vào uploads làm việc. Không xóa tệp cũ không được yêu cầu.

Khi mất máy: ngừng ghi trên instance lỗi; lấy backup khác thiết bị và secrets lưu riêng; dựng máy dự phòng; xác minh hash; restore vào DB/thư mục mới; chạy migration đúng release; cấu hình instance riêng; thử đăng nhập/quyền/luyện/hồ sơ/ảnh; đối chiếu số liệu rồi mới chuyển DNS. Không xóa bản cũ trước khi nghiệm thu.

Giới hạn: diễn tập hiện cùng máy, không mô phỏng mất ổ; chưa có bản off-device. Fingerprint dùng tổng hợp nội dung 8 bảng, phù hợp dữ liệu pilot hiện tại; với DB lớn cần đánh giá bộ nhớ/thời gian và chuyển sang hashing streaming trước vận hành quy mô lớn. Không đặt BACKUP_REMOTE_DIR bên trong thư mục backup nguồn.

---

# Sao lưu và khôi phục

Backup phát triển ban đầu: backups/v4-before-upgrade.dump cùng clone-verification.json. Database gốc nganhang_v4 không dùng cho chạy thử V1.

Trong backend: node ../scripts/backup.mjs. Lệnh lưu pg_dump custom, uploads.tar.gz, manifest SHA-256. Không lưu .env; lưu secrets tách trong password manager. Backup chứa dữ liệu cá nhân và password hash: hạn chế quyền truy cập, mã hóa ổ lưu hoặc dùng hệ thống backup mã hóa của trường.

Chế độ --daemon chạy mỗi ngày UTC, thử lại sau 1 giờ nếu lỗi. Giữ đại diện 14 ngày gần nhất, thêm đại diện 8 tuần và 6 tháng. Chỉ xóa thư mục có tên do script sinh và manifest trong đúng BACKUP_DIR. Theo dõi log backup_failed; không coi container chạy là backup đã tốt.

Đặt BACKUP_REMOTE_DIR tới ổ/mount khác thiết bị. Docker cần thêm mount đích tương ứng. Khi chưa cấu hình, chỉ có bản lưu cùng máy, chưa đáp ứng disaster recovery production. Chưa thiết lập đích offsite vì chưa có thiết bị/credential của IT.

Khôi phục an toàn: node ../scripts/restore.mjs DUONG_DAN_BAN_LUU nganhang_restore_TEN_MOI. Chỉ cho tạo DB mới đúng tiền tố và từ chối ghi đè DB có sẵn. Script kiểm tra hash trước restore rồi đối chiếu số câu/version/attempt. Script cũng khôi phục media vào thư mục mới trong bản lưu; chỉ nhận file/thư mục thường, chặn link và đường dẫn vượt đích, không ghi đè uploads đang dùng. Sau khi kiểm chứng mới đổi cấu hình instance sang bản phục hồi.

Đã thử restore local ngày 11/09/2026: nganhang_restore_full_verified_20260911 có 84 câu, 84 version, 0 attempt (đúng bản dữ liệu làm việc chưa có HS thật). Đã phục hồi thêm 15 tệp media/nguồn nhập vào thư mục mới, từ backups/2026-09-11T06-56-51-750Z. Bản này không phải DB gốc. Cần diễn tập lại đầy đủ DB + media + secrets trên máy dự phòng của trường.
