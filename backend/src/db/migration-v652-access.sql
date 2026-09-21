-- Additive preset support; retain all historical position rows.
ALTER TABLE staff_position_assignments DROP CONSTRAINT staff_position_assignments_type_check;
ALTER TABLE staff_position_assignments ADD CONSTRAINT staff_position_assignments_type_check
 CHECK(type IN('SUBJECT_TEACHER','HOMEROOM','DEPT_LEADER','GRADE_LEADER','BOARD','BOARD_PROFESSIONAL','VIEWER'));
ALTER TABLE bank_memberships DROP CONSTRAINT bank_memberships_permission_check;
ALTER TABLE bank_memberships ADD CONSTRAINT bank_memberships_permission_check CHECK(permission IN('read','write','review','manage'));
