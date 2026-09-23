-- V6.6.6.1 — hoàn tác do máy chủ cấp quyền + index cho các truy vấn đếm của bàn làm việc.
--
-- Trước đây "hoàn tác" gửi lại giá trị cũ kèm cờ allow_unlinked do client tự khai, nên bất kỳ ai gọi API
-- cũng có thể vòng qua kiểm tra Bài↔YCCĐ. Nay mỗi lệnh sửa nhanh / gán Bài lưu đúng trạng thái trước của
-- từng câu ở máy chủ; hoàn tác chỉ nhận mã thao tác, và chỉ người đã làm, trong thời hạn, khi câu chưa bị
-- sửa tiếp. Additive: chỉ thêm bảng và index.

CREATE TABLE IF NOT EXISTS question_edit_operations (
  id uuid PRIMARY KEY,
  actor_id integer NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('QUICK_EDIT', 'ASSIGN_LESSON')),
  items jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  undone_at timestamptz
);
CREATE INDEX IF NOT EXISTS question_edit_operations_actor_idx ON question_edit_operations (actor_id, created_at DESC);

-- "Tôi nhập hôm nay", "Bản nháp của tôi", "Bị trả sửa": lọc theo người soạn + thời điểm tạo.
CREATE INDEX IF NOT EXISTS questions_creator_created_idx ON questions (creator_id, created_at);
-- Lọc theo lần nhập (import_job_id) dùng EXISTS trên import_items.
CREATE INDEX IF NOT EXISTS import_items_job_result_idx ON import_items (job_id, result_question_id) WHERE result_question_id IS NOT NULL;
