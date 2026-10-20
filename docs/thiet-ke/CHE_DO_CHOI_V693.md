# Đấu V6.9.3 — Chế độ chơi kiểu Quizizz/Wayground: tự chơi, giáo viên điều khiển, tính điểm nhanh tay, thi theo phút

Trạng thái: **bản kế hoạch 1.1 (Claude, 20/10/2026; đã qua phản biện Codex — xem Phụ lục 1.1, phụ lục thắng khi mâu thuẫn)** — tiếp theo: Codex làm backend, Gemini (Argon) làm giao diện, Claude review và chạy thử trình duyệt.

Nguồn yêu cầu (anh Hiếu, 20/10/2026):
- "Chế độ chơi cần giống Quizizz để tự chơi, hoặc cần giáo viên duyệt."
- "Thêm một chế độ đấu cho người ngoài giống wayground.com" — **phát triển sau** (mục 9, chỉ ghi định hướng).
- "Cần cả chế độ ai trả lời xong trước khi xét kết quả sẽ được cộng điểm, hoặc giống Wayground thi theo phút, hết giờ thì thôi."

Tài liệu tham khảo: `C:\Users\Duong Hieu\Downloads\wayground-tong-hop.md` (tổng hợp help center Wayground 10/2026). Các mục dùng: §2 chế độ (Teacher-led / Student-paced Classic / Team / Challenge Friends), §4.1–4.2 hai loại điểm và công thức 600 + 0–400 theo tốc độ, §3.6 Redemption, §5.5 màn hình giáo viên.

---

## 1. Hiện trạng V6.9.2 (đã deploy 20/10/2026, `main` = `8da8b84`)

- Mọi phòng chạy **đồng bộ do máy chủ điều khiển**: cả phòng cùng một câu, `countdown → question → reveal → question …` (`rooms.js` `advance`/`closeQuestion`, hẹn giờ theo `schedule_version`).
- Phòng lớp: giáo viên bấm "Câu tiếp", có tạm dừng/tiếp tục; phòng học sinh: tự sang câu sau 20 giây lời giải hoặc khi mọi người bấm "Câu tiếp".
- Điểm: `points = Σ score × 100` (chấm từng phần cho Đ/S, ghép nối); **không tính tốc độ** — nguyên tắc "Đúng là chính" (kế hoạch 1.3).
- Thời gian: mỗi câu `seconds` (20–180), không có đồng hồ tổng.
- Rank (LP) tính từ thứ hạng theo `points`.

## 2. Mục tiêu

1. Thêm **cách tiến độ** (pacing) thứ hai: **Tự chơi** (student-paced, giống Classic/Challenge Friends) bên cạnh **Cùng nhịp** hiện có (teacher-led / host-led).
2. Thêm **cách tính điểm** thứ hai: **Nhanh tay** (đúng + thưởng tốc độ, giống Wayground) bên cạnh **Đúng là chính** hiện có.
3. Thêm **giới hạn thời gian theo phút** cho cả ván (hết giờ là dừng), dùng cùng chế độ Tự chơi.
4. **Giáo viên duyệt**: phòng do học sinh tạo trong giờ học có thể cần giáo viên duyệt (xem mục 6 — cần anh Hiếu chốt cách hiểu).
5. Giữ nguyên các bất biến V6.9: không lộ đáp án trước khi chấm, commit trước ACK, một phòng hoạt động mỗi học sinh, kill switch, không ghi mastery từ Đấu.

Ngoài phạm vi: người ngoài không tài khoản (mục 9), power-up / Strike & Shield / meme / nhạc (mục 10, cân nhắc sau).

## 3. Ba trục cấu hình phòng (mới)

