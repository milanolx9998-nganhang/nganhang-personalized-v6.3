# AI HANDOFF

Cập nhật: 2026-09-24 · Phiên bản mã: **6.6.7**

**Trạng thái nhánh (pre-merge final hardening):**
- `main` an toàn: `423be0c20c65a86be82a588150dc913ac9e5f3cf` (CI run `35908645526` SUCCESS · `/api/health` local đã kiểm tra). `main` chưa nhận phần follow-up.
- Follow-up re-audit đã được **commit/push trên branch `perf-v6671-followup`**. Base follow-up commit: `69108dc6befbb4fec3baf2083c99d07d3ffbc57d`. Gồm:
  - k6 acceptance harness;
  - Redis systemd template + provisioning/check scripts;
  - Compose Redis digest/version;
  - deploy health cache-state;
  - PERF documentation.
- Sau base có:
  - commit docs-only thêm `docs/RUNBOOK_SIEU_CHI_TIET_AI_PERF_V6.6.7.1_PRE_MERGE.md`;
  - commit pre-merge hardening `3ed2257` (handoff này + k6 release-gate 2m/5m/1m);
  - commit sửa 3 test v63 tồn lâu năm (nay 50/50), thêm `backend/scripts/data-health.mjs` (báo cáo dữ liệu, chỉ đọc) và hướng dẫn deploy cho AI trên máy Ubuntu `docs/HUONG_DAN_AI_UBUNTU_DEPLOY_V6.6.7.1.md`.

  HEAD hiện tại của branch: xem `git log perf-v6671-followup` (không ghi cứng ở đây để khỏi cũ).
- Branch **chưa merge `main`, chưa auto-deploy**. Deploy + sửa dữ liệu do AI trên máy Ubuntu làm theo `docs/HUONG_DAN_AI_UBUNTU_DEPLOY_V6.6.7.1.md`: push fast-forward `main` → CI "Verify & Deploy" → `data-health` → seed KHTN7 nếu thiếu. Nhánh không đổi `backend/src` / `frontend/src` / SQL.

