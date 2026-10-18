## 1. Kết luận chung

**Không nên triển khai nguyên trạng bản kế hoạch này.** Có các điểm chặn rõ ràng: đường dẫn API bị middleware hiện tại từ chối đối với học sinh, công tắc cấu hình chưa tương thích, hợp đồng chống lộ kết quả chấm chưa kín và cách phối hợp bộ nhớ–database chưa đủ để bảo đảm không mất câu đã chốt. Một tiến trình Node sau Caddy vẫn là phương án có thể dùng cho bản đầu, nhưng tài liệu chưa chứng minh được tải đồng loạt, phục hồi sau lỗi và giới hạn tài nguyên. Tôi đề nghị sửa các hợp đồng kỹ thuật và quy tắc an toàn trước, sau đó triển khai theo từng cổng nghiệm thu.

*Phạm vi phản biện: đã đọc toàn bộ 506 dòng kế hoạch và đối chiếu mã nguồn tại thư mục hiện tại; chỉ khảo sát tĩnh, không sửa/tạo/xóa tệp, không chạy ứng dụng, migration hay kiểm thử, không truy cập mạng. “Schema hiện có” dưới đây là schema trong mã nguồn, chưa phải database đang chạy tại trường.*

## 2. Vấn đề CHẶN — phải sửa trước khi code

### C1. API và công tắc tính năng chưa tương thích với app hiện tại

- **Mô tả:** Kế hoạch coi việc gắn route sau xác thực và giới hạn tần suất là đủ. Thực tế có thêm hàng rào chặn học sinh và bộ kiểm tra cấu hình không chấp nhận tính năng mới.
- **Căn cứ:** §13.2, §14, §15.1. [server.js:76](</C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/server.js:76>)–78 từ chối học sinh nếu đường dẫn không bắt đầu bằng `/practice/`. `practice/config.js:10–11` từ chối khóa ngoài `defaults` và mọi thay đổi boolean khác `false`; `routes/practice.js:59` còn kiểm tra cấu hình lần nữa.
- **Hậu quả:** Học sinh nhận 403 khi gọi `/api/battle`; quản trị viên không bật/tắt được `battle_enabled` qua API cấu hình hiện tại.
- **Đề xuất sửa:** Ghi rõ thay đổi tích hợp:
  1. Cho phép chính xác `/battle/` tại hàng rào học sinh, tiếp tục giữ xác thực, CSRF và giới hạn tần suất.
  2. Thiết kế quyền cho từng route battle; không chỉ dựa vào việc đã đăng nhập.
  3. Bổ sung cấu hình và sửa cả hai lớp kiểm tra boolean.
  4. Mặc định **tắt** khi triển khai lần đầu; chỉ bật sau nghiệm thu.

### C2. Giấu trường `answer` chưa đủ để chống lộ đáp án

- **Mô tả:** Snapshot vẫn chứa dữ liệu có thể suy ra kết quả chấm trước khi cả phòng kết thúc câu.
- **Căn cứ:** §15.2–15.3. [engine.js:154](</C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/engine.js:154>)–158 luôn đưa `points`, `correct` vào dữ liệu người chơi. Dòng 192 trải toàn bộ `item.student`; dòng 205 trả nguyên `room.result`.
- **Hậu quả:** **Nếu** điểm được cộng ngay khi nhận câu trả lời, người chưa chốt thấy điểm/số câu đúng của bạn tăng và biết bạn vừa trả lời đúng. Với hai người thông đồng, đây là kênh báo đáp án dù không có chat. Ngoài ra, tính an toàn của `roomView` đang phụ thuộc hoàn toàn vào nơi tạo `item.student` và `room.result`.
- **Đề xuất sửa:** Trong pha trả lời, chỉ công bố điểm đã chốt đến **câu trước** và cờ “đã trả lời”; không công bố điểm, đúng/sai, phân bố của câu hiện tại. Tạo DTO riêng theo vai trò và pha, dùng danh sách trường cho phép. Chỉ phát lời giải sau khi máy chủ đã đóng quyền nhận đáp án của câu đó. Kiểm thử cả HTTP, SSE, kết quả, lịch sử và dữ liệu lồng nhau.

**Phân biệt:** Việc gửi `points/correct` là hiện hữu trong nháp; việc chúng đã bao gồm câu hiện tại chưa thể xác nhận vì `rooms.js` chưa có.

### C3. Chưa xác định giao dịch nguyên tử giữa nhận đáp án, cộng điểm và chuyển câu

- **Mô tả:** “Ghi PostgreSQL ở mỗi mốc” không tự bảo đảm tính nhất quán. Một tiến trình Node vẫn có thể xử lý các thao tác xen kẽ qua `await`.
- **Căn cứ:** §13.2, §13.4, §16. `migration-v69-battle.sql:51–61` chỉ có khóa duy nhất câu trả lời và FK đến câu hỏi; chưa có FK `(room_id,user_id)` đến người tham gia.
- **Hậu quả:** Có thể báo đã nhận nhưng chưa ghi bền vững; cộng điểm hai lần khi gửi lại; timer chuyển pha trong khi một đáp án đang ghi; hai người cùng chiếm chỗ cuối; cùng học sinh vừa được ghép vừa vào phòng bằng mã.
- **Đề xuất sửa:**
  - Tuần tự hóa lệnh theo phòng; thao tác liên quan nhiều phòng/hàng chờ phải kiểm soát thêm theo học sinh.
  - Ghi đáp án và trạng thái cần thiết trong giao dịch; **commit trước khi ACK thành công và phát trạng thái mới**.
  - Gửi lại cùng lệnh phải trả kết quả đã nhận, không chỉ báo lỗi trùng.
  - Điểm tổng phải tính lại được từ đáp án đã commit, không phụ thuộc cộng dồn trong RAM.
  - Bổ sung FK người tham gia và các ràng buộc giá trị; kiểm thử lỗi tại từng khoảng giữa ghi DB, ACK và phát SSE.

### C4. Luật thời gian và máy trạng thái còn các khoảng trống ảnh hưởng kết quả

