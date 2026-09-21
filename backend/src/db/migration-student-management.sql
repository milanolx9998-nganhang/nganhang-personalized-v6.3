ALTER TABLE class_memberships ADD COLUMN ended_at timestamptz;
ALTER TABLE class_memberships DROP CONSTRAINT class_memberships_class_id_student_id_key;
CREATE UNIQUE INDEX class_memberships_open_pair ON class_memberships(class_id,student_id)
WHERE ended_at IS NULL AND valid_to IS NULL;
CREATE INDEX class_memberships_student_current ON class_memberships(student_id,ended_at);