**Deploy Home:**
- 2026-09-24: `main` = `a344eeb` (CI run 35965226544 SUCCESS; backup `backups/2026-09-24T06-34-06-238Z`; health ok, cache ok); sau đó `33dd060` (CI run 35994545299 SUCCESS).
- 2026-09-25: audit + sửa nhỏ (mã thoát script nạp chương trình, chặn Bài thiếu số, che route truy vấn chậm, cổng test), đẩy `main` = `1ce88c6` (CI run 36071707977: lần 1 SUCCESS nhưng Verify mất 20 phút vì máy Home quá tải — load 35–48, swap cạn; lần 2 do AI Ubuntu bấm chạy lại cũng SUCCESS, deploy lại cùng commit). 2026-09-25 14:47 anh Hiếu bảo đẩy main → `main` = `9ed430a` (CI run 36109472066: Verify 49 giây, Deploy 36 giây, SUCCESS; script deploy tự backup + migrate + health). Đã lên web: `timeout-minutes: 45` cho job Verify; màn Chuẩn đầu ra hiện mã nguồn `L.2.1` thay mã máy; **migration mới `migration-v6672-school-bank-name.sql`** (đổi tên kho trường thành "Kho trường", script deploy tự backup + migrate). Test: unit 125/125, security 27/27, build đạt, integration 153/156 (3 lỗi do hết kết nối PostgreSQL local khi chạy song song; chạy riêng 4/4).
Còn mở:
- chờ anh Hiếu: rà cài đặt hiển thị repo GitHub + runner self-hosted (đã báo trong chat 2026-09-25); trước khi đổi phải kiểm máy Home `git fetch` xác thực bằng gì, nếu không deploy sẽ hỏng;
- KHẨN (2026-09-25): rà bảo mật stack Supabase Home + xoay vòng khóa Supabase theo danh sách trong chat. Không ghi giá trị khóa vào repo/ghi chú;
- link công khai là `https://studylab.io.vn` (+ `www`): Cloudflare Tunnel `supabase` → `localhost:3001`; health ok 6.6.7 (kiểm 2026-09-24). `nganhang.studylab.io.vn` không dùng, không có DNS. `supabase.studylab.io.vn` → Kong `localhost:8000` đang mở công khai (Studio Basic Auth, REST cần key) — trái runbook "Studio chỉ mở tạm", chờ anh Hiếu quyết đóng hay giữ;
- đã xác nhận server không có Outcome/YCCĐ (mọi môn); 80 câu KHTN 9 có mã (`DRAFT`) chờ nạp chương trình → `reresolve-question-codes.mjs` (hướng dẫn §10);
- seed Bài ↔ YCCĐ KHTN 6–9 đã dựng (`src/db/seed-khtn-lessons.js`, dữ liệu `seed-data/khtn{6..9}-lessons.json`, rà soát `docs/KHTN_BAI_YCCD_SEED_REVIEW.md`); workbook chính thức (bản sạch) đã vào repo `src/db/seed-data/curriculum/`; máy chủ nạp bằng `scripts/import-khtn-curriculum.mjs` (hướng dẫn §10) — anh Hiếu đã chốt 2026-09-24: khối 7, 9 dùng `--accept-source-warnings`; khối 8 đã đánh lại số YCCĐ từ 1 trong từng Chủ đề trong repo (quy tắc khối 7), không cần cờ; mã câu khối 8 dùng số mới (H.2.4 cũ → H.2.1). **2026-09-25 AI Ubuntu đã chạy §10 trên `1ce88c6`: A1 (4 khối đã PUBLISHED sẵn, không nạp lại), A2 seed thật 4 khối (links 9:188, 6:75, 7:88, 8:187; khối 9 sửa phân môn 2 Bài), A3 nhận lại 80/80 câu, A4 data-health blocking=0 attention=0.** KHTN 8 trên máy chủ đã xác nhận dùng số mới (`GDPT2018-KHTN8-2026-09-24`, công bố 18:52 ngày 24/09 sau deploy `33dd060`; Hoá Chủ đề 2 = YCCĐ 1..8). Còn: data-health báo migration applied 29 > expected 27 (2 tên cũ trong app_migrations, không chặn). Anh Hiếu thay file khối 8 trên ổ G bằng bản repo để giáo viên dùng số mới; `seed-khtn7-vatli-lessons.js` cũ đã được gộp, không chạy riêng;
- 2026-09-25 17:06 `main` = `f6bb759` (CI run 36122161793 SUCCESS: Verify 51 giây, Deploy 30 giây): nhãn nguồn `L.2` / `L.2.1` cho mọi màn hiện mã Outcome/YCCĐ (API thêm `outcome_label`/`yccd_label`, mã máy giữ nguyên để đối chiếu);
- **Phương án V6.7 (chốt 2026-09-25, xem AI_WORK_LOG):** giai đoạn 0 an toàn → 1 giảm ma sát → 2 đánh bóng → 3 thử với người thật. Chưa làm wizard giao bài / ma trận.
- smoke UI đăng nhập chưa làm.

**PERF DoD: NOT DONE.** Không chạy load test trên production.

| Gate | Trạng thái |
|---|---|
| staging load100 | PENDING |
| staging load200 | PENDING |
| burst staging (start/submit 120/120) | PENDING |
| soak staging | PENDING |
| NAT/IP thực tế | PENDING |
| cache hit / DB query reduction | PENDING |
| DB pool under real load | PENDING |
| Redis peak / evictions | PENDING |
| save p95/p99 | PENDING |
| shared curriculum cache | PARTIAL |

Khi chạy acceptance staging: **không đặt `USERS` thấp hơn target**. load100 cần ≥ 100 tài khoản độc lập, load200 cần ≥ 200. Chỉ đặt thấp hơn khi cố ý kiểm tra việc dùng lại tài khoản.

