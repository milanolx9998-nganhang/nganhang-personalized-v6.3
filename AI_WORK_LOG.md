# AI Work Log

> Ghi chú trạng thái: các mục bên dưới là nhật ký theo thời điểm. Trạng thái hiện tại phải đọc ở `AI_HANDOFF.md` và kiểm tra lại bằng `git status`, `git rev-parse HEAD` cùng CI/runtime; không dùng câu “chưa commit” trong mục lịch sử làm trạng thái hiện tại.

## 2026-09-24 — Re-audit HEAD 423be0c: đóng gap reproducibility và acceptance harness

**Nguồn:** `RE_AUDIT_V6.6.7.1_HEAD_423be0c.md`.

**Đã xử lý:**
- K6 thêm `load50`, `load100`, `load200` chạy riêng; thêm threshold `start`, ngưỡng riêng 100/200 và custom counter/rate bắt buộc burst đủ `120/120`.
- Thêm `deploy/systemd/nganhang-redis.service`, `scripts/install-home-redis.sh` và `scripts/check-home-runtime.sh`; không chứa secret, Redis bind loopback, digest pin, 256 MB LRU, không persistence.
- Compose pin Redis bằng digest và đồng bộ app image mặc định với package version `6.6.7`.
- Deploy health parse JSON và log `CACHE_OK` hoặc `CACHE_DEGRADED`, không đánh tráo Redis optional thành deployment failure.
- PERF report sửa các kết luận p95/local và key `catalog v2`/`content-options`; AI handoff bỏ trạng thái stale “chưa commit/chờ Redis thật”.

**Kiểm chứng:** `bash -n` các script, `node --check` k6 + fixture tests, `git diff --check`, Compose config bằng env placeholder tạm, và `REQUIRE_REDIS=1 scripts/check-home-runtime.sh` đạt. Backend unit/practice đạt `124 pass, 0 fail, 1 skipped`; security `27/27`; frontend build PASS. Hai fixture export/QTI được sửa để dùng đúng `UPLOAD_DIR` local, không chạm dữ liệu `uploads/` cần giữ. Chưa chạy k6 vì máy chưa có binary và chưa có staging credentials; không chạy production.

**Còn release gate:** staging `load100/load200`, burst k6 thật, NAT/IP qua Caddy, cache-hit/DB-query/pool/Redis peak metrics và p95 save. Chỉ commit/push khi người dùng yêu cầu.

## 2026-09-23 — V6.6.5.1 hotfix theo audit `3ab8f7f` + nạp Bài khối 7

**P1 — trusted source hardening**
- Tải tệp mới ghi đè ánh xạ vừa nhận diện (`setSheet`/`setColumns` chạy sau `readJob`) → bỏ.
- `mapImport` tin `source_profile` client gửi → nay máy chủ tự `detectTrustedProfile()` lại trên
  workbook đã lưu, bắt sheet thuộc hồ sơ, bắt khối khớp version, **dùng header/cột tự suy ra**,
  lệch thì 409 (`TRUSTED_SOURCE_NOT_DETECTED` / `_SHEET_UNKNOWN` / `_GRADE_MISMATCH`).
- Giao diện bỏ fallback `trusted.sheets[0]`; không có sheet đúng khối thì chặn hẳn.
- Thêm 2 ca âm vào `v665-bootstrap.test.js` (7/7).

**P2 — power workflow**
- Nối `inferNumberingMode`/`checkNumbering` vào màn nhập qua `job.numbering` (tính khi đọc, không cần
  migration); ghi `numbering_mode` khi confirm.
- Shift+tick chọn khoảng (`selection.selectRange`, mốc neo trong `useRef`).
- `RejectReasonPopover` — 7 lý do có `reason_code`, thay `window.prompt` ở cả Kho và Duyệt.
- Thanh bulk gọn dính đáy (`.bulk-bar`); checklist/lý do/preflight chỉ mở theo thao tác.
- Phím `E` mở rà soát chi tiết.

**Dữ liệu khối 7 (theo yêu cầu của người dùng)**
- Hai nguồn đánh số YCCĐ khác nhau: CSDL đánh 1..n trong từng Outcome (10 Outcome Vật lí), tệp mới
  đánh STT 19–49 toàn khối (13 Outcome). Đối chiếu **31/31 khớp nguyên văn**.
- **Giữ nguyên cấu trúc CSDL**, chỉ dùng tệp mới cho phần thiếu là Bài + liên kết Bài↔YCCĐ, vì đổi
  cách đánh số sẽ làm mọi mã câu khối 7 đã viết trỏ sai. Đây là quyết định của người phụ trách
  chương trình, đã nêu rõ cho người dùng.
- Ghép bằng **nguyên văn**, không bằng số. Dữ liệu trích sẵn thành
  `backend/src/db/seed-data/khtn7-vatli-lessons.json` (commit cùng mã, vì DB không đi theo git) +
  script idempotent `npm run seed:khtn7-lessons`. Đã nạp local: 13 Bài, 31 liên kết.

**Kiểm chứng:** 196 pass / 3 fail (3 lỗi có sẵn từ trước).

**Bẫy đã gặp:** đổi class `.bulk-toolbar` → `.bulk-bar` làm assertion trong `pilot.test.js` kiểm một
class không còn tồn tại (vẫn xanh nhưng mất ý nghĩa). Đã sửa selector cho đúng.

## 2026-09-22 — V6.6.5 hotfix theo audit `2f7ace2` (3 P1 + 3 P2)

**Bối cảnh:** audit GitHub phát hiện Curriculum Auto Resolver chưa an toàn để nạp 4 file chính thức.

**Sửa:**
- **P1.1** `assignOrdinals()` tự đếm lại số YCCĐ → `normalizeSourceRows()` đọc số **từ nguồn**.
  Đây là lỗi nghiêm trọng nhất: khối 8 đánh YCCĐ liên tục theo phân môn (Chủ đề 2 có YCCĐ 4–11),
  khối 7 đánh lại từ 1 mỗi Chủ đề. Tự đếm lại sẽ biến `H.2.4` thành `H.2.1`.
- **P1.2** resolver chỉ lọc `status='ACTIVE'` → thêm `effectiveCurriculumVersion()` chốt bản PUBLISHED
  mới nhất theo môn+khối. `copyVersion()` cũng phải mang theo canonical_key/source_ordinal.
- **P1.3** `readJob()` bỏ qua `result.trusted` → tự điền sheet/header/cột + banner nhận diện.
- **P1.4** viết `v665-bootstrap.test.js` nạp thật 4 workbook từ `G:/tai lieu  oppa/UP SHARE/outcome khtn`.
- **P2.1** Mode B kiểm ở mức cả lô; Mode A vẫn theo từng YCCĐ.
- **P2.2** tách `autoResolved` khỏi `validManual` trong ImportCenter.
- **P2.3** `artifacts/` bị gitignore cùng `backups/`+`*.dump` (chứa dữ liệu thật) → viết
  `docs/V6_6_5_ACCEPTANCE.md` thay vì `git add -f`.

**Migration mới:** `migration-v665-import-split.sql` — một dòng bảng tính có thể chứa nhiều YCCĐ nên
khóa tự nhiên của `curriculum_import_rows` đổi thành `(job, sheet, dòng, source_segment)`.

**Phát hiện trong chính nguồn:** workbook lớp 8 Chủ đề 18 có **hai YCCĐ khác nhau cùng số 1**.
Hệ thống chặn hẳn (`SOURCE_ORDINAL_DUPLICATE`, không cho `accept_source_warnings` bỏ qua) và bắt
người phụ trách sửa số trong staging. Cần rà với chủ chương trình trước khi nạp thật.

**Kiểm chứng:** 188 pass / 3 fail (3 lỗi có sẵn từ trước, đã đo baseline).

**Bẫy đã gặp:**
- `xlsx` bản ESM không mở được đường dẫn ổ G; phải `fs.readFileSync` rồi `XLSX.read(buf)`.
- Đặt tên biến `all` trong vòng lặp che mất `all` là danh sách dòng DB → `all[i].id` undefined.
  Lỗi do chính em tạo khi patch bằng script; đã đổi tên thành `sourceFlags`.
- Zod `.strict()` ở `editRows` từ chối khóa lạ, nên khi sửa dòng staging chỉ gửi đúng trường cho phép.

## 2026-09-22 — V6.6.5: Question Workspace + Curriculum Auto Resolver

**Yêu cầu:** thực thi `V6_6_5_FULL_QUESTION_WORKSPACE_CURRICULUM_CODE_RESOLVER_PROMPT` trên HEAD
`d01b801` (V6.6.4 đã được người dùng commit/push).

**Quyết định thiết kế đáng nhớ:**
- **Mã câu quyết định Outcome/YCCĐ, không quyết định Bài.** Bài chỉ đến từ `topic_yccd_map`.
  "Bài 2" và "Outcome 2" là hai hệ đánh số độc lập — có ca kiểm thử chứng minh Outcome 2 nằm ở cả
  Bài 2 lẫn Bài 3.
- **Khối là ngữ cảnh phiên nhập, không nằm trong mã.** Khóa tra cứu luôn là
  môn+khối+phân môn+số Outcome+số YCCĐ. Khóa máy `KHTN:G9:L:2:1` chỉ dùng nội bộ.
- **Không tự chọn hộ.** Mã lệch metadata (YCCĐ/hình thức/mức) thì báo và giữ nguyên giá trị người
  dùng khai; YCCĐ thuộc nhiều Bài thì để trống.
- Gán Bài đi qua `persistQuestion` thay vì UPDATE thẳng, để giữ phân loại thay đổi + nhật ký.

**File đổi:** xem `docs/V6_6_5_CHANGES.md` mục B (5 file backend mới, 4 file frontend mới, 1 migration,
2 file test mới).

**Migration:** `migration-v665-curriculum-code.sql`, additive tuyệt đối, đã áp lên DB local; backfill
canonical key cho 30 Outcome + 97 YCCĐ có sẵn nên resolver chạy được ngay trên dữ liệu cũ.

**Kiểm chứng:** 171 pass / 3 fail (cả 3 fail có sẵn từ trước, đã đo baseline).

**Bẫy đã gặp, tránh lặp lại:**
- `label` bọc ngoài `select` không cho tên truy cập ổn định cho Playwright `getByLabel`. Phải gắn
  `aria-label` tường minh.
- Fixture import phải có `explanation`, nếu không `validateDraft` trả WARNING ("Chưa có lời giải")
  và trạng thái không còn là VALID.
- Bản nháp chưa duyệt sửa tại chỗ (đã ghi ở mục V6.6.4) — vẫn đúng khi viết test resolver.

**Sai lệch có chủ ý:** §26 xếp "không parse được mã" vào nhóm chặn; em làm thành "cần xem" để không
phá luồng nhập tệp cũ. Trường hợp nguy hiểm thật (mã hợp lệ nhưng chuẩn không tồn tại) vẫn bị chặn.

**Việc tiếp theo:** thu hồi token GitHub (vẫn chưa làm); nạp thật 4 workbook KHTN chính thức; nối
`inferNumberingMode` vào đường ghi; điều tra 3 test lỗi có sẵn.

## 2026-09-22 — V6.6.4: Question Power Workflow + Safe Auto-Deploy

