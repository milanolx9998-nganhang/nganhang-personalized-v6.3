-- ==========================================================
-- V4.5 Migration — Item Analysis
-- Chạy: psql -f migration-v45.sql hoặc copy-paste vào query tool
-- ==========================================================

-- 1. Bảng exam_responses: lưu kết quả trả lời của học sinh
CREATE TABLE IF NOT EXISTS exam_responses (
  id SERIAL PRIMARY KEY,
  run_id INTEGER REFERENCES exam_runs(id) ON DELETE CASCADE,
  exam_code VARCHAR(20) NOT NULL,
  student_code VARCHAR(50) NOT NULL,    -- mã HS (ẩn danh)
  question_id INTEGER REFERENCES questions(id),
  selected_answer VARCHAR(20),          -- A/B/C/D hoặc Đ/S
  is_correct BOOLEAN,
  score_earned NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_responses_run ON exam_responses(run_id);
CREATE INDEX IF NOT EXISTS idx_responses_question ON exam_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_responses_student ON exam_responses(run_id, student_code);

-- 2. Thêm cột analysis vào bảng questions
ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_index NUMERIC(4,3);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS discrimination_index NUMERIC(4,3);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS point_biserial NUMERIC(4,3);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS distractor_analysis JSONB;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS times_administered INTEGER DEFAULT 0;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality_flag VARCHAR(20);

-- 3. Index cho quality_flag (filter câu cần review)
CREATE INDEX IF NOT EXISTS idx_questions_quality ON questions(quality_flag);

-- 4. Cột hình ảnh cho câu hỏi
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url TEXT;
