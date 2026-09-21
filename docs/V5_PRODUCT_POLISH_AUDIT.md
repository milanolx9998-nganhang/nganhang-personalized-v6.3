# Kiểm toán trước chỉnh sửa V5 — 13/09/2026

Phạm vi: chỉ nganhang-personalized-v5, DB nganhang_personalized_v5, cổng 3002. Giữ bản V4 và bản gốc. Bản sao đã đối chiếu 40 bảng và hash; bản sao lưu ở backups/v4-baseline.

Nền hiện tại: React/Vite, Express/PostgreSQL, 8 migration. Kiểm thử nền 8 ma trận + 33 đơn vị + 32 tích hợp đạt; build 839,92 kB JS, gzip 246,81 kB. Log artifacts/v5-baseline-*. Không sửa migration đã chạy.

## Khoảng trống đã đọc từ mã

- Trang nhân sự lặp lại các nhóm sidebar; chưa có danh sách việc cần chú ý.
- Trang học sinh đặt KPI và nhiều CTA ngang hàng; bài đang dở cần ưu tiên.
- LOW vẫn có tiêu đề phần trăm và có thể mang nhãn cần củng cố; số câu trong lượt luyện đang gọi sai là câu đã luyện.
- Lịch sử dùng cố định 20/trang cả điện thoại; tab hẹp chưa có lựa chọn phù hợp.
- App import toàn bộ màn hình ngay đầu; shared kéo Markdown/KaTeX và bộ cấu hình vào trang học sinh.
- Quyền lớp/môn có sẵn qua teacher_class_assignments cho cả vai trò xem; không được suy rộng toàn trường.
- Backup/restore local có sẵn; chưa kiểm chứng off-device và Ubuntu/HTTPS thật.

## Quyết định

Giữ nguyên chọn câu, tick bài/YCCĐ, phiên bản bất biến, chấm, autosave, Mastery và xác nhận nộp. Tách read-model/hiển thị; LOW luôn “Chưa đủ dữ liệu”. Dùng quyền lớp+môn đã cấp tường minh, không thêm mô hình tổ chức giả định. Tách route tải chậm, kiểm tra network học sinh. Bổ sung công cụ vận hành và bằng chứng local, phân biệt điều kiện production chưa được cung cấp.

## Nghiệm thu

Kiểm thử lại toàn bộ sau chỉnh sửa, build/audit, kiểm tra quyền và responsive 390/430/768/1366/1440, ảnh V5, số liệu bundle, backup/restore vào DB mới, đóng gói không chứa secrets/dữ liệu học sinh. Không công bố production ready khi thiếu hạ tầng thật.
