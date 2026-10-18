# Ghép trận linh hoạt — cơ chế chốt sau phản biện (V6.9)

Nguồn: đề xuất `GHEP_TRAN_LINH_HOAT_V69.md`; phản biện `phan-bien/GHEP_TRAN_CODEX_PHAN_BIEN.md` (Codex gpt-6-astra) và `phan-bien/GHEP_TRAN_GEMINI_PHAN_BIEN.md` (Gemini 4 Argon). Trạng thái: **đã duyệt 18/10** — chủ dự án: "Linh hoạt và giờ vàng làm cả. Không nên cố định một hướng" (xem §9).

## Hai bên phản biện cùng kết luận
- Đúng hướng nhưng **quá phức tạp** so với trường vài chục người online buổi tối (3–7 em / khối đang tìm cùng lúc).
- **Bỏ khỏi bản đầu:** nhóm bạn (party) — rủi ro "hội đồng" bạn lẻ; cân trình độ theo điểm thành thạo khi ghép người thật; thuật toán sinh mọi tổ hợp nhóm (bùng nổ tổ hợp); cho chọn 10/15 câu khi ghép nhanh (chia nhỏ hàng chờ).
- **Đấu với bản ghi của một bạn thật:** không làm (lộ hành vi, đoán được chủ bản ghi, mô hình dữ liệu và hẹn giờ phức tạp).

## Cơ chế chốt cho bản đầu

### 1. Vé ghép (học sinh khai báo một lần)
- Kiểu: Đôi và/hoặc Nhiều người (chọn một hoặc cả hai).
- Nội dung: tối đa **3 lựa chọn** (môn / phân môn / Chương / Bài) hoặc "Môn nào cũng được". **Mọi lựa chọn dùng ngay từ đầu** (không chờ tới giây 60 mới xét môn thứ hai).
- Mức linh hoạt: "Chỉ đúng phần này" hoặc "Mở rộng dần" (mặc định) — đồng ý trước một lần, có **trần**.
- Độ dài ván: chọn một hoặc nhiều trong 7 · 10 · 15 câu, hoặc **"Bất kỳ"** (mặc định). Độ dài cũng **nới dần** như phạm vi (§2): sau 10 giây chấp nhận mọi độ dài em đã tick; nếu tick "Bất kỳ" thì khi nhóm có nhiều lựa chọn chung, lấy độ dài ngắn nhất mà mọi người cùng chấp nhận.

### 2. Lịch mở rộng (chỉ khi chọn "Mở rộng dần")
| Đã chờ | Phạm vi |
|---|---|
| 0–10 s | đúng các lựa chọn |
| 10–20 s | cả Chương chứa các Bài đã chọn |
| 20–30 s | cả phân môn / cả môn |
| ≥ 30 s | dừng nới, đưa lối thoát (§5) |
- **Trần "phần em đã học tới":** khi nới ra Chương / môn, chỉ lấy các Bài có thứ tự **không vượt quá Bài xa nhất em đã luyện** trong môn đó (theo bản đồ bài học). Phạm vi ghép của nhóm = giao của các trần → không gặp bài chưa học. Học sinh chưa luyện Bài nào trong môn → không nới quá lựa chọn ban đầu.
- Phạm vi chỉ **tăng dần** trong trần; nới xong hiện dòng thông báo nhẹ, không hộp thoại.
- Lịch là tham số cấu hình, sẽ chỉnh theo số đo thật (trung vị / p90 thời gian tới lúc **bắt đầu ván**, tỉ lệ bỏ chờ).

