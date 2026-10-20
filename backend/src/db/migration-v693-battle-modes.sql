-- Mở rộng additive; điểm lịch sử giữ NULL và được đọc theo luật 1.3.
ALTER TABLE battle_rooms ADD COLUMN IF NOT EXISTS pacing text NOT NULL DEFAULT 'sync' CHECK (pacing IN ('sync','self'));
ALTER TABLE battle_rooms ADD COLUMN IF NOT EXISTS scoring text NOT NULL DEFAULT 'accuracy' CHECK (scoring IN ('accuracy','speed'));
ALTER TABLE battle_rooms ADD COLUMN IF NOT EXISTS time_limit text NOT NULL DEFAULT 'per_question' CHECK (time_limit IN ('per_question','total'));
ALTER TABLE battle_rooms ADD COLUMN IF NOT EXISTS total_minutes integer;
ALTER TABLE battle_rooms ADD COLUMN IF NOT EXISTS reveal_policy text NOT NULL DEFAULT 'instant' CHECK (reveal_policy IN ('instant','deferred'));
ALTER TABLE battle_rooms ADD COLUMN IF NOT EXISTS show_live_board boolean NOT NULL DEFAULT true;
ALTER TABLE battle_rooms ADD COLUMN IF NOT EXISTS play_started_at timestamptz;
ALTER TABLE battle_rooms ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE battle_rooms ADD COLUMN IF NOT EXISTS gameplay jsonb NOT NULL DEFAULT '{}';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='battle_rooms'::regclass AND conname='battle_modes_combination') THEN
  ALTER TABLE battle_rooms ADD CONSTRAINT battle_modes_combination CHECK (
   (kind='class' OR (pacing='sync' AND scoring='accuracy' AND time_limit='per_question' AND reveal_policy='instant' AND show_live_board)) AND
   ((time_limit='per_question' AND total_minutes IS NULL) OR
    (time_limit='total' AND pacing='self' AND total_minutes IS NOT NULL AND total_minutes IN (3,5,10,15,20))));
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS battle_player_progress (
 room_id uuid NOT NULL REFERENCES battle_rooms(id) ON DELETE CASCADE,
 player_key text NOT NULL, cursor integer NOT NULL CHECK(cursor>=0),
 issued_count integer NOT NULL CHECK(issued_count>=0),
 phase text NOT NULL CHECK(phase IN ('question','feedback','done')),
 opened_at timestamptz, deadline timestamptz, paused_ms bigint NOT NULL DEFAULT 0,
 progress_version integer NOT NULL DEFAULT 0, auto_next_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(room_id,player_key)
);
ALTER TABLE battle_answers ADD COLUMN IF NOT EXISTS base_points numeric;
ALTER TABLE battle_answers ADD COLUMN IF NOT EXISTS speed_points numeric;
ALTER TABLE battle_answers ADD COLUMN IF NOT EXISTS fastest_points numeric;
ALTER TABLE battle_answers ADD COLUMN IF NOT EXISTS fast_response boolean NOT NULL DEFAULT false;
ALTER TABLE battle_answers ADD COLUMN IF NOT EXISTS timed_out boolean NOT NULL DEFAULT false;
ALTER TABLE battle_bot_answers ADD COLUMN IF NOT EXISTS base_points numeric;
ALTER TABLE battle_bot_answers ADD COLUMN IF NOT EXISTS speed_points numeric;
ALTER TABLE battle_bot_answers ADD COLUMN IF NOT EXISTS fastest_points numeric;
ALTER TABLE battle_bot_answers ADD COLUMN IF NOT EXISTS fast_response boolean NOT NULL DEFAULT false;
ALTER TABLE battle_bot_answers ADD COLUMN IF NOT EXISTS timed_out boolean NOT NULL DEFAULT false;
INSERT INTO system_settings(key,value) VALUES('battle_modes','{"self_paced":false,"speed_scoring":false}')
ON CONFLICT(key) DO UPDATE SET value='{"self_paced":false,"speed_scoring":false}'::jsonb || system_settings.value;
