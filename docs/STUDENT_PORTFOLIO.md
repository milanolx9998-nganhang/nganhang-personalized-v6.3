## Cập nhật V5 — thay thế các mô tả giao diện V4 bên dưới

Chỉ áp dụng nganhang-personalized-v5 / cổng 3002. Bốn chỉ số chính: lượt hoàn thành, câu đã trả lời, câu khác nhau, thời gian luyện. “Câu trong các lượt luyện” tính cả câu trống/bỏ qua trong lượt hoàn thành, nằm ở Xem thêm chỉ số; không đổi dữ liệu lịch sử. Câu đã trả lời loại null, rỗng, khoảng trắng và đối tượng chỉ có đơn vị; 0 và false là câu trả lời hợp lệ.

LOW: tiêu đề “Chưa đủ dữ liệu”; số câu khác nhau và lượt hoàn thành hiển thị trước. Không gắn nhãn mạnh/yếu hay xu hướng cải thiện với LOW. MEDIUM/HIGH: <50 Cần củng cố; 50–69 Đang hình thành; 70–84 Khá thành thạo; ≥85 Thành thạo. Thành thạo ước tính mức nắm vững; độ tin cậy là lượng bằng chứng; xu hướng so sánh qua các lần đo, không phải điểm học bạ.

Tổng quan bốn cột desktop, hai cột mobile; nội dung bổ sung thu gọn. Mobile tối đa hai nội dung cần củng cố và ba hoạt động, có các phần Lịch sử/Thành thạo/Lớp để xem đầy đủ. Lịch sử 10/trang ≤680px, 20/trang còn lại; đổi độ rộng chuẩn hóa offset theo kích thước trang, đổi bộ lọc về trang đầu. <480px dùng ô chọn Phần hồ sơ.

Xem lại ưu tiên đề → bài làm → đáp án/kết quả/lời giải. Câu sai/partial/bỏ qua/chưa chắc mở sẵn; câu đúng thu gọn. Xem tất cả để mở toàn bộ. Mã phiên bản/lý do chọn chỉ trong thông tin kỹ thuật thu gọn của nhân sự. API vẫn giữ phiên bản lịch sử và không lộ đáp án Thử sức chưa nộp. Nút In mở nội dung tổng quan trong lúc in rồi khôi phục trạng thái thu gọn.

Bằng chứng V5: artifacts/v5-local-browser.json, v5-portfolio-print.pdf, v5-portfolio-low-confidence.png.

---

# Hồ sơ học tập V4 — hướng dẫn và quy tắc dữ liệu

Cập nhật 13/09/2026. Làm trên nganhang-personalized-v1; không thay bản gốc V4, không tạo thêm hệ thống chấm hoặc bảng thành thạo song song.

## Đường đi của người dùng

Giáo viên: Học sinh & Học tập → Tiến độ lớp → chọn lớp → bấm tên học sinh.
Quản trị: Học sinh & Học tập → Quản lý học sinh → Xem hồ sơ.
Học sinh: Trang học tập → Xem toàn bộ hồ sơ học tập, hoặc mục Hồ sơ học tập trong menu.

Hồ sơ có năm phần: Tổng quan, Lịch sử làm bài, Thành thạo, Bài được giao, Lớp học. Tab/bộ lọc được giữ trong URL. Trang học tập của học sinh chỉ đưa ra việc cần làm và thông tin ngắn, không nhúng toàn bộ lịch sử.

## Tổng quan và cách hiểu chỉ số

Sáu chỉ số tích lũy: lượt hoàn thành; số câu trong lượt hoàn thành; số câu khác nhau; tổng thời lượng lượt hoàn thành; ngày có lượt hoàn thành theo múi giờ Việt Nam; số bài giao đang mở đã hoàn thành/tổng đang mở. Trên điện thoại, bốn chỉ số chính hiện trước, hai chỉ số còn lại trong “Xem thêm chỉ số”.

Nội dung cần củng cố chỉ lấy mức có độ tin cậy MEDIUM/HIGH và thành thạo dưới 70% hoặc xu hướng giảm. LOW được diễn đạt “cần thêm dữ liệu”, không kết luận học sinh yếu. Mức từ 85% và đủ độ tin cậy có thể hiển thị nổi bật. Đây là quy tắc hiển thị xác định, không bật bộ gợi ý cá nhân hóa/AI. Không có điểm trung bình học sinh, điểm học bạ hay xếp hạng.

Biểu đồ tiến bộ dùng năm lượt hoàn thành gần nhất; dòng thời gian hoạt động có cả bài đang làm và lịch sử lớp. Lượt chưa nộp không tạo thành thạo. Các bài/chuyên đề/YCCĐ gắn đúng nguồn GDPT 2018 vẫn là căn cứ; ứng dụng không suy diễn nội dung chương trình hay năng lực STEM từ dữ liệu thiếu.

## Lịch sử đầy đủ

