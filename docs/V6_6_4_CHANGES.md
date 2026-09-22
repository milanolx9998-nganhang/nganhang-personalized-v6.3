# V6.6.4 — ĐÃ SỬA GÌ, ĐÃ ĐẠT GÌ

Ngày: 2026-09-22 · Nguồn: HEAD `331be20551e045214817a096774d6076f547ba23` (khớp commit Master Prompt đã audit)
Phiên bản sau khi sửa: **6.6.4** · **Chưa commit, chưa push.**

---

## A. TÓM TẮT MỘT ĐOẠN

Vòng này không mở rộng competency/curriculum. Làm bốn việc: (1) auto-deploy an toàn, (2) API hàng loạt
canonical cho câu hỏi, (3) Review Workspace ba tab, (4) chuyển Kho câu hỏi và Nhập câu hỏi từ card-wall
sang lưới dày + preview dính, nối liền Import → Duyệt. **Không thêm migration nào.**

---

## B. FILE ĐÃ SỬA / ĐÃ TẠO

### B1. Auto-deploy

| File | Trạng thái | Thay đổi |
|---|---|---|
| `.github/workflows/deploy.yml` | Sửa | Tách hai job `verify` → `deploy`; deploy chỉ chạy khi verify PASS. Thêm `concurrency: deploy-main` (`cancel-in-progress: false`). Verify chạy `npm ci` (backend+frontend), `npm run build`, `npm test`, `npm run test:security`, cổng an toàn migration. |
| `scripts/deploy-server.sh` | Viết lại | `set -Eeuo pipefail`; khóa `flock` chống deploy chồng; ghi `PREVIOUS_SHA`/`TARGET_SHA`; cổng migration chạy **trước khi** đổi source; `npm ci` khi có lockfile; backup bắt buộc trước migrate (backup fail ⇒ dừng, không migrate); migration fail ⇒ **không** restart; health poll 2s/lần trong 90s thay cho `sleep 2 && curl`; khi fail in `systemctl status` + `journalctl -n 200` + `ss -ltnp`; rollback ứng dụng về `PREVIOUS_SHA` rồi health lại. |
| `scripts/migration-safety.mjs` | **Mới** | Chặn migration phá hủy dữ liệu: `DROP TABLE/SCHEMA/DATABASE/COLUMN/TYPE`, `TRUNCATE`, `DELETE FROM`, `ALTER TABLE ... RENAME`, `ALTER COLUMN ... TYPE`, `SET NOT NULL`. Thoát mã 2 + in `DEPLOY_BLOCKED_MANUAL_MIGRATION_REQUIRED`. Không chặn DROP/CREATE OR REPLACE trigger/function/view vì đó là cách repo này tiến hóa hành vi. |

Mã thoát deploy: `DEPLOY_OK` · `DEPLOY_SKIPPED_LOCK_HELD` · `DEPLOY_BLOCKED_MANUAL_MIGRATION_REQUIRED` ·
`DEPLOY_BLOCKED_BACKUP_FAILED` · `DEPLOY_FAILED_MIGRATION` · `DEPLOY_FAILED_ROLLED_BACK_APP` ·
`DEPLOY_FAILED_NOT_RECOVERED`.

### B2. Backend

