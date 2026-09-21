# Kiểm toán phạm vi nội dung V6.4.3 — 15/09/2026

Thực thi trực tiếp tại nganhang-personalized-v6.3; không nhân bản, không seed lại dữ liệu.
Nguồn yêu cầu: DELTA_MEGA_PROMPT_V6_4_3_FULL_SCOPE_STUDENT_FLAG_VERSION_REVIEW.md.

## Hiện trạng đã đọc từ mã nguồn

| Thành phần | Quyết định | Bằng chứng và thay đổi cần thiết |
| --- | --- | --- |
| curriculum_outcomes / curriculum_yccds | KEEP + ADAPT | Master V6.3 có nguồn, trạng thái; bổ sung vòng đời, alias, tác động trước sửa nghĩa |
| topics | ADAPT | Chưa có quan hệ master; cần lưu trữ mềm, không xóa dữ liệu lịch sử |
| topic_yccd_map | ADD | Nhiều–nhiều, xác thực môn/khối/phân môn; không suy số thứ tự |
| contentScope.js / attempts.config | ADAPT | Hiện là topic hoặc yccd độc quyền; giữ adapter đọc cũ, ghi mới dùng các mệnh đề OR/AND |
| ContentPicker | ADAPT | Bài trước, chuẩn tinh chỉnh từng bài, chuẩn trực tiếp nâng cao |
| questions / smartMetadata | ADAPT | Gợi ý hiện tìm cả môn/khối; phải giới hạn mapping khi có bài |
| matrixBalancer / allocateExact | KEEP | Cân bằng điểm và ghép tập câu chính xác; không nới mức/YCCĐ |
| matrix_yccd_scope / exam snapshots | KEEP + ADAPT | Giữ snapshot, bổ sung scope V2 và phát hiện mapping đổi |
| generic taxonomy outcome/yccd | DEPRECATE | Chỉ đọc dữ liệu chuyển tiếp; không tạo master thứ hai |
| attempt_items | ADD | Cờ cá nhân độc lập uncertain, không ảnh hưởng điểm/Mastery |
| question_versions | ADAPT sau nền tảng | Trigger hiện tạo version cho mọi thay đổi và cấm mọi UPDATE; cần tách bản nháp với bản duyệt/đã dùng |

## Bảo toàn

- Không tự kích hoạt mapping từ câu hỏi cũ; chỉ tạo ứng viên có bằng chứng.
- Không sửa config bài làm/giao bài lịch sử.
- Quyền truy cập kiểm tra trước dữ liệu phạm vi.
- Không đổi điểm, đáp án hay nhãn curriculum lịch sử từ nhãn hiện tại.
- Các bộ kiểm thử V6.3 là mốc hồi quy; fixture mới dùng dữ liệu thử có nhãn TEST.

## Mốc trước sửa

- Unit: 8 kiểm thử ma trận + 48 kiểm thử practice đạt; build frontend đạt.
- Integration nền: 48/48 đạt; log tại artifacts/v643-baseline-integration.log.

## Theo dõi thực thi

- [x] C0 đọc prompt, schema, luồng và kiểm toán.
- [x] C1–C4 mapping, scope V2, resolver, validation/gợi ý.
- [x] C5–C8 ngân hàng, nhập, luyện/giao bài, ma trận.
- [x] C9–C12 quản trị curriculum, tác động, analytics, legacy.
- [x] Picker học sinh và AttemptFlag.
- [x] R0–R9 phân loại sửa đổi, version/review, giao diện và hồi quy.
- [x] E2E, ảnh giao diện, báo cáo nghiệm thu.
## Kết quả sau triển khai

Xem docs/V6_4_3_ACCEPTANCE.md và docs/V6_4_3_HANDOFF.md. Các mục đánh dấu là chức năng P0/P1 và hồi quy kỹ thuật; không có nghĩa dữ liệu mapping chuyên môn đã tự được công bố.
