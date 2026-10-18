# Triển khai ghép trận linh hoạt V6.9.1 và xếp hạng V6.9.2

Ngày rà soát: **19/10/2026**. Nhánh giữ nguyên `feat-v69-battle`. Tiếp tục phần mã dở của phiên trước, không thay thế bằng một bản khác. Phạm vi: backend, test và tài liệu; không sửa `frontend/`, migration V69, `.env`; không commit/push, không truy cập mạng ngoài, không migrate database nguồn.

Nguồn: `GHEP_TRAN_CHOT_V69.md` §1–§11; **§10.4 thắng §10.2–§10.3**, §9 thắng các đề nghị thu hẹp bản đầu. Các bất biến của `KE_HOACH_DAU_TRUONG_V69.md` bản 1.3 §23 tiếp tục áp dụng. Các lựa chọn học tập thuộc học sinh; tham số và cờ khả năng thuộc quản trị. Rank không ghi điểm thành thạo hoặc điểm học tập theo GDPT 2018.

## 1. Đối chiếu từng mục của quyết định đã duyệt

“Đã làm” dưới đây nói về backend và hợp đồng dữ liệu. Các thao tác hiển thị/nút của học sinh do frontend sử dụng API; không nằm trong phạm vi sửa của phiên này.

| Mục | Đã làm | Chưa làm trong phạm vi giao | Lệch / lựa chọn hiện thực và lý do |
|---|---|---|---|
| §1 Vé | `kinds[]`, ≤3 `choices[]`, `lengths[]`/`any`, `flex`, `ranked`, `bot_fill`; nội dung xét ngay; 7/10/15; độ dài mảng có thứ tự | Không | Giữ POST cũ bằng adapter strict/7/không hạng; không ép mọi vé thành 7 câu |
| §2 Nới có trần | Lịch 10/20/30 cấu hình; Bài xa nhất theo `order_index,id` giống bản đồ; giao toàn nhóm; chưa luyện chỉ giữ lựa chọn; phần đã mở không thu hẹp khi hết giờ vàng | Không | Lựa chọn chủ động ban đầu được giữ kể cả chưa có bằng chứng luyện. Chỉ phần **tự nới** bị giới hạn, đúng câu chữ §2 |
| §3 Thứ tự tìm | Gợi ý phòng cố định trước vé, đủ kiểu/số câu/thời lượng/phạm vi/chỗ và toàn bộ quan hệ chặn; xác nhận; loại 5 phút sau rời; gốc lâu nhất; ≤50 vé/vòng, quét luân phiên phần còn lại; gộp vòng, đếm scope có cache theo vòng; 3 người hoặc 2 chờ đủ mốc | Không | Ngưỡng số câu lấy theo độ dài chung đã chọn (§9), thay số 7 cố định cũ. Tham lam có giới hạn, không cam kết tối ưu toàn cục, không sinh tổ hợp |
| §4 Tự chạy / nguyên tử | Phòng ghép đánh sẵn sàng và countdown 5s; public/open_slots đủ điều kiện 60s; timer phiên bản; khóa học sinh tăng dần → queue phòng → kiểm lại → commit → xóa vé | Không | Khi phòng ghép chuyển countdown thì không nhận thêm, đúng quy tắc không vào giữa ván. Chỉ gợi ý phòng còn thực sự ở lobby |
| §5 Lối thoát | Máy từ 15s; public hoặc practice từ mốc cuối; chuyển một lần; practice trả scope/choices cho Luyện ngay | Không | Không tự tạo attempt luyện khi chọn lối ra; frontend mở luồng tự luyện theo scope trả về |
| §6 Hiển thị | `waiting:null` dưới 5; số học sinh ôn toàn trường chống đếm trùng; câu nhanh từ phần đã chọn; không ETA, không đáp án sớm | Không | Cửa sổ “đang ôn” mặc định 15 phút, cache DB 10s; lựa chọn vận hành cấu hình qua `activity_ms`, không đồng nhất với số socket online |
| §7 API | Vé, trạng thái SSE, accept-room, exit, hủy vé, cờ, validation và lỗi; tài liệu API cập nhật | Không | PATCH cũ `{accept:true}` trả 410 vì đồng ý nới ngay lúc tạo vé; thay đổi tương thích được ghi rõ |
| §8 Các quyết định chờ | Đã giải quyết bằng §9 và §10.4: làm cả máy, giờ vàng, nhiều độ dài | Không | Không dùng khuyến nghị “chỉ 7 câu” hoặc “hoãn máy” trong phản biện cũ để bỏ yêu cầu mới |
| §9 Cấu hình mở | `battle_flex`, `battle_rank`, thêm modes bot/golden_hour/ranked/leaderboard; quản trị cập nhật từng khóa, validation giới hạn và quan hệ | Không | Giữ trần an toàn 50 vé/vòng, rank ≤4 người; không coi “mọi số cấu hình” là cho phép vượt các bất biến đã duyệt |
| §9.1 Máy | Danh tính ảo, thống kê chung khối ≥10 lượt, dự phòng NB/TH/VD; hệ số Dễ/Vừa/Khó, clamp; ĐS/GN từng ý; thời gian35–85%; timer riêng, lệnh nội bộ index/version, chống trùng; nhãn; không huy hiệu so sánh/lịch sử riêng | Không | Dùng **bảng máy riêng** thay đổi PK/FK người thật: xem §2 dưới. Không phát lại đáp án/thời gian của bất kỳ học sinh cụ thể nào |
| §9.2 Giờ vàng | CRUD, phân quyền rõ khối/môn hoặc toàn khối; một lần/lặp tuần UTC+7; banner 30 phút và participant; timer banner/start/end kể cả hàng chờ trống; nới5/10/15 đúng môn | Không | Không tự phát sinh thưởng hay rank riêng; lịch quản trị tạo, không tự suy lịch nhà trường |
| §10.1 Hai chiều / chéo nguồn | Rộng gặp hẹp ngay bằng giao cụ thể; hẹp nới có trần; dung sai kinds/length/MMR cấu hình; vé nhận gợi ý public/open_slots/quick-lobby | Không | Phòng đã cố định bộ câu chỉ nhận vé bao phủ toàn scope phòng; không đổi bộ câu của những người đã vào chỉ để khớp vé hẹp |
| §10.2–10.3 Phần còn áp dụng | Mùa theo học kỳ, reset mềm; lịch sử20; MMR; leaderboard20 tắt mặc định; không mastery | Không | Không làm hai queue, bậc kim loại/4cấp, định vị5, trần cặp3/5 hoặc cấm máy: tất cả đã bị §10.4 thay thế |
| §10.4.1 Queue / opt-out | Một queue; mặc định ranked=true trên vé; riêng từng người; người tắt vẫn chung ván và không đổi LP/MMR | Không | Có thể khởi tạo hàng rating/MMR nền cho đối thủ chưa có dữ liệu; không cộng games hoặc sự kiện hạng cho người opt-out |
| §10.4.2 Máy có hạng | Chờ 25s mới có hạng; +12 tối đa, thua−5, tối đa 3 ván/ngày; lấp FFA khi cả nhóm `bot_fill:true` | Không | Chọn máy trực tiếp từ sảnh luôn không hạng. Máy sau15 nhưng trước25 vẫn chơi được, không hạng; không ép học sinh đợi25 |
| §10.4.3 Phạm vi / hệ số | Ít nhất cả Chương, vé một Bài không hạng lúc chưa nới; rộng–hẹp trộn theo trần chung, ×1/1.1/1.2 | Không | 7 câu không chia đôi nguyên: **4 hẹp +3 rộng**, 15→8+7 nếu quản trị cho rank15; thiếu phần rộng không lấy ngoài trần, có thể hạ thành không hạng |
| §10.4.4 Chống cày | Lịch sử đúng cặp/phạm vi, từ thắng thứ 4 ×0.5; bất thường trả lời hết <2s hoặc bỏ ván;10 ván/ngày/đối thủ | Không | Ngày tính UTC+7 xuyên mã mùa, tránh đổi mùa để vượt trần. Ván vượt trần ghi sự kiện delta0 và giữ MMR; FFA theo từng cặp, không chỉ hạng1 |
| §10.4.5 Mạng | Đứt SSE không rời phòng; giữ điểm tích lũy; khiên 1/ngày nếu bị trừ; chủ động rời không dùng khiên | Không | Dấu hiệu mất mạng là luồng phòng cuối cùng bị đóng bất ngờ; đây là tín hiệu kỹ thuật, không khẳng định phân biệt được mọi kiểu chủ động ngắt mạng |
| §10.4.6–7 Bậc / MMR | 6 bậc học thuật ×3 cấp ×100 LP; sàn bậc lớn; MMR riêng môn, trung bình nhiều môn; một bậc chung trong khối/mùa | Không | Bậc/cấp/định vị suy từ LP/games, tránh lưu dư thừa. Cấp I bậc cao nhất tiếp tục tích LP, không quay vòng về0 |
| §10.4.8–10 LP / định vị / cửa sổ | Rank tối đa4; bảng2/3/4, hòa đôi+10, yếu≥150 thắng35 thua−5; định vị 3, thưởng ván2–3;250 trong8s rồi bỏ | Không | Đôi mặc định25/−10 nằm trong khoảng cho phép; thưởng định vị mặc định5 (đặc tả chưa định số), đều cấu hình. FFA hòa trung bình các vị trí chiếm rồi làm tròn |
| §10.4.11–12 Riêng tư / tham số | Ẩn mặc định; từ Tinh anh có quyền hiện; dữ liệu visibility_offer khi lên bậc; huy hiệu công khai chỉ bậc/cấp, không MMR; tham số trong settings | Không | Backend không dựng màn chúc mừng; cung cấp dữ liệu và route cho frontend. Leaderboard chỉ người đã đồng ý hiện |
| §11 Kiểu phòng | code/public/code+open_slots; đổi khi lobby chỉ chủ; nhận người cùng khối, chặn toàn nhóm; hỗ trợ duel/team/FFA; mặc định không rank | Không | Chính sách `self_created:false` mặc định; khi nhà trường bật, chỉ duel/FFA đủ điều kiện và mỗi người tự đồng ý. Đội giữ tương thích V69 1–4 người/đội, gồm2v2–4v4 yêu cầu |

