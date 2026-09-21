import {can} from '../accessResolver.js';
import crypto from 'node:crypto';
import {studentAssignment} from './studentDto.js';
import {pool,tx} from '../../db/pool.js';
import {staff,classAccess,studentAccess,assignmentAccess,subjectAccess} from './authorization.js';
import {configSchema,candidates} from './attempts.js';
import {selectQuestions} from './selection.js';
import {fail,log} from './config.js';
import {z} from 'zod';
export const assignmentSchema=z.object({answer_release_policy:z.enum(['AFTER_SUBMIT','AFTER_DEADLINE','MANUAL_RELEASE','NEVER']).default('AFTER_SUBMIT'),title:z.string().min(1).max(300),instructions:z.string().max(10000).default(''),kind:z.enum(['fixed','dynamic']),config:configSchema,opens_at:z.string().datetime().nullable().default(null),closes_at:z.string().datetime().nullable().default(null),max_attempts:z.number().int().positive().nullable().default(null),allow_after_deadline:z.boolean().default(false),class_ids:z.array(z.number().int().positive()).default([]),student_ids:z.array(z.number().int().positive()).default([])});
export async function saveAssignment(user,raw,id=null){staff(user);const data=assignmentSchema.parse(raw);await subjectAccess(user,data.config.subject_id,data.config.grade);if(data.answer_release_policy==='AFTER_DEADLINE'&&!data.closes_at)fail('Công bố sau hạn cần có hạn nộp');if(!data.class_ids.length&&!data.student_ids.length)fail('Chọn lớp hoặc học sinh được giao');if(data.opens_at&&data.closes_at&&data.opens_at>=data.closes_at)fail('Hạn nộp phải sau ngày mở');return tx(async client=>{
 if(id){const old=(await client.query('SELECT * FROM assignments WHERE id=$1 FOR UPDATE',[id])).rows[0];await assignmentAccess(user,old,client,'assignment.manage');if((await client.query('SELECT 1 FROM attempts WHERE assignment_id=$1 LIMIT 1',[id])).rowCount)fail('Đã có lượt làm; hãy tạo bài giao mới để giữ lịch sử');}
 for(const classId of data.class_ids)await classAccess(user,classId,client,true,data.config.subject_id);for(const studentId of data.student_ids)if(!await can(user,'assignment.create',{studentId,subjectId:data.config.subject_id},client))fail('Học sinh / môn ngoài phạm vi giao bài',403);
 const selection=selectQuestions(await candidates(client,user,data.config),data.config,crypto.randomUUID());if(selection.shortages.length)fail('Kho chưa đủ câu cho bài giao',409,selection.shortages);
 const fixed=data.kind==='fixed'?selection.items.map(i=>i.id):[];
 let a;if(id){a=(await client.query('UPDATE assignments SET title=$1,instructions=$2,config=$3,kind=$4,fixed_versions=$5,opens_at=$6,closes_at=$7,max_attempts=$8,allow_after_deadline=$9 WHERE id=$10 RETURNING *',[data.title,data.instructions,JSON.stringify(data.config),data.kind,fixed,data.opens_at,data.closes_at,data.max_attempts,data.allow_after_deadline,id])).rows[0];await client.query('DELETE FROM assignment_targets WHERE assignment_id=$1',[id]);}
 else a=(await client.query('INSERT INTO assignments(created_by,title,instructions,config,kind,fixed_versions,share_token,opens_at,closes_at,max_attempts,allow_after_deadline) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[user.id,data.title,data.instructions,JSON.stringify(data.config),data.kind,fixed,crypto.randomBytes(24).toString('hex'),data.opens_at,data.closes_at,data.max_attempts,data.allow_after_deadline])).rows[0];
 await client.query('UPDATE assignments SET answer_release_policy=$1 WHERE id=$2',[data.answer_release_policy,a.id]);a.answer_release_policy=data.answer_release_policy;
 const snapshot=selection.items.map(i=>({id:i.id,curriculum:i.curriculum_snapshot}));
 await client.query('UPDATE assignments SET curriculum_snapshot=$1 WHERE id=$2',[JSON.stringify(snapshot),a.id]);
 for(const c of data.class_ids)await client.query('INSERT INTO assignment_targets(assignment_id,class_id) VALUES($1,$2)',[a.id,c]);for(const s of data.student_ids)await client.query('INSERT INTO assignment_targets(assignment_id,student_id) VALUES($1,$2)',[a.id,s]);await log(client,user,id?'ASSIGNMENT_UPDATE':'ASSIGNMENT_CREATE',a.id,{kind:a.kind});return a;
 });}
export async function listAssignments(user){
 if(user.role==='student')return (await pool.query('SELECT a.* FROM assignments a WHERE EXISTS(SELECT 1 FROM assignment_targets t WHERE t.assignment_id=a.id AND (t.student_id=$1 OR t.class_id IN(SELECT class_id FROM class_memberships WHERE student_id=$1 AND ended_at IS NULL AND valid_from<=CURRENT_DATE AND (valid_to IS NULL OR valid_to>=CURRENT_DATE)))) ORDER BY a.created_at DESC',[user.id])).rows.map(studentAssignment);
 const rows=(await pool.query('SELECT a.*,ARRAY(SELECT class_id FROM assignment_targets t WHERE t.assignment_id=a.id AND class_id IS NOT NULL) class_ids,ARRAY(SELECT student_id FROM assignment_targets t WHERE t.assignment_id=a.id AND student_id IS NOT NULL) student_ids FROM assignments a ORDER BY created_at DESC')).rows;
 const visible=[];for(const row of rows){try{await assignmentAccess(user,row);visible.push(row);}catch(e){if(e.status!==403)throw e;}}return visible;
}