Máy chủ phân trang 20 lượt mặc định, tối đa 50; không cắt lịch sử ở 200 lượt. Bộ lọc: môn, chuyên đề thực tế trong phiên bản đã làm, nguồn, trạng thái, chế độ, bài giao, từ/đến ngày. Ngày kết thúc bao gồm toàn bộ ngày tại Việt Nam. API hỗ trợ thêm khoảng phần trăm nếu cần tích hợp.

Máy tính dùng bảng gọn; điện thoại dùng thẻ. Mỗi lượt có thời gian, môn/chuyên đề, nguồn, kết quả hoặc trạng thái, số câu, chưa chắc/bỏ qua, thời lượng, liên kết xem hoặc tiếp tục. Chuyển bộ lọc đặt lại trang đầu.

## Xem lại bài làm

Trang học sinh đã hoàn thành: /practice/review/:attemptId.
Trang nhân sự: /practice/students/:studentId/attempts/:attemptId.

Luôn chỉ đọc và nối đúng attempt_items.question_version_id; sửa câu trong kho không đổi bài cũ. Hiển thị TN, ĐS, TLN, ghép nối, tự luận; đáp án số 0 giữ nguyên; ĐS/ghép nối có kết quả từng ý. Tự luận là tự đối chiếu, không đưa vào mẫu số chấm tự động hoặc thành thạo. Có lọc sai/chưa đạt, bỏ qua, chưa chắc và M1–M4, liên kết lượt gốc khi luyện lại.

Đáp án và kết quả câu của Thử sức chưa nộp bị ẩn cho cả học sinh lẫn nhân sự. Luyện tập chỉ công bố những câu đã chốt. Nhân sự không được làm bài thay học sinh qua trang xem lại.

## Thành thạo, bài giao và lớp học

Thành thạo đọc trạng thái tích lũy hiện tại từ engine hiện có; không tạo lịch sử giả bằng cách lọc ngày. Lọc môn/chuyên đề, mở từng mức M1–M4 để xem độ tin cậy, xu hướng, số câu khác nhau và diễn biến gần đây. Tổng hợp chưa đủ bốn mức ghi rõ tạm tính.

Bài giao có giáo viên, thời điểm mở/hạn, trạng thái, số lượt đã dùng, kết quả gần nhất/tốt nhất. Bao gồm bài nhắm tới lớp hiện tại/cá nhân và bài đã từng có lượt làm. Lịch sử lớp giữ các lần chuyển trước, không xóa bài hay thành thạo.

## Phân quyền

Học sinh chỉ đọc ID của mình. Giáo viên/BGH/người xem phải có lớp hiện tại được phân công; dữ liệu bài làm, thành thạo và bài giao còn được giới hạn theo môn trong phân công lớp. Chuyển học sinh ra khỏi lớp thu hồi quyền xem hồ sơ từ lớp cũ. Quản trị xem toàn hệ thống. Đổi mật khẩu/chuyển lớp vẫn đi qua API quản trị hiện có và kiểm tra quyền ở máy chủ.

## In / lưu PDF

Bấm In / Lưu PDF trên hồ sơ: chuyển về Tổng quan, ẩn menu và thao tác, in thông tin học sinh, chỉ số, thành thạo, điểm nổi bật và hoạt động gần đây; kèm thời điểm và ngữ nghĩa tích lũy. Không in mật khẩu, token, dữ liệu nguồn nội bộ. Bản xem thử: artifacts/v4-student-portfolio-print.pdf.

## Nhập danh sách và quản trị

Excel → Phân tích và xem trước → kiểm tra từng dòng → Xác nhận nhập danh sách. Trạng thái gồm Thêm mới / Cập nhật / Không đổi / Xung đột / Lỗi. Không ghi database khi xem trước. Xác nhận kiểm tra lại quyền/dữ liệu trong giao dịch; thay đổi đồng thời buộc xem trước lại, không xác nhận hai lần. Tên/lớp được cập nhật, tài khoản có sẵn giữ mật khẩu.

Bản xem trước lưu tạm trong bộ nhớ máy chủ tối đa 15 phút; khởi động lại máy chủ cần tải lại. Phù hợp triển khai một tiến trình hiện tại, chưa phải kho tác vụ chia sẻ nhiều máy. API nhập trực tiếp cũ vẫn giữ để tương thích, giao diện mới không sử dụng đường tắt đó.

Phân quyền lớp dùng danh sách chọn tên giáo viên/người theo dõi, tên lớp/năm học và môn, không yêu cầu nhớ ID.

## Phạm vi chưa bật

Chưa thêm thao tác “Bỏ bài đang dở”; vẫn có Tiếp tục và lưu để làm tiếp, enum abandoned cũ được đọc đúng khi có. Không xóa lượt làm.
Không bật AI chấm tự luận, leaderboard, LTI hoặc gợi ý cá nhân hóa tự động. Dữ liệu local hiện chưa ánh xạ YCCĐ; chọn theo bài có dữ liệu, YCCĐ hiển thị trạng thái thiếu đúng nguồn.
