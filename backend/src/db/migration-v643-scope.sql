-- Bổ sung tại chỗ. Không suy đoán / tự duyệt quan hệ bài–YCCĐ từ số thứ tự.
ALTER TABLE topics ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','ARCHIVED','DRAFT'));
ALTER TABLE topics ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE topic_yccd_map(
 topic_id integer NOT NULL REFERENCES topics,yccd_id integer NOT NULL REFERENCES curriculum_yccds,
 relation_type text NOT NULL DEFAULT 'core' CHECK(relation_type IN('core','supporting')),
 order_index integer NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'CANDIDATE' CHECK(status IN('CANDIDATE','ACTIVE','RETIRED')),
 valid_from date,valid_to date,created_by integer REFERENCES users,created_at timestamptz NOT NULL DEFAULT now(),
 updated_by integer REFERENCES users,updated_at timestamptz NOT NULL DEFAULT now(),source_evidence jsonb NOT NULL DEFAULT '{}',
 PRIMARY KEY(topic_id,yccd_id),CHECK(valid_to IS NULL OR valid_from IS NULL OR valid_to>=valid_from)
);
CREATE INDEX topic_yccd_active ON topic_yccd_map(yccd_id,topic_id) WHERE status='ACTIVE';
CREATE OR REPLACE FUNCTION v643_validate_topic_map() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t record;y record;
BEGIN
 SELECT tp.*,CASE b.code WHEN 'VL' THEN 'L' WHEN 'HH' THEN 'H' WHEN 'SH' THEN 'S' ELSE COALESCE(b.code,'') END AS domain_code INTO t FROM topics tp LEFT JOIN branches b ON b.id=tp.branch_id WHERE tp.id=NEW.topic_id;
 SELECT cy.status,o.subject_id,o.grade,o.domain_code,o.status AS outcome_status INTO y FROM curriculum_yccds cy JOIN curriculum_outcomes o ON o.id=cy.outcome_id WHERE cy.id=NEW.yccd_id;
 IF t.subject_id IS DISTINCT FROM y.subject_id OR t.grade IS DISTINCT FROM y.grade OR (t.domain_code<>'' AND y.domain_code<>'' AND t.domain_code<>y.domain_code) THEN RAISE EXCEPTION 'TOPIC_YCCD_MISMATCH: mapping outside subject/grade/domain';END IF;
 IF NEW.status='ACTIVE' AND (t.status<>'ACTIVE' OR y.status<>'ACTIVE' OR y.outcome_status<>'ACTIVE') THEN RAISE EXCEPTION 'TOPIC_YCCD_MISMATCH: inactive curriculum';END IF;
 NEW.updated_at=now();RETURN NEW;
END $$;
CREATE TRIGGER v643_topic_map BEFORE INSERT OR UPDATE ON topic_yccd_map FOR EACH ROW EXECUTE FUNCTION v643_validate_topic_map();
INSERT INTO topic_yccd_map(topic_id,yccd_id,source_evidence)
 SELECT q.topic_id,q.yccd_id,jsonb_build_object('origin','VERIFIED_QUESTIONS','question_ids',jsonb_agg(q.id))
 FROM questions q JOIN topics t ON t.id=q.topic_id JOIN curriculum_yccds y ON y.id=q.yccd_id JOIN curriculum_outcomes o ON o.id=y.outcome_id
 LEFT JOIN branches b ON b.id=t.branch_id
 WHERE q.metadata_status='VERIFIED' AND t.subject_id=o.subject_id AND t.grade=o.grade
 AND (t.branch_id IS NULL OR o.domain_code='' OR (CASE b.code WHEN 'VL' THEN 'L' WHEN 'HH' THEN 'H' WHEN 'SH' THEN 'S' ELSE b.code END)=o.domain_code)
 GROUP BY q.topic_id,q.yccd_id;
ALTER TABLE curriculum_yccds ADD COLUMN superseded_by integer REFERENCES curriculum_yccds;
ALTER TABLE curriculum_yccds ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE curriculum_outcomes ADD COLUMN superseded_by integer REFERENCES curriculum_outcomes;
ALTER TABLE curriculum_outcomes ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE curriculum_aliases(id serial PRIMARY KEY,entity_type text NOT NULL CHECK(entity_type IN('outcome','yccd')),entity_id integer NOT NULL,old_code text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),created_by integer REFERENCES users,UNIQUE(entity_type,entity_id,old_code));
ALTER TABLE matrix_templates ADD COLUMN content_scope_v2 jsonb;
ALTER TABLE matrix_templates ADD COLUMN scope_snapshot jsonb;
ALTER TABLE attempt_items ADD COLUMN curriculum_snapshot jsonb;
ALTER TABLE exam_items ADD COLUMN curriculum_snapshot jsonb;
ALTER TABLE assignments ADD COLUMN curriculum_snapshot jsonb;
CREATE OR REPLACE FUNCTION v643_curriculum_snapshot(qid integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('topic_id',q.topic_id,'topic_name',t.name,'subject_id',q.subject_id,'grade',q.grade,
 'branch_id',q.branch_id,'outcome_id',q.outcome_id,'outcome_code',o.code,'outcome_title',o.title,
 'yccd_id',q.yccd_id,'yccd_code',y.code,'yccd_text',y.text,'domain_code',o.domain_code,'curriculum_version',o.curriculum_version,
 'cognitive_level',q.cognitive_level,'question_type',q.q_type)
 FROM questions q LEFT JOIN topics t ON t.id=q.topic_id LEFT JOIN curriculum_yccds y ON y.id=q.yccd_id LEFT JOIN curriculum_outcomes o ON o.id=q.outcome_id WHERE q.id=qid
$$;
-- Chỉ snapshot lần sử dụng mới; dữ liệu cũ không thể suy ngược nhãn tại thời điểm sử dụng.
CREATE OR REPLACE FUNCTION v643_snapshot_usage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.curriculum_snapshot=COALESCE(NEW.curriculum_snapshot,v643_curriculum_snapshot(NEW.question_id));RETURN NEW;END $$;
CREATE TRIGGER v643_attempt_snapshot BEFORE INSERT ON attempt_items FOR EACH ROW EXECUTE FUNCTION v643_snapshot_usage();
CREATE TRIGGER v643_exam_snapshot BEFORE INSERT ON exam_items FOR EACH ROW EXECUTE FUNCTION v643_snapshot_usage();
