-- Previously ignored administrative overrides must not become active implicitly.
WITH revoked AS (
 UPDATE user_capability_overrides SET revoked_at=now()
 WHERE capability IN ('staff.manage','system.config') AND revoked_at IS NULL
 RETURNING *
), logged AS (
 INSERT INTO practice_audit(actor_id,action,entity_id,details)
 SELECT NULL,'CAPABILITY_LEGACY_REVOKED',user_id::text,
 jsonb_build_object('before',to_jsonb(revoked),'reason','V653 requires a new explicit Admin confirmation')
 FROM revoked RETURNING entity_id
)
UPDATE users SET access_version=access_version+1,token_version=token_version+1
WHERE id IN (SELECT entity_id::int FROM logged);

CREATE TABLE IF NOT EXISTS permission_templates (
 id bigserial PRIMARY KEY,
 name text NOT NULL CHECK(length(name) BETWEEN 3 AND 120),
 definition jsonb NOT NULL,
 created_by integer NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(name)
);
