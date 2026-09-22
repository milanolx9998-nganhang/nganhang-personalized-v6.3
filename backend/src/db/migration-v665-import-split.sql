-- V6.6.5 — một dòng bảng tính nguồn có thể chứa nhiều YCCĐ.
--
-- Bộ workbook KHTN chính thức có những ô "Yêu cầu cần đạt" gộp nhiều yêu cầu đánh số trong cùng một
-- dòng. Để giáo viên rà soát được từng YCCĐ trước khi nhập, mỗi yêu cầu phải là một dòng staging
-- riêng. Khóa tự nhiên của bảng staging vì thế đổi từ (job, sheet, dòng nguồn) thành
-- (job, sheet, dòng nguồn, thứ tự yêu cầu trong dòng).
--
-- Đây là nới lỏng ràng buộc trên bảng dàn dựng tạm, không phải dữ liệu lịch sử: không mất bản ghi nào.

ALTER TABLE curriculum_import_rows ADD COLUMN IF NOT EXISTS source_segment int DEFAULT 1;

UPDATE curriculum_import_rows SET source_segment = 1 WHERE source_segment IS NULL;

ALTER TABLE curriculum_import_rows
 DROP CONSTRAINT IF EXISTS curriculum_import_rows_import_job_id_source_sheet_source_ro_key;

CREATE UNIQUE INDEX IF NOT EXISTS curriculum_import_rows_source_key
 ON curriculum_import_rows (import_job_id, source_sheet, source_row, source_segment);
