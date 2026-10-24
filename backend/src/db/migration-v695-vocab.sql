-- V6.9.5 Kho từ vựng + Đấu từ vựng. Chỉ bổ sung; câu trận từ vựng lưu ảnh chụp nội dung thay cho phiên bản câu hỏi.
CREATE TABLE IF NOT EXISTS vocab_sets (
 id serial PRIMARY KEY, subject_id integer NOT NULL REFERENCES subjects,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
 kind text NOT NULL DEFAULT 'topic' CHECK (kind IN ('topic','unit','hsk')),
 level integer CHECK (level BETWEEN 1 AND 9),
 grade_min integer CHECK (grade_min BETWEEN 1 AND 12), grade_max integer CHECK (grade_max BETWEEN 1 AND 12),
 topic_id integer REFERENCES topics, source text, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden')),
 order_index integer NOT NULL DEFAULT 0, created_by integer REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (grade_min IS NULL OR grade_max IS NULL OR grade_min<=grade_max)
);
CREATE UNIQUE INDEX IF NOT EXISTS vocab_sets_name ON vocab_sets(subject_id,lower(name));
CREATE TABLE IF NOT EXISTS vocab_entries (
 id serial PRIMARY KEY, set_id integer NOT NULL REFERENCES vocab_sets ON DELETE CASCADE,
 term text NOT NULL CHECK (length(btrim(term)) BETWEEN 1 AND 120), reading text, reading_numeric text, han_viet text, pos text,
 meaning_vi text NOT NULL CHECK (length(btrim(meaning_vi)) BETWEEN 1 AND 300), example text, example_vi text, confusable_group text,
 status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','draft','retired')),
 source text, source_ref text, created_by integer REFERENCES users, updated_by integer REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vocab_entries_term ON vocab_entries(set_id,lower(term),meaning_vi);
CREATE INDEX IF NOT EXISTS vocab_entries_set ON vocab_entries(set_id,status);
CREATE TABLE IF NOT EXISTS vocab_student_stats (
 student_id integer NOT NULL REFERENCES users, entry_id integer NOT NULL REFERENCES vocab_entries ON DELETE CASCADE,
 seen integer NOT NULL DEFAULT 0, correct integer NOT NULL DEFAULT 0, last_wrong_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(student_id,entry_id)
);
-- Mỗi ván chỉ cộng thống kê một lần dù lưu kết thúc nhiều lượt.
CREATE TABLE IF NOT EXISTS vocab_stat_rooms (room_id uuid PRIMARY KEY REFERENCES battle_rooms ON DELETE CASCADE, counted_at timestamptz NOT NULL DEFAULT now());

ALTER TABLE battle_questions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'bank';
ALTER TABLE battle_questions ADD COLUMN IF NOT EXISTS vocab_entry_ids integer[];
ALTER TABLE battle_questions ADD COLUMN IF NOT EXISTS content_snapshot jsonb;
ALTER TABLE battle_questions ALTER COLUMN question_version_id DROP NOT NULL;
ALTER TABLE battle_questions ALTER COLUMN question_id DROP NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='battle_questions'::regclass AND conname='battle_questions_source') THEN
  ALTER TABLE battle_questions ADD CONSTRAINT battle_questions_source CHECK (
   (source='bank' AND question_version_id IS NOT NULL AND question_id IS NOT NULL) OR
   (source='vocab' AND content_snapshot IS NOT NULL AND vocab_entry_ids IS NOT NULL));
 END IF;
 -- Đấu từ vựng ngoài Quiz lớp được tính điểm tốc độ; các trục khác vẫn giữ mặc định.
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='battle_rooms'::regclass AND conname='battle_modes_combination_v695') THEN
  ALTER TABLE battle_rooms DROP CONSTRAINT IF EXISTS battle_modes_combination;
  ALTER TABLE battle_rooms ADD CONSTRAINT battle_modes_combination_v695 CHECK (
   (kind='class' OR (pacing='sync' AND (scoring='accuracy' OR scope->>'content'='vocab') AND time_limit='per_question' AND reveal_policy='instant' AND show_live_board)) AND
   ((time_limit='per_question' AND total_minutes IS NULL) OR
    (time_limit='total' AND pacing='self' AND total_minutes IS NOT NULL AND total_minutes BETWEEN 1 AND 90)));
 END IF;
END $$;

INSERT INTO subjects(code,name,department_id)
SELECT 'TiengTrung','Tiếng Trung',(SELECT id FROM departments WHERE code='NGOAI_NGU')
WHERE NOT EXISTS (SELECT 1 FROM subjects WHERE code='TiengTrung' OR lower(name)='tiếng trung');
