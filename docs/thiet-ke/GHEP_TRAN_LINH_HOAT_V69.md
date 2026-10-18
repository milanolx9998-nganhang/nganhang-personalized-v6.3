# Ghép trận linh hoạt — đề xuất cho tab "Đấu" (V6.9)

> Tài liệu để phản biện. Bổ sung cho `KE_HOACH_DAU_TRUONG_V69.md` (bản 1.3, mục 8.2). Chủ dự án yêu cầu "cơ chế ghép trận cần linh hoạt hơn".
> Bối cảnh: một trường THCS–THPT, vài trăm học sinh / khối, số người online cùng lúc **thấp và dao động** (tối ở nhà: vài chục người cả trường; trong giờ: gần như 0 trừ phòng lớp). Môn chính KHTN (chia phân môn Lý / Hoá / Sinh), ngoài ra Toán, Văn, Anh… Học sinh lớp 6–12.

## 1. Cơ chế hiện tại (đã code, nhánh `feat-v69-battle`)

- Hàng chờ theo **khối**. Mỗi vé: kiểu (`duel` hoặc `ffa`), một phạm vi (một môn hoặc "bất kỳ", tuỳ chọn phân môn, tuỳ chọn tập Bài / Chương).
- Mỗi khi có người vào hàng: duyệt theo thứ tự chờ lâu nhất, ghép **người đầu tiên tương thích** (first-fit): cùng khối, cùng kiểu, giao phạm vi khác rỗng và đủ ≥ 7 câu, không có quan hệ chặn. Đôi: 2 người. Nhiều người: ≥ 3 người, hoặc 2 người đã chờ > 30 giây.
- Sau 30 giây: **một** lời mời nới phạm vi (Bài → Chương → phân môn → môn), học sinh phải bấm đồng ý. Sau 60 giây: gợi ý tạo phòng công khai hoặc về tự luyện.
- Ván ghép xong luôn là 7 câu, 30 giây / câu.

**Điểm yếu (vì sao chưa đủ linh hoạt):**
1. Ít người online → phần lớn vé **không bao giờ ghép được**; đôi khi có phòng công khai đang chờ phù hợp nhưng hàng chờ không nhìn thấy nó.
2. Kiểu và phạm vi **chỉ chọn được một**; em muốn "Lý hoặc Hoá đều được", "đôi hay nhiều người đều được" thì không khai báo được.
3. Mỗi bước nới phải bấm đồng ý → học sinh rời màn hình là kẹt; trên điện thoại hay bị bỏ lỡ.
4. First-fit theo thời gian chờ không chọn được **cặp hợp nhất** (cùng Bài đẹp hơn cùng môn; trình độ gần nhau đỡ chênh lệch).
5. Không chơi được cùng bạn thân rồi tìm đối thủ chung (nhóm 2–4 người).
6. Không có gì để chơi khi **không ai online**.
7. Số câu / thời gian cố định 7 câu / 30 giây.

## 2. Đề xuất: "vé ghép linh hoạt"

### 2.1 Học sinh khai báo một lần, rõ ràng
Sheet "Tìm đối thủ" có 4 câu hỏi, mặc định thông minh:
| Hỏi | Lựa chọn | Mặc định |
|---|---|---|
| Đấu kiểu gì? | Đôi · Nhiều người · Đội (chọn **nhiều**) | Đôi + Nhiều người |
| Môn nào? | chọn **một hoặc nhiều** môn / phân môn, hoặc "Môn nào cũng được" | môn em luyện gần nhất |
| Phạm vi | Bài cụ thể / Chương / cả môn — kèm **mức linh hoạt**: "Chỉ đúng phần này" · "Mở rộng dần nếu chờ lâu" | Mở rộng dần |
| Độ dài ván | 7 · 10 · 15 câu (chọn nhiều) | 7 + 10 |

