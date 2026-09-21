-- Giữ nguyên nhận dạng/snapshot của câu đã đưa vào lượt làm. Cờ cá nhân vẫn được thay đổi.
CREATE OR REPLACE FUNCTION v643_attempt_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.attempt_id,NEW.question_id,NEW.question_version_id,NEW.sequence,NEW.curriculum_snapshot) IS DISTINCT FROM ROW(OLD.attempt_id,OLD.question_id,OLD.question_version_id,OLD.sequence,OLD.curriculum_snapshot) THEN RAISE EXCEPTION 'Attempt item identity and curriculum snapshot are immutable';END IF;
 IF EXISTS(SELECT 1 FROM attempts WHERE id=OLD.attempt_id AND status='completed') AND (to_jsonb(NEW)-'is_flagged') IS DISTINCT FROM (to_jsonb(OLD)-'is_flagged') THEN RAISE EXCEPTION 'Completed responses and scores are immutable';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER v643_attempt_item_guard BEFORE UPDATE ON attempt_items FOR EACH ROW EXECUTE FUNCTION v643_attempt_item_guard();
CREATE OR REPLACE FUNCTION v643_question_pointer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.active_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM question_versions WHERE id=NEW.active_version_id AND question_id=NEW.id AND review_status IN('APPROVED','SUPERSEDED')) THEN RAISE EXCEPTION 'Active pointer requires an approved version of this question';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER v643_question_pointer_guard BEFORE UPDATE OF active_version_id ON questions FOR EACH ROW EXECUTE FUNCTION v643_question_pointer_guard();
