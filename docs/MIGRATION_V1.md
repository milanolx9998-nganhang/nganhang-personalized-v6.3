# Thay đổi so với V4

Thêm phân hệ tự luyện, học sinh/lớp/năm học, bài giao, version bất biến, ba tầng kho, import thống nhất, Mastery và xuất phiếu giàu nội dung. Giữ dữ liệu và ID V4, ma trận và API đọc cũ.

Khác biệt có chủ đích: import cũ chuyển sang preview job, không ghi trực tiếp vào kho; nút giao diện cũ dẫn về trung tâm nhập mới. Không còn M2 mặc định khi QTI thiếu mức. Xóa câu chuyển archive để bảo toàn FK/history. Duyệt phải theo workflow. Viewer/BGH chỉ xem theo phạm vi. Sinh đề ma trận cũ dùng kho trường; bài giao V1 có thể dùng kho cá nhân được ủy quyền.

Dependency được nâng vì audit: Express 4.22.2, Multer 2.3.0, SheetJS 0.20.3 từ CDN chính thức, Sharp 0.35.4, Vite 6.4.3, React Router 7.18.3. Giữ React 18; build và E2E cần chạy lại khi thay lockfile. Nguồn cài SheetJS: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/.

Không chỉnh sửa thư mục V4.3.3 gốc. Không ghi test users/attempt vào DB làm việc: integration tạo DB riêng theo timestamp. Không tự xóa các DB kiểm thử để còn đối chiếu; quản trị có thể dọn sau khi nghiệm thu.
