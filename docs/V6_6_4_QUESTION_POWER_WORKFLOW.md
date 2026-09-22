# V6.6.4 — QUESTION POWER WORKFLOW

Mục tiêu: `POWER UX cũ + DOMAIN/VERSION/SECURITY mới`. Không rewrite backend, không quay lại
`/questions` legacy làm canonical.

## 1. Kiến trúc quyết định

### Preflight và thực thi dùng chung một đường mã

Cách dễ sai nhất là viết một bộ luật riêng cho "xem trước" rồi để nó lệch dần với luật thật. Vòng này
làm ngược lại: **preflight chạy đúng đường thực thi rồi rollback**.

`evaluateBulk()` (`backend/src/services/practice/bulkWorkflow.js`) chạy thật từng câu trong một
`SAVEPOINT`:

- `bulkPreflight()` gọi nó trong `dryRun()` — transaction luôn ROLLBACK, nên không có gì được ghi.
- `bulkWorkflow()` gọi nó trong `tx()` — nếu mọi câu đều đạt thì COMMIT.

Hệ quả: không tồn tại "luật preflight". Có đúng một bộ luật, là `versionWorkflow()` và `transition()`.

### Không có đường ghi tắt

| Business action | Đi qua |
|---|---|
| `submit` / `approve` / `request_changes` / `reject` | `versionWorkflow()` |
| `archive` / `activate` | `transition()` |

Không có câu lệnh SQL nào đổi `lifecycle` hay `review_status` trong mã bulk. Mọi kiểm tra quyền,
chính sách người duyệt thứ hai, `validateCurriculum`, `validateQuestion`, khóa phiên bản và nhật ký
theo từng câu đều giữ nguyên như duyệt một câu.

### Atomic theo mặc định

Một câu không đủ điều kiện thì **không câu nào** được áp dụng: `bulkWorkflow` ném 409 kèm toàn bộ
phân loại, transaction rollback. Giao diện đề nghị "Bỏ các câu không hợp lệ và chạy lại" với đúng
danh sách `eligible`.

### Duyệt nhanh chỉ cho câu sạch

`deepReviewSignals()` tách sang `requires_deep_review` (không phải `blocked`) các câu:
cách ly, còn hồ sơ P0/P1 mở, `metadata_status=NEEDS_REVIEW`, thiếu/không hợp lệ YCCĐ,
lỗi `validateQuestion`, phiên bản đã đổi, và trường hợp cần người duyệt thứ hai.

Không âm thầm bỏ qua: chúng hiện trong báo cáo preflight và chặn cả lô nếu người dùng vẫn bấm chạy.

### Phiên bản đang xem

Lựa chọn luôn mang cặp `question_id + current_version_id`. `approve` **bắt buộc** gửi
`expected_versions`; lệch phiên bản ⇒ `STALE_VERSION`. Reviewer không thể duyệt bản mình chưa xem.

## 2. API canonical (dưới `/api/practice`)

| Endpoint | Việc |
|---|---|
| `GET /questions/queue` | Tóm tắt hàng đợi, có phân trang và tổng số |
| `GET /questions/selection-ids` | Chọn-tất-cả-theo-bộ-lọc do máy chủ giải, cap 500, trả `total`/`truncated`/`expected_versions` |
| `POST /questions/bulk-preflight` | Chạy thử, trả `{requested, eligible, blocked, requires_deep_review}` |
| `POST /questions/bulk-workflow` | Thực thi atomic, trả `{batch_id, applied, question_ids}` |
| `GET /imports` | Danh sách lần nhập để mở lại sau khi tải lại trang |

Legacy `/api/questions/bulk-review` **không** được frontend mới gọi. Nó còn đó cho client cũ.

## 3. Tóm tắt hàng đợi không lộ đáp án

`questionQueue.js` dùng danh sách cột tường minh trong SQL (không `q.*`) rồi ánh xạ qua một allowlist
thứ hai trong JS. Không có `answer`, `answer_key`, `explanation`, `stem_text` đầy đủ hay
`normalized_content` trong payload; `stem_excerpt` cắt còn 180 ký tự và `answer_hidden=true`.

