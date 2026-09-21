# Kiến trúc V1

Mở rộng V4; không thay thế hệ thống ma trận và sinh đề. React 18 + Vite phục vụ giao diện; Express kiểm tra quyền, chọn câu, chấm và lưu kết quả; PostgreSQL là nguồn dữ liệu chính. Phiên bản DB và thuật toán độc lập với nhãn hiển thị KHTN.

Luồng nhập: DOCX/XLSX/ZIP → worker phân tích → mô hình chuẩn → kiểm tra theo hồ sơ môn → import job có thể sửa → xác nhận trong transaction → câu nháp và version. Không tự gán M2 khi nguồn thiếu mức.

Luồng luyện: cấu hình → số lượng theo mức → kiểm tra đủ kho → ưu tiên câu chưa gặp → attempt khóa question_version → autosave → chốt/nộp → chấm → mastery_events → mastery_states → dashboard.

Module backend ở src/services/practice: grading, selection, attempts, mastery, assignments, questions, authorization, imports/importAdapters, analytics, worksheetExport. Route cũ dùng thêm bankScope; trigger DB bảo toàn phiên bản cả khi sửa từ V4. Ma trận/sinh đề V4 dùng kho trường; bài giao V1 có thể dùng kho được phép của giáo viên.

Không bật gợi ý tự động, AI chấm tự luận, leaderboard, LTI. Cơ sở kỹ thuật đa môn; nội dung GDPT 2018, STEM, Outcome/YCCĐ phải do nhà trường cung cấp và duyệt, không suy ra từ mã kỹ thuật.
