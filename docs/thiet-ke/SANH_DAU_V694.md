# Đấu V6.9.4 — Sảnh Đấu trường: xem mọi phòng và lượt đấu theo môn

Trạng thái: **kế hoạch 1.0 (Claude, 21/10/2026)** — Codex phản biện + làm backend; Gemini (Argon) làm giao diện; Claude review, chạy thử trình duyệt.

Yêu cầu (anh Hiếu, 21/10/2026): "Thêm chỗ Sảnh, hiện các phòng đang có theo môn để học sinh có thể lựa chọn đấu khi muốn tự chọn mà chưa nghĩ ra mình muốn đấu cái gì; sảnh hiện tất cả các phòng, các lượt đấu hiện có, có thể chọn lọc theo môn, theo bài."

Thuộc **Đấu trường** (học sinh, giống Bufopia) theo Phụ lục 1.2 của `CHE_DO_CHOI_V693.md`. Không đổi Quiz lớp.

## 1. Hiện trạng (V6.9.3, `main` = `d734a67`)

`GET /api/battle/lobby` (+ SSE `/lobby/stream`) trả `rooms`: chỉ phòng **đang chờ, còn chỗ**, cùng khối, công khai hoặc `open_slots` (+ phòng lớp được ghim). Thẻ phòng (`lobbyCard`) chỉ có id môn/bài, không có tên; giao diện tự tra qua `/options`. Không có ván đang đấu, không có số bạn đang tìm đối thủ theo môn (chỉ dùng cho banner Giờ vàng). Bộ lọc môn / phân môn / chương-bài / kiểu đấu / còn chỗ lọc ở trình duyệt.

## 2. Mục tiêu

1. Sảnh là nơi "đi dạo": thấy **mọi hoạt động Đấu cùng khối** đang có, **xếp theo môn**, lọc theo môn → phân môn → chương → bài.
2. Ba nhóm trong sảnh:
   - **Phòng đang chờ** (vào được): như hiện tại, kèm nhãn môn/bài đã dịch sẵn, số người / sức chứa, số câu, giây/câu, chủ phòng (tên ngắn), huy hiệu hạng (nếu bật).
   - **Đang đấu** (chỉ xem thông tin, chưa vào được): phòng công khai / `open_slots` / ghép trận đang chơi cùng khối — môn/bài, kiểu đấu, số người, tiến độ "câu X/Y", thời gian đã chơi. **Không tên người chơi, không điểm, không đề.** Phòng riêng chỉ có mã: không hiện.
   - **Đang tìm đối thủ**: số bạn đang có vé ghép ở từng môn / chương (gộp, không danh tính); nút "Tìm cùng" tạo vé với phạm vi đó.
3. Nhóm theo môn: mỗi môn một khối, đầu khối có tổng "3 phòng chờ · 2 ván đang đấu · 5 bạn đang tìm". Môn không có gì thì ẩn (bộ lọc vẫn có).
4. Ô trống: gợi ý hành động ("Chưa có phòng môn Toán — Tạo phòng Toán" / "Tìm đối thủ Toán").

## 3. Backend (Codex)

- `GET /lobby` mở rộng, **giữ nguyên trường cũ** (`rooms`, `golden_hours`, `match`, `current_room_id`) để giao diện cũ không vỡ; bổ sung:
  - `rooms[i].scope_label` `{subject, branch, chapter, topics:[tên], label}` dựng ở máy chủ từ catalog khối (cache theo khối như deck), `created_at`, `mode` (`duel/team/ffa`), `ranked` (bool).
  - `live: [{id, kind, scope_label, players, capacity, asked_count, question_count, started_at, auto_match}]` — phòng `playing`, cùng khối, `visibility==='public' || open_slots || auto_match`, không phòng có người chơi chặn mình (giống `rooms`). Không `players[]`, không điểm, không `code`.
  - `seeking: [{subject_id, branch_id, chapter, count}]` — đếm vé ghép đang chờ cùng khối theo môn (và chương nếu vé đủ hẹp), không danh tính; chỉ hiện nhóm `count ≥ 1`. Dùng dữ liệu hàng đợi sẵn có (`matchmaking.participants` đang dùng cho Giờ vàng).
  - `subjects: [{id, name, waiting, live, seeking}]` tổng hợp để vẽ đầu khối.
  - Query tùy chọn `subject_id`, `branch_id`, `chapter`, `topic_id` lọc ở máy chủ (giao diện vẫn lọc được cục bộ). Giới hạn ≤ 100 phòng chờ + ≤ 50 ván đang đấu mỗi lần; sắp xếp: phòng sắp đủ người trước, rồi mới tạo.
- SSE `/lobby/stream`: cập nhật cả `live`/`seeking`/`subjects`, giữ coalesce hiện có; `live` đổi tiến độ không phát quá 1 lần / 5 giây (đỡ tải).
- `POST /match` nhận phạm vi từ nút "Tìm cùng" như vé thường (không API mới).
- Quyền / an toàn: chỉ học sinh cùng khối; tôn trọng chặn hai chiều; kill switch / cờ `lobby` tắt → như hiện tại. Không lộ phòng lớp của lớp khác, không lộ phòng mã riêng.
- Hiệu năng: không truy vấn DB mỗi lần dựng sảnh (dùng RAM + cache catalog theo khối); đo `/lobby` với 50 phòng + 300 kết nối sảnh.
- Test: unit dựng sảnh (lọc, nhóm, ẩn danh tính ván đang đấu, chặn, phòng mã không hiện); integration API + SSE; hồi quy V69/V691/V693.
- Cập nhật `docs/API.md` (hợp đồng đủ để làm giao diện không cần đọc mã).

## 4. Giao diện (Gemini, sau khi có hợp đồng API)

- Khối "Sảnh" trong tab Đấu: tab nhỏ **Tất cả · Phòng chờ · Đang đấu · Đang tìm**; hàng chip môn (có số đếm); bộ lọc môn → phân môn → chương → bài (giữ bộ lọc cũ, đổi sang dữ liệu nhãn từ máy chủ).
- Mỗi môn một khối có tiêu đề + đếm; thẻ phòng chờ có nút **Vào**; thẻ ván đang đấu xám nhẹ, ghi "Đang đấu · câu 4/10"; dòng "5 bạn đang tìm đối thủ Chương II" có nút **Tìm cùng**.
- Mobile 360–390 px không tràn ngang; cập nhật trực tiếp qua SSE không nhảy bố cục.

## 5. Câu hỏi để Codex phản biện

1. Có nên cho **xem trực tiếp** (khán giả) ván đang đấu không — V6.9.4 đề xuất **không** (chỉ thông tin), để sau.
2. Hiển thị `seeking` theo chương có làm lộ danh tính khi chỉ 1 bạn đang tìm ở lớp nhỏ không? Đề xuất: chỉ đếm theo môn khi `count < 2`.
3. Phòng ghép trận tự động (`auto_match`) có nên hiện trong "Đang đấu" không.