**Yêu cầu:** thực thi trực tiếp `V6_6_4_QUESTION_IMPORT_REVIEW_POWER_WORKFLOW_SAFE_DEPLOY_MASTER_PROMPT`
trên HEAD `331be20` (khớp đúng commit prompt đã audit).

**Phát hiện ngoài phạm vi, mức nghiêm trọng:** `git remote -v` cho thấy GitHub PAT nằm plaintext trong
`.git/config`. Đã báo người dùng, chưa tự đổi remote.

**Quyết định thiết kế đáng nhớ:** preflight hàng loạt **không** có bộ luật riêng. `evaluateBulk()` chạy
đúng đường thực thi (`versionWorkflow`/`transition`) trong `SAVEPOINT`; `bulkPreflight` gọi nó trong
`dryRun()` (luôn ROLLBACK), `bulkWorkflow` gọi trong `tx()`. Nhờ vậy không thể có chuyện preflight
lệch luật so với thực thi — vốn là rủi ro lớn nhất của yêu cầu §17.

**File đổi:** `.github/workflows/deploy.yml`, `scripts/deploy-server.sh`, `scripts/migration-safety.mjs` (mới),
`backend/src/db/pool.js` (thêm `dryRun`), `backend/src/services/practice/{bulkWorkflow,questionQueue}.js` (mới),
`backend/src/services/practice/{questions,imports}.js`, `backend/src/routes/practice.js`,
`backend/src/server.js`, `frontend/src/pages/practice/{ReviewWorkspace,Banks,ImportCenter}.jsx` (mới),
`frontend/src/pages/practice/queue/*` (mới), `frontend/src/pages/practice/{Teacher,ReviewQueue}.jsx`,
`frontend/src/{App.jsx,config/navigation.js,styles/question-queue.css}`, ba `package.json` → 6.6.4,
`backend/test/integration/{v664-bulk.test.js (mới),pilot.test.js}`, docs `V6_6_4_*`.

**Không có migration.** Dữ liệu cần thiết đã có sẵn từ V6.4.3/V6.6.3.

**Kiểm chứng:** xem bảng trong `AI_HANDOFF.md`. Đã đo baseline trên HEAD sạch bằng `git stash` để chứng
minh 3 test tích hợp fail là có sẵn, không phải regression của vòng này.

**Bẫy đã gặp, tránh lặp lại:**
- `npm run test:integration` chạy ba file song song ⇒ fail dây chuyền giả (51 fail). Chạy từng file một.
- Bản nháp chưa từng được duyệt bị sửa **tại chỗ**, không sinh phiên bản mới. Muốn dựng kịch bản
  STALE_VERSION thật thì phải duyệt câu đó trước rồi mới sửa.
- `confirmJob()` băm tệp nguồn trong kho riêng tư; seed `import_jobs` trực tiếp vào DB thì phải tạo cả
  file ở `UPLOAD_DIR/private-imports/`.

**Việc tiếp theo:** thu hồi token GitHub; commit/push theo thứ tự deploy-safety trước; lấy journalctl
trên máy chủ để kết luận sự cố deploy.

## 2026-09-22 — Full-codebase read audit (3 parallel agents: backend/frontend/db+scripts)

**Yêu cầu:** user muốn đọc full source thật (không dựa `.codegraph`/repo-map heuristic) để tự dựng hiểu kiến trúc.

**Phạm vi đọc:** toàn bộ `backend/src` (107 file), `frontend/src` (66 file), 26 file SQL (`schema.sql`+25 migration), toàn bộ `scripts/` (45 file), `compose.yaml`, `Dockerfile`, `docs-assembler-config.json`. Không sửa code — chỉ audit đọc.

**Kết quả chính:**
- Backend: entry `backend/src/server.js`; RBAC/ABAC core mới ở `services/accessResolver.js`+`services/access/*` (thay legacy role-column); matrix/exam ở `matrixBalancer.js`/`examGenerator.js`; practice/learning subsystem lớn ở `services/practice/*`; competency framework mới V6.6.3 ở `services/competency/*`.
- Frontend: React 18+Vite, auth thực tế là **cookie session + CSRF token**, không phải JWT-header như context ban đầu giả định. Chỉ 1 Zustand store (`useAuth`). `Questions.jsx` (573 dòng) và `Teacher.jsx` (~650 dòng logic, 4 màn trong 1 file) là ứng viên refactor rõ nhất.
- DB/Deploy: 2 migration runner song song (`migrate.js` chỉ chạy schema.sql; `upgrade.js` chạy đủ ledger 25 migration — Docker/production dùng `upgrade.js`, cài Windows qua `.bat/.ps1` KHÔNG tự chạy đủ). `package.json` version 6.5.3 nhưng migration mới nhất là v6.6.3 (curriculum-master + competency) — version number bị lệch, chưa có release ZIP cho head hiện tại.

**Flag quan trọng cần theo dõi:**
1. `middleware/sanitize.js` (sanitizeBody) viết xong nhưng không mount ở đâu — dead code, XSS mitigation dựa hoàn toàn frontend escaping.
2. `services/qtiImport.js` (278 dòng) có vẻ là parser QTI cũ không còn route nào gọi — trùng chức năng với `practice/importAdapters.js#parseQti`.
3. `routes/taxonomy.js:173-180` — code sau early-return không bao giờ chạy (vô hại, chỉ dead statement).
4. Frontend có 3 file component/page mồ côi không ai import: `Users.jsx`, `practice/Admin.jsx`, `practice/Positions.jsx` (redirect stub cũ); `components/MatrixTable.jsx`, `QtiImportModal.jsx`, `TopicPicker.jsx` (component cũ, có vẻ bị thay bằng `MatrixBuilder`/`ContentScopePicker`).
5. Hai hook fetch trùng chức năng: `useLoad` (`shared.jsx`) vs `usePortfolio` (`portfolio/common.jsx`).
6. Hai renderer Markdown/KaTeX trùng: `components/MathText.jsx` vs `pages/practice/Rich.jsx`.
7. `artifacts/` tích ~50 cặp DB dump + upload dir test cũ không tự dọn (chỉ `backups/` có retention).
8. `docs-assembler-config.json` — scaffold rỗng, không thấy script nào tham chiếu, có vẻ không dùng.

**Kiểm tra/verify:** không chạy build/test trong lượt này — chỉ đọc, không sửa code nên không cần.

**Việc tiếp theo (nếu user chọn xử lý):** ưu tiên xác nhận `qtiImport.js` + 6 file frontend mồ côi trước khi xoá (cross-check import thật, không chỉ agent-grep); cân nhắc bump `package.json` version lên 6.6.3 cho khớp migration/git log; dọn `artifacts/` cũ.

## 2026-09-23 — Luật no-polling: global rule + AGENTS.md cho repo

**Yêu cầu:** user hỏi luật "NEVER poll a backgrounded job" có thiết lập được cho mọi project không, kể cả project đã triển khai; sau đó yêu cầu thêm vào repo này.

**Bối cảnh chi phí:** mỗi tool call gửi lại toàn bộ context lên API. Vòng lặp `sleep 5 + check` trong 3 phút ≈ 36 lượt; context 40k tokens ⇒ ~1.44M input tokens đốt vô nghĩa, đồng thời đẩy context chạm trần gây compaction giữa task.

**Thay đổi ngoài repo (global, mọi project của user):**
- Tạo mới `~/.claude/rules/no-poll-background-jobs.md`. Thư mục `~/.claude/rules/*.md` được harness nạp mỗi phiên, độc lập cwd — đây là điểm chèn global đúng (cùng cơ chế với `lsp-first.md`, `skill-routing.md`). `~/.claude/CLAUDE.md` không tồn tại, không dùng.

**Thay đổi trong repo:**
- Tạo mới `AGENTS.md` (51 dòng, trước đó repo chưa có). Nội dung: thứ tự đọc continuity files; block **Async Tasks & No-Polling** (luật + anti-pattern + ngoại lệ CI/deploy chờ một lần dài); quy ước điều hướng LSP/`.codegraph` trước grep; nghĩa vụ cập nhật `AI_WORK_LOG.md`/`AI_HANDOFF.md`; nhắc chỉ commit/push khi được yêu cầu.
- Lý do cần bản trong repo: rule global chỉ áp cho Claude Code của user này. Cursor/Codex/Hermes và người clone repo không đọc `~/.claude/rules/` — `AGENTS.md` là lớp phủ cho họ.

**Quyết định:** không đóng thành skill. Skill nạp theo trigger, có thể không kích hoạt đúng lúc agent sắp spam poll; rule file nạp vô điều kiện mỗi phiên, đúng lớp hơn cho luật hành vi luôn-bật.

**Kiểm tra/verify:** không chạy build/test — chỉ thêm file tài liệu, không đụng code. `git status`: `AGENTS.md` untracked; `AI_HANDOFF.md`/`AI_WORK_LOG.md` modified. Hiệu lực nạp của rule global chỉ xác nhận được ở phiên Claude Code mới, chưa kiểm chứng trong phiên này.

**Việc tiếp theo:** commit `AGENTS.md` khi user yêu cầu; nếu dùng Cursor trong repo thì mirror block no-polling sang `.cursorrules`.

## 2026-09-23 — V6.6.5.2: nhập Word thông minh + tự nhận chương trình + duyệt theo ngoại lệ; đề xuất giao diện

**Yêu cầu:** "fix đi e" theo `V6_6_5_2_FULL_SMART_WORD_IMPORT_AUTO_CURRICULUM_REVIEW_PROMPT.md`, sau đó đề xuất giao diện/thao tác tối ưu (nhanh, hàng loạt, tinh chỉnh từng câu trong lô).

**Điều hướng:** codegraph/LSP không dùng được cho JS minified 1-dòng; dùng grep có giới hạn + đọc lát cắt.

**Tệp đổi (backend):** `db/migration-v6652-import-context.sql` (mới) + `db/upgrade.js`; `services/questionCode.js` (`isCodeAttempt`); `services/practice/importAdapters.js`; `services/curriculumResolver.js` (retired + `codeForMetadata` + `master_data_missing` + `applyResolution` mới + giữ `replacement`); `services/practice/imports.js` (viết lại staging: context/expectations, severity, settle, duplicates %, partial numbering, bank từ context); `services/questionReview.js` + `practice/bulkWorkflow.js` + `routes/practice.js` (`reason_codes`); `services/practice/questions.js` (`CHECK_SQL`, `exception`, `ids`, bất biến mã–phân loại); `services/practice/questionQueue.js` (`checks`); `services/curriculumMaster/service.js` (trusted server-owned, `masterDataHealth`) + `routes/curriculumMaster.js` (`/health`); `services/curriculumMaster/lessonSeed.js` (mới) + `db/seed-khtn7-vatli-lessons.js`.
**Tệp đổi (frontend):** `ImportCenter.jsx` (viết lại), `workspace/MachineChecks.jsx` (mới), `ReviewWorkspace.jsx`, `queue/BulkQuestionToolbar.jsx`, `queue/QuestionQueue.jsx`, `Banks.jsx`, `workspace/RejectReasonPopover.jsx`, `curriculum/CurriculumManager.jsx`, `curriculum/MasterDataHealth.jsx` (mới), `styles/question-queue.css`.
**Khác:** `scripts/generate-templates.mjs` + `templates/question-import-khtn.docx`; test mới `test/practice/word-import-v6652.test.js`, `test/integration/v6652-import.test.js`; sửa `v665-resolver` (xung đột = ERROR), `v665-bootstrap` (bypass null → 409); docs `docs/V6_6_5_2_SMART_WORD_IMPORT.md`, cập nhật `docs/KHTN7_VATLI_BAI_YCCD.md`.

