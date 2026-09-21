-- Nối tiếp V5, không cập nhật/xóa version hay dữ liệu học tập cũ.
CREATE TABLE curriculum_outcomes(
 id serial PRIMARY KEY,subject_id integer NOT NULL REFERENCES subjects,grade integer NOT NULL CHECK(grade BETWEEN 1 AND 12),
 domain_code text NOT NULL DEFAULT '',code text NOT NULL,title text NOT NULL,curriculum_version text NOT NULL,
 source_document text NOT NULL,source_locator text,order_index integer NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'ACTIVE',
 UNIQUE(subject_id,grade,domain_code,curriculum_version,code)
);
CREATE TABLE curriculum_yccds(
 id serial PRIMARY KEY,outcome_id integer NOT NULL REFERENCES curriculum_outcomes,code text NOT NULL,text text NOT NULL,
 source_locator text,source_row integer,order_index integer NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'ACTIVE',
 UNIQUE(outcome_id,code)
);
CREATE TABLE user_positions(
 id serial PRIMARY KEY,user_id integer NOT NULL REFERENCES users,position text NOT NULL CHECK(position IN('subject_teacher','homeroom','dept_leader','grade_leader','board')),
 class_id integer REFERENCES classes,subject_id integer REFERENCES subjects,department_id integer REFERENCES departments,
 grade integer CHECK(grade BETWEEN 1 AND 12),school_year_id integer REFERENCES school_years,
 can_approve boolean NOT NULL DEFAULT false,valid_from date NOT NULL DEFAULT CURRENT_DATE,valid_to date,
 CHECK(valid_to IS NULL OR valid_to>=valid_from),
 CHECK((position='homeroom' AND class_id IS NOT NULL AND subject_id IS NULL) OR
 (position='subject_teacher' AND subject_id IS NOT NULL) OR
 (position='dept_leader' AND department_id IS NOT NULL) OR
 (position='grade_leader' AND grade IS NOT NULL AND school_year_id IS NOT NULL) OR
 (position='board' AND (class_id IS NOT NULL OR subject_id IS NOT NULL OR department_id IS NOT NULL OR (grade IS NOT NULL AND school_year_id IS NOT NULL))))
);
CREATE INDEX user_positions_scope ON user_positions(user_id,position,class_id);
ALTER TABLE questions ADD COLUMN outcome_id integer REFERENCES curriculum_outcomes;
ALTER TABLE questions ADD COLUMN yccd_id integer REFERENCES curriculum_yccds;
ALTER TABLE questions ADD COLUMN metadata_status text NOT NULL DEFAULT 'LEGACY_UNRESOLVED';
ALTER TABLE questions ALTER COLUMN cognitive_level DROP NOT NULL;
ALTER TABLE questions ALTER COLUMN q_type DROP NOT NULL;
ALTER TABLE questions ALTER COLUMN grade DROP NOT NULL;
ALTER TABLE question_versions ALTER COLUMN cognitive_level DROP NOT NULL;
ALTER TABLE question_versions ALTER COLUMN question_type DROP NOT NULL;
ALTER TABLE question_versions ALTER COLUMN grade DROP NOT NULL;
ALTER TABLE question_versions ADD COLUMN branch_id integer REFERENCES branches;
ALTER TABLE question_versions ADD COLUMN outcome_id integer REFERENCES curriculum_outcomes;
ALTER TABLE question_versions ADD COLUMN yccd_id integer REFERENCES curriculum_yccds;
ALTER TABLE matrix_cells ADD COLUMN outcome_id integer REFERENCES curriculum_outcomes;
ALTER TABLE matrix_cells ADD COLUMN yccd_id integer REFERENCES curriculum_yccds;
ALTER TABLE matrix_templates ADD COLUMN deviation_accepted boolean NOT NULL DEFAULT false;
ALTER TABLE matrix_templates ADD COLUMN deviation_reason text NOT NULL DEFAULT '';
ALTER TABLE matrix_templates ADD COLUMN workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','pending_review','approved','locked','archived'));
ALTER TABLE matrix_templates ADD COLUMN approved_by integer REFERENCES users;
ALTER TABLE matrix_templates ADD COLUMN approved_at timestamptz;
CREATE TABLE matrix_yccd_scope(template_id integer REFERENCES matrix_templates ON DELETE CASCADE,yccd_id integer REFERENCES curriculum_yccds,weight numeric NOT NULL DEFAULT 1 CHECK(weight>0),PRIMARY KEY(template_id,yccd_id));
ALTER TABLE exam_items ADD COLUMN question_version_id uuid REFERENCES question_versions;
ALTER TABLE exam_items ADD COLUMN matrix_cell_id integer REFERENCES matrix_cells ON DELETE SET NULL;
ALTER TABLE exam_items ADD COLUMN assigned_score numeric(7,2);
ALTER TABLE exam_items ADD COLUMN selection_policy text NOT NULL DEFAULT 'LEGACY_UNSNAPSHOTTED';
ALTER TABLE exam_items ADD COLUMN cell_snapshot jsonb;
ALTER TABLE exam_runs ADD COLUMN matrix_snapshot jsonb;
CREATE INDEX matrix_cell_yccd ON matrix_cells(yccd_id,cognitive_level,q_type);
CREATE INDEX question_exact_metadata ON questions(subject_id,grade,yccd_id,cognitive_level,q_type,lifecycle);
CREATE OR REPLACE FUNCTION v63_metadata_prepare() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o curriculum_outcomes; y curriculum_yccds; b branches;
BEGIN
 IF NEW.yccd_id IS NOT NULL THEN
  SELECT * INTO y FROM curriculum_yccds WHERE id=NEW.yccd_id;
  SELECT * INTO o FROM curriculum_outcomes WHERE id=y.outcome_id;
  IF NEW.outcome_id IS DISTINCT FROM o.id OR NEW.subject_id IS DISTINCT FROM o.subject_id OR NEW.grade IS DISTINCT FROM o.grade THEN RAISE EXCEPTION 'YCCD does not match Outcome/subject/grade'; END IF;
  IF o.domain_code<>'' THEN
   SELECT * INTO b FROM branches WHERE id=NEW.branch_id;
   IF b.subject_id IS DISTINCT FROM o.subject_id OR (CASE b.code WHEN 'VL' THEN 'L' WHEN 'HH' THEN 'H' WHEN 'SH' THEN 'S' ELSE b.code END) IS DISTINCT FROM o.domain_code THEN RAISE EXCEPTION 'YCCD domain mismatch'; END IF;
  END IF;
  NEW.metadata_status=CASE WHEN NEW.cognitive_level IS NOT NULL AND NEW.q_type IS NOT NULL THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END;
 ELSE NEW.metadata_status='LEGACY_UNRESOLVED';
 END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.outcome_id,NEW.yccd_id,NEW.branch_id) IS DISTINCT FROM ROW(OLD.outcome_id,OLD.yccd_id,OLD.branch_id) THEN NEW.lifecycle='draft';NEW.status='Mới tạo'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER v63_metadata_prepare BEFORE INSERT OR UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION v63_metadata_prepare();

