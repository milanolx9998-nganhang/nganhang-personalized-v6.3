# V6.6.6.2 — Sửa theo audit `c92054a` (V6.6.6.1)

Ngày: 2026-09-23 · Nguồn: `AUDIT_COMMIT_C92054A_V6661.md` · HEAD trước khi sửa: `c92054a`

## 1. Bảng xử lý

| # | Mức | Vấn đề audit | Trạng thái | Cách sửa |
|---|---|---|---|---|
| 1 | P1/P2 | Hoàn tác không trả được mức `null` | **ĐÓNG** | Đường hoàn tác nội bộ nhận mức ba trạng thái: không có khóa = không sửa, `1..4` = đặt mức, `null` = "chưa có mức". Hoàn tác luôn gửi mức cũ (kể cả `null`) và **mã hiển thị cũ**: mã cũ chỉ là mã nội bộ (câu chưa có mã hiển thị) thì bỏ mã hiển thị. API công khai vẫn chỉ nhận `1..4` (gửi `null` → 400). |
| 2 | P2 | Nhập > 500 câu: nút "Gửi đi duyệt" vượt giới hạn bulk 500 | **ĐÓNG** | API mới `POST /practice/imports/:id/submit`: máy chủ lấy mọi câu của lần nhập đã xác nhận, chia phần ≤ `MAX_BULK_IDS`, mỗi phần một transaction; câu đủ điều kiện được gửi, câu chưa đủ giữ nguyên và trả kèm lý do (`blocked`). Chỉ người nhập hoặc admin (qua `getJob`); lần nhập chưa xác nhận → 409. Ghi nhật ký `QUESTION_BULK_WORKFLOW` từng phần + `IMPORT_SUBMIT`. Giao diện gọi API này thay cho preflight + bulk-workflow. |
| 3 | P2 | "Đã gắn Bài / chưa gắn Bài" chỉ đếm 100 câu đầu | **ĐÓNG** | `confirmJob()` trả `lessons: {assigned, unassigned}` đếm trên **cả lô** ở máy chủ (cả khi gọi lại với lần nhập đã xác nhận). Giao diện bỏ việc đếm trên trang hàng đợi `limit=100`. |
| 4 | P2 watch | `exception-counts` ~1,1 s ở 20k | **THEO DÕI** | Không đổi ở vòng này. Hướng tiếp: tính sẵn cờ kiểm tra khi lưu câu / cache ngắn; đo 50k khi kho tăng. |
| 5 | P3 | `question_edit_operations` chưa có retention | **ĐÓNG** | `pruneEditOperations()` xóa thao tác hết hạn quá 30 ngày; chạy lúc khởi động và mỗi 24 giờ. Lỗi (vd. chưa migrate) chỉ cảnh báo, không chặn khởi động. |
| 6 | P3 | Dòng khởi động vẫn in `V6.6.5` | **ĐÓNG** | `server.js` đọc version từ `backend/package.json` một chỗ cho cả dòng khởi động lẫn `/api/health` (nay in "Ngân hàng V6.6.6"). |
| 7 | P3 | UAT Word thật | **CHỜ NGƯỜI** | Không tự động hóa được. |

## 2. Test hồi quy mới

- `v666-workbench`: **null → TH → hoàn tác → null**. Mã hiển thị và Bài trở lại như trước. `cognitive_level:null` qua API công khai → 400.
- `v6652-import`: **lô Word 501 câu**:
  - xác nhận → `lessons = {assigned: 501, unassigned: 0}`;
  - bỏ Bài 150 câu → gọi lại → `{351, 150}`;
  - `POST /imports/:id/submit` → 200, gửi đủ 501 (hai phần 500 + 1), cả 501 ở `PENDING_REVIEW`;
  - gửi lại → 0 câu, không lỗi;
  - người khác gửi lô → 403.

## 3. Tệp đổi

**Backend:**
- `services/practice/quickEdit.js`: mức ba trạng thái, trả lại mã cũ khi hoàn tác, `pruneEditOperations`.
- `services/practice/imports.js`: `lessonSummary`, `submitImportJob`.
- `routes/practice.js`: route `/imports/:id/submit`.
- `server.js`: `VERSION` từ package.json, lịch dọn thao tác hoàn tác.

**Frontend:** `pages/practice/ImportCenter.jsx` (gửi qua API mới, dùng `lessons` từ máy chủ).

**Test:** `v666-workbench.test.js`, `v6652-import.test.js`.

Không có migration mới.

## 4. Kiểm chứng

Windows + PostgreSQL 16 local, chạy từng file một.

| Bộ | Kết quả |
|---|---|
| unit | 115/115 |
| security | 27/27 |
| pilot | 34/34 |
| v63 | 47/50 — đúng 3 lỗi có sẵn #30/#47/#50 |
| v664-bulk | 12/12 |
| v665-bootstrap | 7/7 |
| v665-resolver | 10/10 |
| v6652-import | 18/18 (+1: lô 501 câu, 39 giây cả file) |
| v666-workbench | 10/10 (+1: hoàn tác mức null) |
| v666-ui-gallery | 1/1 |
| build frontend | PASS |

- Log máy chủ test in đúng dòng "Ngân hàng V6.6.6 (local-lan) đang chạy tại:".
- Số DB tạm giữ nguyên 238 sau cả vòng: test tự dọn. Tồn đọng cũ vẫn chờ
  `node scripts/cleanup-test-databases.mjs --apply` (không hoàn tác được).
