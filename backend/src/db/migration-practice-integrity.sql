CREATE OR REPLACE FUNCTION practice_prepare_question() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.bank_id IS NULL THEN
  INSERT INTO banks(name,kind,owner_id) SELECT 'Kho cá nhân · '||full_name,'personal',id FROM users WHERE id=NEW.creator_id ON CONFLICT DO NOTHING;
  SELECT id INTO NEW.bank_id FROM banks WHERE kind='personal' AND owner_id=NEW.creator_id;
  IF NEW.bank_id IS NULL THEN SELECT min(id) INTO NEW.bank_id FROM banks WHERE kind='school'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.stem_text,NEW.option_a,NEW.option_b,NEW.option_c,NEW.option_d,NEW.answer_key,NEW.explanation,NEW.image_url,NEW.cognitive_level,NEW.q_type,NEW.topic_id,NEW.subject_id,NEW.grade) IS DISTINCT FROM ROW(OLD.stem_text,OLD.option_a,OLD.option_b,OLD.option_c,OLD.option_d,OLD.answer_key,OLD.explanation,OLD.image_url,OLD.cognitive_level,OLD.q_type,OLD.topic_id,OLD.subject_id,OLD.grade) THEN
  IF NEW.normalized_content IS NOT DISTINCT FROM OLD.normalized_content THEN NEW.normalized_content=NULL; END IF;
  NEW.lifecycle='draft'; NEW.status='Mới tạo';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER practice_prepare BEFORE INSERT OR UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION practice_prepare_question();
CREATE OR REPLACE FUNCTION practice_immutable_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Question versions are immutable. Create a new version or archive the question.'; END $$;
CREATE TRIGGER practice_version_immutable BEFORE UPDATE OR DELETE ON question_versions FOR EACH ROW EXECUTE FUNCTION practice_immutable_version();
CREATE OR REPLACE FUNCTION practice_topic_node() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version integer;
BEGIN
 INSERT INTO taxonomy_versions(subject_id,name) VALUES(NEW.subject_id,'V4 chuyển tiếp') ON CONFLICT DO NOTHING;
 SELECT id INTO version FROM taxonomy_versions WHERE subject_id=NEW.subject_id AND name='V4 chuyển tiếp';
 INSERT INTO taxonomy_nodes(version_id,name,legacy_topic_id,metadata) VALUES(version,NEW.name,NEW.id,jsonb_build_object('grade',NEW.grade,'branch_id',NEW.branch_id)) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER practice_new_topic AFTER INSERT ON topics FOR EACH ROW EXECUTE FUNCTION practice_topic_node();
ALTER TABLE questions ADD CONSTRAINT question_current_version_fk FOREIGN KEY(current_version_id) REFERENCES question_versions(id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX IF NOT EXISTS bank_members_user ON bank_memberships(user_id,bank_id);
CREATE INDEX IF NOT EXISTS teacher_class_scope ON teacher_class_assignments(teacher_id,subject_id,class_id);
