# Kế hoạch: tab "Đấu" — thi đấu kiến thức giữa học sinh (V6.9)

**Trạng thái:** planned — anh Hiếu đã trả lời Q1–Q5 (18/10); bản kế hoạch đầy đủ để gửi AI góp ý: `docs/thiet-ke/KE_HOACH_DAU_TRUONG_V69.md` (nguồn chính, ưu tiên hơn tệp này khi lệch). Tạm dừng code chờ góp ý; đã có 2 tệp nháp chưa nối vào app: `backend/src/services/battle/engine.js`, `backend/src/db/migration-v69-battle.sql`.
**Ngày lập:** 2026-10-18. **Nhánh hiện tại:** `perf-v6671-followup` (HEAD `5fb9420`).
**Demo giao diện đã có:** `docs/thiet-ke/dau-truong-demo/index.html` (Gemini "4 Argon" dựng, dữ liệu giả, chưa commit) + 14 ảnh trong `anh/`.

## 1. Mục tiêu và phạm vi

Thêm tab **Đấu** cạnh "Tự luyện" cho học sinh: đấu đôi, đấu đội, nhiều người chơi, cả lớp cùng đấu. Có **sảnh** hiện các phòng do học sinh tạo, lọc theo môn và chủ đề; **tìm đối thủ** cùng môn hoặc cùng chủ đề; phòng **chưa chọn nội dung** thì vào phòng rồi **cả phòng cùng chọn** môn, rồi (tuỳ) chủ đề.

Quyết định đã chốt (anh Hiếu, 18/10):
- Điểm thành thạo của ván đấu **chỉ tính trong ván**; không ghi vào `mastery_states`. Lưu đủ chi tiết từng câu để sau này gộp nếu muốn.
- **Ghép tự do**, không có công tắc theo lớp.
- **Không chat tự do**; chỉ biểu cảm có sẵn.
- Lên kế hoạch chi tiết và duyệt giao diện trước khi triển khai.

Ngoài phạm vi: chat, bạn bè/kết bạn, đấu khác trường, gọi thoại, tiền ảo/vật phẩm, gộp thành thạo.

## 2. Trải nghiệm người dùng

### 2.1 Sảnh Đấu (`/practice/battle`)
- Đầu trang: lời chào, chuỗi ngày, nút chính **"Tìm đối thủ"** và **"Tạo phòng"**.
- Thẻ "Cả lớp cùng đấu" nổi bật khi thầy cô lớp em đang mở phòng (giai đoạn 4).
- **Danh sách phòng đang chờ** (chỉ phòng công khai, cùng khối, còn chỗ):
  - Bộ lọc một hàng: Môn (chip) · Chủ đề (Chương / Bài, phụ thuộc môn) · Kiểu (Đôi / Đội / Nhiều người) · "Còn chỗ".
  - Mỗi thẻ phòng: kiểu, môn + chủ đề **hoặc nhãn "Chưa chọn nội dung · cùng chọn khi vào"**, số người `3/8`, chủ phòng (tên gọi + lớp), số câu, nút **Vào**.
  - Cập nhật trực tiếp (luồng SSE của sảnh); phòng đầy hoặc đã bắt đầu thì tự biến mất.
- Ô **nhập mã phòng** 6 số (phòng riêng tư không hiện trong sảnh).
- "Ván đấu của em": 10 ván gần nhất, bấm xem lại kết quả.

### 2.2 Tạo phòng (sheet)
Kiểu (Đôi 2 · Đội 2–4/đội · Nhiều người 3–20) · Công khai / Chỉ qua mã · Số câu 7/10/15 · Thời gian mỗi câu 20/30/45 giây (mặc định 30 cho KHTN) · **Nội dung: "Chọn ngay" hoặc "Để cả phòng cùng chọn"**.
Chọn ngay: môn → (tuỳ) Chương/Bài; chỉ hiện lựa chọn đủ câu, ghi số câu có sẵn.

### 2.3 Tìm đối thủ (ghép tự do)
- Chọn: Kiểu (Đôi / Nhiều người) · Môn hoặc **"Môn nào cũng được"** · (tuỳ) Chương/Bài.
- **"Chưa biết đấu phần nào?"** → gợi ý riêng cho em lấy từ bản đồ bài học (Bài đang học, Bài đang vướng); chỉ em thấy, không lộ điểm yếu cho người khác. Có nút "Bốc thăm".
- Hiện số bạn đang tìm trận theo môn ("5 bạn đang tìm trận Lý").
- Nới dần (có hỏi): sau 20 giây đề nghị mở rộng Bài → Chương; sau 40 giây → cả môn; sau 60 giây đề nghị "Mở phòng chờ công khai" để phòng hiện ở sảnh.

