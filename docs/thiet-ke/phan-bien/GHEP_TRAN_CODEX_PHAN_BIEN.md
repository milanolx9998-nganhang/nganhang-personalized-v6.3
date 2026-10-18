## 1. Kết luận

**Đề xuất đúng hướng, nhưng nên thu hẹp bản đầu.** Chọn nhiều lựa chọn chấp nhận được, nới phạm vi có giới hạn và tận dụng phòng đang chờ phù hợp sẽ giúp trường ít người online. Tuy nhiên, công thức điểm hiện tại chưa bảo đảm người chờ lâu được phục vụ; nhóm bạn và đấu bản ghi làm tăng đáng kể rủi ro cùng khối lượng triển khai. Nên ưu tiên **ghép được người thật trong phạm vi học sinh đã đồng ý**, giữ tự luyện làm lối ra khi không có đối thủ.

*Đối chiếu tĩnh trên nhánh `feat-v69-battle`; không sửa tệp, chạy ứng dụng/kiểm thử hay truy cập mạng. Dưới đây gọi đề xuất là **ĐX**, kế hoạch 1.3 là **KH**; tên tệp dịch vụ rút gọn thuộc `backend/src/services/battle/`.*

## 2. Vấn đề CHẶN / QUAN TRỌNG

### 1. CHẶN — Phòng công khai và vé chạy song song phá vỡ bất biến hiện có

- **Mô tả/căn cứ:** ĐX §2.2.3a trái KH §8.2: không đồng thời ở phòng và hàng chờ. Mã chặn tạo phòng khi còn vé, từ chối ghép người đã có phòng, và xoá vé sau khi vào phòng thành công: [rooms.js:104](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/rooms.js:104>), `rooms.js:105–111`, `matchmaking.js:22–26`.
- **Hậu quả:** Giữ nguyên mã thì phương án không hoạt động; bỏ kiểm tra thì có nguy cơ chiếm hai chỗ hoặc bỏ lại phòng vừa tạo.
- **Sửa:** Chuyển **vé → phòng** một lần, xoá vé sau commit; phòng tiếp tục nhận người từ bộ ghép. Tuân thủ KH §23.1: khoá học sinh tăng dần → hàng lệnh phòng → kiểm lại → commit. Không gọi `rooms.join()` bên trong đoạn đã giữ chính khoá học sinh đó vì hàm này tự lấy khoá.

### 2. CHẶN — “Ẩn tên” chưa đủ bảo vệ chủ bản ghi

- **Mô tả/căn cứ:** ĐX §2.6 mặc định cho phép dùng lại bài làm và gọi người ảo là “không bị chặn/báo cáo”. Trong khi đó, DTO hiện xuất `user_id` thành `id`; quyền xem và lịch sử dựa trên tư cách người chơi: [dto.js:19](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/dto.js:19>), `dto.js:26,32,43`, `rooms.js:31`, `storage.js:37`. KH §11.6 chưa quy định mục đích tái sử dụng này.
- **Hậu quả:** Nếu dùng ID thật cho người ảo, chủ bản ghi có thể xuất hiện trong lịch sử/quyền xem của ván mới; người chơi có thể nhận diện nguồn dù đổi tên. Nếu phát cả `response` ra ngoài còn trái KH §15.2.
- **Sửa:** Mặc định **tắt**, đồng ý riêng và cho rút lại. Tách danh tính ảo khỏi tài khoản nguồn; nguồn chỉ máy chủ biết. Không xuất đáp án riêng của nguồn, chỉ trạng thái/điểm đúng pha; vẫn có nút báo vấn đề bản ghi. Kiểm chặn hai chiều trước mỗi lần sử dụng, thống nhất thời hạn và chính sách nhà trường.

### 3. CHẶN — Bản ghi chưa có mô hình dữ liệu và cơ chế phát lại đủ dùng

