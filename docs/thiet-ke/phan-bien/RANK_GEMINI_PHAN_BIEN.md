# Phản biện rank + ghép hai chiều — Gemini 4 Argon (18/10/2026)

## 1. Kết luận tổng quan

Cơ chế **ghép hai chiều (rộng gặp hẹp ngay, lấy giao điểm cụ thể nhất)** là một bước tiến xuất sắc, giải quyết gọn gàng bài toán lệch phạm vi kiến thức. Tuy nhiên, việc **tách thành 2 hàng chờ (Thường và Xếp hạng)** kết hợp cấm đối thủ máy ở chế độ Xếp hạng sẽ làm hệ thống "đóng băng" hoàn toàn vào các tối thường: với 3–7 em/khối online, hàng chờ bị cưa đôi sẽ khiến học sinh không thể tìm nổi 5 ván định vị. Bên cạnh đó, mô hình trừ điểm (LP) và bậc "Đồng/Bạc" của LMHT/ĐTCL dễ gây tâm lý sợ thua, kỳ thị học lực trong trường học và bị khai thác cày điểm qua thao túng phạm vi bài học.

---

## 2. Sáu vấn đề quan trọng nhất

### 1. "Chết" hàng chờ Xếp hạng vì chia đôi nguồn người và cấm đối thủ máy

* **Mô tả:** Tách 2 chế độ Thường / Xếp hạng (Mục 10.2) và quy định Xếp hạng không dùng đối thủ máy (Ghost).
* **Hậu quả:** Khi khối 8 có 4 em online: 2 em vào đấu Thường, 2 em vào Xếp hạng (1 em chọn Toán, 1 em chọn KHTN) → **Cả 4 em đều không tìm được trận**. Ở chế độ Xếp hạng vì cấm đấu máy nên học sinh sẽ chờ vô vọng rồi thoát ứng dụng.
* **Đề xuất sửa:** **Gộp làm 1 hàng chờ duy nhất** (mặc định tính Rank), học sinh nào không muốn áp lực chỉ cần gạt nút *"Đấu thử nghiệm (không tính điểm hạng)"* ngay trên vé — nhưng **vẫn ghép chung phòng** với người đấu Xếp hạng. Cho phép **Đối thủ máy (Synthetic Ghost) vào trận Xếp hạng** sau 25 giây chờ (hoặc lấp chỗ trống cho đủ phòng 4 người), nhưng giới hạn tối đa +12 LP khi thắng máy và chỉ cho phép tối đa 3 ván đấu máy/ngày được cộng LP.

### 2. Lỗ hổng "Học tủ cày Rank" từ cơ chế Rộng gặp Hẹp

* **Mô tả:** Mục 10.1 quy định vé "Rộng" gặp vé "Hẹp" sẽ lấy phạm vi hẹp làm đề thi chung.
* **Hậu quả:** Một học sinh muốn cày lên Cao Thủ chỉ cần học thuộc lòng đáp án của duy nhất **1 Bài học dễ** (ví dụ: Bài 1 KHTN), sau đó khóa cứng vé ở đúng Bài 1 đó ("Chỉ đúng phần này"). Mọi học sinh khác chọn "Cả môn/Mở rộng" sẽ liên tục bị hút vào "sân nhà" Bài 1 của em này và thua trắng. Ngược lại, với 3–7 người online, 2 bạn thân không cần tạo phòng riêng: chỉ cần hẹn nhau qua Zalo cùng chọn 1 Bài học thật lẻ vào lúc 21h30 là chắc chắn 100% ghép trúng nhau để nhường điểm (win-trading).
* **Đề xuất sửa:** Ở chế độ tính Rank, **không cho phép chọn phạm vi hẹp cố định (1 Bài)**, hoặc nếu ghép Rộng gặp Hẹp thì bộ câu hỏi phải **pha trộn 50% từ phạm vi Hẹp và 50% từ phạm vi Rộng** (trong giới hạn bài cả hai đã học). Áp dụng hệ số nhân LP theo độ rộng phạm vi: chọn 1 Bài chỉ nhận $0.6\times$ LP, chọn cả Chương nhận $1.0\times$ LP, chọn Đa môn nhận $1.2\times$ LP.

### 3. Giới hạn 5 ván/24h cùng đối thủ sẽ chặn đứng trải nghiệm buổi tối