| File | Trạng thái | Thay đổi |
|---|---|---|
| `backend/src/db/pool.js` | Sửa | Thêm `dryRun(cb)` — chạy thật rồi **luôn ROLLBACK**. Đây là nền để preflight dùng chung đường mã với thực thi. |
| `backend/src/services/practice/bulkWorkflow.js` | **Mới** | `evaluateBulk()` chạy từng câu trong `SAVEPOINT` qua đúng `versionWorkflow()`/`transition()`; `bulkPreflight()` = chạy trong `dryRun`; `bulkWorkflow()` = chạy trong `tx`, một câu hỏng ⇒ **không câu nào** được áp dụng (409 kèm chi tiết). `deepReviewSignals()` tách câu rủi ro sang `requires_deep_review`. Cap 500 ID. Ghi nhật ký lô `QUESTION_BULK_WORKFLOW` có `batch_id`. |
| `backend/src/services/practice/questionQueue.js` | **Mới** | `questionQueue()` trả tóm tắt không có đáp án (danh sách cột tường minh trong SQL + allowlist thứ hai trong JS, `stem_excerpt` cắt 180 ký tự, `answer_hidden=true`, kèm `risk`). `selectionIds()` giải "chọn tất cả theo bộ lọc" phía máy chủ, cap 500, trả `total`/`truncated`/`expected_versions`. |
| `backend/src/services/practice/questions.js` | Sửa | Tách `questionScope()` + hằng `QUESTION_FROM` ra khỏi `questionList()` để list/queue/selection dùng **chung một nguồn luật phạm vi**. Thêm filter `review_status`, `created_by`, `import_job_id`; mở rộng `search` sang `question_code` và `display_code`. |
| `backend/src/services/practice/imports.js` | Sửa | Thêm `listJobs()` (giáo viên chỉ thấy lô của mình). `confirmJob()` trả thêm `job_id` và `question_ids` (cả nhánh đã xác nhận trước đó) — giữ ngữ cảnh lô sau khi nhập. |
| `backend/src/routes/practice.js` | Sửa | Thêm `GET /questions/queue`, `GET /questions/selection-ids`, `POST /questions/bulk-preflight`, `POST /questions/bulk-workflow` (zod strict), `GET /imports`. |
| `backend/src/server.js` | Sửa | Chuỗi version `6.5.3-pilot` → `6.6.4-pilot`, banner khởi động V6.5.3 → V6.6.4. |

### B3. Frontend

| File | Trạng thái | Thay đổi |
|---|---|---|
| `frontend/src/pages/practice/queue/QuestionQueue.jsx` | **Mới** | Dùng chung: `useQueue`, `useSelection` (giữ cặp `question_id + current_version_id`), `QuestionQueueTable` (bảng dày, sticky header, phân trang 30/50/100), `QuestionPreviewPane` (preview dính, lấy nội dung đầy đủ từ `/questions/:id/compare`), `QueueExtraFilters`. |
| `frontend/src/pages/practice/queue/BulkQuestionToolbar.jsx` | **Mới** | Checklist 4 mục **một lần cho cả lô** trước khi duyệt; nút "Kiểm tra trước" gọi preflight; báo cáo eligible / cần rà soát / bị chặn; nút "Bỏ các câu không hợp lệ và chạy lại". |
| `frontend/src/pages/practice/ReviewWorkspace.jsx` | **Mới** | `/practice/reviews` ba tab: *Cần gửi duyệt* (tác giả, DRAFT), *Chờ duyệt* (PENDING_REVIEW), *Hồ sơ sự cố* (nhúng nguyên `ReviewQueue.jsx`). Phím tắt J/K/Space/A/R, tự nhảy câu kế tiếp, thao tác đơn cũng đi qua `bulk-workflow`. |
| `frontend/src/pages/practice/Banks.jsx` | **Mới** (tách khỏi `Teacher.jsx`) | Kho câu hỏi dạng lưới dày + preview dính. Giữ đủ: BankScopeFilters, xuất Excel, QuestionQuality, thêm/sửa/sao chép/lịch sử phiên bản/kho đích/workflow. Thêm: checkbox, multi-select, chọn-tất-cả-theo-bộ-lọc, bulk toolbar. |
| `frontend/src/pages/practice/ImportCenter.jsx` | **Mới** (tách khỏi `Teacher.jsx`) | Lưới kiểu bảng tính thay card-wall; chỉ dòng đang chọn mới mount editor. Chọn: tất cả hợp lệ / theo bộ lọc / WARNING / NEEDS_REVIEW / bỏ chọn. Dòng ERROR không tick được và bị loại khỏi tập xác nhận. Mở lại lô nhập gần đây. Sau confirm hiện số câu + `job_id` + hai CTA sang Kho và sang Duyệt. |
| `frontend/src/pages/practice/Teacher.jsx` | Sửa | Bỏ `ImportCenter` và `Banks` (đã tách). Export `Metadata`, `QuestionEditor`, `TemplateDownloads` để dùng lại. Dọn import thừa. Còn lại: `TeacherDashboard` + các khối editor dùng chung. |
| `frontend/src/pages/practice/ReviewQueue.jsx` | Sửa | Đổi vỏ `section.practice-page`/`h1` → `section.review-cases`/`h2` để nhúng vào tab C không lồng hai `h1`. Giữ **nguyên** toàn bộ domain hồ sơ. Thêm một câu nêu rõ duyệt phiên bản không tự đóng hồ sơ. |
| `frontend/src/App.jsx` | Sửa | `/practice/reviews` → `ReviewWorkspace`; `ImportCenter`/`Banks` lazy-import từ file riêng; thêm `question-queue.css`. |
| `frontend/src/config/navigation.js` | Sửa | Nhãn `Rà soát · Duyệt phiên bản` → **`Duyệt câu hỏi`**; mở thêm cho `content.write` (tác giả cần vào tab gửi duyệt). |
| `frontend/src/styles/question-queue.css` | **Mới** | Bố cục bảng + preview dính; ở ≤720px bảng chuyển thành thẻ xếp dọc, không tràn ngang. |

