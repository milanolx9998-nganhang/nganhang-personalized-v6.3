-- V6.6.5.2 — lưu ngữ cảnh phiên nhập câu hỏi.
--
-- Môn + Khối là nguồn quyết định của cả phiên nhập, còn Phân môn/Bài/Mức/Dạng chọn thêm chỉ là
-- "kỳ vọng" để đối chiếu. Cả hai phải được lưu cùng lần nhập để: kiểm tra lại sau mỗi lần sửa vẫn
-- cho kết quả như lúc đầu, và mở lại một lần nhập đang dở thì khôi phục đúng ngữ cảnh.
-- Additive: chỉ thêm một cột cho phép NULL.

ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS context jsonb;