### 3. Thứ tự tìm
1. **Phòng ghép nhanh đang chờ / phòng công khai phù hợp** (nội dung cố định, đúng kiểu, 7 câu, phạm vi nằm trong phạm vi hiện tại của em, còn chỗ, không quan hệ chặn với bất kỳ ai trong phòng) → thẻ "Có phòng phù hợp — Vào?" **xác nhận một chạm**. Thoát khỏi phòng đó thì phòng bị loại khỏi gợi ý của em 5 phút.
2. **Vé khác:** lấy **vé chờ lâu nhất** làm gốc, tìm bạn tương thích (giao phạm vi của **cả nhóm** khác rỗng và đủ 7 câu, kiểu chung, không chặn); trong các phương án phục vụ vé gốc, ưu tiên phạm vi cụ thể hơn (Bài > Chương > môn). Không liệt kê tổ hợp; tối đa 50 vé xét mỗi vòng; một vòng chạy khi có vé mới hoặc mỗi 2 giây, các yêu cầu dồn lại được gộp.
3. Nhiều người: gom tối đa 20; đủ 3 người thì tạo phòng; 2 người chờ quá 20 s thì tạo phòng (nếu cả hai chấp nhận Đôi thì thành đấu đôi).

### 4. Phòng ghép nhanh tự chạy
- Phòng do bộ ghép tạo **không cần chủ phòng bấm**: mọi người được đánh dấu sẵn sàng, đếm ngược 5 giây rồi bắt đầu. Người vào sau lúc đếm ngược chờ ván sau.
- Phòng công khai do học sinh tạo vẫn theo luật cũ (Sẵn sàng → chủ phòng bắt đầu); nếu mọi người đã Sẵn sàng mà chủ phòng không bấm trong 60 s thì tự bắt đầu.
- Chuyển vé → phòng **nguyên tử**: khoá học sinh tăng dần → hàng lệnh phòng → kiểm lại → commit → xoá vé. Không bao giờ vừa giữ vé vừa ở phòng.

### 5. Lối thoát sau 30 giây (học sinh chọn)
- (a) **Đấu với máy** *(chờ duyệt — §8.1)*.
- (b) **Mở phòng công khai** chờ bạn vào (vé chuyển thành phòng, không chạy song song).
- (c) **Tự luyện phần này** (mở thẳng "Luyện ngay" Bài tương ứng).

### 6. Hiển thị
- Màn chờ: không hiện số người đang tìm khi < 5; thay bằng "Tối nay có N bạn toàn trường đang ôn tập". Không hiện ETA ở bản đầu.
- Trong lúc chờ: 1 câu hỏi nhanh để làm cho vui (không tính điểm) từ Bài đã chọn.

### 7. API dự kiến
- `POST /match {kinds:['duel','ffa'], choices:[scope…≤3] | [], flex:'strict'|'gradual'}` — `choices` rỗng = bất kỳ.
- Trạng thái vé (trong luồng sảnh): `{kinds, choices, flex, elapsed_ms, current_scope_label, widened:'none'|'chapter'|'subject', suggestion_room?:{id,…}, exits_available:true|false}`.
- `POST /match/accept-room {room_id}`; `POST /match/exit {to:'bot'|'public_room'|'practice'}`; `DELETE /match`.
- Cờ khả năng mới: `bot` (§8.1), `golden_hour` (§8.2).

## 8. Cần chủ dự án quyết
1. **Đấu với máy khi không ai online — làm ngay hay để sau?** Gemini đề xuất "bản ghi tổng hợp": đối thủ ảo trả lời từng câu theo **tỉ lệ đúng chung của cả khối** cho câu đó (dữ liệu thống kê, không dùng bài làm của bạn nào), thời gian ngẫu nhiên hợp lý; ghi rõ "Đối thủ máy". Không có vấn đề quyền riêng tư; vẫn cần một "người chơi ảo" trong máy trạng thái phòng (khối lượng vừa). Claude đề xuất: **làm ngay trong bản đầu**, vì đây là cách duy nhất để học sinh không phải chờ suông khi vắng người. Codex đồng ý loại bản ghi cá nhân, chưa phản biện phương án tổng hợp.
2. **"Giờ vàng"** (ý của Gemini): quản trị đặt khung 15 phút buổi tối theo khối / môn (ví dụ "20:00–20:15 KHTN khối 8"), sảnh hiện banner đếm ngược để dồn người online vào cùng lúc. Chi phí thấp, hiệu quả cao với trường ít người. Làm ngay hay để sau?
3. **Ván ghép nhanh cố định 7 câu** (cả hai AI cùng khuyên) — đồng ý?

