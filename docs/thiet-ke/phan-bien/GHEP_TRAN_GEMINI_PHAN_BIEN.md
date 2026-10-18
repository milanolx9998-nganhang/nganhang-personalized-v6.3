# Phản biện ghép trận — Gemini 4 Argon (18/10/2026)

## 1. Kết luận tổng quan

Đề xuất đã bắt đúng bệnh "chết lâm sàng" của hàng chờ quy mô nhỏ thông qua cơ chế **nới phạm vi tự động**, **ưu tiên hút vào phòng công khai** và **đấu với bản ghi**. Tuy nhiên, bản thiết kế đang mắc lỗi **"kỹ thuật hóa quá mức" (over-engineering)**: bê nguyên mô hình ghép trận của các tựa game thương mại triệu người chơi (như Liên Quân, PUBG) áp vào quy mô chỉ vài chục học sinh. Với mật độ trung bình chỉ 3–5 học sinh/khối đang tìm trận cùng lúc, các tính năng như chấm điểm tổ hợp nhóm, cân bằng trình độ hay ghép đội (Party) không những không phát huy tác dụng mà còn làm phân mảnh hàng chờ, tạo lỗ hổng bắt nạt học đường và kéo dài thời gian chờ đến mức học sinh thoát ứng dụng.

---

## 2. Tám vấn đề quan trọng nhất

### 1. Bắt nạt và thông đồng qua tính năng "Nhóm bạn" (Party) trong phòng Nhiều người (FFA)

* **Mô tả:** Mục 2.7 cho phép nhóm 2–4 bạn cùng vào một phòng đấu Nhiều người (FFA) với các học sinh đi lẻ.
* **Hậu quả:** Tạo môi trường cho bắt nạt học đường và gian lận. Nhóm bạn có thể ngồi cạnh nhau hoặc gọi điện đọc đáp án để dồn điểm thắng một học sinh đi lẻ, hoặc cố tình nhắm vào một bạn để cô lập tâm lý. Ngoài ra, ghép Đội lệch quân số (cỡ $\pm 1$, ví dụ 3 đấu 2) là bất công về mặt toán học nếu tính tổng điểm.
* **Đề xuất sửa:** **Cấm hoàn toàn Party vào hàng chờ FFA công khai.** Nhóm bạn chỉ được phép: (a) Tạo phòng riêng tự đấu với nhau, hoặc (b) Đấu Đội khi số lượng 2 bên bằng nhau tuyệt đối và cơ chế tính điểm phải lấy **trung bình cộng** của đội (không lấy tổng).

### 2. Lịch nới 90 giây gây "chết" trải nghiệm trên điện thoại

* **Mô tả:** Học sinh phải chờ tới 90 giây mới được gợi ý lối thoát (đấu bản ghi), trong khi màn hình chờ trên web di động dễ bị tắt hoặc chuyển tab.
* **Hậu quả:** Trên điện thoại, quá 25 giây không có phản hồi tương tác, học sinh sẽ thoát ra lướt TikTok/Zalo. Khi trình duyệt di động vào chế độ ngủ (background) hoặc khóa màn hình, kết nối mạng bị ngắt; lúc ghép được ở giây thứ 70 thì học sinh đã rời đi, tạo ra "phòng ma" (1 người chơi với 1 người mất kết nối).
* **Đề xuất sửa:** Rút ngắn tổng thời gian chờ tối đa xuống **30–40 giây**. Mỗi 10 giây nới phạm vi một lần. Ở giây thứ 30 chưa có người, chuyển thẳng vào đấu với bản ghi hoặc hiển thị nút "Đấu ngay với Bản ghi" từ giây thứ 15 để học sinh chủ động bấm.

### 3. Mâu thuẫn sư phạm khi nới sang bài học sinh chưa được học

* **Mô tả:** Lịch nới tự động mở rộng từ Bài ra cả Chương, cả Phân môn (Lý/Hóa/Sinh) sau 20–40 giây.
* **Hậu quả:** Học sinh lớp 8 mới học Bài 1 Chương I (Áp suất), chỉ sau 20 giây bị hệ thống đẩy ra toàn Chương hoặc toàn phân môn Vật lí, gặp ngay các câu hỏi của Bài 5 (Lực đẩy Archimedes) mà trên lớp thầy cô chưa dạy. Học sinh trả lời sai liên tục, sinh ra tâm lý ức chế và cảm thấy hệ thống bất công.
* **Đề xuất sửa:** Khi nới rộng ra Chương hoặc Phân môn, thuật toán rút câu hỏi chỉ được lấy trong **tập hợp các Bài mà cả hai học sinh đã từng làm bài tập** (có dữ liệu trong `mastery_states`) hoặc giới hạn theo mốc phân phối chương trình hiện tại của nhà trường.

