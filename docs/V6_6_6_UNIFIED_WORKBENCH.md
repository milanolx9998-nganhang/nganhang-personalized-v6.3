# V6.6.6 — Bàn làm việc hợp nhất: nhanh, hàng loạt, tinh chỉnh từng câu ngay trong lô

Ngày: 2026-09-23 · Nguồn: đề xuất giao diện đã được duyệt (canvas
https://claude.ai/artifact/AXCT9nbHYPpaSCHZR9jsUv) — "duyệt, làm full nhé".

Một dòng: **chọn một lô, sửa riêng câu nào cũng được mà lô không mất; mọi lệnh sửa phân loại hoàn
tác được; câu cùng vấn đề sửa một lần; phần sạch duyệt một lần; Ctrl+K làm mọi việc bằng bàn phím.**

---

## 1. Bốn màn đã triển khai

### 1.1 Bàn làm việc (Kho câu hỏi — `/practice/banks`)

- **Ba cột:** "Việc của tôi" bên trái · lưới câu ở giữa · khung xem + sửa nhanh bên phải.
- **Việc của tôi** (máy chủ đếm): Tôi nhập hôm nay · Bản nháp của tôi · Bị trả sửa · Chờ duyệt (người
  duyệt) · Chưa gắn Bài · Nghi trùng. Số đếm = đúng tổng của hàng đợi cùng bộ lọc (đã kiểm bằng test).
  **Góc nhìn tự lưu**: "+ Lưu góc nhìn này" lưu bộ lọc hiện tại trên máy này.
- **Lọc theo kiểm tra máy:** Sạch / Cần xem mức / Chưa gắn Bài / Nghi trùng / Lỗi metadata / Media.
- **Khung sửa nhanh** dưới câu đang xem:
  - Công tắc phạm vi **"Chỉ câu này ⇄ Cả N câu đang chọn"** (phím `G`).
  - **Bài**: chọn trong các Bài liên kết với YCCĐ của câu (hoặc bỏ Bài). Cả lô → hộp gắn Bài theo nhóm YCCĐ.
  - **Mức**: NB/TH/VD/VDC (phím `1`–`4`). Câu có mã: mức nằm trong mã → hiện
    `mã cũ → mã đề xuất` và nút **Tạo lại mã theo mức mới** / **Giữ theo mã**.
    Cả lô: kiểm trước — "A câu đổi được ngay · B câu phải tạo lại mã" → **Chỉ áp A câu** hoặc
    **Áp cả, tạo lại mã**.
  - Sửa riêng một câu đang nằm trong lô → câu được đánh dấu **"chỉnh riêng"** (nhãn tím trên dòng).
    Lệnh hàng loạt sau **giữ nguyên** câu đó (tắt được bằng ô "Giữ N câu chỉnh riêng" trên thanh lô).
- **Hoàn tác** (toast dưới màn hình + `Ctrl Z`): mọi lệnh sửa mức/Bài, kể cả gán Bài hàng loạt.
  Lệnh chuyển trạng thái (gửi duyệt, duyệt) **không** có hoàn tác — chúng đi qua quy trình duyệt.
- Lô đang chọn tự cập nhật phiên bản sau mỗi lần sửa, nên lệnh hàng loạt sau không bị báo "đã đổi".

### 1.2 Nhập Word (`/practice/import`)

- **Sửa theo nhóm vấn đề:** câu cùng vấn đề gom thành một thẻ (số câu, mức Chặn/Cần xem), nút sửa cả nhóm:
  - Mã lệch phân loại → **Theo mã cho cả nhóm**
  - Tùy chọn thêm lệch mã → **Giữ theo mã cho cả nhóm** · **Bỏ tùy chọn cho cả lô**
  - YCCĐ nhiều Bài → chọn Bài → **Gắn cho cả nhóm**
  - Bài chọn tay chưa liên kết → **Giữ Bài đã chọn cho cả nhóm**
  - Nghi trùng → **Bỏ qua cả nhóm** · **Tạo bản mới cho câu cũ**
  - Thiếu mức (câu không mã) → chọn mức → **Đặt cho N câu không mã**
  - Mã sai / Outcome-YCCĐ không có / chuẩn ngừng dùng → **Sửa từng câu** với ô sửa mã ngay trong nhóm
  - Nhóm "cần xem" có **Để sau**; mọi nhóm có **Xem từng câu** → từng dòng có nút riêng + **Mở câu**.
- **Ctrl+K**: chuyển nhóm kết quả, sửa theo nhóm, bỏ tùy chọn, xuất CSV, xác nhận nhập, tìm câu theo mã.

### 1.3 Duyệt (`/practice/reviews`)

- **Phần sạch** (tab Chờ duyệt, người có quyền duyệt): đếm mọi câu đạt đủ kiểm tra máy → checklist
  4 mục **một lần** → **Duyệt N câu sạch**. Máy vẫn kiểm trước; câu có rủi ro bị tách ra:
  **Duyệt X câu đủ điều kiện** / **Xem Y câu còn lại**.
- **Lý do trả sửa một chạm** luôn hiện dưới câu (không cần mở hộp thoại). Mục kiểm tra máy nào chưa
  đạt thì lý do tương ứng **được chọn sẵn** (viền cam = gợi ý). `R` = trả sửa với lý do đang chọn.
- Tab **Bản nháp của tôi** có khung sửa nhanh (mức/Bài) + hoàn tác, như bàn làm việc.
- Phím: `J/K` · `Space/X` · `A` duyệt · `R` trả sửa · `S` gửi duyệt · `E` xem kỹ · `Ctrl K` · `Ctrl Z`.

### 1.4 Bảng lệnh Ctrl+K (cả ba màn)

Gõ không dấu cũng được: "gan bai 9", "loc chua gan", "muc vd", mã câu… Lệnh theo ngữ cảnh: làm với lô
đang chọn (gắn Bài X cho N câu, đặt mức cho cả lô, gửi duyệt/duyệt/trả sửa lô), với câu đang xem, mở góc
nhìn, lọc (ngoại lệ, mức, dạng, Bài), đi tới màn khác, hoàn tác, tìm trong kho.

---

## 2. Thay đổi mã

### Backend

| Tệp | Thay đổi |
|---|---|
| `services/practice/quickEdit.js` (mới) | Sửa nhanh mức/Bài: `{ids, changes}` hoặc `{items:[{id,…}]}`; mỗi câu qua `persistQuestion` (giữ bất biến mã–phân loại, phiên bản, nhật ký, quyền); `regenerate_code` tường minh; Bài phải liên kết YCCĐ trừ `allow_unlinked` (dùng cho hoàn tác); `expected_versions` → `STALE_VERSION`; **tất cả hoặc không** (409 `atomic`); trả `before/after/current_version_id` để hoàn tác; nhật ký `QUESTION_QUICK_EDIT`. |
| `routes/practice.js` | `POST /questions/quick-edit/preflight` (giao dịch luôn hoàn tác), `POST /questions/quick-edit` (zod strict, không trộn hai dạng thân), `GET /questions/view-counts`. |
| `services/practice/questionQueue.js` | `workViews()` + `viewCounts()` — góc nhìn là bộ tham số lọc của hàng đợi, đếm cùng quy tắc phạm vi. |
| `services/practice/questions.js` | Bộ lọc `created_after` (`today` hoặc `YYYY-MM-DD`) và `returned=1` (bản đã được người duyệt trả). |
| `services/practice/lessonAssignment.js` | Gán Bài trả thêm `before_topic_id` + `current_version_id` từng câu (để hoàn tác và cập nhật lô). |

### Frontend

| Tệp | Thay đổi |
|---|---|
| `pages/practice/Banks.jsx` | Viết lại thành bàn làm việc 3 cột; phạm vi, chỉnh riêng, hoàn tác, bảng lệnh, phím tắt. |
| `pages/practice/ReviewWorkspace.jsx` | Phần sạch, lý do một chạm có gợi ý, sửa nhanh ở tab nháp, bảng lệnh, phím tắt dùng chung. |
| `pages/practice/ImportCenter.jsx` | Sửa theo nhóm vấn đề, bảng lệnh, phím tắt dùng chung. |
| `workspace/QuickInspector.jsx` (mới) | Khung sửa nhanh + `undoBody` / `undoLessonBody`. |
| `workspace/CommandPalette.jsx` (mới) | Bảng lệnh (tìm không dấu, combobox/listbox có ARIA). |
| `workspace/WorkViews.jsx` (mới) | "Việc của tôi" + góc nhìn tự lưu. |
| `workspace/UndoToast.jsx` (mới) | `useUndo` + toast hoàn tác. |
| `workspace/useHotkeys.js` (mới) | Phím tắt dùng chung (bỏ qua khi đang gõ, trừ Ctrl+K/Esc). |
| `workspace/RejectReasonPopover.jsx` | `ReasonChips` + `suggestedReasons` (gợi ý từ kiểm tra máy). |
| `queue/QuestionQueue.jsx` | `selection.sync/refresh` (cập nhật phiên bản trong lô), nhãn "chỉnh riêng" trên dòng. |
| `queue/BulkQuestionToolbar.jsx` | `requestedAction` (bảng lệnh mở thẳng thao tác), `onClear`. |
| `styles/question-queue.css` | Bàn làm việc, bảng lệnh, toast, lý do một chạm, nhóm vấn đề; màn hẹp gập rail thành hàng nút. |

---

## 3. Kiểm chứng (chạy tuần tự từng tệp, trên bản sao DB dùng một lần)

| Bộ | Kết quả |
|---|---|
| Unit (`npm test`) | 113/113 |
| `pilot.test.js` (có UI nhập Word / kho bằng Playwright) | 34/34 |
| `v63.test.js` | 47/50 — đúng 3 lỗi **có sẵn từ trước** (#30, #47, #50) |
| `v664-bulk.test.js` | 12/12 |
| `v665-bootstrap.test.js` | 7/7 |
| `v665-resolver.test.js` | 10/10 |
| `v6652-import.test.js` | 14/14 |
| **`v666-workbench.test.js` (mới)** | **7/7** |
| Frontend build | OK |

`v666-workbench.test.js` kiểm: tạo tay sinh mã chuẩn; đổi mức câu có mã → preflight báo mã đề xuất, thực thi
bị 409, `regenerate_code` mới cho đổi, hoàn tác trả đúng mức + mã + Bài; cả lô trộn câu có/không mã →
preflight tách đúng, thực thi là tất cả hoặc không; Bài chưa liên kết bị chặn, bỏ Bài → `UNMAPPED`, hoàn
tác gán Bài hàng loạt; phiên bản cũ / câu chờ duyệt / người ngoài phạm vi đều bị chặn; thân yêu cầu trộn
hai dạng → 400; "Việc của tôi" đếm đúng bằng tổng hàng đợi cùng bộ lọc. **Giao diện (Playwright):** đăng
nhập → bàn làm việc → phím `3` → "Tạo lại mã theo mức mới" → `Ctrl+Z` hoàn tác (kiểm DB) → `Ctrl+K` gõ
"loc chua gan" → Enter → lọc đúng; không lỗi runtime. Ảnh: `artifacts/v666-workbench.png`.

## 4. Lưu ý

- Mã phiên bản câu là UUID: `expected_versions` của sửa nhanh nhận chuỗi UUID (lỗi đầu tiên gặp khi test).
- "Chỉnh riêng" là trạng thái của phiên làm việc (không lưu máy chủ): bỏ chọn cả lô thì xóa dấu.
- Hoàn tác một bước (lệnh gần nhất). Không hoàn tác được lệnh chuyển trạng thái (gửi duyệt/duyệt).
- Câu đang chờ duyệt không sửa nhanh được (đúng quy trình): người duyệt dùng lý do trả sửa một chạm.
