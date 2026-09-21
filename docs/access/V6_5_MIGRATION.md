# Chuyển tiếp V6.5 trên bản V6.3

Đích: thư mục `nganhang-personalized-v6.3`, DB `nganhang_personalized_v63`, cổng 3003. Không sao chép dự án, không seed lại. Cổng 3001 là bản cũ, không dùng để đánh giá thay đổi này.

## Migration cộng thêm

`migration-v65-access.sql`: cờ access_managed/access_version trên users; staff_position_assignments; user_capability_overrides; revoked_at cho vị trí cũ; thời hạn/thu hồi ACL kho.

`migration-v65-compat.sql`: liên kết ngoại lệ can_approve chuyển tiếp với vị trí chuẩn để thu hồi cùng nhau. Không sửa checksum các migration đã chạy. Chạy `npm run migrate` trong backend khi cài một môi trường hiện hữu khác; không chạy seed hoặc script V4 trên DB này.

## Chuẩn hóa từng hồ sơ

1. Hồ sơ chưa chuẩn hóa đọc qua legacyAdapter: user_positions, teacher_class_assignments và metadata cũ được ánh xạ theo quyền trước chuyển đổi.
2. Mở hồ sơ, chọn năm, xem tác động. Khi lưu, ghi các vị trí chuẩn, đồng bộ chênh lệch môn × lớp, đặt access_managed=true trong cùng transaction.
3. Từ đó metadata role/subject/department cũ không hồi sinh quyền nghiệp vụ đã gỡ. Các vị trí khác năm và lịch sử thu hồi được giữ.
4. API cũ thêm/gỡ vị trí/phân công đi qua compatibility service. Không còn tạo user_positions mới từ các luồng này. Bảng cũ chưa xóa để đối chiếu.

## Parity

Chạy `node scripts/access-parity-report.js` từ backend. Kết quả: `artifacts/v6_5-access-parity.json` và `.md` đối chiếu từng nhân sự/context với mô hình V6.4.3 độc lập.

Lần kiểm trên dữ liệu thật: 10 nhân sự, 12.248 quyết định trùng và 2 khác biệt chủ đích ở chủ kho cá nhân của BGH. V6.4.3 chặn ghi toàn cục theo role; V6.5 ưu tiên chủ kho theo yêu cầu. Đây chỉ là bank.write/review, không tự cấp content.write/approve. Không có BUG hoặc NEEDS_ADMIN_REVIEW trong báo cáo này. Không tự lưu chuẩn hóa 10 hồ sơ hiện có.

## Bảo toàn và kiểm chứng

`node scripts/v65-preservation.mjs --compare` so với baseline V6.5, không dùng baseline V6.4.3 cũ vì người dùng đã làm thêm một lượt luyện trước đợt này. Baseline V6.5: 84 câu, 84 phiên bản, 3 lượt luyện, 30 item, 56 item đề; 30 Outcome và 97 YCCĐ. Script so cả checksum, không chỉ số lượng.

Kiểm thử tích hợp tạo DB riêng theo timestamp và dọn DB đó sau khi chạy. Không chèn tài khoản/câu hỏi mẫu vào DB làm việc. Giữ cơ chế snapshot, phiên bản bất biến, duyệt và chấm điểm hiện có.

Không rollback bằng xóa bảng hoặc khôi phục toàn bộ DB cũ: sẽ mất dữ liệu người dùng mới tạo. Nếu cần vô hiệu tính năng, giữ bảng và lịch sử, triển khai bản mã tương thích sau khi rà lại quyền từng hồ sơ đã chuẩn hóa.