| Trục | Giá trị | Mặc định | Ghi chú |
|---|---|---|---|
| `pacing` | `sync` (cùng nhịp, hiện có) · `self` (tự chơi) | `sync` | `self` không có pha `reveal` chung |
| `scoring` | `accuracy` (đúng là chính, hiện có) · `speed` (nhanh tay) | `accuracy` | Ván tính hạng **luôn** `accuracy` (mục 7) |
| `time_limit` | `per_question` (hiện có, `seconds`) · `total` (`total_minutes` 3/5/10/15/20) | `per_question` | `total` chỉ đi với `pacing:self` |

Tổ hợp hợp lệ:

| Tên hiển thị | pacing | scoring | time_limit | Ai dùng |
|---|---|---|---|---|
| Cùng nhịp (hiện có) | sync | accuracy | per_question | mọi phòng |
| Cùng nhịp · Nhanh tay | sync | speed | per_question | phòng lớp, phòng học sinh |
| Tự chơi | self | accuracy hoặc speed | per_question | phòng lớp, phòng học sinh, "Thách bạn" |
| Thi theo phút | self | accuracy hoặc speed | total | phòng lớp (chính), phòng học sinh |

Ghép trận tự động (matchmaking) giữ `sync + accuracy + per_question` trong V6.9.3 (ít rủi ro nhất); mở rộng sau nếu cần.

## 4. Tính điểm "Nhanh tay" (`scoring: speed`)

Theo Wayground §4.2, quy về thang 1000 để học sinh quen:

- Câu đúng hoàn toàn: **600 + thưởng tốc độ 0–400**. Thưởng = `round(400 × max(0, 1 − ms / thời_hạn_câu))`, `ms` = thời điểm chốt trừ lúc mở câu (đã trừ thời gian tạm dừng, như `paused_ms` hiện có).
- Câu đúng một phần (Đ/S, ghép nối): `score × 600 + score × thưởng tốc độ` (đúng một nửa thì được một nửa cả hai phần).
- Câu sai, bỏ trống, bỏ qua: 0. Không trừ điểm (khác Double Jeopardy).
- **Thưởng "nhanh nhất"** (đúng yêu cầu "ai trả lời xong trước khi xét kết quả"): chỉ ở `pacing: sync`, người **chốt đúng hoàn toàn sớm nhất** của câu được **+100**; đồng thời điểm `ms` bằng nhau thì cùng nhận. Hiện trên lời giải: "⚡ Nhanh nhất: Ngọc".
- `pacing: self` + `time_limit: total`: thời hạn câu để tính thưởng = `seconds` mặc định 30 giây/câu (đồng hồ câu chỉ để tính thưởng, không đóng câu).
- Lưu cả `accuracy` (tỉ lệ đúng, như Wayground "accuracy points") và `score` (điểm game) trong kết quả; bảng kết quả hiện cả hai, **xếp hạng theo `score`**, hoà thì theo `accuracy` rồi tổng `ms`.
- Chống đoán bừa: câu chốt dưới 1,5 giây kể từ khi mở **không nhận thưởng tốc độ** (vẫn được 600 nếu đúng). Ngưỡng nằm trong `battle_limits`.

`scoring: accuracy` giữ nguyên công thức hiện tại (`score × 100`).

## 5. Chế độ "Tự chơi" (`pacing: self`)

Giống Classic / Challenge Friends của Wayground:

- Mỗi người có **con trỏ câu riêng** `cursor` (0…n−1). Máy chủ phát đề **từng câu một cho từng người** (vẫn không gửi câu chưa tới lượt, không gửi đáp án).
- Chốt câu → máy chủ chấm ngay → trả **kết quả của riêng người đó** (đúng/sai, lời giải ngắn) rồi người đó bấm "Câu tiếp" (hoặc tự sang sau 3 giây). Không chờ cả phòng.
- `time_limit: per_question`: mỗi câu có đồng hồ riêng cho người đó; hết giờ chưa chốt → tính bỏ trống, sang câu sau.
- `time_limit: total`: đồng hồ chung của phòng `ends_at = started_at + total_minutes`. Hết giờ → máy chủ kết thúc ván cho mọi người; câu đang làm dở không tính. Ai làm hết câu trước thì chờ ở màn "Đã xong — xem bảng" (giống Brain Gym nhưng chỉ xem bảng, không mini game).
- **Bảng xếp hạng trực tiếp**: cập nhật theo điểm đã chấm, gộp tối đa 1 lần/giây (stream đã có coalesce 250 ms). Có thể tắt bảng cho từng phòng (`show_live_board`), mặc định bật; phòng lớp giáo viên chọn.
- **Câu chuộc lỗi** (Redemption, Wayground §3.6): tùy chọn `redemption: true` — cuối lượt, mỗi người được làm lại **1 câu sai** (2 câu nếu ván ≥ 15 câu); đúng thì được lại 50% điểm câu đó. Mặc định tắt trong V6.9.3.
- Kết thúc: khi mọi người làm hết câu, hoặc hết `total_minutes`, hoặc giáo viên bấm "Kết thúc" (phòng lớp), hoặc chủ phòng còn một mình.
- Máy tham gia được (`bots.plan` theo từng câu của con trỏ riêng của máy).
- Rời giữa chừng: giữ điểm đã có, đánh dấu rời; luật hạng như §10.4 mục 4 (V6.9.2, 19/10/2026).

Thay đổi backend dự kiến (để Codex phản biện, chưa phải thiết kế cuối):
- `rooms.js`: nhánh `pacing:self` — trạng thái phòng `playing` không có `index` chung; mỗi người `cursor`, `opened_at`, `deadline` riêng; hẹn giờ theo người (per-player timer keyed `room_id:user_id:cursor:schedule_version`) hoặc một đồng hồ quét (tick) mỗi giây cho các phòng tự chơi để tránh nổ số timer khi lớp 40 người.
- `dto.js`: DTO theo người xem: câu hiện tại của chính mình, `my_progress`, bảng trực tiếp (tên ngắn + điểm + số câu đã làm, không câu trả lời).
- `engine.js`: `standings` nhận `scoring`; thêm `speedPoints`, `fastestBonus`; `distribution` cho từng câu tính khi tất cả đã làm qua câu đó hoặc khi ván kết thúc (tránh lộ đáp án cho người chưa làm).
- Migration v693 (thêm cột, không đổi dữ liệu cũ): `battle_rooms.pacing`, `scoring`, `time_limit`, `total_minutes`, `redemption`, `show_live_board`; `battle_answers.points` (điểm game đã tính, để kết quả/ lịch sử không phải tính lại) và `fastest` boolean.
- API: `POST /rooms` nhận ba trục mới (validate tổ hợp ở §3); `POST /rooms/:id/answer` ở `self` dùng `cursor` thay `index`; `POST /rooms/:id/next` ở `self` chuyển con trỏ riêng.

## 6. "Giáo viên duyệt" — cần anh Hiếu chốt

Có hai cách hiểu; kế hoạch đề xuất làm **(A)** trước, **(B)** là tùy chọn của (A):

- **(A) Giáo viên điều khiển ván (teacher-led)** — đã có ở phòng lớp: giáo viên bấm bắt đầu, câu tiếp, tạm dừng, kết thúc. V6.9.3 bổ sung: giáo viên chọn được **Cùng nhịp** hay **Tự chơi / Thi theo phút** và **Đúng là chính** hay **Nhanh tay** khi mở phòng lớp; màn chiếu Tự chơi hiện **bảng trực tiếp + tiến độ từng học sinh** (số câu đã làm, đúng/sai), không hiện đề (giống Live Dashboard Wayground §5.5).
- **(B) Duyệt phòng học sinh tự tạo** — admin bật cờ `battle_modes.teacher_approval`: trong khung giờ học (cấu hình giờ), phòng học sinh tạo ra ở trạng thái "chờ giáo viên duyệt"; giáo viên phụ trách lớp thấy danh sách và bấm Duyệt / Từ chối; ngoài giờ học không cần duyệt. Chỉ làm nếu anh Hiếu xác nhận đây là ý muốn.

