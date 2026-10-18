# Triển khai backend Đấu V6.9 — Codex

Ngày: 18/10/2026. Đối chiếu kế hoạch `KE_HOACH_DAU_TRUONG_V69.md` bản 1.3, ưu tiên §23; trả lời review `V4_CLAUDE_REVIEW_BACKEND.md`. Đây là bàn giao mã backend trong workspace, chưa commit/push, chưa triển khai máy thật.

## Phạm vi và tệp thay đổi

Giữ và hoàn thiện migration cùng `engine.js`, `dto.js`, `deck.js`, `stream.js` đã viết. Có đủ đấu đôi, nhiều người, đội và phòng lớp; mọi khả năng mặc định tắt. Không thay đổi React.

| Nhóm | Tệp |
|---|---|
| Cơ sở dữ liệu | `backend/src/db/migration-v69-battle.sql`, `backend/src/db/upgrade.js` |
| Dịch vụ Đấu | `backend/src/services/battle/engine.js`, `dto.js`, `deck.js`, `rooms.js`, `matchmaking.js`, `stream.js`, `safety.js`, `storage.js`, `availability.js` |
| HTTP, cấu hình | `backend/src/routes/battle.js`, `backend/src/server.js`, `backend/src/services/practice/config.js`, `backend/src/routes/practice.js` |
| Tự luyện và hồ sơ | `backend/src/services/practice/attempts.js`, `lessonMap.js`, `portfolio.js`, `portfolioRules.js`, `studentDto.js` |
| Proxy | `deploy/Caddyfile`, `deploy/Caddyfile.home` |
| Unit và công cụ test | `backend/package.json`, `backend/test/battle/helpers.js`, `engine-dto.test.js`, `rooms.test.js`, `matchmaking.test.js`, `deck-stream-safety.test.js`, `availability.test.js`, `sseClient.js` |
| Integration, smoke | `backend/test/integration/v69-battle.test.js`, `backend/test/smoke/journeys.test.js` |
| Tài liệu | `docs/API.md`, báo cáo này, `AI_HANDOFF.md`, `AI_WORK_LOG.md` |

Lý do các tệp phụ ngoài danh sách tên ban đầu: `storage.js` tách giao dịch/biên nhận và cho phép tiêm DB giả; `availability.js` cô lập lỗi khởi tạo B0; `studentDto.js` và `portfolioRules.js` cần nhận nguồn/cột mới qua DTO; `sseClient.js` đọc luồng thật trong integration/smoke; `package.json` đưa unit Đấu vào `npm test`. Hai tệp bàn giao và bản đồ `.codegraph` cập nhật theo AGENTS.md. Không sửa báo cáo review của Claude hay thư mục `.claude/` có sẵn.

## Hiện thực phụ lục §23

