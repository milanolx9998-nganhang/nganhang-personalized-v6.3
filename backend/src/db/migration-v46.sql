-- ==========================================
-- MIGRATION V4.6: History Revisions
-- ==========================================

CREATE TABLE IF NOT EXISTS question_revisions (
   id SERIAL PRIMARY KEY,
   question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
   user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
   action VARCHAR(50) DEFAULT 'update', -- 'update', 'status_change', vv...
   changes JSONB NOT NULL,
   created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_revisions_qid ON question_revisions(question_id);