### B4. Kiểm thử và tài liệu

| File | Trạng thái | Thay đổi |
|---|---|---|
| `backend/test/integration/v664-bulk.test.js` | **Mới** | 12 ca tích hợp thật, clone DB dùng một lần. |
| `backend/test/integration/pilot.test.js` | Sửa | Ca UI giáo viên trước đây khẳng định `article.practice-card` = 5 (chính là card-wall mà §49 yêu cầu bỏ). Cập nhật sang hợp đồng mới: lưới có 5 dòng **và** không có editor nào mount trong lưới. Đổi tiêu đề chờ từ `Kho câu hỏi và duyệt nội dung` → `Kho câu hỏi`. Đây là cập nhật hợp đồng, không phải che regression. |
| `docs/V6_6_4_CURRENT_AUDIT.md` | **Mới** | Baseline audit Phase 0. |
| `docs/V6_6_4_QUESTION_POWER_WORKFLOW.md` | **Mới** | Thiết kế bulk/queue/import. |
| `docs/V6_6_4_DEPLOY_INCIDENT.md` | **Mới** | Sự cố deploy — `ROOT_CAUSE_NOT_CONFIRMED`. |
| `docs/V6_6_4_DEPLOY_RUNBOOK.md` | **Mới** | Vận hành deploy. |
| `package.json`, `backend/package.json`, `frontend/package.json` | Sửa | `6.5.3` → `6.6.4`; description root cập nhật (trước còn ghi V6.4.3). |
| `AI_HANDOFF.md`, `AI_WORK_LOG.md` | Mới / cập nhật | Ghi chú liên tục. |

---

## C. ĐÃ THÀNH CÔNG (có bằng chứng chạy)

Chạy **tuần tự** trên Windows + PostgreSQL 16 local. Integration clone DB sang bản dùng một lần,
không đụng `nganhang_personalized_v63`.

| Bộ | Kết quả |
|---|---|
| `npm test` (unit) | **74/74 PASS** |
| `npm run test:security` | **27/27 PASS** |
| `test/integration/pilot.test.js` | **34/34 PASS** |
| `test/integration/v664-bulk.test.js` (mới) | **12/12 PASS** |
| `test/integration/v63.test.js` | 47/50 — 3 lỗi **có sẵn từ trước**, xem mục D |
| `npm run build` (frontend) | **PASS** |

### 12 ca V664 đã đạt

1. Tóm tắt hàng đợi không lộ `answer`/`answer_key`/`explanation`/`stem_text`/`normalized_content`; `selection-ids` trả đúng phiên bản đang xem.
2. Người ngoài phạm vi môn không thấy câu trong queue lẫn selection-ids.
3. Bulk submit bản nháp sạch → bulk approve bản chờ duyệt; nhật ký lô ghi đúng `batch_id` + danh sách ID. **Preflight đã được chứng minh là chạy khô** — trạng thái không đổi sau khi xem trước.
4. Câu ngoài phạm vi môn bị chặn `NO_PERMISSION`, không câu nào đổi trạng thái.
5. Phiên bản cũ bị từ chối `STALE_VERSION` (dựng bằng kịch bản thật: duyệt rồi sửa để sinh phiên bản mới).
6. Lô có câu hỏng ⇒ **không câu nào** được áp dụng; chạy lại với riêng phần hợp lệ thì thành công.
7. Quá 500 ID bị từ chối trước khi chạm dữ liệu.
8. `request_changes` không có lý do bị từ chối; có lý do thì đạt.
9. Tác giả không tự duyệt bài mình dù có quyền duyệt (`SECOND_REVIEWER_REQUIRED`).
10. Hồ sơ P0 đang mở đẩy câu sang `requires_deep_review`, không duyệt nhanh được.
11. Lưu trữ hàng loạt giữ nguyên số phiên bản lịch sử.
12. Import giữ ngữ cảnh lô: `confirm` trả `job_id` + `question_ids`; mở lại được lô; lọc theo `import_job_id` đúng 3 câu; **biết job id không tạo BOLA** (người ngoài phạm vi nhận 0 câu); lô nộp duyệt được ngay.

