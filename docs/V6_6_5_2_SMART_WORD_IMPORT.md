# V6.6.5.2 — Nhập Word thông minh, tự nhận chương trình, duyệt theo ngoại lệ

Ngày: 2026-09-23 · Nguồn yêu cầu: `V6_6_5_2_FULL_SMART_WORD_IMPORT_AUTO_CURRICULUM_REVIEW_PROMPT.md`

Tóm tắt một dòng: **chọn Môn + Khối, thả tệp Word — mã câu tự ra Outcome/YCCĐ/Mức/Dạng/Bài; phần
"Tùy chọn thêm" chỉ để đối chiếu; lỗi chặn / cần xem / thông báo tách bạch; người duyệt lọc theo ngoại
lệ và duyệt nhanh phần sạch.**

---

## 1. Đã sửa gì

### Backend

| Tệp | Thay đổi |
|---|---|
| `db/migration-v6652-import-context.sql` (mới) | `import_jobs.context jsonb` — lưu Môn/Khối/Kho + kỳ vọng của phiên nhập. Additive. Đã đăng ký trong `upgrade.js`, **đã áp dụng DB local**. |
| `services/questionCode.js` | `isCodeAttempt()` — phân biệt "mã hiện hành viết sai" (chặn) với "Câu 1." / mã cũ `KHTN.M1.12` (đi đường metadata). |
| `services/practice/importAdapters.js` | Word: mã sai giữ trong `code_raw` (không lẫn vào nội dung câu); mã viết liền kiểu cũ được chuẩn hóa + gắn `code_legacy`; trả `metadata` = các dòng trước câu đầu tiên. |
| `services/curriculumResolver.js` | YCCĐ/Outcome đã ngừng dùng → lỗi `*_RETIRED` kèm chuẩn thay thế **đã khai** (superseded_by / curriculum_replacements), không tìm gần giống; `codeForMetadata()` sinh mã chuẩn từ phân loại; `master_data_missing` khi cả phân môn chưa có liên kết Bài; `applyResolution()` **giữ giá trị người dùng khai** khi lệch mã và trả xung đột có nhãn nghiệp vụ. |
| `services/practice/imports.js` | Viết lại tầng staging: ngữ cảnh phiên (`context`) vs kỳ vọng (`expectations`); bảng mức nghiêm trọng (blocking / review / info); `settle()` → `status` + `category` (AUTO_RESOLVED / VALID_METADATA / NEEDS_REVIEW / ERROR); `SESSION_CONTEXT_MISMATCH`, `INVALID_CODE`, `UNKNOWN_OUTCOME/YCCD`, `CURRICULUM_RETIRED`, `CODE_METADATA_CONFLICT` (chặn), `LESSON_*`, `OPTIONAL_*_MISMATCH` (cần xem, "Giữ theo mã" = `ack_codes`), `DUPLICATE_SUSPECT` kèm **% giống** (nội dung 40 · phương án 20 · đáp án 20 · ảnh 10 · nguồn 10); dòng "Bài:/Môn:/Khối:" đầu tệp Word làm kỳ vọng; hàng loạt trong staging chỉ còn **Bài** (và mức/dạng cho câu **không mã**); đánh số chỉ gắn cho câu có mã + cảnh báo `PARTIAL_CODE_COVERAGE`; kho đích lấy từ ngữ cảnh; danh sách lần nhập có môn/khối/số lỗi/số cần xem. |
| `services/questionReview.js` · `practice/bulkWorkflow.js` · `routes/practice.js` | `reason_codes` có cấu trúc (7 mã cố định) được **kiểm ở máy chủ** và ghi vào nhật ký từng câu + nhật ký lô; trả sửa chấp nhận chỉ mã, không cần chữ. |
| `services/practice/questions.js` | `CHECK_SQL` (kiểm tra máy) + bộ lọc `exception` (clean/level/lesson/duplicate/metadata/media) + lọc `ids`; **bất biến mã–phân loại** khi lưu: lệch → 409 `CODE_METADATA_CONFLICT` kèm `suggested_code`, `regenerate_code: true` thì tạo lại mã; tạo tay có YCCĐ + số → tự sinh mã chuẩn. |
| `services/practice/questionQueue.js` | Mỗi dòng có `checks` (mã, chuẩn, Bài, mức, dạng, đáp án, lời giải, ảnh, trùng) — chỉ đúng/sai, không lộ đáp án. |
| `services/curriculumMaster/service.js` | `mapImport`: máy chủ **luôn** tự nhận sheet thuộc bộ nguồn chính thức; bỏ `source_profile` cũng không vượt được kiểm khối. `masterDataHealth()` + `GET /api/curriculum/health`. |
| `services/curriculumMaster/lessonSeed.js` (mới) · `db/seed-khtn7-vatli-lessons.js` | Seed chỉ liên kết vào bản **PUBLISHED mới nhất**; không có thì dừng (`--allow-legacy` để dùng dữ liệu cũ); nguyên văn trùng → `AMBIGUOUS_YCCD_TEXT`; Bài dùng lại theo môn + khối + phân môn + tên. |

### Frontend