"Mở rộng dần" là **sự đồng ý trước**: hệ thống tự nới theo lịch (§2.3) và **thông báo** "Đã mở rộng ra cả Chương II để tìm bạn nhanh hơn", không hỏi lại. Chọn "Chỉ đúng phần này" thì không bao giờ nới.

### 2.2 Nguồn ghép theo thứ tự ưu tiên
1. **Phòng công khai đang chờ phù hợp** (đúng khối, kiểu nằm trong tập em chấp nhận, phạm vi phòng nằm trong phạm vi hiện tại của em, còn chỗ, không quan hệ chặn) → tự vào phòng đó. Giải quyết "có phòng mà hàng chờ không thấy".
2. **Vé khác** trong hàng chờ → tạo phòng mới (§2.4 chọn nhóm tốt nhất).
3. **Không ai phù hợp sau mốc cuối** → đề nghị 3 lối thoát, học sinh chọn: (a) mở phòng công khai chờ người đến (phòng hiện ở sảnh, vé tiếp tục chạy song song), (b) **đấu với bản ghi** (§2.6), (c) về tự luyện phần đó.

### 2.3 Lịch nới tự động (chỉ với "Mở rộng dần")
| Đã chờ | Phạm vi được dùng để ghép |
|---|---|
| 0–20 s | đúng phạm vi em chọn |
| 20–40 s | cả Chương chứa các Bài đó |
| 40–60 s | cả phân môn (KHTN) / cả môn |
| 60–90 s | các môn khác em đã tick (nếu có) |
| > 90 s | đề nghị lối thoát §2.2.3 |
Kiểu đấu và độ dài ván **không** tự nới ngoài tập em đã chọn. Mốc thời gian là tham số cấu hình (quản trị chỉnh theo số người thật).

### 2.4 Chọn nhóm tốt nhất thay vì first-fit
Mỗi vòng ghép (chạy mỗi 2 giây khi hàng chờ có ≥ 2 vé, và ngay khi có vé mới):
- Sinh các nhóm ứng viên hợp lệ (cùng khối, kiểu chung, độ dài ván chung, phạm vi chung khác rỗng và **đủ câu**, không chặn).
- Chấm điểm nhóm: `điểm = 40·độ cụ thể phạm vi chung (Bài 1.0 · Chương 0.7 · phân môn 0.4 · môn 0.2) + 30·độ gần trình độ (§2.5) + 30·thưởng chờ (người chờ lâu nhất trong nhóm, bão hoà ở 60 s)`.
- Chọn tham lam nhóm điểm cao nhất, loại thành viên khỏi các nhóm khác, lặp lại. Giới hạn: tối đa 200 vé / khối, vòng ghép ≤ 50 ms.
- Nhiều người: ưu tiên nhóm 4–8; nhóm 3 chấp nhận sau 20 s, nhóm 2 sau 40 s (thành đấu đôi nếu cả hai chấp nhận đôi).

### 2.5 Trình độ gần nhau (ẩn, chỉ để ghép)
- Ước lượng trình độ theo **môn** từ điểm thành thạo hiện có (`mastery_states`, trung bình theo số câu của các Bài trong phạm vi chung); chưa có dữ liệu → trung tính.
- Chỉ dùng như **một thành phần điểm**, không phải điều kiện cứng; trọng số giảm dần theo thời gian chờ (sau 40 s gần như bỏ qua).
- Không hiển thị cho ai, không lưu thêm; không dùng kết quả ván đấu (giữ nguyên tắc ván đấu không ảnh hưởng thành thạo và ngược lại không tạo "hạng").

### 2.6 Đấu với bản ghi (khi không ai online)
- Bản ghi = một ván đã kết thúc trong 30 ngày gần đây, **cùng khối, cùng phạm vi**, của một học sinh khác (đã đồng ý cho dùng bản ghi — mặc định bật, tắt được trong cài đặt của em).
- Em chơi **đúng bộ câu đó**; "đối thủ" phát lại câu trả lời và thời điểm trả lời đã lưu (`battle_answers.response`, `ms`). Hiển thị "Đối thủ ghi sẵn · lớp 9" — **không hiện tên**.
- Không có SSE nhiều người; vẫn dùng cùng máy trạng thái phòng (đối thủ là người chơi ảo, không bị chặn / báo cáo). Kết quả lưu như ván thường, nhãn "Đấu với bản ghi"; không ảnh hưởng gì tới người có bản ghi.
- Chống lạm dụng: một bản ghi dùng tối đa 20 lần; không chọn bản ghi của người em đã chặn hoặc chặn em.

