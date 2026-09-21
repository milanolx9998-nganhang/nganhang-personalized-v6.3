import {subjectsFor} from '../accessResolver.js';
import {pool} from '../../db/pool.js';
import {classAccess,studentAccess} from './authorization.js';
import {fail} from './config.js';
import {replay} from './mastery.js';
import {settings} from './config.js';
export async function scopedSubjects(user,{classId=null,studentId=null}={}){
 if(classId)await classAccess(user,classId);if(studentId)await studentAccess(user,studentId);
 if(user.role==='admin'||user.role==='student'&&user.id===studentId)return null;
 return subjectsFor(user,'learning.read',{classId,studentId});
}
export async function classDashboard(user,classId,query={}){
 let subjects=await scopedSubjects(user,{classId});
 if(query.subject_id){const id=Number(query.subject_id);if(subjects&&!subjects.includes(id))fail('Môn ngoài phạm vi lớp được giao',403);subjects=[id];}
 const from=query.from||null,to=query.to||null,topic=Number(query.topic_id)||null,level=Number(query.level)||null;
 const roster=(await pool.query('SELECT u.id,u.full_name,p.student_code FROM class_memberships cm JOIN users u ON u.id=cm.student_id JOIN student_profiles p ON p.user_id=u.id WHERE cm.class_id=$1 AND cm.ended_at IS NULL AND cm.valid_from<=CURRENT_DATE AND (cm.valid_to IS NULL OR cm.valid_to>=CURRENT_DATE) ORDER BY u.full_name',[classId])).rows;
 const ids=roster.map(s=>s.id),cfg=await settings();
 const attempts=(await pool.query("SELECT * FROM attempts WHERE student_id=ANY($1::int[]) AND ($2::int[] IS NULL OR (config->>'subject_id')::int=ANY($2)) AND ($3::date IS NULL OR started_at >= $3::date) AND ($4::date IS NULL OR started_at < $4::date+1) ORDER BY started_at",[ids,subjects,from,to])).rows;
 const events=(await pool.query('SELECT e.* FROM mastery_events e JOIN topics t ON t.id=e.topic_id WHERE student_id=ANY($1::int[]) AND ($2::int[] IS NULL OR t.subject_id=ANY($2)) AND ($3::int IS NULL OR topic_id=$3) AND ($4::int IS NULL OR cognitive_level=$4) ORDER BY occurred_at,id',[ids,subjects,topic,level])).rows;
 const pending=(await pool.query(`SELECT cm.student_id,count(DISTINCT a.id)::int total FROM class_memberships cm JOIN assignment_targets t ON t.student_id=cm.student_id OR t.class_id=cm.class_id JOIN assignments a ON a.id=t.assignment_id WHERE cm.class_id=$1 AND cm.ended_at IS NULL AND cm.valid_from<=CURRENT_DATE AND (cm.valid_to IS NULL OR cm.valid_to>=CURRENT_DATE) AND a.status='active' AND (a.opens_at IS NULL OR a.opens_at<=now()) AND ($2::int[] IS NULL OR (a.config->>'subject_id')::int=ANY($2)) AND NOT EXISTS(SELECT 1 FROM attempts done WHERE done.assignment_id=a.id AND done.student_id=cm.student_id AND done.status='completed') GROUP BY cm.student_id`,[classId,subjects])).rows;
 const last=(await pool.query("SELECT student_id,max(completed_at) at FROM attempts WHERE student_id=ANY($1::int[]) AND status='completed' AND ($2::int[] IS NULL OR (config->>'subject_id')::int=ANY($2)) GROUP BY student_id",[ids,subjects])).rows;
 const students=roster.map(s=>{
  const all=events.filter(e=>e.student_id===s.id),states=replay(all,cfg),total=states.reduce((n,x)=>n+x.effective_question_count,0),own=attempts.filter(a=>a.student_id===s.id),completed=own.filter(a=>a.status==='completed');
  const mastery=total?states.reduce((n,x)=>n+x.mastery_score*x.effective_question_count,0)/total:null;
  const gains=states.map(x=>x.history.length>1?x.history.at(-1).mastery-x.history[0].mastery:null).filter(x=>x!==null);
  return {...s,inactive_7d:!last.find(a=>a.student_id===s.id)?.at||new Date(last.find(a=>a.student_id===s.id).at)<new Date(Date.now()-7*86400000),pending_assignments:pending.find(a=>a.student_id===s.id)?.total||0,completed_attempts:completed.length,last_practice:completed.at(-1)?.completed_at||null,mastery,confidence:states.some(x=>x.confidence==='LOW')?'LOW':states.length?states.every(x=>x.confidence==='HIGH')?'HIGH':'MEDIUM':null,declining_levels:states.filter(x=>x.confidence!=='LOW'&&x.trend==='DOWN').length,mastery_gain:gains.length?gains.reduce((a,b)=>a+b,0)/gains.length:null,low_levels:states.filter(x=>x.confidence!=='LOW'&&x.mastery_score<50).length,practiced_topics:new Set(states.map(x=>x.topic_id)).size};
 });
 return {students,subject_ids:subjects,summary:{total_students:students.length,inactive_7d:students.filter(s=>s.inactive_7d).length,reinforcement:students.filter(s=>s.low_levels>0).length,pending_assignments:students.filter(s=>s.pending_assignments>0).length,not_started:students.filter(s=>!s.completed_attempts).length,completed_attempts:attempts.filter(a=>a.status==='completed').length,low_confidence:students.filter(s=>s.confidence==='LOW').length,declining:students.filter(s=>s.declining_levels>0).length}};
}
