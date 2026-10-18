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

## Đấu V6.9 — `/api/battle`

Theo kế hoạch 1.3, mục 23 ưu tiên. Tất cả route yêu cầu đăng nhập; cookie dùng CSRF như các API khác. JSON tối đa **16 KB**. Mã phòng không thay thế quyền thành viên. Học sinh phải có đúng một lớp còn hiệu lực trong năm học hiện tại; phòng học sinh cùng khối, phòng lớp đúng lớp. Giáo viên tạo phòng cần phân công đúng cặp lớp–môn, quản trị được phép tạo phòng lớp.

Nếu thiếu migration hoặc khởi tạo Đấu thất bại, app và `/api/health` vẫn hoạt động. Toàn bộ router Đấu trả `503 {"error":"Đấu chưa sẵn sàng","code":"BATTLE_UNAVAILABLE"}`. Sau khi vận hành cài migration trên môi trường đã được duyệt, khởi động lại tiến trình để thử khởi tạo lại.

### Endpoint và quyền

| Method | Đường dẫn sau `/api/battle` | Người dùng / dữ liệu vào |
|---|---|---|
| GET | `/me` | Học sinh / nhân sự: tư cách, cờ, `current_room_id`, `queue`, `suspension`, phản hồi báo cáo của mình |
| GET | `/options?count=7&subject_id=1` | Học sinh theo khối thật; nhân sự thêm `class_id` và `subject_id`. Trả `subjects`, `branches`, `chapters`, `topics`, `suggestions` đủ câu |
| GET | `/lobby`, `/lobby/stream` | Học sinh; sảnh công khai cần `lobby`. Khi chỉ bật `class`, chỉ thấy phòng ghim của lớp; luồng còn phục vụ ghép trận |
| POST | `/rooms` | Học sinh tạo `duel`, `team`, `ffa`; giáo viên / quản trị tạo `class`. Trả 201 và ảnh chụp phòng |
| POST | `/rooms/join` | Học sinh, `{code:"123456"}` |
| POST | `/rooms/:id/join` | Học sinh, `{}`; phòng công khai từ sảnh hoặc phòng lớp ghim. Phòng lớp không cần cờ `lobby` |
| POST | `/rooms/:id/leave` | Thành viên đang hoạt động / giáo viên chủ phòng, `{}` |
| POST | `/rooms/:id/ready` | Người chơi trong phòng chờ, `{ready:true}` |
| POST | `/rooms/:id/team` | Người chơi phòng đội, `{team:1}` hoặc `{team:2}` |
| POST | `/rooms/:id/vote` | Người trong danh sách cử tri đóng đầu vòng, `{option_id:"…",force:false}`; `force:true` chỉ chủ phòng, cần quá nửa |
| POST | `/rooms/:id/nominate` | Người chơi phòng chờ, `{scope:{…}}`; tối đa 3 đề cử. Nhãn được máy chủ suy ra, không nhận chữ tự do. Sau hết hai lượt không phiếu, chủ phòng chọn phạm vi bằng route này |
| POST | `/rooms/:id/start` | Chủ phòng, `{}`; phòng lớp có thể thêm `{show_top3:true}`. Học sinh cần mọi người sẵn sàng; lớp không cần |
| POST | `/rooms/:id/answer` | Người chơi, `{index,client_id,response}` hoặc `{index,client_id,skip:true}` |
| POST | `/rooms/:id/next` | Người chơi ở `reveal`; phòng lớp chỉ giáo viên. Body `{}` |
| POST | `/rooms/:id/pause`, `/resume` | Giáo viên chủ phòng lớp, `{}`; pause chỉ ở `question`, trước `deadline` |
| POST | `/rooms/:id/end` | Giáo viên phòng lớp hoặc chủ phòng học sinh còn một mình; `question`, `paused`, `reveal`, body `{}` |
| POST | `/rooms/:id/emote` | Người chơi, `{kind:"hello"}`; các giá trị: `hello`, `cheer`, `thanks`, `well_done`; chỉ `lobby`/`reveal`, không phòng lớp, 10 giây/lần |
| POST | `/rooms/:id/rematch` | Người từng chơi; lớp chỉ chủ phòng giáo viên. `{}` tạo phòng mới, không tự kéo các bạn vào |
| POST | `/rooms/:id/retry-wrong` | Học sinh từng chơi, ván kết thúc, `{}`. Trả lượt luyện nguồn `battle_retry`, bấm lại trả cùng lượt gốc |
| GET | `/rooms/:id/stream` | Người chơi chưa rời hoặc giáo viên chủ phòng lớp |
| GET | `/rooms/:id/result` | Người từng chơi / giáo viên chủ phòng lớp; ván đã kết thúc |
| GET | `/history` | 10 ván đã kết thúc của chính người dùng; cùng DTO kết quả, không lộ câu chưa phát |
| POST | `/match` | Học sinh, `{kind:"duel",scope:{…}}`; `kind` là `duel`/`ffa`, scope rỗng nghĩa là bất kỳ |
| PATCH | `/match` | Học sinh đang chờ, `{accept:true}`: đồng ý đúng lời mời nới do máy chủ đưa ra |
| DELETE | `/match` | Học sinh rời hàng chờ |
| POST | `/reports` | Học sinh, `{room_id,target_id,reason,note?}`; lý do `bullying`, `name`, `cheating`, `other`; note tối đa 500 ký tự |
| GET / POST | `/blocks` | Xem danh sách mình chặn / `{user_id}`; chỉ người đã cùng phòng |
| DELETE | `/blocks/:userId` | Gỡ quan hệ chặn của chính mình |
| GET / POST | `/admin/reports` | Quản trị: hàng đợi gộp theo mục tiêu trong cửa sổ 24 giờ / `{id,status}` với `reviewing`, `resolved`, `dismissed` |
| GET | `/admin/reports/:id` | Quản trị: ảnh chụp ván theo pha và chứng cứ của báo cáo cụ thể |
| GET / POST | `/admin/suspensions` | Quản trị: danh sách đang khóa / `{user_id,days,reason}`; days = 1, 3, 7 |
| GET / POST | `/admin/settings` | Quản trị: cấu hình Đấu / thay đổi các khóa `battle_*` |