## Để sau (ghi lại ý hay)
Ghép nối tiếp với ván sắp kết thúc (gom người vừa chơi xong); thách đấu bất đồng bộ bằng kết quả của chính mình gửi bạn cùng lớp; đấu "khởi động" với máy rồi tự chuyển sang người thật khi có; nhóm bạn đấu nhóm cùng cỡ; cân trình độ khi có số đo chứng minh cần.

## 9. Quyết định của chủ dự án (18/10)
- **Làm cả:** ghép trận linh hoạt (§1–§7), **đấu với máy** (§8.1, làm ngay trong bản đầu) và **giờ vàng** (§8.2).
- **Không cố định một hướng:** mọi lựa chọn để mở cho học sinh (kiểu, nội dung, độ dài ván, "Chỉ đúng phần này" / "Mở rộng dần", lối thoát) và mọi tham số để quản trị chỉnh trong cấu hình (lịch nới 10/20/30 s, số người tối thiểu, đếm ngược tự chạy, độ khó đối thủ máy, bật tắt từng khả năng `matchmaking`, `bot`, `golden_hour`, …). Không mã hoá cứng một phương án duy nhất.

### 9.1 Đối thủ máy (đặc tả)
- Máy là **người chơi ảo** trong phòng (không phải tài khoản; `battle_players.is_bot`, `user_id` NULL — cần đổi PK sang khoá thay thế hoặc dùng `bot_slot`), tên "Đối thủ máy", không báo cáo / chặn được, không có lịch sử.
- Với mỗi câu: xác suất đúng = tỉ lệ đúng của **cả khối** cho câu đó (từ `attempt_items` và `battle_answers` đã chấm, tối thiểu 10 lượt; ít hơn thì dùng tỉ lệ theo mức nhận thức của khối: NB 0,8 · TH 0,65 · VD 0,45), nhân hệ số độ khó cấu hình (Dễ 0,85 · Vừa 1,0 · Khó 1,15, cắt trong [0,05; 0,95]). Câu ĐS / GN: chấm theo từng ý với cùng xác suất. Thời gian trả lời: ngẫu nhiên 35–85% thời gian câu.
- Câu trả lời của máy đi qua **hàng lệnh phòng** như lệnh nội bộ (mang `index` + `schedule_version`), ghi `battle_answers` như người chơi; không bao giờ dùng câu trả lời của một học sinh cụ thể.
- Học sinh chọn độ khó (mặc định Vừa). Kết quả ván với máy có nhãn "Đấu với máy", không tính vào huy hiệu so sánh với người khác.
- Có thể chọn "Đấu với máy" từ giây 15 của màn chờ, hoặc tự vào từ sảnh ("Luyện đấu với máy").

### 9.2 Giờ vàng (đặc tả)
- Quản trị (hoặc giáo viên được cấp quyền) tạo khung: khối, môn (tuỳ chọn), bắt đầu, độ dài (10–60 phút), lặp (một lần / hằng tuần theo thứ).
- Sảnh hiện banner đếm ngược trước 30 phút; trong khung giờ, hàng chờ của khối / môn đó ưu tiên ghép nhanh (lịch nới rút ngắn theo cấu hình, ví dụ 5/10/15 s) và phòng ghép nhanh tự chạy.
- Không có thưởng điểm hay xếp hạng riêng (giữ nguyên tắc ván đấu không ảnh hưởng thành thạo); chỉ banner + số bạn đang tham gia.
- Bảng `battle_golden_hours(id, grade, subject_id NULL, starts_at, minutes, repeat_weekdays int[] NULL, created_by, active)`.