* **Mô tả:** Mục 10.3 quy định cùng cặp đối thủ gặp nhau từ ván thứ 3 giảm 50% LP, từ ván thứ 5 không tính LP trong 24 giờ.
* **Hậu quả:** Buổi tối cả khối 9 chỉ có 3–4 em chăm chỉ vào ôn bài cùng lúc. Chỉ sau 15 phút (khoảng 4 ván đấu), các em này sẽ chạm trần 5 ván gặp nhau và bị khóa không nhận được LP nữa trong suốt phần còn lại của buổi tối, dù các em hoàn toàn không gian lận.
* **Đề xuất sửa:** Chỉ áp dụng giảm/cắt LP khi **A thắng B liên tiếp 3 lần trong cùng một phạm vi hẹp**, hoặc khi một trận đấu có dấu hiệu bất thường (ví dụ: một bên trả lời sai toàn bộ dưới 2 giây/câu hoặc thoát giữa chừng). Nếu hai học sinh đấu giằng co, thời gian suy nghĩ bình thường và phạm vi câu hỏi thay đổi qua các ván thì cho phép tính điểm tối đa 10 ván/ngày.

### 4. Phạt "Hạng chót" khi mất kết nối mạng di động gây ức chế tâm lý

* **Mô tả:** Mục 10.3 quy định "Bỏ ván giữa chừng: tính như hạng chót (trừ nặng LP)".
* **Hậu quả:** Học sinh THCS dùng điện thoại giá rẻ, mạng 4G chập chờn hoặc đang chơi có cuộc gọi của bố mẹ gọi tới làm văng trình duyệt. Bị xử thua hạng chót và trừ 18–20 LP vì lỗi khách quan sẽ khiến các em tức giận và bỏ cuộc. Hơn nữa, việc bị tụt hạng (rớt từ Vàng xuống Bạc) và mang nhãn "Đồng/Sắt" dễ dẫn đến việc bị bạn bè trên lớp trêu chọc.
* **Đề xuất sửa:**
* Khi mất kết nối, **giữ nguyên số điểm câu trả lời học sinh đã tích lũy được** tính đến lúc văng mạng để xếp hạng cuối ván (không đẩy xuống bét bảng). Tặng mỗi học sinh **"1 Khiên Bảo Vệ Mạng / ngày"** (không trừ LP lần đầu mất kết nối trong ngày).
* Đổi tên bậc từ kim loại (mang tính phân biệt đẳng cấp game) sang **ngôn ngữ học thuật/khám phá**: *Tập sự → Khám phá → Tinh anh → Thông thái → Bậc thầy → Thách đấu*, và **khóa không cho rớt Bậc lớn** trong suốt cả mùa (lên Tinh anh thì dù thua chuỗi cũng chỉ về Tinh anh IV 0 LP, không bao giờ tụt xuống Khám phá).



### 5. Bất công khi gộp chung MMR của mọi môn học vào một rổ

* **Mô tả:** Mỗi học sinh chỉ có 1 chỉ số MMR duy nhất theo khối/mùa cho mọi môn.
* **Hậu quả:** Một học sinh rất giỏi KHTN (MMR lên tới 1400 - Bậc Kim Cương) khi muốn đổi gió sang ôn tập môn Ngữ Văn hoặc Lịch Sử (môn em học yếu) sẽ bị hệ thống lấy MMR 1400 để ghép với một "cao thủ" môn Văn thật sự. Kết quả là em thua thảm hại và mất LP oan uổng, dẫn đến việc học sinh **chỉ dám đấu đúng 1 môn sở trường**, phá vỡ mục tiêu ôn tập toàn diện của nhà trường.
* **Đề xuất sửa:** Vẫn hiển thị **1 Bậc (Tier) tổng hợp duy nhất** cho học sinh để tạo động lực, nhưng bên dưới cơ sở dữ liệu phải tách `mmr` ẩn theo từng môn (hoặc 2 cụm: Tự nhiên vs Xã hội), hoặc khi ghép trận phải lấy trung bình cộng giữa MMR tổng và `mastery_states` của môn đang chọn.

### 6. Bảng LP phòng Nhiều người (FFA) 8 người không khớp thực tế 3–4 người

* **Mô tả:** Thiết kế bảng LP lấy chuẩn 8 người (+40 xuống -20) rồi nội suy cho các phòng ít người hơn, đồng thời tính chênh lệch MMR phức tạp.
* **Hậu quả:** Thực tế trường học 95% số trận FFA sẽ chỉ gom được **3 hoặc 4 người**. Việc nội suy công thức từ 8 người kết hợp hệ số Elo đa người chơi rất phức tạp khi lập trình và dễ sinh số lẻ khó hiểu cho học sinh.
* **Đề xuất sửa:** Chuẩn hóa quy mô phòng FFA Xếp hạng tối đa là **4 người** (như 4 người một bàn). Định nghĩa cứng bảng điểm cho phòng 2, 3 và 4 người mà không cần hàm nội suy.

---

## 3. Đánh giá bảng LP, cửa sổ MMR và đề xuất con số thực tế

