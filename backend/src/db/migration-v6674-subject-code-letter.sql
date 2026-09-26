-- V6.6.7.4: chữ viết tắt của môn trong mã câu hỏi — mọi môn viết mã 6 phần như KHTN:
--   KHTN:  Câu L. 2. 1. NB. 1. TN   (L/H/S là phân môn, lấy từ bảng branches — KHTN để trống cột này)
--   Toán:  Câu T. 2. 1. NB. 1. TN   (T là chữ của môn)
-- Chữ này cũng là "phân môn" của Chủ đề/YCCĐ khi nạp file mẫu chương trình (nhãn T.2.1). Chỉ thêm cột + giá trị mặc định
-- cho các môn hiện có (không ghi đè chữ đã đặt). 1–3 chữ in hoa, cho phép Đ.
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS code_letter text;
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_code_letter_format;
ALTER TABLE subjects ADD CONSTRAINT subjects_code_letter_format CHECK (code_letter IS NULL OR code_letter ~ '^[A-ZĐ]{1,3}$');
UPDATE subjects s SET code_letter = d.letter
FROM (VALUES ('Toan','T'),('NguVan','V'),('TiengAnh','A'),('VatLi','L'),('HoaHoc','H'),('SinhHoc','S'),
             ('LichSu','LS'),('DiaLi','ĐL'),('GDCD','GD'),('GDKTPL','KT'),('TinHoc','TIN'),('CongNghe','CN'),('IELTS','IE')) AS d(code, letter)
WHERE s.code = d.code AND s.code_letter IS NULL
  AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.subject_id = s.id);