| Mục | Hiện thực và kiểm chứng |
|---|---|
| 23.1 — Khóa | Mutex học sinh lấy theo ID tăng dần trước hàng lệnh phòng; tổng thời gian chờ khóa tối đa 5 giây. Tạo phòng có hàng lệnh chung để không vượt sức chứa hệ thống khi tạo đồng thời. Unit kiểm tuần tự, hết hạn, tranh chỗ cuối và trần hàng lệnh. |
| 23.2 — Biên nhận | Đóng dấu `battleReceivedAt` trước parser 16 KB; trong hàng lệnh tra biên nhận trước điều kiện pha; cùng `client_id` trả lại ACK, khác ID trả 409 kèm ACK cũ. Ghi DB và commit trước khi sửa RAM/ACK. Lấy kết nối tối đa 2 giây, ghi `statement_timeout=3s`; DB lỗi trả 503. Unit giả lập lỗi/commit; integration kiểm dữ liệu ngay sau ACK và gửi lại sau restart. |
| 23.3 — Đồng hồ | Lệnh nội bộ mang `index` và `schedule_version`, bỏ lệnh cũ. Trần 200 chỉ áp lệnh ngoài. Pause chỉ phòng lớp tại `question` trước deadline; resume tính lại deadline và loại thời gian dừng khỏi `ms`. Đóng khi tất cả xong hoặc `close_at`; phòng học sinh chuyển khi tất cả đồng ý hoặc sau 20 giây; lớp chờ giáo viên. `asked_count` ghi bền khi phát câu. |
| 23.4 — Quyền | Mất SSE không rời phòng; rời mất quyền đọc trực tiếp nhưng giữ kết quả riêng. Chặn ở phòng chờ làm người chặn tự rời; trong ván giữ ván đang chạy; phòng lớp bỏ lọc chặn. Tạm khóa rời phòng/hàng chờ và đóng luồng. Học sinh khác khối, ngoài phòng bị chặn; giáo viên phải được phân công đúng lớp và môn. Admin chỉ xem ván thông qua hồ sơ báo cáo. |
| 23.5 — Kết quả | Hạng bằng 1 cộng số người nhiều điểm hơn; không dùng tốc độ phá hòa. Podium tối đa ba người và hạng của chính em, không xuất bảng đầy đủ. Đội cố định thành viên lúc bắt đầu. Câu hỏi/kết quả/luyện lại chỉ lấy `idx < asked_count`; pha đang trả lời/paused/countdown chỉ công khai tổng điểm các câu trước. Test mọi pha, đồng hạng và kết thúc sớm/interrupted. |
| 23.6 — Luyện lại | CHECK nguồn và chỉ mục duy nhất lượt gốc `(student_id,battle_room_id)`. Kiểm sở hữu ván đã kết thúc; lấy đúng phiên bản câu sai/một phần/bỏ trống đã phát; loại câu thu hồi/cách ly và báo `excluded_questions`. Lặp yêu cầu trả lượt gốc; lượt tiếp giữ `battle_retry` và `battle_room_id`, `selection_reason='repeat'`. Nộp không tạo `mastery_events`, không tính lại mastery; vẫn lưu/chấm kết quả. Hồ sơ và huy hiệu sửa sai đếm nguồn mới; API Câu cần xem lại có nguồn Ván đấu. |
| 23.7 — SSE | Mở gửi ngay ảnh chụp đầy đủ có `run_id`, `version`; nhịp 15 giây; thay đổi thường gộp 250 ms, chuyển pha gửi ngay; không dùng lịch sử sự kiện làm nguồn khôi phục. Hợp đồng fetch/ReadableStream, backoff và xử lý 401/403/429/closed ghi trong API.md. Cả integration và smoke đọc luồng bằng fetch. |
| 23.8 — Cờ | Có `class`, `duel_code`, `lobby`, `matchmaking`, `vote`, `ffa`, `team`; kiểm tại route và dịch vụ, trả `BATTLE_FEATURE_OFF`. `battle_enabled=false` ngừng nhận ván mới; dừng khẩn cấp đóng luồng và kết thúc ván. Danh sách cờ vận hành cho phép bật true qua cả cài đặt tự luyện và quản trị Đấu; kiểm chặt cấu trúc cờ/giới hạn. Lớp hoạt động độc lập với sảnh. |
| 23.9 — Giới hạn | 1200 luồng toàn hệ thống, 2/người; 10 mở/phút; 64 KB/client; 200 lệnh/phòng, các hạn DB nêu trên. Giữ chỗ SSE trước await để chống mở đồng thời vượt trần. Cache câu đủ điều kiện theo khối 60 giây và gộp lần tải đồng thời; bốc câu luôn quét mới. Sảnh chỉ đọc chặn một lần mỗi ảnh chụp; ghép đọc toàn bộ cặp chặn một lần mỗi lượt rồi xét trong RAM. Có test 100 người đợi không ghép được, đếm truy vấn; đây chưa phải phép đo tải nghiệm thu. |
| 23.10 — Phát hành | Đã thêm smoke đấu đôi qua API/SSE. Chưa commit/push nên chưa có CI cho đúng commit, chưa đủ điều kiện up main. Người phát hành phải chạy CI và ghi mã run theo kế hoạch. Không sửa workflow hay tự phát hành. |

Migration vẫn chỉ thêm schema/mở CHECK, đã đăng ký trong upgrade và chạy cổng migration-safety. `battle_safety_events` chỉ lưu khi có báo cáo; RAM giữ tối đa 50 sự kiện/phòng, xóa sau đóng 10 phút. `purgeExpired()` chạy mỗi giờ: sự kiện 90 ngày, báo cáo một năm, ván hết năm học + 30 ngày; có unit kiểm SQL/giao dịch. Ghi audit khi tạo/bắt đầu/kết thúc ván, sửa cài đặt và xử lý an toàn, không ghi nội dung câu trả lời vào audit.

## Trả lời từng mục review V4

