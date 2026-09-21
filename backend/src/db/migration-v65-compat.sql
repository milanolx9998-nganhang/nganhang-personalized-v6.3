-- Liên kết ngoại lệ được chuyển từ can_approve cũ để thu hồi đúng nguồn.
ALTER TABLE user_capability_overrides ADD COLUMN position_assignment_id bigint REFERENCES staff_position_assignments(id);
