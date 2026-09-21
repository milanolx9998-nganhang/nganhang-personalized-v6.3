import {can} from '../accessResolver.js';
import {z} from 'zod';
import {pool} from '../../db/pool.js';
import {scopedSubjects} from './analytics.js';
import {aggregate} from './mastery.js';
import {publicQuestion} from './attempts.js';
import {canRevealAnswer,releaseContext} from './answerRelease.js';
import {scopedQuestionMedia} from './privateMedia.js';
import {fail} from './config.js';
import {historyQuery,cleanQuery,reviewCounts,learningSignals} from './portfolioRules.js';

export async function portfolioAccess(user,rawId){
 const id=z.coerce.number().int().positive().parse(rawId);
 const subjects=await scopedSubjects(user,{studentId:id});
 const student=(await pool.query("SELECT u.id,u.full_name,u.is_active,u.last_login,p.student_code FROM users u JOIN student_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.role='student'",[id])).rows[0];
 if(!student)fail('Không tìm thấy học sinh',404);
 return {id,subjects,student};
}
const allowed="a.student_id=$1 AND ($2::int[] IS NULL OR (a.config->>'subject_id')::int=ANY($2))";
// JSON null, blank strings and empty object responses are not answered questions.
export const answered=`CASE WHEN jsonb_typeof(i.response)='object' THEN EXISTS(SELECT 1 FROM jsonb_each(i.response) e WHERE e.key<>'unit' AND e.value NOT IN ('null'::jsonb,'""'::jsonb,'{}'::jsonb,'[]'::jsonb) AND btrim(e.value::text,'" '||chr(9)||chr(10)||chr(13))<>'') ELSE i.response IS NOT NULL AND btrim(i.response::text,'" '||chr(9)||chr(10)||chr(13)) NOT IN ('','null','{}','[]') END`;
const historySelect=`SELECT a.id,a.started_at,a.completed_at,a.status,a.source,a.mode,a.assignment_id,ass.title AS assignment_title,a.retry_of,
 (a.config->>'subject_id')::int AS subject_id,s.name AS subject_name,a.score,a.denominator,a.percentage,a.duration_seconds,
 details.question_count,details.answered_count,details.skipped_count,details.uncertain_count,details.topics,details.levels
 FROM attempts a LEFT JOIN subjects s ON s.id=(a.config->>'subject_id')::int LEFT JOIN assignments ass ON ass.id=a.assignment_id
 CROSS JOIN LATERAL (SELECT count(*)::int question_count,count(*) FILTER(WHERE ${answered})::int answered_count,count(*) FILTER(WHERE i.skipped)::int skipped_count,count(*) FILTER(WHERE i.uncertain)::int uncertain_count,
 COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id',COALESCE((i.curriculum_snapshot->>'topic_id')::int,v.topic_id),'name',CASE WHEN i.curriculum_snapshot->>'topic_name' IS NOT NULL THEN i.curriculum_snapshot->>'topic_name' ELSE 'Bài #'||v.topic_id::text||' (chưa có nhãn lịch sử)' END)) FILTER(WHERE COALESCE((i.curriculum_snapshot->>'topic_id')::int,v.topic_id) IS NOT NULL),'[]') topics,
 COALESCE(jsonb_agg(DISTINCT COALESCE(right(i.curriculum_snapshot->>'cognitive_level',1)::int,v.cognitive_level)),'[]') levels FROM attempt_items i JOIN question_versions v ON v.id=i.question_version_id LEFT JOIN topics t ON t.id=v.topic_id WHERE i.attempt_id=a.id) details`;