| Mục | Kết quả sửa | Bằng chứng |
|---|---|---|
| B0 | Bắt mọi lỗi khởi tạo, ghi cảnh báo có mã lỗi, dọn timer/luồng, đặt `ready=false`. App tiếp tục chạy; các route battle sau xác thực trả 503 `BATTLE_UNAVAILABLE` / “Đấu chưa sẵn sàng”. Tự luyện thường chỉ INSERT `battle_room_id` khi thực sự là battle_retry; hồ sơ đọc cột bằng `to_jsonb` và Câu cần xem lại kiểm bảng trước khi truy vấn. | `availability.test.js`; before-hook integration v69 khởi động trên clone thiếu bảng battle: health 200 và `/battle/me` 503, sau đó mới migrate clone; integration V6.8 chạy trên schema cũ. |
| B1 | Đáp án và pha đang chơi không phát lại sảnh. Tạo/vào/rời/thay đổi phòng chờ, bắt đầu/đóng phòng chờ và thay đổi hàng ghép mới phát sảnh. Danh tính cache 60 giây; danh sách chặn đọc một query/người/ảnh chụp, lọc phòng trong RAM. | Unit `rooms.test.js`: đếm query danh tính/chặn qua nhiều ảnh chụp, xác nhận đáp án không publish lobby. |
| B2 | Một `blockedPairs()` cho toàn bộ hàng đợi mỗi `attempt`, Set đối xứng trong RAM; đếm deck dùng cache theo khối và memo theo phạm vi trong lượt ghép. Vẫn kiểm lại an toàn khi thực sự nhận người vào phòng. | `matchmaking.test.js`: hàng đợi 100 học sinh phạm vi không đủ ghép, tối đa 3 query/lượt xét (không gồm giao dịch tạo phòng khi ghép thành công). |
| B3 | Cache danh sách câu đủ điều kiện theo khối 60 giây dùng chung cho options/count, gộp các lần tải đồng thời. Draw không dùng cache. | Unit cache một lần quét/khối, nhiều phạm vi, hết 60 giây và draw quét mới. |
| Q1 | Tách UPDATE: lobby → closed; playing → interrupted. | Unit storage.recover; integration restart giữ ACK và câu đã phát. |
| Q2 | Cả hai Caddyfile dùng `not path_regexp battle_stream ^/api/battle/(lobby\|rooms/[^/]+)/stream$`; giữ cấu hình encode còn lại. | Đã đối chiếu cấu hình tệp; máy hiện không có Caddy nên chưa chạy adapt/validate. Lệnh kiểm ghi bên dưới. |
| Q3 | “Nhanh mà chắc” xét nhóm đúng ít nhất 80%, chọn thời gian trung bình câu đúng nhỏ nhất. | Unit trường hợp 4/5 đúng và người dưới 80% không được chọn. |
| Q4 | Mastery chỉ lấy cập nhật 30 ngày; gợi ý `weak`/`recent`. Bài đang luyện dùng chung hàm chọn bài với lessonMap; thêm bài có hoạt động gần đây. Chỉ lấy ID học sinh từ phiên đăng nhập, giáo viên không nhận gợi ý học sinh. | `deck.contentOptions`, `lessonMap.currentLesson`; hồi quy V6.8 và API options trong integration. |
| Q5 | Không có câu sai trả 409 “Em không sai câu nào trong ván này”; khác với trường hợp câu sai không còn dùng được. | Integration ván đội cả hai người trả lời đúng toàn bộ. |
| Q6 | Hậu tố số theo thứ tự gia nhập, đếm cả người đã rời, không đổi tên đã cấp. | Unit tạo ba bạn trùng tên, rời và thêm người sau. |
| Q7 | Vào phòng lớp theo ID/thẻ ghim không cần cờ lobby; GET/SSE sảnh vẫn trả thẻ lớp khi chỉ bật class. | Integration chỉ bật class, thấy thẻ ghim và join theo ID thành công. |
| Q8 | Comment DTO đổi sang tiếng Việt. | Rà tệp dto và test countdown/question/paused/reveal/finished/interrupted. |
| SSE còn thiếu | Có cả slow, 429 + Retry-After, heartbeat mất quyền → left; thêm tranh chỗ đồng thời, gộp 250 ms, hết phiên. | `deck-stream-safety.test.js`. |
| Tài liệu còn thiếu | Bổ sung endpoint/quyền/payload/lỗi/cấu hình/ảnh chụp theo pha/hợp đồng SSE trong API.md và báo cáo này. | `docs/API.md`, mục `/api/battle`. |

## Chạy kiểm thử

Không cần PostgreSQL (tại `backend/`):

```powershell
npm.cmd test
npm.cmd run test:security
```

Cổng migration (tại gốc repo, chỉ đọc SQL):

```powershell
node scripts/migration-safety.mjs backend/src/db/migration-v69-battle.sql
git diff --check
```

Integration cần PostgreSQL và `pg_dump`/`pg_restore` trong PATH. Chỉ dùng máy local và tài khoản đủ quyền tạo/xóa database test. Test clone database nguồn, chỉ migrate/ghi dữ liệu trên clone, dọn bằng `test/integration/helpers/cleanup.js`; không chạy `npm run migrate` lên database đang dùng. V6.9 dùng cổng 3127, khởi động lại nhiều lần trong test để kiểm B0 và interrupted.

```powershell
# Tại backend/
node --test --test-concurrency=1 test/integration/v69-battle.test.js test/integration/v68-lesson-map.test.js
npm.cmd run test:integration
# Chỉ sau khi cấu hình DB_NAME trỏ database CI/smoke dùng một lần, đã migrate/seed:
npm.cmd run test:smoke
```