## 10. Bổ sung theo yêu cầu chủ dự án (18/10, 19:40): ghép thật linh hoạt + rank

> "Ghép trận thật linh hoạt. Có thể chênh lệch một chút không sao. Có thể kèm rank, giống Đấu Trường Chân Lý hay Liên Minh Huyền Thoại. Ghép từ rộng đến hẹp, hẹp đến rộng để nhiều, dễ gặp nhau, không cứng nhắc."

### 10.1 Ghép hai chiều (rộng ↔ hẹp)
- **Rộng gặp hẹp ngay:** vé "cả môn" / "Bất kỳ" ghép được **ngay lập tức** với vé hẹp (một Bài) nếu phạm vi hẹp nằm trong phạm vi rộng; ván dùng **phạm vi chung cụ thể nhất** (ở đây là Bài của bạn chọn hẹp), không bắt người chọn hẹp phải nới.
- **Hẹp nới ra rộng** theo lịch §2 (có trần "phần em đã học tới").
- **Chênh lệch nhỏ chấp nhận được:** kiểu (đôi ↔ nhiều người nếu cả hai tick), độ dài ván (7 ↔ 10 nếu tick "Bất kỳ" hoặc cả hai), trình độ (§10.3) — mỗi thứ có "độ dung sai" tăng dần theo thời gian chờ, cấu hình được.
- Ghép **chéo nguồn**: vé có thể vào phòng ghép nhanh đang chờ, phòng công khai của học sinh, hoặc ghép với vé khác — lấy phương án đến sớm nhất.

### 10.2 Hai chế độ hàng chờ
| | Thường | Xếp hạng |
|---|---|---|
| Ảnh hưởng rank | Không | Có |
| Ghép | Linh hoạt tối đa (mọi chênh lệch) | Linh hoạt có kiểm soát trình độ (§10.3) |
| Đối thủ máy, phòng tự tạo, phòng lớp | Có | **Không tính rank** |
| Số câu | 7 / 10 / 15 / Bất kỳ | 7 hoặc 10 (cố định theo mùa, cấu hình) |

### 10.3 Rank (kiểu ĐTCL / LMHT, theo khối, theo mùa = học kỳ)
- **Điểm ẩn (MMR)** kiểu Elo cho từng học sinh / khối / mùa; bắt đầu 1000. Dùng để ghép (cửa sổ ±100 → ±200 sau 10 s → bỏ giới hạn sau 20 s) và để tính điểm hạng nhận/mất.
- **Bậc hiển thị:** Đồng → Bạc → Vàng → Bạch kim → Kim cương → Cao thủ; mỗi bậc 4 cấp IV–I, **100 điểm hạng (LP)** / cấp. 5 ván "định vị" đầu mùa chưa hiện bậc.
- **Nhận / mất LP:**
  - Đôi: thắng +18…+25, thua −12…−18 (tuỳ chênh MMR); hoà ±0.
  - Nhiều người (như ĐTCL): theo thứ hạng trong ván — nửa trên nhận, nửa dưới mất ít; ví dụ 8 người: +40 +30 +20 +10 / −5 −10 −15 −20; số người khác thì nội suy.
  - Đồng hạng chia đều. Bỏ ván giữa chừng: tính như hạng chót.
