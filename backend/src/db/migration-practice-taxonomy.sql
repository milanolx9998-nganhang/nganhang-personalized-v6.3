CREATE OR REPLACE FUNCTION practice_snapshot_question() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v uuid; n integer; node integer; payload jsonb;
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.stem_text,NEW.option_a,NEW.option_b,NEW.option_c,NEW.option_d,NEW.answer_key,NEW.explanation,NEW.image_url,NEW.cognitive_level,NEW.q_type,NEW.topic_id,NEW.subject_id,NEW.grade,NEW.normalized_content,NEW.question_code) IS NOT DISTINCT FROM ROW(OLD.stem_text,OLD.option_a,OLD.option_b,OLD.option_c,OLD.option_d,OLD.answer_key,OLD.explanation,OLD.image_url,OLD.cognitive_level,OLD.q_type,OLD.topic_id,OLD.subject_id,OLD.grade,OLD.normalized_content,OLD.question_code) AND NEW.current_version_id IS NOT NULL THEN RETURN NEW; END IF;
 SELECT COALESCE(max(version_number),0)+1 INTO n FROM question_versions WHERE question_id=NEW.id;
 IF NEW.normalized_content->>'taxonomy_node_id' IS NOT NULL THEN
  SELECT t.id INTO node FROM taxonomy_nodes t JOIN taxonomy_versions v ON v.id=t.version_id WHERE t.id=(NEW.normalized_content->>'taxonomy_node_id')::integer AND v.subject_id=NEW.subject_id;
  IF node IS NULL THEN RAISE EXCEPTION 'Taxonomy node does not belong to question subject'; END IF;
 ELSE
  SELECT id INTO node FROM taxonomy_nodes WHERE legacy_topic_id=NEW.topic_id;
 END IF;
 payload := COALESCE(NEW.normalized_content,to_jsonb(NEW)-'normalized_content'-'current_version_id');
 INSERT INTO question_versions(question_id,version_number,cognitive_level,taxonomy_node_id,subject_id,topic_id,grade,question_type,auto_gradable,content,created_by)
 VALUES(NEW.id,n,right(NEW.cognitive_level::text,1)::integer,node,NEW.subject_id,NEW.topic_id,NEW.grade,CASE NEW.q_type::text WHEN 'mcq4' THEN 'multiple_choice' WHEN 'short' THEN 'short_answer' ELSE NEW.q_type::text END,NEW.q_type::text<>'essay' AND COALESCE((payload->>'auto_gradable')::boolean,true),payload,NEW.creator_id) RETURNING id INTO v;
 UPDATE questions SET current_version_id=v WHERE id=NEW.id;
 RETURN NEW;
END $$;