## 7. Quan hệ với Rank (LP)

- Ván tính hạng chỉ ở `sync + accuracy + per_question` (giữ công bằng, tránh thưởng tốc độ cho đoán bừa). Phòng/ghép có trục khác → `rank_enabled = false`, giao diện ghi rõ "Không tính hạng".
- `scoring: speed` và `pacing: self` vẫn ghi lịch sử, huy hiệu ván (thêm huy hiệu "Nhanh nhất" cho Nhanh tay, "Về đích sớm" cho Tự chơi).

## 8. Giao diện (Gemini Argon làm, Claude review)

1. **Tạo phòng / mở phòng lớp**: thêm bước "Cách chơi" — 3 thẻ: *Cùng nhịp*, *Tự chơi*, *Thi theo phút* (chọn số phút 3/5/10/15/20); và công tắc *Tính điểm: Đúng là chính / Nhanh tay*; tùy chọn *Bảng xếp hạng trực tiếp*, *Câu chuộc lỗi*. Thẻ mô tả bằng lời của học sinh lớp 6–9.
2. **Phòng Tự chơi (học sinh)**: đề + đồng hồ riêng (hoặc đồng hồ tổng); sau khi chốt hiện ngay đúng/sai + điểm cộng (600 + thưởng) + nút "Câu tiếp"; dải bảng trực tiếp thu gọn (hạng của em, 3 bạn quanh em); màn "Đã xong" chờ bạn.
3. **Màn chiếu Tự chơi (giáo viên)**: đồng hồ tổng lớn, bảng trực tiếp, lưới tiến độ từng học sinh (ô theo câu: xanh đúng, đỏ sai, xám chưa làm), nút Kết thúc; không hiện đề và đáp án khi còn người chưa làm.
4. **Nhanh tay**: hiệu ứng điểm bay "+870", huy hiệu "⚡ Nhanh nhất" trên lời giải; kết quả hiện hai cột *Điểm* và *Độ chính xác*.
5. Lời: dùng tiếng Việt cho học sinh, không dùng từ "pacing/scoring".

## 9. Người ngoài không tài khoản (phát triển sau — chỉ định hướng)

Giống Wayground "join by code": người ngoài nhập mã + tên hiển thị để chơi một phòng. Rủi ro cần thiết kế riêng trước khi làm: học sinh vị thành niên chơi chung người lạ (an toàn), lộ ngân hàng câu hỏi của trường ra ngoài, spam/bot, tên phản cảm, giới hạn tải. Hướng đề xuất khi làm: chỉ giáo viên mở được "phòng khách", bộ câu do giáo viên chọn sẵn (không lấy ngẫu nhiên từ ngân hàng), tên khách lọc từ ngữ, giới hạn số khách, phòng tự đóng sau 2 giờ, không lưu dữ liệu cá nhân của khách.

## 10. Tham khảo Wayground — để cân nhắc, không làm trong V6.9.3

Power-ups (2X, 50-50, Time Freeze…), Strike & Shield, meme, nhạc, Qbit/coins, Mastery Peak, Paper Mode (thẻ QR), Team Equalizer (đội lệch người: V6.9 đã chia trung bình điểm đội — tương đương). Ghi lại để anh Hiếu chọn sau.

## 11. Kiểm thử & nghiệm thu

- Unit: `speedPoints`, `fastestBonus`, tổ hợp trục hợp lệ/không hợp lệ, `standings` hai chế độ, hết `total_minutes` giữa câu, Redemption.
- Integration (DB clone): phòng Tự chơi 3 học sinh + 1 máy làm lệch nhịp; DTO không lộ câu chưa tới lượt hay đáp án; bảng trực tiếp; hết giờ tổng; giáo viên kết thúc; rời giữa chừng; rank tắt với tổ hợp không hợp lệ; Nhanh tay chấm thưởng đúng và chống đoán < 1,5 s.
- Tải: phòng lớp Tự chơi 40 học sinh × 15 câu không tạo quá 1 timer/người cùng lúc; SSE gộp.
- Trình duyệt (Claude, server thử): đủ 3 cách chơi × 2 cách tính điểm, mobile 390 px, màn chiếu.
- Không đổi hành vi mặc định: phòng cũ (không gửi trục mới) chạy y như V6.9.2 — test hồi quy toàn bộ V69/V691/V692.