- **Mô tả:** Chưa có một mô hình thống nhất cho `lobby`, đếm ngược, trả lời, lời giải, tạm dừng và kết thúc.
- **Căn cứ:** §9.1 cho nhận tới `deadline + 500 ms`; §7.8 có tạm dừng; §16 có nối lại 60 giây. Nháp SQL chỉ lưu `lobby/playing/finished/closed` tại dòng 17, trong khi engine dùng `question/reveal` tại dòng 190.
- **Hậu quả:** Nếu timer phát lời giải đúng `deadline` nhưng vẫn nhận bài trong 500 ms tiếp theo thì có cửa nộp sau khi biết đáp án. Nếu timer đóng ngay tại deadline thì quy định ân hạn không có tác dụng. Tạm dừng có thể làm thay đổi thưởng tốc độ; mất SSE có thể bị nhầm thành rời ván.
- **Đề xuất sửa:** Viết bảng chuyển trạng thái, gồm lệnh được phép, người được phép, điều kiện, hiệu ứng và dữ liệu ghi bền vững. Tách:
  - `status` vòng đời và `phase` trong ván.
  - Mất kết nối, chủ động rời, bị loại và hết phiên.
  - Hạn hiển thị và hạn nhận bài cuối cùng.

  Chốt mốc thời gian đo tại máy chủ; không dùng thời điểm commit DB để tính tốc độ. Lời giải chỉ mở sau hạn nhận cuối cùng và sau khi xử lý xong các lệnh đã được nhận hợp lệ. Với restart, có thể giữ lựa chọn **kết thúc ván**, nhưng phải đánh dấu “bị gián đoạn”, không coi như ván hoàn chỉnh.

### C5. Điều kiện “đủ câu dùng được” chưa đủ chính xác để làm hợp đồng cho battle

- **Mô tả:** Tài liệu rút gọn quá mức điều kiện chọn câu và mặc nhiên coi số đếm tương đương kết quả bốc.
- **Căn cứ:** §2.1, §10, §13.2. [attempts.js:18](</C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/practice/attempts.js:18>)–36 kiểm phiên bản hoạt động, liên kết YCCĐ/Outcome còn hiệu lực và `validateQuestion`. `lessonMap.js:93–99` dùng điều kiện SQL nhưng không chạy bước kiểm tra nội dung đó. `grading.js:30` có thể trả `score:null` khi câu không tự chấm.
- **Hậu quả:** Giao diện báo đủ câu nhưng bắt đầu thất bại; câu thuộc bốn loại vẫn có thể không tự chấm; ảnh trong phương án hoặc Markdown bị bỏ sót nếu chỉ kiểm `image_url` ở cấp ngoài. Chọn nhầm metadata nháp có thể đưa câu ra sai Bài/YCCĐ.
- **Đề xuất sửa:** Định nghĩa một điều kiện battle dùng chung cho **đếm và bốc**, gồm:
  - Phiên bản hoạt động đã duyệt và metadata đã công bố.
  - Đúng môn, khối, phạm vi; Bài–YCCĐ–Outcome còn hiệu lực.
  - Kho được phép; nội dung hợp lệ; thực sự tự chấm được.
  - Quy tắc ảnh ở mọi vị trí; loại và mức nhận thức được phép.
  
  Kiểm tra lại khi bắt đầu; cache số đếm chỉ là thông tin tham khảo. Không tự nới sang phần học sinh chưa đồng ý.

### C6. Quyền theo lớp/khối và quy tắc chặn chưa đủ nhất quán

- **Mô tả:** “Cùng trường, cùng khối” chưa có hợp đồng xác định tư cách tham gia; quy tắc chặn tuyệt đối xung đột với phòng cả lớp.
- **Căn cứ:** §11 quy định hai người đã chặn nhau “không bao giờ cùng phòng”; §6 và §7.8 yêu cầu cả lớp tham gia. `authorization.js:6` cho học sinh qua kiểm tra môn ngay lập tức; không xác nhận khối. `lessonMap.js:140–143` xác định khối qua quan hệ lớp còn hiệu lực. §15.3 chưa mô tả quyền đọc lịch sử, kết quả và màn chiếu đầy đủ.
- **Hậu quả:** Dùng lại helper sai mục đích có thể cho phép khai khối tùy ý. Một học sinh chặn bạn cùng lớp sẽ khiến hệ thống không biết phải từ chối ai. Chỉ bảo vệ route ghi chưa ngăn người ngoài phòng đọc SSE/kết quả.
- **Đề xuất sửa:** Máy chủ tự suy ra lớp, khối, năm học từ dữ liệu còn hiệu lực; từ chối trường hợp thiếu hoặc mâu thuẫn. Kiểm quyền đọc và ghi trên mọi tài nguyên phòng. Quyền giáo viên phải xét **đúng cặp lớp–môn**, theo hệ thống phân quyền hiện tại.

  Chốt chính sách riêng cho phòng giáo viên: hoặc giữ chặn tuyệt đối và cung cấp lượt luyện thay thế, hoặc công bố rõ ngoại lệ phòng có giám sát, kèm hạn chế tương tác. Không vừa hứa “không bao giờ cùng phòng” vừa âm thầm bỏ qua.

### C7. Chưa có giới hạn đủ để bảo vệ tiến trình Node dùng chung

- **Mô tả:** Giới hạn request hiện tại không giới hạn số phòng, timer, hàng chờ, kết nối dài hạn hay dữ liệu đang chờ gửi.
- **Căn cứ:** §13.2, §17.1, §19. `server.js:58–59` parse body tối đa 20 MB trước lớp xác thực/giới hạn tại dòng 76. Tài liệu cho mỗi học sinh gửi biểu cảm mỗi 3 giây; giới hạn IP mặc định là 3.000/phút tại `rateLimiter.js:42`.
- **Hậu quả:** 300 học sinh gửi biểu cảm theo đúng giới hạn cho phép tạo **6.000 POST/phút**, chưa tính trả lời và thao tác khác; cả trường chung IP có thể bị 429. Kết nối nhận chậm có thể làm tăng bộ nhớ. Công tắc “cho phòng đang chạy chơi nốt” không xử lý được sự cố quá tải hoặc lộ dữ liệu đang diễn ra.
- **Đề xuất sửa:** Chốt ngay giới hạn:
  - Một phòng/ván đang hoạt động và một vị trí hàng chờ mỗi học sinh.
  - Số phòng, số người, tổng SSE toàn hệ thống; giới hạn riêng tạo phòng, dò mã và biểu cảm.
  - Kích thước body nhỏ cho battle, được áp dụng trước khi parse body lớn.
  - Giới hạn bộ đệm SSE; ngắt client quá chậm; dọn timer/listener.
  - Hai chế độ vận hành: **ngừng nhận ván mới** và **dừng khẩn cấp**.

  Ưu tiên tài nguyên cho lưu đáp án; giảm/tắt biểu cảm trước khi ảnh hưởng phần luyện tập chung.

