# V6.6.5 — ĐÃ SỬA GÌ, ĐÃ ĐẠT GÌ

Ngày: 2026-09-22 · Nguồn: HEAD `d01b801d129c179314a385796ae1e2f3751db1ba`
Phiên bản sau khi sửa: **6.6.5** · **Chưa commit, chưa push.**

---

## A. TÓM TẮT

Hai việc, đúng như audit yêu cầu:

1. **Curriculum Auto Resolver** — mã câu hiện hành `Câu L. 2. 1. NB. 2. ĐS` cộng ngữ cảnh Môn + Khối
   tự ra Outcome/YCCĐ, rồi từ YCCĐ tự ra Bài qua liên kết Bài–YCCĐ.
2. **Question Workspace UX Simplification** — Kho / Nhập / Duyệt dùng chung một vỏ, lọc mặc định 5 ô,
   bảng 6 cột, nhập 3 bước, mọi thứ nặng chỉ hiện khi cần.

Backend V6.6.4 **không bị rewrite**. Một migration duy nhất, additive tuyệt đối.

---

## B. FILE ĐÃ TẠO / ĐÃ SỬA

### B1. Resolver và mã câu (backend)

| File | Trạng thái | Nội dung |
|---|---|---|
| `backend/src/services/questionCode.js` | **Mới** | `parseQuestionCode()` (regex chuẩn + dạng viết liền cũ), `buildDisplayCode()`, `canonicalKey()`, hằng Mode A/B, `inferNumberingMode()`, `checkNumbering()`. |
| `backend/src/services/curriculumResolver.js` | **Mới** | `resolveCurriculumCode()` tra theo môn+khối+phân môn+số Outcome+số YCCĐ; `resolveLesson()` trả AUTO_MAPPED / UNMAPPED / AMBIGUOUS; `resolveQuestionFromCode()`; `applyResolution()` điền phân loại và phát hiện xung đột mã ↔ metadata. |
| `backend/src/services/curriculumMaster/trustedProfiles.js` | **Mới** | Hồ sơ `KHTN_OUTCOME_YCCD_OFFICIAL_V1`: nhận diện sheet/cột, lấy khối từ tên sheet, quy mã phân môn về L/H/S, đánh số Outcome theo phân môn và YCCĐ theo Outcome. |
| `backend/src/services/practice/lessonAssignment.js` | **Mới** | `lessonOptions()` nhóm lựa chọn theo YCCĐ; `bulkAssignLesson()` gán Bài hàng loạt qua `persistQuestion`, atomic, chặn Bài chưa liên kết YCCĐ. |
| `backend/src/db/migration-v665-curriculum-code.sql` | **Mới** | Thêm `source_branch_code/source_ordinal/canonical_key/source_text` cho Outcome; `source_ordinal/canonical_key/source_text/source_page` cho YCCĐ; `numbering_mode/content_number/lesson_status` cho questions; chỉ mục duy nhất theo phiên bản; backfill khóa cho dữ liệu cũ. |
| `backend/src/services/practice/imports.js` | Sửa | `enrich()` gọi resolver trước `enrichMetadata` (mã tường minh thắng gợi ý từ khóa); thêm `resolutionOutcome()` chuyển kết quả resolve thành trạng thái dòng staging. |
| `backend/src/services/practice/questions.js` | Sửa | `persistQuestion` lưu `numbering_mode`, `content_number`, `lesson_status`; `questionScope` thêm bộ lọc `lesson_status` (kèm giá trị gộp `UNASSIGNED`). |
| `backend/src/services/practice/questionQueue.js` | Sửa | Tóm tắt trả thêm `lesson_status`, `content_number`, `numbering_mode`; thêm `authorOptions()` lấy danh sách người biên soạn theo **toàn bộ phạm vi**, không theo trang. |
| `backend/src/services/curriculumMaster/service.js` | Sửa | `preview()` trả hồ sơ tin cậy đã nhận diện; `commitImport()` điền canonical key + dấu vết nguồn và làm việc nạp lại thành idempotent. |
| `backend/src/routes/practice.js` | Sửa | Thêm `GET /questions/author-options`, `POST /questions/lesson-options`, `POST /questions/assign-lesson`. |
| `backend/src/db/upgrade.js`, `backend/src/server.js` | Sửa | Đăng ký migration mới; chuỗi version 6.6.5. |

### B2. Giao diện

