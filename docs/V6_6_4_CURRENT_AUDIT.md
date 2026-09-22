# V6.6.4 — BASELINE AUDIT (Phase 0)

Ngày: 2026-09-22. Đọc mã nguồn thật trước khi sửa, không bắt đầu bằng UI mock.

## 1. Trạng thái nguồn

- HEAD khi bắt đầu: `331be20551e045214817a096774d6076f547ba23`
- Commit: `Update v6.6.3: curriculum master, competency portfolio, rubric form improvements`
- Khớp đúng HEAD mà Master Prompt đã audit — không có diff phải hòa giải.
- Branch: `main`, tracking `origin/main`, không đi trước/sau remote.
- Working tree: sạch, chỉ có `AI_WORK_LOG.md` (ghi chú liên tục, không thuộc mã chạy).

### Rủi ro bảo mật phát hiện ngay ở bước này

`git remote -v` cho thấy URL remote nhúng GitHub Personal Access Token dạng plaintext
(`https://ghp_***@github.com/...`). Token nằm trong `.git/config`, lộ với mọi tiến trình đọc được
repo và mọi log lệnh git. Đây là phát hiện ngoài phạm vi V6.6.4 nhưng nghiêm trọng hơn mọi mục
trong prompt: cần thu hồi token và chuyển remote sang SSH hoặc credential helper. Không tự đổi
trong vòng này vì ảnh hưởng trực tiếp khả năng push của chủ repo.

## 2. Phiên bản

| Nơi khai báo | Giá trị |
|---|---|
| `package.json` | `6.5.3` |
| `backend/package.json` | `6.5.3` |
| `frontend/package.json` | `6.5.3` |
| Migration mới nhất đã áp | `migration-v663-curriculum.sql`, `migration-v663-competency.sql` |

Metadata lệch so với schema thực tế: code đã ở V6.6.3 nhưng version string còn 6.5.3, description root
còn ghi V6.4.3. Theo §46 chỉ bump lên `6.6.4` **sau** khi code + regression đạt gate.

## 3. Migration hiện tại

`backend/src/db/upgrade.js` là runner thật (ledger `app_migrations` + checksum + advisory lock),
áp `schema.sql` + 25 migration theo mảng cố định. `backend/src/db/migrate.js` là runner cũ chỉ áp
`schema.sql` — các script cài Windows còn trỏ vào runner cũ. Không đụng vào hai runner trong vòng này;
chỉ ghi nhận để §7 (migration rule) áp dụng đúng: auto-deploy chạy `npm run migrate` → `upgrade.js`.

Vòng V6.6.4 **không cần migration mới**: toàn bộ dữ liệu cần cho bulk workflow, queue summary và
import batch continuity đã có sẵn (`question_versions.review_status`, `questions.current_version_id`,
`import_items.result_question_id`, `question_review_cases`). Đây là kết quả mong muốn theo §7 —
additive tuyệt đối vì không thêm cột nào.

## 4. Backend liên quan

### `backend/src/services/practice/questions.js`
- `persistQuestion()` (dòng 16) — đường ghi câu hỏi canonical; phân loại thay đổi qua
  `classifyQuestionChange`, ghi `question_metadata_revisions`, mở review case khi remap curriculum.
- `questionList()` (dòng 52) — truy vấn danh sách có scope: bank ACL (`bankDecision`) + subject/grade
  (`getSubjectFilterSQL`) + content scope v2 + filter cột. Trả qua `visibleQuestion()` nên đã ẩn đáp án
  theo `content.view_answer`. **Chưa có** filter `import_job_id`, chưa có chế độ summary nhẹ.
- `transition()` (dòng 69) — state machine lifecycle. Điểm mấu chốt: `pending_review`/`approved`/
  `draft-from-pending` đều **ủy quyền** sang `versionWorkflow()`. Nền domain an toàn đã có sẵn.

### `backend/src/services/questionReview.js`
- `versionWorkflow()` (dòng 40) — submit/approve/reject/request_changes. Kiểm: `reviewQuestionAccess`,
  version phải là bản đang làm việc (409 nếu không), chính sách second-reviewer, `validateCurriculum`
  bắt buộc khi approve, `validateQuestion` theo subject profile, target bank cần quyền `review`.
- `reviewPolicy()` (dòng 17) — mặc định `require_second_reviewer_for_content_change=true`,
  `allow_author_self_approve=false`, `allow_admin_self_approve=true`.
- `openReviewCase()` / `resolveReviewCase()` — domain hồ sơ sự cố, có quarantine P0.

### `backend/src/routes/practice.js`
126 dòng, mount `questionReview`, `questionSources`, `v643`, `v63`, `practiceAdmin`. Các endpoint câu hỏi
hiện có: `GET/POST /questions`, `PUT /questions/:id`, `POST /questions/:id/workflow` (single),
`POST /questions/:id/copy`, `GET /questions/:id/versions`. Import: `POST /imports`, `GET /imports/:id`,
`PUT /imports/:id`, `POST /imports/:id/confirm`. **Chưa có**: bulk API, selection-ids, list import jobs.

