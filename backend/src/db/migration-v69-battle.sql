-- V6.9: dữ liệu ván độc lập với thành thạo; chỉ thêm bảng và mở rộng nguồn lượt luyện.
CREATE TABLE battle_rooms (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), code text NOT NULL CHECK(code ~ '^[0-9]{6}$'),
 run_id uuid NOT NULL, asked_count integer NOT NULL DEFAULT 0 CHECK(asked_count>=0),
 kind text NOT NULL CHECK(kind IN('duel','team','ffa','class')), visibility text NOT NULL CHECK(visibility IN('public','code')),
 host_id integer NOT NULL REFERENCES users, class_id integer REFERENCES classes, grade integer NOT NULL CHECK(grade BETWEEN 1 AND 12),
 subject_id integer REFERENCES subjects, branch_id integer REFERENCES branches, scope jsonb NOT NULL DEFAULT '{}',
 content_mode text NOT NULL CHECK(content_mode IN('fixed','vote')), capacity integer NOT NULL,
 question_count integer NOT NULL CHECK(question_count IN(7,10,15)), seconds integer NOT NULL CHECK(seconds BETWEEN 20 AND 180),
 time_factors jsonb NOT NULL DEFAULT '{"multiple_choice":1,"true_false":1.5,"short_answer":1.5,"matching":1.5}',
 rules_version text NOT NULL DEFAULT '1.3', status text NOT NULL DEFAULT 'lobby' CHECK(status IN('lobby','playing','finished','interrupted','closed')),
 end_reason text, rematch_of uuid REFERENCES battle_rooms, created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, ended_at timestamptz,
 CHECK((kind='duel' AND capacity=2) OR (kind='team' AND capacity BETWEEN 2 AND 8) OR (kind='ffa' AND capacity BETWEEN 2 AND 20) OR (kind='class' AND capacity BETWEEN 1 AND 50)),
 CHECK((kind='class')=(class_id IS NOT NULL)), CHECK(asked_count<=question_count)
);
CREATE UNIQUE INDEX battle_rooms_live_code ON battle_rooms(code) WHERE status IN('lobby','playing');
CREATE INDEX battle_rooms_lobby ON battle_rooms(grade,subject_id,created_at) WHERE status='lobby' AND visibility='public';
CREATE TABLE battle_players (
 room_id uuid NOT NULL REFERENCES battle_rooms, user_id integer NOT NULL REFERENCES users, team integer CHECK(team IN(1,2)),
 display_name text NOT NULL, class_name text NOT NULL, ready boolean NOT NULL DEFAULT false,
 joined_at timestamptz NOT NULL DEFAULT now(), left_at timestamptz, leave_reason text,
 points numeric NOT NULL DEFAULT 0 CHECK(points>=0), correct integer NOT NULL DEFAULT 0 CHECK(correct>=0), rank integer CHECK(rank>0),
 PRIMARY KEY(room_id,user_id)
);
CREATE INDEX battle_players_history ON battle_players(user_id,joined_at DESC);
-- FK kép bảo đảm phiên bản thực sự thuộc câu hỏi, kể cả khi có đường ghi khác API.
CREATE UNIQUE INDEX question_versions_battle_identity ON question_versions(id,question_id);
CREATE TABLE battle_questions (
 room_id uuid NOT NULL REFERENCES battle_rooms, idx integer NOT NULL CHECK(idx>=0),
 question_version_id uuid NOT NULL, question_id integer NOT NULL REFERENCES questions, topic_id integer REFERENCES topics,
 cognitive_level integer NOT NULL CHECK(cognitive_level BETWEEN 1 AND 3), curriculum_snapshot jsonb NOT NULL,
 seconds numeric NOT NULL CHECK(seconds>0), PRIMARY KEY(room_id,idx), UNIQUE(room_id,question_id),
 FOREIGN KEY(question_version_id,question_id) REFERENCES question_versions(id,question_id)
);
CREATE TABLE battle_answers (
 room_id uuid NOT NULL, idx integer NOT NULL, user_id integer NOT NULL, client_id uuid NOT NULL,
 response jsonb, score numeric NOT NULL CHECK(score BETWEEN 0 AND 1), ms integer NOT NULL CHECK(ms>=0),
 skipped boolean NOT NULL DEFAULT false, received_at timestamptz NOT NULL,
 PRIMARY KEY(room_id,idx,user_id), FOREIGN KEY(room_id,idx) REFERENCES battle_questions,
 FOREIGN KEY(room_id,user_id) REFERENCES battle_players
);
CREATE TABLE battle_reports (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), room_id uuid NOT NULL REFERENCES battle_rooms,
 reporter_id integer NOT NULL REFERENCES users, target_id integer NOT NULL REFERENCES users,
 reason text NOT NULL CHECK(reason IN('bullying','name','cheating','other')), note text NOT NULL DEFAULT '',
 severity text NOT NULL CHECK(severity IN('low','medium','high')),
 status text NOT NULL DEFAULT 'new' CHECK(status IN('new','reviewing','resolved','dismissed')),
 handled_by integer REFERENCES users, handled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), CHECK(reporter_id<>target_id)
);
CREATE INDEX battle_reports_queue ON battle_reports(target_id,created_at DESC);
CREATE TABLE battle_blocks (user_id integer NOT NULL REFERENCES users,blocked_id integer NOT NULL REFERENCES users,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,blocked_id),CHECK(user_id<>blocked_id));
CREATE TABLE battle_suspensions (user_id integer PRIMARY KEY REFERENCES users,until timestamptz NOT NULL,reason text NOT NULL,created_by integer NOT NULL REFERENCES users);
CREATE TABLE battle_safety_events (id bigserial PRIMARY KEY,room_id uuid NOT NULL REFERENCES battle_rooms,kind text NOT NULL,actor_id integer REFERENCES users,at timestamptz NOT NULL,detail jsonb NOT NULL DEFAULT '{}');
CREATE INDEX battle_safety_events_expiry ON battle_safety_events(at);
ALTER TABLE attempts DROP CONSTRAINT attempts_source_check;
ALTER TABLE attempts ADD CONSTRAINT attempts_source_check CHECK(source IN('self_practice','teacher_assigned','retry','battle_retry'));
ALTER TABLE attempts ADD COLUMN battle_room_id uuid REFERENCES battle_rooms;
CREATE UNIQUE INDEX attempts_battle_retry_root ON attempts(student_id,battle_room_id) WHERE source='battle_retry' AND retry_of IS NULL;
