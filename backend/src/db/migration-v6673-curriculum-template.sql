-- V6.6.7.3: bản nháp chương trình (nạp từ file mẫu hoặc sửa trên web) mang theo danh sách Bài và mã YCCĐ của từng Bài.
-- Kế hoạch này chỉ áp dụng lúc công bố, vì liên kết Bài ↔ YCCĐ gắn với YCCĐ của từng phiên bản và không tự chép sang
-- phiên bản mới. Chỉ thêm cột, không đổi dữ liệu cũ.
ALTER TABLE curriculum_versions ADD COLUMN IF NOT EXISTS lesson_plan jsonb;
