## 1. Đối chiếu từng góp ý vòng 1

**“Đạt” dưới đây nghĩa là đã xử lý đủ trong đặc tả, chưa phải mã đã được sửa hay kiểm thử.** Tôi không đánh lỗi lại hai tệp nháp vì §15.6 đã xác định sẽ viết lại.

| Điểm | Kết luận | Căn cứ bản 1.1 |
|---|---|---|
| C1 — Route, cấu hình | **Đạt** | §13.6 |
| C2 — Lộ kết quả qua điểm | **Đạt** | §15.2–15.3 |
| C3 — Nguyên tử, chống lặp | **Chưa đủ** | §13.3, §15.1, §16 |
| C4 — Thời gian, trạng thái | **Chưa đủ** | §9.1, §9.3 |
| C5 — Điều kiện đếm/bốc câu | **Đạt** | §10.2–10.3 |
| C6 — Quyền và chặn | **Chưa đủ** | §11.1, §11.4, §15.4 |
| C7 — Giới hạn tài nguyên | **Chưa đủ** | §13.5 |
| Q1 — Đúng trước, nhanh sau | **Chưa đủ** | §9.2; lỗi mới M1 bên dưới |
| Q2 — Thành thạo, huy hiệu | **Chưa đủ** | §9.4, §18.3; xem phần 3 |
| Q3 — Thao tác, lời giải | **Đạt** | §7.5–7.6, §10.1 |
| Q4 — Ghép nhóm, bỏ phiếu | **Đạt** | §8.2–8.3 |
| Q5 — SSE, Caddy | **Chưa đủ** | §15.4 |
| Q6 — Snapshot, luyện lại | **Chưa đủ** | §13.6, §14; lỗi mới M4 |
| Q7 — Redis | **Đạt** | §13.4 |
| Q8 — Danh tính, báo cáo | **Chưa đủ** | §11.5–11.6; lỗi mới M3 |
| Q9 — Tải và phát snapshot | **Chưa đủ** | §17.1–17.3 |
| Q10 — An toàn và CI | **Chưa đủ** | §17.2–17.4 |
| N1 — Đồng hồ trong engine | **Đạt** | §13.2 |
| N2 — Thuật ngữ ảnh | **Đạt** | §2.1 |

Những khoảng trống còn lại:

- **C3:** §13.3 ghi “kiểm điều kiện → INSERT”, nhưng §15.3 yêu cầu kiểm pha/index/hạn giờ cho mọi lệnh. Đáp án đã commit, mất ACK, gửi lại sau khi sang `reveal` sẽ được trả biên nhận cũ hay bị từ chối sai pha? Phải quy định **tra biên nhận cũ trước khi áp điều kiện nhận đáp án mới**, cùng payload thì trả lại; khác payload thì báo đã khóa. `client_id` có trong API nhưng chưa có hợp đồng lưu/đối chiếu. Khóa theo học sinh và phòng cũng cần thứ tự lấy khóa thống nhất để tránh deadlock.

- **C4:** §7.6 nói phòng lớp do giáo viên chuyển câu, nhưng bảng §9.3 vẫn ghi “đủ phiếu hoặc 20 giây → câu kế”. Pause chưa nói có nhận đáp án không, xử lý lệnh đã vào hàng chờ thế nào; `closing` chờ “hàng lệnh rỗng” cũng chưa phân biệt các lệnh nhận trước hạn với lệnh mới. Cần chốt: phòng lớp không tự chuyển; khi pause từ chối đáp án mới; đóng câu theo một mốc chặn các lệnh đã nhận, không phụ thuộc toàn bộ hàng chờ có rỗng hay không.

- **C6:** Ngoại lệ phòng lớp đã rõ, nhưng **chặn khi hai người đang cùng phòng học sinh** chưa có hiệu ứng xác định. Ai rời, khi nào chặn có hiệu lực? Ngoài ra, §15.4 đóng stream khi rời/tạm khóa, trong khi §11.1 vẫn cho “người chơi của phòng” đọc kết quả. Cần tách quyền tiếp tục chơi/xem trực tiếp khỏi quyền xem lịch sử của mình.

