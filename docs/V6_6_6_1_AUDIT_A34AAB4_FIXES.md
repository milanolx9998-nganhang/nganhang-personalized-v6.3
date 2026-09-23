# V6.6.6.1 — Sửa theo audit `a34aab4` (UI polish / unified workbench)

Ngày: 2026-09-23 · Nguồn: `AUDIT_HEAD_A34AAB4_V666_UI_POLISH.md` · HEAD trước khi sửa: `a34aab4`

## 1. Bảng xử lý

| # | Mức | Vấn đề audit | Trạng thái | Cách sửa |
|---|---|---|---|---|
| 1 | P1 | `allow_unlinked` công khai ở quick-edit và assign-lesson | **ĐÓNG** | Bỏ khỏi schema (gửi lên → 400) và khỏi service. Hoàn tác do máy chủ cấp quyền: mỗi lệnh sửa nhanh / gán Bài lưu trạng thái trước của từng câu vào `question_edit_operations` và trả `undo_token`. `POST /practice/questions/edit-operations/:id/undo` chỉ nhận mã: đúng người làm (khác người → 404), chưa hoàn tác (409 `ALREADY_UNDONE`), trong 30 phút (409 `UNDO_EXPIRED`), câu chưa bị sửa tiếp (409 `UNDO_STALE`). Khôi phục đúng Bài, mức, mã và `lesson_status` cũ. |
| 2 | P1/P2 | Kiểm tra máy không so phân môn L/H/S | **ĐÓNG** | `CHECK_SQL.code` so thêm chữ phân môn trong mã với phân môn thật của Outcome (VL/HH/SH quy về L/H/S). Sửa kèm lỗi cùng chỗ: regex trong template literal viết `\.` bị JS nuốt thành `.` (khớp mọi ký tự) → nay `\\.`. |
| 3 | P2 | "Phần sạch · máy đã kiểm đủ 9 mục" sai với câu không dùng mã | **ĐÓNG** | Đổi thành "Phần sạch · mọi kiểm tra áp dụng đều đạt". |
| 4 | P2 | Test tích hợp tạo DB tạm không xóa | **ĐÓNG** | `test/integration/helpers/cleanup.js`: dừng server, đóng pool, `pg_terminate_backend` + `DROP DATABASE`, xóa dump và uploads tạm; `KEEP_ARTIFACTS=1` để giữ khi điều tra. Áp cho mọi test tích hợp từ V6.6.4 trở đi. Chỉ xóa DB đúng mẫu tên tạm. Dọn tồn đọng: `node scripts/cleanup-test-databases.mjs` (liệt kê) / `--apply` (xóa). Máy local hiện có **238 DB tạm ≈ 3,2 GB + 274 thư mục/tệp tạm** — chưa xóa, chờ anh chạy `--apply`. |
| 5 | P2 | Count API có thể chậm khi kho lớn | **ĐÓNG (đo thật)** | Test tải mới `v6661-scale.test.js` với 20.000 câu (xem §2). Sửa: "Việc của tôi" gộp thành một truy vấn `count(*) FILTER`; chip ngoại lệ tính mỗi kiểm tra một lần mỗi câu (CTE `MATERIALIZED`) rồi đếm; hàng đợi chỉ tính cột kiểm tra cho các câu của trang; thêm index `questions(creator_id, created_at)`, `import_items(job_id, result_question_id)`. Công thức nhóm ngoại lệ viết một chỗ (`EXCEPTION_FORMULA`) cho cả lọc lẫn đếm — test khẳng định đếm = tổng hàng đợi. |
| 6 | P2 | Nút "Gửi N câu đi duyệt" sau nhập chỉ là Link | **ĐÓNG** | Gửi thật: preflight `submit` → gửi phần đủ điều kiện → báo "Đã gửi X · Y câu chưa gửi được", nút mở đúng nhóm. |
| 7 | P2 | Header Word "Môn:" chưa đối chiếu | **ĐÓNG** | Cảnh báo cả lần nhập `DOCUMENT_SUBJECT_MISMATCH`; so không dấu, chấp nhận mã môn, tên môn, viết tắt chữ cái đầu ("Khoa học tự nhiên" ↔ "KHTN"). |
| 8 | P2 | Nghi trùng mất dấu sau khi "Nhập thành câu mới" | **ĐÓNG — chính sách: chuyển thành hồ sơ rà soát** | Khi xác nhận nhập, câu nghi trùng mà người nhập vẫn chọn "nhập thành câu mới" được mở hồ sơ `DUPLICATE_SUSPECT` (P2, nguồn `IMPORT:<job>`, ghi câu nghi trùng + % giống). Câu đó không vào "Sạch" và hiện trong "Nghi trùng" ở màn Duyệt. |
| 9 | P3 | Tùy chọn thêm thiếu Chương / Chủ đề | **ĐÓNG** | Ô "Chương / Chủ đề" (lấy từ `topics.chapter`) thu hẹp danh sách Bài; là kỳ vọng — lệch Bài theo mã → `OPTIONAL_CHAPTER_MISMATCH` (cần xem), bỏ được cho cả lô. |
| 10 | P3 | Badge môi trường nặng ở PROD | **ĐÓNG** | TEST: dải cảnh báo; PROD/LAN: nhãn nhỏ góc phải kèm version. |
| 11 | P3 | Version frontend 6.6.5 | **ĐÓNG** | root/backend/frontend `6.6.6`; `/api/health` trả `6.6.6`. |
| 12 | P3 | Số đếm nhóm chồng nhau dễ hiểu nhầm | **ĐÓNG** | Ghi chú "Một câu có thể thuộc nhiều nhóm" cạnh thanh chip (+ `title`, `aria-describedby`). |
| 13 | P3 | UAT mắt người nhiều cỡ màn | **MỘT PHẦN** | Test giao diện chụp thêm 1366 / 1920 / 768 và kiểm nút chính nằm trong màn hình, không bị che (điểm giữa nút là chính nút). **UAT bằng lô Word thật vẫn cần người làm.** |

