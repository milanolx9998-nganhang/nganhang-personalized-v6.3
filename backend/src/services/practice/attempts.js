import {getEffectiveAccess,decide,bankDecision} from '../accessResolver.js';
import {normalizeContentScope,resolveContentScope,compileQuestionScopeSQL} from '../contentScopeV2.js';
import crypto from 'node:crypto';
import {canRevealAnswer,releaseContext} from './answerRelease.js';
import {studentQuestion,studentAttempt} from './studentDto.js';
import {scopedQuestionMedia} from './privateMedia.js';
import {yccdScope,yccdOptions} from './contentScope.js';
import {z} from 'zod';
import {pool,tx} from '../../db/pool.js';
import {fail,settings,log} from './config.js';
import {selectQuestions} from './selection.js';
import {normalizeQuestion,gradeQuestion,validateQuestion} from './grading.js';
import {recalculate,aggregate} from './mastery.js';
import {assignmentAccess,subjectAccess} from './authorization.js';
export const configSchema=z.object({content_scope_v2:z.unknown().optional(),subject_id:z.coerce.number().int().positive(),grade:z.coerce.number().int().min(1).max(12),topic_ids:z.array(z.coerce.number().int().positive()).max(100).default([]),selection_mode:z.enum(['topic','yccd']).default('topic'),yccd_keys:z.array(z.string().min(1).max(1500)).max(100).default([]),count:z.coerce.number().int().min(1).max(40),percent:z.array(z.number().min(0).max(100)).length(4),types:z.array(z.enum(['multiple_choice','true_false','short_answer','matching','essay'])).min(1).max(5),mode:z.enum(['practice','challenge']).default('practice')}).superRefine((c,ctx)=>{if(c.content_scope_v2){try{normalizeContentScope({...c.content_scope_v2,subject_id:c.subject_id,grade:c.grade});}catch(e){ctx.addIssue({code:'custom',message:e.message});}return;}if(c.selection_mode==='yccd'?!c.yccd_keys.length:!c.topic_ids.length)ctx.addIssue({code:'custom',message:c.selection_mode==='yccd'?'Tick ít nhất một YCCĐ':'Tick ít nhất một bài / chuyên đề'});}).transform(c=>({...c,content_scope_v2:normalizeContentScope(c.content_scope_v2?{...c.content_scope_v2,subject_id:c.subject_id,grade:c.grade}:c)}));
export async function candidates(client,user,config,{reader=user}={}){
 await subjectAccess(reader,config.subject_id,config.grade);
 const access=reader.role==='student'?null:await getEffectiveAccess(reader,client);
 const resolved=config.content_scope_v2?await resolveContentScope({...config.content_scope_v2,subject_id:config.subject_id,grade:config.grade},client):null;
 const scopeSQL=resolved?compileQuestionScopeSQL(resolved,'q',7):null;
 const result=await client.query(`SELECT v.*,q.active_metadata AS curriculum_snapshot,q.topic_id,q.yccd_id,q.outcome_id,q.branch_id,q.subject_id,q.grade,right(q.cognitive_level::text,1)::int AS cognitive_level,q.bank_id,b.kind,b.owner_id,n.node_type,n.name AS node_name,tv.name AS version_name,t.name AS topic_name,
 (SELECT max(a.completed_at) FROM attempt_items i JOIN attempts a ON a.id=i.attempt_id WHERE i.question_id=q.id AND a.student_id=$1 AND a.status='completed') AS last_seen
 FROM question_versions v JOIN question_selection_metadata q ON q.active_version_id=v.id JOIN banks b ON b.id=q.bank_id
 LEFT JOIN taxonomy_nodes n ON n.id=v.taxonomy_node_id LEFT JOIN taxonomy_versions tv ON tv.id=n.version_id LEFT JOIN topics t ON t.id=q.topic_id
 WHERE q.lifecycle<>'archived' AND NOT q.quarantined AND NOT EXISTS(SELECT 1 FROM question_review_cases rc WHERE rc.question_id=q.id AND rc.status IN('OPEN','IN_REVIEW') AND rc.reason_code IN('CURRICULUM_MISMATCH','YCCD_RETIRED','OUTCOME_RETIRED')) AND v.review_status='APPROVED' AND q.subject_id=$2 AND q.grade=$3 AND ($4::int[] IS NULL OR q.topic_id=ANY($4::int[]))
 AND (t.status='ACTIVE') AND (q.yccd_id IS NULL OR EXISTS(SELECT 1 FROM curriculum_yccds cy JOIN curriculum_outcomes co ON co.id=cy.outcome_id WHERE cy.id=q.yccd_id AND cy.status='ACTIVE' AND co.status='ACTIVE' AND EXISTS(SELECT 1 FROM topic_yccd_map tm WHERE tm.topic_id=q.topic_id AND tm.yccd_id=q.yccd_id AND tm.status='ACTIVE' AND (tm.valid_from IS NULL OR tm.valid_from<=CURRENT_DATE) AND (tm.valid_to IS NULL OR tm.valid_to>=CURRENT_DATE))))
 ${scopeSQL?'AND '+scopeSQL.sql:''}
 AND (${reader.role!=='student'?'TRUE OR ':''}b.kind='school' OR b.kind='department' AND b.department_id=$5 OR b.owner_id=$6 OR EXISTS(SELECT 1 FROM bank_memberships bm WHERE bm.bank_id=b.id AND bm.user_id=$6))`,[user.id,config.subject_id,config.grade,resolved||config.selection_mode==='yccd'?null:config.topic_ids,reader.department_id||null,reader.id,...(scopeSQL?.params||[])]);
 return result.rows.filter(v=>!access||decide(access,'content.read',{subjectId:v.subject_id,grade:v.grade,bankId:v.bank_id}).allowed&&bankDecision(access,'read',access.org.banks.find(b=>b.id===v.bank_id)).allowed).filter(v=>!validateQuestion(v).errors.length).filter(v=>resolved||config.selection_mode!=='yccd'||!config.yccd_keys?.length||(config.yccd_keys.includes(yccdScope(v)?.key)||(v.yccd_id&&config.yccd_keys.includes(JSON.stringify(['master',v.yccd_id])))));
}
export async function contentOptions(user,raw){const d=z.object({subject_id:z.coerce.number().int().positive(),grade:z.coerce.number().int().min(1).max(12)}).parse(raw);return {yccd:yccdOptions(await candidates(pool,user,{...d,selection_mode:'yccd'}))};}
export async function availability(user,raw){const config=configSchema.parse(raw);return selectQuestions(await candidates(pool,user,config),config,'preview');}
async function lockedAttempt(client,user,id){const a=(await client.query('SELECT * FROM attempts WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!a)fail('Không tìm thấy lượt luyện',404);if(a.student_id!==user.id)fail('Không có quyền với lượt luyện này',403);return a;}
export async function createAttempt(user,raw,{assignmentId=null,retryId=null}={}){
 if(user.role!=='student')fail('Chỉ học sinh tạo lượt luyện',403);
 return tx(async client=>{
  await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
  const cfg=await settings(client);let config;let fixed;let frozenCurriculum=null;let source='self_practice';let assignment;
  if(retryId){
   const previous=await lockedAttempt(client,user,retryId);if(previous.status!=='completed')fail('Lượt cũ chưa hoàn tất');
   assignmentId=previous.assignment_id;
   if(!canRevealAnswer(previous,{},await releaseContext(client,previous)))fail('Chưa công bố đáp án; chưa thể luyện lại theo câu sai',403);
   fixed=(await client.query("SELECT i.question_version_id FROM attempt_items i WHERE attempt_id=$1 AND (uncertain OR skipped OR (grade_result->>'score')::numeric<1)",[retryId])).rows.map(r=>r.question_version_id);
   if(!fixed.length)fail('Không có câu sai hoặc chưa chắc để luyện lại');
   frozenCurriculum=(await client.query('SELECT question_version_id AS id,curriculum_snapshot AS curriculum FROM attempt_items WHERE attempt_id=$1',[retryId])).rows;
   config={...previous.config,count:fixed.length};source='retry';
  }
  if(assignmentId){
   assignment=(await client.query('SELECT * FROM assignments WHERE id=$1 FOR SHARE',[assignmentId])).rows[0];await assignmentAccess(user,assignment,client);
   const now=Date.now();if(assignment.status!=='active'||assignment.opens_at&&now<new Date(assignment.opens_at))fail('Bài chưa mở');
   if(assignment.closes_at&&now>new Date(assignment.closes_at)&&!(retryId&&assignment.allow_after_deadline))fail('Đã hết hạn làm bài');
   const used=Number((await client.query('SELECT count(*) FROM attempts WHERE assignment_id=$1 AND student_id=$2',[assignmentId,user.id])).rows[0].count);
   if(assignment.max_attempts&&used>=assignment.max_attempts)fail('Đã hết số lượt được phép');
   if(!retryId){config=configSchema.parse(assignment.config);fixed=assignment.kind==='fixed'?assignment.fixed_versions:null;frozenCurriculum=assignment.curriculum_snapshot;source='teacher_assigned';}
  }
  if(!config){config=configSchema.parse(raw);if(config.count<cfg.practice_min_questions||config.count>cfg.practice_max_questions)fail(`Chọn ${cfg.practice_min_questions}–${cfg.practice_max_questions} câu`);}
  const seed=crypto.randomUUID();let items;
  if(fixed){items=(await client.query('SELECT * FROM question_versions WHERE id=ANY($1::uuid[])',[fixed])).rows.sort((a,b)=>fixed.indexOf(a.id)-fixed.indexOf(b.id)).map(q=>({...q,selection_reason:source==='retry'?'repeat':'assigned'}));if(items.length!==fixed.length)fail('Bản câu hỏi đã khóa không đầy đủ');}
  else {const reader=assignment?(await client.query('SELECT id,role,subject_id,department_id FROM users WHERE id=$1',[assignment.created_by])).rows[0]:user;const result=selectQuestions(await candidates(client,user,config,{reader}),config,seed);if(result.shortages.length)fail('Kho chưa đủ câu theo cấu hình. Hãy giảm số câu hoặc sửa tỉ lệ.',409,result.shortages);items=result.items;}
  const a=(await client.query('INSERT INTO attempts(student_id,assignment_id,retry_of,source,mode,config,seed) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[user.id,assignmentId,retryId,source,config.mode,JSON.stringify(config),seed])).rows[0];
  // PERF V6.6.7: một câu INSERT cho cả bài thay vì một câu mỗi câu hỏi (40 câu = 40 lượt đi-về DB khi cả lớp bấm "Bắt đầu").
  const rows=items.map((q,i)=>({v:q.id,q:q.question_id,s:i+1,r:q.selection_reason,c:fixed?(frozenCurriculum?.find(c=>c.id===q.id)?.curriculum||{historical_labels_unavailable:true,topic_id:q.topic_id,cognitive_level:'M'+q.cognitive_level}):(q.curriculum_snapshot??null)}));
  await client.query(`INSERT INTO attempt_items(attempt_id,question_version_id,question_id,sequence,selection_reason,curriculum_snapshot)
   SELECT $1,x.v,x.q,x.s,x.r,x.c FROM jsonb_to_recordset($2::jsonb) AS x(v uuid,q integer,s integer,r text,c jsonb) ORDER BY x.s`,[a.id,JSON.stringify(rows)]);
  return studentAttempt(a);
 });
}
export function publicQuestion(version,reveal){
 return studentQuestion(version,reveal);
}
export async function getAttempt(user,id){
 const a=(await pool.query('SELECT * FROM attempts WHERE id=$1',[id])).rows[0];if(!a)fail('Không tìm thấy lượt luyện',404);if(a.student_id!==user.id)fail('Chỉ được mở lượt luyện của mình',403);
 const rows=(await pool.query('SELECT i.*,v.content,COALESCE(right(i.curriculum_snapshot->>\'cognitive_level\',1)::int,v.cognitive_level) AS cognitive_level,COALESCE((i.curriculum_snapshot->>\'topic_id\')::int,v.topic_id) AS topic_id,v.subject_id,v.grade FROM attempt_items i JOIN question_versions v ON v.id=i.question_version_id WHERE i.attempt_id=$1 ORDER BY sequence',[id])).rows;
 const release=await releaseContext(pool,a);
 a.items=rows.map(i=>{const reveal=canRevealAnswer(a,i,release);return {id:i.id,sequence:i.sequence,response:i.response,is_flagged:i.is_flagged,curriculum_snapshot:i.curriculum_snapshot,uncertain:i.uncertain,skipped:i.skipped,is_final:i.is_final,question:scopedQuestionMedia(publicQuestion(i,reveal),a.id,i.id),result:reveal?i.grade_result:null};});
 if(a.status==='completed')a.mastery=(await pool.query('SELECT m.state,t.name AS topic_name FROM mastery_states m JOIN topics t ON t.id=m.topic_id WHERE student_id=$1 AND topic_id=ANY($2::int[]) ORDER BY topic_id,cognitive_level',[user.id,[...new Set(rows.map(i=>i.topic_id).filter(Boolean))]])).rows.map(r=>({...r.state,topic_name:r.topic_name}));
 return {...studentAttempt(a),items:a.items,mastery:a.mastery};
}
export async function saveResponse(user,attemptId,itemId,raw){
 const data=z.object({response:z.any().nullable(),uncertain:z.boolean().default(false),skipped:z.boolean().default(false),final:z.boolean().default(false)}).parse(raw);
 return tx(async client=>{
  const a=await lockedAttempt(client,user,attemptId);if(a.status!=='in_progress')fail('Lượt luyện đã kết thúc',409);
  const i=(await client.query('SELECT i.*,v.content,COALESCE(right(i.curriculum_snapshot->>\'cognitive_level\',1)::int,v.cognitive_level) AS cognitive_level,COALESCE((i.curriculum_snapshot->>\'topic_id\')::int,v.topic_id) AS topic_id FROM attempt_items i JOIN question_versions v ON v.id=i.question_version_id WHERE i.id=$1 AND i.attempt_id=$2 FOR UPDATE OF i',[itemId,attemptId])).rows[0];
  if(!i)fail('Không tìm thấy câu trong lượt luyện',404);if(i.is_final)fail('Đáp án đã chốt được giữ để ghi nhận kết quả lần đầu',409);
  const final=a.mode==='practice'&&data.final&&!data.skipped;const grade=final?gradeQuestion(i,data.response):null;
  await client.query('UPDATE attempt_items SET response=$1,uncertain=$2,skipped=$3,is_final=$4,first_response=$5,grade_result=$6,saved_at=now(),first_viewed_at=COALESCE(first_viewed_at,now()) WHERE id=$7',[JSON.stringify(data.response),data.uncertain,data.skipped,final,final?JSON.stringify(data.response):null,grade?JSON.stringify(grade):null,itemId]);
  const reveal=canRevealAnswer(a,{...i,is_final:final},await releaseContext(client,a));
  // is_final luôn trả về: Player cập nhật tại chỗ thay vì tải lại cả lượt làm bài sau khi chốt (PERF V6.6.7).
  return {saved:true,is_final:final,result:reveal?grade:null,question:reveal?scopedQuestionMedia(publicQuestion(i,true),a.id,i.id):null};
 });
}
export async function submitAttempt(user,id){
 return tx(async client=>{
  await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
  const a=await lockedAttempt(client,user,id);if(a.status==='completed')return studentAttempt(a);if(a.status!=='in_progress')fail('Lượt luyện không thể nộp');
  const items=(await client.query('SELECT i.*,v.content,COALESCE(right(i.curriculum_snapshot->>\'cognitive_level\',1)::int,v.cognitive_level) AS cognitive_level,COALESCE((i.curriculum_snapshot->>\'topic_id\')::int,v.topic_id) AS topic_id FROM attempt_items i JOIN question_versions v ON v.id=i.question_version_id WHERE attempt_id=$1 ORDER BY sequence',[id])).rows;
  const groups=new Map();let score=0,denominator=0;
  for(const i of items){const result=i.is_final?i.grade_result:gradeQuestion(i,i.response);const skipped=!i.is_final&&(i.skipped||i.response==null);if(skipped&&result.score!==null){result.score=0;result.isCorrect=false;}
   await client.query('UPDATE attempt_items SET grade_result=$1,is_final=true,first_response=CASE WHEN is_final THEN first_response ELSE response END,skipped=$2 WHERE id=$3',[JSON.stringify(result),skipped,i.id]);
   if(result.score===null)continue;score+=result.score;denominator++;if(!i.topic_id)continue;
   const key=`${i.topic_id}:${i.cognitive_level}`,g=groups.get(key)||{topic:i.topic_id,level:i.cognitive_level,score:0,ids:[]};g.score+=result.score;g.ids.push(i.question_id);groups.set(key,g);
  }
  const completed=(await client.query("UPDATE attempts SET status='completed',completed_at=now(),score=$1,denominator=$2,percentage=$3,duration_seconds=GREATEST(0,extract(epoch FROM now()-started_at)::int) WHERE id=$4 RETURNING *",[score,denominator,denominator?score/denominator*100:null,id])).rows[0];
  for(const g of groups.values())await client.query('INSERT INTO mastery_events(student_id,attempt_id,topic_id,cognitive_level,score,question_ids) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[user.id,id,g.topic,g.level,g.score/g.ids.length*100,g.ids]);
  await recalculate(client,user.id,await settings(client));await log(client,user,'SUBMIT_ATTEMPT',id,{score,denominator});return studentAttempt(completed);
 });
}
export async function dashboard(studentId,client=pool,subjects=null){
 const attempts=(await client.query("SELECT * FROM attempts WHERE student_id=$1 AND ($2::int[] IS NULL OR (config->>'subject_id')::int=ANY($2)) ORDER BY started_at DESC LIMIT 200",[studentId,subjects])).rows;
 const states=(await client.query('SELECT m.state,t.name AS topic_name,s.name AS subject_name,t.subject_id FROM mastery_states m JOIN topics t ON t.id=m.topic_id JOIN subjects s ON s.id=t.subject_id WHERE student_id=$1 AND ($2::int[] IS NULL OR t.subject_id=ANY($2))',[studentId,subjects])).rows.map(r=>({...r.state,topic_name:r.topic_name,subject_name:r.subject_name,subject_id:r.subject_id}));
 const totals=(await client.query("SELECT count(*) FILTER(WHERE a.status='completed')::int AS questions, count(DISTINCT i.question_id) FILTER(WHERE a.status='completed')::int AS unique_questions,count(*) FILTER(WHERE a.status='completed' AND NOT i.skipped)::int AS answered FROM attempt_items i JOIN attempts a ON a.id=i.attempt_id WHERE student_id=$1 AND ($2::int[] IS NULL OR (a.config->>\'subject_id\')::int=ANY($2))",[studentId,subjects])).rows[0];
 const activity=(await client.query("SELECT count(*) FILTER(WHERE status='completed')::int AS completed_attempts,COALESCE(sum(duration_seconds) FILTER(WHERE status='completed'),0)::int AS duration_seconds FROM attempts WHERE student_id=$1 AND ($2::int[] IS NULL OR (config->>'subject_id')::int=ANY($2))",[studentId,subjects])).rows[0];
 return {attempts,states,topics:aggregate(states),totals:{...totals,...activity}};
}
