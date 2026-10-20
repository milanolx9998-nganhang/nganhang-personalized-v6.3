**Kế hoạch 1.0 chưa đủ chặt để giao triển khai backend.** Ba trục cấu hình hợp lý, nhưng Tự chơi làm thay đổi máy trạng thái, quyền công bố câu hỏi và cách lưu kết quả. Đây là thay đổi lớn hơn việc thêm nhánh trong `rooms.js`.

Em đã đối chiếu tài liệu với mã tại HEAD `8da8b84`, nhánh `feat-v69-battle`; không xác minh trạng thái máy triển khai. Không sửa file, không chạy migration hoặc bộ kiểm thử; các nhận xét dưới đây dựa trên đọc mã và kiểm tra phép tính.

**Blocker B1 — Thiếu trạng thái bền vững cho từng người; chưa bảo đảm `answer`/`next` idempotent.**

Kế hoạch đề xuất `cursor`, `opened_at`, `deadline` riêng, nhưng migration chỉ bổ sung cấu hình phòng và điểm đáp án. Hiện `storage.save()` không lưu tiến độ từng người; `load()` dựng lại `index` từ `asked_count` chung. [Kế hoạch:79–84](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/docs/thiet-ke/CHE_DO_CHOI_V693.md:79>), [storage.js:17–40](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/storage.js:17>).

Đề xuất chốt trước:

- Trạng thái người chơi gồm `cursor`, `phase: question|feedback|done`, số câu đã phát, thời điểm mở/hạn chót, thời gian dừng và phiên bản tiến độ. Người máy cần trạng thái tương đương.
- Tách **phiên bản lịch phòng** khỏi **phiên bản tiến độ người chơi**. A sang câu không được vô hiệu hóa timeout của B. Lệnh nội bộ mang danh tính người chơi, câu, phiên bản người chơi và phiên bản phòng.
- Giao dịch nộp câu ghi **đáp án + điểm + trạng thái sau chấm**; commit xong mới cập nhật RAM và ACK. Giao dịch mở câu ghi tiến độ trước khi trả nội dung.
- Giữ nguyên nguyên tắc **tra biên nhận trước kiểm tra pha**. Cùng `(room, người, câu, client_id)` trả lại kết quả đã lưu; khác `client_id` vẫn 409. Không chấm lại bằng cấu hình mới khi gửi lại.
- `next` phải mang `expected_cursor` hoặc mã lượt câu. Hai tab, double-click hoặc auto-next đua với nút bấm chỉ được tiến **một lần**. API hiện tại nhận `next {}` không đủ cho Tự chơi.

Căn cứ hành vi hiện có: [rooms.js:160–172](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/rooms.js:160>), [rooms.js:199–201](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/rooms.js:199>).

**Restart tiếp tục → `interrupted`, không tự tiếp tục ván.** Đó là hành vi thật của `recover()`. Lưu tiến độ để đọc đúng lịch sử và phục hồi biên nhận, không đồng nghĩa khôi phục timer. Nếu muốn tiếp tục ván sau restart, phải coi là yêu cầu mới. [storage.js:45](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/storage.js:45>).

---

**Blocker B2 — Sửa DTO đang chơi chưa đủ: kết quả, lịch sử và Luyện lại có thể lộ câu chưa phát cho cá nhân.**

Hiện kết quả công bố `questions.slice(0, room.asked_count)`. Với Tự chơi, A đến câu 10 nhưng B mới đến câu 2; dùng số câu chung sẽ gửi cho B câu 3–10 cùng đáp án khi hết giờ hoặc restart. [dto.js:47–51](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/dto.js:47>).

Lỗ hổng mở rộng còn nằm ở ba chỗ:

- Route `retry-wrong` chọn câu theo `room.asked_count`. [battle.js:91–94](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/routes/battle.js:91>)
- `createAttempt()` tự truy vấn lại cùng điều kiện; chỉ sửa route sẽ gây lệch danh sách hoặc vẫn sai quyền. [attempts.js:47–53](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/practice/attempts.js:47>)
- “Câu cần xem lại” cũng coi mọi câu dưới `asked_count` chưa trả lời là câu sai. [portfolio.js:72–75](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/practice/portfolio.js:72>)

**Đề xuất:** định nghĩa một quy tắc dùng chung: `đã_phát_cho(người, câu)`. Với cùng thứ tự, không quay lại câu, có thể lưu `issued_count` từng người; nếu sau này đảo câu hoặc làm lại thì cần bản ghi lượt phát riêng.