### Bằng chứng UX trên trình duyệt thật

Ca Playwright `Trình duyệt GV` trong `pilot.test.js` chạy thật qua Chromium: đăng nhập giáo viên →
`/practice/import` → nhập `question-import-khtn.docx` → **xác nhận lưới có 5 dòng và không editor nào
mount trong lưới** → `/practice/banks` → giao bài → theo dõi lớp, `pageerror` rỗng.

---

## D. CHƯA ĐẠT / CHƯA CHẠY — KHÔNG ĐƯỢC COI LÀ HOÀN TẤT

1. **`SERVER_DEPLOY_UAT_NOT_RUN`** — không có quyền máy chủ Ubuntu trong phiên này. Các mệnh đề deploy
   (verify fail ⇒ không deploy; backup fail ⇒ không migrate; migration fail ⇒ không restart; health
   retry > 2s; fail có diagnostics; không deploy chồng) mới đúng **theo mã**, chưa chạy trên máy thật.
2. **`ROOT_CAUSE_NOT_CONFIRMED`** — chưa phân biệt được app start chậm hay service crash trong sự cố
   run `35674256160`, vì log không có `journalctl`. Workflow mới sẽ tự in diagnostics ở lần fail kế tiếp.
3. **3 test tích hợp fail có sẵn từ trước** — đã đo baseline bằng `git stash` trên HEAD sạch `331be20`
   và nhận **đúng 3 lỗi đó**, nên không phải regression của V6.6.4:
   - `V643 UI học sinh tick bài…` — Playwright `TimeoutError`
   - `V66 giao diện editor/version/diff…` — Playwright `TimeoutError`
   - `V66 năng lực có phân quyền…` — 401 "Phiên đăng nhập đã hết hiệu lực"
4. **Playwright E2E riêng cho luồng V6.6.4 đầy đủ** (§43: import → grid → bulk metadata → confirm → CTA
   → author tab → bulk submit → reviewer → preflight → batch approve) **chưa viết**. Phần luồng này hiện
   được phủ ở tầng API bởi 12 ca V664 và phủ một phần ở UI bởi ca Playwright nói trên.
5. **Ảnh chụp UX theo §48** (import desktop/mobile, bank dense, pending review, batch preflight, deep
   review, mobile review) **chưa chụp**.
6. **Chưa đóng gói release.** `releases/` vẫn dừng ở v6.5.3.

---

## E. RỦI RO BẢO MẬT PHÁT HIỆN NGOÀI PHẠM VI — ƯU TIÊN CAO NHẤT

`git remote -v` cho thấy remote `origin` nhúng **GitHub Personal Access Token dạng plaintext** trong
`.git/config`. Token lộ với mọi tiến trình đọc được repo và mọi log lệnh git.

Việc cần làm: thu hồi token tại `https://github.com/settings/tokens`, rồi đổi remote sang SSH hoặc
credential helper. **Chưa tự sửa** vì thay đổi này ảnh hưởng trực tiếp khả năng push của chủ repo.

---

## F. GHI CHÚ VẬN HÀNH

- **Đừng chạy `npm run test:integration` để lấy kết luận.** Ba file tích hợp chạy song song sẽ tranh
  `pg_dump` và tài nguyên, gây fail dây chuyền giả (đã gặp: 51 fail giả, trong khi chạy từng file thì
  chỉ 3 lỗi có sẵn). Chạy từng file một.
- **Không có migration mới trong V6.6.4** ⇒ cổng migration của auto-deploy không phải chặn gì ở lô này.
- Thứ tự push nên theo §10 của Master Prompt: đẩy riêng phần deploy safety trước, xác nhận workflow mới
  chạy, rồi mới đẩy Question Power Workflow.
