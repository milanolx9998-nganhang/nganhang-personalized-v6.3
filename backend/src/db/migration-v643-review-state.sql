CREATE OR REPLACE FUNCTION v643_question_review_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM question_review_cases WHERE question_id=NEW.id AND status IN('OPEN','IN_REVIEW') AND reason_code IN('CURRICULUM_MISMATCH','OUTCOME_RETIRED','YCCD_RETIRED'))
 OR EXISTS(SELECT 1 FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id WHERE y.id=NEW.yccd_id AND (y.status<>'ACTIVE' OR o.status<>'ACTIVE'))
 THEN NEW.metadata_status='NEEDS_REVIEW';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER v643_question_review_state BEFORE INSERT OR UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION v643_question_review_state();