- **Mô tả/căn cứ:** Hai cột trong ĐX §3 chưa đủ: `battle_players.user_id` bắt buộc tham chiếu tài khoản, đáp án tham chiếu người chơi; `ghost_of` chỉ chỉ ra phòng, chưa chỉ ra người nguồn trong ván nhiều người. Xem [migration-v69-battle.sql:18](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/db/migration-v69-battle.sql:18>), dòng 35–40. `rooms.js:35–45` hiện chỉ giữ **một hẹn giờ/phòng**, còn `internal()` chưa có lệnh phát đáp án.
- **Hậu quả:** Ghép hẹn giờ phát lại vào cơ chế cũ có thể làm mất hẹn giờ đóng câu; xử lý thiếu trường hợp bỏ trống, kết thúc sớm, phát trùng. Lưu “như ván thường” còn có thể ảnh hưởng lịch sử người nguồn.
- **Sửa:** Để sau; cần mô hình nguồn/người ảo riêng, cùng phiên bản câu–luật–thời lượng, kiểm lại câu còn được phép dùng. Mỗi sự kiện phát lại phải qua hàng lệnh, mang `index + schedule_version`, chống ghi lặp; bộ đếm 20 lượt phải nguyên tử. Chỉ chọn ván hoàn tất hợp lệ; không phát câu chưa từng mở.

### 4. QUAN TRỌNG — Lịch nới chưa có nghĩa nhất quán

- **Mô tả/căn cứ:** ĐX §2.1 cho chọn nhiều môn nhưng §2.3 tới 60 giây mới dùng “môn khác”; chưa có môn ưu tiên. Chọn sẵn cả môn hoặc nhiều Chương thì bước “cả Chương chứa các Bài” không xác định. Mã chuẩn hoá đã chuyển Chương thành tập Bài: [deck.js:23](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/deck.js:23>); bộ nới hiện tại chỉ tạo một đề nghị, `routes/battle.js:37–42`.
- **Hậu quả:** Nới có thể thu hẹp nhầm, bỏ lựa chọn ban đầu hoặc đưa học sinh sang phần chưa học.
- **Sửa:** Dùng mọi lựa chọn đã tick ngay từ đầu, hoặc thêm thứ tự ưu tiên rõ ràng. Lưu phạm vi gốc và trần đồng ý; bảo đảm `S(t₁) ⊆ S(t₂) ⊆ trần`. Bỏ qua cấp không tồn tại, xử lý hợp nhiều Chương; thông báo rõ trước khi bật tự nới. Lịch vẫn phải chạy khi **chỉ có một vé**.

### 5. QUAN TRỌNG — Điểm nhóm không bảo đảm công bằng hay “nhóm tốt nhất”

- **Mô tả/căn cứ:** ĐX §2.4–2.5 thiếu định nghĩa độ gần trình độ của nhóm, cách giảm trọng số và phá hoà. Bỏ thành phần trình độ để xét riêng: nhóm chờ lâu ở phạm vi môn đạt `40×0,2 + 30 = 38`, vẫn thua nhóm mới cùng Bài đạt `40`. Điểm không thưởng số người được ghép nên nhóm đôi có thể luôn thắng nhóm đông.
- **Hậu quả:** Người chờ lâu có thể tiếp tục bị bỏ qua; nới rộng lại làm giảm điểm. Tối ưu từng nhóm bằng tham lam cũng không bảo đảm tối đa số người được chơi.
- **Sửa:** Lấy vé hợp lệ chờ lâu nhất làm điểm xuất phát, chọn nhóm tương thích trong tập ứng viên giới hạn; chất lượng chỉ dùng chọn giữa các phương án phục vụ vé đó. Quy định tuổi chờ của **mọi thành viên** khi hạ nhóm 3/2 người. Phải lấy giao toàn nhóm như [engine.js:26](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/engine.js:26>), không chỉ kiểm tương thích từng cặp.

### 6. QUAN TRỌNG — Sinh mọi nhóm không phù hợp ngân sách 50 ms

- **Mô tả/căn cứ:** ĐX §2.4: 200 vé đã có **64.684.950 tổ hợp bốn người**, chưa tính nhóm 5–8 và nhiều phạm vi. Cache hiện tại chỉ giảm truy vấn: `deck.count()` vẫn lọc tập câu; bộ ghép có chuỗi promise tuần tự: [matchmaking.js:30](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/matchmaking.js:30>), `deck.js:48–56`.
- **Hậu quả:** Tốn CPU, dồn lượt ghép mỗi 2 giây, ảnh hưởng nhận đáp án trên cùng tiến trình; trái mục tiêu tải KH §23.9.
- **Sửa:** Chia nhóm ứng viên theo khối/môn/kiểu; mở rộng nhóm có giới hạn, không liệt kê tổ hợp. Đọc chặn theo lô, nhớ kết quả đếm theo phạm vi chuẩn hoá; gộp yêu cầu ghép để không tích hàng đợi. Tách ngân sách tính ứng viên khỏi thời gian DB/commit và đo cùng tải trả lời thật.