## 2. Số đo tải (20.000 câu, qua HTTP, trung vị 3 lần sau khởi động)

Xem `artifacts/v6661-scale.json` (ghi lại mỗi lần chạy). Kết quả cuối ở mục 4.

## 3. Tệp đổi

**Backend:** `db/migration-v6661-edit-ops.sql` (mới, additive, đã áp local) + `db/upgrade.js`;
`services/practice/quickEdit.js` (undo operations); `services/practice/lessonAssignment.js`;
`routes/practice.js`; `services/practice/questions.js` (`questionAccessScope`, `applyQuestionFilters`,
`EXCEPTION_FORMULA`, kiểm phân môn, sửa regex); `services/practice/questionQueue.js` (đếm/queue tối ưu);
`services/practice/imports.js` (Môn:, Chương, nghi trùng → hồ sơ rà soát); `server.js` (version).

**Frontend:** `workspace/QuickInspector.jsx` (`undoOperation`), `Banks.jsx`, `ReviewWorkspace.jsx`,
`ImportCenter.jsx`, `workspace/ExceptionChips.jsx`, `components/EnvironmentBadge.jsx`, `styles/theme.css`.

**Test / script:** `test/integration/helpers/cleanup.js` (mới), `v6661-scale.test.js` (mới), cập nhật
`v666-workbench`, `v6652-import`, `v666-ui-gallery`, `v665-*`, `v664-bulk`, unit `word-import-v6652`;
`scripts/cleanup-test-databases.mjs` (mới).

## 4. Kiểm chứng

Windows + PostgreSQL 16 local, chạy **từng file một** (không chạy song song).

| Bộ | Kết quả |
|---|---|
| `npm test` (unit) | 115/115 |
| `test/security` | 27/27 |
| `pilot` | 34/34 |
| `v63` | 47/50 — đúng 3 lỗi **có sẵn** #30/#47/#50 (Playwright timeout ×2, 401 competency V66) |
| `v664-bulk` | 12/12 |
| `v665-bootstrap` | 7/7 |
| `v665-resolver` | 10/10 |
| `v6652-import` | 17/17 (+3: Môn lệch, nghi trùng → hồ sơ, Chương lệch) |
| `v666-workbench` | 9/9 (+2: undo có quyền/hạn/stale, phân môn L/H/S) |
| `v666-ui-gallery` | 1/1 (thêm 1366 / 1920 / 768 + kiểm nút không bị che) |
| `v6661-scale` (20.000 câu) | 1/1 |
| `npm run build` (frontend) | PASS |

**Số đo tải cuối** (ms, trung vị 3 lần, ngưỡng 1.500):

| API | admin | giáo viên |
|---|---|---|
| hàng đợi `queue` | 87 | 64 |
| hàng đợi lọc "Chưa gắn Bài" | 51 | 52 |
| `view-counts` | 62 | 78 |
| `exception-counts` | 1.060 | 1.113 |

Đếm chip vẫn là API nặng nhất (tính 9 kiểm tra cho mọi câu trong phạm vi). Ở 20.000 câu đạt ngưỡng;
kho lớn hơn nhiều lần thì cân nhắc cột kiểm tra tính sẵn khi lưu câu.

**Sửa thêm lúc chạy regression:**
- Hoàn tác không phát hiện câu đã bị sửa tiếp khi lần sửa sau chỉ đổi Bài (đổi Bài không sinh phiên bản mới)
  → so thêm trạng thái hiện tại (Bài, mức, mã, `lesson_status`) với trạng thái ngay sau thao tác.
- Dọn DB tạm lỗi `permission denied to terminate process` (tiến trình nền PostgreSQL) → chỉ dừng kết nối của
  chính tài khoản, thử `DROP DATABASE` lại tối đa 10 lần.
- `pilot` và `v63` cũng dùng helper dọn; script dọn bắt thêm mẫu `nganhang_*_test_<số>.dump / -uploads`.
  Sau các lần chạy trên, số DB tạm không tăng.

**Tồn đọng chờ anh xóa** (`node scripts/cleanup-test-databases.mjs --apply`, không hoàn tác được):
238 DB tạm ≈ 3,2 GB + 274 thư mục/tệp tạm trong `artifacts/`.

**Chưa làm được bằng máy:** UAT với lô Word thật, xem tận mắt ảnh `artifacts/ui-banks-*.png`.
