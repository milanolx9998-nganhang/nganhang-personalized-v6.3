# Rà soát backend V6.9.3 — 21/10/2026

Đối chiếu mã local tại `0051f12` (kế thừa `4b8e461`, `66ebbf7`) với Phụ lục 1.1, 1.2 của `CHE_DO_CHOI_V693.md` và `V693_CODEX_PHAN_BIEN.md`. Phụ lục 1.2 thắng 1.1; quyết định đã duyệt ở `66ebbf7` cho phép phút nguyên 1–90. Không xác minh web thật hoặc CI vì phiên này không truy cập mạng ngoài.

## Kết luận đối chiếu

| Mục | Trạng thái và bằng chứng trong mã/test |
|---|---|
| B1 / 1.1.1: tiến độ, hàng lệnh, biên nhận, hai tab | Đã có `battle_player_progress`; đáp án + tiến độ cùng giao dịch; ACK sau commit; `expected_cursor` chặn hai tab; tra biên nhận trước pha. Restart thành interrupted. Unit và integration V693 kiểm các nhánh chính. Giao dịch mở câu có giới hạn lỗi riêng nêu dưới. |
| B2 / 1.1.2: câu đã phát | `issuedFor` và SQL theo tiến độ cá nhân áp HTTP/SSE/result/history/retry-wrong/createAttempt/portfolio. Integration A nhanh/B chậm kiểm toàn JSON. Chưa phát không thành câu sai. |
| B3 / 1.1.3: công bố | Instant/deferred, teacher riêng/projector, bỏ bảng khỏi payload khi tắt đã có. `0051f12` sửa thứ tự deferred để không suy ra điểm ẩn và sửa callback bảng ghi đè phiên bản. Instant vẫn cho phép suy luận qua chênh điểm/chia sẻ lời giải, đúng lựa chọn ôn tập của phụ lục. |
| B4 / 1.1.4: tổng thời gian | `play_started_at`, hạn cứng theo giờ nhận, pause dịch hạn và trừ thời gian điểm; total không auto-next; câu đã phát chưa nộp 0 điểm. Unit kiểm callback trễ/commit sau hạn, integration kiểm pause và hạn tổng trên DB clone. |
| B5, S3 / 1.1.5–6: điểm | Công thức liên tục, hệ số thời gian theo câu, từng phần, fastest chỉ sync khi đóng câu, hòa theo points rồi accuracy; DTO tách đủ thống kê và ba thành phần điểm. Thử rollback fastest cùng pha reveal; end giữa câu không thưởng. Điểm trò chơi không dùng làm điểm năng lực GDPT 2018/mastery. |
| B6 / 1.1.7: rank | `rankEligible` ở begin, settle; default axes ở roomFits và accept-room. Class không ghi rank; test metadata rank giả không tạo LP/MMR/số ván. |
| B7 / 1.1.8: schema, lịch sử, rematch | Migration additive đăng ký upgrade; điểm lịch sử NULL đọc score×100; bot có cột điểm; rules_version=1.4; rematch sao chép trục; test lịch sử sau reload và payload cũ. Khác biệt phút 1–90 đã được duyệt, không phải tự đổi thiết kế. |
| B8: Redemption | Backend từ chối. Đúng phạm vi loại khỏi V693. |
| S1 / 1.1.9: timer và ghi tiến độ | Đã có một timer gameplay/phòng; sự kiện gần nhất qua hàng phòng. Answer/next chỉ ghi `progressKeys` của người đổi và `noPlayers:true`; timeout đồng loạt gom một lô. Resume ghi mọi tiến độ vì hạn của mọi người thực sự thay đổi; mở đầu/cuối ván ghi cả lớp là cần thiết. Pause/mất SSE không upsert player toàn lớp sau `0051f12`. Đã kiểm số hàng thật bằng trigger chỉ trên clone. |
| S2 / 1.1.9: bot/pause và bảng | Sync hẹn tại `opened_at + paused_ms + delay`; unit pause 10 giây sau 2 giây hoạt động, resume còn 5 giây với kế hoạch bot 7 giây, điểm ms=7000. Self dùng cursor riêng. Board phiên bản mới ≤1 Hz, kể cả terminal và callback trong lúc await DB; private ACK/câu tiếp không bị chờ bảng. Snapshot riêng có thể gửi lại cùng bản cache nhiều lần, không đồng nghĩa bảng đổi nhiều lần. |
| S4, S5 | Duyệt phòng học sinh, khách ngoài, Redemption, Thách bạn/giao về nhà/báo cáo theo câu đầy đủ không làm trong V693 theo 1.1/1.2. Không mở rộng trong lượt rà. |
| S6 / 1.1.10 | Có unit/integration cho tranh chấp chủ yếu và tải 40×15; chưa đủ toàn bộ fault/load matrix, xem phần còn thiếu. |
| S7 / 1.1.11 | Schema/API/engine đã triển khai; API ghi đủ snapshot/next/projector/fastest/kết quả. Hai cờ mới mặc định false. Không thể dùng lượt rà này để chứng minh thứ tự làm của các phiên trước hoặc nghiệm thu UI. |
| Phụ lục 1.2 | Mọi trục khác mặc định chỉ class; học sinh duel/ffa/team, matchmaking, rematch gửi trục mới bị 400 BATTLE_MODE_INVALID. Class với cờ tương ứng tắt nhận 403 BATTLE_FEATURE_OFF. Test V693 bao phủ. |