### 7. QUAN TRỌNG — Điều kiện tự vào phòng còn thiếu

- **Mô tả/căn cứ:** ĐX §2.2.1 chưa kiểm độ dài ván và thời lượng; phòng có thể đang bỏ phiếu đổi nội dung. API hiện cho phòng học sinh chọn 20/30/45 giây; người vào giữa vòng không thuộc danh sách bỏ phiếu: [battle.js:21](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/routes/battle.js:21>), `rooms.js:64,105–111,147–149`.
- **Hậu quả:** Học sinh tự vào ván dài hơn dự kiến hoặc cuối cùng chơi ngoài phạm vi đã chấp nhận; vào phòng chưa đồng nghĩa bắt đầu chơi nhanh.
- **Sửa:** Bản đầu chỉ gợi ý phòng **nội dung cố định**, kiểm kiểu, phạm vi, số câu, thời lượng, chỗ trống và chặn với toàn bộ thành viên. Xác nhận một chạm; sau đó kiểm lại trong khoá/hàng lệnh và vẫn giữ bước Sẵn sàng. Theo dõi thời gian **tới lúc bắt đầu ván**, không chỉ tới lúc ghép.

### 8. QUAN TRỌNG — Thành thạo chưa phải thước đo ngang bằng giữa người chơi

- **Mô tả/căn cứ:** ĐX §2.5 nói trung bình theo số câu nhưng chưa xác định số câu kho hay bằng chứng đã luyện. Dữ liệu thực tế theo **Bài × mức nhận thức**, có độ tin cậy và số câu hiệu dụng: [mastery.js:5](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/practice/mastery.js:5>), dòng 10–20; Đấu chỉ dùng M1–M3, `deck.js:18`.
- **Hậu quả:** Trộn mức, dữ liệu ít/cũ hoặc coi “chưa biết” là điểm trung bình có thể ghép lệch; gặp lặp nhóm quen khiến trình độ bị suy đoán. Không lưu thêm không loại bỏ rủi ro này.
- **Sửa:** Bỏ khỏi bản đầu. Nếu bổ sung, chỉ tính phía máy chủ trên cùng phạm vi/M1–M3, xét độ tin cậy; thiếu dữ liệu thì bỏ thành phần điểm đó. Không nhận `level` từ client, không xuất qua DTO/log; tránh ghép lặp và không tạo nhóm trình độ cố định.

### 9. QUAN TRỌNG — Nhóm bạn có lợi thế xã hội mà điểm trung bình không xử lý được

- **Mô tả/căn cứ:** ĐX §2.7 cho nhóm vào FFA hoặc ghép thêm người lẻ; chưa có đồng ý của từng thành viên, quy tắc rời nhóm, thay trưởng nhóm, tạm khoá và vào phòng nguyên tử. Điểm đội hiện lấy trung bình; điều kiện bắt đầu cho phép mỗi đội 1–4 người: [engine.js:13](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/engine.js:13>), dòng 23.
- **Hậu quả:** Nhóm quen có thể phối hợp chống người lẻ trong FFA; trung bình điểm không xoá lợi thế trao đổi hay nguy cơ loại trừ.
- **Sửa:** Để sau. Thử trước nhóm đối nhóm cùng cỡ, không trộn người lẻ mặc định, chưa cho nhóm vào FFA. Mỗi thành viên tự đồng ý và được rời; kiểm toàn bộ quan hệ chặn, khoá mọi thành viên tăng dần, vào cả nhóm hoặc không ai vào.

### 10. QUAN TRỌNG — Danh sách thay đổi kỹ thuật bỏ sót hợp đồng API

- **Mô tả/căn cứ:** ĐX §3 tập trung vào dịch vụ/bảng nhưng API `/match` hiện chỉ nhận một `kind` và `scope`, dùng schema nghiêm ngặt; cấu hình từ chối cờ lạ: `routes/battle.js:87–89`, [config.js:18](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/practice/config.js:18>). DTO hàng chờ vẫn là `kind/scope/offer`, `matchmaking.js:5`.
- **Hậu quả:** Payload mới bị từ chối; frontend không biết phạm vi đang dùng, mức nới hay cấu hình cuối cùng. Chỉ sửa thuật toán chưa tạo thành tính năng dùng được.
- **Sửa:** Chốt schema đầu vào/đầu ra, giới hạn số lựa chọn, cách chọn một bộ `kiểu–phạm vi–số câu`, cờ khả năng và huỷ vé. Đếm đủ **số câu đã chọn**, không giữ ngưỡng 7; tái kiểm lúc bắt đầu bằng `deck.draw()` (`deck.js:57–63`). Bổ sung kiểm thử cạnh tranh huỷ/vào phòng/chặn và DTO, ngoài danh sách test ĐX §3.

