CREATE TABLE battle_ratings (
 user_id integer NOT NULL REFERENCES users,grade integer NOT NULL,season text NOT NULL,
 lp integer NOT NULL DEFAULT 0 CHECK(lp>=0),tier integer NOT NULL DEFAULT 0,games integer NOT NULL DEFAULT 0,
 hidden boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,grade,season)
);
CREATE TABLE battle_subject_ratings (
 user_id integer NOT NULL,grade integer NOT NULL,season text NOT NULL,subject_id integer NOT NULL REFERENCES subjects,
 mmr numeric NOT NULL,PRIMARY KEY(user_id,grade,season,subject_id),
 FOREIGN KEY(user_id,grade,season) REFERENCES battle_ratings
);
CREATE TABLE battle_rating_events (
 room_id uuid NOT NULL REFERENCES battle_rooms,user_id integer NOT NULL REFERENCES users,grade integer NOT NULL,season text NOT NULL,
 delta_lp integer NOT NULL,lp_after integer NOT NULL,mmr_before jsonb NOT NULL,mmr_after jsonb NOT NULL,
 reason jsonb NOT NULL,scope_key text NOT NULL,opponents integer[] NOT NULL,won boolean NOT NULL,
 has_bots boolean NOT NULL,shield boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(room_id,user_id)
);
CREATE INDEX battle_rating_events_history ON battle_rating_events(user_id,created_at DESC);
CREATE INDEX battle_ratings_board ON battle_ratings(grade,season,lp DESC) WHERE NOT hidden;
