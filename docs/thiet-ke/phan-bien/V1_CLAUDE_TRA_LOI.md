# Vòng 1 — Claude trả lời phản biện của Codex

Đầu vào: `V1_CODEX_PHAN_BIEN.md` (Codex gpt-6-astra, suy luận cao, chỉ đọc). Claude đã tự kiểm chứng lại các căn cứ quan trọng trong mã trước khi trả lời.
Kết quả: bản kế hoạch nâng lên **1.1** (`../KE_HOACH_DAU_TRUONG_V69.md`). Ký hiệu: ✅ chấp nhận · 🔧 chấp nhận có sửa · ❌ không chấp nhận · 👤 để chủ dự án quyết.

## Kiểm chứng lại căn cứ của Codex

| Căn cứ | Kết quả kiểm |
|---|---|
| `server.js:78` chặn học sinh ngoài `/practice/` | Đúng |
| `config.js` từ chối khoá lạ và boolean khác `false` | Đúng |
| `attempts.source` có CHECK `('self_practice','teacher_assigned','retry')` | Đúng (Codex chưa nêu; Claude phát hiện khi kiểm Q6) |
| Redis Home là cache `allkeys-lru`, không lưu bền | Chấp nhận theo trích dẫn `compose.home.yaml` |
| CI không chạy smoke | **Đúng một nửa**: `deploy.yml` (nhánh main) không chạy; `ci.yml` (mọi nhánh khác + PR) **có** job `smoke` chạy `npm run test:smoke` trên Postgres riêng |
| KHTN là một môn, Lý/Hoá/Sinh là phân môn (`branches`) | Đúng — ví dụ "Lý 9" trong bản 1.0 sai mô hình dữ liệu |

## Trả lời từng điểm

| # | Kết luận | Cách xử lý trong bản 1.1 |
|---|---|---|
| C1 | ✅ | Mở đúng tiền tố `/battle/` cho học sinh ở hàng rào `server.js`; quyền từng route; thêm `battle_enabled` (mặc định **tắt** khi triển khai lần đầu), `battle_modes`, `battle_emergency_stop` và sửa cả hai lớp kiểm cấu hình (§13.6) |
| C2 | ✅ | Trong pha trả lời chỉ công bố điểm **chốt tới câu trước** + cờ "đã trả lời"; DTO theo vai trò × pha bằng danh sách trường cho phép; lời giải chỉ mở sau khi đóng nhận bài (§15.2) |
| C3 | ✅ | Hàng đợi lệnh tuần tự theo phòng; ghi DB trong giao dịch, **commit rồi mới ACK và phát**; gửi lại trả đúng kết quả cũ; điểm tổng tính lại được từ `battle_answers`; FK người trả lời → người chơi (§13.4, §14) |
| C4 | ✅ | Bảng máy trạng thái: `status` vòng đời tách `phase` trong ván; `answer_deadline` (hiển thị) và `close_at = deadline + 500 ms` (đóng nhận); lời giải chỉ sau `close_at` và khi hàng lệnh rỗng; tách *mất kết nối* / *rời* / *bị loại*; restart → "ván bị gián đoạn" (§9.1, §13.3) |
| C5 | ✅ | Một hàm điều kiện battle dùng chung cho **đếm và bốc**: SQL "dùng được" + `validateQuestion` + `auto_gradable` + không có tham chiếu ảnh ở **mọi vị trí** nội dung + đúng 4 loại + mức NB/TH/VD; kiểm lại lúc bắt đầu; bỏ tự nới phạm vi (§10.3) |
| C6 | 🔧 | Lớp/khối/năm học suy từ quan hệ lớp còn hiệu lực; quyền đọc SSE / kết quả / lịch sử; giáo viên phải được phân công đúng cặp **lớp–môn**. Chặn: áp dụng ở phòng học sinh tạo và ghép trận; **phòng lớp do giáo viên mở là ngoại lệ công khai** ("Phòng của lớp do thầy cô quản lý"), không có biểu cảm hướng tới cá nhân (§11) |
| C7 | ✅ | Giới hạn: 1 phòng/ván đang hoạt động và 1 chỗ hàng chờ mỗi học sinh; trần số phòng, người, luồng SSE; giới hạn tạo phòng, dò mã, biểu cảm (1 lần/10 giây, chỉ ở phòng chờ và lời giải, tắt ở phòng lớp); body JSON 16 KB cho `/api/battle` đặt **trước** bộ phân tích 20 MB; bộ đệm SSE có trần, ngắt client chậm; hai chế độ "ngừng nhận ván mới" và "dừng khẩn cấp" (§13.5) |
| Q1 | ✅ | **Bỏ điểm thưởng tốc độ.** Điểm = Σ kết quả chấm; tốc độ chỉ phân định khi bằng điểm; đồng hạng khi bằng cả hai; không dùng ID để xếp (§9.2) |
| Q2 | ✅ | Đổi nhãn thành "Kết quả các câu trong ván"; **bỏ huy hiệu Tiến bộ nhất**; lượt sửa sai có nguồn riêng `battle_retry` (§9.4) |
| Q3 | ✅ | Nút Chốt lớn, cảnh báo khi còn 5 giây, trạng thái "Đang gửi… / Máy chủ đã nhận"; nút **Bỏ qua**; lời giải xem lại không giới hạn sau ván; thời gian câu = cơ bản × hệ số loại, giáo viên tăng được (§7.6, §9.1) |
| Q4 | 🔧 | Ghép nhiều người tính **giao phạm vi của cả nhóm**; bỏ phiếu đơn giản: tối đa 3 phạm vi được đề cử + "Cả môn", mỗi người chọn một; chỉ đề cử được phạm vi đủ câu nên không cần tự nới (§8) |
| Q5 | ✅ | Hợp đồng SSE: ảnh chụp đầy đủ khi nối lại, `run_id` của phòng + `version`; nhịp 15 giây; xử lý 401/403/429 (dừng nối lại, báo người dùng); đóng luồng khi mất quyền; loại luồng SSE khỏi `encode` trong Caddy và đo độ trễ thật (§15.4) |
| Q6 | ✅ | `battle_questions.curriculum_snapshot` + `rules_version` của phòng; adapter "luyện lại câu sai" riêng, kiểm sở hữu, gồm câu sai / một phần / bỏ trống, bỏ câu đã bị thu hồi, chống tạo lặp (§9.4, §14) |
| Q7 | ✅ | PostgreSQL là nguồn bền vững duy nhất; không đưa trạng thái phòng vào Redis cache hiện có (§13.4) |
| Q8 | ✅ | Tên ngắn + hậu tố trung tính khi trùng ("Ngọc ²"), không bao giờ mở rộng thành họ tên; quy trình báo cáo: hàng đợi, gộp trùng, mức độ, người phụ trách, thời hạn, tạm khoá đấu có thời hạn, phản hồi cho người báo (§11) |
| Q9 | ✅ | Gộp cập nhật trung gian trong 250 ms, chuyển pha phát ngay; đo byte/s, độ trễ vòng lặp sự kiện, chờ DB pool, client chậm (§17.1) |
| Q10 | 🔧 | An toàn (quyền, công tắc, giới hạn, báo cáo) vào phần nền; test battle thêm vào bộ smoke mà `ci.yml` đã chạy (§17) |
| N1 | ✅ | Mọi hàm engine nhận `now` |
| N2 | ✅ | Sửa thuật ngữ: ảnh câu hỏi đi qua endpoint **kiểm quyền theo lượt**, không phải URL ký |