## 3. Vấn đề QUAN TRỌNG — nên sửa

### Q1. Công thức không thực hiện đúng nguyên tắc “đúng trước, nhanh sau”

- **Mô tả:** Xếp theo tổng điểm có thể cho người đúng ít hơn thắng người đúng nhiều hơn.
- **Căn cứ:** §9.2. Chín câu đúng, mỗi câu 120 điểm, đạt 1.080; mười câu đúng sát hết giờ đạt khoảng 1.000.
- **Hậu quả:** Thông điệp sư phạm khác hành vi thật; thiệt cho học sinh cần thời gian đọc, tính toán hoặc thao tác.
- **Đề xuất sửa:** Bản đầu bỏ thưởng tốc độ. Nếu giữ, xếp theo tổng chất lượng trả lời `Σscore` trước; tốc độ chỉ phân định sau. Cho đồng hạng khi bằng nhau, không dùng ID tài khoản quyết định thứ hạng.

### Q2. “Thành thạo trong ván” và huy hiệu tiến bộ dễ tạo kết luận sai

- **Mô tả:** Một ván ngắn không đủ để gọi là thành thạo; điểm thô giữa các ván không tương đương.
- **Căn cứ:** §9.3–9.4. `engine.js:109–110` so điểm ván với trung bình lịch sử, trong khi số câu có thể là 7/10/15 và nội dung khác nhau.
- **Hậu quả:** Chơi 15 câu thay vì 7 có thể nhận “Tiến bộ nhất” dù chất lượng trả lời giảm. Luyện lại ngay câu vừa xem đáp án có thể làm điểm thành thạo tăng mạnh; `mastery.js:9` cập nhật điểm bằng hệ số decay, còn giảm tín nhiệm câu lặp tại dòng 6–10 chủ yếu tác động độ tin cậy.
- **Đề xuất sửa:** Đổi nhãn thành **“Kết quả các câu trong ván”**. Bỏ huy hiệu tiến bộ dựa trên điểm thô. Gắn nguồn `battle_remediation` cho lượt sửa sai; nếu muốn xác nhận tiến bộ, dùng câu tương đương chưa xem hoặc lượt kiểm tra lại sau một khoảng thời gian.

### Q3. Nhịp thao tác và lời giải chưa phù hợp với học sinh lớp 6–9

- **Mô tả:** Cần bấm Chốt, đọc đề bốn dạng và đọc lời giải trong thời gian ngắn; quy tắc chưa hỗ trợ đủ người chậm thao tác.
- **Căn cứ:** §7.6 tự chuyển sau 15 giây hoặc khi mọi người bấm tiếp; §9.1 không tính lựa chọn nháp; §10 dùng hệ số thời gian chỉ theo loại.
- **Hậu quả:** Điểm phản ánh tốc độ thao tác; 15 giây không đủ đọc lời giải nhiều bước. Nếu bỏ trống vẫn chưa được coi là hoàn tất, cả phòng có thể phải chờ.
- **Đề xuất sửa:** Giữ quyết định “chưa Chốt không tính” nhưng có cảnh báo rõ, nút lớn, trạng thái “đang gửi/đã nhận”, lựa chọn “Bỏ qua”, và ACK dễ nhận biết. Lời giải phải xem lại không giới hạn sau ván; thời gian câu nên dựa thêm vào độ dài và nhu cầu tính toán.

### Q4. Bỏ phiếu và ghép nhiều người chưa bảo đảm giao nội dung không rỗng

- **Mô tả:** Tương thích từng cặp không bảo đảm cả nhóm có nội dung chung; bỏ phiếu nhiều đề xuất quá phức tạp và có thể mở rộng ngoài ý muốn.
- **Căn cứ:** §8.2–8.3. Ba người chọn `{A,B}`, `{B,C}`, `{A,C}` tương thích từng cặp nhưng không có Bài chung cho cả ba. `engine.js:62` dùng ngưỡng `ceil(n/2)` nên phòng hai người chỉ cần một phiếu là giữ đề xuất.
- **Hậu quả:** Ghép được phòng nhưng không chốt được nội dung; hai người mỗi người chọn một Bài thì giữ cả hai, trái kỳ vọng “cùng đồng ý”. Nới tự động sang cả môn có thể đưa kiến thức chưa học vào ván.
- **Đề xuất sửa:** Tính giao phạm vi của **toàn bộ nhóm** trước khi ghép; kiểm tra đủ câu trên giao đó. Bản đầu chỉ cho chọn một trong tối đa ba phạm vi cụ thể, rồi mọi người xác nhận lại. Đóng danh sách người bỏ phiếu theo từng vòng, có hạn kết thúc tuyệt đối.

### Q5. Giao thức SSE và cấu hình Caddy chưa thành một hợp đồng vận hành

- **Mô tả:** Tự nối lại không đồng nghĩa tự khôi phục đúng trạng thái, xác thực hay thời gian.
- **Căn cứ:** §13.3, §13.5, §17.3. [Caddyfile.home:3](</C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/deploy/Caddyfile.home:3>) bật gzip; không có cấu hình riêng SSE. Hook được mô tả chỉ nhận `version` mới hơn.
- **Hậu quả:** Client có thể bỏ qua snapshot sau restart nếu phiên bản bị đặt lại; tự nối lại liên tục khi phiên hết hạn; dữ liệu riêng có thể tồn tại trên kết nối đã mở sau khi quyền bị thu hồi.
- **Đề xuất sửa:** Quy định snapshot ban đầu khi kết nối lại, định danh lần chạy của phòng, version, heartbeat, xử lý 401/403/429 và đóng kết nối khi mất quyền. Giữ `private, no-store`, thêm `no-transform`, cấu hình loại luồng SSE khỏi nén và đo độ trễ qua Caddy. Không coi việc thêm `X-Accel-Buffering: no` là bằng chứng Caddy đã được cấu hình đúng.

### Q6. Snapshot câu hỏi và luồng “luyện lại câu sai” chưa đủ để giữ đúng lịch sử