## 12. Thứ tự làm

1. Codex phản biện kế hoạch này (gpt-6-astra, cao) → Claude trả lời → chốt bản 1.1.
2. Codex backend: migration v693, engine/rooms/dto/API, test.
3. Gemini UI: mục 8 (tách lượt ≤ 18 KB như V6.9).
4. Claude review, nối, chạy thử trình duyệt, sửa tích hợp.
5. Anh Hiếu duyệt → "up main" ngoài giờ học.

## 13. Câu hỏi cho anh Hiếu

1. "Giáo viên duyệt" là (A) giáo viên điều khiển ván, hay (B) giáo viên duyệt phòng học sinh tự tạo trong giờ học, hay cả hai?
2. Nhanh tay: thang 600 + 0–400 và thưởng "nhanh nhất" +100 có ổn không?
3. Thi theo phút: các mốc 3/5/10/15/20 phút có đủ không?

---

## Phụ lục 1.1 — Quyết định sau phản biện Codex (20/10/2026)

Phản biện: `docs/thiet-ke/phan-bien/V693_CODEX_PHAN_BIEN.md` (B1–B8, S1–S7, Q1–Q4). Phụ lục này **thay thế** các mục 3–11 ở chỗ mâu thuẫn.

**Phạm vi V6.9.3:** (A) giáo viên điều khiển ván + chọn cách chơi; Tự chơi; Thi theo phút; Nhanh tay. **Ngoài phạm vi:** (B) duyệt phòng học sinh tạo (thiết kế riêng nếu anh Hiếu cần — các yêu cầu S4 giữ làm đầu vào), người ngoài (S5), Redemption (B8 — backend từ chối `redemption:true`), Tự chơi cho phòng đội (Q4 — `self` chỉ cho `duel`, `ffa`, `class`).

