## V5 — phạm vi đọc tường minh

Đối với dữ liệu học sinh, teacher/board/viewer phải có bản ghi teacher_class_assignments cho đúng lớp hiện tại VÀ môn. Board/viewer là tài khoản chỉ đọc; admin phải cấp từng lớp–môn ở giao diện phân quyền. Không có quyền ngầm toàn trường/tổ/khối; chưa có abstraction riêng cho cơ cấu tổ chức. Nếu trường cần quyền tổ/khối tự động, phải xác nhận nghiệp vụ trước khi bổ sung.

Workspace ghép đúng cặp học sinh–môn trong từng phân công lớp; không hợp nhất môn lớp A để đọc môn đó ở lớp B. Học sinh chỉ đọc chính mình; API workspace/operations không dành cho học sinh. Operations và metrics chỉ admin. Các quy tắc kho câu hỏi cũ được giữ riêng, không thay thế quyền hồ sơ bằng quyền đọc kho.

Kiểm thử V5 bổ sung: board trước cấp quyền bị chặn/sau cấp đọc được/không sửa được; viewer không cấp quyền không thấy học sinh; teacher đúng lớp/môn được đọc, sai môn hoặc lớp bị chặn; học sinh tự xem và không xem chéo. Không có migration mới.

---

# Vai trò và phạm vi

Admin quản trị hệ thống, lớp, tài khoản, kho, hồ sơ môn. Tổ trưởng/nhóm trưởng quản lý môn và kho tổ trong quyền được giao. Teacher biên soạn kho cá nhân, dùng kho được cấp, giao bài và xem học sinh thuộc lớp–môn được phân quyền. Student chỉ xem/lưu/nộp lượt của mình và bài được giao. Viewer/BGH chỉ đọc; không tạo/sửa/duyệt/xóa/nộp thay.

Quyền kho: read < write < review; owner kho cá nhân có quyền quản lý kho đó. Kho cá nhân không tự công khai cho học sinh. Muốn đưa ra kho trường/tổ cần người có quyền review ở kho đích chuyển và duyệt. Fixed/dynamic assignment cung cấp đúng bộ câu cho đối tượng được giao, không cấp quyền đọc API ngân hàng cho học sinh.

Workflow: draft → pending_review → approved → active → archived. Sửa nội dung tạo version và trở lại draft. Archive không xóa lịch sử. Nội dung từng phiên bản và version trong attempt không sửa được.

Học sinh tạo qua roster có mật khẩu ngẫu nhiên, bắt buộc đổi lần đầu. Reset hoặc logout tăng token_version; token cũ vô hiệu. Tài khoản V4 sao chép giữ nguyên mật khẩu để không khóa người dùng; trước public deployment phải đổi toàn bộ mật khẩu mẫu cũ.

Phân quyền được kiểm tra phía backend, không dựa vào ẩn nút. URL chia sẻ vẫn yêu cầu đăng nhập và có tên trong target. Không được chuyển học sinh ngoài phạm vi vào lớp của giáo viên bằng import roster.
