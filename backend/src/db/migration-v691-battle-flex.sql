-- Chỉ thêm: giữ nguyên PK/FK của battle_players và battle_answers cho người thật.
-- Máy có danh tính (room_id,bot_slot), không có tài khoản hoặc lịch sử cá nhân.
ALTER TABLE battle_rooms ADD COLUMN open_slots boolean NOT NULL DEFAULT false;
ALTER TABLE battle_rooms ADD COLUMN auto_match boolean NOT NULL DEFAULT false;
ALTER TABLE battle_rooms ADD COLUMN has_bots boolean NOT NULL DEFAULT false;
ALTER TABLE battle_rooms ADD COLUMN auto_start_at timestamptz;
ALTER TABLE battle_rooms ADD COLUMN match_meta jsonb NOT NULL DEFAULT '{}';
CREATE TABLE battle_bot_players (
 room_id uuid NOT NULL REFERENCES battle_rooms, bot_slot integer NOT NULL CHECK(bot_slot>0),
 display_name text NOT NULL DEFAULT 'Đối thủ máy', difficulty text NOT NULL CHECK(difficulty IN('easy','medium','hard')),
 joined_at timestamptz NOT NULL DEFAULT now(), left_at timestamptz,
 points numeric NOT NULL DEFAULT 0 CHECK(points>=0), correct integer NOT NULL DEFAULT 0 CHECK(correct>=0), rank integer,
 PRIMARY KEY(room_id,bot_slot)
);
CREATE TABLE battle_bot_answers (
 room_id uuid NOT NULL,idx integer NOT NULL,bot_slot integer NOT NULL,client_id uuid NOT NULL,
 response jsonb,score numeric NOT NULL CHECK(score BETWEEN 0 AND 1),ms integer NOT NULL CHECK(ms>=0),
 skipped boolean NOT NULL DEFAULT false,received_at timestamptz NOT NULL,schedule_version integer NOT NULL,
 PRIMARY KEY(room_id,idx,bot_slot),FOREIGN KEY(room_id,bot_slot) REFERENCES battle_bot_players,
 FOREIGN KEY(room_id,idx) REFERENCES battle_questions
);
CREATE TABLE battle_golden_hours (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),grade integer NOT NULL CHECK(grade BETWEEN 1 AND 12),
 subject_id integer REFERENCES subjects,starts_at timestamptz NOT NULL,minutes integer NOT NULL CHECK(minutes BETWEEN 10 AND 60),
 repeat_weekdays integer[],created_by integer NOT NULL REFERENCES users,active boolean NOT NULL DEFAULT true,
 CHECK(repeat_weekdays IS NULL OR cardinality(repeat_weekdays) BETWEEN 1 AND 7 AND repeat_weekdays <@ ARRAY[0,1,2,3,4,5,6])
);
-- Quyền giáo viên rõ ràng, giới hạn khối/môn; chỉ quản trị cấp/thu hồi.
CREATE TABLE battle_golden_hour_grants (
 user_id integer NOT NULL REFERENCES users,grade integer NOT NULL CHECK(grade BETWEEN 1 AND 12),
 subject_id integer NOT NULL REFERENCES subjects,PRIMARY KEY(user_id,grade,subject_id)
);
CREATE TABLE battle_golden_hour_grade_grants (
 user_id integer NOT NULL REFERENCES users,grade integer NOT NULL CHECK(grade BETWEEN 1 AND 12),PRIMARY KEY(user_id,grade)
);
CREATE INDEX battle_rooms_open_slots ON battle_rooms(grade,created_at) WHERE status='lobby' AND open_slots;
CREATE INDEX battle_golden_hours_active ON battle_golden_hours(grade,starts_at) WHERE active;