HEAD khi bắt đầu vòng PERF trước: `cbd6558e80edbf420df4ff3f20063d4a879b42ee`

## Trạng thái hiện tại

Các thay đổi đã nằm trên `main` đến `423be0c`; phần follow-up PERF nằm trên branch `perf-v6671-followup` (xem đầu file). Phần lịch sử V6.6.5/V6.6.6 bên dưới là nhật ký cũ, không dùng làm trạng thái hiện tại.
V6.6.4 và các vòng sau đã được commit/push; không suy ra trạng thái release từ các câu “chưa commit” trong các mục lịch sử.

Nội dung vòng V6.6.5:

1. **Curriculum Auto Resolver** — mã câu `Câu L. 2. 1. NB. 2. ĐS` + ngữ cảnh Môn/Khối → Outcome/YCCĐ
   exact → Bài qua `topic_yccd_map`. Không cần giáo viên chọn lại khi khớp chính xác.
2. **Question Workspace UX** — Kho/Nhập/Duyệt chung một vỏ, lọc mặc định 5 ô, bảng 6 cột,
   nhập 3 bước, bulk và editor chỉ hiện khi cần.
3. **Hồ sơ nhập chương trình tin cậy** `KHTN_OUTCOME_YCCD_OFFICIAL_V1` cho bộ 4 workbook KHTN 6–9.
4. **Gán Bài hàng loạt** theo nhóm YCCĐ, đi qua `persistQuestion`.

**Migration V6.6.5 là additive và đã áp lên DB local.** Máy chủ thật sẽ tự áp khi deploy.

## PERF V6.6.7 — Redis tùy chọn, Supavisor, tối ưu luồng làm bài (đã commit ở `423be0c`; re-audit chưa DONE)

Chi tiết + số đo + checklist server: `docs/PERF_V6_6_7_REDIS_SUPAVISOR.md`.
- Redis **tùy chọn**: `REDIS_URL` trống / Redis sập thì app vẫn chạy (`/api/health` → `cache: degraded`). Cache catalog / bài giao / dashboard / số đếm; không cache bài làm / đáp án. Thế hệ nội dung đổi khi giáo viên / quản trị ghi thành công.
- Rate limit dùng store Redis, tự quay về bộ nhớ. **Login theo IP chỉ đếm lượt thất bại** (trước: cả lớp đăng nhập cùng lúc bị 429). Trần IP chỉnh qua `RATE_LIMIT_*`; kiểm NAT bằng `GET /api/practice/operations/client-ip`.
- bcrypt đăng nhập chạy trong worker thread; tạo bài insert theo lô; Player không tải lại sau khi chốt.
- Số liệu `/api/practice/operations`: `db.pool`, `db.queries.recent_slow`, `cache`, `rate_limit`, `hash_workers`.
- Home runtime đã verify: `nganhang.service` + Redis private systemd, Supavisor session mode, Redis failure degradation. Branch `perf-v6671-followup` (từ `69108dc`, chưa ở `main`) thêm `deploy/systemd/nganhang-redis.service`, `scripts/install-home-redis.sh` và `scripts/check-home-runtime.sh`.
- Re-audit còn release gate: staging `load100/load200`, burst k6 đủ `120/120`, NAT/IP thực tế, cache-hit/DB-query/pool/Redis peak metrics và p95 save. Không chạy load test trên production.

## V6.6.6.3 — Sửa theo audit `e243b69` (mục lịch sử; đã được tích hợp vào các commit sau)

Chi tiết: `docs/V6_6_6_3_AUDIT_E243B69_FIXES.md`.
- `POST /practice/imports/:id/submit` gọi lại an toàn: trả `submitted_now / already_submitted / already_handled / not_submitted`
  (trường `submitted` cũ bỏ). Câu đã chờ duyệt / đã duyệt không còn bị tính "chưa gửi được".