1. **Trạng thái từng người (B1).** Bảng mới `battle_player_progress(room_id, player_key, cursor, issued_count, phase question|feedback|done, opened_at, deadline, paused_ms, progress_version, updated_at)`; `player_key` = user id hoặc `bot:<slot>`. Tách `progress_version` (người) khỏi `schedule_version` (phòng). Nộp câu: một giao dịch ghi đáp án + điểm + tiến độ sau chấm → commit → cập nhật RAM → ACK. Mở câu: ghi tiến độ (issued_count) trước khi trả nội dung. Biên nhận `(room, người, câu, client_id)` tra **trước** kiểm tra pha; khác `client_id` → 409. `POST /rooms/:id/next` ở `self` bắt buộc `{expected_cursor}`; sai → 409 kèm tiến độ hiện tại. Restart giữ hành vi `recover()` → `interrupted` (không tự tiếp tục ván).
2. **Quy tắc `đã_phát_cho(người, câu)` (B2):** `câu < issued_count` của người đó (sync: `asked_count`). Áp cho SSE, HTTP, kết quả, lịch sử, `retry-wrong` + `createAttempt`, `portfolio` (Câu cần xem lại). Câu đã phát chưa nộp = "bỏ trống"; câu chưa phát không xuất hiện ở đâu với người đó.
3. **Hai chính sách công bố (B3, Q2):** trường `reveal_policy`: `instant` (mặc định — ôn tập: chốt xong thấy ngay đúng/sai và lời giải; chấp nhận khả năng học sinh chia sẻ đáp án, ghi rõ trong giao diện giáo viên) và `deferred` (thi đua: chỉ báo "đã nhận", lời giải/đúng sai công bố khi ván kết thúc). Bảng công khai (học sinh + màn chiếu) chỉ có tên ngắn, điểm, số câu đã nộp/tổng — **không** lưới đúng/sai từng câu; ở `deferred` chỉ tiến độ, không điểm. Lưới chi tiết chỉ trong payload riêng giáo viên chủ phòng (không nằm trong DTO màn chiếu). `show_live_board=false` loại dữ liệu khỏi payload.
4. **Thi theo phút (B4, Q3):** `play_started_at` = lúc mở câu đầu; `ends_at = play_started_at + total_minutes`. Hạn cứng theo giờ nhận request (đã ghi trước hàng lệnh); không grace 500 ms cho hạn tổng (phòng cũ giữ grace). Mọi lệnh `answer/next/bot/timer` kiểm tra hạn. Pause của giáo viên dừng đồng hồ tổng (dịch `ends_at`) và trừ khỏi thời gian tính thưởng. Kết thúc giữa câu: câu đang làm = đã phát, chưa nộp, 0 điểm. Thi theo phút **không tự sang câu**: chốt xong học sinh bấm "Câu tiếp" ngay (không chờ 3 s); `per_question` tự sang sau 3 s. Giao diện đếm theo `server_now` + hạn máy chủ.
5. **Nhanh tay (B5, S3):** bỏ ngưỡng 1,5 s. Đường liên tục: `bonus = round(400 × clamp(1 − ms/limit, 0, 1))`; `limit` = `battle_questions.seconds` của câu (đã nhân hệ số loại câu). Điểm câu = `round(score × (600 + bonus))`. `ms` = giờ nhận trên máy chủ − `opened_at` (đặt `opened_at` **sau** commit mở câu) − pause. Thưởng "nhanh nhất" +100 chỉ ở `sync`: quyết toán trong giao dịch đóng câu (chuyển reveal), người có `ms` nhỏ nhất trong số đúng hoàn toàn; trùng `ms` cùng nhận; ván `interrupted`/kết thúc giữa câu không phát sinh thưởng. Lưu tách `base_points`, `speed_points`, `fastest_points`. Câu chốt rất nhanh chỉ ghi cờ bất thường cho báo cáo, không đổi điểm.
6. **Thống kê và hoà (S3):** trả `points` (điểm game), `accuracy_sum = Σscore`, `fully_correct`, `submitted`, `issued`, `total`. Hiển thị độ chính xác kèm mẫu số ("8/10 câu đã làm"). Hoà `speed`: điểm game → `accuracy_sum` → đồng hạng (bỏ tổng `ms`). `accuracy` giữ luật cũ.
7. **Rank (B6):** hàm chung `rankEligible(room)` = `pacing=sync && scoring=accuracy && time_limit=per_question` (+ điều kiện cũ). Kiểm ở `begin()` và **đầu `settle()`** trước mọi ghi rating. `roomFits()` của ghép trận và `accept-room` chỉ nhận phòng tổ hợp mặc định. Chuẩn hoá mặc định ở tầng tạo phòng chung (`createUnlocked`). DTO trả `rank_disabled_reason`.
8. **Migration v693 (B7):** cột phòng có DEFAULT tương thích + CHECK enum + CHECK tổ hợp (`total` ⇒ `self` và `total_minutes ∈ {3,5,10,15,20}`); `reveal_policy`, `show_live_board`. Đáp án người và máy: `base_points`, `speed_points`, `fastest_points` **NULL cho lịch sử** (đọc bằng luật cũ `score×100`). Gán `rules_version='1.4'` cho ván mới. Không đổi PK/FK, không đổi nghĩa cột `score`. Rematch sao chép các trục mới. Triển khai: tắt nhận ván mới, chờ ván đang chơi kết thúc rồi mới deploy.
9. **Hẹn giờ và ghi DB (S1, S2):** một timer gameplay cho mỗi phòng, hẹn tới sự kiện gần nhất (hạn câu từng người, auto-next, bot, hạn tổng); callback chỉ đẩy lệnh vào hàng phòng, đọc lại trạng thái và phiên bản rồi đặt lịch mới. Lưu tiến độ theo hàng người thay đổi (không upsert cả lớp mỗi lượt); timeout đồng loạt ghi theo lô. Bảng công khai phát tối đa 1 lần/giây, tách khỏi phản hồi riêng (ACK, câu tiếp trả ngay qua HTTP và SSE riêng người). Bot dùng câu theo con trỏ của bot; hẹn giờ bot theo thời gian hoạt động còn lại (sửa luôn lỗi pause ở `sync`).
10. **Nghiệm thu bổ sung (S6):** đủ các ca tranh chấp Codex liệt kê (hai tab, mất ACK, A nhanh/B chậm kiểm toàn bộ JSON, rank không ghi với tổ hợp khác, kill switch, hồi quy payload cũ + lịch sử cũ), cộng tải 40×15 và giữ ngưỡng §23.9 cũ.
11. **Thứ tự (S7):** (1) schema + hợp đồng DTO/API viết vào `docs/API.md` trước khi code giao diện → (2) `self + accuracy + per_question` đủ reconnect/restart/lịch sử/Luyện lại → (3) thời gian tổng, pause, bot lệch nhịp → (4) Nhanh tay + quyết toán nhanh nhất + chặn rank → (5) màn chiếu/bảng giáo viên. Có cờ `battle_modes.self_paced` và `battle_modes.speed_scoring` (mặc định tắt). Ước lượng 17–26 ngày công.

