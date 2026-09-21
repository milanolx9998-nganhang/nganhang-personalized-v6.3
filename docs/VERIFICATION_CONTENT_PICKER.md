# Kiểm chứng tick chọn nội dung — 12/09/2026

Đã thay select-multiple bằng checkbox và bổ sung chọn theo YCCĐ ở cấu hình tự luyện, dùng chung cho cấu hình bài giao. Thiết kế UI/UX ưu tiên thao tác chạm, nhãn rõ ràng, trạng thái đã chọn và tìm kiếm; không đổi cơ chế chấm điểm.

## Kết quả

- `npm test`: 8 kiểm thử ma trận cũ + 30 kiểm thử đơn vị đạt.
- `npm run test:integration`: 28/28 đạt; dữ liệu tạo ở database kiểm thử riêng.
- `npm run build`: đạt; cảnh báo bundle lớn hơn 500 kB vẫn còn, không phải lỗi build.
- Tổng: 66 kiểm thử đạt. Không thay schema/migration hoặc dữ liệu nội dung của bản sao; không sửa bản gốc.

Kiểm thử mới bao gồm: tick nhiều bài; tìm kiếm vẫn giữ lựa chọn; chọn tất cả/bỏ chọn; đổi khối xóa lựa chọn; chọn nhiều YCCĐ; tạo bài chỉ chứa YCCĐ đã chọn; kiểm tra theo bài không lẫn bài khác; YCCĐ kho riêng không được liệt kê; sai mã trả thiếu câu, không lấy thay thế; cấu hình YCCĐ trống bị chặn; không tự suy YCCĐ từ chuyên đề; phân biệt cùng mã ở bài/Outcome/phân môn khác; nhãn YCCĐ không lộ đáp án; thao tác trình duyệt trên điện thoại không tràn ngang.

Log: `artifacts/content-picker-unit.log`, `artifacts/content-picker-integration.log`, `artifacts/content-picker-build.log`. Ảnh giao diện kiểm thử: `artifacts/content-picker-desktop.png`, `artifacts/content-picker-yccd-mobile.png`. Các nhãn mẫu kỹ thuật trong ảnh chỉ thuộc DB kiểm thử.

## Giới hạn dữ liệu thực

Kho local 84 câu chưa ánh xạ YCCĐ. Bộ lọc YCCĐ đã hoạt động và được thử bằng dữ liệu độc lập; để học sinh dùng tab này với nội dung thật, giáo viên cần gắn YCCĐ có nguồn cho câu hỏi. Tab Theo bài / chuyên đề dùng ngay với dữ liệu hiện có. Xem `docs/SELF_PRACTICE.md`.
