# Quy tắc tự luyện

## Tick nội dung theo bài hoặc YCCĐ

Tại `/practice/new`, chọn môn và khối, sau đó chọn **Theo bài / chuyên đề** hoặc **Theo YCCĐ**. Tick nhiều mục bằng chuột, bàn phím hoặc chạm trên điện thoại; không cần Ctrl. Có tìm kiếm không dấu, số mục đã chọn, chọn tất cả đang hiện và bỏ chọn tất cả (tối đa 100 mục). Tìm kiếm giữ các mục đã tick; đổi môn/khối/cách chọn xóa lựa chọn cũ. Sau khi đổi nội dung phải kiểm tra số câu lại trước khi tạo bài.

Theo bài: chỉ lấy câu trong các bài đã tick. Theo YCCĐ: chỉ lấy câu ánh xạ đúng các YCCĐ đã tick, không tự mở rộng ra cả bài khi thiếu câu. API `/api/practice/content-options?subject_id=...&grade=...` chỉ trả nhãn, mã chọn và số câu Active hợp lệ thuộc kho được phép; không trả đáp án. Cấu hình mới có `selection_mode: topic|yccd` và `yccd_keys`; cấu hình cũ có `topic_ids` vẫn hoạt động.

YCCĐ dùng nút chương trình loại `yccd` đã gắn vào phiên bản câu hỏi, hoặc mã `yccd` trong nội dung nhập. Mã nhập được phân biệt theo bài, phân môn và Outcome; không ghép hai mã giống nhau ở bài khác. Nút chương trình giữ ID riêng theo phiên bản. Mã chưa có diễn giải chỉ hiển thị mã và ngữ cảnh, không tự sinh nội dung YCCĐ.

Kiểm tra dữ liệu local ngày 12/09/2026: 84 câu hiện hành đều gắn chuyên đề chuyển tiếp, chưa có ánh xạ YCCĐ. Vì vậy chọn theo bài dùng ngay; tab YCCĐ báo chưa có câu được ánh xạ cho tới khi giáo viên gắn dữ liệu đúng nguồn. Không tự gán 84 câu sang YCCĐ và không đưa dữ liệu kiểm thử vào kho làm việc.

Học sinh chọn môn, khối, một hoặc nhiều chuyên đề, 10–40 câu (mặc định 20), dạng câu và tỉ lệ bốn mức. Phân bổ dùng phần dư lớn nhất, tổng luôn bằng số câu. Không đủ mức nào thì trả thiếu cụ thể; không tự thay đổi mức, chủ đề hoặc số câu. Cùng một question không xuất hiện hai lần trong một attempt.

Chọn câu: chưa gặp trước, sau đó lần gặp cũ nhất, tie-break theo seed. Chỉ câu Active, hợp lệ và trong kho được phép. Bài giao dynamic sử dụng quyền kho của người giao nhưng lịch sử gặp câu của học sinh. Fixed giữ cùng UUID version cho mọi người được giao.

TN: 1 hoặc 0. ĐS: số ý đúng/4. GN: số cặp đúng/tổng cặp. TLN: alias chính xác sau chuẩn hóa; số hỗ trợ dấu phẩy thập phân, sai số tuyệt đối/tương đối, đơn vị. Không fuzzy-match đáp án. Tự luận opt-in và không thuộc mẫu số chấm tự động/Mastery.

Practice chấm khi Chốt đáp án, lần chốt đầu không sửa. Challenge chỉ trả đáp án/lời giải khi nộp. Autosave không tạo Mastery. Câu bỏ qua và chưa chắc là hai trạng thái khác nhau; retry tạo lượt mới gồm câu sai/bỏ qua/chưa chắc, không ghi đè lượt trước. Đợi thông báo Đã lưu trước khi đóng trình duyệt khi mạng yếu.

Bài giao kiểm tra đối tượng, thời điểm mở/hết hạn và số lượt. Trống số lượt nghĩa là không giới hạn. Cho luyện lại sau hạn chỉ có hiệu lực khi giáo viên bật và vẫn chịu giới hạn lượt.

## Hồ sơ V4 và xác nhận nộp bài

Trang học tập giữ việc cần làm, tối đa ba lượt đang dở, bốn chỉ số và liên kết Hồ sơ học tập. Hồ sơ riêng tại /practice/portfolio có lịch sử đầy đủ phân trang, lọc, xem lại câu đã làm, thành thạo, bài giao và lớp học. Bộ chọn tick bài/YCCĐ và giới hạn nội dung ở trên giữ nguyên.

Nộp bài còn câu trống hoặc chưa chắc sẽ mở xác nhận: “Quay lại xem” hoặc “Vẫn nộp bài”. Tự lưu, hàng đợi lưu, chấm và cập nhật thành thạo không thay đổi. Trang xem lại riêng là chỉ đọc, giữ phiên bản câu hỏi ban đầu. Thử sức chưa nộp không lộ đáp án.

Chưa bổ sung thao tác bỏ lượt đang dở trong V4 này; các lượt đang dở được giữ để tiếp tục. Xem STUDENT_PORTFOLIO.md.