### 4. Lộ bộ câu hỏi và gian lận học thuật từ "Đấu với bản ghi"

* **Mô tả:** Một bản ghi dùng lại cố định bộ câu hỏi và thời gian trả lời của một ván cũ tối đa 20 lần (Mục 2.6).
* **Hậu quả:** Trong một khối chỉ có vài chục em, nếu số lượng bản ghi ít, một học sinh đấu nhiều ván sẽ gặp lại đúng bản ghi đó (hoặc truyền tai nhau đáp án của bản ghi). Về quyền riêng tư, việc lấy nguyên mẫu hành vi của một học sinh thật (dù ẩn tên) với lựa chọn mặc định bật (opt-out) là chưa chuẩn mực về dữ liệu trẻ em; học sinh trong cùng lớp rất dễ đoán ra bản ghi của ai nếu nhìn vào tốc độ làm bài cực nhanh hoặc cực chậm.
* **Đề xuất sửa:** Chuyển sang mô hình **"Bản ghi tổng hợp" (Synthetic Ghost)**: Hệ thống sinh một bộ câu hỏi mới hoàn toàn theo phạm vi của học sinh hiện tại. Với mỗi câu, hệ thống lấy ngẫu nhiên lịch sử trả lời (đúng/sai + thời gian `ms`) của câu hỏi đó từ dữ liệu chung toàn khối (kèm nhiễu ngẫu nhiên $\pm 15\%$ thời gian). Cách này vừa không cần xin phép dùng bản ghi cá nhân, vừa không bao giờ lặp lại đề, lại an toàn tuyệt đối về danh tính.

### 5. Lỗi "Hố đen phòng chờ" khi tự động đẩy vào phòng công khai

* **Mô tả:** Mục 2.2 ưu tiên đẩy thẳng học sinh đang tìm trận vào một phòng công khai đang chờ mà không hỏi xác nhận.
* **Hậu quả:** Phòng công khai do một học sinh làm chủ phòng (host). Nếu chủ phòng đang treo máy, đi vệ sinh, hoặc cố tình không bấm "Bắt đầu" vì chờ bạn thân vào, học sinh từ hàng chờ bị hút vào đó sẽ bị kẹt cứng. Nếu em thoát phòng ra tìm lại, hệ thống lại hút em đúng vào cái phòng đó một lần nữa (vòng lặp vô tận).
* **Đề xuất sửa:** Chỉ hút vào các phòng công khai có cơ chế **tự động đếm ngược bắt đầu** (Auto-start sau 10 giây khi đủ tối thiểu 2 người), không phụ thuộc nút bấm của chủ phòng. Nếu học sinh thoát khỏi một phòng công khai, gắn cờ loại trừ `exclude_room_id` cho vé tìm trận của em trong 5 phút tiếp theo.

### 6. Phân mảnh hàng chờ vì cho phép chọn độ dài ván (7 · 10 · 15 câu)

* **Mô tả:** Mục 2.1 thêm tùy chọn độ dài ván đấu vào vé tìm trận.
* **Hậu quả:** Khi chỉ có 4 học sinh khối 9 online: 2 em chọn 7 câu, 2 em chọn 15 câu → hàng chờ bị chia đôi, giảm 50% cơ hội gặp nhau theo đúng môn học.
* **Đề xuất sửa:** **Bỏ hoàn toàn tùy chọn độ dài ván ở hàng chờ ghép tự động.** Cố định tất cả các trận ghép tự động là **7 câu** (thời lượng vàng ~3.5 phút trên di động). Ai muốn chơi 10 hay 15 câu thì vào mục "Tạo phòng riêng/công khai" để tự chỉnh.

### 7. Thuật toán tổ hợp nhóm (Mục 2.4) thừa thãi và tiềm ẩn lỗi hiệu năng

* **Mô tả:** Chạy vòng lặp 2 giây/lần để sinh mọi tổ hợp nhóm ứng viên từ 200 vé, chấm điểm rồi chọn tham lam trong 50 ms.
* **Hậu quả:** Bài toán sinh tổ hợp nhóm (nhất là nhóm 4–8 người kèm kiểm tra giao tập hợp câu hỏi $\ge 7$ và ma trận chặn chéo) có độ phức tạp tăng theo hàm mũ. Dù thực tế chỉ có vài vé đang chờ (khiến thuật toán này trở nên vô nghĩa vì chỉ có 1–2 cặp khả dĩ), việc viết code phần này rất dễ phát sinh lỗi ngầm (race condition với database khi kiểm tra số lượng câu hỏi).
* **Đề xuất sửa:** Thay bằng thuật toán **Ghép cặp tuần tự có trọng số (Weighted First-Fit)**: Duyệt từ vé chờ lâu nhất, quét các vé còn lại tìm vé/nhóm có điểm tương thích cao nhất vượt ngưỡng tối thiểu để ghép ngay. Đơn giản hơn 5 lần về mặt lập trình nhưng cho kết quả y hệt ở quy mô dưới 50 người.

