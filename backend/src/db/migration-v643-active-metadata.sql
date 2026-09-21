ALTER TABLE questions ADD COLUMN active_metadata jsonb;
UPDATE questions SET active_metadata=v643_curriculum_snapshot(id) WHERE active_version_id IS NOT NULL;
-- Read model for NEW selection. The editor keeps draft metadata on questions;
-- approved metadata is independent until review explicitly publishes the change.
DO $$
DECLARE columns_sql text;
BEGIN
 SELECT string_agg(
  CASE
   WHEN attname IN('subject_id','grade','topic_id','branch_id','outcome_id','yccd_id') THEN format('COALESCE((q.active_metadata->>%L)::integer,q.%I) AS %I',attname,attname,attname)
   WHEN attname='cognitive_level' THEN 'COALESCE((q.active_metadata->>''cognitive_level'')::cognitive_level,q.cognitive_level) AS cognitive_level'
   WHEN attname='q_type' THEN 'COALESCE((q.active_metadata->>''question_type'')::question_type,q.q_type) AS q_type'
   WHEN attname='metadata_status' THEN 'CASE WHEN q.active_metadata->>''yccd_id'' IS NOT NULL AND q.active_metadata->>''cognitive_level'' IS NOT NULL AND q.active_metadata->>''question_type'' IS NOT NULL THEN ''VERIFIED'' ELSE q.metadata_status END AS metadata_status'
   ELSE format('q.%I',attname)
  END,',' ORDER BY attnum) INTO columns_sql
 FROM pg_attribute WHERE attrelid='questions'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE 'CREATE VIEW question_selection_metadata AS SELECT '||columns_sql||' FROM questions q';
END $$;
