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