- **Mềm cho học sinh:** không rớt bậc trong 3 ván đầu sau khi lên bậc; ở Đồng IV không mất LP; LP mất giảm một nửa trong 10 ván đầu mùa.
- **Chống "cày" với bạn:** ván xếp hạng chỉ từ ghép tự động (không phòng tự tạo, không mã); cùng cặp đối thủ gặp lại trong 24 giờ: từ ván thứ 3 LP × 0,5, từ ván thứ 5 không tính.
- **Hiển thị:** huy hiệu bậc cạnh tên trong phòng và sảnh (học sinh có thể **ẩn bậc của mình** với người khác trong cài đặt); hồ sơ riêng của em có bậc, LP, lịch sử 20 ván xếp hạng. **Bảng cao thủ** top 20 theo khối: cờ cấu hình, mặc định **tắt** (quản trị bật khi nhà trường đồng ý).
- **Tách biệt học tập:** rank không ảnh hưởng điểm thành thạo, không giáo viên nào dùng để chấm; mùa reset mềm mỗi học kỳ (MMR kéo về 1000 một nửa khoảng cách).
- Dữ liệu: `battle_ratings(user_id, grade, season, mmr, lp, tier, division, games, placement_left, protected_games, hidden)`, `battle_rating_events(room_id, user_id, delta_lp, mmr_before, mmr_after, reason)`; cập nhật **trong cùng giao dịch kết thúc ván**, chỉ một lần mỗi ván (khoá duy nhất room_id + user_id).
- Cờ: `ranked`, `leaderboard`; tham số bảng LP, cửa sổ MMR, số ván định vị trong cấu hình.

### 10.4 Điều chỉnh sau phản biện của Gemini (`phan-bien/RANK_GEMINI_PHAN_BIEN.md`) — **thay thế §10.2–10.3 ở các điểm dưới**
1. **Một hàng chờ duy nhất.** Mặc định ván tính hạng; trên vé có công tắc "Đấu thử, không tính hạng". Người tính hạng và không tính hạng **vẫn ghép chung phòng** (mỗi người chỉ nhận / mất LP theo lựa chọn của mình). Không chia đôi nguồn người.
2. **Đối thủ máy được vào ván tính hạng** sau 25 giây chờ (hoặc lấp chỗ trống cho phòng 3–4 người): thắng máy tối đa **+12 LP**, tối đa **3 ván / ngày** có LP từ máy; thua máy chỉ −5.
3. **Chống "học tủ một Bài":** ván tính hạng yêu cầu phạm vi **tối thiểu cả Chương** (vé chọn một Bài vẫn ghép được, nhưng ván đó không tính hạng với người chọn hẹp). Khi rộng gặp hẹp trong ván tính hạng: bộ câu **50% từ phạm vi hẹp + 50% từ phạm vi chung rộng hơn** (trong trần "đã học tới" của cả hai). Hệ số LP theo độ rộng: một Chương ×1,0; cả phân môn / môn ×1,1; nhiều môn ×1,2.
4. **Chống cày thay cho trần 24 giờ:** chỉ giảm LP khi **A thắng B liên tiếp 3 lần trong cùng phạm vi** (ván thứ 4 trở đi ×0,5) hoặc ván có dấu hiệu bất thường (một bên trả lời hết câu dưới 2 giây / câu); tối đa 10 ván tính hạng / ngày với cùng một đối thủ.
   - **Có người bỏ trận (anh Hiếu chốt 19/10/2026):** người chủ động rời vẫn tính thua (bét bảng). Người ở lại **không bị trừ**: nếu chỉ còn một mình thì ván **không tính hạng** với người đó (không cộng, không trừ, không tính vào số ván); nếu còn **từ 2 người trở lên** thì xếp hạng bình thường giữa những người còn lại, không giảm LP vì lý do có người rời. Văng mạng không tính là bỏ trận (xem mục 5).
