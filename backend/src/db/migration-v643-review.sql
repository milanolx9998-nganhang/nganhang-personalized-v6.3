ALTER TABLE question_versions ADD COLUMN review_status text NOT NULL DEFAULT 'DRAFT' CHECK(review_status IN('DRAFT','PENDING_REVIEW','APPROVED','REJECTED','SUPERSEDED'));
ALTER TABLE question_versions ADD COLUMN ever_approved boolean NOT NULL DEFAULT false;
ALTER TABLE question_versions ADD COLUMN based_on_version_id uuid REFERENCES question_versions;
ALTER TABLE question_versions ADD COLUMN restored_from_version_id uuid REFERENCES question_versions;
ALTER TABLE question_versions ADD COLUMN reviewed_by integer REFERENCES users;
ALTER TABLE question_versions ADD COLUMN reviewed_at timestamptz;
ALTER TABLE questions ADD COLUMN active_version_id uuid REFERENCES question_versions;
ALTER TABLE questions ADD COLUMN quarantined boolean NOT NULL DEFAULT false;
CREATE TABLE question_metadata_revisions(id bigserial PRIMARY KEY,question_id integer NOT NULL REFERENCES questions,before_metadata jsonb NOT NULL,after_metadata jsonb NOT NULL,reason text NOT NULL,created_by integer REFERENCES users,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE question_review_cases(
 id bigserial PRIMARY KEY,question_id integer NOT NULL REFERENCES questions,question_version_id uuid REFERENCES question_versions,
 source text NOT NULL DEFAULT 'MANUAL',source_ref text,reason_code text NOT NULL,severity text NOT NULL DEFAULT 'P2' CHECK(severity IN('P0','P1','P2')),
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','IN_REVIEW','RESOLVED','DISMISSED')),opened_by integer REFERENCES users,opened_at timestamptz NOT NULL DEFAULT now(),
 assigned_to integer REFERENCES users,resolved_by integer REFERENCES users,resolved_at timestamptz,resolution_type text,resolution_note text,evidence_snapshot jsonb NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX question_review_open ON question_review_cases(question_id,reason_code) WHERE status IN('OPEN','IN_REVIEW');
CREATE INDEX question_review_queue ON question_review_cases(status,severity,opened_at);
CREATE OR REPLACE FUNCTION v643_version_used(vid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM attempt_items WHERE question_version_id=vid)
 OR EXISTS(SELECT 1 FROM exam_items WHERE question_version_id=vid)
 OR EXISTS(SELECT 1 FROM assignments WHERE vid=ANY(fixed_versions))
$$;
-- Migration-only update; restore the immutable guard immediately within this transaction.
DROP TRIGGER practice_version_immutable ON question_versions;
UPDATE question_versions v SET review_status=CASE WHEN EXISTS(SELECT 1 FROM questions q WHERE q.current_version_id=v.id AND q.lifecycle IN('approved','active')) OR v643_version_used(v.id) THEN 'APPROVED' WHEN EXISTS(SELECT 1 FROM questions q WHERE q.current_version_id=v.id) THEN 'DRAFT' ELSE 'SUPERSEDED' END;
UPDATE question_versions SET ever_approved=true WHERE review_status='APPROVED';
UPDATE questions SET active_version_id=current_version_id WHERE lifecycle IN('approved','active');
CREATE OR REPLACE FUNCTION practice_immutable_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Question versions cannot be deleted';END IF;
 IF ROW(NEW.id,NEW.question_id,NEW.version_number) IS DISTINCT FROM ROW(OLD.id,OLD.question_id,OLD.version_number) THEN RAISE EXCEPTION 'Version identity is immutable';END IF;
 IF OLD.ever_approved AND NOT NEW.ever_approved THEN RAISE EXCEPTION 'Approval history is immutable';END IF;
 IF NEW.review_status='DRAFT' AND (OLD.ever_approved OR v643_version_used(OLD.id) OR OLD.review_status='REJECTED') THEN RAISE EXCEPTION 'Approved, used or rejected versions cannot become editable drafts';END IF;
 IF (OLD.review_status<>'DRAFT' OR OLD.ever_approved OR v643_version_used(OLD.id))
 AND (to_jsonb(NEW)-ARRAY['review_status','ever_approved','reviewed_by','reviewed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['review_status','ever_approved','reviewed_by','reviewed_at']) THEN RAISE EXCEPTION 'Question version content is immutable after review or use';END IF;
 IF NEW.review_status='APPROVED' THEN NEW.ever_approved=true;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER practice_version_immutable BEFORE UPDATE OR DELETE ON question_versions FOR EACH ROW EXECUTE FUNCTION practice_immutable_version();
CREATE OR REPLACE FUNCTION practice_snapshot_question() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v uuid;n integer;node integer;payload jsonb;draft question_versions;actor integer;
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.stem_text,NEW.option_a,NEW.option_b,NEW.option_c,NEW.option_d,NEW.answer_key,NEW.explanation,NEW.image_url,NEW.cognitive_level,NEW.q_type,NEW.topic_id,NEW.subject_id,NEW.grade,NEW.normalized_content,NEW.question_code,NEW.outcome_id,NEW.yccd_id,NEW.branch_id) IS NOT DISTINCT FROM ROW(OLD.stem_text,OLD.option_a,OLD.option_b,OLD.option_c,OLD.option_d,OLD.answer_key,OLD.explanation,OLD.image_url,OLD.cognitive_level,OLD.q_type,OLD.topic_id,OLD.subject_id,OLD.grade,OLD.normalized_content,OLD.question_code,OLD.outcome_id,OLD.yccd_id,OLD.branch_id) AND NEW.current_version_id IS NOT NULL AND current_setting('app.force_version',true) IS DISTINCT FROM 'true' THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND current_setting('app.change_kind',true) IN('NON_SEMANTIC','CURRICULUM_METADATA') AND current_setting('app.force_version',true) IS DISTINCT FROM 'true' THEN RETURN NEW;END IF;
 SELECT * INTO draft FROM question_versions WHERE id=NEW.current_version_id;
 IF draft.review_status='PENDING_REVIEW' THEN RAISE EXCEPTION 'Version pending review cannot be edited';END IF;
 actor=COALESCE(NULLIF(current_setting('app.actor_id',true),'')::integer,NEW.creator_id);
 IF NEW.normalized_content->>'taxonomy_node_id' IS NOT NULL THEN
  SELECT t.id INTO node FROM taxonomy_nodes t JOIN taxonomy_versions tv ON tv.id=t.version_id WHERE t.id=(NEW.normalized_content->>'taxonomy_node_id')::integer AND tv.subject_id=NEW.subject_id;
  IF node IS NULL THEN RAISE EXCEPTION 'Taxonomy node does not belong to subject';END IF;
 ELSE SELECT id INTO node FROM taxonomy_nodes WHERE legacy_topic_id=NEW.topic_id;END IF;
 payload=COALESCE(NEW.normalized_content,to_jsonb(NEW)-'normalized_content'-'current_version_id')||jsonb_build_object('legacy_snapshot',to_jsonb(NEW)-'normalized_content'-'current_version_id','curriculum_snapshot',v643_curriculum_snapshot(NEW.id));
 IF draft.id IS NOT NULL AND draft.review_status='DRAFT' AND NOT draft.ever_approved AND NOT v643_version_used(draft.id) AND current_setting('app.force_version',true) IS DISTINCT FROM 'true' THEN
  UPDATE question_versions SET content=payload,cognitive_level=right(NEW.cognitive_level::text,1)::integer,taxonomy_node_id=node,subject_id=NEW.subject_id,topic_id=NEW.topic_id,grade=NEW.grade,question_type=CASE NEW.q_type::text WHEN 'mcq4' THEN 'multiple_choice' WHEN 'short' THEN 'short_answer' ELSE NEW.q_type::text END,auto_gradable=COALESCE(NEW.q_type::text<>'essay',false) AND COALESCE((payload->>'auto_gradable')::boolean,true),branch_id=NEW.branch_id,outcome_id=NEW.outcome_id,yccd_id=NEW.yccd_id WHERE id=draft.id;
 ELSE
  SELECT COALESCE(max(version_number),0)+1 INTO n FROM question_versions WHERE question_id=NEW.id;
  INSERT INTO question_versions(question_id,version_number,cognitive_level,taxonomy_node_id,subject_id,topic_id,grade,question_type,auto_gradable,content,created_by,branch_id,outcome_id,yccd_id,based_on_version_id,restored_from_version_id)
  VALUES(NEW.id,n,right(NEW.cognitive_level::text,1)::integer,node,NEW.subject_id,NEW.topic_id,NEW.grade,CASE NEW.q_type::text WHEN 'mcq4' THEN 'multiple_choice' WHEN 'short' THEN 'short_answer' ELSE NEW.q_type::text END,COALESCE(NEW.q_type::text<>'essay',false) AND COALESCE((payload->>'auto_gradable')::boolean,true),payload,actor,NEW.branch_id,NEW.outcome_id,NEW.yccd_id,NEW.current_version_id,NULLIF(current_setting('app.restored_from',true),'')::uuid) RETURNING id INTO v;
  PERFORM set_config('app.force_version','false',true);
  UPDATE questions SET current_version_id=v WHERE id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