### `backend/src/services/practice/imports.js`
- `confirmJob()` (dòng 48) trả `{ok,imported}` — **mất** job_id và danh sách question_id vừa tạo, nên
  frontend không giữ được batch context sau confirm (đúng như audit đã nêu).
- `getJob()` (dòng 46) chỉ cho `created_by` hoặc admin — đã chặn BOLA ở tầng job.
- `editJob()` (dòng 47) đã hỗ trợ bulk metadata theo `bulk_ids` và duplicate decision. Backend đủ mạnh;
  vấn đề nằm ở UI.

### `backend/src/middleware/bankScope.js`
- `legacyQuestionGuard()` chặn bulk legacy ≤500 ID, mỗi ID kiểm `can()` + `bankAccess()` rồi gọi
  `transition()` trong một transaction. An toàn nhưng gắn chặt với `routes/questions.js` và là đường
  legacy — frontend mới **không được** phụ thuộc (§79).

### `backend/src/services/access/visibility.js`
`staffQuestionDto(question, answers)` là choke point duy nhất ẩn đáp án. Khi `answers=false` thì set
`answer_hidden=true` và không trả `answer`/`answer_key`/`explanation`. DTO summary mới phải đi qua đây
hoặc chặt hơn.

## 5. Frontend liên quan

### `frontend/src/pages/practice/Teacher.jsx` (4 màn trong 1 file)
- `ImportCenter()` (dòng 25) — render **mỗi câu thành một `<article className="practice-card">`** kèm
  `<details>` chứa full `QuestionEditor`. 100–200 câu ⇒ card-wall. Không grid, không select-all theo
  filter, không resume job. `confirm()` (dòng 28) set `setJob(null)` và chỉ hiện chuỗi "Mở Kho câu hỏi
  để gửi duyệt" ⇒ mất batch context.
- `Banks()` (dòng 33) — cũng card-wall, 30 câu/trang, workflow từng câu, không checkbox/multi-select.
- `QuestionEditor()` (dòng 19) — canonical editor, tái dùng được cho cả import lẫn kho. Giữ nguyên.

### `frontend/src/pages/practice/ReviewQueue.jsx`
Đọc `/review-cases` — đúng domain hồ sơ sự cố, nhưng navigation gắn nhãn "Rà soát · Duyệt phiên bản"
⇒ người dùng tưởng đây là toàn bộ quy trình duyệt. Câu `PENDING_REVIEW` bình thường không xuất hiện ở đây.

### `frontend/src/pages/practice/QuestionReviewPanel.jsx`
Deep review đầy đủ: diff trước/sau, bằng chứng theo phiên bản, checklist 4 mục bắt buộc trước approve
(dòng 15, 21). Hợp lý cho deep review, không hợp cho duyệt hàng loạt câu sạch ⇒ §21 chuyển checklist
thành batch-level.

### `frontend/src/config/navigation.js`
`/practice/reviews` label `Rà soát · Duyệt phiên bản`, capabilities `['content.review','content.approve']`.
Theo §11 đổi label thành `Duyệt câu hỏi` và mở thêm cho `content.write` (tab A — tác giả gửi duyệt).

## 6. Auto-deploy hiện tại

`.github/workflows/deploy.yml`: một job duy nhất, không verify, không concurrency, gọi thẳng
`scripts/deploy-server.sh`.

`scripts/deploy-server.sh`: `set -e` (thiếu `-Eeuo pipefail`), `git reset --hard origin/main`,
`npm install` (không `npm ci`), `npm run migrate` **không backup trước**, `systemctl --user restart`,
rồi `sleep 2` + `curl -f` một lần duy nhất. Không lock, không rollback, không diagnostics.

GitHub Actions run `35674256160` trên commit `331be205`: build PASS, migrate PASS, restart chạy,
health check FAIL `Connection refused` sau 2 giây. Không có `journalctl` trong log ⇒ **không kết luận
được** app start chậm hay service crash. Xem `docs/V6_6_4_DEPLOY_INCIDENT.md`.

## 7. Actions status

`main` không protected, không required status checks (theo audit đính kèm). Vòng này thêm job VERIFY
chặn trước DEPLOY ở cấp workflow; bật branch protection là thao tác trên GitHub UI, nằm ngoài repo.

## 8. Kết luận vào việc

Nền domain (AccessResolver, `transition()`, `versionWorkflow()`, immutable versions) đủ mạnh và
**không cần rewrite**. Toàn bộ khoảng trống nằm ở: (a) thiếu canonical bulk API dưới `/api/practice`,
(b) thiếu queue summary + selection-ids, (c) thiếu import batch continuity, (d) UI card-wall thay vì
dense table. Thứ tự thi công theo §53.
