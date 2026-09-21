-- ==========================================================
-- NGÂN HÀNG V4.3 - Schema PostgreSQL
-- Kế thừa V2 + chuẩn BGD 2025 + cấu trúc file Excel mẫu
-- ==========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ---------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'board', 'dept_leader', 'grade_leader', 'teacher');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE question_type AS ENUM ('mcq4', 'true_false', 'short', 'essay');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cognitive_level AS ENUM ('M1', 'M2', 'M3', 'M4');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE question_status AS ENUM ('Mới tạo', 'Đã rà soát', 'Đã duyệt', 'Đã sử dụng', 'Tạm ẩn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE matrix_type AS ENUM ('BGD_2025', 'TRUONG');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE matrix_status AS ENUM ('Bản nháp', 'Đã chốt', 'Lưu trữ');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------
-- TỔ CHỨC: Department > Subject > Branch > Topic
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Môn học chung (không gắn lớp): Toán, Vật Lí, KHTN...
CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,
  code VARCHAR(30) UNIQUE NOT NULL,  -- Toan, VatLi, KHTN, NguVan...
  name VARCHAR(100) NOT NULL,         -- "Toán", "Vật Lí", "KHTN"...
  is_integrated BOOLEAN DEFAULT FALSE, -- TRUE cho KHTN (có nhiều phân môn)
  department_id INTEGER REFERENCES departments(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phân môn (chỉ cho môn tích hợp như KHTN): Vật lí, Hóa học, Sinh học
CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) DEFAULT '#4f8eff',
  order_index INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_branches_subject ON branches(subject_id);

-- Chủ đề / Chương / Bài cụ thể theo lớp
CREATE TABLE IF NOT EXISTS topics (
  id SERIAL PRIMARY KEY,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
  branch_id INTEGER REFERENCES branches(id),
  grade INTEGER NOT NULL CHECK (grade BETWEEN 6 AND 12),
  chapter VARCHAR(300),           -- "Chủ đề lớn" trong file Excel
  name VARCHAR(300) NOT NULL,     -- "Chủ đề con" hoặc Tên bài
  order_index INTEGER DEFAULT 0,
  learning_goal TEXT,              -- Mục tiêu bài học
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topics_subject ON topics(subject_id, grade);
CREATE INDEX IF NOT EXISTS idx_topics_branch ON topics(branch_id);

-- ---------------------------------------------------------
-- USERS + AUTH
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(200),
  role user_role NOT NULL DEFAULT 'teacher',
  department_id INTEGER REFERENCES departments(id),
  subject_id INTEGER REFERENCES subjects(id),
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);

-- ---------------------------------------------------------
-- TAGS (linh hoạt thêm nhãn cho câu hỏi)
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  tier VARCHAR(20) DEFAULT 'custom',  -- core / academic / ops / custom
  category VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS question_tags (
  question_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, tag_id)
);

-- ---------------------------------------------------------
-- QUESTIONS - theo chuẩn file Excel mẫu (20 cột)
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  question_code VARCHAR(50) UNIQUE,  -- Tự sinh: HoaHoc-10-0001

  -- Phân loại (từ cột C-H của Excel)
  subject_id INTEGER REFERENCES subjects(id),
  branch_id INTEGER REFERENCES branches(id),
  topic_id INTEGER REFERENCES topics(id),
  grade INTEGER NOT NULL CHECK (grade BETWEEN 6 AND 12),

  -- Backward-compat: text snapshot
  main_topic VARCHAR(300),  -- "Chủ đề lớn" text
  sub_topic VARCHAR(300),   -- "Chủ đề con" text
  cognitive_level cognitive_level NOT NULL,
  q_type question_type NOT NULL,

  -- Nội dung (cột I-O của Excel)
  stem_text TEXT NOT NULL,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  answer_key TEXT,            -- MCQ:"B" | T-F:"a-Đ; b-S; c-Đ; d-S" | Short:"đá"
  explanation TEXT,

  -- Meta (cột P-T của Excel)
  score NUMERIC(5,2) DEFAULT 0.25,
  creator_name VARCHAR(200),  -- "Người biên soạn" text snapshot
  notes TEXT,                 -- "Ghi chú"

  -- Vận hành
  status question_status DEFAULT 'Mới tạo',
  is_locked BOOLEAN DEFAULT FALSE,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  family_code VARCHAR(100),    -- Cùng gốc câu (anti-repeat)
  image_url TEXT,              -- V4.5: URL hình ảnh kèm câu hỏi

  -- FK
  creator_id INTEGER REFERENCES users(id),
  reviewed_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_branch ON questions(branch_id);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_questions_grade ON questions(grade);
CREATE INDEX IF NOT EXISTS idx_questions_level ON questions(cognitive_level);
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(q_type);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_family ON questions(family_code);
CREATE INDEX IF NOT EXISTS idx_questions_creator ON questions(creator_id);
CREATE INDEX IF NOT EXISTS idx_questions_stem_trgm ON questions USING gin (stem_text gin_trgm_ops);

-- Liên kết bảng question_tags phụ thuộc questions
DO $$ BEGIN
  ALTER TABLE question_tags ADD CONSTRAINT fk_qt_question FOREIGN KEY (question_id)
    REFERENCES questions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------
