# Kiểm tra trước sửa V6.3 — 14/09/2026

Nguồn: bản sao V5; đã đối chiếu 40 bảng, nguồn không đổi, manifest tại backups/v5-baseline/manifest.json. Chỉ sửa bản nganhang-personalized-v6.3, cổng 3003, database nganhang_personalized_v63.

## KEEP / FIX / ADD / DEPRECATE

| Tệp / thành phần thực tế | Quyết định và bằng chứng trước sửa |
|---|---|
| backend/src/services/matrixBalancer.js | KEEP integer units ×100, largest remainder, khóa và điều kiện TL bội 0.25; FIX autoDistribute/redistribute nhân tỷ lệ với TYPE_WEIGHTS làm sai tỷ lệ theo điểm. balanced hiện chỉ so tổng, không so bốn mức. ADD mục tiêu/thực tế/chênh lệch, tìm phân bổ khả thi không dùng số câu sẵn có trong kho. |
| backend/test/matrixBalancer.test.js | KEEP nguyên 8 regression, thêm RED kiểm tỷ lệ 10đ = 3/3/2/2 và cấu hình bất khả thi, không đổi kỳ vọng cũ. |
| backend/src/routes/matrix-balance.js | FIX balanced phải xét tỷ lệ, schema thiếu matching, metadata YCCĐ bị loại khi parse. |
| backend/src/routes/matrix.js | FIX save không tính lại tổng; UPDATE xóa/tạo lại cells cần bảo vệ liên kết đề đã sinh. ADD Outcome/YCCĐ, sai lệch được xác nhận, lifecycle, quyền giáo viên môn tạo bản nháp. |
| frontend/src/components/MatrixTable.jsx | KEEP hiển thị theo phân môn/mức; FIX thiếu GN và chênh lệch target/actual, nhãn tổng đúng không đồng nghĩa cân tỷ lệ. |
| frontend/src/pages/Matrix.jsx | KEEP danh sách/xem/sửa hiện hữu; ADD bộ dựng chọn YCCĐ, gán từng ô, coverage chính xác, xác nhận sai lệch; DEPRECATE tạo mới bằng wizard không YCCĐ. |
| backend/src/services/examGenerator.js | KEEP chống trùng trong mã, trộn phương án, ưu tiên ít dùng, transaction; DEPRECATE topic_relaxed/branch_relaxed/subject_relaxed và append tag_extra có điểm. FIX thiếu câu báo MATRIX_CELL_SHORTAGE, snapshot version và điểm ô. |
| backend/src/routes/exams.js | FIX cả xem/Word/QTI đang JOIN questions mutable; dùng version + assigned_score. Giáo viên môn được sinh đề đúng phạm vi. |
| frontend/src/pages/Exams.jsx | FIX thông báo cần fallback, nút sinh khi thiếu, preview chưa theo option_order; tag thành ưu tiên trong ô, không tăng điểm. |
| backend/src/db/schema.sql và migrations | KEEP các migration đã áp dụng và checksum, không sửa lịch sử; ADD migration nối tiếp master, positions, matrix references, snapshot. question_versions bất biến và attempts/mastery giữ nguyên. |
| backend/src/middleware/auth.js; services/practice/authorization.js; students.js | FIX quyền học sinh đang đi qua teacher_class_assignments; ADD vị trí GVCN độc lập, không đồng nhất quyền tài khoản với quyền môn. |

## Dữ liệu chương trình

Workbook V1.1 có 97 YCCĐ/30 Outcome KHTN7 tại 02_KHTN7_REFERENCE; sheet MASTER chỉ hai dòng minh họa, không nhập đè. Giữ nguyên văn và source_row; 12 locator trống phải cảnh báo, không đoán. Chưa có master lớp/môn khác. Không tự tạo YCCĐ từ câu hỏi.

## Kiểm chứng dự kiến

RED trước sửa thuật toán; 8 regression cũ; unit V6.3; database clone riêng cho integration; build xong mới chạy E2E. Kiểm tra tổng 422, tỷ lệ khả thi/bất khả thi, exact shortage, cấm hạ mức, snapshot sau sửa câu, điểm ô, tag không tăng câu, GN, quyền GVCN/giáo viên/readonly. Không kết luận hoàn thành chỉ từ build.
