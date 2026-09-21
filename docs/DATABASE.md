# Dữ liệu và migration

Cập nhật 12/09/2026: migration thứ 8 `migration-student-management.sql` thêm `class_memberships.ended_at`, thay ràng buộc duy nhất cặp lớp–học sinh bằng chỉ mục duy nhất cho quan hệ đang mở. Cho phép chuyển đi/quay lại mà không mất lịch sử. Kiểm tra quyền, danh sách lớp và giao bài loại quan hệ đã kết thúc ngay lập tức. 8 migration đã kiểm tra trên DB trống và chạy lại an toàn.

Bảng V4 giữ khóa INTEGER và giá trị M1–M4. question_versions thêm UUID, mức 1–4, content JSON, metadata và FK chủ đề. Question/Assignment/Attempt dùng bất biến version để thay đổi câu không sửa kết quả cũ. UPDATE/DELETE trực tiếp version bị trigger chặn. Xóa câu từ API cũ chuyển thành archive.

Các nhóm bảng: banks/bank_memberships; taxonomy_versions/taxonomy_nodes/subject_profiles; school_years/classes/student_profiles/class_memberships/teacher_class_assignments; import_jobs/import_items/media_assets/question_sources/question_media_links; assignments/assignment_targets; attempts/attempt_items; mastery_events/mastery_states; system_settings/practice_audit.

Chạy trong backend: npm run migrate. Bộ chạy dùng advisory lock, checksum và transaction từng migration. Không sửa SQL đã áp dụng; thêm migration mới. Đã áp dụng schema V4, migration-v45, migration-v46, practice-enums, practice-v1, practice-integrity, practice-taxonomy trên nganhang_personalized_v1.

Khóa user khi tạo/nộp attempt giúp giới hạn lượt và Mastery nhất quán. Unique(attempt,topic,level) ngăn ghi lặp mastery event. Import confirm khóa job; lần xác nhận lặp trả số đã nhập mà không chèn thêm.

Không hạ migration bằng DROP bảng. Rollback vận hành bằng restore bản sao lưu vào DB mới rồi đổi cấu hình instance. Giữ DB cũ cho tới khi đối chiếu xong.
