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

### V6.9.3 — hợp đồng các cách chơi (Phụ lục 1.2 thắng 1.1 khi mâu thuẫn)

**Đấu trường / Quiz lớp:** mọi giá trị khác mặc định dưới đây chỉ được nhận ở `kind:'class'`. Phòng học sinh duel/ffa/team, ghép trận và rematch phòng học sinh gửi trục khác mặc định trả **400 `BATTLE_MODE_INVALID`**, kể cả khi cờ đang tắt. Quiz lớp không tính LP/MMR. Các cờ tiếp tục kiểm tra ở phòng lớp.

`POST /rooms` giữ toàn bộ trường cũ, bổ sung:

| Trường | Giá trị / mặc định | Điều kiện |
|---|---|---|
| `pacing` | `sync` (mặc định), `self` | self chỉ class; cần `battle_modes.self_paced` |
| `scoring` | `accuracy` (mặc định), `speed` | speed cần `battle_modes.speed_scoring` |
| `time_limit` | `per_question` (mặc định), `total` | total chỉ self |
| `total_minutes` | null (mặc định), 3/5/10/15/20 | bắt buộc có số khi total; per_question phải null |
| `reveal_policy` | `instant` (mặc định), `deferred` | deferred cần self_paced; hoãn đúng/sai, điểm riêng, đáp án và lời giải đến kết thúc |
| `show_live_board` | true (mặc định) | false loại bảng công khai khỏi JSON; cần self_paced khi chọn false |

Payload không gửi trường mới giữ luật V6.9.2. Phòng lớp gửi giá trị mới khi cờ tương ứng tắt trả 403 `BATTLE_FEATURE_OFF` (không âm thầm đổi về mặc định). `redemption:true` luôn bị từ chối 400 `BATTLE_REDEMPTION_UNSUPPORTED`. Rematch sao chép cả sáu trường. Các ván mới chụp `rules_version: "1.4"`. Điểm game không ghi mastery, không phải điểm đánh giá năng lực GDPT 2018.

Mọi snapshot có các trục trên, `rules_version`, `rank_disabled_reason` (null hoặc `BATTLE_MODES_UNRANKED`), `server_now`, `version`. Rank chỉ có thể bật ở sync + accuracy + per_question, ngoài ra còn các điều kiện rank cũ. `version` tăng theo phòng; client bỏ snapshot cũ. Thời gian là milliseconds Unix theo máy chủ.

**Cùng nhịp + Nhanh tay:** ở pha reveal và policy instant, snapshot có `fastest: {names:["Tên ngắn"], ms:1234}`; không có người đủ điều kiện thì names rỗng và ms null. `my_answer` bổ sung `base_points`, `speed_points`, `fastest_points` của câu vừa đóng. Policy deferred không công bố fastest hoặc các điểm này trong ván; xem khi kết thúc.

**Phòng self:** pha phòng `lobby → countdown → question ↔ paused → finished/interrupted`; không có reveal chung. Snapshot riêng người chơi chứa:

- `my_progress: {cursor, issued_count, phase, opened_at, deadline, paused_ms, progress_version, auto_next_at}`; phase là question/feedback/done; cursor bắt đầu 0. Trước phát câu đầu là null. `deadline` null với total, `auto_next_at` null với total/done. Tiến độ người khác không thay progress_version của mình.
- `question: {index,total,type,stem,...}` chỉ câu hiện tại đã phát cho mình, theo whitelist DTO câu cũ. Không chứa đáp án trong phase question. `my_answer: {received}` hoặc `{received:true,response,skipped}`.
- `feedback`: null khi chưa chốt; `{received:true,index}` khi deferred; instant bổ sung `score,base_points,speed_points,fastest_points,question` (question gồm answer/explanation). Đáp án chỉ được công bố sau commit. Instant phục vụ ôn tập, chấp nhận khả năng học sinh chia sẻ lời giải cho bạn chưa làm.
- `play_started_at`, `ends_at`: hạn tổng bắt đầu sau commit phát câu đầu, không tính countdown. Pause dừng hạn tổng và thời gian tính thưởng. Client đếm bằng server_now và hạn máy chủ, không gửi thời gian làm bài tự khai.
- `public_board: [{name,submitted,total,points?}]`: chỉ tên ngắn, số câu đã nộp/tổng, điểm đã được phép công bố; deferred không có points khi ván đang chạy. Không ID câu, không lưới đúng/sai, không nội dung tương lai. Không có trường này khi show_live_board=false. Bảng có `board_version`, `board_at`, đổi tối đa 1 lần/giây trong ván; ACK và cập nhật riêng tới ngay, có thể mang bản bảng cũ trong cùng snapshot.
- Giáo viên chủ phòng lớp có thêm `teacher_progress: [{id,name,cursor,issued,phase,answers:[{index,score,skipped}]}]`, chỉ các lượt đã phát. Màn chiếu dùng `GET /rooms/:id/projector` hoặc `/projector/stream` (chỉ giáo viên chủ phòng), tuyệt đối không dùng snapshot riêng giáo viên: DTO màn chiếu không chứa teacher_progress, câu hỏi/đáp án cá nhân hoặc feedback.