- **Mô tả:** Giữ `question_version_id` bảo vệ nội dung câu, nhưng chưa đóng băng đầy đủ thông tin chương trình và luật chấm của ván.
- **Căn cứ:** §14, §9.4. SQL nháp chỉ giữ `topic_id/cognitive_level`; `attempts.js:70–72` hiện có `curriculum_snapshot`. `createAttempt` nhận `retryId` của **attempt**, không nhận ID phòng battle (`attempts.js:42–54`).
- **Hậu quả:** Tên Bài/YCCĐ thay đổi làm kết quả cũ hiển thị sai bối cảnh; không thể nối `/retry-wrong` bằng cách truyền ID phòng vào helper cũ. Câu vừa bị cách ly sau ván cần chính sách riêng khi luyện lại.
- **Đề xuất sửa:** Lưu snapshot metadata đã công bố, nguồn battle, phiên bản luật chấm/điểm và cấu hình thực tế. Viết adapter tạo lượt sửa sai có kiểm quyền sở hữu, xử lý cả câu bỏ trống, một phần và câu bị thu hồi; chống tạo nhiều lượt do bấm lại.

### Q7. “Chuyển sang Redis đã có” chưa phải phương án phục hồi khả dụng

- **Mô tả:** Redis hiện tại được cấu hình như cache có thể mất dữ liệu.
- **Căn cứ:** §13.4. `deploy/compose.home.yaml:20–26` dùng `allkeys-lru`, tắt snapshot và AOF; cấu hình systemd tương tự.
- **Hậu quả:** Đưa phòng vào Redis này có thể làm phòng biến mất do đẩy khóa khỏi bộ nhớ hoặc restart. Ghim phòng theo tiến trình cũng chưa giải quyết hàng chờ, chặn và tìm phòng toàn hệ thống.
- **Đề xuất sửa:** Giữ PostgreSQL làm nguồn dữ liệu bền vững. Khi cần nhiều tiến trình, thiết kế riêng quyền sở hữu phòng, điều phối, phát sự kiện và phục hồi; nếu Redis giữ trạng thái quan trọng thì cần cấu hình/instance phù hợp, không dùng nguyên cache hiện có.

### Q8. Danh tính và quy trình báo cáo chưa đủ an toàn cho trẻ em

- **Mô tả:** Tên gọi + lớp vẫn nhận diện được học sinh trong trường; thuật toán xử lý trùng tên có thể hiện cả họ tên.
- **Căn cứ:** §11; `engine.js:33–42` tăng từ một đến bốn từ cuối của họ tên. Báo cáo hiện chỉ có “quản trị viên xem danh sách”.
- **Hậu quả:** Lời hứa không hiện họ tên đầy đủ không được giữ. Báo cáo tồn đọng, bị lạm dụng hoặc không đủ chứng cứ; không lưu biểu cảm khiến một số tố cáo khó kiểm chứng.
- **Đề xuất sửa:** Dùng tên ngắn cộng hậu tố trung tính trong phòng khi trùng; không tự mở rộng thành họ tên. Quy định người phụ trách, phân loại mức độ, thời hạn xử lý, biện pháp tạm thời và phản hồi cho học sinh. Lưu sự kiện an toàn tối thiểu có thời hạn, không thu thập toàn bộ tương tác vô hạn.

### Q9. Ước lượng tải và cách phát snapshot đang quá lạc quan

- **Mô tả:** Tải quan trọng là nhiều người trả lời đồng thời, không chỉ request trung bình.
- **Căn cứ:** §17.1 ước lượng 20 request/giây; §13.2 phát snapshot riêng cho mỗi người sau mỗi thay đổi.
- **Hậu quả:** Một câu ở phòng 50 người có thể tạo khoảng `50 × 50 = 2.500` lượt gửi snapshot chỉ từ các đáp án. Giả sử 5 KB/snapshot thì khoảng **12,5 MB/câu/phòng**, chưa tính các sự kiện khác. 300 người có thể gửi 300 đáp án trong một đợt sát deadline; giới hạn ba stream/người cho phép tới 900 kết nối, không phải luôn 300.
- **Đề xuất sửa:** Giữ snapshot đầy đủ để đơn giản hóa nhưng gộp các cập nhật trung gian trong khoảng ngắn; phát chuyển pha ngay. Đo byte/s, event-loop lag, độ trễ DB và bộ đệm client chậm. Tách cache số đếm chung khỏi gợi ý cá nhân; khóa cache phải chứa đủ môn/khối/phạm vi/bộ lọc.

### Q10. Thứ tự triển khai để an toàn ở cuối; CI chưa chạy smoke được đề xuất

- **Mô tả:** Báo cáo/chặn/quản trị được làm cuối cùng, dù là điều kiện mở cho học sinh. Kế hoạch nói thêm smoke nhưng chưa chỉ ra thay đổi pipeline.
- **Căn cứ:** §17.3. `.github/workflows/deploy.yml:37–54` chỉ build, unit, security và migration gate; không gọi `test:smoke`.
- **Hậu quả:** Dễ có bản tính năng chạy được nhưng chưa đủ kiểm soát. Thêm test vào thư mục smoke mà không nối CI sẽ tạo cảm giác đã được bảo vệ.
- **Đề xuất sửa:** Làm phân quyền, công tắc, giới hạn và xử lý báo cáo trong nền tảng. Nối rõ test battle vào pipeline trên môi trường/database thử; không cho test tích hợp tự dùng database vận hành. Chọn thời điểm deploy theo số phòng đang hoạt động, không chỉ “ngoài giờ học”.

## 4. Kiểm chứng với mã nguồn

### 4.1. Các khẳng định trong tài liệu