## 2. Mô hình dữ liệu và bất biến

- V691 chỉ **ADD COLUMN / CREATE TABLE / CREATE INDEX**. `battle_players(user_id)` và `battle_answers` giữ nguyên PK/FK hiện có. `battle_bot_players(room_id,bot_slot)` và `battle_bot_answers(room_id,idx,bot_slot)` có FK tới phòng/câu/người máy. Adapter storage ghép thành cùng mô hình player/answer trong RAM; id máy dạng `bot:1` không bao giờ được dùng làm `users.id`. API báo cáo/chặn đòi ID tài khoản số dương. Đây là lựa chọn được nhiệm vụ cho phép, tránh phá schema người thật bằng user_id NULL.
- Cột phòng: `open_slots`, `auto_match`, `has_bots`, `auto_start_at`, `match_meta`. Nhãn suy từ `has_bots`/`open_slots`; không lưu văn bản lặp vào từng đáp án. Quy tắc rank được chụp trong `match_meta.rank_rules`, không thay điểm giữa ván nếu quản trị đổi settings.
- V692: `battle_ratings` theo người/khối/mùa; `battle_subject_ratings` theo môn; `battle_rating_events` khóa duy nhất phòng+người. Kết thúc ván gọi settle bằng **cùng transaction** lưu phòng. Advisory lock theo ID tăng dần trước khi đọc/ghi LP/MMR; rollback cùng phòng nếu lỗi, gọi lại không cộng điểm hai lần.
- Máy trả lời qua `rooms.internal`, đi vào serial queue, kiểm `index` và `schedule_version`, pha, thời hạn, trùng câu; ghi DB xong mới cập nhật RAM/phát trạng thái. Timer máy tách khỏi timer đóng câu. Câu hỏi/đáp án/lời giải theo whitelist DTO từng pha; không lộ kế hoạch máy ở question/countdown.
- Ghép giữ khóa người tăng dần, phòng dùng queue; save lỗi không gán `studentRooms`, không xóa vé. Xác nhận phòng kiểm lại điều kiện và chặn ngay trong đường vào phòng. Người rời được vào lại lobby sau xác nhận hợp lệ; không nhân đôi bản ghi player.
- Đóng app/restart vẫn đóng lobby/gián đoạn ván như V69; không tự khôi phục vé hoặc chốt LP cho ván interrupted. Mùa là mã học kỳ do quản trị chọn; reset mềm LP/MMR **lười tại ván hạng đầu mùa mới**, không cập nhật hàng loạt hay xóa lịch sử. Trước ván đầu mùa, hồ sơ chưa có hàng mới hiển thị định vị ban đầu.
- Cấu hình mặc định tắt mọi mode, kể cả leaderboard. Không bật cờ trên database nguồn. Mức thành thạo GDPT 2018 vẫn chỉ theo bằng chứng học tập hiện có; ván/rank/máy không ghi vào mastery.