### Câu hỏi mở (mục 18 bản 1.0)
Chấp nhận khuyến nghị của Codex cho các câu 1, 3, 4, 5, 7, 8 (dạng 🔧 như Q4), 9, 11, 12, 13, 14, 15, 17, 18, 19, 20. Riêng:
- **Câu 2** 🔧: hệ số theo loại (TN ×1; ĐS, GN, TLN ×1,5) + giáo viên / chủ phòng chọn mức thời gian; độ dài đề tính sau khi có số đo.
- **Câu 6** 👤: Codex khuyên mặc định chỉ hiện kết quả cá nhân. Claude đề xuất trung gian: podium top 3 + "Em hạng X", bảng đầy đủ thu gọn ("Xem cả bảng"); màn chiếu mặc định thống kê lớp + top 5, giáo viên tắt được. Cần chủ dự án chọn.
- **Câu 10** ✅: một lời mời nới sau 30 giây; sau 60–90 giây đề nghị tạo phòng hoặc về tự luyện.
- **Câu 16** 🔧: bản đầu loại câu có ảnh; trước khi mở, đo **tỉ lệ câu bị loại vì ảnh theo Bài**; nếu Bài thí điểm thiếu thì làm endpoint ảnh kiểm quyền theo phòng–câu–người xem.

### Điểm không theo / để chủ dự án quyết
- **Phát hành theo bậc (§7 của Codex)** 👤: chủ dự án đã chốt "làm đủ các chế độ một đợt". Bản 1.1 vẫn **làm đủ 4 chế độ**, nhưng mỗi chế độ có cờ bật riêng (`battle_modes`) và cổng nghiệm thu; Claude **khuyến nghị** bật theo thứ tự Cả lớp → Đấu đôi bằng mã → Sảnh + tìm đối thủ → Nhiều người, Đội, bỏ phiếu. Chủ dự án vẫn có thể bật tất cả cùng lúc.
- **Mặc định chỉ kết quả cá nhân** 👤: xem câu 6.
- **Luyện lại câu sai có tính thành thạo không** 👤: Codex lo điểm tăng do vừa xem đáp án. Luồng "Luyện lại" hiện có của tự luyện (`source='retry'`) cũng đang tính bình thường; để nhất quán, bản 1.1 cho `battle_retry` tính như `retry`. Nếu chủ dự án muốn chặt hơn thì loại cả hai khỏi thành thạo (thay đổi chung, ngoài phạm vi V6.9).