| Khẳng định | Đánh giá | Căn cứ và điều chỉnh cần thiết |
|---|---|---|
| Xác thực bằng cookie HttpOnly | **Đúng, nhưng chưa đầy đủ** | `session.js:7,15` đặt cookie HttpOnly; `auth.js:18` còn hỗ trợ Bearer. Cookie chứa JWT; đăng nhập có kiểm tài khoản còn hoạt động và `token_version` tại dòng 21–25. |
| CSRF cho mọi request thay đổi dữ liệu | **Đúng với luồng trình duyệt, không đúng tuyệt đối** | `session.js:18–25` bỏ qua phương thức đọc và cho phép tương thích API không được nhận diện là trình duyệt. Battle POST phải đi qua guard chung. |
| 300 request/phút/người, 3.000/IP | **Đúng là giá trị mặc định** | `rateLimiter.js:41–42`; có thể đổi qua môi trường. `apiLimiter` được gắn theo router, không tự áp dụng cho router mới. IP thật phụ thuộc cấu hình `TRUST_PROXY` tại `server.js:49`. |
| Có thể gắn `/api/battle` sau auth | **Chưa đủ; sẽ bị chặn nếu giữ nguyên middleware** | `server.js:78` chỉ cho học sinh vào `/practice/`. |
| Điều kiện câu dùng được dùng chung mọi nơi | **Diễn đạt quá rộng** | `attempts.js:18–36` có bộ lọc chung, nhưng số đếm trong `lessonMap.js:93–99` không chạy `validateQuestion`. Nhánh câu cố định/luyện lại tại `attempts.js:66` cũng không đi qua `candidates`. |
| Chấm bốn loại, trả điểm 0–1 | **Đúng có điều kiện** | `grading.js:29–45`: TN 0/1; ĐS/GN theo tỷ lệ; TLN bí danh hoặc số/sai số. Câu không tự chấm trả `null`, không phải 0–1. |
| TLN có đơn vị hiện sẵn | **DTO hỗ trợ đơn vị; payload phải khớp** | `studentDto.js:10` xuất `unit`. `grading.js:38–43` kiểm `{value,unit}` khi đơn vị bắt buộc. Chỉ hiện đơn vị trên giao diện nhưng gửi chuỗi số có thể bị chấm sai. |
| DTO không lộ đáp án | **Đúng về cấu trúc của helper hiện tại** | `studentDto.js:3–12` tạo cấu trúc theo danh sách trường cho phép, chỉ thêm đáp án/lời giải khi `reveal=true`. Điều này không tự chứng minh `roomView` an toàn. |
| Ảnh được “ký theo lượt” | **Sai thuật ngữ và cơ chế** | `privateMedia.js:9–13` mã hóa đường dẫn bằng base64url, không phải chữ ký. Dòng 18–25 kiểm quyền với attempt/item và quyền xem nội dung trước khi trả ảnh. |
| Có hàm dồn câu sang mức gần nhất | **Đúng** | `selection.js:11–20` có `fitPercent`; nhưng có thể dồn sang VDC dù tỷ trọng ban đầu bằng 0. Nếu VDC bị cấm thì phải loại trước khi gọi. |
| “Bài em đang học” có sẵn | **Chưa đúng nghĩa tiến độ dạy học** | `lessonMap.js:179–182` suy ra từ Bài đã luyện gần đây/chưa đạt; không xác nhận Bài giáo viên đang dạy theo tiến độ lớp. Nên gọi “Bài em đang luyện”. |
| Đẩy `main` tự deploy, có migration gate | **Đúng ở cấu hình nguồn** | `deploy.yml:3–6,49–65`; `deploy-server.sh:113–138`. Backup bắt buộc khi SQL thay đổi hoặc có cờ ép, không phải mọi deploy đều backup. |
| Migration gate chứng minh migration an toàn | **Chưa đủ** | `migration-safety.mjs:9–29` rà mẫu câu lệnh nguy hiểm; không chứng minh FK hợp lệ, rollback tương thích hay tính đúng nghiệp vụ. |
| Một tiến trình Node sau Caddy | **Có cấu hình tương ứng; chưa xác nhận máy thật** | `compose.home.yaml:9,33–44` chạy Node trực tiếp và Caddy. Chưa kiểm topology vận hành thực tế. |
| Thêm hai header là SSE chạy ổn qua Caddy | **Chưa được chứng minh** | Hai Caddyfile hiện chưa có đường xử lý SSE riêng. Phải kiểm độ trễ luồng thật qua cấu hình triển khai. |
| Hai tệp nháp chưa nối app | **Phù hợp với mã đã đọc** | `server.js` chưa gắn battle router; `upgrade.js:6–21` chưa đăng ký migration V6.9. |

### 4.2. Nhận xét riêng về `engine.js`

| Vị trí | Phát hiện | Hướng sửa |
|---|---|---|
| `26–29` | `pointsFor` không kiểm thời gian âm, thời lượng bằng 0 hay số không hữu hạn. Với `ms=-totalMs`, điểm đúng có thể lên **160**, vượt trần 130. | Kiểm đầu vào; chặn thời gian ngoài miền hợp lệ; chỉ dùng thời gian máy chủ. |
| `33–42` | Xử lý trùng tên có thể hiện đầy đủ họ tên; người có tên giống hệt vẫn chưa phân biệt được. | Tên ngắn + hậu tố trung tính trong phòng. |
| `60–64` | Đúng với công thức “≥½”, nhưng không phải đa số nghiêm ngặt; phòng hai người mỗi người tự giữ được đề xuất của mình. | Chốt lại luật sản phẩm rồi đổi hàm tương ứng. |
| `69–76` | Phạm vi không nhận diện được có thể bị nới tới cả môn; chương có giá trị thiếu/trùng có thể bị gộp sai nếu dữ liệu đầu vào không chuẩn. | Xác thực toàn bộ ID; lỗi ID phải từ chối, không biến thành yêu cầu mở rộng. |
| `79–81` | Hai người bằng điểm, đúng và thời gian vẫn có thứ hạng khác nhau do `userId`; mỗi người luôn có rank riêng. | Đồng hạng theo kết quả; ID chỉ dùng ổn định thứ tự hiển thị. |
| `85–95` | Điểm đội phụ thuộc danh sách `members` truyền vào, chưa có hợp đồng danh sách thành viên cố định lúc bắt đầu. | Đóng băng danh sách tính điểm; người rời vẫn giữ trong mẫu số nếu chọn luật hiện tại. |
| `99–110` | Huy hiệu tiến bộ dùng điểm thô; hàm không biết lịch sử có đủ năm ván hay tương đương cấu hình không. | Bỏ hoặc cung cấp dữ liệu lịch sử đã chuẩn hóa và đủ điều kiện. |
| `139–150` | `startBlocker` không kiểm sức chứa, tối đa bốn người/đội, hay đúng hai đội. Đội 5–3 hoặc ba đội đều có thể qua kiểm tra này. `kind` không hợp lệ có thể gây lỗi truy cập thuộc tính. | Kiểm cấu hình ở biên và kiểm đầy đủ bất biến trước khi bắt đầu. |
| `154–158` | Gửi `points/correct` trong pha trả lời; có nguy cơ lộ kết quả như C2. | Chỉ xuất tổng đã công bố đến câu trước. |
| `162–205` | Không kiểm người xem có quyền; trải `item.student`; trả nguyên `result`. Đây là hàm tạo giao diện, chưa phải ranh giới bảo mật hoàn chỉnh. | Kiểm quyền trước khi gọi và DTO chặt cho từng phần. |
| `158,162` | `publicPlayer` gọi `Date.now()` riêng, không dùng tham số `now`; nhãn “luật thuần” chưa chính xác. | Truyền cùng một thời điểm vào toàn bộ hàm để kiểm thử xác định. |

