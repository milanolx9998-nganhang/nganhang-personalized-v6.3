## Định nghĩa V5

- Kích hoạt: tài khoản học sinh có last_login.
- Đã bắt đầu: có attempt; hoàn thành: status=completed.
- Câu đã trả lời: câu có response thực chất trong lượt hoàn thành, không dùng NOT skipped làm đại diện.
- Ngày hoạt động và quay lại: chỉ ngày có lượt hoàn thành, múi giờ Asia/Ho_Chi_Minh. Quay lại = ít nhất hai ngày khác nhau, KHÔNG phải retention 7 ngày.
- HS cải thiện: có ít nhất một nhóm chuyên đề–mức với ≥2 mốc, điểm thành thạo cuối cao hơn đầu và confidence MEDIUM/HIGH. Không suy diễn tác động nhân quả.
- Retention 7 ngày chưa triển khai cohort đủ thời gian; API trả null kèm lý do, không hiển thị tỷ lệ giả.
- Ops: uptime, RSS/cpu của tiến trình app, kết nối database, dung lượng đĩa còn, tuổi bản backup, lỗi HTTP tổng hợp từ lần khởi động. Không lưu body, câu trả lời hay mật khẩu vào số liệu vận hành.

GET /api/practice/metrics và /operations chỉ admin. npm run pilot:monitor đọc health/operations, ghi artifacts/v5-monitor.json, exit 2 khi backup thiếu/quá 26 giờ, backup lỗi, đĩa dưới 10% hoặc health lỗi. PILOT_ADMIN_TOKEN cấp riêng trong môi trường, không ghi token vào tài liệu/lệnh lịch sử. Script chạy một lần; việc hẹn kiểm tra/gửi cảnh báo trên máy thật do IT cấu hình.

Tải local dùng npm run pilot:load sau test:integration: tạo DB nganhang_load_test_* và tài khoản riêng, chỉ cổng loopback 3102; không nhận URL production. Mỗi phiên login → tạo 20 câu → mở → lưu 20 đáp án → nộp → hồ sơ. 30/50/100 là burst không thời gian suy nghĩ. Bỏ giới hạn login chỉ trên tiến trình test loopback để đo tải đồng loạt; production giữ giới hạn. Đọc riêng p95 login, không chỉ p95 gộp. RSS/CPU là app, không phải tổng RAM/CPU PostgreSQL của hệ thống.

---

# Chỉ số Pilot

Đo số HS kích hoạt, HS bắt đầu luyện, lượt bắt đầu/hoàn thành, câu trả lời/câu khác nhau, số ngày hoạt động, HS quay lại ít nhất hai ngày, nguồn self_practice/teacher_assigned/retry, phân bố Confidence. Completion rate = completed/started; trung bình lượt = completed/HS có attempt; return rate = returning/HS có attempt. Khi mẫu số 0 hiển thị chưa có dữ liệu.

Mastery change lấy chênh lệch theo lịch sử nhóm chuyên đề–mức; dùng mô tả tiến bộ quan sát được, không khẳng định hệ thống gây ra hiệu quả học tập. Dashboard lớp phân biệt chưa luyện, Mastery thấp, Confidence thấp và xu hướng giảm. Bộ lọc ngày áp dụng hoạt động trong kỳ; Mastery hiển thị trạng thái tích lũy để tránh biến dữ liệu thiếu thành suy giảm.

Pilot ưu tiên nhóm môn/lớp do nhà trường chọn. Chỉ công bố ngân hàng có người duyệt; không tự sinh nội dung môn học chưa có nguồn. Kiểm tra tuần đầu: tỷ lệ quay lại, lỗi import, thiếu câu từng mức, thời gian phản hồi, số bản backup hợp lệ. Không dùng page view làm KPI chính.