- `confirm` trả thêm `processed_items`, `unique_questions` (`imported` = processed_items, giữ cho client cũ).
- Không migration. Audit khuyên: sau vòng này dừng chức năng mới, chuyển UAT bằng file Word thật.

## V6.6.6.2 — Sửa theo audit `c92054a` (đã commit ở `e243b69`)

Chi tiết: `docs/V6_6_6_2_AUDIT_C92054A_FIXES.md`.
- Hoàn tác trả được mức `null` và đúng mã hiển thị cũ (API công khai vẫn chỉ nhận 1..4).
- `POST /practice/imports/:id/submit`: gửi duyệt cả lô nhập, máy chủ chia ≤500 câu mỗi transaction, trả `submitted / not_submitted / blocked`.
- `confirmJob` trả `lessons: {assigned, unassigned}` cho cả lô.
- Dọn `question_edit_operations` hết hạn > 30 ngày (khởi động + mỗi 24 giờ). Dòng khởi động/health lấy version từ package.json.
- Không migration mới. Còn theo dõi: exception-counts ~1,1 s ở 20k.

## V6.6.6.1 — Sửa theo audit `a34aab4` (đã commit ở `c92054a`)

Chi tiết + số đo: `docs/V6_6_6_1_AUDIT_A34AAB4_FIXES.md`. Điểm chính:
- **Bỏ hẳn `allow_unlinked`** (gửi lên → 400). Hoàn tác sửa nhanh / gán Bài qua `undo_token` do máy chủ lưu ở
  `question_edit_operations`: `POST /practice/questions/edit-operations/:id/undo`, chỉ người làm, trong 30 phút,
  từ chối nếu câu đã bị sửa tiếp (`UNDO_STALE`). **Migration mới `migration-v6661-edit-ops.sql` — deploy xong phải `npm run migrate`.**
- Kiểm tra máy so phân môn L/H/S của mã với Outcome; công thức nhóm ngoại lệ một chỗ (`EXCEPTION_FORMULA`).
- Import: cảnh báo "Môn:" lệch, Chương kỳ vọng, câu nghi trùng vẫn nhập → hồ sơ `DUPLICATE_SUSPECT`; nút gửi duyệt sau nhập gửi thật.
- Test tích hợp tự xóa DB/dump/uploads tạm (`KEEP_ARTIFACTS=1` để giữ). Tồn đọng cũ chờ user:
  `node scripts/cleanup-test-databases.mjs --apply` (238 DB ≈ 3,2 GB).
- Test tải `v6661-scale.test.js` (20k câu): đếm chip ~1,1 s là API nặng nhất.

## V6.6.6b — Đồng bộ giao diện toàn web (mục lịch sử; đã được tích hợp vào các commit sau)

Font chung **Lexend** (+ JetBrains Mono cho mã câu), đóng gói trong build (chạy offline trong LAN). Một bảng
màu cho cả web theo demo; `frontend/src/styles/theme.css` nạp **sau cùng** trong `main.jsx` (đặt ở App.jsx sẽ
bị global.css đè). Test chụp giao diện `backend/test/integration/v666-ui-gallery.test.js` → `artifacts/ui-*.png`.
Chi tiết: `docs/V6_6_6_UNIFIED_WORKBENCH.md` §5.

## V6.6.6 — Bàn làm việc hợp nhất (mục lịch sử; đã được tích hợp vào các commit sau)

Cập nhật: 2026-09-23. User duyệt đề xuất giao diện ("duyệt, làm full nhé"). Chi tiết: `docs/V6_6_6_UNIFIED_WORKBENCH.md`.

- **Kho = bàn làm việc 3 cột:** "Việc của tôi" (đếm máy chủ + góc nhìn tự lưu) · lưới · khung xem + sửa
  nhanh. Phạm vi "Chỉ câu này ⇄ Cả lô" (G), đánh dấu "chỉnh riêng", phím 1–4 mức, B gắn Bài, Ctrl+Z hoàn
  tác, Ctrl+K bảng lệnh.