## 3. Đóng các mục phản biện CHẶN và QUAN TRỌNG

| Phản biện | Xử lý / chứng cứ |
|---|---|
| CHẶN1 vé + phòng song song | `createGroup`, `acceptRoom`, `exit`, `createCore/joinUnlocked`: commit rồi chuyển; unit kiểm commit lỗi giữ vé, cùng người không tạo hai phòng; integration gợi ý và chuyển máy |
| CHẶN2 bản ghi nhận diện người nguồn | Bỏ hoàn toàn bản ghi cá nhân theo §9; bot dùng aggregate khối, không lưu user nguồn; DTO riêng theo pha, ID ảo không có quyền/lịch sử người thật |
| CHẶN3 PK/FK/timer/phát trùng | Bảng máy riêng có FK; timer riêng; nội bộ index+version; unit timer cũ/trùng/lỗi commit và integration trọn ván máy kiểm bảng thật |
| Q4 nới không nhất quán | Tập gốc + trần, nhiều lựa chọn từ đầu; unit thứ tự bản đồ, chưa luyện, strict, kết thúc giờ vàng không thu hẹp; vòng timer chạy cả một vé |
| Q5 công bằng và giao toàn nhóm | Gốc lâu nhất, giao mọi thành viên, cùng tuổi chờ khi hạ3→2; unit loại bộ ba chỉ giao từng cặp; không hứa tối ưu tổ hợp |
| Q6 tổ hợp / tải | Giới hạn50, quét luân phiên, gộp vòng đang chạy, đọc chặn lô/cache đếm; unit kiểm trần vòng. **Chưa đo tải 300 học sinh/p90 thực địa**, không coi test chức năng là nghiệm thu tải |
| Q7 gợi ý sai ván | Chỉ lobby fixed/no vote, kiểm length+seconds+scope+grade+chỗ+block, một chạm; kiểm lại khi vào, loại5phút sau rời |
| Q8 thành thạo làm thước đo ghép | Không dùng mastery để ghép; MMR riêng môn theo §10.4, không nhận level/MMR client, không phát MMR |
| Q9 party | Không có queue party; §11 mở chỗ phòng do học sinh chủ động chọn, vẫn chặn và xác nhận riêng. Không tự tạo nhóm quen rồi kéo người lẻ vào |
| Q10 hợp đồng API | Schema nghiêm ngặt, cờ/config mới, DTO và tài liệu; draw lại câu còn hiệu lực trước bắt đầu; bộ test V69 tiếp tục chạy |