Mọi đường đọc HTTP/SSE, kết quả, lịch sử, Luyện lại và danh sách ôn sai phải áp quy tắc này. `terminal=true` chỉ cho phép xem lại **câu đã phát cho mình**, không mở toàn bộ deck. Điều này kế thừa đúng bất biến §23.5. [Kế hoạch V69:584–587](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/docs/thiet-ke/KE_HOACH_DAU_TRUONG_V69.md:584>).

---

**Blocker B3 — Bảng trực tiếp và màn chiếu đang mâu thuẫn với yêu cầu chống lộ thông tin.**

Kế hoạch vừa yêu cầu không lộ `distribution`, vừa cho xem điểm và số câu đã làm theo người, cùng lưới xanh/đỏ từng câu trên màn chiếu. [Kế hoạch:73–82](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/docs/thiet-ke/CHE_DO_CHOI_V693.md:73>), [Kế hoạch:100–102](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/docs/thiet-ke/CHE_DO_CHOI_V693.md:100>).

Cần phân biệt:

- Không gửi `answer` là chống **rò rỉ trực tiếp**.
- Điểm tăng cùng số câu đã làm có thể tiết lộ một bạn vừa đúng/sai câu nào; lưới xanh/đỏ công bố điều đó trực tiếp.
- Cho người làm nhanh xem ngay lời giải thì không thể bảo đảm họ không chuyển đáp án cho người chậm. DTO không giải quyết được việc này.

**Đề xuất chốt hai chính sách:**

1. **Ôn tập có phản hồi ngay:** chấp nhận khả năng chia sẻ đáp án giữa học sinh; bảng công khai chỉ hiện tiến độ hoặc thông tin đã được phép công bố.
2. **Thi đua cần giữ kín:** hoãn đáp án/lời giải đến khi mọi người đã khóa câu tương ứng hoặc ván kết thúc; vẫn không gửi câu chưa phát cho từng người.

Tách **bảng chi tiết riêng của giáo viên** và **DTO màn chiếu**. Màn chiếu mặc định chỉ hiện tiến độ, không lưới đúng/sai khi còn người chưa làm. `show_live_board=false` phải loại dữ liệu khỏi payload, không chỉ ẩn bằng CSS.

Nếu giữ bảng điểm chính xác theo thời gian thực, tài liệu phải thừa nhận suy luận qua chênh lệch điểm; không được tuyên bố đã loại mọi rò rỉ.

---

**Blocker B4 — `time_limit: total` chưa có hợp đồng thời gian và kết thúc rõ ràng.**

Hiện `started_at` được đặt khi bắt đầu **đếm ngược**, còn câu đầu mở sau đó. Áp nguyên văn `ends_at = started_at + total_minutes` sẽ trừ cả 3 giây, hoặc thời gian countdown cấu hình, khỏi thời gian làm bài. [rooms.js:90–98](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/rooms.js:90>).

Ngoài ra, phòng cũ nhận đáp án đến `deadline + 500 ms`; kế hoạch chưa nói giới hạn tổng có khoảng đệm này không. [rooms.js:72–75](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/rooms.js:72>).

**Đề xuất đặc tả:**

- Có `play_started_at` khi thực sự mở lượt chơi; `ends_at` tính từ đó.
- Giới hạn tổng dùng hạn cứng theo máy chủ; nếu muốn thêm grace phải ghi thành quy tắc riêng. Giữ nguyên grace của phòng cũ.
- Ghi giờ nhận request trước hàng lệnh như hiện tại. Đáp án xếp trước lệnh đóng, có giờ nhận hợp lệ, được tính dù commit hoàn tất sau hạn.
- `answer`, `next`, bot và auto-next đều kiểm tra hạn; không phụ thuộc riêng callback timer. Timer chạy trễ không được mở thêm câu.
- Kết thúc giữa câu: lưu trạng thái **đã phát nhưng chưa nộp**, điểm 0; phân biệt với **chưa phát**. Câu chưa phát không vào danh sách sai.
- Không tự chấm bản nháp trên trình duyệt vì backend hiện không lưu bản nháp.
- Quy định pause có dừng đồng hồ tổng không. Nếu có, dịch `ends_at` và trừ pause khỏi thời gian thưởng của từng câu.
- Trình duyệt hiển thị từ `server_now` và hạn máy chủ, hiệu chỉnh sau reconnect; không dùng giờ máy học sinh để chấm.