- **API mới:** `POST /practice/questions/quick-edit[/preflight]` (mức/Bài, tất cả hoặc không, trả
  before/after để hoàn tác, `regenerate_code` tường minh, `expected_versions` là UUID);
  `GET /practice/questions/view-counts`; lọc `created_after`, `returned=1`; assign-lesson trả `before_topic_id`.
- **Duyệt:** phần sạch duyệt một lần sau checklist; lý do trả sửa một chạm, gợi ý từ kiểm tra máy.
- **Nhập:** "Sửa theo nhóm vấn đề" + Ctrl+K.
- Không có migration mới.

Kiểm chứng: unit 113/113 · pilot 34/34 · v63 47/50 (3 lỗi có sẵn) · v664 12/12 · bootstrap 7/7 ·
resolver 10/10 · v6652 14/14 · **v666 7/7 (có Playwright)** · build OK.

## V6.6.5.2 — Nhập Word thông minh, tự nhận chương trình, duyệt theo ngoại lệ (mục lịch sử; đã được tích hợp vào các commit sau)

Cập nhật: 2026-09-23. Chi tiết đầy đủ: `docs/V6_6_5_2_SMART_WORD_IMPORT.md`.

- **Nhập:** chỉ cần Môn + Khối + tệp Word. Mã câu tự ra Outcome/YCCĐ/Mức/Dạng/Bài. "Tùy chọn thêm"
  (Phân môn/Bài/Mức/Dạng) chỉ là **kỳ vọng** — lệch mã thì cảnh báo `OPTIONAL_*_MISMATCH`, không đè;
  câu không mã dùng kỳ vọng làm giá trị dự phòng. Ngữ cảnh lưu ở `import_jobs.context` (migration
  `migration-v6652-import-context.sql`, additive, **đã áp local**).
- **Mức nghiêm trọng:** blocking (mã sai, Outcome/YCCĐ không có, YCCĐ ngừng dùng, xung đột mã–phân
  loại, lệch ngữ cảnh) / review (Bài, trùng, kỳ vọng) / info. `category`: AUTO_RESOLVED /
  VALID_METADATA / NEEDS_REVIEW / ERROR.
- **Lưu câu:** bất biến mã–phân loại (409 + `suggested_code`, `regenerate_code`); tạo tay sinh mã chuẩn.
- **Duyệt:** `reason_codes` kiểm ở máy chủ + nhật ký; lọc ngoại lệ `exception=`; dải kiểm tra máy
  `checks`; duyệt phần sạch + "Xem M câu còn lại".
- **Chương trình:** nguồn chính thức do máy chủ quyết (bỏ checkbox); `GET /api/curriculum/health`.
- **Seed KHTN7:** nay đòi bản **PUBLISHED**; máy chưa có (như local) → dừng `NO_PUBLISHED_VERSION`,
  dùng `--allow-legacy` nếu cố ý liên kết vào dữ liệu cũ.
- **Đề xuất giao diện** (lượt sau có thể triển khai): canvas https://claude.ai/artifact/AXCT9nbHYPpaSCHZR9jsUv
  (riêng tư — chỉ chủ sở hữu mở được cho tới khi chia sẻ).

Kiểm chứng: unit 113/113 · pilot 34/34 · v63 47/50 (3 lỗi có sẵn) · v664 12/12 · bootstrap 7/7 ·
resolver 10/10 · v6652 14/14 · frontend build OK.

## Hotfix sau audit `3ab8f7f` — V6.6.5.1 (đã xong)

**Trusted source hardening:** máy chủ không còn tin `source_profile` do client gửi; tự nhận diện lại
hồ sơ nguồn, bắt sheet đúng khối, dùng ánh xạ cột tự suy ra, lệch thì 409. Tải tệp mới không còn xóa
ánh xạ vừa nhận diện. Giao diện không lấy tạm sheet đầu tiên nữa.

