# Kế hoạch tính năng "Đấu" (thi đấu kiến thức giữa học sinh) — V6.9

> **Tài liệu để góp ý.** Bản kế hoạch đầy đủ, viết để chủ dự án (thầy Dương Hiếu) gửi cho các trợ lý AI và đồng nghiệp phản biện **trước khi** triển khai. Người đọc **không cần** đọc mã nguồn: bối cảnh cần thiết nằm ở mục 2.

| | |
|---|---|
| Phiên bản | **1.3 — 2026-10-18** (sau phản biện vòng 2; thay đổi ở mục 22; **phụ lục triển khai ở mục 23 là phần ràng buộc khi lập trình**) |
| Trạng thái | Đề xuất, đang phản biện. Chưa triển khai. Có 2 tệp nháp chưa nối vào app (mục 15.6) |
| Phạm vi | Một trường THCS–THPT, vài trăm đến hơn một nghìn học sinh, môn trọng tâm Khoa học tự nhiên (KHTN) |
| Phản biện | `docs/thiet-ke/phan-bien/` (V1_CODEX_PHAN_BIEN.md, V1_CLAUDE_TRA_LOI.md, …) |
| Demo giao diện | `docs/thiet-ke/dau-truong-demo/index.html` (Gemini dựng, dữ liệu giả) + ảnh `anh/` |

## Mục lục
1. Tóm tắt · 2. Bối cảnh · 3. Vấn đề · 4. Mục tiêu, không làm, chỉ số · 5. Người dùng · 6. Chế độ đấu · 7. Hành trình người dùng · 8. Chọn nội dung · 9. Luật chơi, điểm, kết quả · 10. Câu hỏi trong ván · 11. An toàn học sinh, dữ liệu, kiểm duyệt · 12. UX/UI · 13. Kiến trúc · 14. Dữ liệu · 15. API, DTO, SSE · 16. Lỗi và phục hồi · 17. Tải, kiểm thử, nghiệm thu, triển khai · 18. Câu hỏi mở còn lại · 19. Rủi ro · 20. Sổ quyết định · 21. Phụ lục lỗi demo · 22. Thay đổi so với 1.0

---

## 1. Tóm tắt

Thêm tab **"Đấu"** cạnh "Tự luyện". Bốn chế độ: **Đấu đôi**, **Đấu đội** (2 đội × 1–4 bạn), **Nhiều người chơi** (2–20), **Cả lớp cùng đấu** (giáo viên mở, chiếu lên máy chiếu). Học sinh vào **sảnh** xem phòng bạn khác tạo (lọc theo môn, phân môn, chủ đề), **tìm đối thủ** cùng môn / cùng chủ đề, hoặc tạo phòng **chưa chọn nội dung** rồi **cả phòng cùng chọn**. Phòng chờ: mọi người **Sẵn sàng** thì chủ phòng mới **Bắt đầu**.

Nguyên tắc:
- **Luyện, không đánh giá:** ván đấu không ghi điểm thành thạo chính thức; sau ván có "Luyện lại các câu em vừa sai".
- **Đúng là chính:** điểm chỉ tính theo độ đúng; bằng điểm thì đồng hạng (tốc độ chỉ dùng cho huy hiệu "Nhanh mà chắc").
- **Máy chủ quyết định:** đồng hồ, chấm, điểm; không công bố đáp án hay bất kỳ dấu hiệu đúng/sai của câu hiện tại trước khi đóng nhận bài.
- **Ghi bền rồi mới xác nhận:** đáp án được lưu vào PostgreSQL trước khi máy chủ báo "đã nhận".
- **An toàn trẻ vị thành niên:** cùng trường, cùng khối; tên ngắn + lớp; không chat tự do; báo cáo / chặn có quy trình; công tắc bật tắt và dừng khẩn cấp.

---

## 2. Bối cảnh: hệ thống hiện có

### 2.1 Sản phẩm
Web "Ngân hàng câu hỏi" của một trường ở Hà Nội. Giáo viên soạn, duyệt câu theo chương trình GDPT 2018 (Môn → Phân môn → Chương → Bài → Yêu cầu cần đạt). Học sinh tự luyện, làm bài được giao, xem hồ sơ học tập.

- **Môn và phân môn:** KHTN là **một môn**, chia phân môn Lý (L), Hoá (H), Sinh (S); Bài thuộc một phân môn. Môn khác (Toán, Ngữ văn, Tiếng Anh) không chia phân môn.
- **Kho câu:** kho trường (mọi học sinh thấy), kho tổ, kho cá nhân. Mỗi câu có Bài, mức nhận thức (NB, TH, VD, VDC) và một trong 5 loại: TN trắc nghiệm 4 lựa chọn, ĐS đúng/sai 4 ý, TLN trả lời ngắn (có thể là số + đơn vị + sai số), GN ghép nối, TL tự luận.
- **Chấm tự động** TN, ĐS, TLN, GN cho kết quả 0–1 (ĐS, GN theo tỉ lệ ý / cặp đúng); câu không tự chấm được trả `null`. TLN có đơn vị bắt buộc thì câu trả lời phải gửi dạng `{value, unit}`.
- **Câu "học sinh dùng được"** (khi bốc câu tự luyện): phiên bản hoạt động đã duyệt, không lưu trữ / cách ly / đang bị báo lệch chương trình, Bài còn hoạt động, liên kết Bài–YCCĐ–mục tiêu còn hiệu lực, **và** nội dung qua bước kiểm hợp lệ. Lưu ý: số đếm ở bản đồ bài học hiện chỉ dùng phần SQL, chưa chạy bước kiểm nội dung.
- **Ảnh trong câu hỏi** được phục vụ qua endpoint **kiểm quyền theo lượt luyện** (đường dẫn mã hoá, máy chủ kiểm người xem có lượt luyện chứa câu đó).
- **Bản đồ bài học (V6.8):** Chương → Bài, sao, "Em đang ở đây" (Bài em đang luyện), "Em đang vướng gì", chuỗi ngày, huy hiệu, biểu đồ năng lực.
- **Lớp:** học sinh thuộc lớp (có khối, năm học, hiệu lực từ–đến); giáo viên được phân công theo cặp lớp–môn.
- **Lượt luyện** có nguồn `self_practice`, `teacher_assigned`, `retry` (ràng buộc CHECK trong DB).

### 2.2 Kỹ thuật
- Node.js + Express, PostgreSQL; React + Vite, CSS theo token (nền `#F4F3EE`, chữ `#1C1B17`, xanh mực `#1E5A7A`, Lexend + JetBrains Mono).
- **Một tiến trình Node** trên máy chủ tại trường, sau Caddy (`encode gzip`). Redis có sẵn nhưng là **cache** (`allkeys-lru`, không lưu bền).
- Xác thực cookie phiên HttpOnly (JWT, có `token_version`); CSRF cho request thay đổi dữ liệu từ trình duyệt.
- Middleware chung: mọi `/api` đi qua xác thực + giới hạn theo IP (3000/phút) + **hàng rào chỉ cho học sinh vào `/api/practice/*`**; router riêng tự gắn giới hạn theo người dùng (300/phút). Bộ phân tích JSON toàn cục cho phép body 20 MB, chạy trước xác thực.
- Cấu hình hệ thống (`system_settings`) chỉ chấp nhận khoá đã khai báo; cờ boolean hiện chỉ được đặt `false`.
- Đẩy `main` là tự triển khai (migration có cổng rà câu lệnh nguy hiểm; sao lưu khi có migration). Các nhánh khác chạy CI trên GitHub: build, unit, security, migration gate, **smoke** trên Postgres riêng.

### 2.3 Nguồn ý tưởng
Dự án tiếng Anh riêng của chủ dự án ("Mầm Tri Thức") có phòng 2 người: mã 6 số, sẵn sàng, chủ phòng bắt đầu, máy chủ giữ giờ và chấm, trình duyệt hỏi trạng thái mỗi 1,3 giây. Hồ sơ dự án đó tự nhận: "ai đúng trước chốt câu" phạt bạn nghĩ chậm; lời giải biến mất sau ~2 giây; hỏi liên tục theo IP gây nghẽn; giao diện "chán". Kế hoạch này **lấy ý tưởng, không ghép mã**.

---

## 3. Vấn đề cần giải quyết
1. Tự luyện một mình dễ chán với một phần học sinh; học sinh THCS thích thi với bạn.
2. Ôn tập cả lớp đang dùng công cụ ngoài (kiểu Kahoot) với câu soạn lại, không gắn chương trình, không lưu dữ liệu.
3. Học sinh không biết nên ôn phần nào.
4. Trò chơi thi đấu dễ lệch mục tiêu: chạy đua tốc độ, áp lực xếp hạng, ghép người lạ, rò rỉ đáp án.

---

## 4. Mục tiêu, không làm, chỉ số thành công

**Mục tiêu:** 4 chế độ chạy ổn trên điện thoại và máy chiếu; nội dung từ kho đã duyệt, đúng khối / Bài; sau ván biết sai câu nào và luyện lại ngay; giáo viên mở ván cả lớp dưới 1 phút.

**Không làm đợt này:** chat tự do, kết bạn, đấu khác trường, gọi thoại, tiền ảo / vật phẩm, câu tự luận, câu có ảnh (xem §10.3), gộp kết quả ván vào thành thạo, xếp hạng toàn trường công khai, huy hiệu "Tiến bộ nhất".

