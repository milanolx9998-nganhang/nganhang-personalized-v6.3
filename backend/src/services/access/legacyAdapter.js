// Cầu nối chỉ đọc. Sau khi admin lưu hồ sơ chuẩn hóa, metadata cũ không cấp lại quyền.
import {PRESETS} from './catalog.js';
export function legacyGrants(user,positions,teaching,org){
 if(user.access_managed||user.role==='student')return [];
 const grants=[],add=(type,scope_payload,id,extra={})=>grants.push({type,scope_type:'CUSTOM',scope_payload,id,source:'LEGACY',...extra});
 for(const p of positions){
  if(p.revoked_at)continue;
  const scope={};
  for(const [k,dst] of Object.entries({class_id:'class_ids',subject_id:'subject_ids',department_id:'department_ids',grade:'grade_ids'}))if(p[k])scope[dst]=[p[k]];
  const cls=org.classes.find(c=>c.id===p.class_id);if(p.school_year_id||cls)scope.school_year_id=p.school_year_id||cls.school_year_id;
  add(p.position.toUpperCase(),scope,'position:'+p.id,{valid_from:p.valid_from,valid_to:p.valid_to});
  if(p.position==='board'&&p.can_approve)add('BOARD_PROFESSIONAL',scope,'board-approval:'+p.id,{valid_from:p.valid_from,valid_to:p.valid_to,capabilities:['content.review','content.approve','matrix.review','matrix.approve']});
 }
 for(const t of teaching){const cls=org.classes.find(c=>c.id===t.class_id);add('SUBJECT_TEACHER',{subject_ids:[t.subject_id],class_ids:[t.class_id],...(cls?{school_year_id:cls.school_year_id}:{})},'teaching:'+t.class_id+':'+t.subject_id,['board','viewer'].includes(user.role)?{capabilities:PRESETS.SUBJECT_TEACHER.filter(k=>/\.(read|read_attempt|read_subject)$/.test(k))}:{});}
 if(user.subject_id)add(['viewer','board'].includes(user.role)?'VIEWER':'SUBJECT_TEACHER',{subject_ids:[user.subject_id]},'legacy-subject');
 if(user.role==='dept_leader'&&user.department_id)add('DEPT_LEADER',{department_ids:[user.department_id]},'legacy-department',{capabilities:PRESETS.DEPT_LEADER.filter(k=>! /^(student|learning|assignment|analytics)\./.test(k))});
 // Preserve legacy department bank read/write policy, not a permission on its content subjects.
 if(user.department_id)add('VIEWER',{department_ids:[user.department_id]},'legacy-bank',{capabilities:['bank.read',...(['dept_leader','grade_leader'].includes(user.role)?['bank.write','bank.review']:[])]});
 return grants;
}
