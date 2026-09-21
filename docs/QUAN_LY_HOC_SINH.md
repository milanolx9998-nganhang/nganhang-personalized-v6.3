# Quản lý học sinh và giao diện làm bài — 12/09/2026

## Vào dùng ngay

Mở http://127.0.0.1:3001/login. Quản trị demo: `pilot_admin` / `admin`. Học sinh demo: `hs_demo` / `Demo12345`. Chỉ dùng các tài khoản này trên máy local; thay mật khẩu và bật lại bảo vệ đăng nhập trước khi mở cho người khác.

Học sinh demo thuộc lớp **9-DEMO**, năm học **2026-2027**. Vào **Bài được giao** → **Khởi động KHTN 9 · Cơ năng, công và công suất** → bắt đầu hoặc làm tiếp. Bài gồm 10 câu trắc nghiệm lấy từ kho hiện có, không sinh thêm nội dung hoặc tự gán YCCĐ. Lượt demo đang dở được giữ để làm tiếp.

## Quản trị học sinh

Đăng nhập quản trị → mục **Quản lý học sinh** ở thanh bên, hoặc mở `/practice/students`.

- Tìm theo tên/mã, lọc lớp và trạng thái; danh sách phân trang 30 học sinh.
- **Thêm học sinh**: nhập mã đăng nhập, họ tên, email nếu có và lớp. Mật khẩu tạm ít nhất 8 ký tự; để trống để hệ thống tạo ngẫu nhiên.
- **Sửa**: cập nhật mã, họ tên, email. Đổi mã cũng đổi tên đăng nhập và thu hồi phiên cũ; giữ nguyên ID và lịch sử học tập.
- **Mật khẩu**: cấp mật khẩu tạm mới và thu hồi phiên cũ. Học sinh thật phải đổi mật khẩu khi đăng nhập lại. Giao mật khẩu riêng rồi bấm **Ẩn mật khẩu**.
- **Chuyển lớp**: quản trị chọn lớp mới. Hệ thống kết thúc quan hệ lớp cũ, tạo quan hệ mới và giữ lịch sử, kể cả chuyển đi rồi quay lại.
- **Khóa/Mở lại**: quản trị ngăn hoặc cho phép đăng nhập mà không xóa kết quả học tập.
- **Lịch sử lớp**: xem lớp hiện tại và các lần chuyển trước.

Quản trị thao tác toàn hệ thống. Giáo viên chỉ thêm/sửa/cấp lại mật khẩu trong phạm vi lớp được phân công; không tự chuyển lớp hoặc khóa tài khoản. Vai trò xem chỉ đọc dữ liệu được cấp quyền. Học sinh không được gọi API quản trị. Nhập hàng loạt Excel, tạo lớp/năm học và phân công giáo viên nằm ở trang quản trị hiện có.

## Giao diện làm bài

Thiết kế theo hướng UI/UX ưu tiên đọc và thao tác: nền sáng, xanh ngọc/xanh đậm, đáp án dạng thẻ dễ chọn, thanh tiến độ, trạng thái đã làm/đánh dấu và thông báo lưu. Máy tính có bảng hành trình bên cạnh; điện thoại thu gọn bảng này để dành chỗ cho câu hỏi. Có nút câu trước, câu tiếp, nộp bài và lưu để làm tiếp. Giữ cơ chế chấm, tự lưu và lịch sử; tự luận vẫn không chấm tự động vào Mastery.

Ảnh kiểm tra nằm tại `artifacts/student-exercise-desktop.png`, `artifacts/student-exercise-mobile.png`, `artifacts/student-management-desktop.png` và `artifacts/student-management-mobile.png`.

## Kỹ thuật và kiểm chứng

Migration mới: `backend/src/db/migration-student-management.sql`, chạy qua `npm run migrate` trong backend. Thêm thời điểm kết thúc quan hệ lớp, cho phép lưu nhiều lần chuyển và thu hồi quyền lớp cũ ngay. Không sửa migration cũ đã áp dụng.

Đã đạt 8 kiểm thử ma trận cũ, 27 kiểm thử đơn vị và 26 kiểm thử tích hợp/trình duyệt; frontend build thành công. Có kiểm tra mã trùng, đổi mã, quyền khác lớp, chuyển đi/quay lại, khóa/mở, thu hồi phiên, bắt đổi mật khẩu, thao tác giao diện và độ rộng điện thoại. Cài mới 8 migration và chạy lại lần hai đều thành công.

Script `node scripts/seed-student-demo.mjs` chỉ chạy với database bản sao và không ở production; chạy lại không đặt lại mật khẩu tài khoản demo đã có. Không chạy script seed V4 cũ. Bản gốc và database `nganhang_v4` được giữ nguyên.

## Cập nhật hồ sơ V4 — 13/09/2026

Vào Học sinh & Học tập → Quản lý học sinh. Bấm tên hoặc Xem hồ sơ là thao tác chính; Sửa/Mật khẩu/Chuyển lớp/Khóa/Lịch sử lớp nằm trong “Thao tác khác”. Có lọc năm học, khối, lớp, trạng thái, tìm tên/mã và ngày đăng nhập gần nhất. Điện thoại hiển thị dạng thẻ.

Từ hồ sơ, “Tác vụ học sinh” mở giao bài với học sinh đã chọn, đặt lại mật khẩu hoặc chuyển lớp (quản trị). Các quyền và lịch sử CRUD cũ giữ nguyên.

Nhập Excel có bước xem trước không ghi dữ liệu, kiểm tra NEW/UPDATE/UNCHANGED/CONFLICT/ERROR và xác nhận một lần trong transaction. Quản trị phân công bằng danh sách tên giáo viên/lớp/môn, không nhập ID.

Bản cập nhật này không có migration mới. Các con số kiểm thử ở phần trước là mốc lịch sử; kết quả mới xem VERIFICATION_REPORT.md. Hướng dẫn: STUDENT_PORTFOLIO.md.
