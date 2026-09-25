-- V6.6.7.2: kho trường mặc định mang tên lúc chuyển từ V4 ("Kho trường chuyển tiếp V4") gây khó hiểu → "Kho trường".
-- Chỉ đổi khi vẫn giữ đúng tên gốc, không ghi đè tên quản trị đã tự đặt. Không đổi id, quyền hay câu hỏi của kho.
UPDATE banks SET name='Kho trường' WHERE kind='school' AND name='Kho trường chuyển tiếp V4';