Với **3–7 học sinh/khối online buổi tối**, cửa sổ MMR `±100 → ±200 sau 10s → bỏ giới hạn sau 20s` là **vô tác dụng trong 10 giây đầu** (vì xác suất 3 em đang online có MMR chênh nhau dưới 100 điểm là cực thấp, chỉ làm học sinh tốn thêm 10–20 giây chờ đợi vô ích). Ngoài ra, mỗi bậc có 4 cấp × 100 LP = 2.000 LP để lên Cao thủ: với mức cộng trung bình +20 LP/ván, một học sinh phải thắng ròng **100 ván** trong một học kỳ — quá dài cho một ứng dụng ôn tập.

**Đề xuất thông số tối ưu cho quy mô 3–7 người online:**

| Tham số | Đề xuất hiện tại | Đề xuất điều chỉnh | Lý do điều chỉnh |
| --- | --- | --- | --- |
| **Cấu trúc Bậc & Cấp** | 6 bậc × 4 cấp (IV–I) × 100 LP | **6 bậc × 3 cấp (III–I) × 100 LP** | Giảm 25% độ dài đường đua để học sinh học tập đều đặn (3–4 ván/tối) có thể chạm đích cuối học kỳ. |
| **Số ván định vị** | 5 ván (ẩn bậc) | **3 ván** (hiển thị bậc khởi đầu ngay sau ván 1, cộng thưởng lớn ở ván 2–3) | Tránh tâm lý nản chí khi chơi 3–4 ván vẫn thấy "Chưa xếp hạng". |
| **Cửa sổ MMR khi ghép** | ±100 (0–10s) → ±200 (10–20s) → Mở hoàn toàn (>20s) | **0–8s: ±250 MMR**<br>

<br>**> 8s: Mở hoàn toàn (ưu tiên cùng Bài/Chương)** | Với < 7 người online, ghép đúng môn/bài học quan trọng gấp 10 lần ghép đúng MMR. |
| **Bù đắp chênh MMR** | Chưa rõ biên độ | Nếu MMR thấp hơn đối thủ $\ge 150$: **Thắng +35 LP, Thua chỉ −5 LP** | Khi mở toang cửa sổ MMR sau 8 giây, em yếu gặp em mạnh sẽ hào hứng vì "thua chẳng mất gì, thắng được thưởng lớn". |
| **LP Đấu Đôi (1v1)** | Thắng +18..+25 / Thua −12..−18 | **Thắng: +25 .. +35 LP**<br>

<br>**Hòa: +10 LP cho cả hai**<br>

<br>**Thua: −8 .. −12 LP** | Tỷ lệ Cộng/Trừ phải đạt khoảng **3 : 1** để đảm bảo học sinh có tỷ lệ thắng 40% vẫn tăng hạng dần theo độ chăm chỉ làm bài. Hòa phải được thưởng vì cả hai đã làm tốt. |
| **LP Nhiều người (FFA)** | Chuẩn 8 người (+40..−20), nội suy | Cố định theo cỡ phòng thực tế:<br>

<br>• **3 người:** Hạng 1 (+30), Hạng 2 (+10), Hạng 3 (−8)<br>

<br>• **4 người:** Hạng 1 (+35), Hạng 2 (+18), Hạng 3 (−5), Hạng 4 (−10) | Rõ ràng, dễ hiểu, 2/3 số người tham gia đều có điểm mang về. |

---

## 4. Nên mặc định HIỆN hay ẨN bậc xếp hạng với người khác?

**Khuyến nghị dứt khoát: Mặc định ẨN trong giai đoạn đầu, hoặc tự động HIỆN khi từ bậc Vàng (Tinh anh) trở lên và mặc định ẨN ở 2 bậc đầu (Đồng, Bạc).**

* **Góc độ tâm lý & an toàn học đường:** Học sinh THCS–THPT rất sợ bị dán nhãn "kém cỏi" trước mặt bạn cùng khối. Nếu mặc định Hiện cho tất cả, những em học lực trung bình - yếu (kẹt ở Đồng IV, Bạc) sẽ cảm thấy xấu hổ khi vào sảnh chờ và **chọn cách không bao giờ bấm vào tab Đấu nữa** (trong khi hầu hết các em sẽ không biết vào sâu trong phần Cài đặt để tự bấm nút Ẩn).
* **Giải pháp thiết kế thông minh ("Huy hiệu Tự hào"):**
1. Ở 2 bậc đầu tiên: Mặc định **ẩn huy hiệu** với người khác (chỉ hiện khung viền cơ bản trung tính, riêng bản thân học sinh vẫn thấy tiến trình LP của mình).
2. Ngay khi học sinh thăng hạng lên **bậc thứ 3 (Vàng / Tinh anh)**, hệ thống bật màn hình chúc mừng kèm nút bấm lớn: *"Chúc mừng em đạt bậc Tinh Anh! Bấm để khoe huy hiệu này ở sảnh chờ"*. Cách này vừa bảo vệ tuyệt đối nhóm học sinh yếu thế, vừa thỏa mãn tâm lý thích khẳng định bản thân của nhóm học sinh khá giỏi.