### 2.4 Cùng chọn nội dung trong phòng (phòng "chưa chọn nội dung")
- **Bước 1 — Môn:** mỗi bạn chạm một môn (chỉ hiện môn đủ câu cho cấu hình phòng). Bảng phiếu hiện trực tiếp.
  - Mọi người cùng chọn một môn → chốt ngay.
  - Hết 20 giây → môn nhiều phiếu nhất; hoà → bốc thăm trong các môn hoà (có hiệu ứng bốc thăm).
- **Bước 2 — Có thu hẹp chủ đề không? (tuỳ chọn):** mặc định "Cả môn".
  - Mỗi bạn đề xuất tối đa 2 Chương/Bài (danh sách chỉ gồm phần đủ câu, có chip "Gợi ý cho em").
  - Mỗi bạn bấm đồng ý các đề xuất trong 30 giây.
  - Đề xuất được từ một nửa số người trở lên đồng ý thì giữ; ghép các đề xuất được giữ; nếu tổng câu không đủ → nới lên Chương rồi cả môn, và báo rõ.
  - Chủ phòng có nút "Chốt luôn" khi đa số đã đồng ý.
- Sau khi chốt: phòng chờ hiện "Lý 9 · Điện học · 10 câu · 30 giây/câu", bấm Sẵn sàng → chủ phòng Bắt đầu → đếm 3-2-1.

### 2.5 Trong ván
- Mọi người nhận **cùng câu cùng lúc**; đồng hồ do máy chủ giữ (client tính từ `deadline` và `serverNow`).
- Chọn → bấm **Chốt** (đổi ý được trước khi chốt). Hết giờ mà chưa chốt: xem quyết định Q1.
- Sau mỗi câu: đúng/sai bằng chữ + biểu tượng, cả phòng chọn gì, lời giải, điểm. Đôi / nhiều người: sang câu khi mọi người bấm "Câu tiếp" hoặc sau 15 giây. Cả lớp: cô chuyển.
- Biểu cảm có sẵn: 👏 🔥 😅 💪 (tối đa 1 lần/3 giây/người).
- Rời ván: các bạn còn lại chơi tiếp; vào lại được trong 60 giây.

### 2.6 Kết quả
Podium, bảng xếp hạng, huy hiệu ngoài thắng thua, "Câu cả phòng hay sai", **"Trong ván này em: Điện học 4/5 · Định luật Ôm 2/3"** (thành thạo của ván), nút **"Luyện lại các câu em vừa sai"** (tạo lượt tự luyện bình thường — lượt này *có* tính vào thành thạo như mọi lượt tự luyện), "Đấu ván nữa" (giữ phòng và người), "Về sảnh". Ghi chú: "Kết quả ván đấu không ảnh hưởng điểm thành thạo."

### 2.7 An toàn học sinh (bắt buộc dù ghép tự do)
- Chỉ ghép trong trường, **cùng khối**; tên hiển thị = **tên gọi + lớp** ("Bảo Ngọc · 9A2"), không hiện họ tên đầy đủ hay mã học sinh.
- Không chat; biểu cảm có sẵn.
- Menu mỗi người chơi: **Báo cáo** (lý do có sẵn) và **Chặn** (không bao giờ ghép lại với nhau, không thấy phòng của nhau).
- Quản trị: danh sách báo cáo; **công tắc tắt toàn bộ tính năng** (`system_settings.battle_enabled`) cho trường hợp khẩn.

## 3. Luật điểm

- Mỗi câu: `điểm = 100 × kết quả chấm (0–1)`; đúng thì cộng thưởng tốc độ `round(30 × (1 − thời gian/T))`. Sai hoặc không trả lời = 0, **không trừ điểm**.
- Câu Đúng/Sai 4 ý (giai đoạn 5): chấm theo tỉ lệ ý đúng như `gradeQuestion` hiện có.
- Xếp hạng: điểm ↓ → số câu đúng ↓ → tổng thời gian ↑.
- Đội: điểm đội mỗi câu = **trung bình** điểm thành viên (đội ít người không thiệt); tổng đội = cộng các câu.
- Huy hiệu: Chính xác nhất (tỉ lệ đúng cao nhất), Nhanh mà chắc (thời gian trung bình thấp nhất trong số bạn đúng ≥ 80%), Tiến bộ nhất (so với trung bình 5 ván gần nhất cùng môn của chính em; chưa đủ lịch sử thì không trao).