## 4. Tệp thay đổi

- Mới: `backend/src/db/migration-v691-battle-flex.sql`, `migration-v692-battle-rank.sql`; đăng ký `backend/src/db/upgrade.js`. Không đổi `migration-v69-battle.sql`.
- Dịch vụ mới trong `backend/src/services/battle/`: `settings.js`, `flex.js`, `bots.js`, `goldenHours.js`, `ratings.js`.
- Dịch vụ cập nhật cùng thư mục: `matchmaking.js`, `rooms.js`, `storage.js`, `engine.js`, `deck.js`, `dto.js`, `stream.js`, `safety.js`.
- API/config: `backend/src/routes/battle.js`, `backend/src/services/practice/config.js`.
- Test: `backend/test/battle/flex-rank.test.js` mới; cập nhật `helpers.js`, `matchmaking.test.js`; `backend/test/integration/v691-battle-flex.test.js` mới, cổng **3128**.
- Tài liệu: `docs/API.md`, báo cáo này, `AI_HANDOFF.md`, thêm mục vào `AI_WORK_LOG.md`; rebuild chỉ mục `.codegraph` local.

## 5. Kiểm thử và cách chạy

Chạy trong `backend/` (PowerShell dùng `npm.cmd` vì máy này chặn wrapper `npm.ps1`; không cần đổi execution policy):

