ALTER TABLE attempt_items ADD COLUMN is_flagged boolean NOT NULL DEFAULT false;
CREATE INDEX attempt_flagged ON attempt_items(attempt_id,sequence) WHERE is_flagged;