---

## Phụ lục 1.2 — Tách "Đấu trường" và "Quiz lớp" (anh Hiếu chốt 20/10/2026)

Anh Hiếu đồng ý tách ở tầng sản phẩm, dùng chung lõi. Phụ lục này thắng Phụ lục 1.1 khi mâu thuẫn.

| | **Đấu trường** (giống Bufopia) | **Quiz lớp** (giống Quizizz/Wayground) |
|---|---|---|
| Ai mở | Học sinh | Giáo viên/quản trị (phòng `kind:"class"`) |
| Vào | Tìm đối thủ, phòng mã, sảnh, đấu máy | Mã phòng (ô "Có mã phòng?" dùng chung), màn chiếu |
| Trục cho phép | Chỉ `sync + accuracy + per_question` | Mọi tổ hợp hợp lệ ở Phụ lục 1.1 |
| Hạng (LP) | Có (luật cũ) | Không |
| Giao diện riêng | Bảng hạng, huy hiệu | Màn chiếu, bảng trực tiếp, tiến độ lớp |

Quyết định:
1. **Backend:** `pacing:self`, `scoring:speed`, `time_limit:total`, `reveal_policy:deferred`, `show_live_board:false` chỉ nhận ở `kind:"class"`; phòng học sinh (`duel/ffa/team`), ghép trận, rematch phòng học sinh gửi trục khác mặc định → 400 `BATTLE_MODE_INVALID`. (Thay quy tắc "self cho duel/ffa/class" ở 1.1.) "Thách bạn" kiểu Challenge Friends cho học sinh: đợt sau, đi vào Quiz lớp, không vào Đấu trường.
2. **Giao diện:** menu giáo viên thêm mục **"Quiz lớp"** (route `/practice/quiz`), chuyển form mở phòng lớp hiện ở tab Đấu sang đây, kèm `PlayModePicker`. Tab "Đấu" của học sinh giữ như V6.9.2 (không có bảng chọn cách chơi). Học sinh vào phòng Quiz lớp bằng mã ở tab Đấu (hoặc thẻ phòng lớp được ghim); phòng `pacing:self` hiển thị bằng `SelfPacedPlay`.
3. Tên hiển thị tạm: "Đấu trường" / "Quiz lớp" — anh Hiếu có thể đổi.
4. Hàng đợi việc sau Quiz lớp: câu chuộc lỗi, báo cáo theo câu cho giáo viên, giao về nhà, Thách bạn, phòng cho người ngoài.
