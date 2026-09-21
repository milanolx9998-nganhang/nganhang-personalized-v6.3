# V1 · 11/09/2026

Bản sao nganhang-personalized-v1: thêm tự luyện/Mastery, version bất biến, kho ba tầng, roster/phân quyền lớp, import preview Word/Excel/QTI, xuất Word/PDF, giao bài fixed/dynamic, cấu hình chương trình và công cụ backup/restore. Giữ nguyên thư mục/database V4. Chi tiết thay đổi, test và các điều kiện triển khai IT còn lại: docs/VERIFICATION_REPORT.md.

# Lịch sử thay đổi

## V4.3.3 — 2026-04-18 (hotfix)

### 🐛 Fix lỗi migration `foreign key constraint cannot be implemented`

Nguyên nhân: Database đã có bảng `subjects` từ bản cũ (V2 hoặc V4.2) với schema khác kiểu dữ liệu (VD `id VARCHAR` thay vì `id INTEGER`). Khi migrate V4.3, `CREATE TABLE IF NOT EXISTS` bỏ qua bảng cũ nhưng vẫn tạo `branches` với FK `subject_id INTEGER REFERENCES subjects(id)` → type mismatch.

Fix:
- `migrate.js` hỗ trợ cờ `--reset`: xoá sạch tất cả tables/views/enums/functions cũ trước khi tạo mới
- Thông báo lỗi rõ ràng, gợi ý cách fix khi gặp lỗi type mismatch
- `init-database.bat` hỏi 2 lần xác nhận trước khi reset (an toàn không xoá nhầm)
- Dùng `DO $$ ... $$` block thay vì `DROP SCHEMA public CASCADE` — không cần quyền owner schema

## V4.3.1 — 2026-04-18 (hotfix)

### 🐛 Fix lỗi `Cannot find module './util.inspect'` khi chạy start-server.bat

Nguyên nhân: V4.3 đầu tiên giữ `"workspaces": ["backend", "frontend"]` trong root `package.json`, khiến npm hoist dependencies lên `nganhang-v4/node_modules/` chung. Quá trình hoist gây conflict với `object-inspect` và các sub-deps khác.

Fix:
- Bỏ `workspaces` khỏi root `package.json`, mỗi folder cài độc lập
- `install-windows.ps1` tự xóa node_modules hoisted cũ trước khi cài mới
- Thêm `scripts/fix-node-modules.bat` — một click fix cho người đã cài V4.3 bản đầu

## V4.3 — 2026-04-18

### 🐛 Vá bug nghiêm trọng từ V2

**Bug điểm lẻ khi khóa ô ma trận** (anh Duong Hieu phát hiện):
- V2: Khi khóa 2 ô tự luận với điểm 0.7đ, tổng điểm phân môn bị rớt 0.1đ (hiển thị 6.9đ thay vì 7.0đ)
- Nguyên nhân: `r025(essayBudget)` làm tròn sớm + vòng `while (abs(diff) >= 0.24)` bỏ qua lẻ < 0.24đ
- **V4.3**: Chuyển sang units integer (× 100), không còn floating-point drift. Ép mọi ô là bội 0.25đ. Nếu budget không chia hết 0.25 → throw lỗi rõ ràng thay vì silent rounding.

**Bug display "0.7 d TL"** — V2 hiển thị cắt cụt đơn vị "đ" → V4.3 hiển thị đúng "đ TL".

**Bug 0.7đ không phải bội 0.25** — V2 cho phép điểm lẻ 0.1đ, sai chuẩn BGD. V4.3 ép quy ước bội 0.25đ cho mọi ô.

### ✨ Tính năng mới so với V2

- **Preview coverage trước khi sinh đề** — báo cho biết ô nào đủ/thiếu câu
- **Topic scope 3 cấp** — chọn phạm vi kiểm tra theo chương → bài, lọc theo phân môn
- **Service Windows 24/7** — treo luôn, tự khởi động cùng máy, tự khôi phục khi crash
- **7 script one-click** — không cần nhớ lệnh, chỉ double-click icon Desktop
- **Fallback cảnh báo gộp theo ô** — không còn 20 dòng cảnh báo dồn dập như V2
- **51 bài KHTN 9 seed sẵn** — trích xuất từ file mẫu của anh
- **Anti-repeat bền vững** — tracking usage_count, tránh lặp câu trong N ngày
- **Audit log đầy đủ** — mọi hành động CRUD đều ghi log
- **5 vai trò với RBAC chi tiết** — admin, BGH, tổ trưởng, nhóm trưởng, giáo viên

### 🏗️ Kiến trúc mới (khác V2)

- Đổi từ Python FastAPI → Node.js Express (nhẹ hơn, cài đơn giản hơn trên Windows)
- PostgreSQL thay SQLite (hỗ trợ concurrent write cho 30-50 user)
- Schema chuẩn hóa: `matrix_cells` dùng FK `branch_id`/`topic_id` thay vì text
- 13 bảng, đầy đủ enum (user_role, question_type, cognitive_level, status, matrix_type)
- Trigger PostgreSQL tự update `updated_at`

### ⚠️ Breaking changes từ V2

- File dữ liệu V2 không migrate tự động được (khác schema). Cần export Excel từ V2 rồi import lại vào V4.3
- Mã đáp án Đúng-Sai giờ ghi dạng "a-Đ; b-S; c-Đ; d-S" trong cột N (chuẩn BGD 2025)

---

## V2 (tham khảo — hệ thống cũ)

- React + FastAPI + SQLite
- Ma trận UI đẹp nhưng có bug điểm lẻ (đã fix ở V4.3)
- Không có RBAC chi tiết
- Không có audit log