### 8. Hiển thị thống kê số người chờ gây hiệu ứng tâm lý ngược

* **Mô tả:** Mục 2.8 hiển thị "Đang tìm · X bạn khối 9 đang tìm trận · thường mất khoảng Y giây".
* **Hậu quả:** Vào buổi tối vắng, màn hình hiện *"0 bạn khối 9 đang tìm trận · thường mất khoảng 85 giây"*. Học sinh nhìn thấy con số này sẽ lập tức bấm Hủy và tắt web, dẫn đến người vào sau cách đó 5 giây cũng thấy 0 người.
* **Đề xuất sửa:** Không bao giờ hiển thị số lượng người trong hàng chờ nếu con số đó nhỏ hơn 5. Thay vào đó, hiển thị số người **đang hoạt động trên toàn trường** (ví dụ: *"Đang có 34 bạn toàn trường ôn tập tối nay"*) và đưa các câu đố nhanh (Mini-flashcard 1 chạm) lên màn hình chờ để học sinh giải trí trong lúc đợi.

---

## 3. Trả lời 6 câu hỏi mở ở mục 4

1. **Lịch nới 20/40/60/90 giây có hợp không?**
**Không.** Quá dài. Với vài chục học sinh toàn trường (chia cho 7 khối thì mỗi khối chỉ có 3–7 em), xác suất có thêm người mới bấm tìm trận trong khoảng từ giây 40 đến giây 90 là rất thấp. Hãy rút xuống mốc **10 / 20 / 30 giây**, và ở giây 30 kích hoạt ngay chế độ Đấu bản ghi.
2. **Dùng điểm thành thạo cân trình độ có rủi ro gì? Có nên bỏ hẳn?**
**Nên bỏ hẳn ở giai đoạn ghép người thật.** Với 3–4 học sinh cùng khối đang chờ, bạn không có quyền kén chọn trình độ; ghép được người cùng bài học đã là may mắn. Điểm thành thạo (`mastery_states`) chỉ nên dùng vào một việc duy nhất: **chọn độ khó của "Bản ghi" (Ghost)** sao cho ngang sức với học sinh khi không tìm được người thật.
3. **"Đấu với bản ghi" có vấn đề quyền riêng tư / sư phạm không? Mặc định bật hay tắt?**
Nếu lưu nguyên ván của một em: có rủi ro lộ hành vi và lặp đề. Nếu phải xin phép (dù opt-in hay opt-out) đều rắc rối về mặt thủ tục trong trường học. Giải pháp sạch nhất: Dùng **Bản ghi tổng hợp theo thống kê câu hỏi** (như đã nêu ở Vấn đề 4). Vì là dữ liệu thống kê ẩn danh theo từng câu hỏi (như tỷ lệ % người trả lời đúng trong Ai Là Triệu Phú), bạn **không cần cài đặt bật/tắt quyền riêng tư** và rất có giá trị sư phạm (học sinh đấu với mức trung bình thực tế của các bạn cùng khối).
4. **Nhóm bạn có làm tăng bắt nạt / loại trừ không?**
**Có, mức độ rủi ro rất cao.** Học sinh THCS rất nhạy cảm với việc bị "hội đồng" trong phòng thi đấu hoặc bị từ chối cho vào nhóm. Không nên đưa tính năng Nhóm bạn (Party) vào hệ thống ghép trận tự động công khai. Nếu muốn chơi cùng bạn thân, các em đã có tính năng tạo Phòng riêng bằng mã số.
5. **Tự vào phòng công khai đang chờ có nên hỏi xác nhận không?**
**Không cần hỏi xác nhận** nếu phòng đó thỏa mãn đúng phạm vi môn/bài mà học sinh đã chọn và phòng đó sẽ **bắt đầu ngay lập tức** (hoặc đếm ngược 5 giây) khi em được ghép vào. Ngược lại, nếu vào phòng mà vẫn phải ngồi chờ chủ phòng bấm nút thì bắt buộc phải hỏi, hoặc tốt nhất là đổi cơ chế phòng công khai sang tự động bắt đầu.
6. **Độ phức tạp có quá mức cho bản đầu? Nếu cắt, giữ phần nào trước?**
**Đang quá phức tạp (dư thừa khoảng 50% khối lượng code).** Cần cắt bỏ toàn bộ bảng dữ liệu Party, thuật toán chấm điểm tổ hợp nhóm phức tạp, tùy chọn độ dài ván và cân bằng trình độ khi ghép người thật. Chi tiết giữ/bỏ xem tại Mục 5 dưới đây.