Nháp này **chưa có xử lý phòng, ghi DB, giao thức SSE hay kiểm quyền route**. Không thể dùng riêng nó làm bằng chứng rằng các yêu cầu ở §15.3 đã được đáp ứng.

### 4.3. Nhận xét riêng về `migration-v69-battle.sql`

**Không phát hiện tên bảng hoặc kiểu khóa ngoại tham chiếu sai rõ ràng** so với schema nguồn: `users/classes/subjects/topics` dùng khóa số nguyên; `question_versions.id` là UUID, phù hợp `migration-practice-v1.sql:4,24`. Những thiếu sót chính là:

1. **Thiếu ràng buộc người trả lời thuộc phòng:** cần FK từ `(room_id,user_id)` của `battle_answers` đến `battle_players`.
2. **Thiếu kiểm tra miền dữ liệu:** `idx≥0`, `score` không rỗng và trong `[0,1]` đối với đáp án đã chấm, `ms≥0`, điểm/số đúng không âm, đội thuộc tập cho phép.
3. **`question_id` chưa có FK và chưa ràng buộc khớp `question_version_id`:** có thể ghi một ID câu cùng phiên bản của câu khác.
4. **Chưa ngăn lặp một câu trong cùng bộ đề:** cần xác định tính duy nhất theo `question_id`, không chỉ `(room_id,idx)`.
5. **Mã phòng chưa bị ép là sáu chữ số:** `char(6)` chỉ quy định kiểu/độ dài; cần kiểm định dạng. Unique partial index hiện có là phù hợp cho mã phòng đang mở, nhưng sinh mã phải xử lý va chạm.
6. **Giới hạn chưa khớp chế độ:** capacity 2–50 chưa ép duel=2, team≤8, ffa≤20; cấu hình số câu/thời gian rộng hơn lựa chọn UI. Có thể chủ động cho DB rộng hơn, nhưng phải ghi rõ lớp nào chịu trách nhiệm kiểm.
7. **“Đóng băng” mới là lời hứa:** bảng câu hỏi và đáp án battle chưa có cơ chế bảo vệ khỏi sửa sau khi chốt; thiếu snapshot chương trình và phiên bản luật.
8. **Chưa có dữ liệu liên kết lượt luyện lại, xử lý báo cáo và phiên bản kết quả:** cần bổ sung theo chính sách đã chốt, không nhất thiết thêm tất cả vào `battle_rooms`.
9. **Chưa đăng ký migration:** `upgrade.js:6–21` hiện không chứa tệp này. Cấu hình `battle_enabled` cũng chưa được triển khai bởi SQL nháp.

Không cần sao chép toàn bộ nội dung câu nếu dùng đúng phiên bản đã duyệt bất biến: `migration-v643-review.sql:28–39` đã có bảo vệ nội dung phiên bản. Phần cần bổ sung là metadata, luật và tính nhất quán của bản ghi battle.

## 5. Trả lời 20 câu hỏi mở ở mục 18