Cách đóng vẫn phải đi qua hàng lệnh phòng, không sửa trực tiếp trạng thái từ timer. [Kế hoạch V69:550–567](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/docs/thiet-ke/KE_HOACH_DAU_TRUONG_V69.md:550>).

---

**Blocker B5 — Luật Nhanh tay hiện có điểm bất liên tục và chưa chốt cách quyết toán.**

Theo đúng công thức trong kế hoạch, với câu 30 giây:

| Chốt đúng tại | Điểm trước thưởng nhanh nhất |
|---|---:|
| 1.499 ms | 600 |
| 1.500 ms | 980 |
| 2.000 ms | 973 |
| 30.000 ms | 600 |

Chậm thêm 1 ms được thêm 380 điểm. Người đoán chỉ cần chờ qua ngưỡng; người biết đáp án và trả lời nhanh lại bị thiệt. Hơn nữa, điều kiện +100 hiện chỉ yêu cầu đúng hoàn toàn sớm nhất: lượt dưới 1,5 giây vẫn có thể nhận thưởng này. [Kế hoạch:55–61](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/docs/thiet-ke/CHE_DO_CHOI_V693.md:55>).

**Đề xuất:**

- Bỏ tên gọi “chống đoán bừa” cho ngưỡng này. Ưu tiên đường điểm liên tục, có mức thưởng tối đa; dùng thời gian quá ngắn làm tín hiệu bất thường. Nếu vẫn giữ ngưỡng cứng, phải chốt cả điều kiện +100 và chấp nhận bước nhảy điểm.
- `ms` dùng thời điểm nhận trên máy chủ, không dùng timestamp client, thời điểm commit hay thứ tự truy vấn DB hoàn tất.
- +100 chỉ quyết toán khi đóng câu; ghi người thắng, điểm thưởng và trạng thái đã quyết toán trong cùng giao dịch chuyển sang reveal. Gửi lại hoặc callback cũ không cộng lần hai.
- Nếu giáo viên kết thúc giữa câu, hoặc restart trước reveal, phải định nghĩa có trao +100 không. Khuyến nghị: chỉ trao khi câu được đóng hợp lệ; interrupted không phát sinh thưởng mới.
- Lưu quy tắc làm tròn rõ ràng, ví dụ `round(score × (600 + bonus))`; lưu riêng điểm cơ bản, tốc độ và nhanh nhất để giải thích kết quả.

**Không thể gọi đây là công bằng tuyệt đối về tốc độ.** Thời gian máy chủ quan sát gồm truyền đề, render và đường gửi đáp án. Hiện `opened_at` còn được đặt trước khi commit việc mở câu, nên thời gian lưu cũng tiêu hao thời gian trả lời. [rooms.js:61](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/rooms.js:61>), [rooms.js:74–77](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/rooms.js:74>).

Không nên bù bằng “thời gian làm bài” do client khai. Với phòng lớp, có thể thay +100 bằng huy hiệu hoặc xét đồng hạng trong một khoảng dung sai cấu hình sau khi đo mạng thực tế.

Tài liệu Wayground được cung cấp xác nhận khoảng **600 + 0–400**, nhưng không xác nhận công thức tuyến tính, +100 hay ngưỡng 1,5 giây. Đó là luật riêng cần tự chịu trách nhiệm thiết kế. [wayground-tong-hop.md:211–218](<C:/Users/Duong Hieu/Downloads/wayground-tong-hop.md:211>).

---

**Blocker B6 — “Rank chỉ sync + accuracy” cần chặn ở nơi quyết toán; giữ matchmaking cũ chưa đủ.**

`ratings.settle()` hiện kiểm tra metadata, trạng thái kết thúc và nguồn tạo phòng, chưa kiểm tra ba trục mới. `begin()` còn có nhánh tính rank cho phòng tự tạo khi quản trị bật cấu hình. [ratings.js:28–32](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/ratings.js:28>), [rooms.js:90–95](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/rooms.js:90>).

Đồng thời, bộ ghép gợi ý phòng công khai qua `roomFits()`, hàm này chưa biết pacing/scoring/time limit. Người vào hàng ghép cũ vẫn có thể được dẫn sang phòng Tự chơi. [matchmaking.js:74–76](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/matchmaking.js:74>), [flex.js:51–55](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/flex.js:51>).

