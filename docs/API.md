# API Reference — Ngân hàng V4.3

Backend REST API. Tất cả endpoint (trừ `/auth/login`) yêu cầu JWT token trong header:
```
Authorization: Bearer <token>
```

## Auth

### POST `/api/auth/login`
```json
{ "username": "admin", "password": "admin123" }
```
→ `{ token, user: { id, username, full_name, role, ... } }`

### GET `/api/auth/me`
Thông tin user hiện tại.

### POST `/api/auth/change-password`
```json
{ "old_password": "...", "new_password": "..." }
```

## Users (admin/board only)

- `GET /api/users` — danh sách
- `POST /api/users` — tạo
- `PUT /api/users/:id` — sửa (họ tên, role, tổ, khóa/mở)
- `POST /api/users/:id/reset-password` — đặt lại mật khẩu

## Taxonomy

- `GET /api/taxonomy/departments` — tổ bộ môn
- `GET /api/taxonomy/subjects` — môn học
- `GET /api/taxonomy/branches?subject_id=N` — phân môn (chỉ môn tích hợp)
- `GET /api/taxonomy/topics?subject_id=N&grade=M&branch_id=K` — bài
- `POST /api/taxonomy/topics` — thêm bài
- `PUT /api/taxonomy/topics/:id` — sửa bài
- `DELETE /api/taxonomy/topics/:id` — xóa bài (admin/dept_leader)

## Questions

- `GET /api/questions?subject_id=&grade=&cognitive_level=&q_type=&status=&search=&limit=50&offset=0`
- `GET /api/questions/:id`
- `POST /api/questions`
- `PUT /api/questions/:id`
- `POST /api/questions/:id/review` — `{ status: "Đã duyệt" | "Đã rà soát" | ... }`
- `DELETE /api/questions/:id`

## Matrix

- `GET /api/matrix` — danh sách ma trận
- `GET /api/matrix/:id` — chi tiết + cells
- `POST /api/matrix` — tạo
- `PUT /api/matrix/:id` — sửa (có thể thay cells)
- `DELETE /api/matrix/:id`
- `POST /api/matrix/:id/clone`
- `GET /api/matrix/:id/coverage` — preview sinh đề: báo ô nào đủ/thiếu

## Matrix balance (thuật toán phân bổ điểm)

### POST `/api/matrix-balance/auto`
Tự động phân bổ từ đầu.
```json
{
  "total_score": 10,
  "ratios": [30, 30, 20, 20],
  "branch_configs": [
    { "branch_id": 1, "branch_code": "VL", "score": 4.0, "tn": 8, "ds": 2, "tln": 0, "tl": 1 },
    { "branch_id": 2, "branch_code": "HH", "score": 3.0, "tn": 6, "ds": 2, "tln": 0, "tl": 1 },
    { "branch_id": 3, "branch_code": "SH", "score": 3.0, "tn": 6, "ds": 2, "tln": 0, "tl": 1 }
  ]
}
```
→ `{ cells: [...], total_actual, total_expected, balanced: true/false }`

### POST `/api/matrix-balance/redistribute`
Tái phân bổ, giữ các ô đã khóa (`is_locked: true`). Input giống `/auto` nhưng có thêm `cells` (mảng cells hiện tại với ô khóa).

## Exams

- `GET /api/exams` — danh sách đề đã sinh
- `GET /api/exams/:id` — chi tiết + items theo mã đề
- `POST /api/exams/generate`:
  ```json
  {
    "matrix_id": 1,
    "exam_name": "Giữa kỳ I 2025-2026",
    "exam_code_count": 2,
    "shuffle_options": true,
    "avoid_cross_code_overlap": true,
    "anti_repeat_days": 180
  }
  ```
  → `{ exam_run_id, exam_codes: {"101": [...], "102": [...]}, warnings }`
- `GET /api/exams/:id/download?code=101&kind=exam` — tải Word đề
- `GET /api/exams/:id/download?code=101&kind=answer` — tải Word đáp án
- `DELETE /api/exams/:id`

## Uploads

- `POST /api/uploads/questions-excel` — nhập Excel (multipart/form-data với `file`)
- `GET /api/uploads/questions-excel/template` — tải template Excel

## Reports

- `GET /api/reports/dashboard` — thống kê tổng quan
- `GET /api/reports/questions/stats` — câu hỏi theo môn/lớp/mức/dạng
- `GET /api/reports/questions/top-used` — top câu dùng nhiều
- `GET /api/reports/audit?limit=100` — audit log (admin/board)

## Error responses

Tất cả lỗi trả JSON:
```json
{ "error": "Thông điệp tiếng Việt" }
```

HTTP status:
- `400` — dữ liệu không hợp lệ
- `401` — chưa đăng nhập / token hết hạn
- `403` — không đủ quyền
- `404` — không tìm thấy
- `500` — lỗi server (xem console)

## Bổ sung V4 hồ sơ học tập (13/09/2026)

Các đường dưới đây có tiền tố /api/practice và yêu cầu JWT. Học sinh chỉ xem chính mình; nhân sự cần quyền lớp hiện tại VÀ môn, quản trị toàn quyền.

| GET | Kết quả |
| --- | --- |
| /students/:id/portfolio | student, current_memberships, summary, signals, mastery_overview, recent_attempts, recent_completed_attempts, unfinished, assignment_summary, upcoming_assignments, recent_activity |
| /students/:id/attempts | {items,total,limit,offset}; limit mặc định 20, tối đa 50 |
| /students/:id/attempts/:attemptId | Chi tiết chỉ đọc, phiên bản câu cũ, items, summary, retry_parent |
| /students/:id/mastery | {states,topics,semantics:current_accumulated} |
| /students/:id/assignments | {assignments} trong phạm vi |
| /students/:id/classes | {memberships} |

History nhận subject_id, topic_id, source, status, mode, assignment_id, from, to, min_percentage, max_percentage, limit, offset. Ngày YYYY-MM-DD hợp lệ, từ không sau đến. Sai tham số 400, ngoài quyền 403, lượt không tồn tại/trái môn 404. Không lộ đáp án Thử sức chưa hoàn thành.

GET /students thêm grade và year bên cạnh search/class_id/status/offset; danh sách 30 học sinh.

POST /roster/preview nhận multipart file XLSX, trả {token,expires_at,rows,can_confirm}; rows gồm dòng, nhãn và status NEW/UPDATE/UNCHANGED/CONFLICT/ERROR, không mật khẩu.
POST /roster/confirm nhận {token}; kiểm tra actor, hạn 15 phút, phiên bản dữ liệu và quyền hiện tại; toàn bộ ghi trong transaction. Trả {students} kèm mật khẩu tạm chỉ cho tài khoản mới. Bản đã dùng/hết hạn/thay đổi dữ liệu trả 409. Token xem trước chỉ tồn tại trong bộ nhớ một tiến trình; restart cần xem trước lại. POST /roster cũ giữ tương thích.

Chi tiết ngữ nghĩa: STUDENT_PORTFOLIO.md.