```powershell
npm.cmd test
npm.cmd run test:security
node --test --test-concurrency=1 test/integration/v69-battle.test.js test/integration/v691-battle-flex.test.js test/integration/v68-lesson-map.test.js
```

Từ gốc repo:

```powershell
node scripts/migration-safety.mjs backend/src/db/migration-v691-battle-flex.sql backend/src/db/migration-v692-battle-rank.sql
git diff --check
```

Integration cần PostgreSQL và `pg_dump/pg_restore` local có sẵn, cấu hình đọc từ `.env` nhưng không sửa. Harness clone database nguồn bằng dump chỉ đọc, tạo database `nganhang_v*_test_<timestamp>`, chạy migrations/fixtures và server riêng trên clone, dừng server rồi xóa clone/dump/uploads trong teardown. V691 chặn DB_HOST ngoài loopback. Tuyệt đối không chạy `npm run migrate` trực tiếp với cấu hình database nguồn.

| Kiểm tra | Kết quả lượt cuối | Bằng chứng |
|---|---|---|
| `npm test` | 203/203 PASS; matrixBalancer PASS | `artifacts/v691-unit.log` |
| `npm run test:security` | 27/27 PASS | `artifacts/v691-security.log` |
| Integration V69 + V691 + V68 | 24/24 PASS (V69: 6, V691: 13, V68: 5) | `artifacts/v691-integration-suite.log` |
| Migration safety | 2 tệp, `additive:true` | Đã chạy trên hai migration mới |
| Whitespace/diff | PASS | `git diff --check` |

Các ca V691 gồm ghép 2/3 nhiều lựa chọn, rộng–hẹp, nới trần, gợi ý/open_slots/quyền/chặn/rời, public auto-start, ván máy đủ 7 câu và 4 loại, dữ liệu không lộ trước reveal, bảng bot riêng, LP cùng transaction/rollback/idempotence, opt-out,50%hẹp–rộng, grant giờ vàng và banner, LP caps/streak/abnormal/network shield/season, lấp máy FFA có đồng ý, chính sách rank phòng tự tạo, huy hiệu opt-in và grant toàn khối.

Lỗi fixture đã sửa: chạy quá nhiều ván nhanh trên cùng tài khoản chạm giới hạn tạo phòng/SSE hợp lệ của sản phẩm; tách nhóm ca bằng restart **server test tạm** sau khi dọn phòng, giữ nguyên các giới hạn backend. Các ca hạng tổng hợp dùng ngày UTC+7 riêng để không lẫn trần/ngày giữa tình huống; vẫn ghi/lưu thật bằng transaction PostgreSQL. Không biến test thất bại thành skipped và không nới security production để test xanh.

## 6. Việc ngoài phạm vi / cần nghiệm thu tiếp

Không có mục backend §1–§11 chủ động hoãn. Chưa nối/kiểm UI mới, chưa nghiệm thu trải nghiệm học sinh, chưa đo tải 300 học sinh, p90 thời gian tới lúc bắt đầu và tỷ lệ bỏ chờ; chưa deploy hoặc bật cờ thật. Cần nhà trường chọn mã mùa học kỳ và tham số vận hành sau đo thực tế. Các việc này không được suy từ kết quả unit/integration. Không sửa frontend hoặc commit trong phiên này. Đã kiểm tra PostgreSQL: không còn database tạm V69/V691/V68 sau teardown.