## Thay đổi của lượt rà này

- `backend/test/integration/v693-battle-modes.test.js`: tăng độ thực của phép đo 40×15 đã có trong `0051f12`: chốt đáp án đúng cho cả TN/ĐS/TLN/GN thay vì toàn bộ `skip`; xác nhận đủ 600 đáp án chấm đúng, không trùng; giữ kiểm số hàng ghi và board_at. Báo cáo ghi rõ workload.
- `docs/API.md`: deferred giữ thứ tự vào phòng khi giấu điểm; bảng cuối cũng chịu 1 Hz và có thể đến sau trạng thái kết thúc.
- `docs/thiet-ke/CHE_DO_CHOI_V693.md`: chú thích quyết định phút 1–90 đã duyệt, tránh người triển khai dùng enum cũ của phụ lục.
- Báo cáo này, `AI_WORK_LOG.md`, `AI_HANDOFF.md`; đồng bộ chỉ mục CodeGraph local.
- Không sửa lại production code S1/S2 vì các cơ chế cần thiết đã có và test đạt; các sửa bảng/pause thuộc commit trước `0051f12`, không nhận là thay đổi mới của lượt này.

## Phép đo 40 học sinh × 15 câu

Một phòng class/self/accuracy/total 7 phút, 40 kết nối SSE thật, 15 đợt chốt đồng thời ×40 người và 14 đợt next ×40 người. HTTP loopback tới server Node, PostgreSQL clone; có trigger đếm ghi nên phép đo có thêm overhead. Đo sau khi phát câu đầu, không gồm seed/join/countdown.

Kết quả lần chốt toàn bộ `skip` trước khi tăng độ thực của test: 600 đáp án, 0 trùng, 19.458 ms; ACK p50 450,07 ms, p95 636,61 ms, p99 709,55 ms; next p95 734,07 ms, p99 835,77 ms. Đây là kiểm tải lưu/chuyển câu, không phải tải chấm đủ bốn loại câu.

Kết quả cuối với đáp án được chấm thật: **đang chạy, bổ sung trước bàn giao**. Số đo máy đọc được lưu tại `artifacts/v693-load-40x15.json`.

Số hàng tiến độ kỳ vọng/đã xác minh ở lượt đầu: **1.720**, gồm 600 chốt + 560 next ×2 giao dịch (lưu lượt phát rồi đóng dấu thời gian mở). Mỗi giao dịch đo ở đây ghi đúng một hàng tiến độ. `battle_players` chỉ **40 UPDATE trong một giao dịch cuối ván**, không 40 UPDATE mỗi lần chốt/next. Timeout đồng loạt và resume được unit kiểm riêng, không nằm trong phép đo này.

