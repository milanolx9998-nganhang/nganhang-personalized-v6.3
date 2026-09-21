-- Track the last editor of an editable draft; never infer editors for historical content.
ALTER TABLE question_versions ADD COLUMN updated_by integer REFERENCES users;
CREATE OR REPLACE FUNCTION v643_track_draft_editor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.review_status='DRAFT' AND NEW.content IS DISTINCT FROM OLD.content THEN
  NEW.updated_by=COALESCE(NULLIF(current_setting('app.actor_id',true),'')::integer,NEW.updated_by,NEW.created_by);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER v643_draft_editor BEFORE UPDATE ON question_versions FOR EACH ROW EXECUTE FUNCTION v643_track_draft_editor();