## 4. Kiến trúc kỹ thuật

### 4.1 Máy chủ (Express hiện có, một tiến trình Node trên Home)
- `backend/src/services/battle/`
  - `engine.js` — hàm thuần, không I/O: chuyển trạng thái phòng, chấm điểm, giải quyết phiếu chọn nội dung, xếp hạng, huy hiệu. Test đơn vị toàn bộ.
  - `deck.js` — chọn câu: dùng `candidates()` nhưng **chỉ kho trường** (`b.kind='school'`, để mọi người chơi đều được thấy câu) + điều kiện "học sinh luyện được" đang có, cùng khối, lọc Bài; giai đoạn 1 chỉ trắc nghiệm 4 lựa chọn; trộn mức bằng `fitPercent` (mặc định NB 40 / TH 40 / VD 20); kiểm đủ câu trước khi cho chọn.
  - `rooms.js` — sổ phòng trong bộ nhớ (Map) + hẹn giờ + ghi xuống Postgres ở mỗi mốc (tạo, chốt nội dung, bắt đầu, mỗi câu trả lời, kết thúc).
  - `matchmaking.js` — hàng chờ theo khoá `(khối, kiểu, môn|*, phạm vi)`, nới dần, tôn trọng danh sách chặn.
  - `stream.js` — SSE: `GET /api/battle/lobby/stream`, `GET /api/battle/rooms/:id/stream`. Gửi ảnh chụp trạng thái có `version`; nhịp giữ kết nối 15 giây; `Last-Event-ID` → gửi lại ảnh chụp; tối đa 3 luồng/người.
- `backend/src/routes/battle.js`, gắn `app.use('/api/battle', apiLimiter, battleRoutes)` (giới hạn theo người dùng 300/phút là đủ; luồng SSE là một kết nối dài).
- Đáp án **không bao giờ** nằm trong ảnh chụp trước pha lời giải: câu gửi đi qua `studentQuestion(version,false)`, lời giải chỉ thêm khi `reveal`.
- Trả lời trễ hơn `deadline` + 500 ms hoặc sai `index` → từ chối.
- Khởi động lại máy chủ: phòng đang chờ → đóng; phòng đang chơi → kết thúc với kết quả tới câu cuối đã ghi, hiện thông báo khi học sinh mở lại.
- Redis đã có trên Home: chưa cần cho bản một tiến trình; ghi chú để sau dùng pub/sub nếu chạy nhiều tiến trình.

### 4.2 API (dự kiến)
| Method | Đường dẫn | Việc |
|---|---|---|
| GET | `/api/battle/lobby` | phòng công khai cùng khối + số người đang tìm trận theo môn; lọc `subject_id`, `topic_id`, `chapter`, `kind` |
| GET | `/api/battle/options` | môn / Chương / Bài đủ câu cho khối của em + gợi ý riêng từ bản đồ bài học |
| POST | `/api/battle/rooms` | tạo phòng |
| POST | `/api/battle/rooms/join` | vào bằng mã |
| POST | `/api/battle/rooms/:id/join` · `/leave` · `/ready` · `/team` | vào từ sảnh, rời, sẵn sàng, đổi đội |
| POST | `/api/battle/rooms/:id/vote` | phiếu môn / đề xuất và đồng ý chủ đề |
| POST | `/api/battle/rooms/:id/start` · `/next` · `/pause` · `/end` | chủ phòng / giáo viên điều khiển |
| POST | `/api/battle/rooms/:id/answer` | `{index, response}` — chốt đáp án |
| POST | `/api/battle/rooms/:id/emote` | biểu cảm có sẵn |
| POST | `/api/battle/rooms/:id/retry-wrong` | tạo lượt tự luyện từ các câu em sai trong ván |
| POST · DELETE | `/api/battle/match` | vào / rời hàng chờ ghép tự do |
| POST | `/api/battle/reports` · `/blocks` | báo cáo, chặn |
| GET | `/api/battle/history` · `/rooms/:id/result` | lịch sử, kết quả |

