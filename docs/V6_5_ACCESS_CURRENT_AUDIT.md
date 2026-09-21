# Kiểm kê phân quyền V6.5 — 17/09/2026

Đích sửa: `nganhang-personalized-v6.3`, cơ sở dữ liệu `nganhang_personalized_v63`, cổng 3003. Không nhân bản dự án, không seed dữ liệu thật. V6.4.3 là đường cơ sở; giữ nguyên bất biến phiên bản câu hỏi, snapshot bài làm và chuẩn GDPT 2018.

## Các điểm đã xác định từ mã nguồn

| Thành phần | Hiện trạng | Quyết định |
|---|---|---|
| users.role, subject_id, department_id | Vừa phân loại tài khoản, vừa suy quyền | KEEP TEMPORARY: adapter cho tài khoản chưa chuẩn hóa; metadata không cấp quyền sau chuẩn hóa |
| user_positions | Nhiều vị trí nhưng phạm vi đơn lẻ; xóa vật lý khi thu hồi | WRAP: giữ lịch sử, chuyển luồng chỉnh sửa sang dịch vụ nhân sự |
| teacher_class_assignments | Dữ liệu phân công môn × lớp, không có thời hạn riêng | KEEP: đồng bộ chênh lệch trong cùng giao dịch phân công |
| learning_class_scopes | VIEW trộn vị trí và phân công; không có DENY | REPLACE tại điểm kiểm quyền bằng resolver, giữ VIEW tương thích trong migration |
| bank_memberships | ACL kho theo read/write/review | KEEP: nguồn quyền riêng, không sao chép thành override |
| services/capabilities.js | Ba helper, review chưa tách approve | WRAP bằng capability chuẩn và context tài nguyên |
| middleware/auth.js | Nạp quyền lại mỗi request; requireRole rải rác | KEEP xác thực JWT; bổ sung request access cache, thay role gate ở nghiệp vụ |
| server.js | Chặn toàn bộ ghi của BGH/viewer | REPLACE bằng kiểm capability tại endpoint; không làm override vô hiệu |
| practice/authorization, analytics, students | Lớp/học sinh dựa VIEW; reset chung với sửa hồ sơ | REPLACE kiểm class × subject và tách reset/manage/transfer/disable |
| matrix/exams/questionReview | Duyệt và phê duyệt chưa tách hoàn toàn | REPLACE kiểm capability riêng, giữ nguyên chống tự duyệt và version guards |
| curriculumManagement | Công bố hard-code admin | WRAP curriculum.publish; không thay nội dung chuẩn |
| useAuth/navigation | roles arrays, canManage/canReview | DEPRECATE; menu dùng capabilities từ API |
| Users/Admin/Configuration | Phân quyền nhiều chỗ; form role và ID kỹ thuật | REPLACE bằng hồ sơ nhân sự và vị trí/phạm vi; tách mục quản trị |

## Thiết kế chuyển tiếp

- Catalog/preset và bộ quyết định thuần, kiểm thử độc lập: ADMIN → DENY → ALLOW → POSITION → LEGACY → từ chối.
- Scope có kiểu, các chiều trong một phạm vi là giao; nhiều vị trí là hợp. Rỗng không phải toàn trường. Nội dung GV bộ môn không bị giới hạn bởi lớp; học tập phải đúng môn × lớp.
- Migration bổ sung assignment chuẩn, override, lịch sử và cờ chuẩn hóa từng tài khoản. Không xóa bảng/cột cũ. Tài khoản chưa được lưu bằng editor mới vẫn đi qua legacy adapter; tài khoản đã chuẩn hóa không nhận lại quyền từ metadata cũ.
- Năm học và ngày hiệu lực kiểm tại mỗi request. Không cache xuyên request. Context lớp/môn/phòng ban lấy từ DB, không tin các thuộc tính suy ra do client gửi.
- Phân công lưu nguyên tử, diff thêm/thu hồi thay vì xóa sạch; lưu actor, lý do, trước/sau. API cũ phải đi qua dịch vụ tương thích.

## Cổng nghiệm thu

Bằng chứng cuối: `docs/V6_5_ACCEPTANCE.md`. Giới hạn P0 system-admin-only và lớp tương thích được nêu trong hướng dẫn chuyển tiếp.

- [x] TDD preset/scope/precedence và các ca phủ định trong prompt.
- [x] Migration cộng thêm, resolver, overrides, auth/me.
- [x] API và giao diện nhân sự, giải thích quyền, lịch sử, kho.
- [x] Cutover backend/frontend; bỏ chặn ghi toàn cục theo board/viewer, giữ ranh giới system-admin-only cho quản trị nhạy cảm.
- [x] Báo cáo parity tài khoản hiện có; phân loại mọi khác biệt.
- [x] Hồi quy V6.4.3, E2E, ảnh giao diện, build và hướng dẫn bàn giao.