**Chỉ số (sau 4 tuần):** học sinh có ≥ 1 ván/tuần; tỉ lệ bấm "Luyện lại câu sai"; tỉ lệ bỏ ván, không Chốt, thời gian đọc lời giải; số ván Cả lớp; số báo cáo / 1000 ván (kèm khảo sát ngắn, vì ít báo cáo chưa chắc là an toàn); p95 lưu đáp án < 300 ms; không có sự cố mất ván diện rộng; tự luyện không chậm đi khi có ván đấu.

---

## 5. Người dùng

| Người dùng | Tình huống |
|---|---|
| Học sinh khá | Tối ở nhà, vào sảnh, thấy phòng "KHTN 9 · Lý · Điện học", vào đấu 10 câu |
| Học sinh chưa biết ôn gì | "Tìm đối thủ" → "Môn nào cũng được" hoặc chọn gợi ý "Bài em đang luyện" |
| Nhóm bạn cùng lớp | Một bạn tạo phòng chưa chọn nội dung, gửi mã, cả nhóm bỏ phiếu |
| Giáo viên KHTN | Cuối tiết mở "Cả lớp cùng đấu" 7 câu Bài vừa học, chiếu lên máy chiếu |
| Quản trị viên / người phụ trách an toàn | Xử lý báo cáo; ngừng nhận ván mới hoặc dừng khẩn cấp |

---

## 6. Các chế độ đấu

| Chế độ | Người chơi | Ai tạo | Vào bằng | Cờ bật riêng |
|---|---|---|---|---|
| Đấu đôi | 2 | Học sinh / ghép | Sảnh, mã, tìm đối thủ | `duel` |
| Đấu đội | 2–8 (đúng 2 đội, mỗi đội 1–4) | Học sinh | Sảnh, mã | `team` |
| Nhiều người chơi | 2–20 | Học sinh / ghép | Sảnh, mã, tìm đối thủ | `ffa` |
| Cả lớp cùng đấu | 1–50 học sinh của lớp | Giáo viên được phân công đúng lớp–môn | Thẻ ghim, mã | `class` |

Cấu hình phòng: công khai / chỉ qua mã; số câu 7 / 10 / 15; mức thời gian 20 / 30 / 45 giây (cơ bản); nội dung chọn ngay hoặc cả phòng cùng chọn.
**Phát hành:** làm đủ 4 chế độ trong một đợt (quyết định của chủ dự án); **cờ khả năng** trong `battle_modes`: `class`, `duel_code`, `lobby`, `matchmaking`, `vote`, `ffa`, `team` — kiểm ở cả máy chủ và giao diện (§23.8). Khuyến nghị bật theo thứ tự: Cả lớp → Đấu đôi bằng mã → Sảnh + tìm đối thủ → Nhiều người, Đội, bỏ phiếu — mỗi bước qua cổng nghiệm thu §17.4. Chủ dự án có thể bật tất cả.

---

## 7. Hành trình người dùng

### 7.1 Sảnh
- Lời chào, chuỗi ngày, nút **Tìm đối thủ**, **Tạo phòng**, ô nhập mã.
- Thẻ ghim **Cả lớp cùng đấu** khi giáo viên lớp em mở phòng.
- **Phòng đang chờ**: công khai, cùng khối, còn chỗ, chưa bắt đầu, không có quan hệ chặn với em. Lọc: Môn · Phân môn (KHTN) · Chương / Bài · Kiểu · Còn chỗ. Thẻ phòng: kiểu, phạm vi hoặc "Chưa chọn nội dung · cùng chọn khi vào", `3/8`, chủ phòng (tên ngắn + lớp), số câu, thời gian, nút Vào. Cập nhật trực tiếp.
- **Ván đấu của em:** 10 ván gần nhất, xem lại kết quả và lời giải.

### 7.2 Tạo phòng
Sheet một màn: Kiểu → Công khai / Chỉ qua mã → Số câu → Mức thời gian → Nội dung (chọn ngay: Môn → Phân môn → Chương / Bài; hoặc "Để cả phòng cùng chọn"). Chỉ hiện lựa chọn đủ câu, kèm số câu.

### 7.3 Tìm đối thủ
Kiểu (Đôi / Nhiều người) → Môn hoặc "Môn nào cũng được" → tuỳ chọn Phân môn / Chương / Bài. **"Chưa biết đấu phần nào?"** (§8.1). Màn chờ: "Đang tìm bạn cùng khối…", số bạn đang tìm theo môn, Huỷ. Sau 30 giây một lời mời nới phạm vi; sau 60–90 giây đề nghị tạo phòng công khai hoặc về tự luyện.

### 7.4 Phòng chờ
- Mã lớn + sao chép (+ QR với phòng lớp), danh sách người chơi (tên ngắn + lớp, trạng thái), đội.
- Phòng chưa có nội dung → màn **Cùng chọn nội dung** (§8.3).
- **Sẵn sàng** (bật / tắt). Chỉ chủ phòng thấy **Bắt đầu**, bấm được khi: có nội dung, đủ người, **mọi người đang trong phòng đã Sẵn sàng**, đội hợp lệ (đúng 2 đội, mỗi đội 1–4). Nút ghi lý do khi chưa bấm được ("Chờ 2 bạn Sẵn sàng").
- Chủ phòng rời → quyền chuyển cho người vào sớm nhất còn lại.
- Phòng lớp: giáo viên bắt đầu lúc nào cũng được.
- Menu mỗi người chơi: **Báo cáo** / **Chặn** (phòng lớp: chỉ Báo cáo).

### 7.5 Trong ván
Đếm ngược 3-2-1 → mỗi câu: cùng câu, cùng lúc; thanh thời gian; "Câu 3/10"; Bài; đề; ô trả lời; nút **Chốt** lớn và **Bỏ qua**. Sau khi Chốt: "Đang gửi…" → "Máy chủ đã nhận ✓" (hoặc lỗi + thử lại). Còn 5 giây mà chưa Chốt: cảnh báo rõ. Dải dưới: "Đã trả lời 6/9", điểm của em **đến câu trước**. Đấu đội: thanh kéo co (điểm đến câu trước). Không hiện ai đúng / sai câu hiện tại.

### 7.6 Lời giải sau mỗi câu
Mở **sau khi đóng nhận bài** (§9.1). Đúng / sai bằng chữ + biểu tượng, đáp án, lời giải (thiếu lời giải thì ghi "Câu này chưa có lời giải"), "cả phòng chọn gì", điểm của em. Chuyển câu khi mọi người bấm "Câu tiếp" hoặc sau 20 giây; phòng lớp do giáo viên chuyển. Lời giải mọi câu **xem lại được không giới hạn** ở màn kết quả và lịch sử.

### 7.7 Kết quả
Thứ tự ưu tiên: **"Câu em cần xem lại" + nút "Luyện lại các câu em vừa sai"** → "Kết quả các câu trong ván" theo Bài → podium top 3 + "Em hạng X/N" (**không có bảng xếp hạng đầy đủ**: không ai thấy thứ hạng thấp của người khác; xem 18.1) → huy hiệu (Chính xác nhất, Nhanh mà chắc) → **Đấu ván nữa**, **Về sảnh**. Ghi chú: "Kết quả ván đấu không ảnh hưởng điểm thành thạo."

### 7.8 Giáo viên — Cả lớp cùng đấu
Tab Đấu của giáo viên: chọn lớp mình được phân công → môn tương ứng → phân môn / Chương / Bài → số câu, mức thời gian (có thể tăng) → Mở phòng → **màn chiếu 16:9** (mã + QR, học sinh đã vào, Bắt đầu). Trong ván: câu chữ lớn, đồng hồ tròn, "18/23 bạn đã trả lời"; sau câu: phân bố đáp án + thống kê lớp (**mặc định không có tên**; giáo viên bật được "top 3"); Câu tiếp, Tạm dừng, Kết thúc.

---

## 8. Chọn nội dung

### 8.1 Gợi ý riêng "Chưa biết đấu phần nào?"
Từ bản đồ bài học của chính em: **Bài em đang luyện**, **Bài em đang vướng**. Chỉ em thấy; người khác chỉ thấy tên Bài, không thấy lý do. Nút **Bốc thăm** một Bài đủ câu.

### 8.2 Ghép trận tự do
- Hàng chờ theo khối. Mỗi người có **phạm vi**: một môn (hoặc "bất kỳ"), tuỳ chọn phân môn, tuỳ chọn tập Bài (chọn Chương = tập Bài của Chương).
- **Phạm vi chung của nhóm** = giao phạm vi của **tất cả** thành viên (môn phải trùng, hoặc "bất kỳ"; tập Bài lấy giao). Chỉ ghép khi phạm vi chung **khác rỗng và đủ câu** (đếm bằng điều kiện §10.3).
- Nếu cả nhóm đều "bất kỳ" → phòng ở chế độ **cùng chọn** (§8.3).
- Không ai bị ghép với người có quan hệ chặn với bất kỳ thành viên nào.
- Nới phạm vi **chỉ khi học sinh đồng ý** (một lời mời sau 30 giây: "Mở rộng ra cả Chương?" hoặc "… cả phân môn?").
- Nhiều người chơi: gom ≥ 3 người cùng phạm vi chung, hoặc 2 người đã chờ > 30 giây; phòng sau đó mở công khai trên sảnh tới khi đủ 20 hoặc chủ phòng bắt đầu.
- Mỗi học sinh chỉ một chỗ trong hàng chờ và không đồng thời ở một phòng đang hoạt động.

