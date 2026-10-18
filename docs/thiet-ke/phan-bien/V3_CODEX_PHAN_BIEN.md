## 1. Đánh giá các điểm còn mở

**“Đạt” là đủ ở mức đặc tả để triển khai, chưa phải xác nhận mã đã chạy đúng.** Áp dụng quy tắc §23: phụ lục thắng khi khác các mục trước.

| Điểm | Kết luận | Căn cứ bản 1.2 |
|---|---|---|
| C3 — Khóa, biên nhận, gửi lại | **Đạt** | §23.1–23.2 |
| C4 — Thời gian, pause, chuyển pha | **Chưa đủ** | §9.3, §23.3; xem phần 2 |
| C6 — Chặn, rời, quyền đọc | **Đạt** | §23.4 |
| C7 — Giới hạn tài nguyên | **Đạt** | §23.7, §23.9 |
| Q1 — Luật điểm | **Đạt** | §9.2, §23.5 |
| Q2 — Thành thạo, huy hiệu | **Đạt** | §9.4, §23.6 |
| Q5 — SSE | **Đạt** | §23.7 |
| Q6 — Snapshot, luyện lại | **Đạt** | §14, §23.5–23.6 |
| Q8 — Danh tính, chứng cứ | **Đạt** | §11.2, §11.5–11.6 |
| Q9 — Tải và nghiệm thu | **Đạt** | §23.9 |
| Q10 — Cổng smoke trước deploy | **Đạt** | §23.10 — cổng thủ tục, chưa tự động hóa |
| M1 — Phân hạng sai với điểm từng phần | **Đạt** | §23.5: bằng điểm đồng hạng |
| M2 — Công bố câu chưa hỏi | **Đạt** | §23.3, §23.5: giới hạn bởi `asked_count` |
| M3 — Thời hạn, nguồn chứng cứ | **Đạt** | §11.5–11.6: bộ đệm 50 sự kiện; sự kiện 90 ngày, báo cáo một năm |
| M4 — Tích hợp `battle_retry` | **Đạt** | §23.6: nguồn kế thừa, thống kê, chỉ mục và nộp bài |
| M5 — Cờ phát hành chưa đủ | **Đạt** | §23.8 |

## 2. Chỉ còn một nhóm vấn đề chặn: hoàn tất hợp đồng pause/resume và lệnh đóng câu

**Căn cứ:** §9.3, dòng 192 cho phép `pause/resume` ở cả `question` và `reveal`; §23.3, dòng 559 lại luôn tính `remaining = deadline − now` và khôi phục deadline trả lời.

**Lỗi cụ thể:** Khi giáo viên tạm dừng ở pha lời giải, deadline trả lời đã qua, nên `remaining` có thể âm. Phụ lục không xác định resume quay về `question` hay `reveal`, cũng chưa chỉ rõ khôi phục `phase` từ `paused`. Đây là quyết định ảnh hưởng việc nhận đáp án và công bố lời giải, không nên để AI tự chọn.

**Bổ sung tối thiểu đề nghị:**

1. **Chỉ cho pause ở pha `question`, trước deadline.** Phòng lớp ở `reveal` vốn không tự chuyển nên không cần pause; vô hiệu hóa nút này tại đó.
2. **Resume đặt lại `phase=question`**, khôi phục thời gian còn lại không âm và tạo deadline/`close_at` mới.
3. Mỗi lệnh hẹn giờ mang **chỉ số câu và phiên bản lịch hẹn**; lệnh cũ sau pause/resume hoặc đóng sớm phải bỏ qua. Hủy timer không đủ nếu callback đã đưa `close` vào hàng lệnh. Lệnh đóng câu bắt buộc cũng không được bị loại bởi trần 200 lệnh dành cho yêu cầu bên ngoài.

Chỉ cần ghi rõ ba quy tắc này và thêm ca kiểm thử tương ứng; không cần thiết kế lại máy trạng thái.

**Các điểm nhỏ, không chặn vì §23 đã quy định ưu tiên:**

- §1 vẫn nói tốc độ phân định thứ hạng; sửa cho khớp §23.5.
- §9.1 và bảng §9.3 vẫn nói chờ “hàng lệnh rỗng”; thay bằng cơ chế `close` của §23.3.
- §13.5 còn số SSE/bộ đệm cũ; đồng bộ với §23.9.
- §15.2 còn “lời giải toàn ván”; đổi thành các câu đã phát theo §23.5.
- §14 nên cập nhật `client_id`, `asked_count` và điều kiện chỉ mục luyện lại đúng như phụ lục.

Không tính ba lựa chọn phát hành, xếp hạng và `battle_retry` là điểm chặn; mặc định hiện tại đủ rõ để thực hiện.

## 3. Kết luận

**CHƯA ĐỦ — chỉ cần hoàn tất hợp đồng pause/resume và vô hiệu hóa lệnh đóng câu cũ theo ba quy tắc trên là đủ giao lập trình viên AI triển khai.**