`GET /rooms/:id` trả snapshot HTTP cùng hợp đồng với SSE `/rooms/:id/stream`. Nộp vẫn dùng `POST /rooms/:id/answer {index,client_id,response}` hoặc `{index,client_id,skip:true}`. ACK giữ `{received:true,index,at}`; đọc snapshot/SSE để nhận feedback. Cùng client_id luôn trả biên nhận cũ, kể cả sau kết thúc/restart; khác client_id cho câu đã chốt trả 409 kèm biên nhận. Không ACK khi DB lỗi.

`POST /rooms/:id/next {expected_cursor: 0}` bắt buộc với self. Chỉ nhận khi phase cá nhân feedback; stale cursor trả 409 `BATTLE_CURSOR_CONFLICT`, `details.my_progress` chứa tiến độ hiện tại. Hai tab không thể chuyển hai câu. Với sync vẫn nhận `{}` theo luật cũ. Self/per_question: hết hạn ghi câu bỏ trống, feedback 3 giây rồi tự next; bấm next được ngay. Self/total: không tự next, không đóng câu theo seconds, hết ends_at kết thúc cả phòng. Hạn tổng cứng: request nhận lúc `received_at >= ends_at` bị từ chối 409 `BATTLE_TOTAL_EXPIRED`, không grace. Request hợp lệ đứng trước lệnh đóng vẫn được commit dù DB hoàn tất sau hạn.

**Kết quả/lịch sử:** `me` bổ sung `points,accuracy_sum,fully_correct,submitted,issued,total,base_points,speed_points,fastest_points`; total là tổng câu của ván, `participant_count` là số người; `correct` giữ alias fully_correct. `submitted` đếm đáp án do người chơi chốt/bỏ qua, không đếm timeout; issued đếm số câu đã phát. Độ đúng phải hiển thị cùng mẫu số, ví dụ accuracy_sum/submitted và issued/total, không chỉ phần trăm. `questions` và `review` chỉ có idx < issued_count của chính người xem (sync dùng asked_count); câu đã phát chưa nộp có score=0, response=null, submitted=false. Các trường điểm tách cũng có trong từng câu. Quy tắc này áp cả retry-wrong, createAttempt, portfolio, sau restart và người đã rời.

Speed: bonus=round(400×clamp(1−ms/(seconds×1000),0,1)); tổng trước thưởng nhanh nhất=round(score×(600+bonus)); base_points=round(score×600), speed_points=tổng−base_points. Sync đóng câu hợp lệ mới quyết toán +100 cho mọi người đúng hoàn toàn có ms nhỏ nhất, cùng giao dịch chuyển reveal. Kết thúc giữa câu/interrupted không thưởng. Speed xếp points rồi accuracy_sum, hòa cả hai đồng hạng; accuracy giữ luật cũ. Cột điểm lịch sử null được đọc bằng score×100, không thay điểm cũ. `fast_response` là tín hiệu ms<1500 cho báo cáo, không giảm điểm.