### 8.3 Cả phòng cùng chọn (đơn giản hoá sau phản biện)
- **Bước 1 — Môn** (30 giây): danh sách môn của khối đủ câu (KHTN có thể chọn tiếp phân môn ở bước 2). Mỗi người chạm một môn. Mọi người cùng một lựa chọn → chốt ngay; hết giờ → nhiều phiếu nhất; hoà → bốc thăm giữa các lựa chọn hoà (hiện rõ "Bốc thăm giữa Toán và KHTN"). Không ai bỏ phiếu → gia hạn **tối đa 1 lần**, sau đó phòng quay về trạng thái chờ và chủ phòng chọn.
- **Bước 2 — Phạm vi** (30 giây, tuỳ chọn): lựa chọn gồm **"Cả môn"** (hoặc "Cả phân môn") + tối đa **3 phạm vi được đề cử**. Bất kỳ ai cũng đề cử được một phạm vi (Phân môn / Chương / Bài, chỉ trong danh sách đủ câu, có chip "Gợi ý cho em") cho tới khi đủ 3. Mỗi người chọn **một** lựa chọn; cùng luật chốt như bước 1. Danh sách người bỏ phiếu **đóng** khi vòng bắt đầu; người vào giữa vòng xem kết quả.
- Mọi phạm vi được đưa ra đều đã đủ câu → **không tự nới** sau khi chốt.
- Chủ phòng có **Chốt luôn** khi một lựa chọn đã quá nửa số phiếu.
- Chốt xong: "KHTN 9 · Lý · Điện học · 10 câu · 30 giây/câu".

---

## 9. Luật chơi, điểm và kết quả

### 9.1 Thời gian và đóng nhận bài
- Thời gian câu = mức thời gian của phòng × hệ số loại (TN ×1; ĐS, GN, TLN ×1,5). Giáo viên tăng được cho phòng lớp.
- Mỗi câu có `deadline` (hiển thị) và **`close_at = deadline + 500 ms`** (đóng nhận). Lệnh trả lời được **nhận vào hàng lệnh của phòng** trước `close_at` thì được xử lý; sau đó từ chối.
- **Lời giải chỉ mở khi** lệnh `close` của câu được xử lý trong hàng lệnh (tại `close_at`, hoặc sớm hơn khi mọi người chơi đang hoạt động đã Chốt / Bỏ qua) — chi tiết §23.3.
- Thời gian trả lời đo bằng **giờ máy chủ lúc nhận lệnh**, trừ khoảng tạm dừng; không dùng thời điểm commit.
- **Chưa Chốt khi hết giờ → không tính** (quyết định đã chốt). "Bỏ qua" = không trả lời, được tính là đã xong câu.
- **Tạm dừng** (chỉ phòng lớp): đóng băng đồng hồ, lưu phần thời gian còn lại; tiếp tục thì đặt `deadline` mới.

### 9.2 Điểm và xếp hạng
- Điểm câu = **kết quả chấm 0–1** (ĐS, GN theo tỉ lệ). Tổng điểm hiển thị = Σ × 100 (ví dụ "860 điểm"). **Không thưởng tốc độ, không trừ điểm.**
- Xếp hạng: tổng điểm ↓; **bằng điểm thì đồng hạng** (không dùng thời gian, không dùng mã tài khoản). Thời gian chỉ dùng cho huy hiệu "Nhanh mà chắc".
- **Đội:** danh sách thành viên **đóng băng lúc bắt đầu**; điểm đội mỗi câu = trung bình điểm thành viên (người rời vẫn trong mẫu số, tính 0); tổng đội = cộng các câu.
- Huy hiệu: **Chính xác nhất** (tỉ lệ đúng cao nhất), **Nhanh mà chắc** (thời gian trung bình thấp nhất trong số bạn đúng ≥ 80%). Bỏ "Tiến bộ nhất".

### 9.3 Máy trạng thái
`status` (vòng đời, lưu DB): `lobby` → `playing` → `finished` | `interrupted` | `closed`.
`phase` (trong ván, bộ nhớ + ghi mốc): `countdown` → `question` → `closing` → `reveal` → (câu kế) … → kết thúc.

| Trạng thái | Lệnh hợp lệ | Ai | Điều kiện | Hiệu ứng | Ghi DB |
|---|---|---|---|---|---|
| lobby | join / leave | học sinh | đủ điều kiện §11.1, còn chỗ | thêm / bớt người, chuyển chủ phòng | `battle_players` |
| lobby | vote | người chơi | đang có vòng bỏ phiếu, có trong danh sách vòng | cập nhật phiếu; chốt khi đủ luật | chốt → `battle_rooms.subject/scope` |
| lobby | ready / team | người chơi | đã có nội dung | đổi trạng thái | `battle_players.ready/team` |
| lobby | start | chủ phòng / giáo viên | §7.4 | bốc câu, đóng băng đội | `battle_questions`, `status=playing` |
| countdown | — | máy chủ | 3 giây | sang `question` | — |
| question | answer / skip | người chơi đang hoạt động | đúng `index`, trước `close_at`, chưa trả lời | chấm, lưu | `battle_answers` (commit trước ACK) |
| question → reveal | close (lệnh nội bộ) | máy chủ | tới `close_at` hoặc mọi người xong; lệnh mang đúng `index` + `schedule_version` (§23.3) | ngừng nhận, công bố lời giải, cộng điểm công khai | — |
| reveal | next | người chơi (phòng học sinh); **chỉ giáo viên** (phòng lớp) | | phòng học sinh: đủ phiếu hoặc 20 giây → câu kế; **phòng lớp: không tự chuyển** | — |
| question (trước deadline) | pause | giáo viên (phòng lớp) | | `phase = paused` (§23.3) | — |
| paused | resume | giáo viên (phòng lớp) | | `phase = question`, deadline mới (§23.3) | — |
| question / paused / reveal | end | giáo viên (phòng lớp); chủ phòng chỉ khi còn một mình | | kết thúc ván | `end_reason` |
| bất kỳ | disconnect | (sự kiện) | mất SSE | **không** coi là rời; giữ chỗ | — |
| bất kỳ | leave | người chơi | | rời; câu sau tính 0 | `left_at` |
| — | restart máy chủ | | | `interrupted`, điểm tính lại từ `battle_answers` | `status`, `end_reason` |

### 9.4 Thành thạo và "Luyện lại câu sai"
- Ván đấu không tạo `mastery_events`, không đổi `mastery_states`.
- Màn kết quả hiện "**Kết quả các câu trong ván**" theo Bài (không gọi là thành thạo).
- Các câu em sai, đúng một phần, bỏ trống được đưa vào danh sách cá nhân **"Câu cần xem lại"**.
- "Luyện lại các câu em vừa sai" tạo một lượt tự luyện từ đúng các câu đó, nguồn mới **`battle_retry`** (mở rộng CHECK của `attempts.source`), có kiểm sở hữu, bỏ câu đã bị thu hồi / cách ly kèm thông báo, chống tạo lặp (bấm lại trả lượt đã tạo). Mặc định (theo phản biện vòng 2, chờ chủ dự án xác nhận ở 18.3): lượt `battle_retry` là **hoạt động sửa sai**, **không** tạo `mastery_events` — nhất quán với nguyên tắc "ván đấu không ảnh hưởng thành thạo"; thành thạo được xác nhận khi em luyện câu tương đương chưa xem trong tự luyện. Nguồn `battle_retry` được giữ qua các lượt luyện lại tiếp theo (§23.6).

---

## 10. Câu hỏi trong ván

### 10.1 Bốn loại
| Loại | Giao diện | Chấm | "Cả phòng chọn gì" |
|---|---|---|---|
| TN | 4 ô lớn có chữ cái + hình dạng ▲ ● ■ ◆ + màu; phím A/B/C/D (**chỉ khi không đang nhập chữ**) | 1 / 0 | Số bạn chọn mỗi đáp án |
| ĐS | 4 dòng, nút Đúng / Sai lớn; Chốt khi thiếu ý → xác nhận "Còn 1 ý chưa chọn, ý thiếu tính sai" | Tỉ lệ ý đúng | Đúng hết / một phần / sai / bỏ trống; lời giải theo ý |
| TLN | Ô nhập, bàn phím số nếu đáp án là số, đơn vị hiện sẵn và **gửi kèm `{value, unit}`**; chấp nhận dấu phẩy thập phân | Khớp đáp án / bí danh / số trong sai số | Đúng / sai / bỏ trống |
| GN | Chạm ý trái rồi ý phải để ghép, chạm lại để huỷ; dùng được bằng bàn phím và trình đọc màn hình | Tỉ lệ cặp đúng | Như ĐS |

### 10.2 Phân bổ mức
NB 40% · TH 40% · VD 20%. **Không dùng VDC** trong ván đấu (loại khỏi tập câu trước khi phân bổ, để bước dồn mức không đưa VDC vào).