function filterSQL(scope,q){
 const params=[scope.id,scope.subjects],where=[allowed];
 const add=(sql,val)=>{params.push(val);where.push(sql.replaceAll('?',String(params.length)));};
 for(const [key,col] of Object.entries({subject_id:"(a.config->>'subject_id')::int",source:'a.source',status:'a.status',mode:'a.mode',assignment_id:'a.assignment_id'}))if(q[key]!=null)add(col+'=$?',q[key]);
 if(q.topic_id)add('EXISTS(SELECT 1 FROM attempt_items i JOIN question_versions v ON v.id=i.question_version_id WHERE i.attempt_id=a.id AND COALESCE((i.curriculum_snapshot->>\'topic_id\')::int,v.topic_id)=$?)',q.topic_id);
 if(q.from)add("a.started_at >= ($?::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')",q.from);
 if(q.to)add("a.started_at < (($?::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')",q.to);
 if(q.min_percentage!=null)add('a.percentage >= $?',q.min_percentage);if(q.max_percentage!=null)add('a.percentage <= $?',q.max_percentage);
 return {params,where:where.join(' AND ')};
}
export async function attemptHistory(user,id,raw={}){
 const scope=await portfolioAccess(user,id),q=historyQuery.parse(cleanQuery(raw)),f=filterSQL(scope,q);
 const total=Number((await pool.query('SELECT count(*) FROM attempts a WHERE '+f.where,f.params)).rows[0].count);
 const items=(await pool.query(historySelect+' WHERE '+f.where+` ORDER BY a.started_at DESC,a.id DESC LIMIT $${f.params.length+1} OFFSET $${f.params.length+2}`,[...f.params,q.limit,q.offset])).rows;
 return {items,total,limit:q.limit,offset:q.offset};
}
async function masteryRead(scope){
 const rows=(await pool.query('SELECT m.state,t.name AS topic_name,t.grade,t.subject_id,s.name AS subject_name FROM mastery_states m JOIN topics t ON t.id=m.topic_id JOIN subjects s ON s.id=t.subject_id WHERE m.student_id=$1 AND ($2::int[] IS NULL OR t.subject_id=ANY($2)) ORDER BY s.name,t.order_index,m.cognitive_level',[scope.id,scope.subjects])).rows;
 return rows.map(({state,...labels})=>{const {exposures,...safe}=state;return {...safe,...labels};});
}
export async function portfolioMastery(user,id){const scope=await portfolioAccess(user,id),states=await masteryRead(scope);return {states,topics:aggregate(states),semantics:'current_accumulated'};}
async function membershipRead(scope){return (await pool.query(`SELECT m.id,m.class_id,m.valid_from,m.valid_to,m.ended_at,c.name AS class_name,c.grade,y.name AS school_year,
 (m.ended_at IS NULL AND m.valid_from<=CURRENT_DATE AND (m.valid_to IS NULL OR m.valid_to>=CURRENT_DATE)) AS current
 FROM class_memberships m JOIN classes c ON c.id=m.class_id JOIN school_years y ON y.id=c.school_year_id WHERE m.student_id=$1 ORDER BY m.valid_from DESC,m.id DESC`,[scope.id])).rows;}
export async function portfolioClasses(user,id){return {memberships:await membershipRead(await portfolioAccess(user,id))};}
async function assignmentsRead(scope){return (await pool.query(`SELECT ass.id,ass.title,ass.opens_at,ass.closes_at,ass.status,u.full_name AS teacher_name,
 stats.attempts_used,stats.completed_attempts,stats.best_percentage,stats.latest_percentage,
 CASE WHEN stats.completed_attempts>0 THEN 'completed' WHEN ass.closes_at<now() THEN 'overdue' WHEN stats.in_progress>0 THEN 'in_progress' ELSE 'not_started' END AS learning_status
 FROM assignments ass JOIN users u ON u.id=ass.created_by CROSS JOIN LATERAL
 (SELECT count(*)::int attempts_used,count(*) FILTER(WHERE a.status='completed')::int completed_attempts,count(*) FILTER(WHERE a.status='in_progress')::int in_progress,
 max(a.percentage) FILTER(WHERE a.status='completed') best_percentage,(array_agg(a.percentage ORDER BY a.started_at DESC,a.id DESC) FILTER(WHERE a.status='completed'))[1] latest_percentage FROM attempts a WHERE a.assignment_id=ass.id AND a.student_id=$1) stats
 WHERE ($2::int[] IS NULL OR (ass.config->>'subject_id')::int=ANY($2)) AND
 (stats.attempts_used>0 OR EXISTS(SELECT 1 FROM assignment_targets t WHERE t.assignment_id=ass.id AND (t.student_id=$1 OR t.class_id IN(SELECT class_id FROM class_memberships WHERE student_id=$1 AND ended_at IS NULL AND valid_from<=CURRENT_DATE AND (valid_to IS NULL OR valid_to>=CURRENT_DATE))))) ORDER BY ass.created_at DESC,ass.id DESC`,[scope.id,scope.subjects])).rows;}