- **C7 và Q9:** Có trần phòng/stream nhưng chưa có trần **lệnh chờ**, thời gian chờ DB hay cách xử lý client liên tục nối lại sau khi bị ngắt vì chậm. Giới hạn 1.500 stream × 256 KB tương đương khoảng **375 MiB bộ đệm**, chưa tính ứng dụng. Bộ nghiệm thu đo 300 học sinh không tự chứng minh toàn bộ giới hạn cấu hình an toàn. Cần đặt giới hạn sử dụng theo tải đã đo và thay “tự luyện không chậm đáng kể” bằng ngưỡng số cụ thể.

- **Q5:** §15.4 yêu cầu phân biệt 401/403/429 nhưng chưa chọn cách thực hiện. Nếu dùng `EventSource` chuẩn của trình duyệt, callback lỗi không cung cấp trực tiếp HTTP status/`Retry-After`. Chọn rõ `fetch` đọc stream, hoặc `EventSource` kèm yêu cầu kiểm tra trạng thái khi lỗi; quy định một cơ chế reconnect duy nhất.

- **Q10:** Claude đúng: `.github/workflows/ci.yml:77–129` đã chạy smoke trên PostgreSQL riêng. Tuy nhiên, workflow này bỏ qua push `main` (`:5–9`), còn `deploy.yml:59–65` chỉ phụ thuộc job verify của chính nó. Cần quy định bắt buộc PR vượt smoke trước merge, hoặc cổng deploy kiểm smoke thành công trên đúng commit; hiện tài liệu chưa bảo đảm điều đó.

## 2. Vấn đề mới do bản 1.1

### M1. Phân hạng mới ưu tiên người không có câu đúng hoàn toàn

§9.2 lấy tổng thời gian **chỉ các câu đúng hoàn toàn** để phân định.

Ví dụ cùng hai câu ĐS:

- A đạt `1 + 0,5 = 1,5`; thời gian câu đúng hoàn toàn là 20 giây.
- B đạt `0,75 + 0,75 = 1,5`; không câu nào đúng hoàn toàn, tổng thời gian tương ứng là 0.

B đứng trên A vì “0 giây”, dù không có cơ sở nói B nhanh hơn. **Sửa đơn giản nhất: bằng tổng điểm thì đồng hạng.** Nếu giữ tiêu chí thời gian, phải định nghĩa phép so sánh trên cùng tập câu và cách xử lý bỏ trống.

### M2. Kết thúc sớm làm lộ toàn bộ bộ đề và tạo “câu sai” chưa từng được hỏi

§15.2, dòng 400 cho `finished/interrupted` nhận đáp án **toàn ván**. Trong khi §16 cho kết thúc khi mọi người rời, restart hoặc dừng khẩn cấp.

Như vậy, dừng ở câu 2 vẫn có thể nhận lời giải câu 3–10. §9.4 còn chưa phân biệt “bỏ trống câu đã hỏi” với “câu chưa tới lượt”.

**Cần bổ sung:** lưu phạm vi câu đã phát; kết quả/luyện lại chỉ xét các câu đó. Không tự công bố phần bộ đề chưa sử dụng khi ván gián đoạn.

### M3. Thời hạn và nguồn chứng cứ an toàn mâu thuẫn

- §11.5 và §14: sự kiện an toàn giữ **90 ngày**.
- §11.6: báo cáo, sự kiện an toàn giữ **1 năm**.
- §11.5 muốn lưu biểu cảm của phòng có báo cáo, nhưng chưa nói biểu cảm **trước lúc báo cáo** lấy từ đâu.

**Cần chốt:** một thời hạn cho từng loại dữ liệu; nếu cần chứng cứ trước báo cáo, dùng bộ đệm tạm có giới hạn và chỉ lưu bền khi báo cáo phát sinh. Không để lập trình viên tự chọn thu thập toàn bộ hay mất chứng cứ.

### M4. `battle_retry` mới chưa được tích hợp hết vào hành vi hiện có

§13.6 chỉ đề cập `createAttempt` và CHECK, nhưng mã hiện tại còn:

