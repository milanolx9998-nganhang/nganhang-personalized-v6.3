# Bàn giao V4 UX & Hồ sơ học tập — 13/09/2026

## 1. Audit và phạm vi

Đã lập docs/MEGA_V4_CURRENT_AUDIT.md trước triển khai và chạy baseline: 8 kiểm thử ma trận, 30 đơn vị, 28 tích hợp; frontend build thành công. Chỉ sửa bản nganhang-personalized-v1, giữ bản gốc nganhang-v4.3.3/nganhang-v4 và database gốc. Dùng Astra One-Pass để giữ thay đổi theo phạm vi, UI/UX Designer để tách điều hướng, hồ sơ và giao diện di động.

## 2. Kiến trúc điều hướng

Năm mảng việc cho nhân sự, lọc theo vai trò; menu học sinh riêng. Sidebar desktop 245 px, cố định theo vùng nhìn; nhóm đang dùng mở, nhóm khác gọn. Mobile có nền che, đóng sau điều hướng/Escape, giữ focus trong menu. Trang chủ nhân sự có nhóm tác vụ; thống kê ngân hàng cũ ở /dashboard, các route ma trận/đề/kho/nhập vẫn giữ.

## 3. Hồ sơ học tập

Hồ sơ dùng chung thành phần cho học sinh tự xem và nhân sự theo phạm vi. Năm tab: Tổng quan, Lịch sử làm bài, Thành thạo, Bài được giao, Lớp học. Header có thông tin lớp/năm/đăng nhập; tác vụ đổi mật khẩu/chuyển lớp/giao bài đi qua cơ chế cũ. Tổng quan có sáu chỉ số, tín hiệu xác định, lịch hoạt động, trạng thái chưa đủ dữ liệu và chế độ in/PDF.

## 4. Lịch sử làm bài

Phân trang máy chủ 20, tối đa 50; tổng đầy đủ, không giới hạn 200 như trang cũ. Lọc môn/chuyên đề/nguồn/trạng thái/chế độ/bài giao/ngày. Chủ đề lấy theo phiên bản câu đã làm. Desktop bảng, mobile thẻ. API giới hạn lớp hiện tại và môn; đổi lớp thu hồi quyền cũ, học sinh không đọc hồ sơ bạn khác.

## 5. Xem lại lượt làm

Trang riêng chỉ đọc, lấy attempt_items.question_version_id. Đã kiểm thử đủ TN/ĐS/TLN/GN/TL, đáp án số 0, partial 3/4 ý và 1/2 cặp, bỏ qua/chưa chắc, tự luận không tính tự chấm. Thử sức chưa nộp ẩn đáp án cho mọi vai trò. Giữ liên kết luyện lại với lượt gốc và cơ chế chấm/phiên bản bất biến.

## 6. Những thay đổi UX bổ sung

Danh sách học sinh có hành động chính Xem hồ sơ, các thao tác quản trị trong menu phụ; thêm lọc năm/khối và đăng nhập gần nhất. Tiến độ lớp không nhúng cả hồ sơ dài. Trang học sinh ngắn gọn, biểu đồ lấy lượt hoàn thành. Nộp bài còn trống/chưa chắc có xác nhận. Tick bài/YCCĐ được giữ nguyên.

Nhập Excel chuyển sang xem trước rồi xác nhận: NEW/UPDATE/UNCHANGED/CONFLICT/ERROR; preview không ghi DB; xác nhận transaction, kiểm tra thay đổi đồng thời, chống dùng lại. Phân công giáo viên–lớp–môn là dropdown có tên.

## 7. File chính

Backend:
- src/services/practice/portfolio.js, portfolioRules.js: API chỉ đọc và quy tắc trình bày.
- src/services/practice/attempts.js: xuất lại serializer có sẵn, không đổi engine.
- src/services/practice/students.js, roster.js; src/routes/practice.js.
- test/practice/portfolio.test.js; test/integration/pilot.test.js.
- scripts/v4-local-review.mjs: chụp/kiểm tra demo, không nộp hay sửa bài.

Frontend:
- src/config/navigation.js; src/components/Layout.jsx; src/App.jsx.
- src/pages/practice/WorkspaceHome.jsx, StudentHome.jsx, Student.jsx, Students.jsx, Teacher.jsx, Admin.jsx, RosterImport.jsx, Assignments.jsx, Player.jsx.
- src/pages/practice/portfolio/: common.jsx, StudentPortfolio.jsx, PortfolioOverview.jsx, AttemptHistory.jsx, MasteryPortfolio.jsx, PortfolioTabs.jsx, AttemptReview.jsx.
- src/styles/portfolio.css.