Lỗi bổ sung: 400 `BATTLE_MODE_INVALID` (tổ hợp/enum sai); 403 `BATTLE_FEATURE_OFF`; 409 `BATTLE_CURSOR_CONFLICT`, `BATTLE_TOTAL_EXPIRED`, `BATTLE_QUESTION_CLOSED`. Lỗi quyền, kill switch, giới hạn hàng lệnh, 503 lưu DB và biên nhận giữ hợp đồng cũ. Restart luôn interrupted, không phục hồi ván đang chơi. Triển khai cần ngừng nhận ván mới và đợi các ván hiện tại kết thúc trước restart.

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
| POST | `/rooms/:id/join` | Học sinh, `{}`; phòng công khai, phòng mã có `open_slots:true` từ sảnh hoặc phòng lớp ghim. Phòng lớp không cần cờ `lobby` |
| POST | `/rooms/:id/leave` | Thành viên đang hoạt động / giáo viên chủ phòng, `{}` |
| POST | `/rooms/:id/ready` | Người chơi trong phòng chờ, `{ready:true,ranked?:false}`; `ranked` chỉ đổi lựa chọn của chính mình nếu chính sách cho phép phòng tự tạo tính hạng |
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
| POST | `/match` | Học sinh, vé linh hoạt `{kinds,choices,lengths,flex,ranked?,bot_fill?}`; hợp đồng V6.9.1 bên dưới |
| PATCH | `/match` | API cũ: `{accept:true}` trả **410**; chọn `flex:"gradual"` khi tạo vé mới |
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

`battle_enabled=false` mặc định: ngừng tạo/vào/bắt đầu ván mới, ván đang chạy chơi nốt. `battle_emergency_stop=true`: chặn chơi, gián đoạn ván, đóng luồng. `battle_modes` có `{class,duel_code,lobby,matchmaking,vote,ffa,team,bot,golden_hour,ranked,leaderboard}`; tất cả mặc định false. API quản trị Đấu nhận cập nhật từng cờ và giữ các cờ còn lại. Phòng lớp/thẻ ghim không phụ thuộc `lobby`. `battle_limits` gửi đủ các khóa như GET settings; cho phép hạ trần từ mặc định, không nâng quá mức chưa nghiệm thu tải.

HTTP: 400 sai dữ liệu; 403 sai quyền / khác khối / bị khóa; **403 `BATTLE_FEATURE_OFF`** khi khả năng tắt; 404 phòng/mã không tồn tại; 409 sai pha, chốt lặp với UUID khác, thiếu câu; 413 body quá lớn; 429 giới hạn; 503 hàng lệnh/DB bận hoặc **`BATTLE_UNAVAILABLE`** khi chưa khởi tạo.

`retry-wrong` không có câu sai trả 409 “Em không sai câu nào trong ván này”. Có câu sai nhưng tất cả bị thu hồi/cách ly trả 409 “Không còn câu sai dùng được để luyện lại”, kèm `details.excluded_questions`. Nếu chỉ bỏ một phần, số câu bỏ nằm trong `attempt.config.excluded_questions`. Nguồn `battle_retry` và `battle_room_id` giữ qua luyện lại tiếp; không ghi `mastery_events` hoặc tính lại `mastery_states` khi nộp. Huy hiệu Sửa sai đếm nguồn này; hồ sơ có `battle_retry_attempts`, nhãn “Luyện lại sau ván đấu”.

`GET /api/practice/review-questions` trả `{items}` cho chính học sinh, tối đa 100 mục từ lượt luyện và ván đã kết thúc. Mục ván có `room_id`, `index`, `question_id`, `topic_id`, `source:"battle"`, `source_label:"Ván đấu"`; không chứa đáp án. Database chưa có battle vẫn trả các câu tự luyện.

### Bổ sung V6.9.1–V6.9.2: vé linh hoạt, máy, giờ vàng, xếp hạng

Nguồn quyết định: `GHEP_TRAN_CHOT_V69.md` §1–§11, **§10.4 thay thế các điểm xung đột của §10.2–§10.3**. Cần cả hai migration mới `migration-v691-battle-flex.sql`, `migration-v692-battle-rank.sql` (đã đăng ký trong `upgrade.js`). Không thay migration V69. Phải triển khai migration bằng quy trình vận hành đã duyệt; các bài test chỉ dùng database tạm.

Vé mẫu:

```json
{"kinds":["duel","ffa"],"choices":[{"subject_id":1,"chapter":"Chương I"},{"subject_id":2,"topic_ids":[201]}],"lengths":[10,7],"flex":"gradual","ranked":true,"bot_fill":false}
```