**Power workflow:** Shift+tick chọn khoảng · lý do trả sửa có mã (bỏ `window.prompt`) · thanh bulk gọn
dính đáy, checklist/lý do/preflight chỉ mở theo thao tác · phím `E` xem kỹ · cảnh báo cách đánh số
Mode A/B hiện ở màn nhập.

**Dữ liệu KHTN 7 Vật lí:** đã nạp 13 Bài + 31 liên kết Bài↔YCCĐ. Dữ liệu nguồn trích sẵn và commit tại
`backend/src/db/seed-data/khtn7-vatli-lessons.json`; máy chủ chạy `npm run seed:khtn7-lessons` sau
deploy (idempotent). Chi tiết và quyết định về cách đánh số: `docs/KHTN7_VATLI_BAI_YCCD.md`.

Chi tiết vòng này: `docs/V6_6_5_1_TRUSTED_HARDENING_POWER_DELTA.md`.

## Hotfix sau audit `2f7ace2` (đã xong)

Audit GitHub phát hiện 3 lỗi P1 + 3 P2 ở Curriculum Auto Resolver. Đã sửa toàn bộ:

1. Số thứ tự Outcome/YCCĐ **luôn lấy từ nguồn**, không tự đếm lại (trước đây `H.2.4` bị biến thành `H.2.1`).
2. Resolver **chốt vào phiên bản chương trình đang hiệu lực**, không chỉ lọc `status='ACTIVE'`.
3. Hồ sơ nhập tin cậy **tự điền mapping cột** trong giao diện, không bắt map lại.
4. Đã **nạp thật bộ 4 workbook KHTN** trong test tích hợp: 5/5 PASS.
5. Mode B kiểm ở **mức cả lô**, không đòi mỗi YCCĐ đủ 10 câu.
6. Tách **"tự nhận diện từ mã"** khỏi "hợp lệ theo metadata" ở màn hình nhập.

Chi tiết: `docs/V6_6_5_ACCEPTANCE.md`.

**Việc cần người quyết:** workbook lớp 8, Chủ đề `18.Bảo vệ môi trường` có **hai YCCĐ khác nhau cùng
đánh số 1** trong chính văn bản nguồn. Hệ thống chặn và bắt sửa số, không tự đánh lại. Cần người phụ
trách chương trình rà hai dòng này trước khi nạp vào môi trường thật.

## Rủi ro cần xử lý

1. **Token GitHub lộ trong `.git/config`** — remote `origin` nhúng PAT plaintext. Cần thu hồi và đổi
   sang SSH/credential helper. Tồn từ vòng V6.6.4, **vẫn chưa xử lý**.
2. **Nghiệm thu máy chủ chưa chạy** — `SERVER_DEPLOY_UAT_NOT_RUN`, `ROOT_CAUSE_NOT_CONFIRMED` cho sự cố
   deploy run `35674256160`. Vòng V6.6.5 chủ động gác hạ tầng: `DEFERRED_INFRA_NOT_BLOCKING_UX_V665`.
3. ~~3 test tích hợp fail có sẵn từ trước~~ — **đã sửa (2026-09-24)**, v63 50/50. Cả 3 đều là lỗi test, không phải lỗi app:
   - #30 chờ giao diện Kho cũ (trước V6.6.4) → cập nhật theo bàn làm việc.
   - #47 dùng token học sinh đã bị V652 đăng xuất ("đăng xuất mọi nơi") → `refreshTokens()`.
   - #50 là lỗi dây chuyền. Thêm: server test v63 nới `RATE_LIMIT_API_USER` để 429 không che lỗi thật.

## Kiểm chứng đã chạy

Chạy tuần tự trên Windows + PostgreSQL 16 local; tích hợp clone DB dùng một lần.