| File | Trạng thái | Nội dung |
|---|---|---|
| `frontend/src/pages/practice/workspace/labels.js` | **Mới** | Một nơi duy nhất dịch enum kỹ thuật sang tiếng Việt; `questionStatus()` gộp về một trạng thái hiển thị duy nhất cho mỗi câu. |
| `frontend/src/pages/practice/workspace/WorkspaceShell.jsx` | **Mới** | Vỏ chung “Ngân hàng câu hỏi” với ba tab Kho câu hỏi · Nhập câu · Duyệt câu. |
| `frontend/src/pages/practice/workspace/SimpleFilterBar.jsx` | **Mới** | Mặc định 5 ô (Tìm · Môn · Khối · Bài · Lọc thêm), chips bỏ lọc, nâng cao ẩn sau một lần bấm; danh sách người biên soạn lấy từ endpoint theo phạm vi. |
| `frontend/src/pages/practice/workspace/LessonAssignDialog.jsx` | **Mới** | Gán Bài theo từng nhóm YCCĐ; nhóm chỉ có một Bài thì chọn sẵn; nhóm chưa có Bài thì nói rõ phải bổ sung liên kết trước. |
| `frontend/src/pages/practice/ImportCenter.jsx` | Viết lại | Ba bước; Môn + Khối là ngữ cảnh bước 1; summary “✓ tự nhận diện · ! cần xem · × lỗi” + nút “Chỉ hiện N câu cần xử lý”; lưới 8 cột hiển thị Outcome/YCCĐ/Bài do resolver điền; hàng “✓ Tự nhận diện” không có ô chọn thủ công; màn hình kết quả có 3 CTA. **Sửa bug state**: mọi thao tác dựng `nextJob` rồi lưu chính đối tượng đó, không đọc lại state cũ. |
| `frontend/src/pages/practice/Banks.jsx` | Viết lại | Dùng WorkspaceShell + SimpleFilterBar; bulk toolbar chỉ hiện khi có lựa chọn; nút “Gán Bài”; nhắc số câu chưa gắn Bài kèm lối tắt lọc; QuestionQuality thu vào `<details>`. |
| `frontend/src/pages/practice/ReviewWorkspace.jsx` | Viết lại | Nhãn “Bản nháp của tôi · Chờ duyệt · Cần xem kỹ”; người duyệt mở thẳng Chờ duyệt; preview có bộ đếm `Câu n / N` và nút ← →; bulk chỉ hiện khi có lựa chọn. |
| `frontend/src/pages/practice/queue/QuestionQueue.jsx` | Sửa | Bảng còn 6 cột; preview ưu tiên nội dung rồi mới tới phân loại; đáp án hiển thị dạng đọc được thay vì JSON; bỏ `QueueExtraFilters`. |
| `frontend/src/config/navigation.js` | Sửa | Gộp về một lối vào “Ngân hàng câu hỏi”; `activeGroup()` nhận cả ba route con. |
| `frontend/src/styles/question-queue.css` | Sửa | Vỏ workspace, chips, pill trạng thái, ba bước nhập, `.sr-only`. |

### B3. Kiểm thử và tài liệu

| File | Trạng thái | Nội dung |
|---|---|---|
| `backend/test/practice/question-code-v665.test.js` | **Mới** | 14 ca unit: parser, mã sai, dạng cũ, sinh mã, khóa theo khối, Mode A, Mode B, hồ sơ tin cậy, mã phân môn, đánh số thứ tự, và ca chứng minh mã câu không mang số Bài. |
| `backend/test/integration/v665-resolver.test.js` | **Mới** | 10 ca tích hợp trên DB clone. |
| `backend/test/integration/pilot.test.js` | Sửa | Ca UI cập nhật sang luồng nhập 3 bước và vỏ workspace; thêm khẳng định không có bulk khi chưa chọn và bộ lọc mặc định gọn. |
| `docs/V6_6_5_QUESTION_WORKSPACE_CURRICULUM_RESOLVER.md` | **Mới** | Luồng dữ liệu, ngữ pháp mã, ngữ cảnh khối, hai chế độ đánh số, gắn Bài, quyết định UX, giới hạn đã biết. |
| `artifacts/v665-question-resolver-acceptance.json` | **Mới** | Bằng chứng nghiệm thu theo đúng danh mục §69. |
| ba `package.json` | Sửa | 6.6.4 → 6.6.5. |

---

## C. ĐÃ THÀNH CÔNG (có bằng chứng chạy)

Chạy **tuần tự** trên Windows + PostgreSQL 16 local. Tích hợp clone DB sang bản dùng một lần.

| Bộ | Kết quả |
|---|---|
| `npm test` (unit) | **88/88 PASS** (74 cũ + 14 mới) |
| `npm run test:security` | **27/27 PASS** |
| `pilot.test.js` | **34/34 PASS** |
| `v664-bulk.test.js` | **12/12 PASS** |
| `v665-resolver.test.js` (mới) | **10/10 PASS** |
| `v63.test.js` | 47/50 — 3 lỗi **có sẵn từ trước**, xem mục D |
| `npm run build` (frontend) | **PASS** |
| Migration additive gate | **PASS** (exit 0) |
| Áp migration lên DB local | **PASS** — backfill 30 Outcome + 97 YCCĐ có canonical key |

**Tổng: 171 pass, 3 fail — cả 3 đều có sẵn trước vòng này.**

### 10 ca tích hợp V6.6.5 đã đạt

1. Cùng mã nghiệp vụ `L.1.3` ở khối 7 và khối 9 ra hai YCCĐ khác nhau — khối thật sự nằm trong khóa tra cứu.
2. `Câu L. 2. 1. NB. 2. ĐS` + ngữ cảnh KHTN/khối 9 tự điền Outcome L.2, YCCĐ L.2.1, dạng ĐS, mức NB,
   số đơn vị 2, **và tự gắn Bài 2** — không cần người dùng chọn lại gì.
