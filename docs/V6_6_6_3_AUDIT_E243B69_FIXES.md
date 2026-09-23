# V6.6.6.3 — Sửa theo audit `e243b69` (V6.6.6.2)

Ngày: 2026-09-24 · Nguồn: `AUDIT_COMMIT_E243B69_V6662.md` · HEAD trước khi sửa: `e243b69`

## 1. Bảng xử lý

| # | Mức | Vấn đề audit | Trạng thái | Cách sửa |
|---|---|---|---|---|
| 1 | P2 | `POST /imports/:id/submit` gọi lại thì câu đã chờ duyệt bị tính "chưa gửi được" | **ĐÓNG** | Mỗi phần ≤ 500 câu: khóa các câu (`FOR UPDATE OF q`) rồi phân loại theo trạng thái phiên bản hiện hành. `PENDING_REVIEW` → `already_submitted`; `APPROVED` → `already_handled`; còn lại mới đưa vào `evaluateBulk` (gửi được → `submitted_now`, không được → `not_submitted` + `blocked`). Hai yêu cầu song song không cùng gửi một câu. Thử lại sau mất mạng hay sau khi một phần đã chạy xong đều cho số đúng với trạng thái thật. |
| 2 | P3 | `imported` (mục nhập) lệch với thống kê Bài / gửi duyệt (câu khác nhau) | **ĐÓNG** | `confirmJob` trả thêm `processed_items` (số mục đã xử lý) và `unique_questions` (số câu khác nhau trong kho). `imported` giữ lại bằng `processed_items` cho client cũ. Giao diện: tiêu đề và nút gửi dùng số câu trong kho; khi hai số khác nhau thì ghi rõ "Đã xử lý N mục nhập · M câu trong kho". |
| 3 | Watch | `exception-counts` ~1,1 s ở 20k | **THEO DÕI** | Không đổi. |

**API mới / đổi:**
- `POST /practice/imports/:id/submit` trả `{requested, submitted_now, already_submitted, already_handled, not_submitted, question_ids, blocked}`. Trường `submitted` cũ được thay bằng `submitted_now`.
- `POST /practice/imports/:id/confirm` trả thêm `processed_items`, `unique_questions`.

**Giao diện sau khi gửi:** "Đã gửi thêm X câu đi duyệt · Y câu đã gửi trước đó · Z câu đã được duyệt · W câu chưa gửi được". Phần nào bằng 0 thì ẩn.

## 2. Test hồi quy mới (`v6652-import.test.js`)

- **Gửi dở rồi gửi lại** (lô 501 câu): 200 câu đã được gửi trước đó qua bulk-workflow.
  - Gửi cả lô → `submitted_now 301 · already_submitted 200 · not_submitted 0`, cả 501 câu ở `PENDING_REVIEW`.
  - Gửi lần nữa → `submitted_now 0 · already_submitted 501 · not_submitted 0 · blocked []`.
- **Hai mục "tạo phiên bản" cùng trỏ một câu:**
  - `processed_items 2 · unique_questions 1`;
  - thống kê Bài tổng 1;
  - gửi duyệt `requested 1`.

## 3. Tệp đổi

- `backend/src/services/practice/imports.js`: `importResult`, `submitImportJob`.
- `frontend/src/pages/practice/ImportCenter.jsx`.
- `backend/test/integration/v6652-import.test.js`.

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
| v6652-import | 19/19 (+1 test mới, 1 test mở rộng) |
| v666-workbench | 10/10 |
| v666-ui-gallery | 1/1 |
| build frontend | PASS |

Số DB tạm giữ nguyên 238 (test tự dọn; tồn đọng cũ chờ `cleanup-test-databases.mjs --apply`).