- `kinds`: 1–2 giá trị `duel`, `ffa`. `choices`: tối đa 3 scope; mặc định `[]` = môn nào cũng được. Tất cả lựa chọn nội dung được xét ngay.
- `lengths`: mảng 1–3 số trong 7/10/15 hoặc `"any"` (mặc định). Mảng có thứ tự: ban đầu nhận độ dài đầu tiên; sau `length_ms` nhận mọi độ dài đã chọn. Nếu nhiều độ dài chung, lấy số nhỏ nhất đủ câu.
- `flex`: `strict` hoặc `gradual` (mặc định). Nới Chương/môn không vượt Bài xa nhất đã luyện theo `order_index,id`; các phần chủ động chọn ban đầu luôn được giữ. Chưa có lịch sử luyện thì không nới ngoài lựa chọn đó. Môn giờ vàng chỉ tăng tốc phạm vi của môn tương ứng; phần đã nới không bị thu hẹp khi hết giờ vàng.
- `ranked` mặc định true, là lựa chọn riêng của người gửi. Máy chủ chỉ tính khi khả năng bật và phạm vi/độ dài đủ điều kiện. Người bật/tắt vẫn dùng **một hàng chờ**. `bot_fill` mặc định false; chỉ lấp thêm máy vào nhóm FFA sau mốc khi tất cả người trong nhóm đã đồng ý.
- Body cũ `{kind,scope}` còn nhận, tương đương vé `strict`, 7 câu, không hạng. **Không còn bước PATCH đồng ý nới**; cần hủy vé rồi tạo vé mới để đổi lựa chọn. PATCH cũ trả 410, không âm thầm mở rộng.

`POST /match` trả `{current_room_id,queue}`; `queue:null` khi đã ghép. Vé và phòng không tồn tại đồng thời sau khi giao dịch thành công. Snapshot sảnh dùng trường `match` cho vé của chính người xem (cùng cấu trúc `queue` trả từ POST `/match`):

```json
{"kinds":["duel","ffa"],"choices":[{"subject_id":1}],"lengths":"any","accepted_kinds":["duel","ffa"],"accepted_lengths":[7,10,15],"flex":"gradual","ranked":true,"bot_fill":false,"joined_at":1792300000000,"elapsed_ms":12000,"current_scope_label":"Mở tới Chương trong phần em đã học","widened":"chapter","scope":{"subject_id":1,"topic_ids":[101,102]},"suggestion_room":null,"exits_available":false,"bot_available":false,"waiting":null,"school_practicing":12,"quick_question":{"type":"multiple_choice","stem":"…","options":[]}}
```

`waiting` là null khi chưa đạt ngưỡng 5; không suy ETA. `school_practicing` đếm học sinh hoạt động toàn trường trong cửa sổ mặc định 15 phút, hợp với người đang chờ/đang ở phòng, không cộng trùng; dữ liệu DB được làm mới tối đa mỗi 10 giây khi có vé. `quick_question` lấy từ lựa chọn ban đầu, không điểm, không đáp án/lời giải. `suggestion_room` là thẻ phòng phù hợp, **chưa tự đưa người vào**. Máy chủ kiểm lại phạm vi, kiểu, thời lượng, số câu, chỗ trống và chặn toàn bộ thành viên khi xác nhận.

| Method | Đường dẫn sau `/api/battle` | Hợp đồng |
|---|---|---|
| POST | `/match/accept-room` | `{room_id}`; cần vé còn hiệu lực. Trả `{current_room_id,queue:null}` sau commit; sai điều kiện mới trả 409. Phòng vừa rời bị loại khỏi gợi ý 5 phút |
| POST | `/match/exit` | `{to:"bot"\|"public_room"\|"practice",difficulty?:"easy"\|"medium"\|"hard"}`. Máy từ giây 15, hai lối ra kia từ mốc cuối. Practice trả `{to,scope,choices,current_room_id:null}` để client mở Luyện ngay; chưa tạo lượt luyện |
| POST | `/bot` | `{choices?:[scope],lengths?:"any"\|[7,10,15],difficulty?}` từ sảnh, trả 201 `{to:"bot",current_room_id,queue:null}`; không hạng và không cần chờ. Nếu đã có vé, dùng `/match/exit` |
| POST | `/rooms/:id/visibility` | Chủ phòng ở lobby: `{visibility:"code"\|"public",open_slots:boolean}`; trả snapshot |
| GET | `/rank` | Học sinh xem `{season,rating,history}` của mình; lịch sử tối đa 20 ván; không xuất MMR |
| PATCH | `/rank` | `{hidden:boolean}`; chỉ được hiện khi từ `visible_tier` trở lên, ẩn bất cứ lúc nào; trả `{ok:true}` |
| GET | `/leaderboard` | Tối đa 20 người cùng khối đã đồng ý hiện; 403 nếu cờ `leaderboard` tắt |
| GET / POST | `/golden-hours` | Quản trị hoặc giáo viên có quyền: danh sách được quản lý / tạo khung (201) |
| PUT / DELETE | `/golden-hours/:id` | Thay toàn bộ cấu hình khung / xóa; kiểm quyền cả phạm vi cũ và mới |
| PUT | `/admin/golden-hour-grants` | Chỉ quản trị: `{user_id,grade,subject_id:number\|null,enabled:boolean}`; null cấp/gỡ quyền toàn khối, số cấp/gỡ quyền môn đó trong khối |

