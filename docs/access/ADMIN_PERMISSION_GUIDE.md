# Hướng dẫn phân công nhân sự V6.5

Mở http://127.0.0.1:3003 bằng tài khoản quản trị hiện có → **Quản trị nhà trường → Nhân sự & phân công**.

## Tạo hoặc sửa nhân sự

Tìm theo tên, tổ, vị trí, trạng thái hoặc phạm vi. Chọn **Thêm nhân sự** để nhập tên đăng nhập, họ tên, email, mật khẩu tạm và tổ công tác chính. Tổ chính chỉ là thông tin hồ sơ. Nhân sự mới chưa được giao quyền nghiệp vụ và phải đổi mật khẩu lần đầu.

Trong hồ sơ:

1. **Vị trí & phạm vi**: chọn năm học; thêm môn, tick lớp riêng của từng môn; chọn chủ nhiệm/tổ trưởng/khối trưởng/BGH/người xem. BGH phải chọn rõ phạm vi. Mở thời hạn riêng nếu cần.
2. **Xem tác động trước khi lưu**: xem quyền/phạm vi thêm hoặc mất và cảnh báo nhiều GVCN. Lưu khi đúng; quyền cập nhật từ request kế tiếp.
3. **Quyền hiệu lực**: chọn môn/lớp/khối rồi bấm **Vì sao?**. Dấu tích trong tổng hợp chỉ thể hiện có quyền ở ít nhất một phạm vi.
4. **Hồ sơ**: sửa thông tin, khóa/mở hoặc reset mật khẩu. Reset thu hồi phiên cũ; không hiện lại mật khẩu đã lưu. Không được tự khóa phiên quản trị đang dùng hoặc khóa quản trị cuối cùng.
5. **Kho**: xem quyền suy ra và cấp/thu hồi ACL riêng theo ngày. Quyền kho không thay quyền môn/khối.
6. **Lịch sử**: người thao tác, thời điểm, lý do; dữ liệu trước/sau được giữ trên máy chủ.

## Ngoại lệ

Mặc định dùng vị trí. Chỉ mở **Nâng cao → Ngoại lệ quyền** khi cần. Chọn Cho phép bổ sung hoặc Từ chối, phạm vi, ngày hết hiệu lực và lý do. Quyền nhạy cảm cần tick xác nhận. DENY thắng ALLOW/vị trí. Để trở về preset, nhập lý do và thu hồi ngoại lệ đang tồn tại; chọn “Theo vị trí” không tự xóa các ngoại lệ cũ.

Sửa thông tin HS và đổi mật khẩu là hai quyền độc lập; nút từng học sinh do backend tính. Không cấp quyền quản trị trường chỉ vì một người là BGH hoặc tổ trưởng.

## Nhiều giáo viên và năm học mới

Trang danh sách có **Phân công giảng dạy cho nhiều nhân sự**: chọn người, năm, môn, các lớp; xem trước; xác nhận lưu. Hệ thống thêm lớp cho môn, giữ các vị trí/môn khác. Nếu một hồ sơ bị thay đổi trong lúc xem trước, cả đợt lưu bị hủy; xem trước lại.

Trong hồ sơ có **Sao chép phân công sang năm học mới**: chọn năm nguồn/đích và lớp đích cho từng lớp nguồn. Chỉ sao chép vào năm chưa có phân công, không mang ngoại lệ tạm thời. Hệ thống tạo bản nháp và tác động; kiểm tra rồi bấm **Lưu phân công**. Muốn thêm lớp/năm mới trước, dùng mục cơ cấu trường.

## Lưu ý vận hành

Không sửa database trực tiếp để “mở quyền”. Không chạy seed. Thử quyền bằng context tài nguyên thật, không chỉ nhìn menu. Mật khẩu demo chỉ dành máy local; cần cấu hình bảo mật và tài khoản riêng trước khi mở Internet.

Nguồn GDPT 2018/Outcome/YCCĐ không đổi: tiếp tục dùng nguồn chuẩn đã nhập, không tự tạo liên kết bài–YCCĐ để làm đủ phạm vi hiển thị.