-- MATRIX TEMPLATES (Ma trận đề) — V2-style
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS matrix_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(300) NOT NULL,
  subject_id INTEGER REFERENCES subjects(id),
  subject_code VARCHAR(30),  -- Snapshot
  grade INTEGER NOT NULL,

  matrix_type matrix_type DEFAULT 'BGD_2025',
  purpose VARCHAR(50) DEFAULT 'Giữa kỳ',  -- Giữa kỳ / Cuối kỳ / KTTX / HSG / Thi thử
  duration_minutes INTEGER DEFAULT 45,
  total_score NUMERIC(5,2) DEFAULT 10.0,

  -- Số câu từng phần (chuẩn BGD 2025)
  part1_count INTEGER DEFAULT 0,  -- Trắc nghiệm 4 lựa chọn
  part2_count INTEGER DEFAULT 0,  -- Đúng/Sai
  part3_count INTEGER DEFAULT 0,  -- Trả lời ngắn
  part4_count INTEGER DEFAULT 0,  -- Tự luận

  -- Tỉ trọng mức độ (M1/M2/M3/M4, tổng = 100)
  ratio_m1 INTEGER DEFAULT 30,
  ratio_m2 INTEGER DEFAULT 30,
  ratio_m3 INTEGER DEFAULT 20,
  ratio_m4 INTEGER DEFAULT 20,

  -- Phạm vi bài được ra (JSON array of topic_id)
  topic_scope JSONB,

  -- Cho KHTN: cấu hình từng phân môn
  branch_config JSONB,  -- [{branch_id, tiet, score, tn, ds, tln, tl, tl_score}]

  status matrix_status DEFAULT 'Bản nháp',
  creator_id INTEGER REFERENCES users(id),
  parent_id INTEGER REFERENCES matrix_templates(id),  -- Cloned from
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matrix_subject ON matrix_templates(subject_id);
CREATE INDEX IF NOT EXISTS idx_matrix_status ON matrix_templates(status);

-- Từng ô ma trận (cell)
CREATE TABLE IF NOT EXISTS matrix_cells (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES matrix_templates(id) ON DELETE CASCADE,
  part_name VARCHAR(50),           -- "Phần 1 - TN", "Phần 2 - ĐS"...
  q_type question_type NOT NULL,
  cognitive_level cognitive_level NOT NULL,
  branch_id INTEGER REFERENCES branches(id),
  topic_id INTEGER REFERENCES topics(id),
  main_topic VARCHAR(300),
  sub_topic VARCHAR(300),
  question_count INTEGER DEFAULT 1,
  score_per_question NUMERIC(5,2) DEFAULT 0.25,
  is_locked BOOLEAN DEFAULT FALSE,   -- GV có thể khóa ô để tái phân bổ
  order_index INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cells_template ON matrix_cells(template_id);

-- ---------------------------------------------------------
-- EXAM RUNS (Sinh đề)
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS exam_runs (
  id SERIAL PRIMARY KEY,
  matrix_id INTEGER REFERENCES matrix_templates(id),
  exam_name VARCHAR(300) NOT NULL,
  exam_code_count INTEGER DEFAULT 1,
  shuffle_options BOOLEAN DEFAULT TRUE,
  avoid_cross_code_overlap BOOLEAN DEFAULT TRUE,
  anti_repeat_days INTEGER DEFAULT 180,
  warnings JSONB,
  status VARCHAR(30) DEFAULT 'draft',  -- draft / published / archived
  creator_id INTEGER REFERENCES users(id),
  published_by INTEGER REFERENCES users(id),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runs_matrix ON exam_runs(matrix_id);
CREATE INDEX IF NOT EXISTS idx_runs_creator ON exam_runs(creator_id);

-- Từng câu trong từng mã đề
CREATE TABLE IF NOT EXISTS exam_items (
  id SERIAL PRIMARY KEY,
  run_id INTEGER REFERENCES exam_runs(id) ON DELETE CASCADE,
  exam_code VARCHAR(20) NOT NULL,   -- 101, 102...
  question_id INTEGER REFERENCES questions(id),
  part_name VARCHAR(50),
  order_index INTEGER NOT NULL,
  option_order JSONB,                -- Shuffle order của A/B/C/D
  fallback_stage VARCHAR(30)          -- exact / topic_relaxed / subject_relaxed
);

CREATE INDEX IF NOT EXISTS idx_items_run ON exam_items(run_id);
CREATE INDEX IF NOT EXISTS idx_items_code ON exam_items(run_id, exam_code);
CREATE INDEX IF NOT EXISTS idx_items_question ON exam_items(question_id);

-- ---------------------------------------------------------
-- AUDIT LOG
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- ---------------------------------------------------------
-- V4.5 — ITEM ANALYSIS (Phân tích chất lượng câu hỏi)
-- ---------------------------------------------------------

-- Kết quả trả lời của HS (nhập từ OMR/Excel)
CREATE TABLE IF NOT EXISTS exam_responses (
  id SERIAL PRIMARY KEY,
  run_id INTEGER REFERENCES exam_runs(id) ON DELETE CASCADE,
  exam_code VARCHAR(20) NOT NULL,
  student_code VARCHAR(50) NOT NULL,
  question_id INTEGER REFERENCES questions(id),
  selected_answer VARCHAR(20),
  is_correct BOOLEAN,
  score_earned NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_responses_run ON exam_responses(run_id);
CREATE INDEX IF NOT EXISTS idx_responses_question ON exam_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_responses_student ON exam_responses(run_id, student_code);

-- Cột phân tích trên bảng questions (cập nhật sau khi chạy analyze)
ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty_index NUMERIC(4,3);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS discrimination_index NUMERIC(4,3);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS point_biserial NUMERIC(4,3);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS distractor_analysis JSONB;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS times_administered INTEGER DEFAULT 0;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality_flag VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_questions_quality ON questions(quality_flag);

-- ---------------------------------------------------------
-- TRIGGERS
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_questions_updated ON questions;
CREATE TRIGGER trg_questions_updated BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_matrix_updated ON matrix_templates;
CREATE TRIGGER trg_matrix_updated BEFORE UPDATE ON matrix_templates FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

