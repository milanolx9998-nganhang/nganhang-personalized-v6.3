# V6.5.1 — kiểm tra đầu vào và chốt phạm vi H0

Ngày 17/09/2026. Đã đọc toàn bộ `V6_5_1_MASTER_FULL_PERMISSION_SECURITY_IMPLEMENTATION_PROMPT.md` (26.236 byte). Tài liệu mới thay thế các quy tắc V6.5 mâu thuẫn. Thực hiện trên thư mục V6.3 hiện hành, không nhân bản.

## Bằng chứng đọc trực tiếp

- Archive `nganhang-personalized-v6.3.rar` có entry `nganhang-personalized-v6.3/backend/.env`. Chỉ liệt kê entry, không xuất nội dung secret.
- DB hiện hành `nganhang_personalized_v63` dùng role `nganhang` tại PostgreSQL local 5432.
- V1 và V5 dùng cùng máy chủ, cùng DB role, cùng mật khẩu DB và cùng JWT secret với V6.3. Báo cáo chỉ lưu kết quả so sánh boolean, không lưu giá trị bí mật.
- Role hiện tại không có superuser/CREATEROLE; không thể tự tạo tài khoản DB riêng bằng quyền hiện có.
- Chưa xác định archive đã được chia sẻ hay chưa; xử lý như credential có nguy cơ lộ theo yêu cầu mới.

## Điểm cần mở rộng quyền thao tác

H0 yêu cầu đổi mật khẩu DB, đổi JWT, thu hồi phiên, restart và chứng minh token cũ bị từ chối. Đổi mật khẩu role dùng chung chỉ tại V6.3 sẽ làm V1/V5 mất kết nối. Cập nhật đồng bộ các bản khác vượt phạm vi “sửa trực tiếp trên bản hiện tại”. Không tự thực hiện thay đổi đó.

Cần một trong hai điều kiện:

1. Cho phép đổi credential dùng chung và cập nhật đồng bộ các ứng dụng sử dụng role đó; kiểm kê đầy đủ consumer trước khi đổi.
2. Có tài khoản PostgreSQL quản trị để tách role/credential của dự án, đồng thời có phương án thu hồi credential chung đã nằm trong archive. Tách role riêng không tự giải quyết việc credential cũ còn hiệu lực.

Chưa thay secret, token_version, dữ liệu nghiệp vụ hoặc dừng dịch vụ; chưa triển khai H1–H8 do master yêu cầu thứ tự H0 trước. Không tuyên bố V6.5.1 hoàn tất hoặc sẵn sàng pilot.

Đã thêm kiểm tra tái chạy: `backend/scripts/v651-security-preflight.mjs`. Bằng chứng: `artifacts/v651-secret-preflight.json`. Không xóa archive hay các bản cũ.