## 3. Trả lời sáu câu hỏi mở

1. **Lịch 20/40/60/90:** Có thể làm tham số thí điểm, chưa đủ căn cứ chốt. Dùng mọi môn đã tick ngay; đo trung vị/p90 thời gian bắt đầu và tỷ lệ bỏ chờ. Không suy ETA chỉ từ 20 lượt ghép thành công vì bỏ sót người không ghép được.
2. **Thành thạo ẩn:** Bỏ ở bản đầu; cân nhắc lại khi có bằng chứng chênh lệch ảnh hưởng trải nghiệm.
3. **Đấu bản ghi:** Mặc định tắt, đồng ý riêng; để sau khi hoàn tất thiết kế danh tính, quyền xem, thu hồi và phát lại.
4. **Nhóm bạn:** Có nguy cơ tăng phối hợp áp đảo/loại trừ; thử nhóm đối nhóm cùng cỡ trước.
5. **Tự vào phòng:** Bản đầu hỏi một lần bằng thẻ xác nhận ngắn; tự vào chỉ khi học sinh đã chủ động bật lựa chọn này với cấu hình rõ ràng.
6. **Độ phức tạp:** Quá lớn cho một bản đầu; giữ ghép người thật, nới có giới hạn và gợi ý phòng phù hợp.

## 4. Phạm vi bản đầu theo giá trị / rủi ro

1. **Giữ trước:** Gợi ý phòng phù hợp, vào một chạm; chuyển vé → phòng nguyên tử.
2. **Giữ tiếp:** Nhiều phạm vi chấp nhận ngay, đôi + nhiều người; nới trong trần đã đồng ý, bộ ghép có giới hạn và ưu tiên người chờ lâu.
3. **Giữ đơn giản:** 7 câu, thời lượng hiện tại; thiếu người thì tự luyện hoặc chuyển sang phòng công khai, không chạy hai trạng thái song song.
4. **Bổ sung sau:** Chọn 7/10/15 câu, tự vào phòng theo lựa chọn chủ động, ETA khi đủ dữ liệu.
5. **Để riêng đợt sau:** Thành thạo ẩn → nhóm bạn → đấu bản ghi. Mỗi phần có cờ riêng và tiêu chí nghiệm thu riêng.

## 5. Bảng tổng hợp

| # | Mức | Mục | Vấn đề | Đề xuất |
|---|---|---|---|---|
| 1 | CHẶN | §2.2.3a | Phòng và vé song song | Chuyển trạng thái nguyên tử |
| 2 | CHẶN | §2.6 | Ẩn tên chưa tách danh tính/quyền | Mặc định tắt, tách nguồn, DTO riêng |
| 3 | CHẶN | §2.6, §3 | Thiếu mô hình phát lại | Thiết kế riêng dữ liệu và hẹn giờ |
| 4 | QUAN TRỌNG | §2.1–2.3 | Lịch nới mơ hồ | Phạm vi tăng dần trong trần đồng ý |
| 5 | QUAN TRỌNG | §2.4–2.5 | Điểm không chống bỏ đói | Ưu tiên vé lâu nhất, định nghĩa đủ luật |
| 6 | QUAN TRỌNG | §2.4 | Bùng nổ tổ hợp | Giới hạn ứng viên, gộp vòng ghép |
| 7 | QUAN TRỌNG | §2.2.1 | Tự vào phòng chưa đủ điều kiện | Phòng cố định, xác nhận, kiểm lại |
| 8 | QUAN TRỌNG | §2.5 | Thành thạo dễ bị diễn giải sai | Bỏ khỏi bản đầu |
| 9 | QUAN TRỌNG | §2.7 | Nhóm áp đảo người lẻ | Nhóm cùng cỡ, đồng ý từng người |
| 10 | QUAN TRỌNG | §3 | Thiếu API/DTO/cấu hình | Chốt hợp đồng trước triển khai |

