ALTER TABLE assignments ADD COLUMN answer_release_policy text NOT NULL DEFAULT 'AFTER_SUBMIT'
 CHECK(answer_release_policy IN('AFTER_SUBMIT','AFTER_DEADLINE','MANUAL_RELEASE','NEVER'));
ALTER TABLE assignments ADD COLUMN answers_released_at timestamptz;
ALTER TABLE assignments ADD COLUMN answers_released_by integer REFERENCES users;
