# Canvas V1

Giáo viên tạo assignment → sao chép link /practice/shared/TOKEN → đưa vào Canvas bằng External URL. Học sinh đăng nhập tài khoản ứng dụng; server kiểm tra đối tượng được giao. Không có đăng nhập công khai bằng token link.

Iframe tùy chọn: cấu hình CANVAS_ORIGINS bằng origin HTTPS cụ thể; ứng dụng dùng CSP frame-ancestors. Không dùng wildcard. External URL/new tab là đường vào đơn giản nhất khi chính sách iframe/cookie của trình duyệt gây hạn chế.

QTI xuất phục vụ chuyển ngân hàng/bộ đề. ĐS bốn ý xuất thành bốn item; tự luận để LMS/giáo viên xử lý, không có chấm AI. Tệp tải QTI có đáp án, chỉ giáo viên có quyền được tải.

LTI và đồng bộ điểm Canvas đang tắt; không gọi endpoint giả, không ghi điểm vào Canvas. Cần Canvas thật và quyền course để xác nhận import/iframe production. Chưa thực hiện thao tác ghi lên LMS trong đợt triển khai local này.
