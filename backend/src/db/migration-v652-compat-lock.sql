-- Remove only historical lock grants automatically manufactured by can_approve.
-- Explicit administrator-authored lock exceptions remain untouched.
WITH revoked AS (
 UPDATE user_capability_overrides SET revoked_at=now()
 WHERE capability='matrix.lock' AND position_assignment_id IS NOT NULL AND revoked_at IS NULL
 AND reason='Chuyển can_approve được quản trị xác nhận qua API tương thích'
 RETURNING *
), logged AS (
 INSERT INTO practice_audit(actor_id,action,entity_id,details)
 SELECT created_by,'CAPABILITY_OVERRIDE_REMOVED',user_id::text,jsonb_build_object('override_id',id,'reason','V6.5.2: duyệt không tự cấp khóa ma trận') FROM revoked RETURNING id
)
UPDATE users SET access_version=access_version+1 WHERE id IN(SELECT user_id FROM revoked);
