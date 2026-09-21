-- Vue chỉ đọc: tách học tập khỏi quyền sửa tài khoản và quyền nội dung.
CREATE VIEW learning_class_scopes AS
 SELECT teacher_id,class_id,subject_id FROM teacher_class_assignments
 UNION
 SELECT p.user_id,c.id,s.id FROM user_positions p CROSS JOIN classes c CROSS JOIN subjects s
 WHERE p.valid_from<=CURRENT_DATE AND (p.valid_to IS NULL OR p.valid_to>=CURRENT_DATE)
 AND (p.class_id IS NULL OR p.class_id=c.id)
 AND (p.grade IS NULL OR p.grade=c.grade)
 AND (p.school_year_id IS NULL OR p.school_year_id=c.school_year_id)
 AND (p.subject_id IS NULL OR p.subject_id=s.id)
 AND (p.department_id IS NULL OR p.department_id=s.department_id)
 AND (p.position<>'subject_teacher' OR p.class_id IS NOT NULL);