| # | Khuyến nghị cụ thể | Lý do |
|---|---|---|
| **1** | Bản đầu bỏ thưởng tốc độ cho cả bốn loại; nếu giữ về sau, chỉ dùng sau tiêu chí độ đúng. | 30% đủ đảo thứ hạng giữa người đúng ít và đúng nhiều; KHTN cần thời gian suy luận. |
| **2** | Dùng thời gian gợi ý theo độ dài/nhu cầu tính toán, có bộ mức đơn giản; giáo viên được tăng, học sinh chọn trong giới hạn. | Loại câu không phản ánh đầy đủ thời gian cần thiết. |
| **3** | Giữ luật đã chốt nhưng làm nút Chốt nổi bật, cảnh báo khi còn ít thời gian, hỗ trợ Enter đúng ngữ cảnh và hiển thị ACK. | Giảm lỗi thao tác mà không âm thầm tính đáp án nháp. |
| **4** | Cho chốt ĐS khi thiếu ý, xác nhận ngắn “Còn … ý chưa chọn”; ý thiếu tính sai. | Phù hợp chấm từng phần và không ép đoán để được nộp. |
| **5** | Giữ trung bình trên danh sách đội cố định, ưu tiên đội cân số người; không hiển thị người “kéo tụt đội”. | Dễ hiểu, tránh thay đổi mẫu số khi rời. Trả lời chung là chế độ hợp tác khác, nên thiết kế riêng. |
| **6** | Mặc định hiển thị kết quả cá nhân; top 3 là tùy chọn. Màn chiếu mặc định chỉ hiện thống kê lớp. | Hạn chế bêu thứ hạng thấp và áp lực công khai. |
| **7** | Có, thêm vào danh sách cá nhân “Cần xem lại”, nhưng không biến thành đánh giá thành thạo. | Giữ giá trị học tập mà không suy diễn năng lực từ ván ngắn. |
| **8** | Thay hai vòng đề xuất/đồng ý bằng tối đa ba lựa chọn phạm vi; mỗi người chọn một. | Học sinh lớp 6–7 hiểu nhanh hơn; giảm tình huống hòa và mở rộng bất ngờ. |
| **9** | Thử mốc 30 giây mỗi vòng, cho chốt sớm khi mọi người xong; giới hạn số lần gia hạn. | 20 giây dễ thiếu khi đọc trên điện thoại; gia hạn vô hạn giữ phòng sống mãi. |
| **10** | Không tự mở nhiều lời nhắc ở 20/40/60 giây. Sau khoảng 30 giây đưa một lựa chọn nới; sau 60–90 giây cho tạo phòng hoặc về tự luyện. | Giảm áp lực đổi nội dung; thời gian cụ thể cần điều chỉnh bằng dữ liệu sử dụng. |
| **11** | Một ván hoạt động/học sinh, hạn chế tạo phòng liên tiếp, có chế độ bảo trì/kiểm tra toàn trường và nhắc nghỉ. | Kiểm soát hành vi và tải mà không cần công tắc từng lớp. |
| **12** | Không coi tên gọi + lớp là ẩn danh. Sảnh dùng thông tin tối thiểu; trùng tên dùng hậu tố trung tính. | Trong phạm vi trường, lớp cộng tên thường đủ nhận diện. |
| **13** | Một hàng đợi báo cáo có gộp trùng, ưu tiên mức độ, người nhận xử lý và các thao tác tạm khóa có thời hạn. | Một người phụ trách cần quyết định nhanh và có dấu vết xử lý. |
| **14** | Giữ RAM cho điều phối một tiến trình; PostgreSQL giữ sự kiện đã nhận. Chỉ chuyển điều phối khi cần nhiều tiến trình hoặc số đo cho thấy cần. | Redis hiện có không cung cấp mặc định độ bền của dữ liệu phòng. |
| **15** | Có thể giữ snapshot đầy đủ, nhưng gộp thay đổi trung gian, giới hạn kích thước và đo phòng 50 người trả lời đồng loạt. | Tránh tăng độ phức tạp quá sớm, đồng thời kiểm soát số lần phát. |
| **16** | Bản đầu có thể loại ảnh nếu vẫn đủ Bài thí điểm; nếu thiếu nghiêm trọng, làm endpoint ảnh kiểm quyền theo phòng–câu–người xem. | KHTN có nhiều hình bắt buộc để hiểu đề; loại ảnh làm lệch nội dung. Không cần mặc định dùng URL ký. |
| **17** | Bản đầu chỉ kho trường. Sau đó cho chủ kho cấp quyền sử dụng trong battle rõ ràng hoặc xuất bản bản được duyệt sang kho trường. | Giáo viên đọc được kho tổ không đồng nghĩa mọi học sinh trong phòng đều được đọc. |
| **18** | Chấp nhận giới hạn chống tra cứu của hoạt động luyện tập; ưu tiên chống nộp giả, nộp lặp, tài khoản ngoài phòng và rò rỉ dữ liệu. | Theo dõi chuyển tab không chứng minh gian lận; không nên dùng camera hay phạt tự động. |
| **19** | Đặt “Câu cần xem lại + Luyện tiếp” trước podium. | Hành động tiếp theo phải phục vụ học tập; podium chỉ là phần phụ. |
| **20** | Chạm–chạm, có đánh dấu cặp đang chọn và hoàn tác; thêm lựa chọn bằng bàn phím/trình đọc màn hình. | Ít lỗi trên màn hình nhỏ hơn kéo thả và dễ tiếp cận hơn. |

## 6. Thiếu sót cần bổ sung vào tài liệu

### Dữ liệu trẻ em và quản trị

- Mục đích sử dụng, người được xem, thời hạn giữ và quy trình xóa/ẩn danh cho đáp án, lịch sử phòng, báo cáo, quan hệ chặn và bản sao lưu.
- Thông báo dễ hiểu cho học sinh và quy trình nhà trường phê duyệt việc xử lý dữ liệu. Tên ngắn không làm dữ liệu trở thành vô danh.
- Quyền xem báo cáo của giáo viên, quản trị; lưu nhật ký truy cập/xử lý.
- Không tự động dùng lại dữ liệu battle để đánh giá chính thức chỉ vì §9.4 nói “sau này có thể gộp”; thay đổi mục đích cần quyết định và thông báo riêng.

### Phạm vi giáo dục

- “Cùng khối” không bảo đảm đã học cùng Bài: cần đối chiếu tiến độ lớp hoặc xác nhận rõ phạm vi ôn tập.
- Phân biệt **môn KHTN** với phân môn Lý/Hóa/Sinh ở THCS; ví dụ “Lý 9” không được biến thành `subject_id` riêng nếu schema đang biểu diễn bằng phân môn.
- Quy định lời giải tối thiểu. Hiện `grading.js:61` chỉ cảnh báo khi thiếu lời giải; kế hoạch lại hứa có lời giải sau mỗi câu.
- VDC 0% là “không chủ động phân bổ” hay “tuyệt đối không dùng” phải được chốt.
- Không suy ra năng lực thực hành, tìm hiểu tự nhiên hoặc năng lực STEM chỉ từ bốn loại câu tự chấm.

### Khả năng truy cập và thiết bị

- GN dùng được hoàn toàn bằng bàn phím; trạng thái có nhãn cho trình đọc màn hình.
- Không để phím A/B/C/D kích hoạt lựa chọn khi học sinh đang nhập TLN.
- Zoom, công thức dài, bàn phím ảo che nút Chốt, thiết bị xoay màn hình, điện thoại yếu và tab bị hệ điều hành tạm dừng.
- Chế độ tăng thời gian/không đua tốc độ; phương án tham gia hoặc luyện tương đương cho học sinh không có thiết bị.
- Thông báo “câu được giữ” phải phân biệt **nháp còn trên máy** với **đáp án đã được máy chủ nhận**.

### Quan sát hệ thống và nhật ký

- Đo riêng: phòng hoạt động, hàng chờ, stream mở, reconnect, byte SSE, bộ đệm chậm, event-loop lag, DB pool wait, đáp án trễ/trùng, ván gián đoạn.
- Nhật ký tạo/bắt đầu/chuyển pha/dừng/phục hồi và xử lý báo cáo, dùng mã tham chiếu; không ghi toàn bộ đáp án hay thông tin cá nhân vào log vận hành.
- Đo thêm tỷ lệ bỏ ván, không chốt, quay lại sửa sai và thời gian đọc lời giải. “Ít báo cáo” chưa chứng minh an toàn vì học sinh có thể không biết hoặc ngại báo cáo.

### Tiêu chí nghiệm thu tối thiểu