**Chưa đạt cổng tải §23.9.** Ngay phép đo local lượt đầu p95 ACK >300 ms; không bỏ qua chỉ vì p99 <1 giây và không mất/trùng. Không suy số học sinh được phép chạy thật từ phép đo này. Chưa đo 300 học sinh qua Caddy, phòng 50 người nộp đồng loạt, reconnect burst, event-loop p99≤100 ms và p95 tự luyện tăng ≤20%. Cần đo trên máy đích/staging được cho phép, trước đó tìm nút thắt hàng phòng, ba UPDATE metadata phòng mỗi save, lần ghi timestamp thứ hai và chi phí dựng/kiểm quyền SSE. Chưa sửa các cấu trúc này vì tác động commit trước ACK/thời gian điểm, không phải sửa nhỏ an toàn trong lượt rà.

## Còn thiếu hoặc giới hạn cần theo dõi

1. **Lỗi giữa hai giao dịch mở câu:** save lượt phát commit trước; `stampOpening` ghi mốc sau đó trong giao dịch thứ hai. Lỗi giao dịch thứ hai chưa có test fault-injection chuyên biệt hoặc cơ chế hội tụ RAM/DB ngay trong tiến trình. Không công bố/ACK câu mới khi lỗi, nhưng DB có thể đã tăng issued_count trong lúc RAM còn cũ; lịch sử sau restart có thể tính một câu chưa tới client là đã phát. Cần thiết kế xử lý lỗi/hội tụ cùng test restart tại khe này, không chỉ catch rồi bỏ lỗi. Chưa thay đổi vì đụng bất biến thời điểm mở sau commit.
2. **Lỗi timer/DB:** callback timer hiện đóng SSE bằng `closeAll('unavailable')`; chưa có cơ chế tự hẹn lại/cô lập theo phòng khi giao dịch timer thất bại. Đây là rủi ro vận hành; cần test lỗi DB tạm thời rồi hồi phục, không tự bật lại ván đã interrupted.
3. **Bot self với total:** lõi có cursor riêng và test pause/self per_question; API class chưa có tùy chọn thêm bot. Nếu gọi lõi trực tiếp với bot+self+total, không có auto-next trong feedback nên bot dừng sau câu đầu tới hạn tổng. Chưa bổ sung API hoặc luật bot tự nhấn next vì không được đặc tả trong Quiz lớp 1.2. Muốn mở bot cho Quiz lớp cần chốt hành vi và test riêng.
4. **Một số ca S6 chưa là kiểm thử đầu cuối thật:** mất ACK đang mô phỏng bằng bỏ phản hồi rồi gửi lại cùng client_id, chưa cắt socket ngay sau commit; chưa ma trận reconnect feedback/done, toàn bộ đua pause/end/next/timeout, lỗi timestamp mở câu và tải/reconnect §23.9. Những bộ test xanh dưới đây không thay các ca còn thiếu.
5. **Lịch sử bảng công khai:** cache public_board/board_version không được lưu; sau room rời RAM hoặc restart, bảng có thể rỗng dù me/podium/questions vẫn dựng đúng. Nếu cần chiếu lại nguyên bảng cuối, bổ sung dựng bảng terminal từ dữ liệu bền vững và test reload; hiện hợp đồng kết quả dùng me/questions.
6. **Phiên bản luật:** có rules_version=1.4 và điểm đã lưu; chưa có snapshot JSON độc lập cho các hằng số 600/400/100. Hiện hằng số cố định trong mã nên replay biên nhận không chấm lại. Trước khi cho cấu hình điểm, cần lưu tham số theo ván/version; không sửa nghĩa 1.4 tại chỗ.
7. **Tương thích DTO:** `me.total` của kết quả nay là số câu theo hợp đồng mới; số người tách `participant_count`. Đây là thay đổi nghĩa so với DTO V69 cũ, dù payload tạo phòng và luật chơi mặc định giữ nguyên. Người tiêu thụ API cũ cần đọc đúng trường.