Scope: `{subject_id,branch_id?,topic_ids?}` hoặc `{subject_id,branch_id?,chapter}`. Bài phải thuộc đúng môn, phân môn và khối. Không tự nới khi thiếu câu. Gợi ý `{topic_id,reason:"weak"|"recent"}` chỉ trả cho chính học sinh, dùng dữ liệu 30 ngày gần đây và quy tắc Bài hiện tại dùng chung với bản đồ bài học. Không gửi lý do gợi ý sang người chơi khác.

Ví dụ tạo phòng:

```json
{"kind":"duel","visibility":"code","content_mode":"fixed","scope":{"subject_id":1,"topic_ids":[101]},"question_count":7,"seconds":30}
```

`question_count`: 7, 10, 15. `seconds`: học sinh 20, 30, 45; lớp 20–180. Sức chứa mặc định đôi 2, đội 8, FFA 20, lớp 50; đội cần đúng hai đội 1–4 người. Phòng lớp bắt buộc `class_id` và nội dung cố định. `content_mode:"vote"` cần khả năng `vote` và bầu hai vòng: môn, rồi phạm vi. Danh sách cử tri đóng ở mỗi vòng, người vào giữa vòng chờ vòng sau. Không có phiếu: gia hạn một lần rồi chủ phòng chọn.

### Biên nhận, DTO và thời gian

`client_id` là UUID giữ nguyên cho một cặp phòng–câu. Handler ghi thời điểm nhận trước khi vào hàng lệnh. Biên nhận chỉ trả sau commit:

```json
{"received":true,"index":0,"at":1792300000000}
```

Gửi lại cùng `client_id` trả lại đúng biên nhận kể cả ván đã kết thúc hoặc restart; mã khác cùng câu trả 409 và `details.receipt`. `close_at = deadline + 500 ms`; chỉ lệnh nhận không trễ hơn `close_at` và được xử lý trước lệnh đóng câu mới được nhận. DB lỗi trả 503, không có ACK. Client gửi lại cùng UUID sau 1, 2, 4 giây, tối đa 5 lần; sau đó yêu cầu học sinh bấm lại.

Ví dụ ảnh chụp `question` (rút gọn, không phải mọi trường):

```json
{"id":"uuid","run_id":"uuid","version":9,"status":"playing","phase":"question","server_now":1792300000000,"asked_count":1,"deadline":1792300030000,"question":{"index":0,"total":7,"type":"multiple_choice","stem":"…","options":[{"id":"A","text":"…"}],"topic_name":"Bài …"},"my_answer":{"received":true,"response":"B","skipped":false},"players":[{"id":31,"name":"Ngọc","class_name":"9A2","answered":true,"points":0,"correct":0}]}
```