1. Mọi đáp án đã ACK thành công tồn tại sau restart và không bị tính hai lần.
2. Không có kênh tiết lộ kết quả câu hiện tại trước lúc đóng nhận bài.
3. Người ngoài phòng/khác khối/không đủ quyền không đọc hoặc ghi được tài nguyên.
4. Hai người vào chỗ cuối, hai yêu cầu bắt đầu và chốt sát deadline cho kết quả xác định.
5. Kiểm bốn loại câu, gồm dấu phẩy thập phân, đơn vị, sai số, ý thiếu và ghép thiếu.
6. Battle không tạo `mastery_events` hoặc đổi `mastery_states`; luồng sửa sai có nguồn gốc rõ ràng.
7. Tải qua Caddy gồm phòng 50 người, 300 học sinh chung IP, reconnect đồng loạt và client chậm; đánh giá cả ảnh hưởng đến tự luyện.
8. Tắt tính năng, dừng khẩn cấp, restart và rollback ứng dụng có kết quả được mô tả trước.

## 7. Đề xuất thứ tự triển khai và phạm vi bản đầu

Tôi đề nghị **đổi quyết định phát hành cả bốn chế độ cùng lúc**, dù có thể tiếp tục phát triển chúng trong cùng một đợt. Đây là đề xuất điều chỉnh §20, không phải coi quyết định hiện tại đã được thay đổi.

1. **Chốt đặc tả trước:** quyền, trạng thái, deadline/ân hạn, dữ liệu được công bố theo pha, giao dịch ghi và chính sách chặn trong phòng lớp.
2. **Làm nền an toàn:** migration, cấu hình, giới hạn, log, DTO, bộ chọn câu, xử lý báo cáo và bộ kiểm thử âm. Bổ sung luồng cập nhật app hiện có.
3. **Dựng một ván nhỏ từ đầu đến cuối:** hai học sinh thử nghiệm để xác minh nhận câu–chốt–lời giải–kết quả–mất mạng–restart. Đây là bước kỹ thuật, chưa mở sảnh công khai.
4. **Phát hành bản đầu có giám sát:** giáo viên mở phòng lớp, chọn trước Bài, 7 hoặc 10 câu; dùng cả bốn loại như quyết định của chủ dự án; không thưởng tốc độ, không bảng hạng đầy đủ mặc định. Kho trường, không ảnh nếu độ phủ đủ. Có sửa sai, báo cáo, giới hạn và công tắc.
5. **Mở đấu đôi bằng mã**, sau đó mới mở sảnh/tìm đối thủ.
6. **Mở FFA, đấu đội và bỏ phiếu nội dung** sau khi có dữ liệu vận hành và thử nghiệm với học sinh lớp 6–9.

Trước mỗi lần mở rộng cần vượt cổng tải, an toàn và khả dụng. Không cần đưa Redis vào vai trò giữ trạng thái ván trong bản đầu.

## 8. Bảng tổng hợp

| # | Mức | Mục tài liệu | Vấn đề | Đề xuất |
|---|---|---|---|---|
| C1 | **Chặn** | §13–15 | API bị chặn; cấu hình không bật/tắt được | Sửa hợp đồng tích hợp route và cấu hình |
| C2 | **Chặn** | §15.2–15.3 | Điểm/số đúng có thể lộ kết quả trước lời giải | Đóng băng điểm công khai đến câu trước; DTO theo pha |
| C3 | **Chặn** | §13.2, §16 | Chưa bảo đảm nguyên tử, bền vững và chống lặp | Tuần tự hóa lệnh; commit trước ACK; ràng buộc DB |
| C4 | **Chặn** | §7.8, §9.1, §16 | Deadline, ân hạn, pause và rời ván chưa thống nhất | Đặc tả máy trạng thái và mốc đóng nhận bài |
| C5 | **Chặn** | §2.1, §10, §13.2 | Đếm/bốc câu khác điều kiện; có thể sai phạm vi | Một điều kiện battle chung; kiểm lại lúc bắt đầu |
| C6 | **Chặn** | §6, §11, §15.3 | Quyền lớp/khối và chặn trong phòng lớp mâu thuẫn | Xác định tư cách từ server; chính sách chặn rõ ràng |
| C7 | **Chặn** | §11, §13, §17 | Thiếu giới hạn tài nguyên và dừng khẩn cấp | Giới hạn phòng/hàng chờ/SSE/body; ưu tiên lưu bài |
| Q1 | **Quan trọng** | §9.2 | Điểm tốc độ đảo nguyên tắc đúng trước | Bỏ thưởng tốc độ hoặc chỉ dùng phân định sau |
| Q2 | **Quan trọng** | §9.3–9.4 | Nhãn thành thạo và huy hiệu tiến bộ gây hiểu sai | Kết quả quan sát; sửa sai có nguồn; kiểm lại bằng câu mới |
| Q3 | **Quan trọng** | §7.6, §9–10 | Thao tác Chốt và thời gian lời giải gây thiệt | ACK rõ, cảnh báo, Bỏ qua, xem lại lời giải |
| Q4 | **Quan trọng** | §8 | Ghép từng cặp không bảo đảm giao cả nhóm; phiếu phức tạp | Giao toàn nhóm; bỏ phiếu một phạm vi |
| Q5 | **Quan trọng** | §13.3–13.5, §17.3 | SSE reconnect/version/quyền/Caddy chưa đủ | Hợp đồng kết nối lại; cấu hình và đo qua proxy |
| Q6 | **Quan trọng** | §9.4, §14–15 | Snapshot và retry battle chưa tích hợp | Snapshot metadata/luật; adapter sửa sai riêng |
| Q7 | **Quan trọng** | §13.4 | Redis hiện có có thể loại/mất trạng thái | Không dùng nguyên cache làm nơi giữ phòng |
| Q8 | **Quan trọng** | §11 | Tên có thể lộ đầy đủ; báo cáo thiếu quy trình | Tên tối thiểu; xử lý báo cáo có trách nhiệm và thời hạn |
| Q9 | **Quan trọng** | §15.2, §17.1 | Đánh giá thiếu tải đồng loạt và số lần phát SSE | Gộp cập nhật; đo burst, byte và client chậm |
| Q10 | **Quan trọng** | §17.2–17.3 | An toàn làm cuối; smoke chưa nối CI | Đưa an toàn lên nền; cổng nghiệm thu trước phát hành |
| N1 | **Nhỏ** | §13.2 | Engine “thuần” nhưng tự đọc đồng hồ | Truyền `now` thống nhất |
| N2 | **Nhỏ** | §2.2, §10 | Gọi cơ chế ảnh là “ký URL” không đúng mã | Đổi thành truy cập ảnh có kiểm quyền theo lượt |