export async function portfolioAssignments(user,id){return {assignments:await assignmentsRead(await portfolioAccess(user,id))};}
export async function portfolioOverview(user,id){
 const scope=await portfolioAccess(user,id),params=[scope.id,scope.subjects];
 const summary=(await pool.query(`SELECT count(*)::int started_attempts,count(*) FILTER(WHERE a.status='completed')::int completed_attempts,
 count(DISTINCT (a.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) FILTER(WHERE a.status='completed')::int active_days,
 COALESCE(sum(a.duration_seconds) FILTER(WHERE a.status='completed'),0)::int duration_seconds,max(a.completed_at) last_practice,
 count(*) FILTER(WHERE source='self_practice')::int self_practice_attempts,count(*) FILTER(WHERE source='teacher_assigned')::int teacher_assigned_attempts,count(*) FILTER(WHERE source='retry')::int retry_attempts FROM attempts a WHERE ${allowed}`,params)).rows[0];
 const counts=(await pool.query(`SELECT count(*)::int questions_attempted,count(DISTINCT i.question_id)::int unique_questions,count(*) FILTER(WHERE ${answered})::int answered_questions FROM attempt_items i JOIN attempts a ON a.id=i.attempt_id WHERE ${allowed} AND a.status='completed'`,params)).rows[0];
 const recent=(await pool.query(historySelect+` WHERE ${allowed} ORDER BY a.started_at DESC,a.id DESC LIMIT 5`,params)).rows;
 const recentCompleted=(await pool.query(historySelect+` WHERE ${allowed} AND a.status='completed' ORDER BY a.completed_at DESC,a.id DESC LIMIT 5`,params)).rows;
 const unfinished=(await pool.query(historySelect+` WHERE ${allowed} AND a.status='in_progress' ORDER BY a.started_at DESC,a.id DESC LIMIT 3`,params)).rows;
 const states=await masteryRead(scope),memberships=await membershipRead(scope),assignments=await assignmentsRead(scope);
 const activeAssignments=assignments.filter(a=>a.status==='active'&&(!a.opens_at||new Date(a.opens_at)<=new Date()));
 const assignmentSummary={total:activeAssignments.length,completed:activeAssignments.filter(a=>a.completed_attempts>0).length,pending:activeAssignments.filter(a=>!a.completed_attempts).length,due_soon:activeAssignments.filter(a=>!a.completed_attempts&&a.closes_at&&new Date(a.closes_at)>=new Date()&&new Date(a.closes_at)<=new Date(Date.now()+7*86400000)).length};
 const activity=[...recent.map(a=>({kind:'attempt',at:a.completed_at||a.started_at,attempt:a})),...memberships.slice(0,3).map(m=>({kind:'class',at:m.ended_at||m.valid_from,membership:m}))].sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,8);
 return {student:scope.student,current_memberships:memberships.filter(m=>m.current),summary:{...summary,...counts},signals:learningSignals(states.map(({history,...s})=>s)),mastery_overview:aggregate(states).map(t=>({...t,levels:t.levels.map(({history,...s})=>s)})),recent_attempts:recent,recent_completed_attempts:recentCompleted,unfinished,assignment_summary:assignmentSummary,upcoming_assignments:activeAssignments.filter(a=>!a.completed_attempts).sort((a,b)=>(a.closes_at?new Date(a.closes_at).getTime():Infinity)-(b.closes_at?new Date(b.closes_at).getTime():Infinity)).slice(0,3),recent_activity:activity};
}
export async function attemptReview(user,id,rawAttempt){
 const scope=await portfolioAccess(user,id),attemptId=z.string().uuid().parse(rawAttempt);
 const a=(await pool.query(historySelect+` WHERE ${allowed} AND a.id=$3`,[scope.id,scope.subjects,attemptId])).rows[0];
 if(!a)fail('Không tìm thấy lượt luyện trong phạm vi được xem',404);
 if(user.role!=='student'&&!await can(user,'learning.read_attempt',{studentId:scope.id,subjectId:a.subject_id}))fail('Không có quyền xem chi tiết bài làm',403);
 const rows=(await pool.query('SELECT i.*,v.content,v.subject_id,v.topic_id,v.grade,v.cognitive_level,v.version_number,COALESCE(i.curriculum_snapshot->>\'topic_name\',\'Bài #\'||v.topic_id::text||\' (chưa có nhãn lịch sử)\') AS topic_name FROM attempt_items i JOIN question_versions v ON v.id=i.question_version_id LEFT JOIN topics t ON t.id=v.topic_id WHERE i.attempt_id=$1 ORDER BY i.sequence',[attemptId])).rows;
 // Conservative serialization: unfinished Challenge answers stay hidden for every viewer.
 const release=await releaseContext(pool,a);
 const items=rows.map(i=>{const reveal=canRevealAnswer(a,i,release);return {id:i.id,sequence:i.sequence,question_id:i.question_id,question_version_id:i.question_version_id,version_number:i.version_number,topic_name:i.topic_name,curriculum_snapshot:i.curriculum_snapshot,is_flagged:i.is_flagged,selection_reason:i.selection_reason,response:i.response,first_response:i.first_response,uncertain:i.uncertain,skipped:i.skipped,is_final:i.is_final,saved_at:i.saved_at,question:scopedQuestionMedia(publicQuestion(i,reveal),a.id,i.id),result:reveal?i.grade_result:null};});
 const parent=a.retry_of?(await pool.query(historySelect+` WHERE ${allowed} AND a.id=$3`,[scope.id,scope.subjects,a.retry_of])).rows[0]||null:null;
 return {...a,student:scope.student,items,summary:reviewCounts(items),retry_parent:parent,read_only:true};
}
