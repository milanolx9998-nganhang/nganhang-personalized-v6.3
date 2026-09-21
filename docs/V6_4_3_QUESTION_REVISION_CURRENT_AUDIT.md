# Kiểm toán sửa đổi / phiên bản trước R1 — 15/09/2026

## Đã xác nhận từ nguồn hiện tại

- practice_snapshot_question (migration-v63.sql) tạo mới khi thay stem, đáp án, giải thích, ảnh, normalized_content **hoặc** subject/grade/topic/branch/outcome/yccd/level/type.
- practice_version_immutable (migration-practice-integrity.sql) cấm mọi UPDATE/DELETE, kể cả nháp chưa dùng.
- questions.current_version_id đang vừa là bản đang sửa vừa là bản dùng chọn câu.
- Workflow draft → pending_review → approved → active nằm trên câu logic; chưa có trạng thái duyệt trên version, chưa có active_version_id riêng.
- exam_items và attempt_items đã tham chiếu question_version_id; assignments.fixed_versions giữ phiên bản cố định.
- Không có review case, phân loại impact deterministic, yêu cầu người duyệt khác hay diff nhóm nghĩa.
- Giao diện lịch sử chỉ hiện nội dung stem. Chất lượng cộng tất cả phiên bản.

## KEEP / ADAPT / ADD

| Quyết định | Nội dung |
| --- | --- |
| KEEP | UUID question_versions, liên kết exam/attempt/fixed assignment, nội dung lịch sử, thuật toán chấm và Mastery |
| ADAPT | Nháp chưa duyệt/chưa dùng được sửa tại chỗ; version pending/approved/used không sửa nội dung |
| ADAPT | current_version_id là bản làm việc; active_version_id là bản đang được dùng |
| ADD | Bộ phân loại NON_SEMANTIC / CURRICULUM_METADATA / ASSESSMENT_CONTENT, metadata revision và audit |
| ADD | Review case có bằng chứng, dedup mở, phân công, yêu cầu sửa, từ chối, giải quyết có lý do |
| ADD | Diff theo nhóm nội dung/đáp án/chấm điểm/media/metadata, lịch sử và khôi phục thành nháp mới |

## Giới hạn chuyển tiếp

Trạng thái duyệt từng version cũ chưa từng được thu thập. Chỉ đánh dấu APPROVED khi là phiên bản đang active/approved hoặc có bằng chứng đã sử dụng; bản cũ còn lại không suy là đã được duyệt bởi ai. Không backfill nhãn lịch sử từ master hiện tại.
