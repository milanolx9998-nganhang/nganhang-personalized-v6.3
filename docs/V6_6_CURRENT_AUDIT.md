# Audit trước triển khai V6.6.3

Đã đọc toàn bộ Master Prompt V6.6.3 (174 mục và phụ lục thói quen). Sửa trực tiếp dự án hiện tại, không rewrite hay reseed. Baseline giao trước: V6.5.3, 184 tests; cần chạy lại sau thay đổi, không dùng số cũ làm kết quả mới.

| Thành phần | Quyết định | Bằng chứng / thay đổi cần thiết |
|---|---|---|
| curriculum_outcomes / curriculum_yccds | EXTEND | Đang có serial ID ổn định, FK và mã hiển thị. Thiếu bảng phiên bản và import staging. Giữ ID hiện hữu. |
| taxonomy_nodes / taxonomy_versions | KEEP | Phân loại câu hỏi không thay thế curriculum master. |
| topic_yccd_map / ContentScopeV2 | KEEP | Canonical map có trạng thái, scope typed và snapshot. Không suy Outcome từ số bài. |
| curriculumManagement.js | WRAP | Có impact, retire, aliases; nhánh minor đang sửa text trực tiếp. Chuẩn được version quản lý phải chuyển sang draft/revision. |
| question_versions / attempt_items.curriculum_snapshot | KEEP / EXTEND | Không đổi grading hoặc lịch sử; thêm snapshot mapping năng lực cho lần sử dụng mới, không suy ngược snapshot cũ. |
| mastery.js / mastery_events / mastery_states | KEEP | Thuật toán mastery hiện hữu vẫn độc lập, không dùng làm điểm năng lực giả. |
| portfolio.js / MasteryPortfolio / StudentPortfolio | EXTEND | Giữ các tab và scopedSubjects, thêm năng lực, knowledge map, thói quen tách biệt. |
| AccessResolver / presets / cookie / CSRF | EXTEND / KEEP | Bổ sung capability có scope, không kiểm quyền chỉ bằng nút ẩn. |
| Storage adapters / profile / clean release | KEEP | Không đưa credential ra frontend, không fork business logic cho Supabase. |
| Ubuntu online | EXTEND | Cấu hình Cloudflare/Tailscale và promotion STAGING; cần máy thực để nghiệm thu. Không có bằng chứng Home mới trong lượt này. |

Không DEPRECATE hoặc xóa bảng học tập hiện hữu. MIGRATE chỉ bằng file migration mới có checksum.

Nguồn hiện tại được người dùng chỉ định trong lượt này: G:/tai lieu  oppa/UP SHARE/outcome khtn, bốn file Outcome_YCCD_KHTN_6/7/8/9.xlsx. Nguồn này ưu tiên hơn tailieu/Downloads và tên viết tắt trong prompt. Đã đọc workbook: tiêu đề cột ở dòng 5, gồm Môn / Chủ đề / Yêu cầu cần đạt / Trang nguồn. Chưa có cột Outcome riêng. Số dòng YCCĐ không trống thực tế là 135/97/194/191; tổng ghi đầu file là 121/85/192/195. Giữ nguyên và báo chênh lệch, không sửa nguồn hoặc tự publish. Chi tiết checksum ở docs/V6_6_SOURCE_REGISTER.md.

Thứ tự: version + staging/editor; framework/mapping; projection evidence/confidence; portfolio/habits; UI/UAT/security; hạ tầng. Các phần chưa chạy thực tế phải ghi NOT_RUN, không tạo ảnh/báo cáo giả.
