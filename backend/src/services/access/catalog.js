// Danh mục hữu hạn: không nhận wildcard hoặc biểu thức quyền từ client.
const domains={
 student:['read','manage_basic','reset_password','transfer','disable'],
 learning:['read','read_attempt','read_all_subjects','read_subject'],
 content:['read','write','create_version','review','approve','export','export_answers','view_answer','download_source'],
 question_quality:['read'],coverage:['read'],
 assignment:['create','manage','read'],matrix:['read','create','review','approve','lock'],
 exam:['read','create','generate'],bank:['read','write','review','manage'],
 curriculum:['read','manage','manage_lessons','manage_standards','propose_mapping','publish','import','edit_draft','retire'],
 competency:['read','manage_framework','manage_mapping','view_student','enter_rubric','export'],
 analytics:['read','export'],staff:['read','manage'],class:['manage','manage_membership'],
 audit:['read'],security:['read'],system:['config']
};
export const CAPABILITIES=Object.freeze(Object.entries(domains).flatMap(([domain,actions])=>actions.map(a=>`${domain}.${a}`)));
// Infrastructure is deliberately absent from the application capability catalog.
export const NON_DELEGABLE=new Set(['root.secret.manage','root.database.manage','root.deployment.manage','root.system_admin.manage']);
export const SUPER_HIGH_RISK=new Set(['staff.manage','system.config','content.export','content.export_answers','content.download_source','student.transfer','student.disable','curriculum.publish','analytics.export','matrix.lock','matrix.approve','content.approve','competency.manage_framework','competency.export']);
export const HIGH_RISK=new Set(['content.approve','content.export','content.export_answers','content.download_source','matrix.approve','matrix.lock','curriculum.publish','staff.manage','system.config','student.reset_password','student.transfer','student.disable','bank.manage','analytics.export','competency.manage_framework','competency.export']);
export const SCHOOL_LEVELS=Object.freeze({THCS:[6,7,8,9],THPT:[10,11,12]});
export const POSITION_LABELS=Object.freeze({SUBJECT_TEACHER:'Giáo viên bộ môn',HOMEROOM:'Giáo viên chủ nhiệm',DEPT_LEADER:'Tổ trưởng chuyên môn',GRADE_LEADER:'Khối trưởng',BOARD:'BGH giám sát',BOARD_PROFESSIONAL:'BGH chuyên môn',VIEWER:'Người xem',ADMIN:'Quản trị hệ thống'});
const teaching=['competency.read','competency.view_student','competency.enter_rubric','student.read','learning.read','learning.read_attempt','learning.read_subject','content.read','content.write','content.create_version','content.view_answer','assignment.create','assignment.manage','assignment.read','matrix.read','matrix.create','exam.read','exam.create','exam.generate','bank.read','bank.write','curriculum.read','analytics.read'];
const learning=['competency.read','competency.view_student','student.read','learning.read','learning.read_attempt','learning.read_all_subjects','assignment.read','analytics.read'];
const read=['competency.read','competency.view_student','student.read','learning.read','learning.read_attempt','content.read','assignment.read','matrix.read','exam.read','bank.read','curriculum.read','analytics.read'];
export const PRESETS=Object.freeze({
 SUBJECT_TEACHER:teaching,
 HOMEROOM:[...learning,'student.manage_basic','student.reset_password'],
 DEPT_LEADER:['competency.read','competency.view_student','student.read','learning.read','learning.read_subject','learning.read_attempt','content.read','content.write','content.create_version','content.view_answer','content.review','content.approve','question_quality.read','coverage.read','matrix.read','matrix.create','matrix.review','matrix.approve','exam.read','exam.create','exam.generate','curriculum.read','curriculum.manage_lessons','curriculum.propose_mapping','curriculum.import','curriculum.edit_draft','analytics.read','bank.read','bank.write','bank.review'],
 GRADE_LEADER:learning,
 BOARD:[...read,'learning.read_all_subjects'],
 BOARD_PROFESSIONAL:[...read,'learning.read_all_subjects','content.view_answer','content.review','content.approve','matrix.review','matrix.approve','curriculum.manage_lessons','curriculum.propose_mapping','curriculum.import','curriculum.edit_draft','curriculum.publish'],
 VIEWER:read,
 ADMIN:CAPABILITIES
});
export const SCOPE_TYPES=['WHOLE_SCHOOL','SCHOOL_LEVEL','GRADE','DEPARTMENT','SUBJECT','CLASS','BANK','CUSTOM'];
export const BUNDLES=Object.freeze({
 READ_ONLY:read,
 AUTHOR:['content.read','content.write','content.create_version','content.view_answer','bank.read','bank.write'],
 AUTHOR_REVIEWER:['content.read','content.write','content.create_version','content.view_answer','content.review','bank.read','bank.write','bank.review'],
 PROFESSIONAL_MANAGER:PRESETS.DEPT_LEADER,
 FULL_SCOPE:CAPABILITIES.filter(k=>!NON_DELEGABLE.has(k))
});