### 10.3 Điều kiện câu dùng trong ván — một hàm dùng chung cho **đếm** và **bốc**
1. Điều kiện "học sinh dùng được" hiện có (SQL) với metadata đã công bố.
2. **Chỉ kho trường** (mọi người trong phòng đều được xem).
3. Đúng khối, môn, phân môn, Bài trong phạm vi.
4. Loại ∈ {TN, ĐS, TLN, GN}, mức ∈ {NB, TH, VD}.
5. Qua bước kiểm nội dung hợp lệ và **thực sự tự chấm được** (`auto_gradable`, có đáp án hợp lệ).
6. **Không có tham chiếu ảnh ở bất kỳ vị trí nào** của nội dung (đề, lựa chọn, ý, cặp ghép, khối nội dung, Markdown).
7. Ưu tiên câu có lời giải khi bốc.

Số đếm được cache tối đa 60 giây theo (khối, môn, phân môn, tập Bài) và **chỉ là thông tin**; lúc bắt đầu luôn kiểm lại. Không đủ câu lúc bắt đầu → báo và để chủ phòng chọn lại (không tự nới). Trước khi mở tính năng: đo **tỉ lệ câu bị loại vì ảnh theo Bài** ở các Bài thí điểm; nếu thiếu nghiêm trọng thì làm endpoint ảnh kiểm quyền theo phòng–câu–người xem (đợt sau).

---

## 11. An toàn học sinh, dữ liệu, kiểm duyệt

### 11.1 Tư cách tham gia (máy chủ tự suy ra, không tin dữ liệu gửi lên)
- Học sinh có **đúng một** quan hệ lớp còn hiệu lực trong năm học hiện tại → lấy lớp, khối. Thiếu hoặc mâu thuẫn → không vào được tính năng (thông báo liên hệ giáo viên).
- Phòng học sinh: cùng khối, không có quan hệ chặn. Phòng lớp: chỉ học sinh của lớp đó.
- Giáo viên mở phòng lớp: phải được phân công đúng **cặp lớp–môn** (hoặc quản trị viên).
- **Đọc** (SSE, kết quả, lịch sử, màn chiếu) cũng kiểm quyền: người chơi của phòng, giáo viên của phòng lớp, quản trị viên khi xử lý báo cáo.

### 11.2 Danh tính
**Tên ngắn + lớp** ("Ngọc · 9A2"). Trùng trong phòng → **hậu tố trung tính** ("Ngọc ² · 9A2"), **không bao giờ** mở rộng ra họ tên. Không hiện mã học sinh, ảnh thật. Tên ngắn + lớp **không phải ẩn danh** trong phạm vi trường; sảnh chỉ hiện tối thiểu (tên ngắn chủ phòng).

### 11.3 Giao tiếp
Không chat tự do. 4 biểu cảm có sẵn, **1 lần / 10 giây**, chỉ ở phòng chờ và pha lời giải, **tắt ở phòng lớp**. Biểu cảm hướng tới cả phòng, không hướng tới cá nhân.

### 11.4 Chặn
Áp dụng cho phòng học sinh tạo và ghép trận: hai người có quan hệ chặn (một chiều cũng tính) không cùng phòng, không thấy phòng của nhau. Chỉ chặn được người **đã từng cùng phòng** (tránh dò tài khoản). **Ngoại lệ công khai:** phòng lớp do giáo viên mở và giám sát không áp dụng chặn; trên giao diện ghi rõ "Phòng của lớp do thầy cô quản lý".

### 11.5 Báo cáo — quy trình
- Học sinh báo cáo người cùng phòng với lý do có sẵn (+ ghi chú ngắn tuỳ chọn).
- Hàng đợi cho người phụ trách (quản trị viên được giao): gộp báo cáo trùng (cùng người bị báo, 24 giờ), mức độ (thấp / trung bình / cao theo lý do và số người báo), trạng thái **Mới → Đang xử lý → Đã xử lý / Không vi phạm**, ghi người xử lý.
- Biện pháp: nhắc nhở; **tạm khoá tính năng Đấu** 1 / 3 / 7 ngày; báo giáo viên chủ nhiệm.
- Người báo nhận phản hồi "Đã được xem xét" (không nêu chi tiết xử lý).
- **Chứng cứ:** mỗi phòng giữ trong RAM một bộ đệm vòng 50 sự kiện gần nhất (vào / rời, biểu cảm, đổi đội) tới khi phòng đóng + 10 phút; **chỉ khi có báo cáo** mới ghi bộ đệm đó xuống `battle_safety_events`. Không có báo cáo thì không lưu bền.
- Mục tiêu xử lý: báo cáo mức cao trong 1 ngày học.

### 11.6 Dữ liệu trẻ em
| Dữ liệu | Mục đích | Ai xem | Thời hạn |
|---|---|---|---|
| Phòng, người chơi, câu, đáp án | Kết quả, xem lại, thống kê luyện tập | Học sinh (của mình), giáo viên (phòng lớp mình), quản trị | Hết năm học + 30 ngày, sau đó xoá hoặc ẩn danh |
| Báo cáo | Xử lý vi phạm | Người phụ trách, quản trị | 1 năm |
| Sự kiện an toàn (chỉ phòng có báo cáo) | Chứng cứ khi xử lý | Người phụ trách, quản trị | 90 ngày |
| Quan hệ chặn | Bảo vệ học sinh | Chỉ hệ thống (học sinh xem danh sách mình chặn) | Tới khi gỡ |
- Dữ liệu ván **không** dùng để đánh giá chính thức; muốn dùng (ví dụ gộp thành thạo) phải có quyết định và thông báo riêng.
- Thông báo dễ hiểu cho học sinh khi mở tab lần đầu; nhà trường duyệt chính sách trước khi bật.
- Log vận hành chỉ ghi mã tham chiếu, không ghi nội dung đáp án hay họ tên.

### 11.7 Vận hành
- `battle_enabled` (mặc định **tắt** khi triển khai) — tắt = **ngừng nhận ván mới**, ván đang chạy chơi nốt.
- `battle_emergency_stop` — **dừng khẩn cấp**: kết thúc ngay mọi ván (đánh dấu `interrupted`), đóng mọi luồng.
- `battle_modes` — bật từng chế độ.
- Giới hạn dùng: 1 phòng / ván đang hoạt động mỗi học sinh; nhắc nghỉ sau 5 ván liên tiếp.

---

## 12. UX/UI

### 12.1 Định hướng
Tươi, năng lượng như trò chơi nhưng nghiêm túc cho trường học. Token app + khối "đấu trường" xanh mực `#153F57`, nút chính hổ phách `#F5B82E`. Nét nhận diện: dải sọc chéo "vạch xuất phát" `#153F57`/`#F5B82E` + số mono lớn. Màu phân môn L `#1E5A7A`, H `#B25E09`, S `#256D43`; 4 màu ô đáp án xanh mực, cam nâu, xanh lá, tím `#6B3FA0`. Tránh gradient tím–xanh và thẻ trắng xếp dọc đơn điệu.

### 12.2 Nguyên tắc
- Điện thoại trước; màn chiếu 16:9 cho giáo viên.
- Vùng chạm ≥ 44 px (ô đáp án ≥ 56 px), chữ đề ≥ 16–18 px, tương phản ≥ 4,5:1, focus rõ, trạng thái có chữ / biểu tượng.
- Bàn phím đầy đủ (kể cả GN); phím tắt không kích hoạt khi đang nhập TLN.
- Bàn phím ảo không che nút Chốt; xoay màn hình; phóng to 200%; công thức dài cuộn trong vùng.
- Giảm chuyển động được tôn trọng; tab bị tạm dừng khi quay lại phải đồng bộ ngay.
- Phân biệt rõ **"Nháp trên máy em"** và **"Máy chủ đã nhận"**.
- Lời lẽ: "đúng là chính"; "860 điểm" (không viết "đ"); không có điểm âm.
- Học sinh không có thiết bị (phòng lớp): giáo viên vẫn chiếu được, học sinh trả lời trên giấy — không tính điểm.

### 12.3 Demo
Demo 7 màn (sảnh, phòng chờ, màn chơi, lời giải, kết quả, màn chiếu, tờ trạng thái) được chủ dự án đánh giá "tạm ổn". Còn thiếu: lọc sảnh, thẻ phòng chưa chọn nội dung, Tạo phòng, Tìm đối thủ, Cùng chọn nội dung, Báo cáo / Chặn, giao diện ĐS / TLN / GN, trạng thái "đã nhận", nút Bỏ qua. Khi triển khai, giao diện **viết lại bằng component của app** theo demo; 10 lỗi demo ở Phụ lục.

---

## 13. Kiến trúc

### 13.1 Tổng quan
```
Trình duyệt ──GET/POST /api/battle/*──▶ router battle (body ≤ 16 KB, quyền từng route, giới hạn riêng)
     ▲                                     │
     │ SSE (ảnh chụp theo người xem)      ▼
     └──────────── stream ◀── rooms (sổ phòng RAM + hàng lệnh tuần tự / phòng + hẹn giờ)
                                 │  ├─ engine (luật thuần, nhận `now`)
                                 │  ├─ dto (ảnh chụp theo vai trò × pha, danh sách trường cho phép)
                                 │  └─ deck (điều kiện §10.3: đếm + bốc)
                                 ▼
                           PostgreSQL (nguồn bền vững duy nhất)
```