---

## 4. Năm ý tưởng làm ghép trận linh hoạt hơn (phù hợp trường học)

1. **Ghép trận liên khối theo chủ đề kiến thức giao thoa (Cross-grade Bridging):**
Ở các môn như Tiếng Anh, Tin học, hoặc các chuyên đề ôn thi vào 10 (lớp 8 cuối năm và lớp 9), kiến thức có độ giao thoa lớn. Khi chờ quá 20 giây, cho phép ghép học sinh lớp dưới (đang có điểm thành thạo cao $\ge 80\%$) với học sinh lớp liền kề trên một bộ câu hỏi thuộc phần kiến thức giao nhau.
2. **Vào trận đang diễn ra hoặc ghép nối tiếp (Drop-in / Rematch Queue):**
Khi học sinh A bấm tìm trận, nếu thấy phòng của B và C đang đấu ở câu 6/7 (còn < 20 giây là xong), hệ thống báo cho A: *"Tìm thấy đối thủ đang kết thúc ván, chờ 12 giây..."* và tự động gom A, B, C vào ván mới ngay khi ván kia vừa dứt. Tận dụng cực tốt tập người chơi đang online.
3. **Thách đấu bất đồng bộ qua thông báo (Async Challenge / "Gửi lời thách đấu"):**
Sau khi học sinh A đấu xong với Bản ghi, cho phép A bấm nút *"Gửi kết quả này thách đấu bạn cùng lớp"*. Khi bạn B lên mạng vào lúc 9h tối (lúc A đã đi ngủ), B nhận được thông báo và vào đấu lại đúng bộ đề + bản ghi của A để xem ai thắng. Biến trải nghiệm offline thành kết nối xã hội thực sự.
4. **Đấu trường "Giờ Vàng" theo khối/môn (Scheduled Happy Hours):**
Thay vì để vài chục học sinh rải rác từ 19h đến 22h, hệ thống treo banner cố định: *"20h00 - 20h15 tối nay: Đấu trường KHTN Khối 8 (nhân đôi điểm tích lũy)"*. Gom toàn bộ học sinh online vào một khung giờ 15 phút giúp hàng chờ luôn đông đúc, ghép trận tức thì trong 2 giây.
5. **Khởi động cùng Bản ghi trong lúc chờ người thật (Warm-up Ghost):**
Ngay giây thứ 10 chưa có người, cho học sinh vào đấu nháp ngay với Bản ghi. Nếu trong lúc đang làm câu 1–2 mà có học sinh thật cùng phạm vi bấm tìm trận, màn hình hiện thông báo *"Đã tìm thấy đối thủ thật! Chuyển sang trận đấu chính thức sau 3 giây..."* và bắt đầu ván mới. Học sinh không bao giờ phải nhìn màn hình chờ trống rỗng.

---

## 5. Đề xuất phạm vi triển khai bản đầu (MVP)

| Phân loại | Hạng mục cụ thể | Lý do |
| --- | --- | --- |
| **GIỮ LẠI (Làm ngay ở bản đầu)** | 1. **Khai báo đa môn + Tự động nới phạm vi** (nhưng rút ngắn lịch xuống **10s / 20s / 30s** và chỉ nới trong các bài đã học).<br>

<br>2. **Quét phòng công khai trước khi vào hàng chờ** (kèm cơ chế tự động đếm ngược bắt đầu phòng).<br>

<br>3. **Đấu với Bản ghi (Ghost)** ở giây thứ 30 (dùng dữ liệu trả lời thống kê theo từng câu hỏi, tự cân chỉnh theo trình độ người chơi).<br>

<br>4. **Cố định 7 câu / 30 giây** cho mọi vé ghép nhanh. | Giải quyết triệt để 95% bài toán "không tìm thấy người chơi" và "phải bấm xác nhận trên điện thoại" với chi phí lập trình thấp nhất, không cần thêm bảng dữ liệu phức tạp. |
| **ĐỂ SAU (Hoặc cắt bỏ hoàn toàn)** | 1. **Nhóm bạn (Party) & bảng `battle_parties**`.<br>

<br>2. **Thuật toán chấm điểm tổ hợp nhóm & Cân trình độ khi ghép người thật** (giữ nguyên First-fit có ưu tiên cùng Bài trước, cùng Chương sau).<br>

<br>3. **Tùy chọn độ dài ván (10, 15 câu)** trong vé ghép.<br>

<br>4. **Hiển thị số người đang chờ chi tiết theo khối**. | Rủi ro bắt nạt học đường cao (Party), gây phân mảnh hàng chờ (độ dài ván), và tốn công lập trình cho những thuật toán không phát huy tác dụng ở quy mô vài chục học sinh online. |