| Bộ | Kết quả |
|---|---|
| `npm test` (unit) | 88/88 |
| `npm run test:security` | 27/27 |
| `test/integration/pilot.test.js` | 34/34 |
| `test/integration/v664-bulk.test.js` | 12/12 |
| `test/integration/v665-resolver.test.js` | 10/10 |
| `test/integration/v665-bootstrap.test.js` (4 workbook thật) | 5/5 |
| `test/integration/v63.test.js` | 47/50 (3 lỗi có sẵn) |
| `npm run build` (frontend) | PASS |

**Tổng 188 pass / 3 fail, cả 3 đều có sẵn từ trước.**

Test bootstrap cần bộ 4 workbook tại `G:/tai lieu  oppa/UP SHARE/outcome khtn`; không có thì tự bỏ qua
kèm lý do, không báo đỏ giả.

Lưu ý khi chạy lại: **đừng dùng `npm run test:integration` để lấy kết luận** — chạy song song các file
tích hợp gây fail dây chuyền giả. Chạy từng file một.

## Việc tiếp theo

1. Thu hồi và thay GitHub token (ưu tiên cao nhất, tồn hai vòng).
2. Audit cuối branch `perf-v6671-followup` → chỉ sau đó mới merge `main`. Rồi chạy các gate staging ở bảng đầu file.
   Dọn DB tạm local (`scripts/cleanup-test-databases.mjs --apply`, user tự chạy). Sau deploy: `npm run migrate`. Seed KHTN7 cần bản
   PUBLISHED hoặc `--allow-legacy`.
3. ~~Triển khai đề xuất giao diện~~ — xong ở V6.6.6. Tiếp theo có thể: lưu "chỉnh riêng" phía máy chủ
   nếu cần giữ qua phiên; hoàn tác nhiều bước; điều tra 3 test lỗi có sẵn.
3. Nạp thật bộ 4 workbook KHTN chính thức qua hồ sơ tin cậy vào một phiên bản chương trình.
4. Nối `inferNumberingMode()` vào đường ghi khi commit lô nhập (hiện chỉ dùng ở tầng kiểm tra).
5. Viết Playwright E2E riêng cho toàn luồng V6.6.5 và chụp bộ ảnh UX.
6. ~~Điều tra 3 test tích hợp lỗi có sẵn~~ — xong, v63 50/50.
7. Lấy `journalctl` trên máy chủ để kết luận sự cố deploy; đóng gói release (releases/ còn ở v6.5.3).

## Quy ước cho AI agent (2026-09-23)

Repo có `AGENTS.md` ở gốc — luật vận hành cho mọi agent (Claude Code, Cursor, Codex,
Hermes...). Đọc trước khi thao tác. Điểm chính: **không tự poll job chạy nền bằng vòng
lặp sleep** (harness tự đánh thức khi job xong; poll đốt context + chi phí API và gây
compaction giữa task), ưu tiên LSP/`.codegraph` trước grep, bắt buộc cập nhật
`AI_WORK_LOG.md`/`AI_HANDOFF.md` trước khi kết thúc việc có ý nghĩa.

Luật no-polling cũng đã đặt ở mức global cho Claude Code tại
`~/.claude/rules/no-poll-background-jobs.md` (ngoài repo, không theo repo khi clone).

## Tài liệu

- `docs/V6_6_5_CHANGES.md` — đã sửa gì, đã đạt gì (vòng này)
- `docs/V6_6_5_QUESTION_WORKSPACE_CURRICULUM_RESOLVER.md` — thiết kế resolver + UX
- `docs/V6_6_4_CHANGES.md`, `docs/V6_6_4_QUESTION_POWER_WORKFLOW.md` — vòng trước
- `docs/V6_6_4_DEPLOY_INCIDENT.md`, `docs/V6_6_4_DEPLOY_RUNBOOK.md` — deploy
- `artifacts/v665-question-resolver-acceptance.json`, `artifacts/v664-acceptance.json` — nghiệm thu