### 13.2 Thành phần (`backend/src/services/battle/`)
- `engine.js` — thuần, mọi hàm nhận `now`: điểm, xếp hạng (đồng hạng), điểm đội (danh sách đóng băng), huy hiệu, phiếu bầu, phạm vi chung của nhóm, điều kiện bắt đầu (sức chứa, đúng 2 đội × 1–4…), phân bố.
- `dto.js` — tạo ảnh chụp bằng **danh sách trường cho phép** theo vai trò (người chơi, chủ phòng, giáo viên, quản trị) × pha. Chỉ chỗ này được đưa dữ liệu ra ngoài.
- `deck.js` — điều kiện §10.3, đếm có cache, bốc + đóng băng `curriculum_snapshot`.
- `rooms.js` — sổ phòng, **hàng lệnh tuần tự theo phòng**, hẹn giờ, ghi DB.
- `matchmaking.js` — hàng chờ, phạm vi chung của nhóm, chặn, lời mời nới.
- `stream.js` — SSE, bộ đệm có trần, nhịp giữ kết nối.
- `safety.js` — báo cáo, chặn, tạm khoá, sự kiện an toàn.
- `routes/battle.js` + quản trị.

### 13.3 Tính nhất quán
- Mỗi phòng một **hàng lệnh** (chuỗi promise): mọi lệnh thay đổi trạng thái (vào, rời, phiếu, bắt đầu, trả lời, chuyển pha từ hẹn giờ) chạy lần lượt; không có hai lệnh của cùng phòng xen kẽ qua `await`.
- Lệnh liên quan nhiều phòng / hàng chờ (vào phòng khi đang chờ ghép, ghép trận) giữ thêm **khoá theo học sinh**.
- Trả lời: kiểm điều kiện → `INSERT battle_answers` trong giao dịch (khoá duy nhất room–idx–user, FK tới người chơi) → **commit** → cập nhật RAM → ACK cho học sinh → phát ảnh chụp. Gửi lại cùng câu → trả **kết quả đã lưu** (ACK lặp lại), không lỗi.
- Điểm tổng / xếp hạng luôn **tính lại được** từ `battle_answers`; RAM chỉ là bản sao để phát nhanh.
- Sức chứa: vào phòng kiểm và ghi trong hàng lệnh, nên hai người không thể cùng chiếm chỗ cuối.

### 13.4 Vì sao RAM + PostgreSQL, không Redis
Một tiến trình, ván ngắn, cần đồng hồ chính xác. Mọi mốc đã commit vào PostgreSQL → restart không mất đáp án đã xác nhận. Redis hiện có là cache có thể loại khoá, **không** dùng giữ trạng thái ván. Khi cần nhiều tiến trình: thiết kế riêng quyền sở hữu phòng, điều phối, phát sự kiện, phục hồi (ngoài phạm vi).

### 13.5 Giới hạn tài nguyên (mặc định, cấu hình được)
| Giới hạn | Giá trị |
|---|---|
| Phòng đang hoạt động toàn hệ thống | 120 |
| Người / phòng | theo chế độ (§6) |
| Luồng SSE toàn hệ thống / mỗi người | 1200 / 2 (§23.9) |
| Tạo phòng | 5 / 10 phút mỗi học sinh |
| Thử mã phòng sai | 10 / phút mỗi học sinh |
| Biểu cảm | 1 / 10 giây, chỉ phòng chờ và lời giải |
| Body JSON `/api/battle` | 16 KB, gắn **trước** bộ phân tích 20 MB toàn cục |
| Bộ đệm SSE mỗi client | 64 KB; vượt → ngắt (`closed {reason:'slow'}`), client nối lại nhận ảnh chụp mới (§23.9) |
| Phòng chờ không hoạt động | đóng sau 30 phút |
Khi quá tải: giảm / tắt biểu cảm và cập nhật sảnh trước, **ưu tiên lưu đáp án**.

### 13.6 Tích hợp với app hiện có
1. `server.js`: hàng rào học sinh cho phép thêm đúng tiền tố `/battle/`; giữ xác thực, CSRF, giới hạn IP; gắn `/api/battle` với giới hạn theo người dùng + giới hạn riêng §13.5.
2. `practice/config.js`: thêm `battle_enabled`, `battle_emergency_stop`, `battle_modes`, `battle_limits`; cho phép đặt `true` với **danh sách cờ vận hành** được phép (sửa cả kiểm tra ở `routes/practice.js`).
3. `attempts.createAttempt`: thêm lối vào nội bộ cho lượt `battle_retry` (danh sách câu cố định đã kiểm), migration mở rộng CHECK `attempts.source`.
4. Điều hướng học sinh / giáo viên: mục "Đấu".
5. Danh sách "Câu cần xem lại": thêm nguồn từ ván đấu.

### 13.7 Frontend
`pages/battle/`: `ArenaLobby`, `CreateRoomSheet`, `FindMatchSheet`, `RoomPage` (theo `status/phase`), `ContentVote`, `AnswerTiles` (TN), `TrueFalseRows` (ĐS), `ShortAnswer` (TLN), `MatchPairs` (GN), `RankStrip`, `Podium`, `ConnectionBanner`, `ProjectorPage`, `ReportSheet`; quản trị `BattleSafety`. Hook `useBattleStream` (§15.4). CSS `arena.css` dùng token sẵn có.

---

## 14. Dữ liệu (một migration chỉ thêm + mở rộng CHECK)

| Bảng | Cột chính | Ràng buộc |
|---|---|---|
| `battle_rooms` | id, code, run_id, **asked_count**, kind, visibility, host_id, class_id, grade, subject_id, branch_id, scope jsonb (Chương / Bài), content_mode, capacity, question_count, seconds, time_factors jsonb, **rules_version**, status (lobby/playing/finished/interrupted/closed), end_reason, rematch_of, mốc thời gian | `code ~ '^[0-9]{6}$'`; mã duy nhất trong phòng chưa kết thúc; capacity khớp kind (CHECK) |
| `battle_players` | room_id, user_id, team, display_name, ready, joined_at, left_at, points, correct, rank | team ∈ {1, 2} hoặc NULL; points, correct ≥ 0 |
| `battle_questions` | room_id, idx, question_version_id, question_id, topic_id, cognitive_level, **curriculum_snapshot jsonb**, seconds | idx ≥ 0; duy nhất (room_id, question_id); FK question_id; `question_version_id` phải thuộc `question_id` (kiểm khi ghi) |
| `battle_answers` | room_id, idx, user_id, **client_id uuid**, response, score, ms, skipped, received_at | PK (room, idx, user); FK (room, user) → `battle_players`; score ∈ [0, 1]; ms ≥ 0 |
| `battle_reports` | id, room_id, reporter_id, target_id, reason, note, severity, status, handled_by, handled_at, created_at | reporter ≠ target |
| `battle_blocks` | user_id, blocked_id, created_at | user ≠ blocked |
| `battle_suspensions` | user_id, until, reason, created_by | |
| `battle_safety_events` | room_id, kind, actor_id, at, detail jsonb | xoá sau 90 ngày |
| `attempts` | thêm `battle_room_id` (NULL) | CHECK `source` thêm `'battle_retry'`; chỉ mục duy nhất `(student_id, battle_room_id) WHERE source='battle_retry' AND retry_of IS NULL` (chống tạo lặp lượt đầu) |

Câu hỏi không cần sao chép nội dung vì phiên bản đã duyệt là bất biến; bản ghi ván chỉ đóng băng metadata chương trình và luật (`rules_version`). Không ghi `attempts` / `mastery_*` từ ván.

---

## 15. API, DTO, SSE

### 15.1 HTTP (`/api/battle`, đã đăng nhập; mọi route kiểm quyền riêng)
| Method | Đường dẫn | Ai | Việc |
|---|---|---|---|
| GET | `/me` | học sinh / giáo viên | tư cách (lớp, khối), cờ đang bật, phòng / hàng chờ hiện tại, tạm khoá |
| GET | `/lobby` · `/lobby/stream` | học sinh | sảnh + sự kiện riêng "đã ghép" |
| GET | `/options` | học sinh / giáo viên | môn / phân môn / Chương / Bài đủ câu (+ gợi ý riêng) |
| POST | `/rooms` | học sinh; giáo viên (phòng lớp) | tạo phòng |
| POST | `/rooms/join` · `/rooms/:id/join` | học sinh | vào bằng mã / từ sảnh |
| POST | `/rooms/:id/leave` · `/ready` · `/team` · `/vote` · `/nominate` | người chơi | |
| POST | `/rooms/:id/start` · `/next` · `/pause` · `/resume` · `/end` | theo §9.3 | |
| POST | `/rooms/:id/answer` | người chơi | `{index, response, client_id}` hoặc `{index, skip:true}`; trả `{received:true, at}` sau commit |
| POST | `/rooms/:id/emote` | người chơi | |
| POST | `/rooms/:id/rematch` | người chơi | |
| POST | `/rooms/:id/retry-wrong` | người chơi | tạo / trả lượt `battle_retry` |
| GET | `/rooms/:id/stream` · `/rooms/:id/result` · `/history` | người có quyền đọc | |
| POST · PATCH · DELETE | `/match` | học sinh | vào hàng chờ / đồng ý nới / rời |
| POST | `/reports` · `/blocks`; DELETE `/blocks/:userId`; GET `/blocks` | học sinh | |
| GET · POST | `/admin/reports`, `/admin/suspensions`, `/admin/settings` | quản trị | |

