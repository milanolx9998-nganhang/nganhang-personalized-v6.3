# Mega V4 — kiểm tra trước triển khai

Nguồn yêu cầu: MEGA_PROMPT_V4_UX_STUDENT_PORTFOLIO_CURRENT_PROJECT.md, bản giao ngày 12/09/2026. Thực hiện trên nganhang-personalized-v1, không sửa V4 gốc. Không reset database hoặc tạo engine/bảng lịch sử trùng.

| Yêu cầu | Hiện trạng đã kiểm tra | Tệp/API | Quyết định | Rủi ro |
|---|---|---|---|---|
| Điều hướng theo mảng việc | Sidebar phẳng | Layout.jsx, App.jsx | REFACTOR UI: cấu hình 5 nhóm, portal HS riêng | Không mất link V4/quyền vai trò |
| Hồ sơ học tập | Dashboard gộp tối đa 200 lượt | attempts.js dashboard | ADD API + ADD ROUTE: read model riêng, giữ endpoint cũ | Lớp AND môn; không lộ hồ sơ bạn |
| Lịch sử đầy đủ | Chưa phân trang/filter server | Student.jsx | ADD API + UI, mặc định 20/tối đa 50 | Lọc theo version đã phục vụ, không current version |
| Review staff | getAttempt chỉ own | attempts.js | ADD API chỉ đọc, serializer riêng | Không mở quyền sửa/lưu/nộp |
| Mastery | Có replay, aggregate, history | mastery.js | KEEP engine; UI heatmap/trend/confidence | Không gọi trạng thái hiện tại là snapshot theo ngày |
| Danh sách HS | CRUD/mật khẩu/chuyển lớp đủ | Students.jsx, students.js | KEEP logic, thêm link portfolio/menu | Giữ ID và membership history |
| Tiến độ lớp | Nhúng dashboard HS inline | Teacher.jsx | REFACTOR UI sang link route | Xem môn đúng phân công |
| Tự luyện | Tick bài/YCCĐ, autosave, retry đủ | shared.jsx, ContentPicker.jsx, Player.jsx | KEEP engine; xác nhận nộp và Home gọn | Không mất lựa chọn/đáp án |
| Roster | Nhập trực tiếp, transaction | roster.js, Admin.jsx | ADD preview không ghi + confirm kiểm tra lại | Xung đột, nhập lặp, quyền chuyển lớp |
| Admin | Nhập ID quyền thô | Admin.jsx | REFACTOR UI dùng danh sách chọn | Backend vẫn kiểm quyền |

Baseline chạy lại trước sửa: npm test (8 cũ + 30 đơn vị), test:integration (28/28), frontend build đều đạt. Log mới: artifacts/v4-baseline-unit.log, v4-baseline-integration.log, v4-baseline-build.log. Cảnh báo bundle >500 kB có sẵn. Không có lệnh lint/typecheck riêng.

Kiểm thử sau triển khai phải bao phủ phân trang >20 lượt; own/cross-student/cross-subject; snapshot; retry/partial/essay/skip; roster preview và rollback; staff → lớp → portfolio → review; student → portfolio; bốn kích thước màn hình; hồi quy V4/import/giao bài/mật khẩu. Ảnh và log mới dùng tiền tố v4-.

Giới hạn dữ liệu đầu vào: 84 câu chưa có ánh xạ YCCĐ; giữ nguyên cảnh báo và bộ chọn, không tự gán nội dung giáo dục. Không mở A/C, LTI, AI chấm tự luận hoặc bảng xếp hạng.