Tạo phòng nhận thêm `open_slots:false`, `ranked:false`. Phòng `code` cần mã; `public` hiện ở sảnh; `code` + `open_slots:true` hiện khi còn chỗ và nhận người xác nhận gợi ý. Nhãn thẻ phòng mở chỗ: “Nhóm bạn đang tìm thêm người”. Phòng tự tạo mặc định không hạng. Nếu quản trị chủ động bật `battle_rank.self_created`, chỉ duel/FFA đủ phạm vi mới có thể tính: chủ phòng chọn `ranked:true` khi tạo, mỗi người khác tự chọn `ready.ranked:true`; không tự đổi lựa chọn của bạn cùng phòng.

Phòng ghép tự đánh dấu sẵn sàng, đếm ngược mặc định 5 giây. Sau countdown không nhận người mới. Phòng công khai/mở chỗ tự bắt đầu sau 60 giây liên tục đủ điều kiện, mọi người sẵn sàng; đổi trạng thái không đủ điều kiện hủy timer cũ. Chủ phòng vẫn bắt đầu sớm được. DTO thêm `auto_match`, `auto_start_at`, `open_slots`, `has_bots`, `label`, `ranked` theo người xem; người ảo có `is_bot:true`, `id:"bot:1"`, tên “Đối thủ máy”. ID này không phải tài khoản và không hợp lệ cho chặn/báo cáo. Thẻ/kết quả phòng có nhãn “Đấu với máy”; không cấp huy hiệu so sánh người thật cho ván có máy. Bot không có lịch sử cá nhân.

Kết quả riêng thêm `rank_result:{delta_lp,lp_after,reason}` nếu có sự kiện tính hạng. `reason` có độ rộng, cờ máy, lý do giảm/trần/khiên, `tier_before`, `tier_after`, `visibility_offer` để client hiện lời chúc và nút lựa chọn khi đạt Tinh anh. Huy hiệu công khai chỉ có tên bậc/cấp; MMR, kế hoạch đáp án máy, dữ liệu tổng hợp đầu vào máy và lựa chọn hạng riêng không được phát cho người khác. Các quy tắc DTO theo pha, ACK sau commit, chống UUID trùng của V69 tiếp tục áp dụng.

Ví dụ khung giờ vàng, giờ ISO có offset, `repeat_weekdays:null` = một lần; mảng 0–6 = Chủ nhật–Thứ bảy theo UTC+7:

```json
{"grade":8,"subject_id":1,"starts_at":"2026-10-20T20:00:00+07:00","minutes":15,"repeat_weekdays":[2,4],"active":true}
```

Snapshot sảnh thêm `golden_hours:[{id,grade,subject_id,starts_at,ends_at,active,countdown_ms,participants}]`, thời điểm DTO tính bằng epoch mili giây. Banner từ trước 30 phút, cập nhật tại mốc kể cả không có vé. `participants` đếm vé và người thật đang chơi đúng khối/môn; không có thưởng riêng, không ảnh hưởng thành thạo.

### Tham số V6.9.1–V6.9.2

`GET /admin/settings` trả đầy đủ giá trị. `POST /admin/settings` nhận từng phần của `battle_modes`, `battle_flex`, `battle_rank`, gộp với hiện tại rồi kiểm tra; khóa lạ bị từ chối. Đơn vị `_ms` là mili giây. Nguồn đầy đủ, gồm giới hạn validation: `backend/src/services/battle/settings.js`.