### 15.2 DTO theo pha (danh sách trường cho phép)
| Pha | Người chơi nhận | Không bao giờ nhận |
|---|---|---|
| lobby | cấu hình, người chơi (tên ngắn, lớp, sẵn sàng, đội), phiếu (đếm + phiếu của em), lý do chưa bắt đầu được | — |
| countdown / question / closing | câu (đề, lựa chọn / ý / cột ghép, đơn vị, Bài), câu trả lời **của em**, cờ "đã trả lời" của từng người, **điểm / số đúng chốt tới câu trước** | đáp án, lời giải, kết quả chấm câu hiện tại của bất kỳ ai, phân bố |
| reveal | thêm: đáp án, lời giải, phân bố, kết quả của em, điểm cập nhật | câu trả lời chi tiết của người khác |
| finished / interrupted | kết quả, xếp hạng (podium top 3 + hạng của em), câu + đáp án + lời giải **các câu đã phát** (`idx < asked_count`), kết quả của em | câu chưa phát; câu trả lời chi tiết của người khác |
Giáo viên (màn chiếu) nhận số người đã trả lời, phân bố sau khi đóng nhận bài; không nhận đáp án sớm hơn học sinh.

### 15.3 Bảo mật
Đáp án chỉ có trong DTO pha `reveal` / kết thúc; test kiểm **HTTP, SSE, kết quả, lịch sử và dữ liệu lồng nhau**. Mọi lệnh kiểm người chơi, pha, `index`, `close_at`. Mã phòng chỉ để vào; phòng "chỉ qua mã" không hiện ở sảnh.

### 15.4 Hợp đồng SSE
- Header: `Content-Type: text/event-stream`, `Cache-Control: private, no-store, no-transform`, `X-Accel-Buffering: no`. Caddy: **loại `/api/battle/*/stream` khỏi `encode`**, kiểm độ trễ thật qua cấu hình triển khai.
- Mỗi kết nối (mới hoặc nối lại) nhận **ngay một ảnh chụp đầy đủ**. Mỗi sự kiện có `run_id` (đổi khi phòng được khôi phục / máy chủ khởi động lại) + `version` tăng dần; client chấp nhận ảnh chụp khi `run_id` khác hoặc `version` lớn hơn.
- Nhịp `: ping` 15 giây. Gộp cập nhật trung gian trong 250 ms; chuyển pha phát ngay.
- Máy chủ đóng luồng khi mất quyền (rời phòng, bị tạm khoá, phiên hết hạn, dừng khẩn cấp) kèm sự kiện `closed {reason}`.
- Client: lỗi 401 / 403 → dừng nối lại, báo người dùng; 429 → chờ lâu hơn; lỗi mạng → nối lại có giãn cách (1, 2, 4, 8 giây, tối đa 15 giây).

### 15.5 Ví dụ ảnh chụp (pha `question`, rút gọn)
```json
{"run_id":"r-7f2","version":41,"status":"playing","phase":"question","server_now":1760000000000,
 "deadline":1760000030000,"question":{"index":2,"total":10,"type":"multiple_choice","stem":"…","options":[{"id":"A","text":"…"}],"topic_name":"Định luật Ôm"},
 "my_answer":{"received":true},"players":[{"id":31,"name":"Ngọc · 9A2","answered":true,"points":200}]}
```

### 15.6 Bản nháp đã có (chưa nối vào app, cần sửa theo bản 1.1)
`backend/src/services/battle/engine.js` (còn thưởng tốc độ, phiếu đề xuất / đồng ý, xếp hạng theo ID, `Date.now()` bên trong, `publicPlayer` lộ điểm câu hiện tại) và `backend/src/db/migration-v69-battle.sql` (thiếu các ràng buộc §14). Sẽ viết lại khi triển khai.

---

## 16. Lỗi và phục hồi

| Tình huống | Xử lý |
|---|---|
| Rớt mạng | Không coi là rời; nối lại nhận ảnh chụp; câu chưa Chốt còn ở máy (nháp); đã Chốt mà chưa thấy ACK → gửi lại cùng `client_id`, máy chủ trả kết quả đã lưu |
| Rời ván | Câu sau tính 0; đội giữ mẫu số; chủ phòng rời ở phòng chờ → chuyển quyền |
| Mọi người rời | Ván kết thúc, lưu kết quả |
| Lệnh trùng / gửi lại | Trả kết quả đã lưu |
| Hai người vào chỗ cuối / hai lệnh bắt đầu | Hàng lệnh tuần tự → kết quả xác định |
| Máy chủ khởi động lại | Phòng chờ → `closed`; đang chơi → **`interrupted`** (không coi là ván hoàn chỉnh), điểm tính lại từ `battle_answers`, học sinh mở lại thấy "Ván bị gián đoạn ở câu X" |
| Câu bị thu hồi giữa ván | Ván tiếp tục với bộ câu đã đóng băng; câu đó loại khỏi "Luyện lại" kèm thông báo |
| Kho thiếu câu lúc bắt đầu | Báo, chủ phòng chọn lại |
| Ngừng nhận ván mới | Không tạo / vào / ghép mới; ván đang chạy chơi nốt |
| Dừng khẩn cấp | Kết thúc mọi ván (`interrupted`), đóng luồng |
| Rollback ứng dụng | Bảng battle chỉ thêm, bản cũ bỏ qua; cờ `battle_enabled` mặc định tắt |

---

## 17. Tải, kiểm thử, nghiệm thu, triển khai

### 17.1 Tải
- Kịch bản xấu nhất cần đo: phòng 50 người trả lời đồng loạt sát hạn (50 lệnh trong ~1 giây; phát gộp thay vì 50 × 50 ảnh chụp); 300 học sinh chung một IP (câu trả lời + phiếu + SSE); nối lại đồng loạt sau mất mạng; client chậm.
- Đo: phòng hoạt động, hàng chờ, luồng mở, số lần nối lại, byte SSE / giây, bộ đệm client chậm, độ trễ vòng lặp sự kiện, thời gian chờ DB pool, p95 lưu đáp án, đáp án trễ / trùng, ván gián đoạn, **ảnh hưởng tới tự luyện**.
- Chạy trên **máy thử + database sao chép, qua Caddy cùng cấu hình**; không chạy trên máy thật của trường.

### 17.2 Kiểm thử
- **Đơn vị:** engine, dto (không lộ đáp án ở mọi pha), deck (điều kiện §10.3 kể cả ảnh ở mọi vị trí), phiếu bầu, phạm vi chung nhóm, ghép trận, giới hạn.
- **Tích hợp** (database sao chép): ván trọn vẹn 2–3 học sinh qua API + SSE; khác khối / ngoài lớp / ngoài phòng bị chặn đọc và ghi; trả lời sát `close_at`, trễ, trùng; ACK sau commit (giả lỗi DB giữa chừng); restart giữa ván; dừng khẩn cấp; `mastery_*` không đổi; `battle_retry` đúng câu, không tạo lặp; 4 loại câu (dấu phẩy thập phân, đơn vị, sai số, ý thiếu, ghép thiếu); cấu hình cờ.
- **Trình duyệt:** 2–3 ngữ cảnh đấu trọn ván; điện thoại, máy tính, màn chiếu; không phần tử bị cắt ở 360 / 390 / 1366 px; bàn phím; không lỗi console.
- **CI:** thêm hành trình đấu đôi vào bộ smoke mà `ci.yml` đã chạy trên Postgres riêng.

### 17.3 Tiêu chí nghiệm thu tối thiểu (bắt buộc trước khi bật bất kỳ chế độ nào)
1. Mọi đáp án đã ACK tồn tại sau restart và không bị tính hai lần.
2. Không có kênh lộ kết quả câu hiện tại trước khi đóng nhận bài.
3. Người ngoài phòng / khác khối / không đủ quyền không đọc, không ghi được.
4. Hai người vào chỗ cuối, hai lệnh bắt đầu, Chốt sát hạn cho kết quả xác định.
5. Đủ 4 loại câu với các trường hợp biên.
6. Ván không tạo `mastery_events`, không đổi `mastery_states`; `battle_retry` có nguồn gốc rõ.
7. Tải qua Caddy đạt §17.1 mà tự luyện không chậm đáng kể.
8. Ngừng nhận ván mới, dừng khẩn cấp, restart, rollback có kết quả đúng như mô tả.

### 17.4 Triển khai
1. Viết đủ 4 chế độ + nền an toàn (quyền, cờ, giới hạn, báo cáo, chặn, tạm khoá) trong một đợt.
2. Đưa lên máy thật với `battle_enabled = false`.
3. Bật theo `battle_modes` theo thứ tự khuyến nghị §6, mỗi bước qua §17.3 + quan sát một tuần (chủ dự án có thể rút ngắn).
4. Thời điểm deploy: khi không có ván đang chạy (kiểm số phòng hoạt động), ngoài giờ học.

---

## 18. Câu hỏi mở còn lại
1. **Hiển thị xếp hạng:** bản 1.2 mặc định podium top 3 + "Em hạng X/N", **không** có bảng đầy đủ; màn chiếu mặc định chỉ thống kê lớp. Codex vẫn muốn mặc định chỉ kết quả cá nhân (không podium). Chủ dự án chọn.
2. **Phát hành:** bật đủ 4 chế độ một lúc hay theo thứ tự khuyến nghị?
3. **`battle_retry` có tính thành thạo không?** Bản 1.2 mặc định **không tính** (hoạt động sửa sai). Chủ dự án có thể chọn tính như `retry`.
4. Hệ số thời gian theo loại (TN ×1; ĐS, GN, TLN ×1,5) có đủ? Có cần tính theo độ dài đề?
5. Giới hạn mặc định §13.5 có hợp với quy mô trường?
6. Thời hạn lưu dữ liệu §11.6 có phù hợp quy định nhà trường?

