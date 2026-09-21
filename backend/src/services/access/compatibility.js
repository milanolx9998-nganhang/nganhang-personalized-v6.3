import {z} from 'zod';
import {pool,tx} from '../../db/pool.js';
import {getEffectiveAccess} from '../accessResolver.js';
import {validateScope} from './staff.js';
import {fail,log} from '../practice/config.js';
const positive=z.number().int().positive(),nullable=positive.nullable().default(null);
async function staff(client,id){const u=(await client.query("SELECT id,role FROM users WHERE id=$1 AND role<>'student' FOR UPDATE",[id])).rows[0];if(!u)fail('Chọn tài khoản nhân sự',400);return u;}
export async function addLegacyPosition(actor,raw){
 const d=z.object({user_id:positive,position:z.enum(['subject_teacher','homeroom','dept_leader','grade_leader','board']),class_id:nullable,subject_id:nullable,department_id:nullable,grade:z.number().int().min(1).max(12).nullable().default(null),school_year_id:nullable,can_approve:z.boolean().default(false),valid_from:z.string().date().optional(),valid_to:z.string().date().nullable().default(null)}).strict().parse(raw);
 return tx(async c=>{await staff(c,d.user_id);const a=await getEffectiveAccess(d.user_id,c),p={};
  for(const [src,dst] of Object.entries({class_id:'class_ids',subject_id:'subject_ids',department_id:'department_ids',grade:'grade_ids'}))if(d[src])p[dst]=[d[src]];
  const cls=a.org.classes.find(x=>x.id===d.class_id);if(d.school_year_id||cls)p.school_year_id=d.school_year_id||cls.school_year_id;
  if(d.position==='homeroom'&&(!d.class_id||d.subject_id||d.department_id||d.grade)||d.position==='subject_teacher'&&!d.subject_id||d.position==='dept_leader'&&!d.department_id||d.position==='grade_leader'&&(!d.grade||!d.school_year_id))fail('Phạm vi không khớp vị trí');
  validateScope('CUSTOM',p,a.org);if(d.valid_from&&d.valid_to&&d.valid_from>d.valid_to)fail('Khoảng ngày không hợp lệ');
  const row=(await c.query('INSERT INTO staff_position_assignments(user_id,type,scope_type,scope_payload,school_year_id,valid_from,valid_to,created_by,reason) VALUES($1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE),$7,$8,$9) RETURNING *',[d.user_id,d.position.toUpperCase(),'CUSTOM',p,p.school_year_id||null,d.valid_from||null,d.valid_to,actor.id,'Phân công qua API tương thích'])).rows[0];
  if(d.can_approve&&d.position==='board')for(const key of ['content.review','content.approve','matrix.review','matrix.approve'])await c.query("INSERT INTO user_capability_overrides(user_id,capability,effect,scope_type,scope_payload,reason,valid_from,valid_to,created_by,position_assignment_id) VALUES($1,$2,'ALLOW','CUSTOM',$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING",[d.user_id,key,p,'Chuyển can_approve được quản trị xác nhận qua API tương thích',row.valid_from,row.valid_to,actor.id,row.id]);
  await c.query('UPDATE users SET access_version=access_version+1 WHERE id=$1',[d.user_id]);await log(c,actor,'POSITION_ASSIGNED',d.user_id,{after:row,source:'COMPATIBILITY'});return {...d,id:'v65-'+row.id};
 });
}
export async function revokeLegacyPosition(actor,id){return tx(async c=>{
 const canonical=String(id).startsWith('v65-'),key=canonical?String(id).slice(4):String(id);if(!/^\d+$/.test(key))fail('Vị trí không hợp lệ');
 const table=canonical?'staff_position_assignments':'user_positions';const row=(await c.query(`UPDATE ${table} SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING *`,[key])).rows[0];if(!row)fail('Không tìm thấy vị trí',404);
 if(canonical)await c.query('UPDATE user_capability_overrides SET revoked_at=now() WHERE position_assignment_id=$1 AND revoked_at IS NULL',[key]);
 await c.query('UPDATE users SET access_version=access_version+1 WHERE id=$1',[row.user_id]);await log(c,actor,'POSITION_REVOKED',row.user_id,{before:row,source:'COMPATIBILITY'});return {ok:true};
});}
export async function listLegacyPositions(){
 const old=(await pool.query('SELECT p.*,u.full_name,c.name AS class_name,s.name AS subject_name,d.name AS department_name FROM user_positions p JOIN users u ON u.id=p.user_id LEFT JOIN classes c ON c.id=p.class_id LEFT JOIN subjects s ON s.id=p.subject_id LEFT JOIN departments d ON d.id=p.department_id WHERE p.revoked_at IS NULL ORDER BY p.id DESC')).rows;
 const current=(await pool.query('SELECT p.*,u.full_name FROM staff_position_assignments p JOIN users u ON u.id=p.user_id WHERE p.revoked_at IS NULL ORDER BY p.id DESC')).rows;
 return [...old,...current.map(p=>({...p,id:'v65-'+p.id,position:p.type.toLowerCase(),class_id:p.scope_payload.class_ids?.[0]||null,subject_id:p.scope_payload.subject_ids?.[0]||null,department_id:p.scope_payload.department_ids?.[0]||null,grade:p.scope_payload.grade_ids?.[0]||null}))];
}
export async function setLegacyTeaching(actor,raw,remove=false){
 const d=z.object({teacher_id:positive,class_id:positive,subject_id:positive}).strict().parse(raw);
 return tx(async c=>{const u=await staff(c,d.teacher_id),a=await getEffectiveAccess(d.teacher_id,c),cls=a.org.classes.find(x=>x.id===d.class_id);if(!cls||!a.org.subjects.some(s=>s.id===d.subject_id))fail('Lớp hoặc môn không tồn tại');
  const before=(await c.query("SELECT * FROM staff_position_assignments WHERE user_id=$1 AND (type='SUBJECT_TEACHER' OR (type='VIEWER' AND reason='Phân công môn × lớp qua API tương thích')) AND revoked_at IS NULL FOR UPDATE",[d.teacher_id])).rows;
  if(remove){await c.query('DELETE FROM teacher_class_assignments WHERE teacher_id=$1 AND class_id=$2 AND subject_id=$3',[d.teacher_id,d.class_id,d.subject_id]);
   for(const p of before)if(p.scope_payload.subject_ids?.includes(d.subject_id)&&p.scope_payload.class_ids?.includes(d.class_id)){
    await c.query('UPDATE staff_position_assignments SET revoked_at=now() WHERE id=$1',[p.id]);const payload={...p.scope_payload,class_ids:p.scope_payload.class_ids.filter(id=>id!==d.class_id)};if(!payload.class_ids.length){if(p.type==='VIEWER')continue;delete payload.class_ids;}
    await c.query('INSERT INTO staff_position_assignments(user_id,type,scope_type,scope_payload,school_year_id,valid_from,valid_to,created_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING',[d.teacher_id,p.type,p.scope_type,payload,p.school_year_id,p.valid_from,p.valid_to,actor.id,'Thu hồi lớp; giữ vị trí giảng dạy môn']);
   }
  }else{
   await c.query('INSERT INTO teacher_class_assignments(teacher_id,class_id,subject_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[d.teacher_id,d.class_id,d.subject_id]);
   if(!before.some(p=>p.scope_payload.subject_ids?.includes(d.subject_id)&&p.scope_payload.class_ids?.includes(d.class_id)))await c.query("INSERT INTO staff_position_assignments(user_id,type,scope_type,scope_payload,school_year_id,created_by,reason) VALUES($1,$2,'CUSTOM',$3,$4,$5,$6) ON CONFLICT DO NOTHING",[d.teacher_id,['board','viewer'].includes(u.role)&&!a.user.access_managed?'VIEWER':'SUBJECT_TEACHER',{subject_ids:[d.subject_id],class_ids:[d.class_id],school_year_id:cls.school_year_id},cls.school_year_id,actor.id,'Phân công môn × lớp qua API tương thích']);
  }
  await c.query('UPDATE users SET access_version=access_version+1 WHERE id=$1',[d.teacher_id]);await log(c,actor,remove?'TEACHING_REMOVED':'TEACHING_ADDED',d.teacher_id,{[remove?'before':'after']:d,source:'COMPATIBILITY'});return {ok:true};
 });
}