**Đề xuất:**

- Hàm chung xác định đủ điều kiện rank; kiểm tra ở tạo/bắt đầu phòng **và ngay đầu `settle()` trước mọi ghi rating**.
- Tổ hợp khác phải tắt cả `rank_enabled` và lựa chọn rank từng người; trả lý do rõ trong DTO.
- Bổ sung điều kiện ba trục vào gợi ý phòng và kiểm tra lại lúc `accept-room`.
- Chuẩn hóa mặc định tại tầng tạo phòng chung, vì matchmaking gọi trực tiếp `createUnlocked()`, bỏ qua schema route.
- Giữ nguyên đồng hạng và luật người rời/mất mạng của V6.9.2. Không để tie-break bằng thời gian của Nhanh tay lọt sang rank.

Luật bỏ trận đã chốt nằm tại [GHEP_TRAN_CHOT_V69.md:115–117](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/docs/thiet-ke/GHEP_TRAN_CHOT_V69.md:115>).

---

**Blocker B7 — Migration v693 dự kiến thiếu dữ liệu; additive chưa đồng nghĩa không hồi quy.**

Ngoài thiếu tiến độ ở B1, migration đang bỏ sót **điểm người máy**: bot dùng `battle_bot_answers`, không dùng `battle_answers`. [migration-v691:15–20](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/db/migration-v691-battle-flex.sql:15>).

**Đề xuất bổ sung thiết kế migration:**

- Cấu hình phòng có mặc định tương thích `sync/accuracy/per_question`; CHECK enum và CHECK tổ hợp `total/self/total_minutes`.
- Trạng thái phát câu từng người, các mốc thời gian cần đọc lại, dữ liệu điểm và quyết toán thưởng cho cả người thật/máy.
- Chụp cố định phiên bản luật và tham số tính điểm khi bắt đầu ván. `rules_version` đã tồn tại nhưng hiện mặc định `'1.3'`; cần được gán đúng cho ván mới. [migration-v69:10–12](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/db/migration-v69-battle.sql:10>)
- Điểm mới của đáp án lịch sử nên để `NULL`, đọc theo luật cũ `score × 100`; **không default 0** rồi làm lịch sử cũ mất điểm. Không sửa ý nghĩa cột `score` hiện là độ đúng 0–1.
- Không đổi PK/FK hiện hữu; thêm cấu trúc mới khi cần.
- Hồi quy cả đọc lịch sử cũ sau migration, tạo phòng không gửi trường mới, bot, đội, rematch và rank. Route rematch hiện sao chép danh sách cấu hình cố định nên sẽ bỏ mất trục mới nếu không sửa. [battle.js:85–89](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/routes/battle.js:85>)

Cần nói đúng giới hạn triển khai: **giữ luật phòng cũ** làm được; **giữ ván đang chạy xuyên restart** thì trái cơ chế `recover()` hiện tại. Nên ngừng nhận ván mới, đợi ván đang chơi kết thúc rồi triển khai. Bản mã cũ cũng không tự hiểu được lịch sử Tự chơi chỉ vì migration là additive.

---

**Blocker B8 — Redemption chưa thể đưa vào phạm vi với mô hình đáp án hiện tại.**

Kế hoạch “mặc định tắt” nhưng vẫn có tùy chọn UI và yêu cầu test, nghĩa là tính năng vẫn nằm trong phạm vi. Trong khi PK `(room_id, idx, user_id)` chỉ cho một đáp án mỗi câu. [Kế hoạch:74](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/docs/thiet-ke/CHE_DO_CHOI_V693.md:74>), [migration-v69:35–40](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/db/migration-v69-battle.sql:35>).

Chưa rõ “50% điểm câu đó” là 50% mức tối đa, điểm theo tốc độ lần hai, hay bù đến mức 50%. Lần đầu đúng 75% rồi làm lại đúng có được vượt 100% không? Làm lại có đổi accuracy, thống kê bot và danh sách sai không?

**Đề xuất bỏ Redemption khỏi V6.9.3**, ẩn tùy chọn và từ chối `redemption:true` ở backend. Đợt sau dùng bảng lượt làm lại riêng, giữ nguyên đáp án đầu và chốt quy tắc tổng hợp. “Tắt mặc định” chưa phải biện pháp ngăn một tính năng chưa hoàn chỉnh được sử dụng.