| Pha | Dữ liệu được phát |
|---|---|
| `lobby` | Mã, host, cấu hình, tên ngắn/lớp, ready/team, đếm phiếu + phiếu riêng, lý do chưa bắt đầu |
| `countdown` đầu ván | Chưa có câu hỏi vì `asked_count=0` |
| `question`, `paused`, `closing` | Câu đã phát, trả lời riêng, cờ đã trả lời, điểm và số đúng đến câu trước; **không đáp án, lời giải, score câu hiện tại, phân bố** |
| `reveal` | Thêm `question.answer`, `question.explanation`, `my_answer.score`, phân bố; TN có số người chọn từng phương án |
| `finished`, `interrupted`, `closed` | `questions` chỉ chứa câu `idx < asked_count`; câu trả lời riêng và score, `review`, `podium` tối đa 3 thẻ, `me` gồm hạng riêng, `teams`, huy hiệu riêng |

Không có bảng xếp hạng đầy đủ. Đồng điểm vẫn đồng hạng; nếu quá 3 người cùng thuộc podium, chỉ phát 3 thẻ theo thứ tự vào phòng, không thay đổi hạng thật. Giáo viên màn chiếu không nhận đáp án sớm; mặc định không nhận tên/điểm từng học sinh hoặc podium, trừ khi bật `show_top3` lúc bắt đầu. `run_id` đổi sau restart; phòng chờ chuyển `closed`, phòng đang chơi chuyển `interrupted`.

### SSE

Client dùng **fetch + ReadableStream**, không dùng EventSource. Headers: `Content-Type: text/event-stream`, `Cache-Control: private, no-store, no-transform`, `X-Accel-Buffering: no`. Mở/nối lại nhận ngay `event: snapshot` đầy đủ; mọi snapshot có `run_id`, `version`. Chỉ áp dụng khi run mới hoặc version lớn hơn. Ping `: ping` mỗi 15 giây; gộp cập nhật thường 250 ms, chuyển pha phát ngay. `event: closed` chứa `{reason}`.

- Lỗi mạng: nối lại sau 1, 2, 4, 8, 15 giây, tối đa 15 giây.
- HTTP 401: về đăng nhập; 403: dừng nối lại; 429: chờ `Retry-After`.
- `closed.reason = slow`: nối lại sau 2 giây; `left`, `suspended`, `emergency`: dừng; `expired`: đăng nhập lại; `unavailable`, `shutdown`: nối lại có giãn cách.
- Trần mặc định: 1.200 luồng toàn hệ thống, 2/người, 10 lần mở/phút/người, 64 KB bộ đệm/client. SSE đứt không có nghĩa người chơi rời.

### Cấu hình, lỗi và tích hợp tự luyện

`battle_enabled=false` mặc định: ngừng tạo/vào/bắt đầu ván mới, ván đang chạy chơi nốt. `battle_emergency_stop=true`: chặn chơi, gián đoạn ván, đóng luồng. `battle_modes` phải gửi đủ `{class,duel_code,lobby,matchmaking,vote,ffa,team}`; tất cả mặc định false. Phòng lớp/thẻ ghim không phụ thuộc `lobby`. `battle_limits` gửi đủ các khóa như GET settings; cho phép hạ trần từ mặc định, không nâng quá mức chưa nghiệm thu tải.

HTTP: 400 sai dữ liệu; 403 sai quyền / khác khối / bị khóa; **403 `BATTLE_FEATURE_OFF`** khi khả năng tắt; 404 phòng/mã không tồn tại; 409 sai pha, chốt lặp với UUID khác, thiếu câu; 413 body quá lớn; 429 giới hạn; 503 hàng lệnh/DB bận hoặc **`BATTLE_UNAVAILABLE`** khi chưa khởi tạo.

`retry-wrong` không có câu sai trả 409 “Em không sai câu nào trong ván này”. Có câu sai nhưng tất cả bị thu hồi/cách ly trả 409 “Không còn câu sai dùng được để luyện lại”, kèm `details.excluded_questions`. Nếu chỉ bỏ một phần, số câu bỏ nằm trong `attempt.config.excluded_questions`. Nguồn `battle_retry` và `battle_room_id` giữ qua luyện lại tiếp; không ghi `mastery_events` hoặc tính lại `mastery_states` khi nộp. Huy hiệu Sửa sai đếm nguồn này; hồ sơ có `battle_retry_attempts`, nhãn “Luyện lại sau ván đấu”.

`GET /api/practice/review-questions` trả `{items}` cho chính học sinh, tối đa 100 mục từ lượt luyện và ván đã kết thúc. Mục ván có `room_id`, `index`, `question_id`, `topic_id`, `source:"battle"`, `source_label:"Ván đấu"`; không chứa đáp án. Database chưa có battle vẫn trả các câu tự luyện.
