-- V6.5: chỉ bổ sung; không chuyển/xóa câu hỏi, bài làm hay tài khoản.
ALTER TABLE users ADD COLUMN access_managed boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN access_version integer NOT NULL DEFAULT 0;
ALTER TABLE user_positions ADD COLUMN revoked_at timestamptz;
CREATE TABLE staff_position_assignments(
 id bigserial PRIMARY KEY,user_id integer NOT NULL REFERENCES users,
 type text NOT NULL CHECK(type IN('SUBJECT_TEACHER','HOMEROOM','DEPT_LEADER','GRADE_LEADER','BOARD','VIEWER')),
 scope_type text NOT NULL CHECK(scope_type IN('WHOLE_SCHOOL','SCHOOL_LEVEL','GRADE','DEPARTMENT','SUBJECT','CLASS','BANK','CUSTOM')),
 scope_payload jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(scope_payload)='object'),
 school_year_id integer REFERENCES school_years,
 valid_from date NOT NULL DEFAULT CURRENT_DATE,valid_to date,revoked_at timestamptz,
 created_by integer NOT NULL REFERENCES users,created_at timestamptz NOT NULL DEFAULT now(),
 reason text NOT NULL DEFAULT '',CHECK(valid_to IS NULL OR valid_to>=valid_from)
);
CREATE INDEX staff_position_user ON staff_position_assignments(user_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX staff_position_exact ON staff_position_assignments(user_id,type,scope_type,scope_payload,valid_from,COALESCE(valid_to,'infinity'::date)) WHERE revoked_at IS NULL;
CREATE TABLE user_capability_overrides(
 id bigserial PRIMARY KEY,user_id integer NOT NULL REFERENCES users,capability text NOT NULL,
 effect text NOT NULL CHECK(effect IN('ALLOW','DENY')),
 scope_type text NOT NULL CHECK(scope_type IN('WHOLE_SCHOOL','SCHOOL_LEVEL','GRADE','DEPARTMENT','SUBJECT','CLASS','BANK','CUSTOM')),
 scope_payload jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(scope_payload)='object'),
 reason text NOT NULL CHECK(length(trim(reason))>=3),
 valid_from date NOT NULL DEFAULT CURRENT_DATE,valid_to date,revoked_at timestamptz,
 created_by integer NOT NULL REFERENCES users,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(valid_to IS NULL OR valid_to>=valid_from)
);
CREATE INDEX user_override_active ON user_capability_overrides(user_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX user_override_exact ON user_capability_overrides(user_id,capability,effect,scope_type,scope_payload,valid_from,COALESCE(valid_to,'infinity'::date)) WHERE revoked_at IS NULL;
ALTER TABLE bank_memberships ADD COLUMN valid_from date;
ALTER TABLE bank_memberships ADD COLUMN valid_to date;
ALTER TABLE bank_memberships ADD COLUMN revoked_at timestamptz;
