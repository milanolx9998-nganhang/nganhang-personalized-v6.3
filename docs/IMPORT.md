# Nhập câu hỏi

Mở Nhập Word · Excel · QTI. Có thể tải mẫu từ thư mục templates. Chọn file, chỉ gán metadata chung khi thực sự muốn áp dụng cho toàn bộ file. Preview hiển thị lỗi/cảnh báo, nội dung, ảnh, bảng và công thức; sửa từng câu hoặc áp dụng hàng loạt; chọn câu hợp lệ rồi xác nhận. Kết quả ở kho cá nhân dưới trạng thái nháp.

DOCX: tiêu đề Câu 1. hoặc mã Câu L/H/S. Outcome. YCCĐ. NB/TH/VD/VDC. Số. TN/ĐS/TLN/GN/TL. TN dùng A.–D.; ĐS dùng a)–d); Đáp án: và Lời giải:. GN dùng bảng hai cột; đáp án A-1; B-2. Paragraph, ảnh trong lựa chọn, bảng và OMML cơ bản được giữ. OMML phức tạp có cảnh báo cần người nhập đối chiếu bản gốc. Metadata thiếu không bị tự gán M2.

Excel: giữ mẫu Nhap_lieu 20 cột V4, nhận dạng dòng header và vị trí nguồn. Mẫu mới dùng cột chuẩn; options/statements/left/right/answer là JSON hoặc sửa trên Preview. questions.xlsx và thư mục media đặt trong cùng ZIP. Cột stem_image/option_a_image/... chứa đường dẫn ảnh. Tên ảnh không rõ hoặc trùng được cảnh báo. Ảnh nhúng Excel không có vị trí rõ cần chuyển sang ZIP ảnh để kiểm soát.

QTI: đọc các dạng Canvas/QTI 1.2 tương thích. Mức thiếu phải gán trước xác nhận. Xuất ĐS thành bốn item đúng/sai chuẩn; metadata mở rộng cho phép ứng dụng nhập lại thành một câu ĐS. Moodle phải dùng gói QTI, không phải Moodle XML riêng. Cần thử import trên LMS thật trước phát hành chính thức.

Chỉ nhận DOCX/XLSX/ZIP, tối đa 20MB. ZIP giới hạn mục, dung lượng giải nén, tỉ lệ nén và đường dẫn; không giải nén tùy ý vào filesystem. MIME ảnh PNG/JPEG/GIF/WebP; không SVG. Worker giới hạn 256MB/60s. Nguồn thô nằm private-imports, không được phục vụ công khai.

Câu trùng là gợi ý: so sánh nội dung, phương án, đáp án, ảnh, taxonomy và mã nguồn; không tự hợp nhất. Người nhập quyết định bỏ qua/nhập mới/tạo version/thay thế hợp lệ. Mọi quyết định được ghi audit.

Tái tạo mẫu: node scripts/generate-templates.mjs. Mẫu cấu trúc không phải nguồn câu hỏi GDPT 2018 đã được chứng thực.
