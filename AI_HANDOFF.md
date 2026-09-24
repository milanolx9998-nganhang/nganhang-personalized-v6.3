# AI HANDOFF

Cập nhật: 2026-09-24 · Phiên bản mã: **6.6.7** · HEAD hiện tại: `423be0c20c65a86be82a588150dc913ac9e5f3cf` · CI run `35908645526` SUCCESS · `/api/health` local đã kiểm tra

**Re-audit hiện tại:** implementation/runtime safety đã xử lý phần có thể xác minh; PERF DoD **chưa DONE**. Còn chờ staging `load100/load200`, burst k6 đủ `120/120`, NAT/IP thực tế và metrics cache-hit/DB-query/pool/p95. Không chạy load test trên production.

**Thay đổi local chưa commit sau re-audit:** k6 acceptance harness, Redis systemd template + provisioning/check scripts, Compose Redis digest/version, deploy health cache-state, PERF documentation. Chỉ commit/push khi người dùng yêu cầu.

HEAD khi bắt đầu vòng PERF trước: `cbd6558e80edbf420df4ff3f20063d4a879b42ee`

## Trạng thái hiện tại

Các thay đổi đã nằm trên `main` đến HEAD `423be0c`; phần lịch sử V6.6.5/V6.6.6 bên dưới là nhật ký cũ, không dùng làm trạng thái hiện tại.
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
- Home runtime đã verify: `nganhang.service` + Redis private systemd, Supavisor session mode, Redis failure degradation. Repo nay có `deploy/systemd/nganhang-redis.service`, `scripts/install-home-redis.sh` và `scripts/check-home-runtime.sh`.
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
3. **3 test tích hợp fail có sẵn từ trước** (đo baseline trên HEAD sạch `331be20`): hai Playwright
   timeout và một 401 phiên đăng nhập ở test competency V66. Chưa điều tra.

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
2. Commit V6.6.6.1 + dọn DB tạm (`scripts/cleanup-test-databases.mjs --apply`, user tự chạy). Commit + push V6.6.5.2 (khi user yêu cầu). Sau deploy: `npm run migrate`; seed KHTN7 cần bản
   PUBLISHED hoặc `--allow-legacy`.
3. ~~Triển khai đề xuất giao diện~~ — xong ở V6.6.6. Tiếp theo có thể: lưu "chỉnh riêng" phía máy chủ
   nếu cần giữ qua phiên; hoàn tác nhiều bước; điều tra 3 test lỗi có sẵn.
3. Nạp thật bộ 4 workbook KHTN chính thức qua hồ sơ tin cậy vào một phiên bản chương trình.
4. Nối `inferNumberingMode()` vào đường ghi khi commit lô nhập (hiện chỉ dùng ở tầng kiểm tra).
5. Viết Playwright E2E riêng cho toàn luồng V6.6.5 và chụp bộ ảnh UX.
6. Điều tra 3 test tích hợp lỗi có sẵn.
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