### 2.7 Nhóm bạn (party)
- Một bạn tạo "Nhóm" (mã 6 số riêng, không phải mã phòng), 2–4 bạn cùng khối vào nhóm, trưởng nhóm bấm "Tìm đối thủ cho nhóm".
- Nhóm vào hàng chờ như **một vé nhiều người**: kiểu Đội (gặp nhóm khác cùng cỡ ±1 hoặc được ghép thêm người lẻ cho đủ) hoặc Nhiều người (cả nhóm vào cùng một phòng FFA).
- Nhóm không bị tách. Quan hệ chặn của bất kỳ thành viên nào đều áp dụng cho cả nhóm.

### 2.8 Hiển thị cho học sinh
- Màn chờ: "Đang tìm · 12 bạn khối 9 đang tìm trận · thường mất khoảng 25 giây" (ước lượng từ 20 lần ghép gần nhất của khối). Huỷ được mọi lúc.
- Khi nới: dòng thông báo nhẹ, không hộp thoại.
- Sảnh: số người đang tìm theo môn (đã có) + "Phòng đang chờ khớp với em" lên đầu danh sách.

### 2.9 Ràng buộc giữ nguyên
Cùng trường, cùng khối; chặn hai chiều; tạm khoá; một phòng / một vé mỗi học sinh; đủ câu theo điều kiện §10.3 kế hoạch chính; cờ khả năng (`matchmaking`, `ffa`, `team`, thêm `ghost`, `party`); không lộ trình độ.

## 3. Thay đổi kỹ thuật dự kiến
- `matchmaking.js`: vé mới `{kinds[], subjects[]/scopes[], flex:'strict'|'gradual', lengths[], party_id?, level?}`; vòng ghép định kỳ 2 s; chấm điểm nhóm; quét phòng công khai trước; lịch nới theo thời gian; ước lượng thời gian chờ.
- Bảng mới: `battle_parties(id, code, leader_id, grade, created_at, status)`, `battle_party_members(party_id, user_id)`; cột `battle_rooms.ghost_of uuid NULL`, `battle_players.is_ghost boolean`; cài đặt riêng học sinh `battle_ghost_opt_out`.
- `rooms.js`: người chơi ảo phát lại câu trả lời theo `ms` (hẹn giờ trong hàng lệnh phòng, cùng cơ chế `schedule_version`).
- Cờ khả năng thêm: `ghost`, `party`.
- Test: chấm điểm nhóm, lịch nới, ưu tiên phòng công khai, nhóm không bị tách, bản ghi không lộ tên / không dùng bản ghi của người chặn, giới hạn 20 lần.

## 4. Câu hỏi mở cho người phản biện
1. Lịch nới 20/40/60/90 giây có hợp với trường vài chục người online buổi tối?
2. Dùng điểm thành thạo để cân trình độ có rủi ro gì (học sinh yếu luôn gặp nhau, "đoán" được trình độ bạn)? Có nên bỏ hẳn?
3. "Đấu với bản ghi" có vấn đề quyền riêng tư / sư phạm không (dùng câu trả lời của bạn khác dù ẩn tên)? Đồng ý mặc định bật hay mặc định tắt?
4. Nhóm bạn có làm tăng bắt nạt / loại trừ (nhóm "mạnh" ép bạn lẻ)?
5. Tự vào phòng công khai đang chờ có nên hỏi xác nhận không?
6. Độ phức tạp có quá mức cho bản đầu? Nếu cắt, giữ phần nào trước?