---

**Nên sửa S1 — 40 timer không phải vấn đề chính; chọn lịch đơn giản và đo chi phí giao dịch/SSE.**

Với lớp 40 học sinh:

- Timer từng người, mỗi người một timer đang hiệu lực: khoảng **40 timer gameplay**, không phải `40 × 15 = 600`.
- Tick quét mỗi giây: ít timer nhưng việc chuyển câu có thể trễ gần một giây, chưa tính hàng lệnh; phải tránh dồn lệnh quét khi DB chậm.
- **Khuyến nghị:** một timer gameplay cho mỗi phòng, hẹn đến sự kiện gần nhất trong deadline, auto-next, bot và hạn tổng. Với 40–50 người, quét danh sách trong RAM để tìm hạn gần nhất là thiết kế dễ kiểm soát. Callback chỉ đưa lệnh vào hàng phòng.

Mỗi lần xử lý phải đọc lại trạng thái, kiểm tra phiên bản, xử lý sự kiện đến hạn rồi đặt lịch mới. Không dùng vòng quét để ghi DB khi không có chuyển trạng thái.

Trần “một timer/người” trong nghiệm thu nên ghi rõ là **timer gameplay**: SSE hiện còn có heartbeat, hết hạn token và timer gộp. [rooms.js:38–55](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/rooms.js:38>), [stream.js:9–26](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/stream.js:9>).

Đáng đo hơn số timer là: `store.save()` upsert toàn bộ người chơi mỗi lần chuyển trạng thái. Nếu dùng nguyên cách này cho từng lượt `next`, phòng 40 người sẽ liên tục ghi lại cả lớp. Nên cập nhật hàng tiến độ người vừa thay đổi; timeout đồng loạt có thể ghi theo lô. [storage.js:20–26](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/storage.js:20>).

---

**Nên sửa S2 — Gộp SSE 250 ms không đáp ứng giới hạn bảng 1 lần/giây; bot cần sửa lịch pause.**

`stream.publish()` hiện gộp 250 ms, tức vẫn có thể phát khoảng 4 đợt/giây. Việc ghi “đã có coalesce” chưa bảo đảm yêu cầu bảng trực tiếp 1 Hz. [stream.js:24–26](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/stream.js:24>).

Đề xuất tách cập nhật riêng của người chơi khỏi bảng công khai: ACK/câu tiếp phản hồi ngay; bảng được giới hạn 1 Hz. Có phiên bản trạng thái để snapshot cũ không ghi đè phản hồi HTTP mới. Không phát sảnh sau mỗi đáp án.

Bot hiện lấy câu bằng `room.index`; phải chuyển sang câu của bot. Đồng thời timer bot hiện tính `opened_at + delay`, trong khi resume chỉ tăng `paused_ms`: sau pause dài bot có thể trả lời ngay khi tiếp tục. Cần hẹn theo thời gian hoạt động còn lại của bot. [bots.js:25](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/bots.js:25>), [rooms.js:43–44](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/rooms.js:43>), [rooms.js:198](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/rooms.js:198>).

---

**Nên sửa S3 — Accuracy, chấm từng phần và hòa điểm cần định nghĩa toán học riêng.**

`correct` hiện là số câu đúng hoàn toàn, không phải tổng điểm từng phần. Ví dụ hai câu Đ/S đúng một nửa cho tổng độ đúng bằng một câu, nhưng `correct=0`. [engine.js:6–11](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/engine.js:6>).

Đề xuất trả riêng:

- `accuracy_sum = Σ score`;
- số câu đúng hoàn toàn;
- số câu đã nộp, đã phát, tổng số câu;
- điểm game.

Với Thi theo phút, phải công bố mẫu số: đúng 1/1 câu đã làm khác hoàn toàn đúng 1/15 câu của ván. Không nên chỉ hiện “100%” mà thiếu độ phủ.

Chấm từng phần theo công thức đề xuất có thể khiến đúng 75% rất nhanh được khoảng 735 điểm, vượt đúng hoàn toàn chậm được 600. Điều này có thể phù hợp trò chơi, nhưng không phải thứ tự đánh giá năng lực GDPT 2018. Giữ điểm game tách khỏi mastery và điểm học tập.

Đối với hòa điểm:

- `accuracy` cũ giữ nguyên đồng hạng theo tổng điểm.
- `speed` phải chốt comparator duy nhất. Khuyến nghị hòa điểm game rồi hòa độ đúng thì đồng hạng; bỏ tổng `ms` khỏi tie-break vì bỏ qua, hết giờ và câu chưa nộp hiện không có thời gian tương đương.
- Dùng thời hạn theo loại câu đã chụp trong `battle_questions.seconds`; hiện Đ/S, TLN, GN có hệ số 1,5. Không vô tình dùng 30 giây cho mọi loại trong chế độ tổng. [deck.js:73](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/deck.js:73>).

---

**Nên sửa S4 — Mục 6: điều khiển ván và duyệt phòng là hai chức năng độc lập.**

(A) là quyền điều khiển sau khi có phòng; (B) là quy trình cho phép phòng được hoạt động. B không nên mô tả như một tùy chọn nhỏ của A. [Kế hoạch:86–91](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/docs/thiet-ke/CHE_DO_CHOI_V693.md:86>).

Khuyến nghị V6.9.3 làm A. Nếu làm B, phải bổ sung:

- Giáo viên nào được duyệt: theo lớp/môn/phân công nào; phòng nhiều lớp thuộc ai.
- Trạng thái duyệt, người duyệt, thời hạn, lý do từ chối và phiên bản cấu hình được duyệt.
- Sửa phạm vi/cách chơi sau duyệt phải làm mất hiệu lực duyệt.
- Chặn cả start thủ công, tự start phòng công khai, ghép vào phòng và rematch; chỉ ẩn nút là không đủ.
- Quy định phòng chờ duyệt có chiếm quyền “mỗi học sinh một phòng” không; có hạn tự hủy.
- Khung giờ dùng giờ máy chủ, múi giờ và lịch học xác định.

Hiện giáo viên được kiểm tra đúng lớp/môn lúc mở phòng lớp; phòng học sinh lại không có `class_id` theo cách đó. Không thể tái sử dụng quyền duyệt bằng một phép kiểm tra `role==='teacher'`. [battle.js:27–38](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/routes/battle.js:27>), [rooms.js:130](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/rooms.js:130>).

---

**Nên sửa S5 — Mục 9: giữ ngoài phạm vi; phòng khách cần danh tính và quyền riêng.**

Hướng “giáo viên mở, bộ câu chọn sẵn” là hợp lý, nhưng lọc tên và tự đóng sau hai giờ chưa đủ. Mô hình hiện tại dùng người thật có FK tới `users`, còn bot đã phải có bảng riêng. [migration-v69:18–23](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/db/migration-v69-battle.sql:18>), [Kế hoạch:106–108](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/docs/thiet-ke/CHE_DO_CHOI_V693.md:106>).

Đề xuất cho đợt thiết kế riêng:

- Danh tính khách bằng mã ngẫu nhiên và token giới hạn đúng phòng; không giả thành tài khoản học sinh.
- Mã sáu số chỉ dùng tìm phòng, không thay quyền truy cập.
- Giáo viên duyệt vào/kick/khóa nhận khách; giới hạn thử mã, số khách và số luồng.
- Bộ câu được phép chia sẻ là snapshot riêng; khách không truy cập sảnh trường, rank, hồ sơ, Luyện lại hoặc API ngân hàng.
- Màn khách không lộ tên/lớp và dữ liệu tiến độ chi tiết của học sinh nội bộ.
- Quy định thời gian giữ tên hiển thị, câu trả lời và log. Không hứa “không lưu dữ liệu cá nhân” trong khi vẫn nhận tên và vận hành nhật ký.

---

**Nên sửa S6 — Bổ sung ca nghiệm thu theo tranh chấp trạng thái, không chỉ theo màn hình.**

Danh sách hiện tại có luồng chính nhưng thiếu các ca quyết định độ an toàn. [Kế hoạch:114–120](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/docs/thiet-ke/CHE_DO_CHOI_V693.md:114>).

Tối thiểu cần:

- Hai tab gửi cùng/khác `client_id`; gửi lại sau timeout, hết ván và restart.
- DB commit thành công nhưng mất ACK; DB lỗi khi mở câu hoặc quyết toán +100.
- A chuyển câu liên tục trong khi timeout B vẫn đúng.
- `answer/next/pause/end` tranh chấp với hạn câu và hạn tổng.
- Máy chủ trễ callback; giờ client lệch; reconnect khi đang feedback/done.
- A tới câu 10, B tới câu 2: kiểm tra toàn bộ JSON của SSE, kết quả, lịch sử, retry và portfolio.
- Phòng speed/self mang metadata rank sai vẫn không ghi LP, MMR hoặc tăng số ván.
- Người chơi rời, mất mạng, bị tạm khóa; kill switch dọn sạch timer và chỗ trong phòng.
- Hồi quy V69/V691/V692 với payload cũ và dữ liệu lịch sử cũ.

Tải 40 × 15 là một ca bổ sung, không thay ngưỡng đã chốt: 300 học sinh, phòng 50 người nộp đồng loạt, reconnect, p95/p99 và ảnh hưởng tới tự luyện. [Kế hoạch V69:609–618](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/docs/thiet-ke/KE_HOACH_DAU_TRUONG_V69.md:609>).

---

**Nên sửa S7 — Thứ tự triển khai và ước lượng cần phản ánh phạm vi thật.**

Đề xuất thứ tự:

1. Chốt trạng thái từng người, quyền công bố, đồng hồ tổng và công thức điểm.
2. Chốt schema/DTO, phiên bản luật và các ca hồi quy cũ.
3. Làm `self + accuracy + per_question`, gồm reconnect, restart, lịch sử và Luyện lại.
4. Thêm thời gian tổng, kết thúc sớm, pause và bot lệch nhịp.
5. Thêm speed, quyết toán nhanh nhất và lớp chặn rank.
6. Tích hợp bảng giáo viên/màn chiếu, UI, đo tải và kiểm thử toàn hành trình.

Ước lượng kỹ thuật sơ bộ, với **A, không B, không khách, không Redemption**:

| Phần việc | Ngày công |
|---|---:|
| Backend, migration, hợp đồng API và test | 10–15 |
| React, màn chiếu, reconnect và đồng hồ | 4–6 |
| Tích hợp, hồi quy, tải, sửa lỗi | 3–5 |
| **Tổng** | **17–26** |

Đây là ngày công, không phải lịch cam kết. Dự kiến khoảng **20–35 tệp** gồm mã và test. Phạm vi vượt tám service battle vì còn `flex`, cấu hình, grading/deck liên quan, routes và hai service tự luyện. Có thể ra từng phần bằng cờ tính năng; không nên bật đồng thời mọi tổ hợp ngay sau khi các luồng đơn lẻ chạy được.

---

**Câu hỏi Q1 — “Giáo viên duyệt” chính xác là gì?**

Điều khiển ván, duyệt học sinh vào phòng, hay duyệt phòng học sinh tạo? Đây là ba quy trình khác nhau. **Đề xuất V6.9.3 chỉ làm điều khiển ván**, thiết kế hai loại duyệt riêng nếu cần.

**Câu hỏi Q2 — Tự chơi ưu tiên phản hồi học tập ngay hay giữ kín để thi đua?**

Hiện kế hoạch muốn cả hai nhưng chưa xử lý xung đột. **Đề xuất mặc định ôn tập có phản hồi ngay**, ghi rõ giới hạn chống chia sẻ đáp án; chế độ cần giữ kín phải hoãn lời giải và hạn chế bảng công khai.

**Câu hỏi Q3 — Thi theo phút có tính cả thời gian đọc lời giải, và có dừng khi giáo viên pause không?**

Auto-next sau 3 giây chiếm khoảng 42 giây giữa 15 câu nếu không bấm chuyển sớm, đáng kể trong ván 3 phút. **Đề xuất cho bấm tiếp ngay sau ACK; pause của giáo viên dừng đồng hồ chung; tách “chưa nộp” khỏi “chưa được phát”.**

**Câu hỏi Q4 — V6.9.3 có hỗ trợ Tự chơi theo đội không?**

Bảng tổ hợp ghi “phòng học sinh” nhưng chưa nói rõ `team`; engine hiện tính trung bình đội và giữ cả người đã rời trong mẫu số. **Đề xuất bản đầu chỉ bật self cho `duel/ffa/class`, giữ team ở luật cũ**, hoặc bổ sung đặc tả kết thúc đội, bảng đội và người rời trước khi triển khai. [engine.js:13–15](<C:/Users/Duong Hieu/Desktop/ngan hang cau hoi/nganhang-personalized-v6.3/backend/src/services/battle/engine.js:13>).