Tài liệu: MEGA_V4_CURRENT_AUDIT.md, STUDENT_PORTFOLIO.md, API.md, USER-GUIDE.md, QUAN_LY_HOC_SINH.md, SELF_PRACTICE.md, VERIFICATION_REPORT.md và báo cáo này.

## 8. Migration và tính toàn vẹn

Không có migration mới, không sửa migration đã áp dụng, không reset DB. Không tạo bảng attempts/mastery/student portfolio song song.

So sánh artifacts/v4-data-before-runtime.json và v4-data-after-runtime.json: cả số dòng và MD5 nội dung sáu bảng giữ nguyên: attempts 2; attempt_items 20; mastery_events 6; mastery_states 6; class_memberships 1; question_versions 84. Đăng nhập kiểm tra chỉ cập nhật thông tin đăng nhập tài khoản; preview roster không ghi. Dữ liệu giả của kiểm thử nằm trong database độc lập, không trộn vào kho làm việc.

## 9. Kết quả kiểm thử cuối

- npm test backend: 8/8 ma trận V4 + 33/33 đơn vị đạt.
- npm run test:integration: 32/32 đạt, gồm API và trình duyệt.
- Tổng 73 kiểm thử đạt; không bỏ qua ca.
- npm run build frontend: đạt, 375 modules; JS 839.92 kB / gzip 246.81 kB.
- Bốn vùng nhìn: 390×844, 768×1024, 1366×768, 1440×900.
- API kiểm tra quyền chéo học sinh, khác môn, chuyển lớp; phân trang >20; version cũ; readonly không đổi Mastery; roster preview không ghi/confirm một lần/xung đột.
- Hồi quy import DOCX/Excel/QTI, xuất Word/PDF/QTI, ma trận/sinh đề, học sinh CRUD, bắt đổi mật khẩu, lưu/tiếp tục/nộp vẫn đạt.
- Script demo kiểm tra 13 màn, xuất PDF hai trang; health local và database đều ok.
- Log: artifacts/v4-baseline-*.log, v4-build.log, v4-unit.log, v4-integration.log, v4-local-browser.json.

## 10. Ảnh và bản in đã xem

Đã mở kiểm tra ảnh bằng mắt: staff sidebar desktop/mobile; quản lý học sinh; lớp; hồ sơ tổng quan và lịch sử desktop/mobile/tablet; thành thạo; xem lại năm dạng; trang học sinh; player mobile; roster preview. Không thấy tràn ngang hoặc cắt nội dung trong các luồng được kiểm tra. Đã xem bản render PDF hai trang, nền trắng/lề 12 mm, không in điều hướng hay secret.

Ảnh chuẩn trong artifacts:
- v4-staff-sidebar.png, v4-staff-sidebar-mobile.png
- v4-student-management.png, v4-teacher-class.png
- v4-student-portfolio-overview.png, v4-student-portfolio-history.png
- v4-student-attempt-review.png, v4-student-portfolio-mastery.png
- v4-student-home.png, v4-player-mobile.png
- v4-roster-preview.png, v4-review-five-types.png
- v4-portfolio-overview-{390,768,1366,1440}.png và history tương ứng
- v4-student-portfolio-print.pdf, v4-print-page-1.png, v4-print-page-2.png

## 11. Còn lại và cách mở

Mở http://127.0.0.1:3001. Nhân sự: Học sinh & Học tập → Quản lý học sinh → Xem hồ sơ. Học sinh: Hồ sơ học tập trong menu hoặc nút ở trang học tập. Hướng dẫn chi tiết: STUDENT_PORTFOLIO.md.

Chưa bổ sung thao tác tùy chọn “Bỏ bài đang dở”; bài dở vẫn được giữ để tiếp tục. Preview roster tạm trong bộ nhớ một tiến trình, hết hạn sau 15 phút hoặc restart; cần kiến trúc lưu tạm chia sẻ trước khi chạy nhiều worker. Giữ endpoint import trực tiếp cũ để tương thích; UI dùng preview.

Kho local vẫn chưa có ánh xạ YCCĐ, không tự gán dữ liệu nguồn. Cảnh báo bundle >500 kB vẫn tồn tại. Không triển khai production/HTTPS/LTI trong đợt này; tài khoản demo chỉ cho local, cần đổi mật khẩu và bật bảo vệ đăng nhập trước khi mở cho học sinh thật. Không bật AI chấm tự luận, leaderboard, gợi ý cá nhân hóa tự động.

