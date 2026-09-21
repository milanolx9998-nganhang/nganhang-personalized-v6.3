import {getEffectiveAccess,decide} from '../accessResolver.js';
import {pool} from '../../db/pool.js';
import {fail} from './config.js';
import {questionList} from './questions.js';

// Pair class/student with each allowed subject: never broaden a teacher's
// subject permission from one class to another class.
const scope=`WITH scope AS (
 SELECT DISTINCT cm.student_id,t.subject_id FROM class_memberships cm
 JOIN jsonb_to_recordset($1::jsonb) t(class_id int,subject_id int) ON t.class_id=cm.class_id
 WHERE NOT $2 AND cm.ended_at IS NULL AND cm.valid_from<=CURRENT_DATE AND (cm.valid_to IS NULL OR cm.valid_to>=CURRENT_DATE)
 UNION SELECT u.id,s.id FROM users u CROSS JOIN subjects s WHERE $2 AND u.role='student'
), visible AS (
 SELECT a.* FROM attempts a JOIN scope s ON s.student_id=a.student_id AND s.subject_id=(a.config->>'subject_id')::int
), mastery AS (
 SELECT m.student_id,m.state FROM mastery_states m JOIN topics t ON t.id=m.topic_id JOIN scope s ON s.student_id=m.student_id AND s.subject_id=t.subject_id
)`;
export async function workspaceOverview(user){
 if(user.role==='student')fail('Trang dành cho nhân sự',403);
 const a=await getEffectiveAccess(user),pairs=[];
 for(const c of a.org.classes)for(const s of a.org.subjects)if(decide(a,'learning.read',{classId:c.id,subjectId:s.id}).allowed)pairs.push({class_id:c.id,subject_id:s.id});
 const params=[JSON.stringify(pairs),user.role==='admin'];
 const summary=(await pool.query(scope+` SELECT
 (SELECT count(DISTINCT student_id)::int FROM scope) students,
 (SELECT count(DISTINCT s.student_id)::int FROM scope s WHERE NOT EXISTS(SELECT 1 FROM visible a WHERE a.student_id=s.student_id AND a.status='completed' AND a.completed_at>=now()-interval '7 days')) inactive_7d,
 (SELECT count(DISTINCT student_id)::int FROM mastery WHERE state->>'confidence' IN ('MEDIUM','HIGH') AND state->>'trend'='DOWN') declining,
 (SELECT count(DISTINCT student_id)::int FROM mastery WHERE state->>'confidence' IN ('MEDIUM','HIGH') AND (state->>'mastery_score')::numeric<50) reinforcement`,params)).rows[0];
 const recent=(await pool.query(scope+` SELECT a.id,a.student_id,u.full_name,s.name AS subject_name,a.completed_at,a.percentage FROM visible a JOIN users u ON u.id=a.student_id LEFT JOIN subjects s ON s.id=(a.config->>'subject_id')::int WHERE a.status='completed' ORDER BY a.completed_at DESC,a.id DESC LIMIT 5`,params)).rows;
 const due=(await pool.query(scope+` SELECT DISTINCT ass.id,ass.title,ass.closes_at FROM assignments ass JOIN assignment_targets target ON target.assignment_id=ass.id
 WHERE ass.status='active' AND (ass.opens_at IS NULL OR ass.opens_at<=now()) AND ass.closes_at BETWEEN now() AND now()+interval '7 days'
 AND EXISTS(SELECT 1 FROM scope s WHERE s.subject_id=(ass.config->>'subject_id')::int AND
 (target.student_id=s.student_id OR EXISTS(SELECT 1 FROM class_memberships cm WHERE cm.student_id=s.student_id AND cm.class_id=target.class_id AND cm.ended_at IS NULL AND cm.valid_from<=CURRENT_DATE AND (cm.valid_to IS NULL OR cm.valid_to>=CURRENT_DATE)))
 AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.assignment_id=ass.id AND a.student_id=s.student_id AND a.status='completed'))
 ORDER BY ass.closes_at,ass.id`,params)).rows;
 const pending=await questionList(user,{lifecycle:'pending_review',limit:1});
 return {summary:{...summary,assignments_due:due.length,questions_pending:pending[0]?.total||0},due:due.slice(0,5),recent,scope:'explicit_class_subject'};
}