| Nhóm | Khóa và mặc định |
|---|---|
| Nới / ghép | `chapter_ms:10000`, `subject_ms:20000`, `exit_ms:30000`, `length_ms:10000`, `kind_ms:0`, `round_ms:2000`, `batch_size:50` (trần 50), `min_group:3`, `max_group:20`, `pair_ms:20000`, `seconds:30` |
| Phòng / hiển thị | `countdown_ms:5000`, `public_start_ms:60000`, `exclude_ms:300000`, `waiting_visible_min:5`, `activity_ms:900000` |
| Giờ vàng | `golden_chapter_ms:5000`, `golden_subject_ms:10000`, `golden_exit_ms:15000`, `golden_banner_ms:1800000` |
| Máy | `bot_ms:15000`, `bot_default:"medium"`, `bot_easy:0.85`, `bot_medium:1`, `bot_hard:1.15`, `bot_min_samples:10`, `bot_nb:0.8`, `bot_th:0.65`, `bot_vd:0.45`, xác suất `bot_probability_min:0.05`–`bot_probability_max:0.95`, thời gian `bot_time_min:0.35`–`bot_time_max:0.85` |
| Mùa / MMR (`battle_rank`) | `season:"2026-HK1"`, `base_mmr:1000`, `reset_factor:0.5`, `lp_reset_factor:0.5`, `mmr_window:250`, `mmr_window_ms:8000`, `mmr_k:24`, `mmr_scale:400` |
| LP | `duel_win:25`, `duel_loss:-10`, `underdog_gap:150`, `underdog_win:35`, `underdog_loss:-5`, `tie:10`, `lp_three:[30,10,-8]`, `lp_four:[35,18,-5,-10]`, `chapter_factor:1`, `subject_factor:1.1`, `multi_subject_factor:1.2` |
| Máy có hạng | `bot_wait_ms:25000`, `bot_win_cap:12`, `bot_loss:-5`, `bot_daily:3` |
| Chống cày / mạng | `pair_daily:10`, `streak_wins:3`, `streak_factor:0.5`, `abnormal_ms:2000`, `abnormal_factor:0.5`, `shield_daily:1` |
| Bậc / phạm vi | `max_players:4`, `division_lp:100`, `divisions:3`, `placement_games:3`, `placement_bonus:5`, `visible_tier:2`, `narrow_ratio:0.5`, `ranked_lengths:[7,10]`, `self_created:false`; `tiers` có 6 tên học thuật |

Phạm vi tính hạng tối thiểu cả Chương. Người chọn một Bài ở giai đoạn chưa nới không tính hạng. Rộng gặp hẹp: chia câu hẹp/rộng trong trần chung, số câu hẹp làm tròn lên (7 câu → 4+3); không đủ phần rộng thì không tự lấy ngoài trần. Người không tính hạng không nhận/thay đổi LP hoặc MMR; dữ liệu nền có thể được khởi tạo để so sánh MMR công bằng.

LP cập nhật cùng giao dịch kết thúc ván và khóa duy nhất `(room_id,user_id)`. Đồng hạng FFA lấy trung bình vị trí bị chiếm rồi làm tròn. Hệ số độ rộng và thưởng định vị áp dụng trước trần máy. Chuỗi thắng xét đúng cặp và phạm vi; dấu hiệu bất thường giảm LP dương; giới hạn ngày xét UTC+7, xuyên mã mùa, chặn cả LP/MMR sau trần. Văng luồng không tự rời phòng; giữ điểm đã tích lũy và khiên lần đầu nếu bị âm LP. Chủ động rời tính hạng chót, không dùng khiên. Restart/dừng khẩn cấp gián đoạn không chốt LP.

Mùa = mã học kỳ do quản trị đặt; reset mềm khi người chơi có ván hạng đầu ở mã mùa mới, không xóa sự kiện mùa cũ. MMR riêng từng môn, ghép nhiều môn dùng trung bình; sau 8 giây chờ của mọi thành viên bỏ cửa sổ. Bậc chung Tập sự → Khám phá → Tinh anh → Thông thái → Bậc thầy → Thách đấu, mỗi bậc III–I ×100 LP; không tụt bậc lớn trong mùa. Bậc mặc định ẩn, từ Tinh anh có thể chủ động hiện; bảng cao thủ tắt mặc định. Rank tách biệt mastery và điểm học tập.