- `attempts.js:66`: nguồn khác `retry` bị gắn `selection_reason='assigned'`.
- `lessonMap.js:186`: chỉ đếm `source='retry'` vào số lượt sửa sai.
- `portfolio.js:68`: thống kê nguồn chưa có `battle_retry`.
- `attempts.js:54`: luyện lại lần tiếp theo luôn chuyển nguồn thành `retry`.

Do đó, “tính như retry” chưa đồng nghĩa hoạt động nhất quán. **Cần bổ sung danh sách điểm tích hợp và quy tắc giữ nguồn gốc battle qua các lượt luyện lại tiếp theo.** Đây cũng là điều kiện để sau này thay chính sách thành thạo mà không mất dấu nguồn.

### M5. Cờ chế độ không đủ thực hiện cách phát hành được khuyến nghị

§6 chỉ có bốn cờ `duel/team/ffa/class`, nhưng trình tự phát hành yêu cầu bật **đấu đôi bằng mã trước**, sau đó mới bật sảnh/tìm đối thủ/bỏ phiếu. Cờ `duel` không phân biệt các đường vào đó.

**Cần thêm cấu hình khả năng** cho sảnh, ghép tự động và bỏ phiếu, hoặc định nghĩa rõ một mức phát hành điều khiển chúng ở cả server và UI. Chỉ giấu nút không đủ.

## 3. Những điểm Claude không theo hoặc để chủ dự án quyết

### Phát hành theo bậc: giữ ý kiến, rút yêu cầu phải chia đợt phát triển

Tôi chấp nhận **viết đủ bốn chế độ trong một đợt**. Tôi vẫn khuyến nghị bật theo bậc vì kiểm thử tải không thay thế quan sát hành vi học sinh và khối lượng xử lý báo cáo. Nếu chủ dự án chọn bật đồng thời, đó là chấp nhận rủi ro vận hành; không được bỏ cổng nghiệm thu.

### Hiển thị xếp hạng: giữ mặc định riêng tư

Bảng đầy đủ nằm sau nút “Xem cả bảng” vẫn công khai thứ hạng thấp; thu gọn không giải quyết vấn đề này. Tôi giữ đề xuất mặc định kết quả cá nhân, xếp hạng là lựa chọn có chủ đích.

Bản 1.1 cũng cần thống nhất: §7.8 ghi top 5 **“nếu giáo viên bật”**, nhưng §18.1 và phản hồi Claude vẫn để mở. Không nên để AI tự chọn mặc định.

### `battle_retry` tính thành thạo: giữ lo ngại, không yêu cầu sửa hồi tố toàn hệ thống

Lập luận “retry hiện có cũng tính” chứng minh sự nhất quán kỹ thuật, **không chứng minh chất lượng bằng chứng học tập**. `mastery.js:9` vẫn dùng điểm lượt mới để cập nhật thành thạo; hệ số câu lặp ở dòng 6–10 không trực tiếp giảm trọng số cập nhật điểm đó.

Tôi giữ khuyến nghị: sửa lại đúng câu vừa xem lời giải được ghi nhận là hoạt động sửa sai; xác nhận thành thạo bằng câu tương đương chưa xem. **Không bắt buộc phải đồng thời loại mọi `retry` cũ** mới xử lý được luồng battle mới. Nếu chủ dự án chọn vẫn tính, cần ghi rõ quyết định, giữ nguồn gốc và chấp nhận giới hạn của chỉ số.

## 4. Kết luận

**Bản 1.1 chưa đủ để giao AI tự triển khai toàn bộ mà không phải tự quyết các quy tắc quan trọng.** Không cần viết lại kế hoạch; bổ sung một phụ lục triển khai ngắn gồm:

1. Thứ tự khóa, hợp đồng gửi lại và biên nhận sau commit.
2. Luật pause/đóng câu/chuyển câu phòng lớp; quyền sau rời hoặc bị khóa.
3. Công thức đồng hạng và phạm vi câu được công bố khi kết thúc sớm.
4. Cơ chế SSE/reconnect cụ thể; giới hạn hàng chờ và ngưỡng tải nghiệm thu.
5. Tích hợp đầy đủ `battle_retry`; chính sách thành thạo và xếp hạng đã được chốt.
6. Thời hạn chứng cứ thống nhất, cờ phát hành đủ dùng và cổng smoke bắt buộc trước deploy.