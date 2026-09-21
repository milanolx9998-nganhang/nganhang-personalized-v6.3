-- Additive: legacy IDs and historical evidence stay untouched.
CREATE TABLE curriculum_versions(
 id serial PRIMARY KEY, subject_id integer NOT NULL REFERENCES subjects,
 grade integer NOT NULL CHECK(grade BETWEEN 1 AND 12),version_code text NOT NULL,
 title text NOT NULL,source_name text NOT NULL DEFAULT '',source_ref text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','PUBLISHED','ARCHIVED')),
 based_on integer REFERENCES curriculum_versions,revision integer NOT NULL DEFAULT 1,
 created_by integer REFERENCES users,published_by integer REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(),published_at timestamptz,
 UNIQUE(subject_id,grade,version_code)
);
ALTER TABLE curriculum_outcomes ADD COLUMN curriculum_version_id integer REFERENCES curriculum_versions;
ALTER TABLE curriculum_outcomes ADD COLUMN lineage_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE curriculum_yccds ADD COLUMN curriculum_version_id integer REFERENCES curriculum_versions;
ALTER TABLE curriculum_yccds ADD COLUMN lineage_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX v663_outcome_lineage ON curriculum_outcomes(curriculum_version_id,lineage_id) WHERE curriculum_version_id IS NOT NULL;
CREATE UNIQUE INDEX v663_yccd_lineage ON curriculum_yccds(curriculum_version_id,lineage_id) WHERE curriculum_version_id IS NOT NULL;
CREATE TABLE curriculum_import_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),version_id integer NOT NULL REFERENCES curriculum_versions,
 filename text NOT NULL,checksum text NOT NULL,workbook jsonb NOT NULL,
 mapping jsonb NOT NULL DEFAULT '{}',status text NOT NULL DEFAULT 'UPLOADED' CHECK(status IN('UPLOADED','MAPPED','COMMITTED')),
 revision integer NOT NULL DEFAULT 1,created_by integer NOT NULL REFERENCES users,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE curriculum_import_rows(
 id bigserial PRIMARY KEY,import_job_id uuid NOT NULL REFERENCES curriculum_import_jobs,
 source_sheet text NOT NULL,source_row integer NOT NULL,raw_payload jsonb NOT NULL,mapped_payload jsonb NOT NULL,
 validation_result jsonb NOT NULL DEFAULT '[]',row_status text NOT NULL CHECK(row_status IN('READY','WARNING','BLOCKED','DUPLICATE','IGNORED')),
 UNIQUE(import_job_id,source_sheet,source_row)
);
CREATE TABLE curriculum_change_log(
 id bigserial PRIMARY KEY,version_id integer NOT NULL REFERENCES curriculum_versions,
 actor_id integer NOT NULL REFERENCES users,action text NOT NULL,before_data jsonb,after_data jsonb,
 reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE curriculum_replacements(
 id bigserial PRIMARY KEY,entity_type text NOT NULL CHECK(entity_type IN('outcome','yccd')),
 original_id integer NOT NULL,replacement_id integer NOT NULL,version_id integer NOT NULL REFERENCES curriculum_versions,
 created_by integer NOT NULL REFERENCES users,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(entity_type,original_id,replacement_id)
);
CREATE OR REPLACE FUNCTION v663_curriculum_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s text;p integer;
BEGIN
 IF TG_OP <> 'INSERT' AND OLD.curriculum_version_id IS NOT NULL THEN
  SELECT status INTO s FROM curriculum_versions WHERE id=OLD.curriculum_version_id;
  IF s <> 'DRAFT' AND (TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'PUBLISHED_CURRICULUM_IMMUTABLE';END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.curriculum_version_id IS NOT NULL THEN
  SELECT status INTO s FROM curriculum_versions WHERE id=NEW.curriculum_version_id;
  IF s <> 'DRAFT' THEN RAISE EXCEPTION 'CURRICULUM_REQUIRES_DRAFT';END IF;
  IF TG_TABLE_NAME='curriculum_yccds' THEN
   SELECT curriculum_version_id INTO p FROM curriculum_outcomes WHERE id=NEW.outcome_id;
   IF p IS DISTINCT FROM NEW.curriculum_version_id THEN RAISE EXCEPTION 'CURRICULUM_PARENT_VERSION_MISMATCH';END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER v663_outcome_guard BEFORE INSERT OR UPDATE OR DELETE ON curriculum_outcomes FOR EACH ROW EXECUTE FUNCTION v663_curriculum_guard();
CREATE TRIGGER v663_yccd_guard BEFORE INSERT OR UPDATE OR DELETE ON curriculum_yccds FOR EACH ROW EXECUTE FUNCTION v663_curriculum_guard();