**Kiểm tra:** `npm run migrate` local OK; unit 113/113; pilot 34/34; v63 47/50 (đúng 3 lỗi baseline #30/#47/#50); v664 12/12; bootstrap 7/7; resolver 10/10; v6652 14/14; frontend build OK; seed KHTN7 `--dry-run` mặc định dừng NO_PUBLISHED_VERSION, `--allow-legacy` → 13 Bài / 31 liên kết đã có.

**Lỗi gặp & xử lý:** upload rate limit 10/phút/người (429) trong test → chia tải sang tài khoản admin, không nới giới hạn; trigger CSDL `CURRICULUM_REQUIRES_DRAFT` → fixture dựng ở DRAFT rồi mới PUBLISH; resolver làm rơi `replacement` → trả kèm.

**Quyết định:** backend không bắt buộc Môn/Khối (giữ tương thích API cũ), UI bắt buộc; ack chỉ tắt cảnh báo cần-xem; hàng loạt trong staging chỉ còn Bài (+ mức/dạng cho câu không mã).

**Đề xuất giao diện:** canvas Design 4 màn (Bàn làm việc hợp nhất có phạm vi "câu này / cả lô" + "chỉnh riêng" + hoàn tác; Nhập theo nhóm vấn đề; Duyệt theo ngoại lệ; Bảng lệnh Ctrl K + phím tắt): https://claude.ai/artifact/AXCT9nbHYPpaSCHZR9jsUv (riêng tư).

**Việc tiếp theo:** user duyệt đề xuất → triển khai; commit/push khi user yêu cầu; thu hồi GitHub PAT.

## 2026-09-23 — V6.6.6: triển khai đầy đủ đề xuất giao diện (bàn làm việc hợp nhất)

**Yêu cầu:** "duyệt, làm full nhé" — triển khai cả 4 màn của canvas đề xuất.

**Điều hướng:** grep có giới hạn + đọc lát cắt (LSP không có; không tìm thấy `codegraph.py` để rebuild).

**Tệp đổi (backend):** `services/practice/quickEdit.js` (mới), `routes/practice.js` (quick-edit, preflight, view-counts), `services/practice/questionQueue.js` (`workViews`, `viewCounts`), `services/practice/questions.js` (`created_after`, `returned`), `services/practice/lessonAssignment.js` (`before_topic_id`, `current_version_id`).
**Tệp đổi (frontend):** `Banks.jsx` (viết lại), `ReviewWorkspace.jsx` (viết lại), `ImportCenter.jsx` (nhóm vấn đề + bảng lệnh), mới: `workspace/QuickInspector.jsx`, `CommandPalette.jsx`, `WorkViews.jsx`, `UndoToast.jsx`, `useHotkeys.js`; sửa `workspace/RejectReasonPopover.jsx` (`ReasonChips`, `suggestedReasons`), `queue/QuestionQueue.jsx` (`sync/refresh`, nhãn chỉnh riêng), `queue/BulkQuestionToolbar.jsx` (`requestedAction`, `onClear`), `styles/question-queue.css`.
**Test mới:** `test/integration/v666-workbench.test.js` (7 ca, có Playwright). **Doc:** `docs/V6_6_6_UNIFIED_WORKBENCH.md`.

**Kiểm tra:** unit 113/113; pilot 34/34; v63 47/50 (3 lỗi baseline); v664 12/12; bootstrap 7/7; resolver 10/10; v6652 14/14; v666 7/7; build OK.

**Lỗi gặp & xử lý:** `current_version_id` là UUID, zod đòi số → 400 → đổi sang `z.string().uuid()` và so sánh chuỗi. Lưới giữa hẹp khi có rail → rail 196px, preview 300–360px, dưới 1280px rail gập thành hàng nút.

**Việc tiếp theo:** commit/push khi user yêu cầu; thu hồi GitHub PAT.

## 2026-09-23 — V6.6.6b: đồng bộ giao diện toàn web theo demo, font chung Lexend

**Yêu cầu:** "nhìn chưa đẹp như demo" → "đồng bộ luôn cả web, font chung Lexend".

**Thay đổi:** `@fontsource/lexend` + `@fontsource/jetbrains-mono` (bỏ be-vietnam-pro vừa thử); `styles/theme.css` mới nạp cuối trong `main.jsx`; quy đổi màu cũ trong `styles/*.css`; `WorkspaceShell` (đầu trang một thanh), `ExceptionChips` + `GET /questions/exception-counts`, lưới/khung chi tiết `QuestionQueue.jsx`, `WorkViews` (Lọc nhanh, gập <1600px), `ImportCenter` (bảng + thanh chọn), `RejectReasonPopover` (nhãn ngắn), `Banks`/`ReviewWorkspace` (nav/footer khung chi tiết), `EnvironmentBadge`.

**Kiểm tra:** test chụp giao diện `v666-ui-gallery` (mới) pass; regression đầy đủ — xem mục kết quả trong `docs/V6_6_6_UNIFIED_WORKBENCH.md` §5/§3.

**Lỗi gặp & xử lý:** theme bị global.css đè (thứ tự import) → chuyển sang main.jsx; ô file ẩn bị lộ → `[hidden]` !important; lưới 2 cột lọt xuống điện thoại (lỗi từ V6.6.6 đầu) → giới hạn ≥1025px + assert.

**Việc tiếp theo:** user xem ảnh `artifacts/ui-*.png`; commit/push khi user yêu cầu.


## 2026-09-23 — V6.6.6.1: sửa theo audit `a34aab4` (AUDIT_HEAD_A34AAB4_V666_UI_POLISH.md)

**Yêu cầu:** "fix tiep" toàn bộ mục audit (P1 `allow_unlinked`, P1/2 phân môn L/H/S, P2 copy "đủ 9 mục",
dọn DB test, hiệu năng đếm, nút gửi duyệt sau nhập, "Môn:" Word, nghi trùng, P3 Chương, badge PROD, version, chồng nhóm, đa cỡ màn).

**Skills:** không dùng (việc sửa theo danh sách audit, phạm vi rõ).

**Đổi:** migration `migration-v6661-edit-ops.sql` (bảng `question_edit_operations` + 2 index; đã áp local) + `upgrade.js`;
`quickEdit.js` (undo token máy chủ: đúng người / 30 phút / chưa hoàn tác / chưa bị sửa tiếp — so cả phiên bản lẫn trạng thái);
`lessonAssignment.js`; `routes/practice.js` (bỏ `allow_unlinked`, route undo); `questions.js` (kiểm phân môn,
sửa regex `\\.`, `EXCEPTION_FORMULA`, `ROW_FLAG_SQL`, `exceptionOverColumns`); `questionQueue.js` (queue CTE trang,
view-counts 1 truy vấn, exception-counts CTE MATERIALIZED + JOIN hồ sơ); `imports.js` (Môn:, Chương, nghi trùng → hồ sơ
`DUPLICATE_SUSPECT`); `server.js` + 3 package.json → 6.6.6. Frontend: QuickInspector/Banks/ReviewWorkspace (undo token, copy),
ImportCenter (Chương, gửi duyệt thật), ExceptionChips (ghi chú chồng nhóm), EnvironmentBadge (PROD nhỏ), theme.css.
Test: `helpers/cleanup.js` (mới, áp cho mọi test tích hợp kể cả pilot/v63), `v6661-scale.test.js` (mới), cập nhật
v666-workbench / v6652-import / v666-ui-gallery / unit word-import; `scripts/cleanup-test-databases.mjs` (mới).
Tài liệu: `docs/V6_6_6_1_AUDIT_A34AAB4_FIXES.md`.

**Kiểm tra (tuần tự):** unit 115/115; security 27/27; pilot 34/34; v63 47/50 (3 lỗi baseline #30/#47/#50); v664 12/12;
bootstrap 7/7; resolver 10/10; v6652 17/17; v666-workbench 9/9; ui-gallery 1/1; scale 20k 1/1
(queue 87/64 ms, view-counts 62/78, exception-counts 1060/1113, ngưỡng 1500); frontend build OK.

**Lỗi gặp & xử lý:** `\.` trong template literal bị JS nuốt → viết `\\.`; đếm chip 2,2 s → CTE MATERIALIZED + JOIN hồ sơ ~1,1 s;
dọn DB `permission denied to terminate process` → chỉ dừng kết nối của chính role + thử DROP lại; undo không bắt được câu
đã đổi Bài tiếp (đổi Bài không sinh phiên bản) → so thêm trạng thái. Codegraph: không tìm thấy `codegraph.py` trên máy → chưa rebuild `.codegraph`.

**Kết quả:** 12/13 mục audit đóng; mục đa cỡ màn đóng phần máy, UAT mắt người + lô Word thật còn chờ người.

**Việc tiếp theo:** user chạy `node scripts/cleanup-test-databases.mjs --apply` (238 DB ≈ 3,2 GB + 274 tệp/thư mục, không hoàn tác);
thu hồi PAT GitHub; commit khi user yêu cầu; deploy xong chạy `npm run migrate` (migration v6661).

## 2026-09-23 — V6.6.6.2: sửa theo audit `c92054a` (AUDIT_COMMIT_C92054A_V6661.md)

**Yêu cầu:** "tiếp" — 3 lỗi audit (hoàn tác mức null; gửi duyệt lô nhập > 500; thống kê gắn Bài chỉ 100 câu) + P3 (retention thao tác hoàn tác, version dòng khởi động).

**Skills:** không dùng (danh sách sửa rõ phạm vi).

**Đổi:** `quickEdit.js` (mức ba trạng thái khi hoàn tác, trả lại mã hiển thị cũ, `pruneEditOperations`); `imports.js` (`lessonSummary` trong `confirmJob`, `submitImportJob` chia ≤500/transaction); `routes/practice.js` (`POST /imports/:id/submit`);
`server.js` (VERSION từ package.json, dọn thao tác hoàn tác lúc khởi động + mỗi 24 giờ); `ImportCenter.jsx` (gửi qua API mới, `lessons` từ máy chủ); test `v666-workbench` (+1), `v6652-import` (+1 lô 501 câu). Tài liệu `docs/V6_6_6_2_AUDIT_C92054A_FIXES.md`. Không migration mới.

**Kiểm tra (tuần tự):** unit 115/115; security 27/27; pilot 34/34; v63 47/50 (3 baseline); v664 12/12; bootstrap 7/7; resolver 10/10; v6652 18/18; workbench 10/10; ui-gallery 1/1; build OK. DB tạm không tăng (238).

**Kết quả:** 3 lỗi audit + 2 mục P3 đóng; exception-counts ~1,1 s ở 20k vẫn chỉ theo dõi. Chưa commit. Codegraph chưa rebuild (không có `codegraph.py` trên máy).

**Việc tiếp theo:** UAT lô Word thật; user chạy cleanup `--apply`; thu hồi PAT GitHub; commit khi user yêu cầu.

## 2026-09-24 — V6.6.6.3: sửa theo audit `e243b69` (AUDIT_COMMIT_E243B69_V6662.md)

**Yêu cầu:** sửa P2 (gửi duyệt lô nhập gọi lại không idempotent về số liệu) + P3 (mục nhập vs câu trong kho).

**Skills:** không dùng (delta nhỏ, phạm vi rõ).

**Đổi:** `imports.js`:
- `submitImportJob` khóa + phân loại từng phần (`PENDING_REVIEW` → already_submitted, `APPROVED` → already_handled, còn lại mới `evaluateBulk`), trả `submitted_now / already_submitted / already_handled / not_submitted`;
- `importResult` thêm `processed_items`, `unique_questions` (`imported` giữ làm alias).

`ImportCenter.jsx`: hiển thị số mới. `v6652-import.test.js`: mở rộng test 501 câu (gửi dở 200 → 301 now / 200 already; gửi lại → 0 / 501 / 0), thêm test hai mục "tạo phiên bản" cùng một câu. Tài liệu `docs/V6_6_6_3_AUDIT_E243B69_FIXES.md`. Không migration.

**Kiểm tra (tuần tự):** unit 115/115; security 27/27; pilot 34/34; v63 47/50 (3 baseline); v664 12/12; bootstrap 7/7; resolver 10/10; v6652 19/19; workbench 10/10; ui-gallery 1/1; build OK. DB tạm không tăng.

**Kết quả:** P2 + P3 audit đóng; chưa commit. Theo audit: dừng phát triển chức năng, chuyển UAT bằng file Word thật.

**Việc tiếp theo:** UAT Word thật; user chạy cleanup `--apply`; thu hồi PAT GitHub; commit khi user yêu cầu.

## 2026-09-24 — PERF V6.6.7: Redis tùy chọn + Supavisor + tối ưu luồng làm bài (REDIS_SUPAVISOR_PERFORMANCE_PLAN_NGANHANG_V666.md)

**Yêu cầu:** triển khai plan hiệu năng (Redis cache / rate limit, Supavisor, pool metrics, đo tải).

**Skills:** tra `grep_search` "redis cache rate limit node performance". 5 ứng viên chỉ khớp chung chữ "performance" / "redis" (Azure .NET, Odoo…), không đạt 80 điểm → không dùng; làm theo plan.

**Baseline trước khi sửa** (`test/load/quiz-load.mjs`, local, không Redis):
- 120 HS đăng nhập cùng lúc từ một IP → 70/120 bị 429 (limiter "cộng trước, trừ sau");
- bcrypt JS chặn luồng chính (p50 đăng nhập 4,2 s);
- trần API theo IP 3000/phút → 120/120 lượt nộp bị 429;
- Player tải lại cả bài sau mỗi lần chốt;
- tạo bài insert từng câu;
- catalog 376 KB đọc lại mỗi request.

**Đổi:**
- Mới: `services/cache/{redis,cache}.js` (Redis tùy chọn, cache-aside + jitter + chống dồn tải + thế hệ nội dung); `middleware/rateLimitStore.js` (Redis, tự quay về bộ nhớ); `services/passwordHasher{,.worker}.js` (bcrypt trong worker); `utils/requestContext.js`; `scripts/perf-db-check.mjs`; `test/load/{quiz-load.mjs,k6-quiz.js}`.
- Sửa:
  - `db/pool.js`: pool theo biến môi trường, số liệu pool + truy vấn chậm;
  - `rateLimiter.js`: `failureLimiter` cho login IP, trần theo biến môi trường;
  - `auth.js`: `verifyPassword`;
  - `attempts.js`: INSERT theo lô, `is_final`;
  - `routes/practice.js`: cache catalog dạng chuỗi JSON / dashboard / bài giao / số đếm;
  - `practiceAdmin.js`: `/operations/client-ip`;
  - `operations.js`: `db` / `cache` / `rate_limit` / `hash_workers`;
  - `server.js`: khởi Redis, đổi thế hệ khi staff ghi, `Cache-Control`, ngữ cảnh request;
  - `Player.jsx`: bỏ tải lại sau khi chốt, bỏ lượt lưu trùng.
- Deploy: `compose.home.yaml` thêm service redis không publish cổng; `.env.*.example`.
- Version 6.6.7; thêm `redis@^5`.
- Tài liệu `docs/PERF_V6_6_7_REDIS_SUPAVISOR.md`.

**Kết quả đo:**
- 80 HS: tổng 27,1 → 17,8–19,5 s; pha làm bài 13,9 → 9,0–11,5 s; đăng nhập p50 1045 → ~350 ms.
- 120 HS đăng nhập dồn: 0 lỗi (trước 70 lỗi).
- A/B AsyncLocalStorage: khác biệt nằm trong mức dao động (±30%).

**Kiểm tra (tuần tự):** unit 124/124; security 27/27; pilot 34/34; v63 47/50 (3 baseline); v664 12/12; bootstrap 7/7; resolver 10/10; v6652 19/19; workbench 10/10; ui-gallery 1/1; v667 5/5; build OK. DB tạm không tăng.

**Lỗi gặp:**
- seed test thiếu YCCĐ → bổ sung;
- đổi chữ ký `limiter` làm hỏng test security → giữ tương thích;
- khóa `password_workers` vi phạm test chống lộ → đổi `hash_workers`, che nhãn SQL.

**Chưa làm / cần server:** Redis thật (tỉ lệ trúng cache, thử `docker stop redis`), Supavisor (`perf-db-check`), kiểm NAT bằng `client-ip`, k6 staging 100/200 + soak. Chưa commit (V6.6.6.3 cũng chưa commit). Codegraph chưa rebuild (không có `codegraph.py`).

**Việc tiếp theo:** user commit V6.6.6.3 + V6.6.7 (có thể tách 2 commit); deploy Home có Redis rồi làm checklist §8 / §10 của tài liệu; UAT Word thật.

## 2026-09-24 — V6.6.7.1 pre-merge: runbook `perf-v6671-followup` + sửa 3 test v63 + hướng dẫn deploy cho AI Ubuntu

**Yêu cầu:**
- "CHECK và làm đi": làm runbook `docs/RUNBOOK_SIEU_CHI_TIET_AI_PERF_V6.6.7.1_PRE_MERGE.md` trên clone Windows.
- Sau đó "fix full" + viết 1 file hướng dẫn cho AI quản lý Supabase self-host (Ubuntu) kéo git về deploy và sửa dữ liệu.

**Kiểm báo cáo dán vào:**
- Khớp: `5fe2d88` có parent `69108dc`; `origin/main` = `423be0c`.
- Cảnh báo "1 file edit FAILED" trỏ vào đường dẫn gõ sai, runbook vẫn đủ 1836 dòng.
- Runbook có SHA bị cắt 32 ký tự → đã sửa.

**Vòng runbook:** commit `3ed2257` (parent = `5fe2d88`), push nhánh phụ.
- `AI_HANDOFF` bỏ câu "local chưa commit" đã cũ.
- k6 load50/100/200 → 2 phút / 5 phút / 1 phút; ngưỡng, burst, soak giữ nguyên.
- Kiểm: unit 125/125, security 27/27, build OK. systemd / compose / runtime: SKIPPED_ENVIRONMENT (Windows). K6 NOT_RUN.

**Fix full:**
- 3 test v63 lỗi từ lâu, cả 3 là lỗi test chứ không phải lỗi app:
  - #30 chờ tiêu đề Kho cũ → cập nhật theo bàn làm việc ("Xem kỹ", tab "Cần xem kỹ");
  - #47: V652 đăng xuất học sinh thật (`token_version+1`) nên token API cũ hết hiệu lực → `refreshTokens()` trước V66;
  - #50 lỗi dây chuyền; lộ thêm 429 (300 request/phút/admin) → server test v63 đặt `RATE_LIMIT_API_USER=100000`.
  - Kết quả v63 **50/50**.
- Mới: `backend/scripts/data-health.mjs` (chỉ đọc): so migration với `app_migrations` (tên + checksum), kiểm schema V6.6.x, nhóm ngoại lệ, câu chưa gắn Bài, liên kết Bài↔YCCĐ theo môn/khối, hồ sơ mở, thao tác hoàn tác, DB tạm của test. Mã thoát 3 = chặn. Đã chạy trên DB local.
- Mới: `docs/HUONG_DAN_AI_UBUNTU_DEPLOY_V6.6.7.1.md`: preflight, kiểm riêng máy Home (worktree tạm), backup, push fast-forward `main` → CI deploy, rollback bằng revert, sửa dữ liệu D1–D6 (migrate, seed KHTN7 dry-run → apply, DB tạm, chất lượng câu → báo giáo viên, cấu hình), khung báo cáo.

**Lưu ý kỹ thuật cho deploy:** `deploy-server.sh` lấy `PREVIOUS_SHA` từ HEAD của thư mục deploy và reset nhánh đang checkout. Vì vậy máy Home phải đứng ở `main` = bản đang chạy, và đưa `main` lên bằng push, không merge tại chỗ; nếu không, rollback mất tác dụng. Nhánh không đổi `backend/src` / `frontend/src` / SQL so với `main`.

**Chưa làm (cần máy Home / người):** deploy + dữ liệu theo hướng dẫn; k6 staging; UAT Word thật; thu hồi PAT.

## 2026-09-24 — Sau deploy `a344eeb` lên Home: đọc báo cáo AI Ubuntu, bổ sung chẩn đoán dữ liệu

**Báo cáo AI Ubuntu:**
- Push fast-forward `main` 423be0c → a344eeb; CI "Verify & Deploy" run 35965226544 SUCCESS.
- Có backup; health ok, cache ok; data-health: blocking 0, 80 câu không đạt kiểm tra mã, không trả dòng chương trình nào; seed KHTN7 chưa chạy (NEEDS_DECISION); link công khai timeout.

**Kiểm từ máy Windows:** `nganhang.studylab.io.vn` NXDOMAIN trên DNS công khai (domain gốc có trên Cloudflare) → chưa trỏ DNS, không do deploy.

**Chẩn đoán:** kiểm tra mã báo lỗi khi câu có mã nhưng `yccd_id` rỗng. Server không có dòng chương trình ACTIVE nào → khả năng cao DB server chưa có Outcome/YCCĐ, nên 80 câu có mã không tự nhận chương trình.

**Đổi (chỉ nhánh `perf-v6671-followup`, không đẩy `main` để khỏi deploy / khởi động lại):**
- `data-health.mjs` thêm:
  - phân loại lỗi mã (chưa gắn YCCĐ / YCCĐ không tồn tại / lệch dạng / phân môn / số Outcome / số YCCĐ) + theo môn/khối;
  - tồn kho chương trình theo môn/khối (Outcome, YCCĐ tổng / ACTIVE, phiên bản PUBLISHED, Bài, liên kết, số câu);
  - câu theo lifecycle / trạng thái duyệt.
- Hướng dẫn: D2 luôn chạy dry-run (không ghi); D2b (thiếu dữ liệu chương trình → nạp qua giao diện Chuẩn đầu ra, không SQL); 7b (DNS).
- Local: KHTN 7 có 97 YCCĐ ACTIVE nhưng 0 phiên bản PUBLISHED (trước đây nạp bằng `--allow-legacy`).

**Việc tiếp theo:** AI Ubuntu chạy data-health bản mới + seed dry-run, gửi số liệu. Nếu xác nhận thiếu chương trình: anh Hiếu nạp workbook qua giao diện, rồi làm công cụ "nhận lại theo mã" cho câu cũ (tạo phiên bản mới, không đưa câu đã duyệt về nháp trái ý).

## 2026-09-24 — Vòng 2 dữ liệu Home: server không có chương trình → công cụ nhận lại YCCĐ theo mã

**Báo cáo vòng 2 (AI Ubuntu, chỉ đọc):**
- DB server không có Outcome/YCCĐ ở mọi môn/khối.
- KHTN 9: 80 câu có mã, tất cả `DRAFT`, tất cả thiếu YCCĐ, không lệch dạng / phân môn / số; 51 Bài, 0 liên kết.
- KHTN 7: không có Bài / YCCĐ; seed dry-run `NO_PUBLISHED_VERSION`.

**Làm:**
- `backend/scripts/reresolve-question-codes.mjs`:
  - chỉ câu có mã + `yccd_id` rỗng + bản hiện hành `DRAFT` + chưa lưu trữ;
  - cùng `resolveQuestionFromCode` + `applyResolution` như lúc nhập Word; lưu bằng `persistQuestion`, mỗi câu một savepoint;
  - bỏ qua câu `CODE_METADATA_CONFLICT`, đếm câu không phải nháp;
  - chạy thử = transaction rồi rollback; `--apply` bắt buộc `--actor <admin>`; ghi `practice_audit` `QUESTION_CODE_RERESOLVE`.
- Test `v6671-reresolve.test.js` 3/3:
  - chạy thử không ghi;
  - ghi thật đúng 2/5 câu (1 tự gắn Bài, 1 chưa có liên kết Bài);
  - lệch mã / thiếu YCCĐ / đang chờ duyệt không bị đụng;
  - chạy lại không đổi;
  - thiếu actor → mã thoát 2.
- Hướng dẫn §10 (vòng 3): H1 anh Hiếu nạp 4 workbook qua `/admin/curriculum` (khối 9 trước) → A1 data-health → A2 reresolve chạy thử, chỉ ghi thật khi được duyệt → A3 seed KHTN7 → H2 liên kết Bài KHTN 9.

**Không đẩy `main`.** AI Ubuntu chạy script qua `git show` từ nhánh, không cần deploy / khởi động lại.

## 2026-09-24 — Dữ liệu chương trình KHTN: seed Bài ↔ YCCĐ khối 6–9 từ KHDH của trường

**Nguồn anh Hiếu chỉ:**
- `G:\NSHM\SGK KHTN` (SGK + tổng quan mục lục);
- `G:\NSHM\26 27\outcome\New folder` (4 workbook Outcome/YCCĐ, giống byte bộ đã test).

Anh Hiếu chốt: **workbook là chuẩn nguyên văn**; SGK/KHDH khác một chút vẫn được; Outcome ≠ tên Bài.

**Làm:**
- `backend/scripts/build-khtn-lesson-seed.mjs` (chạy trên máy có ổ G):
  - đọc KHDH 26-27 (`G:\NSHM\26 27\KHDH\4.2.3.2…\NB_26-27_KHDH_KHTN_Khối {6..9}.xlsx`, sheet KHDH; không đọc "Thông tin chung" vì có tên giáo viên);
  - Bài theo "Bài N" hoặc tra tên trong mục lục SGK;
  - YCCĐ khớp với workbook qua `normalizeSourceRows` (cùng hàm nạp chương trình) theo thứ tự: chính xác → chứa → một đoạn nguyên văn → tách vế ";" → gần đúng ≥ 0,75;
  - đồng nhất "KHTN", lí/lý, tên hoá chất (natri=sodium…);
  - ô KHDH gộp nhiều Bài: chia theo thứ tự nhóm + độ giống tên Bài; chưa chắc → `grouped`, mặc định không nạp;
  - gộp file ThongKe Vật lí 7 (`curated`);
  - ghi `src/db/seed-data/khtn{6..9}-lessons.json` + `docs/KHTN_BAI_YCCD_SEED_REVIEW.md`.
- Phủ YCCĐ: khối 9 187/191 (51/51 Bài) · khối 8 187/194 · khối 7 89/107 · khối 6 65/135 (KHDH khối 6 viết khác chương trình nhiều).
- `lessonSeed.seedGradeLessons` + `src/db/seed-khtn-lessons.js --grade N [--dry-run] [--allow-legacy] [--include-uncertain]`:
  - tra YCCĐ theo nguyên văn trong đúng phân môn;
  - dùng lại Bài theo SỐ BÀI (không tạo trùng khi khác dấu câu);
  - Bài có sẵn chưa liên kết + mọi YCCĐ cùng một phân môn khác → sửa phân môn của Bài (khối 9 Bài 16, 17: Hoá → Vật lí, vì trigger v643 bắt cùng phân môn);
  - bỏ qua + báo phần khác phân môn.
- Test `v6671-lesson-seed` 3/3, chạy cả quy trình trên bản sao DB:
  - câu có mã trước khi có chương trình;
  - nạp + công bố KHTN 6 và 9 qua API hồ sơ tin cậy;
  - seed chạy thử / ghi thật (dùng lại 51 Bài khối 9, tạo Bài khối 6, chạy lại không đổi);
  - nhận lại theo mã → câu có YCCĐ + tự gắn Bài 2; kiểm tra mã / Bài đạt.
- Hướng dẫn mục 10 viết lại: A0 deploy bản mới → H1 nạp + công bố → A1 seed chạy thử / ghi thật → A2 nhận lại theo mã → A3 data-health → H2 giáo viên rà báo cáo.

**Lỗi gặp:**
- dòng tiêu đề workbook bị nhận là dòng tên cột → tìm dòng có cả "Môn" và "Yêu cầu cần đạt";
- Python biến `\b` thành backspace khi vá file → sửa lại bằng node, quét toàn repo không còn ký tự điều khiển;
- ngưỡng 0,70 ghép sai (virus ↔ nguyên sinh vật) → chọn 0,75;
- trigger `TOPIC_YCCD_MISMATCH` → luật sửa phân môn Bài như trên.

## 2026-09-24 — Máy chủ chỉ dùng chung GitHub: đưa workbook vào repo + script nạp chương trình bằng lệnh

**Bối cảnh:** anh Hiếu báo máy self-host là máy khác, chỉ dùng chung GitHub → không có ổ G trên máy chủ.

**Làm:**
- `backend/src/db/seed-data/curriculum/Outcome_YCCD_KHTN_{6..9}.xlsx`: bản sạch metadata. File gốc có tên giáo viên ở LastAuthor → chép lại giá trị ô sang workbook mới; đã kiểm `normalizeSourceRows` cho kết quả giống hệt bản gốc, không còn creator / lastModifiedBy.
- `backend/scripts/import-khtn-curriculum.mjs`:
  - mặc định KIỂM TRA (parseWorkbook + hồ sơ tin cậy + normalizeSourceRows, không ghi);
  - `--apply --actor <admin> [--publish] [--accept-source-warnings] [--renumber-duplicates] [--new-version]` đi qua đúng service của giao diện (createVersion → upload → mapImport → editRows nếu trùng số → commitImport → publishVersion);
  - thiếu cờ thì dừng TRƯỚC khi ghi (mã 3); khối đã PUBLISHED thì từ chối.
- Nguồn cần người quyết:
  - khối 7 có 3 dòng số viết sai (S.8.5, S.9.6, S.10.5); khối 9 có 1 dòng (H.8.1) → nội dung đúng, cần `--accept-source-warnings`;
  - khối 8 S.18.1 trùng ("tác động của con người…" / "khái niệm ô nhiễm môi trường…") → `--renumber-duplicates` cho dòng sau thành S.18.5, hoặc sửa file gốc.
- Test `v6671-lesson-seed` 4/4 chạy trọn bằng lệnh: kiểm tra → dừng khi thiếu cờ (không tạo phiên bản) → nạp + công bố 4 khối → nạp lại bị chặn → seed 4 khối → nhận lại theo mã.
- Hướng dẫn mục 10 viết lại: A0 deploy → A1 nạp bằng lệnh (kiểm tra, xin phép cờ) → A2 seed → A3 nhận lại theo mã → A4 data-health.

## 2026-09-24 — Chốt nguồn: cho phép cờ khối 7, 9; khối 8 đánh lại số theo quy tắc khối 7

**Yêu cầu:** anh Hiếu: "1. cho phép 2. tự đánh số chuẩn theo quy tắc lớp 7".

**Làm:**
- `backend/src/db/seed-data/curriculum/Outcome_YCCD_KHTN_8.xlsx`: số YCCĐ bắt đầu lại từ 1 trong từng Chủ đề của từng phân môn, theo thứ tự dòng nguồn.
  - 56 ô đổi số (vd H.2.4 → H.2.1; S.18.1 trùng thứ hai → S.18.2, S.18.2..4 → S.18.3..5).
  - Câu chữ không đổi; `normalizeSourceRows` trước/sau giống nhau về nội dung, không cờ, số liên tục.
- `build-khtn-lesson-seed.mjs`: OUTCOME_DIR mặc định = workbook trong repo → sinh lại seed; `khtn8-lessons.json` đổi stt, độ phủ không đổi (6: 65/135, 7: 89/107, 8: 187/194, 9: 187/191); review doc cập nhật.
- Test `v6671-lesson-seed`: khối 8 kiểm tra 0 trùng, 0 risky; nạp không cờ; `renumbered` rỗng; số YCCĐ trong DB: Hoá 8 Chủ đề 2 = 1..8, Sinh 8 Chủ đề 18 = 1..5.
- Hướng dẫn §10 A1: cờ khối 7, 9 đã được cho phép; khối 8 không cờ, không dùng `--renumber-duplicates`; kết quả khác kỳ vọng → STOP.

**Kiểm:** `v6671-lesson-seed` 4/4; lệnh kiểm tra 4 khối: 6 sạch, 7 risky 3, 8 sạch, 9 risky 1.

**Việc tiếp:** push nhánh; AI Ubuntu chạy §10 A0→A4 ngoài giờ học; anh Hiếu thay file khối 8 trên ổ G bằng bản repo.

## 2026-09-24 — Kiểm Cloudflare (chỉ đọc): link app đúng là studylab.io.vn

**Yêu cầu:** anh Hiếu hỏi kết nối Cloudflare được không → anh tự đăng nhập trong khung trình duyệt, em chỉ đọc.

**Phát hiện:**
- DNS `studylab.io.vn`: 3 CNAME (`@`, `www`, `supabase`) → Tunnel `a90f7b75-…cfargotunnel.com`, proxied. Không có `nganhang`.
- Tunnel `supabase` (quản lý trên dashboard), 1 replica trên máy Home, Healthy. Route: `supabase.studylab.io.vn` → `http://localhost:8000`; `studylab.io.vn` và `www` → `http://localhost:3001`.
- `https://studylab.io.vn/api/health` và `www`: status ok, database/cache ok, version 6.6.7. Ghi chú "nganhang.studylab.io.vn chưa có DNS" trước đây là sai tên miền, app vẫn truy cập được.
- `supabase.studylab.io.vn` mở công khai: `/` và `/rest/v1/` trả 401, Studio có Basic Auth. Trái `docs/HOME_REMOTE_ACCESS_RUNBOOK.md` ("Studio chỉ mở tạm") → báo anh Hiếu, không tự sửa.

**Sửa:** hướng dẫn §7b ghi link đúng + bảng route; `AI_HANDOFF.md` bỏ việc DNS, thêm rủi ro route supabase.

**Không thay đổi gì trên Cloudflare.**

## 2026-09-25 — Liệt kê cái cần để kiểm toàn bộ máy Home

**Yêu cầu:** anh Hiếu hỏi cần cung cấp gì để em kiểm toàn bộ.

**Kiểm được ngay:** `gh` chưa đăng nhập, máy này không có SSH key. Repo GitHub đọc được không cần đăng nhập. Workflow `deploy.yml` chỉ chạy khi push `main` hoặc bấm tay, runner self-hosted. Quét lịch sử git: không có file `.env`/khóa/dump, không có token `ghp_`/`github_pat_`.

**Đề xuất:** (1) AI Ubuntu chạy bộ lệnh chỉ đọc, ghi ra một file; (2) anh đăng nhập admin web trong khung trình duyệt; (3) anh đăng nhập GitHub trong khung trình duyệt. Không cần mật khẩu, token, `.env`, SSH.

**Chờ anh Hiếu:** quyết cài đặt hiển thị repo. `deploy-server.sh` chạy `git fetch origin main` bằng xác thực của máy Home, nên phải kiểm cái đó trước khi đổi.

## 2026-09-25 — Audit trước khi đưa lên main

**Yêu cầu:** anh Hiếu: gộp luồng, audit kỹ, sửa nếu cần, đưa bản hoàn chỉnh lên `main`.

**Trạng thái:** `main` đã ở `33dd060`. AI Ubuntu đã fast-forward; CI run 35994545299 SUCCESS ngày 2026-09-24. Nhánh chỉ hơn main commit tài liệu `ab3ec29`.

**Rà code mới từ `a344eeb`:** script CLI, seed, `lessonSeed.js`. Code chạy trong server không đổi hành vi.

**Sửa:**
- `import-khtn-curriculum.mjs`: mã thoát 3 ("dừng trước khi ghi") trước đây cũng rơi vào lỗi Postgres (vì `e.code` là SQLSTATE) → nay chỉ lỗi do `stop()` chặn mới thoát 3; chú thích cờ `--renumber-duplicates` cập nhật cho khối 8 đã đánh lại số.
- `lessonSeed.js`: dữ liệu có Bài không có số → dừng `BAD_LESSON_DATA`, tránh khớp nhầm mọi Bài không đánh số. Test mới trong `v6671-lesson-seed`.
- `data-health.mjs`: lời nhắc trỏ `seed-khtn-lessons.js --grade N` thay script khối 7 cũ.
- `db/pool.js`: nhãn route của truy vấn chậm được che như SQL (route `…/reset-password` làm test `v5-checks` hỏng khi máy chậm).
- `v664-bulk.test.js`: cổng 3103 → 3106 (trùng cổng với `v63.test.js`, chạy song song thì V63 đăng nhập nhầm server → 52 lỗi dây chuyền).

**Kiểm:**
- unit 125/125; security 27/27; build frontend đạt;
- integration lần 1: 104 đạt / 52 lỗi, đều do 2 lỗi hạ tầng test ở trên;
- lần 2 sau khi sửa: 153/156 đạt; 3 lỗi còn lại đều ở `v6671-lesson-seed`, do PostgreSQL local hết chỗ kết nối khi mọi file chạy song song (`53300 remaining connection slots`); chạy riêng file này: 4/4 đạt.

**Kết quả:** gộp vào `main` bằng fast-forward rồi push; CI "Verify & Deploy" tự deploy. Dữ liệu (§10 A1–A4) vẫn do AI Ubuntu chạy.

**CI sau khi đẩy main (`1ce88c6`):** run 36071707977.
- Lần 1: Verify kẹt ở "Build frontend" 20 phút (máy Home: RAM trống 1,8 GiB, swap 2 GiB gần hết, load 35–48), rồi SUCCESS; Deploy SUCCESS.
- AI Ubuntu bấm "Re-run all jobs" khi lần 1 vừa xong → lần 2 SUCCESS (Verify 43 giây, Deploy 33 giây). Deploy lại cùng commit, vô hại (backup + migrate không có gì mới + restart + health).
- Thêm `timeout-minutes: 45` cho job Verify (cắt ngang an toàn); KHÔNG đặt cho Deploy vì dừng giữa backup/migrate nguy hiểm hơn chờ. Mới commit vào nhánh, đi theo lần đẩy main sau.
- Việc tiếp: giảm tải máy Home (đóng Firefox/VS Code, xem `docker stats` các container Supabase không dùng).

## 2026-09-25 — Báo cáo AI Ubuntu: dữ liệu §10 xong

- A1: kiểm tra 4 khối đúng kỳ vọng (6 và 8 sạch, 7 risky 3, 9 risky 1); cả 4 khối đã có 1 bản PUBLISHED nên không nạp lại.
- A2 (backup trước): seed thật 4 khối. Khối 9 dùng lại 51 Bài, 188 liên kết, sửa phân môn 2 Bài. Khối 6 / 7 / 8 tạo 39 / 39 / 47 Bài với 75 / 88 / 187 liên kết. Bỏ qua mục chưa chắc: 1 / 0 / 3 / 2 (khối 9 / 6 / 7 / 8).
- A3: 80/80 câu nhận lại theo mã, 0 xung đột.
- A4: data-health exit 0, blocking 0, attention 0; runtime ok.
- Máy Home sau CI: load 1,0; RAM available 1,8 GiB; swap còn 4 MiB. Container lớn nhất: studio 186 MiB, realtime 132 MiB; edge-functions đang restart liên tục. Chưa tắt gì, chờ anh Hiếu.
- Còn mở:
  - xác nhận số YCCĐ khối 8 trong DB là số mới;
  - migration applied 29 > expected 27 (không chặn);
  - khoá Supabase + đổi khoá chưa thấy trong báo cáo.

## 2026-09-25 — Màn Chuẩn đầu ra · Bài–YCCĐ: bỏ mã máy, hiện mã theo nguồn

**Yêu cầu:** anh Hiếu hỏi các mã `O-4650c1961c06`, `Y-126819fa-148`, chữ `ACTIVE`, `59-60` có ý nghĩa gì.

**Giải thích:**
- `O-…`/`Y-…` là mã máy sinh khi nạp workbook: Outcome = băm môn + tên Chủ đề; YCCĐ = UUID. Không có ý nghĩa với giáo viên.
- `ACTIVE` là trạng thái.
- `59-60` là trang trong văn bản chương trình (cột trang của workbook → `source_locator`).

**Sửa** `frontend/src/pages/practice/CurriculumAdmin.jsx`:
- hiện mã theo nguồn `L.2` / `L.2.1`, cùng số với mã câu; mã máy chỉ còn trong tooltip, trừ chuẩn nhập tay chưa có số nguồn;
- trạng thái chỉ hiện khi khác ACTIVE (Nháp / Ngừng dùng / Đề xuất);
- trang ghi "tr. 59-60".

Áp dụng cho cả danh sách liên kết, mục "Quản lý chuẩn" và 2 ô chọn Outcome.

**Kiểm:** build frontend đạt; không test nào dựa vào chữ cũ. Chưa xem trực tiếp trên trình duyệt (cần đăng nhập).

**Còn:** `curriculum/CurriculumManager.jsx`, `CompetencyManager.jsx`, `portfolio/*` cũng hiện `{o.code}`/`{y.code}` → làm cùng kiểu nếu anh Hiếu muốn.

**Chưa lên main:** đang giờ học; đẩy main là deploy + khởi động lại app.

## 2026-09-25 — Báo cáo AI Ubuntu: giảm tải + xác nhận KHTN 8

- Đã dừng `supabase-edge-functions`, `realtime`, `supabase-studio` (anh Hiếu cho phép); giữ imgproxy. Sau đó: load 0,87, RAM available 1,9 GiB, swap vẫn 1,8/2 GiB.
- Tăng swap bị chặn vì sudo cần mật khẩu → anh Hiếu tự chạy lệnh thêm 6 GiB nếu muốn. AI Ubuntu đã đưa lệnh.
- Dừng bằng compose chưa phải vĩnh viễn: nếu dịch vụ Supabase chạy lại `docker compose up -d` (vd khởi động lại máy) thì 3 container có thể bật lại. Muốn tắt hẳn thì cần override compose.
- KHTN 8: `GDPT2018-KHTN8-2026-09-24`, công bố 11:52Z (sau deploy `33dd060`); H.2 có 8 YCCĐ, đánh số 1..8 → dùng số mới. Kiểm trên giao diện: NOT_RUN (cần đăng nhập).
- Bảo mật Supabase (thu quyền anon, tắt đăng ký, đổi khoá): **vẫn chưa làm**.

## 2026-09-25 — Đổi tên "Kho trường chuyển tiếp V4" → "Kho trường"

**Yêu cầu:** anh Hiếu đồng ý đổi tên cho dễ hiểu.

**Làm:**
- `backend/src/db/migration-v6672-school-bank-name.sql`: `UPDATE banks SET name='Kho trường' WHERE kind='school' AND name='Kho trường chuyển tiếp V4'`. Chỉ đổi khi còn đúng tên gốc; id, quyền, câu hỏi giữ nguyên.
- `upgrade.js` thêm file vào danh sách.

**Kiểm:**
- cổng `migration-safety` báo `additive: true`;
- migrate trên DB local: tên đổi, chạy lại không làm gì;
- không code/test nào dùng tên cũ, ngoài migration gốc.
- security 27/27; `v664-bulk` (kho, thao tác hàng loạt) 12/12.

**Deploy:** lần đẩy main sau. `deploy-server.sh` tự backup → migrate → restart → health. data-health sẽ thấy expected tăng 1.

**Deploy `9ed430a`** (anh Hiếu bảo "up main" lúc 14:47): CI run 36109472066 SUCCESS; Verify 49 giây, Deploy 36 giây. Lên web: màn Chuẩn đầu ra hiện mã nguồn, migration đổi tên "Kho trường", timeout Verify. Chưa kiểm trên giao diện (cần đăng nhập).

## 2026-09-25 — Nhãn nguồn L.2 / L.2.1 cho mọi màn hiện mã Outcome/YCCĐ

**Yêu cầu:** anh Hiếu: "sửa full" các màn còn hiện mã máy.

**Quyết định:**
- Không đổi `code` trong dữ liệu:
  - chương trình đã công bố là bất biến (trigger `PUBLISHED_CURRICULUM_IMMUTABLE`);
  - `code` còn dùng để đối chiếu (`smartMetadata`, `curriculum_aliases`, snapshot).
- Thay vào đó, API trả thêm **nhãn hiển thị** `outcome_label` / `yccd_label`, giao diện ưu tiên nhãn.

**Backend:**
- `services/curriculumLabel.js`: `outcomeLabelSql`, `yccdLabelSql` = `COALESCE(branch.ordinal(.ordinal), code)`.
- Thêm nhãn vào:
  - hàng đợi câu hỏi (cả allowlist DTO);
  - danh mục YCCĐ cho picker (`curriculum.js`);
  - snapshot nhãn ma trận (`matrixContentScope`; `mappingChanged` chỉ so `clauses`, nên ma trận đã khoá không bị báo đổi);
  - ô ma trận khi xem và khi sinh đề (join thêm Outcome của chính YCCĐ);
  - độ phủ ma trận (allowlist trường);
  - năng lực: danh mục ánh xạ và hồ sơ;
  - allowlist học sinh (`v643`);
  - DTO câu hỏi (`visibility.js`);
  - so sánh phiên bản (`questionReview` compare);
  - gợi ý metadata (`smartMetadata`);
  - bản đồ YCCĐ học sinh (`v63` learning-map, nhãn lấy từ chương trình hiện hành theo `yccd_id`).

**Frontend:**
- `utils/curriculumLabel.js` dùng chung;
- sửa ContentScopePicker, CurriculumPicker, MatrixBuilder, Matrix, QuestionReviewPanel, workspace/labels (bảng kho), CompetencyPortfolio, OutcomeMap, CompetencyManager, CurriculumManager, Teacher, CurriculumAdmin;
- mã máy chỉ còn trong tooltip.

**Test:** `v6671-lesson-seed` thêm kiểm `curriculumCatalog` trả `yccd_label` L.2.1, `outcome_label` L.2, mã `Y-…` giữ nguyên. Kết quả: unit 125/125, security 27/27, integration 156/156, build frontend đạt; kiểm import helper đủ ở mọi file. `test:integration` nay chạy `--test-concurrency=3` (chạy hết song song thì PostgreSQL local hết kết nối). Chưa xem trực tiếp giao diện (cần đăng nhập).

**Deploy `f6bb759`** (anh Hiếu bảo "up main" lúc 17:06): CI run 36122161793 SUCCESS; Verify 51 giây, Deploy 30 giây. Chưa kiểm trên giao diện (cần đăng nhập).

## 2026-09-25 — Phản biện UX audit (mốc f6bb759) và chốt phương án V6.7

**Đối chiếu code:**
- Tự luyện có nút "Kiểm tra số câu trong kho" (`Student.jsx`).
- Giao bài: CTA "Lưu và tạo link" (`Assignments.jsx`); "Cách giao" ĐÃ là câu tiếng Việt ("Mỗi học sinh bốc riêng…" / "Cùng một bộ câu đã khóa"), audit nói "dynamic/fixed" là chưa đúng.
- `WorkspaceHome` đã có "Hôm nay cần chú ý", nhưng mọi thẻ đều dẫn tới `/practice` chung, chưa lọc.
- Player: bản đồ câu có ✓ ★ ○, chưa có "?" (chưa chắc); câu đánh dấu che trạng thái đã trả lời. Hộp nộp chỉ có "Quay lại xem" / "Vẫn nộp bài".
- Ma trận: nút "Giữ snapshot đã lưu" / "Làm mới khi lưu" (thuật ngữ).
- `main` chưa được bảo vệ (API: `protected: false`).

**Chốt:**
- **Giai đoạn 0, an toàn:** khoá Supabase + đổi khoá (AI Ubuntu); thu hồi PAT (anh Hiếu); ruleset nhẹ cho `main` (cấm force-push/xoá, bắt buộc CI xanh; không bắt review vì chỉ có một người duyệt); CI mới trên máy GitHub, không dùng máy Home: unit + security + build + 5 journey smoke với Postgres riêng; `NULLIF` cho nhãn.
- **Giai đoạn 1, giảm ma sát:** giao bài sửa trong form hiện tại (CTA "Giao bài", tóm tắt trước khi giao, số HS nhận, màn sau giao, gom Nâng cao), chưa làm wizard; tự kiểm số câu khi tự luyện; thẻ trang GV dẫn đúng danh sách; bài gần hạn lên đầu trang HS.
- **Giai đoạn 2, đánh bóng:** Player "?" + nút xem câu chưa làm/chưa chắc + 1 CTA chính sau nộp; bỏ thuật ngữ và mã lỗi kỹ thuật trên UI; empty state có nút hành động; duyệt đơn giản mặc định.
- **Giai đoạn 3:** thử với người thật (5–10 HS, 3–5 GV, 1–2 tổ trưởng), bấm giờ 3 chỉ tiêu, rồi mới quyết wizard giao bài / trang tổ trưởng.
- **Không làm bây giờ:** wizard ma trận 7 bước, tracking analytics (học sinh vị thành niên), Ctrl+K toàn app, dashboard mới, thêm vai trò.

## 2026-09-26 — V6.7 giai đoạn 1 + 2 (UX)

**Yêu cầu:** anh Hiếu "làm 1 2", tức giai đoạn 1 (giảm ma sát) và giai đoạn 2 (đánh bóng) theo phương án đã chốt.

**Commit, lên nhánh trước:**
- `9d4ecc1`: nhãn nguồn dùng `NULLIF`; mã phân môn rỗng không sinh ".2.1".
- `3c90730` (1.3):
  - thẻ "Hôm nay cần chú ý" dẫn tới `/practice?status=inactive|down|pending` và `/practice/reviews?tab=pending`;
  - Tiến độ lớp đọc `?class/status`, tự mở khi chỉ có một lớp, thẻ số liệu bấm được để lọc, có "Bỏ lọc", thêm cột Hành động (Hồ sơ · Giao củng cố).
- `398fe4c` (1.4): trang HS đưa bài giao hạn < 48 giờ lên ngay sau bài đang dở, đếm giờ, nút "Làm bài" mở thẳng lượt làm.
- `dcbaf94` (1.2): tự luyện bỏ nút "Kiểm tra số câu trong kho".
  - Tự kiểm sau 0,4 giây, kết quả cũ bị bỏ.
  - Khi thiếu câu, gợi ý các cách chắc chắn hợp lệ (chép đúng `allocate()` của máy chủ): giảm số câu; giữ số câu và chia lại mức; luyện số câu hiện có; chọn thêm nội dung.
  - Nút chính "Bắt đầu luyện".
- `cd3d1d4` (1.1): form giao bài.
  - 3 bước; phần "Nâng cao" gom cách bốc, số lượt, đáp án, luyện lại sau hạn.
  - "N học sinh sẽ nhận bài" (`/classes` thêm `student_count`); "Xem lại trước khi giao" một câu, kèm "Còn thiếu".
  - Nút "Giao bài"; sau khi giao hiện "✓ Đã giao…" với Sao chép link · Xem tiến độ · Tạo bài khác.
  - Chưa làm wizard nhiều trang.
- `796d529` (2.1): Player.
  - Bản đồ câu ○ ✓ ? ★ (cùng lúc), bộ lọc "? Chưa chắc".
  - Hộp nộp có "Xem câu chưa trả lời / chưa chắc / đã đánh dấu".
  - Sau khi nộp có một nút chính: "Luyện lại N câu cần củng cố" (cùng điều kiện với retry của máy chủ) hoặc "Luyện tiếp".
- `66338d1` (2.2):
  - lỗi trigger DB (P0001) → 409 kèm câu tiếng Việt (`middleware/dbRuleErrors.js`), thay vì 500 / mã thô;
  - ma trận bỏ chữ "snapshot".
- `1c89a5b` (2.3): màn trống có nút hành động (Assignments, WorkspaceHome, tổng quan / thành thạo / tab bài giao trong hồ sơ; link giao bài chỉ hiện khi có quyền `assignment.create`).
- `843b7ae` (2.4): màn Duyệt mặc định chế độ đơn giản.
  - Tắt phím tắt một chữ, bảng lệnh, duyệt lô sạch, chọn cả trang, dòng hướng dẫn.
  - "Mở công cụ duyệt nhanh" bật lại, lưu lựa chọn ở `localStorage review.tools`.

**Kiểm từng bước:**
- pilot 34/34 (sau 1.2 và 1.1);
- pilot + v63 84/84 (sau 2.1);
- unit `dbRuleErrors` 3/3;
- gallery + workbench 11/11 (sau 2.4);
- build frontend đạt ở mọi bước.

Kết quả chạy toàn bộ: xem mục kế tiếp.

**Chạy toàn bộ (2026-09-26 00:20):**
- unit 128/128, security 27/27, build frontend đạt;
- integration 155/156. Lỗi duy nhất là test tải `v6661-scale`: `exception_counts` mất khoảng 3,0 giây, ngân sách 1,5 giây, chạy riêng vẫn vậy.
- Máy lúc đó 100% CPU (Zalo, Chrome, 38 tiến trình node của MCP `npx`, không tiến trình nào thuộc repo).
- `exceptionCounts` / `CHECK_SQL` không đổi so với lần 156/156 ngày 2026-09-25 (sau `f6bb759`).
- Hàng đợi có nhãn mới: 145–220 ms.
- Kết luận: lỗi thời gian do môi trường. Chạy lại khi máy rảnh: `node --test test/integration/v6661-scale.test.js`.

## 2026-09-26 — Chạy thử giao diện thật trên máy local bằng tài khoản demo

**Cách làm:** anh Hiếu đưa tài khoản demo. Chỉ dùng trên `http://localhost:3003` (server local, DB `nganhang_personalized_v63`, `.claude/launch.json` cấu hình `nganhang-local`), không dùng trên `studylab.io.vn`. Không ghi mật khẩu vào ghi chú.

**Kiểm được, đều đúng:**
- form giao bài 3 bước, sĩ số lớp, câu xem lại, "Còn thiếu", màn "✓ Đã giao bài cho 1 học sinh" với 3 nút;
- `/practice?status=inactive` tự mở lớp duy nhất, đang lọc + "Bỏ lọc", cột Hành động;
- màn Duyệt: mặc định ẩn công cụ nhanh, bật/tắt đúng;
- Kho câu hỏi và Chuẩn đầu ra: không còn mã máy; nhãn H.1 / L.1 / H.1.1.

**Lỗi tìm ra khi chạy thật, đã sửa:**
- Form giao bài không kiểm số câu: phải bấm "Giao bài" mới biết "Kho chưa đủ câu cho bài giao" (không nói thiếu mức nào). Đã tách `pages/practice/availability.jsx` (hook + khung trạng thái + các cách sửa) dùng chung cho Tự luyện và Giao bài. Giao bài tự kiểm, nút khoá khi thiếu, "Còn thiếu" nêu cả nội dung và số câu.
- Gợi ý "Giao/Luyện N câu hiện có" trước đây chỉ hiện khi không giảm được số câu (kho 6 câu chỉ được gợi ý "Giảm còn 2 câu"). Nay hiện khi dùng được nhiều câu hơn, xếp trước.
- Tỉ lệ chia lại là số thập phân (33,33…), cộng lại 99,999…, nên form tưởng chưa đủ 100%. Nay `rebalance` trả tỉ lệ nguyên, kiểm lại bằng `allocate()`; kiểm 100% dùng sai số 0,00001 như máy chủ.

**Phát hiện chưa sửa:**
- Ô "Môn" ở form giao bài / tự luyện liệt kê đủ 14 môn, kể cả môn không có quyền (GV chọn thì mới báo "Không có quyền với môn này").
- Tài khoản mẫu `gv_ly_01` gắn môn "Vật Lí" (id 4), nhưng Bài / câu KHTN 6–9 nằm ở môn "KHTN" (id 3), nên giáo viên này không giao được bài KHTN. Là dữ liệu phân quyền mẫu, không phải lỗi form.
- Tiêu đề tab trình duyệt vẫn là "Ngân hàng câu hỏi V4.3".

**Dữ liệu local để lại:** 1 bài giao "Kiểm thử V6.7 (xoá được)" cho lớp 9-DEMO.

## 2026-09-26 — Sửa theo đề xuất + file mẫu chương trình môn học (Bài / Outcome / YCCĐ)

**Yêu cầu:** "sửa theo đề xuất" (web chưa publish, giữ mật khẩu demo); "chuẩn hóa template các môn: BGH up Bài, Outcome, YCCĐ; 1 file mẫu, chỗ up, có mục sửa nội dung".

**Sửa theo đề xuất (`0a63d30`):**
- `GET /practice/catalog/my-subjects` (content.read); ô "Môn học" chỉ liệt kê môn được phép.
- Tiêu đề tab "Ngân hàng câu hỏi".
- Seed: GV Lí/Hoá/Sinh THCS gắn môn KHTN.
- DB local: phân công lớp 9-DEMO của `gv_ly_01` chuyển Vật Lí → KHTN (+ `access_version`).

**File mẫu:**
- Migration `migration-v6673-curriculum-template.sql`: `curriculum_versions.lesson_plan jsonb`.
- `services/curriculumMaster/lessonPlan.js`:
  - đọc nội dung phiên bản / Bài hiện có;
  - `applyLessonPlan` lúc công bố: tìm Bài theo số (không có số thì theo tên), đổi tên / chương / thứ tự, tạo Bài mới, thêm liên kết tới YCCĐ bản mới; khác phân môn thì bỏ qua và báo lại; Bài không có trong kế hoạch giữ nguyên.
- `services/curriculumMaster/template.js`:
  - file 3 sheet (Hướng dẫn / Chương trình / Bài học), tải về kèm dữ liệu hiện tại;
  - đọc bằng `parseWorkbook` sẵn có (worker, chặn file nén độc);
  - kiểm lỗi từng dòng: thiếu số / tên, trùng số YCCĐ, phân môn không có, Chủ đề trùng số khác tên, mã YCCĐ của Bài không có, Bài trùng số, sai phân môn;
  - `diffData` so với bản đang dùng; `createDraft` lưu trữ bản nháp cũ (ARCHIVED), giữ lineage theo nhãn, canonical_key như bộ đọc mã câu;
  - `startDraft`: sửa trên web; `saveLessonPlan`: sửa danh sách Bài.
- `service.js`: `publishVersion` áp dụng `lesson_plan` (cần `curriculum.manage_lessons`); `copyVersion` mang theo kế hoạch Bài từ liên kết hiện có (trước đây công bố bản sao làm mất liên kết Bài).
- Routes `/api/curriculum/template` (tải), `/template/workspace`, `/template/preview`, `/template/import`, `/template/draft`, `PUT /versions/:id/lesson-plan`.
- Quyền:
  - DEPT_LEADER + `curriculum.import` + `curriculum.edit_draft`;
  - BOARD_PROFESSIONAL + import + edit_draft + `curriculum.publish`.
- Giao diện `pages/curriculum/CurriculumTemplate.jsx`: tab đầu "Chương trình môn học" ở "Môn học & cấu hình nội dung", ẩn công cụ phiên bản nâng cao khi ở tab này.
  - Chọn môn/khối → trạng thái → Tải file mẫu → Tải lên + Kiểm tra (lỗi / thay đổi) → Tạo bản nháp.
  - Sửa Chủ đề / YCCĐ (chữ), sửa danh sách Bài (số, tên, chương, phân môn, mã) → Công bố.

**Kiểm:**
- localhost: tải file mẫu KHTN 7 (dữ liệu cũ, 30 / 97 / 13 / 31) rồi tải lên lại nguyên file → hợp lệ, 0 thay đổi; giao diện tab hiện đúng;
- không tạo bản nháp / công bố trên DB local vì DB này là nguồn cho test;
- test `v6673-template` (DB tạm, KHTN 9 nạp bằng CLI + seed Bài): xem mục kế tiếp.
- `v6673-template` 4/4:
  - tải về rồi tải lại → 0 thay đổi;
  - file lỗi báo đúng sheet / dòng, không tạo phiên bản; GV thường 403;
  - sửa trong file → bản nháp → sửa Bài trên web (mã sai 422) → công bố: Bài 99 được tạo với liên kết L.2.1 / L.2.2 của bản mới, Bài 2 đổi tên, bộ đọc mã câu đọc YCCĐ đã sửa của bản mới;
  - mở bản nháp trên web mang theo Bài + liên kết, gọi lại vẫn dùng đúng bản nháp đó.
- Toàn bộ: unit 128/128, security 27/27, integration 160/160 (sau khi sửa `v66-checks`: tab mặc định nay là "Chương trình môn học", test bấm sang tab nâng cao), build đạt.
- File mẫu thử (không commit): `artifacts/Mau_chuong_trinh_KHTN_khoi7.xlsx`, `Mau_chuong_trinh_Toan_khoi6.xlsx`.

**Deploy `9701b3e`** (anh Hiếu chọn "Up main ngay", thứ Bảy): CI run 36208335731 SUCCESS; Verify 44 giây, Deploy 35 giây. main = 15 commit mới (UX 1–2, file mẫu chương trình, lọc môn, migration v6673). Chưa kiểm trên giao diện web thật (cần đăng nhập).

## 2026-09-26 — V6.6.7.4: mã câu mọi môn, file mẫu có ví dụ + lệnh AI, gom lối vào chương trình, làm rõ nhập → duyệt

**Yêu cầu (anh Hiếu):** file mẫu chưa có ví dụ và hướng dẫn dùng AI; hỏi mẫu Word → tự nhận Outcome / Bài đã thống nhất chưa; chỗ nạp Outcome / YCCĐ / Bài của môn khác khó hiểu; các bước nhập → duyệt khó hiểu. Chọn phương án "Thêm chữ viết tắt môn": mọi môn viết mã 6 phần như KHTN (Toán `Câu T. 2. 1. NB. 1. TN`, file mẫu `T.2.1; T.2.2`).

**Điều tra:**
- Trước vòng này bộ đọc mã chỉ nhận `L/H/S` → chỉ KHTN tự nhận Outcome / YCCĐ / Bài từ mẫu Word; môn khác không có mã.
- `curriculum_outcomes.domain_code` NOT NULL; `validateCurriculum` bắt câu hỏi chọn phân môn khi `domain_code` có giá trị → môn không chia phân môn phải để `domain_code = ''`, chữ môn chỉ ở `source_branch_code` / canonical_key.
- Học sinh chỉ nhận câu `review_status='APPROVED'` (attempts.js) → giao diện ghi rõ câu nháp chưa dùng được.
- Lối vào chương trình có 3 chỗ tên khác nhau (`/practice/curriculum`, `/taxonomy`, `/admin/curriculum` gồm cả tab Import cũ) + nút "Mẫu quản trị Outcome/YCCĐ" (file mẫu toàn trường cũ) ở màn Nhập.

**Thay đổi:**
- Migration `migration-v6674-subject-code-letter.sql` (additive): `subjects.code_letter` + CHECK `^[A-ZĐ]{1,3}$`, điền chữ cho các môn chưa chia phân môn (Toan T, NguVan V, TiengAnh A, VatLi L, HoaHoc H, SinhHoc S, LichSu LS, DiaLi ĐL, GDCD GD, GDKTPL KT, TinHoc TIN, CongNghe CN, IELTS IE).
- Bộ đọc mã (`questionCode.js`, `importAdapters.js`, `imports.js`, SQL kiểm tra trong `questions.js`, `scripts/data-health.mjs`): chữ đầu mã 1–3 chữ; chữ thường kiểu cũ được viết hoa kèm cảnh báo.
- `curriculumResolver.js`: chữ phải thuộc môn (phân môn hoặc chữ môn), sai → `CODE_SUBJECT_MISMATCH` (bắt chọn nhầm môn khi nhập). Môn chưa có chữ giữ hành vi cũ.
- `lessonPlan.js`: nhãn YCCĐ của môn không chia phân môn lấy chữ môn cho dữ liệu cũ chưa ghi chữ.
- `template.js` (viết lại, giữ luồng V6.6.7.3): cột Phân môn chỉ ở môn chia phân môn; sheet "Ví dụ" (KHTN / Toán / mẫu chung có [ ]), sheet "Dùng AI" (6 bước + 3 lệnh); hướng dẫn 3 bước, giải thích cột, mã YCCĐ ↔ mã câu, lỗi hay gặp; `buildPrompts`, `templatePrompts`, mẫu Word nhập câu theo môn (`questionWordTemplate`, thư viện `docx`), `setSubjectLetter` (chỉ admin). Routes `/template/prompts`, `/template/word`, `PUT /subjects/:id/code-letter`.
- Frontend: trang `/curriculum` (`CurriculumPage.jsx`) = 4 bước ai-làm-gì, mã mẫu của môn, tải Excel / Word, lệnh AI có nút "Sao chép lệnh" (`components/CopyPrompt.jsx`), đặt chữ viết tắt (admin). Menu: "Chương trình môn học" thay "Chuẩn đầu ra · Bài–YCCĐ"; `/admin/curriculum` → "Chương trình nâng cao · Năng lực" (bỏ tab file mẫu, chỉ `curriculum.publish` / `competency.manage_framework`); `/taxonomy` chỉ admin. Màn Nhập: thanh 5 bước, mẫu Word theo môn, mã mẫu + cảnh báo chưa có chương trình, lệnh AI thêm mã, nút "Lưu N câu vào kho", kết quả ghi bước tiếp theo. Màn Duyệt: một dòng giải thích mỗi tab. Regex frontend `[A-ZĐ]{1,3}`.
- Test: `question-code-v665` (từ chối `Câu XYZW`, thiếu chữ; nhận `T`, `LS`, `ĐL`, `TIN`), mới `curriculum-template-v6674` (4), mới integration `v6674-subject-letter` (3, cổng 3125), cập nhật `v6673-template` (5 sheet), `v66-checks` (tiêu đề trang nâng cao).

**Kiểm:**
- localhost (tài khoản seed admin, không tạo / công bố gì trên DB local): `/curriculum` Toán 10 hiện `T = Toán`, mã mẫu, nút mẫu Word, lệnh AI; màn Nhập hiện thanh 5 bước, mã mẫu Toán / KHTN, cảnh báo chưa có chương trình đúng dữ liệu local.
- Bộ test: unit 133/133, security 27/27, build đạt, integration 162/163 — lỗi duy nhất là test tải `V6661` (`exception_counts` 2170 ms > ngân sách 1500 ms). Chạy A/B riêng lẻ: bản `questions.js` cũ (regex `[LHS]`) 1524 ms, bản mới 1512 ms — cả hai trượt nhẹ; đo riêng regex trong PostgreSQL trên 200.000 dòng: cũ 1,8 s, mới 1,7 s → không phải do regex mới, do máy local quá tải (còn 238 DB tạm chưa dọn, server dev đang chạy). Chạy lại khi máy rảnh.

**Deploy `0e9a809`** (anh Hiếu "up", thứ Bảy 13:43): fast-forward từ `9701b3e` (4 commit), CI run 36224598323 SUCCESS — Verify 54 giây, Deploy 35 giây (script deploy tự backup + migrate v6674 + health). `gh` trên máy này chưa đăng nhập: đọc trạng thái CI qua API công khai của repo (không dùng token).

**Việc tiếp:** admin kiểm chữ viết tắt từng môn ở trang Chương trình môn học (đổi được khi môn chưa nạp chương trình); tổ trưởng các môn tải file mẫu mới; chạy lại test tải V6661 khi máy rảnh (sau khi dọn DB tạm).