5. **Mất kết nối không bị coi là bét bảng:** giữ điểm đã tích luỹ tới lúc văng để xếp hạng; mỗi ngày một **"khiên mạng"** (lần đầu văng trong ngày không bị trừ LP).
6. **Tên bậc học thuật, không rớt bậc lớn trong mùa:** **Tập sự → Khám phá → Tinh anh → Thông thái → Bậc thầy → Thách đấu**; mỗi bậc **3 cấp (III–I) × 100 LP**; đã lên bậc nào thì cả mùa không tụt xuống bậc dưới (thua nhiều chỉ về cấp III, 0 LP).
7. **MMR ẩn theo từng môn** (KHTN, Toán, Văn, Anh… riêng); **một bậc hiển thị chung** từ tổng LP. Ghép dùng MMR của môn trong phạm vi chung (nhiều môn → trung bình).
8. **Phòng nhiều người tính hạng tối đa 4 người**; bảng LP cố định, không nội suy:
   | Cỡ phòng | Hạng 1 | Hạng 2 | Hạng 3 | Hạng 4 |
   |---|---|---|---|---|
   | 2 (đấu đôi) | thắng +25…+35 | thua −8…−12 | | |
   | 3 | +30 | +10 | −8 | |
   | 4 | +35 | +18 | −5 | −10 |
   Đấu đôi hoà: +10 cho cả hai. Chênh MMR ≥ 150: người yếu hơn thắng **+35**, thua chỉ **−5**.
9. **Định vị 3 ván**, hiện bậc khởi đầu ngay sau ván 1 (thưởng thêm ở ván 2–3).
10. **Cửa sổ MMR:** 0–8 giây ±250; sau 8 giây bỏ giới hạn trình độ (ưu tiên cùng Bài / Chương hơn cùng trình độ).
11. **Ẩn / hiện bậc:** **Tập sự và Khám phá mặc định ẩn** với người khác (người khác chỉ thấy khung trung tính, em vẫn thấy LP của mình); khi lên **Tinh anh** hiện màn chúc mừng với nút "Hiện huy hiệu ở sảnh" (em tự chọn). Ẩn được bất cứ lúc nào.
12. Mọi con số trên là **tham số cấu hình** (quản trị chỉnh theo số đo thật), đúng quyết định "không cố định một hướng".

## 11. Tạo phòng — hai kiểu + kết hợp (chủ dự án, 18/10)
> "Cả chế độ tạo phòng có mã phòng để rủ người quen vào chơi, kiểu tạo này là người trong phòng chơi với nhau. Cả chức năng tạo phòng chơi với người khác."

| Kiểu | Ai vào được | Hiện ở sảnh | Bộ ghép tự đưa người vào | Tính rank |
|---|---|---|---|---|
| **Phòng riêng (rủ bạn)** — `visibility:'code'` | Chỉ người có mã 6 số (chia sẻ bằng nút Sao chép / mã QR) | Không | Không | Không |
| **Phòng mở (chơi với người khác)** — `visibility:'public'` | Mọi bạn cùng khối | Có | Có (phòng phù hợp được gợi ý cho vé ghép, §3.1) | Không |
| **Phòng riêng + mở chỗ trống** — `visibility:'code'`, `open_slots:true` | Người có mã; chỗ còn trống cho bạn khác cùng khối | Có, khi còn chỗ (nhãn "Nhóm bạn đang tìm thêm người") | Có | Không |

- Cả ba kiểu hỗ trợ: Đấu đôi, Đấu đội (2v2–4v4), Nhiều người (2–20); nội dung chọn ngay hoặc cả phòng cùng chọn; Sẵn sàng → chủ phòng Bắt đầu (phòng mở: tự bắt đầu sau 60 s khi mọi người đã Sẵn sàng).
- Chủ phòng đổi được giữa riêng / mở / mở chỗ trống khi còn ở phòng chờ.
- Phòng tự tạo **không tính rank** (chống rủ bạn cày điểm); rank chỉ tính ở ván ghép tự động (§10.4). Cấu hình được nếu nhà trường muốn khác.
- Chặn / báo cáo / tạm khoá áp dụng như mọi phòng; phòng mở chỗ trống không nhận người có quan hệ chặn với bất kỳ ai trong phòng.
- Backend cần thêm: cờ `open_slots` (hoặc mở rộng `visibility`) + route đổi chế độ phòng; sảnh hiển thị phòng `open_slots`.
