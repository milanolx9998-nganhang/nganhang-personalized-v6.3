# Vị trí và phạm vi mặc định

| Vị trí | Phạm vi | Quyền chính | Không được tự suy ra |
|---|---|---|---|
| Giáo viên bộ môn | Môn, lớp riêng cho từng môn, năm học | Biên soạn/xuất nội dung môn; giao bài và xem học tập đúng môn × lớp | Sửa tài khoản HS, reset, duyệt, xem các môn khác của lớp |
| Giáo viên chủ nhiệm | Một hoặc nhiều lớp, năm học | Xem học tập mọi môn trong lớp; sửa thông tin cơ bản và reset HS | Biên soạn mọi môn, chuyển lớp, khóa tài khoản |
| Tổ trưởng | Tổ chuyên môn | Nội dung/duyệt/ma trận và học tập các môn trong tổ | Quản lý nhân sự, reset tài khoản toàn trường |
| Khối trưởng | Khối | Xem học tập/học sinh của khối | Sửa hoặc duyệt nội dung, quản lý tài khoản |
| Ban giám hiệu | Toàn trường hoặc cấp/khối/tổ/lớp/kết hợp chọn rõ | Chỉ đọc trong phạm vi, phân tích | Duyệt nội dung mặc định hoặc tự mở toàn trường khi để trống |
| Người xem | Phạm vi chọn rõ | Chỉ đọc trong phạm vi | Cấm tuyệt đối ghi nếu đã có ALLOW hợp lệ |
| Quản trị hệ thống | Toàn hệ thống | Toàn quyền quản trị | Không phải một chức danh chuyên môn để chọn trong form thông thường |

## Ví dụ kiêm nhiệm

GVCN 7A + dạy Vật lí 8A: xem mọi môn của 7A, chỉ Vật lí của 8A, biên soạn nội dung Vật lí. Gỡ GVCN không làm mất quyền dạy Vật lí. Gỡ lớp 8A nhưng giữ môn Vật lí thì vẫn biên soạn Vật lí, không còn quyền học tập 8A.

BGH THCS + ALLOW duyệt tổ KHCN + DENY Hóa khối 9: đọc THCS, được duyệt phạm vi tổ đã cấp trừ Hóa 9. Không tự có quyền ghi môn Toán hoặc đọc THPT. ALLOW nhạy cảm phải xác nhận; DENY và thu hồi đều có lý do.

Một người có thể nhận nhiều dòng cùng chức danh với phạm vi/thời hạn khác nhau. Giao diện giữ riêng từng dòng, không âm thầm gộp hoặc bỏ dòng khi lưu. Các ngày hết hạn vẫn được giữ trong lịch sử.

Các quyền chính xác nằm ở catalog; bảng trên giải thích nghiệp vụ, không phải nguồn kiểm quyền thứ hai.