CREATE OR REPLACE FUNCTION practice_snapshot_question() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v uuid; n integer; node integer; payload jsonb;
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.stem_text,NEW.option_a,NEW.option_b,NEW.option_c,NEW.option_d,NEW.answer_key,NEW.explanation,NEW.image_url,NEW.cognitive_level,NEW.q_type,NEW.topic_id,NEW.subject_id,NEW.grade,NEW.normalized_content,NEW.question_code,NEW.outcome_id,NEW.yccd_id,NEW.branch_id) IS NOT DISTINCT FROM ROW(OLD.stem_text,OLD.option_a,OLD.option_b,OLD.option_c,OLD.option_d,OLD.answer_key,OLD.explanation,OLD.image_url,OLD.cognitive_level,OLD.q_type,OLD.topic_id,OLD.subject_id,OLD.grade,OLD.normalized_content,OLD.question_code,OLD.outcome_id,OLD.yccd_id,OLD.branch_id) AND NEW.current_version_id IS NOT NULL THEN RETURN NEW; END IF;
 SELECT COALESCE(max(version_number),0)+1 INTO n FROM question_versions WHERE question_id=NEW.id;
 IF NEW.normalized_content->>'taxonomy_node_id' IS NOT NULL THEN
  SELECT t.id INTO node FROM taxonomy_nodes t JOIN taxonomy_versions v ON v.id=t.version_id WHERE t.id=(NEW.normalized_content->>'taxonomy_node_id')::integer AND v.subject_id=NEW.subject_id;
  IF node IS NULL THEN RAISE EXCEPTION 'Taxonomy node does not belong to question subject'; END IF;
 ELSE
  SELECT id INTO node FROM taxonomy_nodes WHERE legacy_topic_id=NEW.topic_id;
 END IF;
 payload := COALESCE(NEW.normalized_content,to_jsonb(NEW)-'normalized_content'-'current_version_id') || jsonb_build_object('legacy_snapshot',to_jsonb(NEW)-'normalized_content'-'current_version_id');
 INSERT INTO question_versions(question_id,version_number,cognitive_level,taxonomy_node_id,subject_id,topic_id,grade,question_type,auto_gradable,content,created_by,branch_id,outcome_id,yccd_id)
 VALUES(NEW.id,n,right(NEW.cognitive_level::text,1)::integer,node,NEW.subject_id,NEW.topic_id,NEW.grade,CASE NEW.q_type::text WHEN 'mcq4' THEN 'multiple_choice' WHEN 'short' THEN 'short_answer' ELSE NEW.q_type::text END,COALESCE(NEW.q_type::text<>'essay',false) AND COALESCE((payload->>'auto_gradable')::boolean,true),payload,NEW.creator_id,NEW.branch_id,NEW.outcome_id,NEW.yccd_id) RETURNING id INTO v;
 UPDATE questions SET current_version_id=v WHERE id=NEW.id;
 RETURN NEW;
END $$;