## 19. Rủi ro
| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Quá tải máy chủ trường | Trung bình | Đo tải §17.1; giới hạn §13.5; ưu tiên lưu đáp án; ngừng nhận / dừng khẩn cấp |
| SSE qua Caddy / đường từ xa bị gom đệm hoặc cắt | Trung bình | Loại khỏi `encode`, đo thật, nhịp 15 giây |
| Lộ kết quả câu hiện tại | Thấp sau sửa | DTO theo pha + test mọi kênh |
| Mất đáp án / tính hai lần | Thấp sau sửa | Hàng lệnh, commit trước ACK, khoá duy nhất |
| Chơi trong giờ / lạm dụng | Trung bình | 1 ván hoạt động, nhắc nghỉ, tạm khoá, theo dõi chỉ số |
| Bắt nạt dù không chat | Thấp–trung bình | Tên ngắn, biểu cảm hạn chế, báo cáo có quy trình, chặn |
| Thiếu câu (đặc biệt vì loại câu có ảnh) | Cao đầu năm | Đo tỉ lệ loại theo Bài; chỉ hiện lựa chọn đủ câu; bảng độ phủ (V6.8) |
| Lệch mục tiêu học | Trung bình | Không thưởng tốc độ, kết quả ưu tiên câu cần xem lại, luyện lại câu sai |

## 20. Sổ quyết định
| Ngày | Quyết định | Người |
|---|---|---|
| 18/10 | Làm trong app hiện có; không ghép mã dự án tham khảo | Chủ dự án |
| 18/10 | Ván chỉ có kết quả trong ván; gộp thành thạo để sau | Chủ dự án |
| 18/10 | Ghép tự do, không công tắc theo lớp | Chủ dự án |
| 18/10 | Không chat tự do | Chủ dự án |
| 18/10 | Hết giờ chưa Chốt → không tính | Chủ dự án |
| 18/10 | Tên ngắn + lớp | Chủ dự án (theo đề xuất) |
| 18/10 | Dùng TN, ĐS, TLN, GN | Chủ dự án |
| 18/10 | Làm đủ các chế độ một đợt; mọi người Sẵn sàng thì chủ phòng bấm chạy | Chủ dự án |
| 18/10 | Có công tắc tắt toàn bộ | Chủ dự án |
| 18/10 (v1.1) | Bỏ thưởng tốc độ; tốc độ chỉ phân định; đồng hạng | Theo phản biện, chờ chủ dự án xác nhận |
| 18/10 (v1.1) | Bỏ huy hiệu Tiến bộ nhất; đổi nhãn "Kết quả các câu trong ván" | Theo phản biện |
| 18/10 (v1.1) | Bỏ phiếu đơn giản: ≤ 3 phạm vi đề cử + "Cả môn", mỗi người một phiếu | Theo phản biện |
| 18/10 (v1.1) | Phòng lớp là ngoại lệ công khai của chặn | Theo phản biện, chờ chủ dự án xác nhận |
| 18/10 (v1.1) | `battle_enabled` mặc định tắt; cờ từng chế độ; dừng khẩn cấp | Theo phản biện |
| 18/10 (v1.1) | Không dùng VDC và câu có ảnh trong bản đầu | Theo phản biện |

## 21. Phụ lục: lỗi của bản demo
| # | Màn | Lỗi | Cách sửa khi viết lại |
|---|---|---|---|
| 1 | Sảnh · điện thoại | Mép phải bị cắt (nút "Vào", "6 chữ số", hàng phòng chờ) | `min-width:0`, `flex-wrap`, `minmax(0,1fr)` |
| 2 | Thanh trên | "Tự ôn" xuống dòng | Không ngắt nhãn; < 380 px chỉ biểu tượng |
| 3 | Mọi màn | Thanh demo che nội dung | (chỉ ở demo) |
| 4 | Sảnh · máy tính | Cột phải trống | Cân lưới |
| 5 | Kết quả | "2.490đ" | "2.490 điểm" (bản 1.1: thang mới) |
| 6 | Phòng chờ | Tên bị cắt | Tên ngắn + lớp |
| 7 | Phòng chờ | "Bắt đầu" hiện cho mọi người | Chỉ chủ phòng, kèm lý do |
| 8 | Tờ trạng thái | Tự ghi đáp án nháp khi hết giờ | Chưa Chốt → không tính |
| 9 | Mã phòng | Hai cách viết | "Mã 519 204" |
| 10 | Sảnh | Lời mời đề cao tốc độ | "Đúng là chính" |

## 22. Thay đổi so với 1.0
Theo phản biện vòng 1 (`phan-bien/V1_CODEX_PHAN_BIEN.md`, trả lời ở `V1_CLAUDE_TRA_LOI.md`): tích hợp route / cấu hình (§13.6); DTO theo pha, không lộ điểm câu hiện tại (§15.2); hàng lệnh + commit trước ACK (§13.3); máy trạng thái + `close_at` (§9.1, §9.3); điều kiện câu dùng chung đếm / bốc, bỏ câu có ảnh và VDC (§10); tư cách tham gia từ máy chủ, ngoại lệ chặn ở phòng lớp (§11); giới hạn tài nguyên và hai chế độ dừng (§11.7, §13.5); bỏ thưởng tốc độ, đồng hạng (§9.2); bỏ "Tiến bộ nhất", đổi nhãn thành thạo, `battle_retry` (§9.4); ghép theo giao phạm vi cả nhóm, bỏ phiếu đơn giản (§8); hợp đồng SSE (§15.4); snapshot chương trình + `rules_version` (§14); không dùng Redis cache giữ phòng (§13.4); tên trùng dùng hậu tố trung tính, quy trình báo cáo, dữ liệu trẻ em (§11); tải và nghiệm thu (§17); sửa mô tả môn / phân môn và cơ chế ảnh (§2).

### Bổ sung bản 1.3
Theo phản biện vòng 3 (`phan-bien/V3_CODEX_PHAN_BIEN.md`): tạm dừng chỉ ở pha `question` trước deadline; resume về `question`; lệnh hẹn giờ có `index` + `schedule_version`, lệnh cũ bị bỏ qua; lệnh nội bộ không bị trần hàng lệnh; đồng bộ §1, §9.1, §9.3, §13.5, §14, §15.2 với phụ lục.

### Bổ sung bản 1.2
Theo phản biện vòng 2 (`phan-bien/V2_CODEX_PHAN_BIEN.md`, trả lời `V2_CLAUDE_TRA_LOI.md`): đồng hạng khi bằng điểm (bỏ phân định theo thời gian); không bảng xếp hạng đầy đủ; màn chiếu mặc định không tên; `battle_retry` mặc định không tính thành thạo; cờ khả năng chi tiết; chứng cứ an toàn chỉ lưu khi có báo cáo, thời hạn tách bạch; phòng lớp không tự chuyển câu; thêm **mục 23 — phụ lục triển khai** (ràng buộc khi lập trình).

---

## 23. Phụ lục triển khai (ràng buộc khi lập trình)

Khi mục này khác các mục trước, **mục này thắng**.

### 23.1 Khoá và thứ tự khoá
- Hai loại khoá trong RAM: **khoá học sinh** (mutex theo `user_id`) và **hàng lệnh phòng** (chuỗi promise theo `room_id`).
- Thứ tự cố định: **khoá học sinh trước, hàng lệnh phòng sau**. Không bao giờ lấy khoá học sinh khi đang ở trong hàng lệnh phòng.
- Nhiều học sinh (ghép trận, vào phòng qua sảnh khi đang chờ ghép): lấy khoá học sinh theo `user_id` **tăng dần**, rồi mới tạo / vào phòng.
- Mọi khoá chờ tối đa 5 giây; quá hạn → 503 "Hệ thống đang bận, thử lại", không giữ nửa chừng.

### 23.2 Gửi đáp án, biên nhận, gửi lại
- Lệnh: `POST /rooms/:id/answer {index, client_id, response}` hoặc `{index, client_id, skip:true}`. `client_id` là UUID trình duyệt tạo **một lần cho mỗi (phòng, câu)**, giữ trong `sessionStorage` tới khi nhận biên nhận.
- Handler ghi **`received_at` = giờ máy chủ khi request tới** (trước khi vào hàng lệnh), rồi đưa lệnh vào hàng lệnh phòng.
- Trong hàng lệnh, theo đúng thứ tự:
  1. **Tra biên nhận cũ trước:** đã có `battle_answers (room, idx, user)` → cùng `client_id` thì trả lại biên nhận đã lưu (HTTP 200, **bất kể pha hiện tại**); khác `client_id` thì 409 "Câu này em đã chốt" kèm biên nhận cũ.
  2. Mới áp điều kiện nhận đáp án mới: `phase = question`, `index` = câu hiện tại, `received_at ≤ close_at`, người chơi đang hoạt động, phòng không tạm dừng, không bị tạm khoá.
  3. Chấm, `INSERT battle_answers` (gồm `client_id`, `received_at`, `ms`) trong giao dịch với `statement_timeout` 3 giây → **commit** → cập nhật RAM → trả biên nhận `{received:true, index, at}` → phát ảnh chụp (gộp 250 ms).
  4. DB lỗi / quá hạn → 503, **không** có biên nhận; trình duyệt gửi lại cùng `client_id` (giãn cách 1, 2, 4 giây, tối đa 5 lần), rồi báo "Chưa gửi được, em bấm Chốt lại".