### 4.3 Dữ liệu (một migration chỉ thêm bảng, `migration-v69-battle.sql`)
- `battle_rooms(id uuid, code char(6), kind, visibility, host_id, class_id NULL, grade, subject_id NULL, scope jsonb NULL /* chương, bài */, question_count, seconds, status, content_mode /* preset | vote */, created_at, started_at, finished_at, end_reason)`; chỉ mục duy nhất trên `code` cho phòng chưa kết thúc.
- `battle_players(room_id, user_id, team NULL, display_name, class_name, joined_at, left_at, score, correct, rank)`.
- `battle_questions(room_id, idx, question_version_id, topic_id, cognitive_level)` — bộ câu đóng băng.
- `battle_answers(room_id, idx, user_id, response jsonb, score numeric, points int, ms int, answered_at)`, duy nhất `(room_id, idx, user_id)` — đủ để sau gộp thành thạo.
- `battle_reports(id, room_id, reporter_id, target_id, reason, created_at, handled_by, handled_at)`, `battle_blocks(user_id, blocked_id, created_at)`.
- `system_settings`: `battle_enabled` (mặc định true), `battle_limits` (cỡ phòng, số câu, giây).
- **Không** ghi `attempts` / `mastery_states` từ ván đấu. Riêng "Luyện lại câu sai" tạo `attempts` bình thường: thêm tham số nội bộ cho `createAttempt` nhận danh sách câu cố định, đã kiểm là của chính em trong ván đó.

