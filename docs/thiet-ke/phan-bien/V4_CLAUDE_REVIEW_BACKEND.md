# Vòng 4 — Claude review backend V6.9 do Codex viết

**Phạm vi:** trạng thái làm việc trên nhánh `feat-v69-battle` lúc 13:30 18/10 (Codex dừng vì hết hạn mức; chưa commit). Đối chiếu kế hoạch 1.3, đặc biệt §23.
**Đã chạy:** `npm test` 179/179 · `npm run test:security` 27/27 · `test/integration/v69-battle.test.js` 3/3 (ván 3 người đủ 4 loại câu; phòng lớp pause/resume, sát hạn / đóng / trễ; restart giữ ACK, `interrupted` chỉ lộ câu đã phát; dừng khẩn cấp). Toàn bộ integration đang chạy lại để kiểm hồi quy.
**Nhận xét chung:** kiến trúc đúng §23 — hàng lệnh theo phòng + khoá học sinh theo thứ tự, ghi DB trước ACK, tra biên nhận trước điều kiện pha, `schedule_version`, DTO theo pha với `through = asked_count − 1`, `asked_count` cho kết thúc sớm, `battle_retry` không tạo `mastery_events`. Các mục dưới là phần cần sửa.

## Chặn (phải sửa trước khi giao giao diện)

**B0. Server không khởi động được khi database chưa có bảng V6.9 → toàn bộ integration cũ fail (30/30 ca đầu).**
`server.js:133` gọi `initializeBattle()` → `store.recover()` → `UPDATE battle_rooms …`; trên database chưa chạy migration v69 thì lỗi và tiến trình thoát ("❌ Lỗi kết nối DB: Chưa lưu được dữ liệu ván"). Các test cũ clone database nguồn (chưa có v69) nên đều chết ở bước khởi động; riêng `v69-battle.test.js` qua vì tự chạy `upgrade.js` trên bản clone.
→ Tính năng Đấu **không bao giờ** được làm sập app: `initializeBattle` bắt lỗi thiếu bảng (`42P01`) và mọi lỗi khởi tạo khác → ghi log cảnh báo, đặt Đấu ở trạng thái không khả dụng (route `/api/battle/*` trả 503 "Đấu chưa sẵn sàng"), app vẫn chạy. Thêm test: khởi động server trên database chưa có bảng battle → `/api/health` OK, `/api/battle/me` 503. Sau khi sửa, chạy lại **toàn bộ** `npm run test:integration` phải xanh như trước (168 ca cũ + v69).

**B1. Mỗi câu trả lời kích hoạt tính lại sảnh cho mọi người đang ở sảnh, mỗi lần nhiều truy vấn DB.**
`rooms.js` `publish()` luôn gọi `streams.publish('lobby')`; `lobby(user)` gọi `identity(user)` (1 truy vấn) và `safety.blockedWith` **cho từng phòng** (N truy vấn) cho **mỗi** người nghe sảnh. Trong ván 50 người, mỗi 250 ms là (số người ở sảnh × (1 + số phòng)) truy vấn.
→ Chỉ phát `lobby` khi thay đổi liên quan sảnh (phòng ở `lobby`: tạo / vào / rời / đổi nội dung / bắt đầu / đóng; hàng chờ đổi). `lobby(user)`: một truy vấn lấy toàn bộ quan hệ chặn của người xem, lọc trong bộ nhớ; cache `identity` theo người dùng trong suốt vòng đời luồng (xoá khi luồng đóng) hoặc 60 giây.

**B2. Ghép trận O(n²) truy vấn DB.**
`matchmaking.attempt()` gọi `safety.blockedWith` và `deck.count` bên trong vòng lặp đôi cho mỗi lần `match()`. 100 người chờ → hàng nghìn truy vấn mỗi lần có người vào hàng.
→ Mỗi lần `attempt`: một truy vấn lấy cặp chặn giữa tất cả người đang chờ; `deck.count` đi qua cache (xem B3). Thêm unit test 100 người chờ với DB giả đếm số truy vấn (≤ 3 / lần ghép).

