import {can,canBank,classesFor,subjectsFor,getEffectiveAccess} from '../accessResolver.js';
import {pool} from '../../db/pool.js';
import {checkSubjectAccess} from '../../middleware/auth.js';
import {fail} from './config.js';
export function staff(user){if(user.role==='student'||user.capabilities&&!Object.entries(user.capabilities).some(([k,v])=>v&&/\.(write|create|manage|manage_basic|reset_password|review|approve|config)$/.test(k)))fail('Tài khoản không có quyền chỉnh sửa',403);}
export async function subjectAccess(user,id,grade=null){if(user.role==='student')return true;if(grade?!await can(user,'content.read',{subjectId:Number(id),grade:Number(grade)}):!await checkSubjectAccess(user,id))fail('Không có quyền với môn này',403);return true;}
export async function classAccess(user,classId,client=pool,write=false,subjectId=null){
 const capability=write?'assignment.create':'learning.read';
 const allowed=subjectId?await can(user,capability,{classId:Number(classId),subjectId:Number(subjectId)},client):(await classesFor(user,capability,client)).includes(Number(classId));
 if(!allowed)fail('Lớp / môn ngoài phạm vi được giao',403);return true;
}
export async function studentAccess(user,studentId,client=pool){
 if(user.role==='student'&&user.id===Number(studentId))return true;
 if(user.role==='student')fail('Chỉ được xem dữ liệu của mình',403);
 if(!await can(user,'student.read',{studentId:Number(studentId)},client)&&!(await subjectsFor(user,'learning.read',{studentId:Number(studentId)},client)).length)fail('Học sinh ngoài phạm vi được giao',403);return true;
}
export async function bankAccess(user,bankId,permission='read',client=pool){
 const a=await getEffectiveAccess(user,client);
 let bank=a.org.banks.find(b=>b.id===Number(bankId));
 if(!bank){bank=(await client.query('SELECT * FROM banks WHERE id=$1',[bankId])).rows[0];if(bank)a.org.banks.push(bank);}
 if(!bank)fail('Không tìm thấy kho',404);
 if(!(await canBank(user,permission,bankId,client)).allowed)fail('Không có quyền với kho này',403);return bank;
}
export async function assignmentAccess(user,assignment,client=pool,capability='assignment.read'){
 if(!assignment)fail('Không tìm thấy bài giao',404);
 if(user.role!=='student'){
  if(user.role==='admin')return true;
  const targets=(await client.query('SELECT class_id,student_id FROM assignment_targets WHERE assignment_id=$1',[assignment.id])).rows;
  if(!targets.length)fail('Bài giao không có phạm vi được phép',403);
  for(const target of targets)if(!await can(user,capability,{subjectId:Number(assignment.config.subject_id),...(target.class_id?{classId:target.class_id}:{studentId:target.student_id})},client))fail('Bài giao ngoài phạm vi được phép',403);
  return true;
 }
 const result=await client.query('SELECT 1 FROM assignment_targets t WHERE t.assignment_id=$1 AND (t.student_id=$2 OR t.class_id IN (SELECT class_id FROM class_memberships WHERE student_id=$2 AND ended_at IS NULL AND valid_from<=CURRENT_DATE AND (valid_to IS NULL OR valid_to>=CURRENT_DATE)))',[assignment.id,user.id]);
 if(!result.rowCount)fail('Bài này chưa được giao cho em',403);return true;
}