### 4.4 Giao diện (React hiện có)
- `frontend/src/pages/battle/`: `ArenaLobby.jsx`, `CreateRoomSheet.jsx`, `FindMatchSheet.jsx`, `RoomPage.jsx` (máy trạng thái: chọn nội dung → chờ → đếm ngược → câu → lời giải → kết quả), `ContentVote.jsx`, `AnswerTiles.jsx`, `RankStrip.jsx`, `Podium.jsx`, `ConnectionBanner.jsx`, `ProjectorPage.jsx` (giai đoạn 4).
- `frontend/src/hooks/useBattleStream.js` (EventSource, tự nối lại, giữ ảnh chụp mới nhất theo `version`).
- `frontend/src/styles/arena.css`: dùng token sẵn có của `theme.css`, thêm bộ màu đấu trường (4 màu ô đáp án ▲●■◆, dải vạch xuất phát #153F57 / #F5B82E).
- `config/navigation.js`: thêm `{to:'/practice/battle', label:'Đấu'}` vào `studentLinks` sau "Tự luyện"; trang chủ học sinh có thẻ nhỏ "Phòng đang mở cho lớp em".
- Lấy bố cục, màu, chữ từ demo đã duyệt, **viết lại** bằng component của app (không chép nguyên tệp demo 121 KB).

### 4.5 Hạ tầng cần kiểm
- Caddy (`deploy/Caddyfile*` có `encode gzip`): đảm bảo SSE không bị gom đệm (`Cache-Control: no-transform`, `X-Accel-Buffering: no`; nếu cần loại `/api/battle/*/stream` khỏi `encode`). Kiểm trên máy thử cùng cấu hình.
- Đường truy cập từ xa của Home (`docs/HOME_REMOTE_ACCESS_RUNBOOK.md`) có thể cắt kết nối im lâu: nhịp 15 giây.
- `helmet` CSP hiện tại không chặn SSE cùng origin; `csrfGuard` chỉ cần cho POST.
- Tải: đo trên **máy thử với database sao chép**, không đo production. Mục tiêu: 300 học sinh mô phỏng (15 phòng × 20) + 100 trong hàng chờ, p95 trả lời < 300 ms, CPU Home còn dư.

## 5. Giai đoạn và tiêu chí nghiệm thu

### Giai đoạn 0 — Demo giao diện v2 (để duyệt)
Sửa lỗi demo Gemini (mục 6) và bổ sung màn mới: bộ lọc sảnh, thẻ phòng "chưa chọn nội dung", sheet Tạo phòng, sheet Tìm đối thủ (gợi ý cho em, nới dần), màn **Cùng chọn nội dung** (bước môn + bước chủ đề), menu Báo cáo / Chặn, dải biểu cảm.
**Nghiệm thu:** không phần tử nào bị cắt ở 360 / 390 / 1366 px (kiểm từng phần tử, không chỉ tràn trang); không lỗi console; anh Hiếu duyệt.

### Giai đoạn 1 — Nền + Đấu đôi + Sảnh phòng học sinh tạo + Cùng chọn nội dung
Migration, engine, deck, rooms, SSE, API tạo / vào / bỏ phiếu / trả lời / kết quả / luyện lại câu sai; giao diện sảnh, tạo phòng, phòng, ván, kết quả; tên gọi + lớp; công tắc tắt tính năng.
**Nghiệm thu:** 2 học sinh khác lớp cùng khối đấu trọn ván trên 2 trình duyệt; phòng hiện và biến mất trên sảnh đúng lúc; bỏ phiếu môn → chủ đề chốt đúng luật (thống nhất, đa số, hoà bốc thăm, không đủ câu thì nới); đáp án không lộ trước lời giải (kiểm nội dung luồng SSE); trả lời trễ / sai câu bị từ chối; khác khối không vào được; `mastery_states` không đổi sau ván; "Luyện lại câu sai" tạo lượt đúng các câu sai.

### Giai đoạn 2 — Tìm đối thủ tự do + Nhiều người chơi + Báo cáo / Chặn + Lịch sử
**Nghiệm thu:** ghép đúng theo môn / chủ đề, nới dần có hỏi; người đã chặn nhau không bao giờ cùng phòng; phòng 20 người chạy ổn; báo cáo hiện ở trang quản trị.

### Giai đoạn 3 — Đấu đội
**Nghiệm thu:** chọn / đổi đội ở phòng chờ, điểm đội tính trung bình, thanh kéo co, đội lệch người vẫn công bằng.

### Giai đoạn 4 — Cả lớp cùng đấu + Chế độ chiếu
Giáo viên của lớp (theo `teacher_class_assignments`) mở phòng gắn lớp, chọn Bài, điều khiển chuyển câu / tạm dừng; màn chiếu 16:9; học sinh lớp đó thấy thẻ ở trang chủ và sảnh.
**Nghiệm thu:** 40 học sinh mô phỏng + 1 màn chiếu; giáo viên lớp khác không mở được phòng cho lớp này.

### Giai đoạn 5 — Mở rộng
Câu Đúng/Sai 4 ý, câu trả lời ngắn; huy hiệu Tiến bộ nhất đầy đủ; (khi anh quyết) gộp thành thạo từ `battle_answers`.

## 6. Kế hoạch sửa lỗi demo Gemini (giai đoạn 0)

Lỗi đã thấy trên 14 ảnh (Playwright, 390 × 844 và 1366 × 800):

| # | Màn | Lỗi | Cách sửa |
|---|---|---|---|
| 1 | Sảnh · điện thoại | Mép phải bị cắt: ô nhập mã mất nút "Vào", nhãn "6 chữ số", hàng "Phòng đang chờ" và chữ "Chạm để vào ngay" bị cụt | Thẻ và hàng dùng `min-width:0`, `flex-wrap`, lưới `minmax(0,1fr)`; nút xuống dòng dưới ở < 400 px |
| 2 | Thanh trên cùng | Nhãn "Tự ôn" xuống dòng thành "Tự / ôn" | `white-space:nowrap`, giảm đệm; < 380 px chỉ còn biểu tượng + nhãn ngắn |
| 3 | Mọi màn | Thanh "Chấm demo" chiếm ~1/5 màn điện thoại, che nội dung và nút "Tạm dừng", "Kết thúc" ở màn chiếu | Thu thành nút nổi nhỏ "Demo ▾" ở góc, bấm mới mở danh sách màn |
| 4 | Sảnh · máy tính | Thẻ "Nhiều người chơi" đứng một mình, cột phải trống | Cân lại lưới, hoặc ba kiểu tự tạo thành một hàng 3 cột |
| 5 | Kết quả | Điểm ghi "2.490đ" đọc nhầm thành tiền đồng | Ghi "2.490 điểm" |
| 6 | Phòng chờ · điện thoại | Tên bị cắt "Phạm Bảo …", "Nguyễn Mi…" | Hiện tên gọi + lớp ("Bảo Ngọc · 9A2"); họ tên đủ chỉ trong `title` |
| 7 | Phòng chờ | Nút "Bắt đầu" hiện cả với người không phải chủ phòng | Chỉ chủ phòng thấy; người khác thấy "Chờ chủ phòng bắt đầu" |
| 8 | Trạng thái 7C | "Hết giờ … hệ thống tự ghi nhận phương án A" mâu thuẫn quy tắc "chọn chưa phải gửi" | Theo quyết định Q1 |
| 9 | Mã phòng | Lúc "482 910", lúc "#519204" | Thống nhất "Mã 519 204" (font mono, nhóm 3 số) |
| 10 | Lời mời ở sảnh | "So tài 5 câu tốc độ", "Rèn phản xạ nhanh" đề cao tốc độ, lệch luật điểm lấy đúng làm chính | "So tài cùng bạn — đúng trước, nhanh sau" |

Cách làm: gửi tiếp cho Gemini trong **cùng cuộc trò chuyện** (nó giữ ngữ cảnh) danh sách lỗi + màn mới; lấy mã về; em kiểm lại bằng Playwright ở 360 / 390 / 1366 px kèm kiểm **từng phần tử** (`getBoundingClientRect().right ≤ innerWidth`) và xem ảnh từng màn. Nếu Gemini sửa không đạt sau 1 lần, em sửa tay trong tệp demo.

## 7. Kiểm thử
- Đơn vị: engine (điểm, xếp hạng, đội, huy hiệu, phiếu bầu: thống nhất / đa số / hoà / không đủ câu / người rời giữa lúc bầu), deck (chỉ kho trường, đủ câu, trộn mức), ghép trận (khoá, nới dần, chặn).
- Tích hợp (database sao chép như các test hiện có): 2–3 học sinh qua API + SSE; khác khối bị chặn; đáp án ẩn trước lời giải; trả lời trễ; vào lại sau khi rớt mạng; máy chủ khởi động lại giữa ván; `mastery_states` không đổi; quyền giáo viên ở giai đoạn 4.
- Trình duyệt: Playwright 2 ngữ cảnh đấu trọn ván, chụp ảnh điện thoại / máy tính / màn chiếu, không tràn, không lỗi console.
- Smoke CI: thêm hành trình 6 "đấu đôi qua API" vào `backend/test/smoke/journeys.test.js`.
- Tải: kịch bản mô phỏng trên máy thử (mục 4.5). Không chạy trên production.

## 8. Rủi ro
- Máy Home từng quá tải lúc build: ván đông người trong giờ học cần đo trước; có công tắc tắt nhanh.
- SSE qua proxy / đường truy cập từ xa: kiểm sớm ở giai đoạn 1.
- Học sinh ghép tự do với bạn lạ: giảm bằng cùng khối, tên gọi + lớp, không chat, báo cáo / chặn.
- Kho trường thiếu câu ở một số Bài: chỉ hiện lựa chọn đủ câu; bảng độ phủ câu hỏi (V6.8) giúp tổ trưởng bù.

## 9. Câu hỏi đã chốt (18/10): Q1 không tính khi chưa Chốt · Q2 tên gọi + lớp · Q3 dùng cả TN, ĐS, TLN, GN ngay · Q4 làm đủ các chế độ một đợt; phòng chờ: mọi người Sẵn sàng thì chủ phòng bấm chạy · Q5 có công tắc tắt toàn bộ

### Câu hỏi gốc
- **Q1.** Hết giờ mà em đã chọn nhưng chưa bấm Chốt: *không tính* (em đề xuất — công bằng với bạn đã chốt) hay tự tính đáp án đang chọn?
- **Q2.** Tên hiển thị: tên gọi + lớp (em đề xuất) hay họ tên đầy đủ?
- **Q3.** Giai đoạn 1 chỉ dùng câu trắc nghiệm 4 lựa chọn (em đề xuất), thêm Đúng/Sai ở giai đoạn 5?
- **Q4.** Thứ tự: Đấu đôi + Sảnh trước, Cả lớp sau cùng — đúng không?
- **Q5.** Giữ công tắc tắt toàn bộ tính năng cho quản trị (không phải theo lớp) — được không?

## 10. Checklist
- [ ] Anh Hiếu duyệt kế hoạch + trả lời Q1–Q5
- [ ] GĐ0: demo v2 sửa 10 lỗi + màn mới; kiểm từng phần tử 360/390/1366; anh duyệt
- [ ] GĐ1: migration v69, engine + test, deck, rooms + SSE, API, giao diện sảnh / phòng / ván / kết quả, tích hợp + trình duyệt + smoke
- [ ] GĐ2: ghép tự do, nhiều người, báo cáo / chặn, lịch sử
- [ ] GĐ3: đấu đội
- [ ] GĐ4: cả lớp + màn chiếu
- [ ] GĐ5: Đúng/Sai, trả lời ngắn, huy hiệu Tiến bộ nhất
- [ ] Đo tải trên máy thử trước khi "up main"
