# Danh mục quyền V6.5

Nguồn thực thi: `backend/src/services/access/catalog.js`. Không nhận wildcard, mã quyền lạ hoặc biểu thức do trình duyệt gửi. API là nơi quyết định cuối cùng; menu chỉ dùng bản tóm tắt để điều hướng.

| Nhóm | Quyền |
|---|---|
| Học sinh | `student.read`, `student.manage_basic`, `student.reset_password`, `student.transfer`, `student.disable` |
| Học tập | `learning.read`, `learning.read_attempt`, `learning.read_all_subjects`, `learning.read_subject` |
| Nội dung | `content.read`, `content.write`, `content.create_version`, `content.review`, `content.approve`, `content.export`, `content.view_answer`, `content.download_source` |
| Giao bài | `assignment.read`, `assignment.create`, `assignment.manage` |
| Ma trận | `matrix.read`, `matrix.create`, `matrix.review`, `matrix.approve`, `matrix.lock` |
| Đề | `exam.read`, `exam.create`, `exam.generate` |
| Kho | `bank.read`, `bank.write`, `bank.review`, `bank.manage` |
| GDPT 2018 | `curriculum.read`, `curriculum.manage`, `curriculum.manage_lessons`, `curriculum.manage_standards`, `curriculum.propose_mapping`, `curriculum.publish` |
| Phân tích | `analytics.read`, `analytics.export` |
| Vận hành | `staff.read`, `staff.manage`, `class.manage`, `class.manage_membership`, `audit.read`, `security.read`, `system.config` |

## Quyết định

ADMIN → DENY phù hợp phạm vi → ALLOW phù hợp phạm vi → vị trí chuẩn → quyền tương thích → từ chối. Đọc và ghi, rà soát và phê duyệt, sửa hồ sơ và đặt lại mật khẩu là các quyền riêng. Quyền chỉ đọc không bị biến thành quyền ghi bởi dữ liệu môn/tổ cũ khi hồ sơ đã chuẩn hóa.

Các chiều trong một phạm vi lấy giao; nhiều vị trí lấy hợp. Không có lớp không đồng nghĩa tất cả lớp. Cấp THCS = 6–9, THPT = 10–12. Phạm vi có năm học/ngày hiệu lực được kiểm mỗi yêu cầu. Máy chủ suy khối/năm từ lớp, tổ từ môn. Không dùng khối/tổ giả do trình duyệt gửi để mở quyền.

Quyền kho: quản trị/chủ kho → DENY → ALLOW/ACL → vị trí → nhân sự đọc kho trường → từ chối. Có quyền kho vẫn phải qua quyền nội dung môn/khối. Chủ kho không tự có quyền biên soạn/phê duyệt mọi môn.

## API chính

- `GET /api/auth/me`: account_type, position_labels, capabilities, capability_scopes, access_version. Một capability true nghĩa là có ít nhất một phạm vi, không phải toàn trường.
- `GET /api/staff`, `GET /api/staff/:id/access`: hồ sơ, phân công và quyền hiệu lực.
- `POST /api/access/explain`: quyết định kèm nguồn/ngoại lệ/lý do cho context cụ thể.
- `PUT /api/staff/:id/assignments`: thay phân công của năm đang sửa, nguyên tử, kiểm expected_access_version.
- `POST /api/staff/:id/capability-overrides`, `DELETE /api/staff/:id/capability-overrides/:overrideId`: cấp/thu hồi ngoại lệ có lý do.
- `PUT /api/staff/:id/banks/:bankId`: ACL kho, thời hạn, nhật ký trước/sau.
- `POST /api/staff/bulk-preview`, `PUT /api/staff/bulk-assignments`: xem trước/lưu nguyên tử nhiều nhân sự.
- `POST /api/staff/:id/copy-year-preview`: bản nháp năm mới, ánh xạ lớp tường minh, không sao chép override.

## Ranh giới quản trị

Quản lý nhân sự, tài khoản quản trị, cơ cấu trường và cấu hình nhạy cảm vẫn yêu cầu system admin trong đợt P0. Không tự biến ALLOW staff.manage thành quyền cấp quản trị. Quyền tải nguồn chỉ có tác dụng ở chức năng tải nguồn được triển khai; không công khai thư mục nguồn nhập liệu. Các khóa read_all_subjects/read_subject biểu diễn preset học tập; truy vấn thực tế vẫn kiểm learning.read cùng môn × lớp.

Không sửa quy tắc chấm điểm, nguồn Outcome/YCCĐ, tính bất biến phiên bản hoặc snapshot bài làm trong thay đổi này.