Nội dung đầy đủ lấy từ `/questions/:id/compare`, endpoint này tự kiểm `content.view_answer`.

Tên tác giả chỉ kèm khi người xem có `content.review`/`content.approve` hoặc là quản trị — reviewer cần
biết để áp chính sách người duyệt thứ hai.

## 4. Thông tin kiến trúc màn hình

- `/practice/banks` — **Kho câu hỏi**: dense table + preview dính, giữ nguyên BankScopeFilters, xuất
  Excel, QuestionQuality, thêm/sửa/sao chép/lịch sử/kho đích.
- `/practice/reviews` — **Duyệt câu hỏi**, ba tab:
  - *Cần gửi duyệt* (`content.write`): bản nháp DRAFT; tác giả không có quyền duyệt chỉ thấy câu của mình.
  - *Chờ duyệt* (`content.review`/`content.approve`): `review_status=PENDING_REVIEW`.
  - *Hồ sơ sự cố*: giữ nguyên `ReviewQueue.jsx` và toàn bộ domain hồ sơ (bằng chứng, mức ưu tiên,
    phân công, kết luận, cách ly). Duyệt phiên bản **không** tự đóng hồ sơ.

## 5. Nối liền Import → Duyệt

`confirmJob()` trả thêm `job_id` và `question_ids`. Sau khi xác nhận, giao diện hiện:

```
Đã nhập N câu · lô <job-id>
[ Mở nhóm vừa nhập ]        -> /practice/banks?import_job_id=<id>
[ Gửi nhóm này đi duyệt ]   -> /practice/reviews?tab=author&import_job_id=<id>
```

Lọc theo `import_job_id` dựa trên `import_items.result_question_id`, nhưng **vẫn** đi qua scope môn/khối,
bank ACL và capability như mọi truy vấn khác. Biết job id không mở ra câu ngoài phạm vi — có ca kiểm thử
riêng cho điều này.

## 6. Nhập câu hỏi dạng lưới

`/practice/import` không còn render mỗi câu thành một thẻ có editor. Thay bằng: tóm tắt → lọc trạng thái
→ lưới kiểu bảng tính → preview/editor dính bên phải. Chỉ dòng đang chọn mới mount `QuestionEditor`.

Chọn: tất cả hợp lệ · theo bộ lọc · WARNING · NEEDS_REVIEW · bỏ chọn. Dòng ERROR không tick được và bị
loại khỏi tập xác nhận kể cả khi đã tick trước lúc kiểm tra lại.

Mọi lần lưu đều gọi lại backend để kiểm tra và phát hiện trùng; frontend không tự phán quyết.

## 7. Phím tắt

`J`/`K` chuyển câu, `Space` chọn, `A` duyệt, `R` yêu cầu sửa. Không kích hoạt khi con trỏ đang ở
`input`, `textarea`, `select` hoặc vùng `contenteditable`. Sau một thao tác đơn thành công, con trỏ tự
nhảy sang câu chờ duyệt kế tiếp.

Thao tác đơn cũng gọi `bulk-workflow` với một ID — một câu và năm trăm câu tuân thủ cùng một luật.

## 8. Nhật ký

Mỗi lô ghi một bản ghi `QUESTION_BULK_WORKFLOW` trong `practice_audit` với `batch_id`, người thực hiện,
hành động, danh sách question id, kho đích, lý do và kết quả. Nhật ký theo từng câu và lịch sử phiên bản
vẫn ghi như cũ bên trong `versionWorkflow`/`transition`.

## 9. Không có migration

Vòng này không thêm cột hay bảng nào. Toàn bộ dữ liệu cần thiết đã có từ V6.4.3/V6.6.3. Đây là mức
additive mạnh nhất có thể và làm cho cổng migration của auto-deploy không phải chặn gì.