- Giao diện chỉ hiện "Máy chủ đã nhận ✓" khi có biên nhận.

### 23.3 Đóng câu, tạm dừng, chuyển câu
- Hẹn giờ tại `close_at` **đưa lệnh `close` vào hàng lệnh**. Lệnh trả lời đứng trước `close` được xử lý theo §23.2 (`received_at` của chúng ≤ `close_at`); khi `close` chạy: `phase = reveal`, phát lời giải ngay. Không chờ "hàng lệnh rỗng".
- Mọi người chơi đang hoạt động đã có đáp án / bỏ qua → đưa `close` vào hàng lệnh ngay.
- **Tạm dừng** (chỉ phòng lớp, giáo viên):
  1. **Chỉ được tạm dừng ở pha `question` và trước `deadline`.** Ở `reveal` (vốn không tự chuyển ở phòng lớp), `countdown` hay sau `deadline` thì nút Tạm dừng bị vô hiệu và máy chủ từ chối (409).
  2. Lệnh `pause` trong hàng lệnh → `phase = paused`, lưu `remaining = max(1000 ms, deadline − now)`, tăng `schedule_version`, huỷ hẹn giờ. Đáp án có `received_at` sau thời điểm pause bị từ chối ("Đang tạm dừng"); đáp án đứng trước `pause` trong hàng xử lý bình thường.
  3. `resume` → **`phase = question`**, `deadline = now + remaining`, `close_at = deadline + 500 ms`, tăng `schedule_version`, đặt hẹn giờ mới; `ms` của câu đó trừ khoảng tạm dừng.
- **Lệnh hẹn giờ có phiên bản:** mọi lệnh nội bộ do hẹn giờ sinh ra (`close`, chuyển câu, hết bỏ phiếu, hết đếm ngược) mang `index` + `schedule_version` tại lúc đặt. Khi xử lý, lệnh có `index` hoặc `schedule_version` khác hiện tại thì **bỏ qua** (không lỗi). Mỗi lần pause / resume / đóng sớm / chuyển câu đều tăng `schedule_version`.
- **Lệnh nội bộ không bị trần hàng lệnh:** trần 200 lệnh chờ (§23.9) chỉ áp cho yêu cầu từ ngoài (HTTP); lệnh nội bộ luôn được xếp hàng.
- **Chuyển câu:** phòng học sinh — mọi người chơi đang hoạt động bấm "Câu tiếp" hoặc 20 giây; **phòng lớp — chỉ giáo viên bấm, không tự chuyển**.
- `asked_count` = số câu đã phát; tăng khi một câu chuyển sang `question`, ghi DB.

### 23.4 Rời, chặn, tạm khoá, quyền đọc
| Sự kiện | Hiệu ứng |
|---|---|
| Mất kết nối SSE | Không đổi gì; vẫn là người chơi |
| Rời | `left_at`; câu sau tính 0; mất quyền **xem trực tiếp**; vẫn xem **kết quả và lịch sử của mình** sau khi ván kết thúc |
| Chặn khi **cùng phòng chờ** | **Người chặn tự rời phòng** (không đẩy người bị chặn ra — tránh lạm dụng); có hiệu lực ngay cho sảnh / ghép |
| Chặn khi **đang trong ván** | Ghi quan hệ chặn; ván tiếp tục; có hiệu lực từ ván sau; người chặn có thể Rời |
| Bị tạm khoá | Rời khỏi phòng chờ / hàng chờ ngay; đang trong ván → đánh dấu rời (lý do `suspended`), đóng luồng; vẫn xem lịch sử của mình |
| Phòng lớp | Không áp dụng chặn (ngoại lệ công khai); vẫn áp dụng tạm khoá |

Quyền đọc: **luồng trực tiếp** — người chơi đang hoạt động + giáo viên chủ phòng lớp; **kết quả / lịch sử** — người từng chơi (của chính mình + phần công khai của ván), giáo viên của phòng lớp, quản trị khi xử lý báo cáo.

### 23.5 Kết quả, đồng hạng, kết thúc sớm
- Hạng = 1 + số người có tổng điểm **lớn hơn**; bằng điểm → đồng hạng.
- Kết quả, lời giải, "Câu em cần xem lại", "Luyện lại" **chỉ xét câu có `idx < asked_count`**. Câu chưa phát **không bao giờ** được công bố (kể cả khi ván `interrupted` / kết thúc sớm).
- "Bỏ trống" chỉ áp dụng cho câu đã phát mà em không trả lời.

### 23.6 Tích hợp `battle_retry`
| Vị trí | Thay đổi |
|---|---|
| Migration | CHECK `attempts.source` thêm `'battle_retry'`; cột `attempts.battle_room_id uuid NULL REFERENCES battle_rooms`; chỉ mục duy nhất `(student_id, battle_room_id) WHERE source='battle_retry' AND retry_of IS NULL` |
| `attempts.createAttempt` | Tham số nội bộ `battleRetry: {roomId, versionIds}`; `selection_reason = 'repeat'` (hiện `attempts.js:66` gán `'assigned'` cho nguồn khác `retry`) |
| Luyện lại tiếp từ một lượt `battle_retry` | `attempts.js:54` hiện luôn đặt `source='retry'` → sửa: **giữ** `source='battle_retry'` và `battle_room_id` của lượt gốc |
| Nộp bài (`attempts.js:112–113`) | Lượt `battle_retry` **không** tạo `mastery_events` (mặc định §9.4); vẫn chấm, vẫn lưu kết quả |
| `lessonMap.js:186` (đếm lượt sửa sai cho huy hiệu "Sửa sai") | Đếm cả `battle_retry` |
| `portfolio.js:68` (thống kê nguồn) | Thêm `battle_retry_attempts`, nhãn "Luyện lại sau ván đấu" |
| "Câu cần xem lại" | Thêm câu sai / một phần / bỏ trống (đã phát) từ ván, nhãn nguồn "Ván đấu" |

### 23.7 SSE — một cơ chế duy nhất
- Trình duyệt dùng **`fetch` đọc luồng** (ReadableStream + bộ tách sự kiện SSE), không dùng `EventSource`, để đọc được mã HTTP và `Retry-After`.
- Nối lại: lỗi mạng / luồng đóng → 1, 2, 4, 8, 15 giây (tối đa 15); **401** → về trang đăng nhập; **403** → "Em không còn trong phòng này", dừng; **429** → chờ theo `Retry-After`; sự kiện `closed {reason}` → theo lý do (`slow` → nối lại sau 2 giây; `left` / `suspended` / `emergency` → dừng).
- Máy chủ giới hạn **10 lần mở luồng / phút / người** (vượt → 429).
- Mỗi lần mở luồng: gửi ngay ảnh chụp đầy đủ (`run_id`, `version`).

### 23.8 Cờ khả năng
`battle_modes = {class, duel_code, lobby, matchmaking, vote, ffa, team}` (boolean). Máy chủ từ chối route / thao tác thuộc khả năng đang tắt (403, mã `BATTLE_FEATURE_OFF`); `/me` trả danh sách để giao diện ẩn lối vào. Ví dụ: chỉ bật `duel_code` → tạo phòng đôi bằng mã, không có sảnh, không ghép, không bỏ phiếu (phải chọn nội dung khi tạo).

### 23.9 Giới hạn và ngưỡng nghiệm thu tải (thay các dòng tương ứng ở §13.5)
| Giới hạn | Giá trị ban đầu |
|---|---|
| Luồng SSE toàn hệ thống / mỗi người | 1200 / 2 |
| Bộ đệm SSE mỗi client | 64 KB (tối đa ~75 MiB toàn hệ thống) |
| Lệnh chờ trong hàng lệnh mỗi phòng | 200; vượt → 503 "Phòng đang bận" |
| Thời gian chờ lấy kết nối DB | 2 giây; `statement_timeout` ghi battle 3 giây |
| Mở luồng | 10 / phút / người |

Ngưỡng đạt khi đo tải (máy thử, qua Caddy, 300 học sinh + một phòng 50 người trả lời đồng loạt + nối lại đồng loạt): p95 lưu đáp án ≤ 300 ms, p99 ≤ 1 s; độ trễ vòng lặp sự kiện p99 ≤ 100 ms; **0** đáp án mất hoặc trùng; p95 các API tự luyện **tăng không quá 20%** so với lúc không có ván. Giới hạn đưa lên máy thật = mức đã đo đạt (chưa đạt ở 300 thì hạ trần tương ứng).

### 23.10 Cổng trước khi "up main"
Chủ dự án đẩy thẳng `main` (không qua PR) và `deploy.yml` không chạy smoke. Quy tắc: chỉ "up main" khi **lần chạy `ci.yml` của nhánh trên đúng commit đó đã xanh** (gồm smoke có hành trình đấu đôi), cộng unit / security / integration ở máy dev. Người đẩy `main` ghi mã lần chạy CI vào `AI_WORK_LOG.md`.
