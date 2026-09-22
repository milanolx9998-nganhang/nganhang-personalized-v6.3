# AI Work Log

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