**B3. `deck.contentOptions()` và `deck.count()` quét + kiểm toàn bộ câu của khối mỗi lần gọi** (ghi chú review số 2 trước đó chưa sửa): `contentOptions` không cache; `count` cache theo phạm vi nhưng lần đầu mỗi phạm vi vẫn quét cả khối.
→ Cache danh sách câu đủ điều kiện **theo khối** 60 giây (một lần quét / khối), lọc và đếm trong bộ nhớ; `draw()` vẫn quét mới.

## Quan trọng

**Q1. Khởi động lại: phòng chờ bị đánh dấu `interrupted`** (`storage.recover`). Kế hoạch §16: phòng chờ → `closed`, đang chơi → `interrupted`. Tách hai câu `UPDATE`.

**Q2. Caddy matcher `not path /api/battle/*/stream`:** cần xác nhận Caddy hỗ trợ `*` ở giữa đường dẫn; nếu không, dùng `path_regexp` `^/api/battle/(lobby|rooms/[^/]+)/stream$`. Thêm vào báo cáo cách kiểm (`caddy adapt`/`caddy validate`).

**Q3. "Nhanh mà chắc"** (ghi chú review số 4 trước đó): engine vẫn yêu cầu đúng 100% (`p.correct===room.asked_count`); kế hoạch §9.2 là đúng ≥ 80%. Sửa + test.

**Q4. Gợi ý riêng** (ghi chú số 3): vẫn lấy 3 Bài mastery thấp nhất mọi thời gian, không có nhãn lý do. Lọc 30 ngày gần nhất, trả `reason: 'weak' | 'recent'` (gồm cả Bài em đang luyện từ bản đồ bài học nếu có).

**Q5. `retry-wrong` khi em không sai câu nào** trả lỗi "Không còn câu sai dùng được để luyện lại" — đổi thành 409 với thông điệp "Em không sai câu nào trong ván này" (phân biệt với trường hợp câu bị thu hồi, đã có `excluded_questions`).

**Q6. Tên trùng:** đang thêm hậu tố " 2", " 3" (`addPlayer`). Kế hoạch §11.2 dùng hậu tố trung tính; chấp nhận dạng số, nhưng cần **đánh số theo thứ tự vào phòng ổn định** và không đổi khi người trùng tên rời phòng (hiện `same` đếm cả người đã rời — giữ như vậy, thêm test).

**Q7. Phòng lớp + khả năng `lobby` tắt:** `POST /rooms/:id/join` gọi `feature('lobby')` trước, nên khi chỉ bật `class` học sinh không vào được từ thẻ ghim (chỉ vào được bằng mã). Phòng lớp không phụ thuộc cờ `lobby`.

**Q8. Comment còn tiếng Pháp** trong `dto.js` ("countdown n'a encore publié…") → tiếng Việt (ghi chú số 5).

## Còn thiếu so với prompt ban đầu
- `docs/API.md` mục `/api/battle` (endpoint, quyền, mã lỗi `BATTLE_FEATURE_OFF`, ví dụ ảnh chụp theo pha, hợp đồng SSE §23.7).
- `docs/thiet-ke/phan-bien/TRIEN_KHAI_BACKEND_CODEX.md`: tệp đã đổi, cách hiện thực từng mục §23, phần lệch / chưa làm, cách chạy test.
- Test stream (ghi chú số 6): vượt bộ đệm → `closed {reason:'slow'}`; quá 10 lần mở / phút → 429 + `Retry-After`; mất quyền ở nhịp → `closed {reason:'left'}` — kiểm xem `deck-stream-safety.test.js` đã đủ chưa.

## Không cần sửa (đã kiểm)
Hàng rào học sinh `/battle/`; body 16 KB trước parser 20 MB; `operationalFlags` + kiểm `battle_modes`/`battle_limits`; `battleTx` với chờ kết nối 2 giây + `statement_timeout` 3 giây; biên nhận gửi lại; pause chỉ ở `question` trước deadline, resume về `question`; DTO không lộ điểm câu hiện tại; dọn dữ liệu theo hạn (`purgeExpired` mỗi giờ); `battle_retry` giữ nguồn qua lượt luyện lại tiếp; quyền đọc luồng / kết quả / lịch sử.
