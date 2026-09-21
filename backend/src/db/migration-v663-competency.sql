CREATE TABLE competency_frameworks(
 id serial PRIMARY KEY,subject_id integer NOT NULL REFERENCES subjects,
 grade_from integer NOT NULL CHECK(grade_from BETWEEN 1 AND 12),grade_to integer NOT NULL CHECK(grade_to BETWEEN grade_from AND 12),
 code text NOT NULL,title text NOT NULL,source text NOT NULL,version text NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','PUBLISHED','ARCHIVED')),
 based_on integer REFERENCES competency_frameworks,revision integer NOT NULL DEFAULT 1,
 created_by integer REFERENCES users,created_at timestamptz NOT NULL DEFAULT now(),published_at timestamptz,
 UNIQUE(subject_id,code,version)
);
CREATE TABLE competency_axes(
 id serial PRIMARY KEY,framework_id integer NOT NULL REFERENCES competency_frameworks,
 code text NOT NULL,name text NOT NULL,description text NOT NULL DEFAULT '',order_index integer NOT NULL DEFAULT 0,
 allowed_evidence text[] NOT NULL DEFAULT ARRAY['MANUAL_GRADED_ITEM','PRACTICAL_TASK','PROJECT','TEACHER_RUBRIC','PRESENTATION'],
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','RETIRED')),UNIQUE(framework_id,code)
);
CREATE TABLE competency_indicators(
 id serial PRIMARY KEY,axis_id integer NOT NULL REFERENCES competency_axes,
 code text NOT NULL,text text NOT NULL,order_index integer NOT NULL DEFAULT 0,UNIQUE(axis_id,code)
);
CREATE TABLE competency_framework_versions(
 id bigserial PRIMARY KEY,framework_id integer NOT NULL REFERENCES competency_frameworks,
 snapshot jsonb NOT NULL,created_by integer NOT NULL REFERENCES users,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE competency_mapping_versions(
 id bigserial PRIMARY KEY,subject_id integer NOT NULL REFERENCES subjects,grade integer NOT NULL CHECK(grade BETWEEN 1 AND 12),
 target_type text NOT NULL CHECK(target_type IN('yccd','outcome','question')),target_id text NOT NULL,
 entries jsonb NOT NULL,reason text NOT NULL,created_by integer NOT NULL REFERENCES users,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX competency_mapping_target ON competency_mapping_versions(target_type,target_id,id DESC);
CREATE VIEW yccd_competency_map AS SELECT id,subject_id,grade,target_id::integer yccd_id,entries,created_at FROM competency_mapping_versions WHERE target_type='yccd';
CREATE VIEW outcome_competency_map AS SELECT id,subject_id,grade,target_id::integer outcome_id,entries,created_at FROM competency_mapping_versions WHERE target_type='outcome';
CREATE VIEW question_competency_map AS SELECT id,subject_id,grade,target_id::uuid question_version_id,entries,created_at FROM competency_mapping_versions WHERE target_type='question';
ALTER TABLE attempt_items ADD COLUMN competency_snapshot jsonb;
CREATE OR REPLACE FUNCTION v663_competency_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m record;q record; y text;o text;
BEGIN
 SELECT * INTO q FROM question_versions WHERE id=NEW.question_version_id;
 y=COALESCE(NEW.curriculum_snapshot->>'yccd_id',q.yccd_id::text);
 o=COALESCE(NEW.curriculum_snapshot->>'outcome_id',q.outcome_id::text);
 SELECT * INTO m FROM competency_mapping_versions
 WHERE subject_id=q.subject_id AND grade=q.grade AND
 ((target_type='question' AND target_id=NEW.question_version_id::text) OR
 (target_type='yccd' AND target_id=y) OR (target_type='outcome' AND target_id=o))
 ORDER BY CASE target_type WHEN 'question' THEN 1 WHEN 'yccd' THEN 2 ELSE 3 END,id DESC LIMIT 1;
 NEW.competency_snapshot=CASE WHEN m.id IS NULL THEN jsonb_build_object('entries','[]'::jsonb,'source','UNMAPPED')
 ELSE jsonb_build_object('mapping_id',m.id,'source',m.target_type,'entries',m.entries,'captured_at',now()) END;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_v663_competency_snapshot BEFORE INSERT ON attempt_items FOR EACH ROW EXECUTE FUNCTION v663_competency_snapshot();
CREATE OR REPLACE FUNCTION v663_competency_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.competency_snapshot IS DISTINCT FROM OLD.competency_snapshot THEN RAISE EXCEPTION 'COMPETENCY_SNAPSHOT_IMMUTABLE';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER v663_competency_snapshot_immutable BEFORE UPDATE ON attempt_items FOR EACH ROW EXECUTE FUNCTION v663_competency_snapshot_immutable();
CREATE TABLE competency_rubric_evidence(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),student_id integer NOT NULL REFERENCES student_profiles(user_id),
 subject_id integer NOT NULL REFERENCES subjects,axis_id integer NOT NULL REFERENCES competency_axes,
 evidence_type text NOT NULL CHECK(evidence_type IN('MANUAL_GRADED_ITEM','PRACTICAL_TASK','PROJECT','TEACHER_RUBRIC','PRESENTATION')),
 activity text NOT NULL,performance numeric NOT NULL CHECK(performance BETWEEN 0 AND 1),notes text NOT NULL DEFAULT '',
 occurred_at timestamptz NOT NULL,created_by integer NOT NULL REFERENCES users,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE competency_product_config(id boolean PRIMARY KEY DEFAULT true CHECK(id),config jsonb NOT NULL,updated_by integer REFERENCES users,updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO competency_product_config(config) VALUES('{"minimum_evidence":5,"minimum_confidence":30,"target_evidence":20,"target_active_days":4,"recency":[1,0.85,0.7,0.55],"reliability":{"AUTO_GRADED_ITEM":0.8,"MANUAL_GRADED_ITEM":0.9,"PRACTICAL_TASK":1,"PROJECT":1,"TEACHER_RUBRIC":1,"PRESENTATION":0.9,"SELF_ASSESSMENT":0.3,"PEER_ASSESSMENT":0.4}}');
CREATE OR REPLACE FUNCTION v663_framework_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f integer;s text;
BEGIN
 IF TG_TABLE_NAME='competency_axes' THEN f=CASE WHEN TG_OP='DELETE' THEN OLD.framework_id ELSE NEW.framework_id END;
 ELSE SELECT framework_id INTO f FROM competency_axes WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.axis_id ELSE NEW.axis_id END;END IF;
 SELECT status INTO s FROM competency_frameworks WHERE id=f;
 IF s<>'DRAFT' THEN RAISE EXCEPTION 'FRAMEWORK_REQUIRES_DRAFT';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE TRIGGER v663_axis_guard BEFORE INSERT OR UPDATE OR DELETE ON competency_axes FOR EACH ROW EXECUTE FUNCTION v663_framework_guard();
CREATE TRIGGER v663_indicator_guard BEFORE INSERT OR UPDATE OR DELETE ON competency_indicators FOR EACH ROW EXECUTE FUNCTION v663_framework_guard();
CREATE OR REPLACE FUNCTION v663_evidence_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'LEARNING_INTERPRETATION_APPEND_ONLY';END $$;
CREATE TRIGGER v663_mapping_immutable BEFORE UPDATE OR DELETE ON competency_mapping_versions FOR EACH ROW EXECUTE FUNCTION v663_evidence_append_only();
CREATE TRIGGER v663_rubric_immutable BEFORE UPDATE OR DELETE ON competency_rubric_evidence FOR EACH ROW EXECUTE FUNCTION v663_evidence_append_only();