3. Bốn fixture mapping đã xác nhận (KHTN7 Bài 8/9, KHTN9 Bài 2/3) đều khớp; Outcome 2 nằm ở cả Bài 2
   lẫn Bài 3 nên không tồn tại quy luật “Bài N = Outcome N”.
4. YCCĐ chưa gắn Bài **không chặn nhập**; YCCĐ thuộc nhiều Bài thì để trống và trả danh sách ứng viên.
5. Mã đúng cú pháp nhưng chuẩn không tồn tại thì **bị chặn**, và số Outcome trong DB không đổi —
   không tự tạo chương trình từ luồng nhập câu hỏi.
6. Mã và metadata lệch nhau (hình thức, mức) thì báo cho người dùng chọn, giá trị đã khai giữ nguyên.
7. Mã viết liền kiểu cũ vẫn đọc được, chuẩn hóa lại và có cảnh báo.
8. Nhập kho giữ `content_number` và `lesson_status`; lọc “chưa gắn Bài” tìm đúng câu; gán Bài hàng loạt chạy được.
9. Không gán được Bài chưa liên kết với YCCĐ của câu (`LESSON_NOT_LINKED`), và không câu nào bị đổi.
10. Danh sách người biên soạn lấy theo phạm vi, không theo trang đang hiển thị.

### Bằng chứng UX trên trình duyệt thật

Ca Playwright trong `pilot.test.js`: đăng nhập giáo viên → `/practice/import` thấy vỏ “Ngân hàng câu hỏi”
→ chọn Môn + Khối → tải `question-import-khtn.docx` → “Tìm thấy 5 câu” → **không textarea nào mount trong lưới**
→ `/practice/banks` → **không có bulk toolbar khi chưa chọn** → **bộ lọc mặc định ≤ 4 ô select** → giao bài
→ theo dõi lớp, `pageerror` rỗng.

---

## D. CHƯA ĐẠT / CHƯA CHẠY

1. **Chưa nạp thật bộ 4 workbook KHTN chính thức** vào một phiên bản chương trình vận hành. Hồ sơ tin cậy
   đã có và được kiểm thử ở mức nhận diện sheet/cột/khối và đánh số, nhưng tệp thật chưa commit.
2. **Chưa có Playwright E2E riêng cho toàn luồng V6.6.5** (§66). Luồng được phủ ở tầng API bởi 10 ca
   tích hợp và phủ một phần ở UI bởi ca pilot nói trên.
3. **Chưa chụp bộ ảnh UX.**
4. **`numbering_mode` chưa được ghi tự động khi commit lô nhập.** `inferNumberingMode()`/`checkNumbering()`
   đã có và được kiểm thử, nhưng mới dùng ở tầng kiểm tra lô, chưa nối vào đường ghi.
5. **Ba ca tích hợp lỗi có sẵn từ trước** (2 Playwright timeout, 1 lỗi 401 ở test competency V66) vẫn
   chưa được điều tra. Đã đo baseline trên HEAD sạch `331be20` để chứng minh không phải do V6.6.4/V6.6.5.
6. **Hạ tầng CI/deploy**: `DEFERRED_INFRA_NOT_BLOCKING_UX_V665` — không đụng trong vòng này theo yêu cầu.

---

## E. SAI LỆCH CÓ CHỦ Ý SO VỚI PROMPT

**§26 — “không parse được mã” được xếp vào nhóm chặn.**
Em triển khai thành **cần xem** thay vì **chặn**. Lý do: nhiều tệp đang lưu hành chưa theo quy ước mã mới,
chặn cứng sẽ làm hỏng luồng nhập hiện đang dùng được (ca Playwright nhập `question-import-khtn.docx` là
ví dụ trực tiếp). Trường hợp thực sự nguy hiểm — **mã hợp lệ nhưng chuẩn chương trình không tồn tại** —
vẫn bị chặn đúng như §36 yêu cầu, và có ca kiểm thử chứng minh không có Outcome nào được tạo thêm.

---

## F. RỦI RO NGOÀI PHẠM VI — VẪN CHƯA XỬ LÝ

**GitHub Personal Access Token nằm plaintext trong `.git/config`** (URL remote `origin`).
Cần thu hồi tại `https://github.com/settings/tokens` rồi đổi remote sang SSH hoặc credential helper.
Em không tự đổi vì ảnh hưởng trực tiếp khả năng push của anh. Đây là mục tồn từ vòng V6.6.4.

---

## G. GHI CHÚ VẬN HÀNH

- **Đừng chạy `npm run test:integration` để lấy kết luận.** Các file tích hợp chạy song song sẽ tranh
  `pg_dump` và tài nguyên, gây fail dây chuyền giả. Chạy từng file một.
- Migration V6.6.5 là additive và **đã được áp lên DB local**; máy chủ thật sẽ tự áp khi deploy vì
  `npm run migrate` chạy trong quy trình.
- Mã câu giữ nguyên quy ước hiện hành. Không có hệ mã mới nào được sinh ra.
