# Mastery, độ tin cậy và xu hướng

Đơn vị lưu: học sinh × chuyên đề × mức. Lượt đầu M=S; các lượt sau M=0,65×S+0,35×M trước. S là phần trăm điểm của các câu tự chấm thuộc đúng nhóm trong attempt hoàn tất. Không gộp tự luận hoặc lượt chưa nộp.

Độ tin cậy không chỉ dựa vào số lần bấm luyện. Số câu hiệu dụng = câu khác nhau + 0,25×lần lặp đủ điều kiện; mỗi câu chỉ nhận tối đa 3 lượt lặp bổ sung. MEDIUM cần ít nhất 20 câu hiệu dụng và 2 lượt; HIGH cần ít nhất 40 và 3 lượt; còn lại LOW. Điểm cao với LOW không được khẳng định đã thành thạo.

Trend so sánh Mastery đầu/cuối của cửa sổ tối đa 3 lượt, ngưỡng ±5 điểm phần trăm. Chỉ một lượt: chưa đủ dữ liệu. Tổng hợp chuyên đề có trọng số số câu hiệu dụng; chưa đủ bốn mức ghi tạm tính. Không dùng Mastery như điểm kiểm tra chính thức hoặc bằng chứng nhân quả.

mastery_events là bằng chứng nguồn bất biến theo lượt; mastery_states là bảng tổng hợp có thể tái dựng. Sau khi đổi hệ số cần chạy trong backend: npm run mastery:recalculate. Lệnh khóa lần lượt học sinh, replay sự kiện theo occurred_at,id và thay bảng tổng hợp trong transaction.