| Tệp | Thay đổi |
|---|---|
| `pages/practice/ImportCenter.jsx` | Viết lại: kéo thả tệp; **Tải mẫu Word** là nút chính; nhớ Môn/Khối/Kho; "Tùy chọn thêm" thu gọn (Phân môn, Bài, Mức, Dạng, Kho đích, Sheet, Mẫu Excel nâng cao, Mẫu quản trị Outcome/YCCĐ); tab theo nhóm kết quả; mỗi vấn đề có nút xử lý tại chỗ (**Theo mã**, **Sửa mã câu**, **Giữ theo mã**, **Bỏ tùy chọn cho cả lô**); dải kiểm tra máy; % trùng; xuất CSV danh sách lỗi; phím tắt J/K/X/E; tóm tắt sau nhập. |
| `pages/practice/workspace/MachineChecks.jsx` (mới) | Dải ✓ / ! / – dùng chung cho màn nhập và hàng đợi. |
| `pages/practice/ReviewWorkspace.jsx` | Lọc nhanh theo ngoại lệ (Tất cả / Sạch / Cần xem mức / Chưa gắn Bài / Nghi trùng / Lỗi metadata / Media); gửi `reason_codes`. |
| `pages/practice/queue/BulkQuestionToolbar.jsx` | Lô lẫn sạch/có vấn đề: **[Duyệt N câu đủ điều kiện] [Xem M câu còn lại]**; gửi `reason_codes`. |
| `pages/practice/queue/QuestionQueue.jsx` | Dải kiểm tra máy ở khung xem trước; số mục chưa đạt ngay trên dòng. |
| `pages/practice/Banks.jsx` | Lưu bị 409 lệch mã → hỏi "Tạo lại mã theo phân loại mới?"; gửi `reason_codes`. |
| `pages/curriculum/CurriculumManager.jsx` · `MasterDataHealth.jsx` (mới) | Bỏ checkbox "Dùng hồ sơ nguồn chính thức"; chặn nút Map khi sheet chính thức lệch khối; tab **Sức khỏe dữ liệu**. |
| `styles/question-queue.css` | Kiểu cho dropzone, tab trạng thái, danh sách vấn đề, dải kiểm tra, lọc ngoại lệ. |

### Mẫu

- `templates/question-import-khtn.docx` sinh lại: dòng đầu ghi rõ "Mã Outcome/YCCĐ trong ví dụ chỉ
  minh họa cấu trúc", giải thích cấu trúc mã, "chỉ cần chọn Môn và Khối", dòng "Bài:" tùy chọn.

---

## 2. Đã chạy / thành công

| Kiểm tra | Kết quả |
|---|---|
| Unit backend (`npm test`) | **113/113** |
| Unit mới `test/practice/word-import-v6652.test.js` | **7/7** — Word đủ 5 dạng + ảnh + bảng + công thức, mã sai giữ `code_raw`, mã viết liền, `isCodeAttempt`, `splitMetadata`, mức nghiêm trọng, đánh số khi có câu không mã |
| Integration mới `test/integration/v6652-import.test.js` | **14/14** — tự gắn Bài khối 7 (L.1.3 → Bài 9), tùy chọn lệch chỉ cảnh báo + ack + bỏ tùy chọn, câu không mã dùng kỳ vọng, mã sai chặn + không confirm, xung đột chặn + "Theo mã", YCCĐ ngừng dùng chỉ báo thay thế, phân môn chưa có dữ liệu Bài, đánh số một phần, kho đích, kiểm tra máy + lọc ngoại lệ không lộ đáp án, 409 + mã đề xuất + tạo tay sinh mã, `reason_codes` kiểm + nhật ký, sức khỏe dữ liệu, seed chốt V2 PUBLISHED / chặn trùng nguyên văn |
| `v665-resolver` | cập nhật: xung đột mã–metadata nay là **ERROR** (blocking) và thông báo không lộ id |
| `v665-bootstrap` | thêm ca: `source_profile` null / không gửi vẫn bị 409 `TRUSTED_SOURCE_GRADE_MISMATCH` |
| Frontend `npm run build` | thành công |
| `npm run migrate` (local) | `Applied migration-v6652-import-context.sql` |
| Seed KHTN7 local | mặc định dừng `NO_PUBLISHED_VERSION` (đúng luật mới); `--dry-run --allow-legacy` → 13 Bài dùng lại, 31 liên kết đã có |

---

## 3. Quyết định & lưu ý

- **Backend không bắt buộc Môn/Khối** khi upload (tương thích API cũ và test v63); giao diện bắt buộc.
  Câu có mã mà thiếu Môn/Khối → `GRADE_CONTEXT_MISSING` (chặn).
- **"Tự nhận diện từ mã"** chỉ dành cho câu mà mã thật sự resolve ra chuẩn; câu không mã hợp lệ là
  "Hợp lệ theo metadata".
- Thông báo `info` (vd. mã viết liền đã chuẩn hóa) **không** làm câu thành "Cần xem".
- Giới hạn tải tệp **10 lần/phút/người** là bảo vệ thật — test không nới, chia tải giữa hai tài khoản.
- "Giữ theo mã" (`ack_codes`) chỉ tắt được cảnh báo cần-xem; lỗi chặn không thể ack.
- Seed KHTN7 trên **máy chủ thật**: cần bản PUBLISHED hoặc chạy `--allow-legacy` (xem
  `docs/KHTN7_VATLI_BAI_YCCD.md`).
- Vẫn mở từ trước: nguồn Khối 8 Chủ đề 18 có hai YCCĐ cùng số 1 — cần người phụ trách chương trình
  quyết định.

## 4. Regression đầy đủ (chạy tuần tự từng tệp, trên bản sao DB dùng một lần)

| Bộ | Kết quả |
|---|---|
| Unit (`npm test`) | 113/113 |
| `pilot.test.js` (có UI nhập Word bằng Playwright) | 34/34 |
| `v63.test.js` | 47/50 — đúng 3 lỗi **có sẵn từ trước** (#30 V643 UI timeout, #47 V66 401, #50 V66 UI timeout), baseline đã xác nhận trên HEAD sạch |
| `v664-bulk.test.js` | 12/12 |
| `v665-bootstrap.test.js` | 7/7 |
| `v665-resolver.test.js` | 10/10 |
| `v6652-import.test.js` (mới) | 14/14 |
| Frontend build | OK |