## Kiểm tra và triển khai

- `npm test`: **217/217**, matrixBalancer **8/8**, không skip. Hai lần gọi npm qua launcher phụ thất bại trước khi thực thi suite; lệnh `npm.cmd test` trực tiếp chạy đầy đủ và exit 0.
- Integration V693: lượt đầu **8/8**; lượt cuối sau đổi workload **đang chạy**.
- Integration V69/V691 (gồm V692): **đang chạy**, cập nhật trước bàn giao.
- Không dùng kết quả security/build của phiên cũ làm kết quả phiên này. Không build frontend trong lượt rà.

Trước deploy phải backup và kiểm đúng schema nguồn. Migration v693 mới là additive, nhưng không đồng nghĩa không khóa bảng; CHECK trên bảng hiện có cần thời gian kiểm dữ liệu. Nếu database đã chạy v693 trước `66ebbf7`, migration tracking/nhánh IF NOT EXISTS không tự đổi CHECK enum phút cũ sang 1–90: cần migration tiếp theo có kiểm soát. Không chạy migration sửa tại chỗ trên nguồn trong phiên này.

Tắt nhận ván mới, đợi ván đang chơi kết thúc rồi restart. `recover()` chuyển phòng playing thành interrupted, không tiếp tục timer; không hứa giữ ván đang chơi xuyên restart. `self_paced` và `speed_scoring` mặc định false; migration giữ giá trị đã tồn tại trong settings, nên cần kiểm cấu hình thực tế, không suy từ default. `battle_enabled=false` ngừng nhận ván mới, khác emergency stop dừng ván hiện tại. Chỉ bật có chủ đích sau test/CI đúng commit và nghiệm thu tải phù hợp. Trạng thái “Đấu đang tắt trên web” trong handoff cũ chưa được xác minh lại trong phiên không mạng này.

## Cập nhật sau tối ưu (Claude, 21/10/2026 chiều)

Anh Hiếu chọn tối ưu trước khi deploy. Đo trong server cho thấy hàng lệnh phòng chỉ ~5 ms/lượt; phần lớn thời gian nằm ở CPU xác thực mỗi request (`listEffectiveCapabilities` duyệt mọi quyền × mọi ngữ cảnh — môn × khối + lớp × môn… — kể cả với học sinh).

- `accessResolver.listEffectiveCapabilities`: học sinh / tài khoản khóa trả thẳng mọi quyền `false` (policy vốn từ chối họ ngay ở `decide`/`bankDecision`); test `access-v65` kiểm giả định trên mọi quyền × ngữ cảnh × ngân hàng.
- Đấu: lưu gọn cho Tự chơi (chỉ tiến độ + đáp án, `asked_count` khi đổi; mốc mở câu không ghi lại phòng), `BEGIN; SET LOCAL` một lượt, bỏ tra biên nhận DB thừa (chỉ tra khi trùng khóa chính 23505), tra tạm khóa song song khi chờ hàng lệnh, sao chép nông thay `structuredClone` cả phòng cho chốt/chuyển câu Tự chơi.
- Kết quả 40×15 (chấm thật): ACK p50 409 → ~165 ms, **p95 592 → ~230 ms (đạt ≤ 300)**, p99 660 → ~250 ms; next p95 640 → ~252 ms; tổng 17,8 → 6,6 s. `/battle/me` đơn lẻ 7,7 → 4,8 ms.
- Vẫn chưa đo 300 học sinh qua Caddy trên máy thật; loạt request đầu sau khi pool rảnh (mặc định đóng kết nối sau 30 s) chậm hơn do mở lại kết nối — cân nhắc `DB_POOL_IDLE_MS` trên máy chủ.