Smoke từ chối database không có hậu tố `_ci` hoặc `_smoke`. Lần chạy local đã tạo database smoke riêng, migrate/seed trong môi trường tiến trình con, chạy test và dọn database; không sửa `.env`. Không ghi thông tin kết nối hay tài khoản mẫu vào báo cáo.

Khi có Caddy, chạy tại gốc repo trong môi trường có các biến placeholder cần thiết; chỉ adapt/validate, không reload dịch vụ:

```powershell
caddy adapt --config deploy/Caddyfile --adapter caddyfile --pretty
caddy validate --config deploy/Caddyfile --adapter caddyfile
caddy adapt --config deploy/Caddyfile.home --adapter caddyfile --pretty
caddy validate --config deploy/Caddyfile.home --adapter caddyfile
```

### Kết quả đã chạy tại workspace ngày 18/10/2026

| Kiểm tra | Kết quả | Bằng chứng local |
|---|---|---|
| `npm test` | **186/186**, 0 fail/skip; bộ matrixBalancer đi trước cũng đạt | `artifacts/v69-unit.log` |
| `npm run test:security` | **27/27**, 0 fail/skip | `artifacts/v69-security.log` |
| V6.9 + V6.8 chạy riêng, tuần tự | **10/10** ở lượt đầu; sau đó bổ sung ca gợi ý riêng và chạy lại trong toàn bộ integration | `artifacts/v69-regression.log` |
| `npm run test:integration` | **177/177**, 0 fail/skip: 171 ca cũ + 6 ca V6.9, khoảng 218 giây | `artifacts/v69-all-integration.log` |
| Smoke, DB trắng dùng một lần đã migrate/seed | **6/6**, gồm hành trình đấu đôi API/SSE | `artifacts/v69-smoke.log` |
| Migration safety | `checked:1, additive:true` | Chạy trực tiếp cổng trên migration V6.9 |
| `git diff --check` | Đạt; Git chỉ nhắc LF/CRLF theo cấu hình Windows | Chạy tại gốc repo |

PostgreSQL local chạy được; các database test mới và tiến trình server test được dọn sau test. Không truy cập mạng ngoài, không migrate database nguồn, không sửa `.env`. Không cần build frontend vì không đổi frontend. Đã đồng bộ CodeGraph local (345 tệp trong chỉ mục, gồm 340 tệp mã nguồn) và sinh lại `.codegraph/repo-map.md`; tệp JSON/HTML từ lần sinh cũ được giữ nhưng đánh dấu không hiện hành trong map mới.

## Phần chưa làm, khác biệt và giới hạn

- Không có giao diện React, sessionStorage/client retry hay UX xử lý lỗi của ứng dụng; đã ghi hợp đồng cho người làm frontend. Không thay đổi hay build frontend.
- Chưa đo tải qua Caddy với 300 học sinh + phòng 50 người + reconnect đồng loạt; chưa chứng minh p95/p99 hoặc mức ảnh hưởng ≤20% lên tự luyện. Test đếm truy vấn không thay thế phép đo này. Chưa chạy Caddy thực tế vì máy không cài binary.
- Chưa có CI của commit cuối, chưa deploy, chưa bật cờ trên hệ thống thật. Các kiểm tra local không đủ thay cổng §23.10.
- B0 giữ Đấu không khả dụng suốt vòng đời tiến trình sau lỗi khởi tạo; sau khi người vận hành hoàn tất migration/sửa nguyên nhân cần khởi động lại app. Không tự chạy migration hay vòng retry khởi tạo.
- Ván đang làm chứng cứ của báo cáo/sự kiện còn hạn được giữ tới khi hồ sơ hết hạn để không phá FK và mất bằng chứng. Đây là ngoại lệ giữ dữ liệu so với “hết năm học + 30 ngày”; khi năm học không có ngày chuẩn, dùng mốc 31/7 của năm học suy từ ngày tạo. Cần người vận hành rà ngày năm học trước khi bật.
- Podium chỉ ba người: đồng điểm vẫn cùng hạng, thứ tự ổn định theo người vào phòng; nếu hơn ba người đồng hạng thì không nới thành bảng dài. Mỗi học sinh luôn có hạng riêng.
- Máy chủ phòng/hàng ghép/khóa chạy trong một tiến trình Node theo thiết kế; không dùng nhiều worker cho Đấu khi chưa có cơ chế chia sẻ quyền sở hữu phòng. Restart không khôi phục chơi tiếp, chỉ công bố interrupted.
- Test integration dùng fixture bảy câu và cơ chế kết thúc câu sớm khi mọi người đã chốt; không thay đồng hồ production. Test sát hạn dùng giờ máy chủ và cửa sổ close thật, biên đúng bằng close_at kiểm bằng đồng hồ tiêm trong unit. Không kiểm mô phỏng mạng di động hoặc trình duyệt giao diện Đấu.
