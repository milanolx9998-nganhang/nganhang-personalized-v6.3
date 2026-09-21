import {z} from 'zod';
import {pool,tx} from '../../db/pool.js';
import {can,canBank} from '../accessResolver.js';
import {fail,log} from '../practice/config.js';
import {portfolioAccess,answered} from '../practice/portfolio.js';
import {canRevealAnswer} from '../practice/answerRelease.js';
import {candidates} from '../practice/attempts.js';
import {projectAxis,habitMetrics,subjectTemplates,EVIDENCE_TYPES} from './rules.js';
const integer=z.coerce.number().int().positive(),text=z.string().trim().min(1).max(1000);
async function permit(actor,capability,subject,grade,c=pool){if(!await can(actor,capability,{subjectId:subject,grade},c))fail('Không có quyền năng lực trong môn/khối này',403);}
async function framework(c,id,lock=false){const f=(await c.query('SELECT * FROM competency_frameworks WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];if(!f)fail('Không tìm thấy khung năng lực',404);return f;}
async function permitFramework(actor,f,c=pool){for(let g=f.grade_from;g<=f.grade_to;g++)await permit(actor,'competency.manage_framework',f.subject_id,g,c);}
function requireDraft(f){if(f.status!=='DRAFT')fail('Khung đã công bố: sao chép sang phiên bản nháp trước khi sửa',409);}
export async function frameworks(actor){
 const rows=(await pool.query('SELECT f.*,s.name AS subject_name FROM competency_frameworks f JOIN subjects s ON s.id=f.subject_id ORDER BY f.id DESC')).rows,result=[];
 for(const f of rows){let ok=false;for(let g=f.grade_from;g<=f.grade_to&&!ok;g++)ok=await can(actor,'competency.read',{subjectId:f.subject_id,grade:g})||await can(actor,'competency.manage_framework',{subjectId:f.subject_id,grade:g});if(ok)result.push({...f,axes:(await pool.query('SELECT * FROM competency_axes WHERE framework_id=$1 ORDER BY order_index,id',[f.id])).rows});}
 return {frameworks:result,templates:subjectTemplates,evidence_types:EVIDENCE_TYPES};
}
export async function createFramework(actor,raw){
 const d=z.object({subject_id:integer,grade_from:integer.max(12),grade_to:integer.max(12),code:text,title:text,source:text,version:text,template:z.enum(['KHTN','MATH']).optional()}).strict().parse(raw);
 if(d.grade_to<d.grade_from)fail('Khoảng khối không hợp lệ');
 return tx(async c=>{await permitFramework(actor,d,c);const f=(await c.query('INSERT INTO competency_frameworks(subject_id,grade_from,grade_to,code,title,source,version,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[d.subject_id,d.grade_from,d.grade_to,d.code,d.title,d.source,d.version,actor.id])).rows[0];
 if(d.template)for(const [i,[code,name,auto]]of subjectTemplates[d.template].axes.entries())await c.query('INSERT INTO competency_axes(framework_id,code,name,order_index,allowed_evidence) VALUES($1,$2,$3,$4,$5)',[f.id,code,name,i,['MANUAL_GRADED_ITEM','PRACTICAL_TASK','PROJECT','TEACHER_RUBRIC','PRESENTATION',...(auto?['AUTO_GRADED_ITEM']:[])]]);
 await log(c,actor,'COMPETENCY_FRAMEWORK_CREATED',f.id,{after:d,source:'Mẫu do Master Prompt cung cấp; chưa công bố'});return f;});
}
export async function saveAxis(actor,id,raw){
 const d=z.object({id:integer.optional(),revision:integer,code:text,name:text,description:z.string().max(5000).default(''),order_index:z.number().int().min(0).default(0),allowed_evidence:z.array(z.enum(EVIDENCE_TYPES)).min(1),status:z.enum(['ACTIVE','RETIRED']).default('ACTIVE'),reason:text}).strict().parse(raw);
 return tx(async c=>{const f=await framework(c,id,true);await permitFramework(actor,f,c);requireDraft(f);if(f.revision!==d.revision)fail('Khung đã thay đổi; tải lại',409);
 const old=d.id?(await c.query('SELECT * FROM competency_axes WHERE id=$1 AND framework_id=$2',[d.id,id])).rows[0]:null;if(d.id&&!old)fail('Trục không thuộc khung',404);
 const params=[d.code,d.name,d.description,d.order_index,d.allowed_evidence,d.status,d.id||id];
 const row=(await c.query(d.id?'UPDATE competency_axes SET code=$1,name=$2,description=$3,order_index=$4,allowed_evidence=$5,status=$6 WHERE id=$7 RETURNING *':'INSERT INTO competency_axes(code,name,description,order_index,allowed_evidence,status,framework_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',params)).rows[0];
 await c.query('UPDATE competency_frameworks SET revision=revision+1 WHERE id=$1',[id]);await log(c,actor,'COMPETENCY_AXIS_SAVED',row.id,{before:old,after:row,reason:d.reason});return row;});
}
export async function publishFramework(actor,id,raw){
 const d=z.object({revision:integer,confirmed:z.literal(true),reason:text}).strict().parse(raw);
 return tx(async c=>{const f=await framework(c,id,true);await permitFramework(actor,f,c);requireDraft(f);if(f.revision!==d.revision)fail('Khung đã thay đổi',409);
 const axes=(await c.query("SELECT * FROM competency_axes WHERE framework_id=$1 AND status='ACTIVE' ORDER BY order_index,id",[id])).rows;if(!axes.length)fail('Cần ít nhất một trục');
 await c.query("UPDATE competency_frameworks SET status='PUBLISHED',revision=revision+1,published_at=now() WHERE id=$1",[id]);await c.query('INSERT INTO competency_framework_versions(framework_id,snapshot,created_by) VALUES($1,$2,$3)',[id,{framework:f,axes},actor.id]);await log(c,actor,'COMPETENCY_FRAMEWORK_PUBLISHED',id,{before:f,after:{axes},reason:d.reason});return {ok:true};});
}
export async function copyFramework(actor,id,raw){
 const d=z.object({version:text,title:text}).strict().parse(raw);
 return tx(async c=>{const f=await framework(c,id,true);await permitFramework(actor,f,c);const n=(await c.query('INSERT INTO competency_frameworks(subject_id,grade_from,grade_to,code,title,source,version,based_on,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[f.subject_id,f.grade_from,f.grade_to,f.code,d.title,f.source,d.version,id,actor.id])).rows[0];
 await c.query('INSERT INTO competency_axes(framework_id,code,name,description,order_index,allowed_evidence,status) SELECT $1,code,name,description,order_index,allowed_evidence,status FROM competency_axes WHERE framework_id=$2',[n.id,id]);await log(c,actor,'COMPETENCY_FRAMEWORK_COPIED',n.id,{source:id});return n;});
}
async function target(c,type,id){
 let result;
 if(type==='yccd')result=(await c.query('SELECT y.id,y.status,o.subject_id,o.grade FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id WHERE y.id=$1',[id])).rows[0];
 else if(type==='outcome')result=(await c.query('SELECT * FROM curriculum_outcomes WHERE id=$1',[id])).rows[0];
 else if(type==='question')result=(await c.query('SELECT v.*,q.bank_id FROM question_versions v JOIN questions q ON q.id=v.question_id WHERE v.id=$1',[id])).rows[0];
 if(!result)fail('Không tìm thấy đối tượng mapping',404);return result;
}
export async function setMapping(actor,type,id,raw){
 if(!['yccd','outcome','question'].includes(type))fail('Loại mapping không hợp lệ');
 const d=z.object({entries:z.array(z.object({axis_id:integer,weight:z.number().positive().max(1)}).strict()).max(30),normalize:z.boolean().default(true),confirmed:z.literal(true),reason:text}).strict().parse(raw);
 return tx(async c=>{const t=await target(c,type,id);await permit(actor,'competency.manage_mapping',t.subject_id,t.grade,c);if(type==='question'&&(!(await canBank(actor,'write',t.bank_id,c)).allowed||!await can(actor,'content.write',{subjectId:t.subject_id,grade:t.grade},c)))fail('Không được sửa mapping câu hỏi ngoài kho/phạm vi',403);
 if(new Set(d.entries.map(e=>e.axis_id)).size!==d.entries.length)fail('Trục không được lặp');
 const entries=[];for(const e of d.entries){const a=(await c.query("SELECT a.*,f.subject_id,f.grade_from,f.grade_to FROM competency_axes a JOIN competency_frameworks f ON f.id=a.framework_id WHERE a.id=$1 AND a.status='ACTIVE' AND f.status='PUBLISHED'",[e.axis_id])).rows[0];if(!a||a.subject_id!==t.subject_id||t.grade<a.grade_from||t.grade>a.grade_to)fail('Trục chưa công bố hoặc khác môn/khối');entries.push({...e,allowed_evidence:a.allowed_evidence,framework_id:a.framework_id,code:a.code,name:a.name});}
 const sum=entries.reduce((n,e)=>n+e.weight,0);if(d.normalize)entries.forEach(e=>{e.weight/=sum;});
 const row=(await c.query('INSERT INTO competency_mapping_versions(subject_id,grade,target_type,target_id,entries,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[t.subject_id,t.grade,type,String(id),JSON.stringify(entries),d.reason,actor.id])).rows[0];await log(c,actor,'COMPETENCY_MAPPING_VERSION',row.id,{after:row,reason:d.reason});return row;});
}
export async function mappingCatalog(actor,subject,grade){
 await permit(actor,'competency.manage_mapping',subject,grade);
 return {outcomes:(await pool.query('SELECT id,code,title,status FROM curriculum_outcomes WHERE subject_id=$1 AND grade=$2 ORDER BY id',[subject,grade])).rows,yccds:(await pool.query('SELECT y.id,y.code,y.text,y.status FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id WHERE o.subject_id=$1 AND o.grade=$2 ORDER BY y.id',[subject,grade])).rows,mappings:(await pool.query('SELECT DISTINCT ON(target_type,target_id) * FROM competency_mapping_versions WHERE subject_id=$1 AND grade=$2 ORDER BY target_type,target_id,id DESC',[subject,grade])).rows};
}
export async function studentScope(actor,id,subject,grade){
 id=integer.parse(id);subject=integer.parse(subject);grade=integer.max(12).parse(grade);
 const scope=await portfolioAccess(actor,id);if(scope.subjects&&!scope.subjects.includes(subject))fail('Môn ngoài phạm vi học sinh được giao',403);
 if(actor.role!=='student'&&!await can(actor,'competency.view_student',{studentId:id,subjectId:subject,grade}))fail('Không có quyền xem năng lực học sinh',403);
 if(actor.role==='student'&&actor.id!==id)fail('Chỉ xem hồ sơ của mình',403);
 const membership=(await pool.query('SELECT 1 FROM class_memberships m JOIN classes c ON c.id=m.class_id WHERE m.student_id=$1 AND c.grade=$2',[id,grade])).rowCount;
 if(!membership)fail('Khối không thuộc hồ sơ học sinh',403);return {id,subject,grade};
}
export async function config(){return (await pool.query('SELECT config FROM competency_product_config WHERE id=true')).rows[0].config;}
export async function profile(actor,id,raw){
 const q=z.object({subject_id:integer,grade:integer.max(12),at:z.string().datetime().optional()}).strict().parse(raw),scope=await studentScope(actor,id,q.subject_id,q.grade),now=q.at?new Date(q.at):new Date();if(now>Date.now())fail('Không xem mốc tương lai');
 const frames=(await pool.query("SELECT * FROM competency_frameworks WHERE subject_id=$1 AND grade_from<=$2 AND grade_to>=$2 AND status='PUBLISHED' AND published_at<=$3 ORDER BY published_at DESC,id DESC",[scope.subject,scope.grade,now])).rows;
 const f=frames[0],axes=f?(await pool.query("SELECT * FROM competency_axes WHERE framework_id=$1 AND status='ACTIVE' ORDER BY order_index,id",[f.id])).rows:[],evidence=[];
 const rows=(await pool.query(`SELECT i.id,i.question_version_id,i.competency_snapshot,i.curriculum_snapshot,i.grade_result,i.is_final,a.id attempt_id,a.assignment_id,a.mode,a.status,a.completed_at,ass.answer_release_policy,ass.closes_at,ass.answers_released_at FROM attempt_items i JOIN attempts a ON a.id=i.attempt_id LEFT JOIN assignments ass ON ass.id=a.assignment_id WHERE a.student_id=$1 AND (a.config->>'subject_id')::int=$2 AND (a.config->>'grade')::int=$3 AND a.status='completed' AND a.completed_at<=$4 ORDER BY a.completed_at,i.id`,[scope.id,scope.subject,scope.grade,now])).rows;
 for(const row of rows){if(!canRevealAnswer(row,row,row,now.getTime())||typeof row.grade_result?.score!=='number')continue;for(const e of row.competency_snapshot?.entries||[])evidence.push({axis_id:e.axis_id,evidence_ref:'item:'+row.id,evidence_type:'AUTO_GRADED_ITEM',performance:row.grade_result.score,mapping_weight:e.weight,allowed_evidence:e.allowed_evidence,occurred_at:row.completed_at,yccd_id:row.curriculum_snapshot?.yccd_id,attempt_id:row.attempt_id,question_version_id:row.question_version_id,mapping_id:row.competency_snapshot.mapping_id});}
 const rubrics=(await pool.query('SELECT * FROM competency_rubric_evidence WHERE student_id=$1 AND subject_id=$2 AND occurred_at<=$3',[scope.id,scope.subject,now])).rows;for(const r of rubrics)evidence.push({axis_id:r.axis_id,evidence_ref:'rubric:'+r.id,evidence_type:r.evidence_type,performance:Number(r.performance),mapping_weight:1,occurred_at:r.occurred_at,activity:r.activity,notes:r.notes});
 const cfg=await config();return {framework:f||null,as_of:now.toISOString(),axes:axes.map(a=>projectAxis(a,evidence,cfg,now)),unmapped_items:rows.filter(r=>!r.competency_snapshot?.entries?.length).length,semantics:'Minh chứng đúng snapshot khi bắt đầu lượt học; dữ liệu cũ chưa có mapping không tự suy ngược. Điểm mô tả sản phẩm, không phải xếp loại CTGDPT.'};
}
export async function habits(actor,id,raw){
 const q=z.object({subject_id:integer,grade:integer.max(12),days:z.coerce.number().int().min(7).max(180).default(30)}).strict().parse(raw),s=await studentScope(actor,id,q.subject_id,q.grade);
 const rows=(await pool.query(`SELECT a.*,x.question_count,x.answered_count,x.corrected_count FROM attempts a CROSS JOIN LATERAL(SELECT count(*)::int question_count,count(*) FILTER(WHERE ${answered})::int answered_count,count(*) FILTER(WHERE (i.grade_result->>'score')::numeric=1 AND EXISTS(SELECT 1 FROM attempt_items old WHERE old.attempt_id=a.retry_of AND old.question_id=i.question_id AND (old.grade_result->>'score')::numeric<1))::int corrected_count FROM attempt_items i WHERE i.attempt_id=a.id) x WHERE a.student_id=$1 AND (a.config->>'subject_id')::int=$2 AND (a.config->>'grade')::int=$3 AND a.started_at>=now()-interval '180 days'`,[s.id,s.subject,s.grade])).rows;
 // A correction count must not reveal either a hidden retry score or its hidden source score.
 for(const row of rows.filter(r=>r.corrected_count>0)){
  const attempts=[row];
  if(row.retry_of){const prior=(await pool.query('SELECT * FROM attempts WHERE id=$1 AND student_id=$2',[row.retry_of,s.id])).rows[0];if(!prior){row.corrected_count=0;continue;}attempts.push(prior);}
  for(const attempt of attempts){const assignment=attempt.assignment_id?(await pool.query('SELECT answer_release_policy,closes_at,answers_released_at FROM assignments WHERE id=$1',[attempt.assignment_id])).rows[0]:null;if(!canRevealAnswer(attempt,{},assignment)){row.corrected_count=0;break;}}
 }
 return habitMetrics(rows,await config(),new Date(),q.days);
}
export async function enterRubric(actor,raw){
 const d=z.object({student_id:integer,subject_id:integer,grade:integer.max(12),axis_id:integer,evidence_type:z.enum(['MANUAL_GRADED_ITEM','PRACTICAL_TASK','PROJECT','TEACHER_RUBRIC','PRESENTATION']),activity:text,performance:z.number().min(0).max(1),notes:z.string().max(3000).default(''),occurred_at:z.string().datetime(),reason:text}).strict().parse(raw);
 await studentScope(actor,d.student_id,d.subject_id,d.grade);if(actor.role==='student'||!await can(actor,'competency.enter_rubric',{studentId:d.student_id,subjectId:d.subject_id,grade:d.grade}))fail('Không có quyền ghi minh chứng',403);
 if(new Date(d.occurred_at)>new Date())fail('Minh chứng không được ở tương lai');
 return tx(async c=>{const a=(await c.query("SELECT a.*,f.subject_id,f.grade_from,f.grade_to FROM competency_axes a JOIN competency_frameworks f ON f.id=a.framework_id WHERE a.id=$1 AND a.status='ACTIVE' AND f.status='PUBLISHED'",[d.axis_id])).rows[0];if(!a||a.subject_id!==d.subject_id||d.grade<a.grade_from||d.grade>a.grade_to||!a.allowed_evidence.includes(d.evidence_type))fail('Minh chứng không phù hợp trục/môn/khối');
 const r=(await c.query('INSERT INTO competency_rubric_evidence(student_id,subject_id,axis_id,evidence_type,activity,performance,notes,occurred_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[d.student_id,d.subject_id,d.axis_id,d.evidence_type,d.activity,d.performance,d.notes,d.occurred_at,actor.id])).rows[0];await log(c,actor,'COMPETENCY_RUBRIC_ENTERED',r.id,{after:d});return r;});
}
export async function knowledge(actor,id,raw){
 const q=z.object({subject_id:integer,grade:integer.max(12)}).strict().parse(raw),s=await studentScope(actor,id,q.subject_id,q.grade);
 const rows=(await pool.query("SELECT o.id outcome_id,o.code outcome_code,o.title,o.domain_code,y.id yccd_id,y.code,y.text FROM curriculum_outcomes o JOIN curriculum_yccds y ON y.outcome_id=o.id WHERE o.subject_id=$1 AND o.grade=$2 AND o.status='ACTIVE' AND y.status='ACTIVE' ORDER BY o.order_index,y.order_index",[s.subject,s.grade])).rows;
 const states=(await pool.query("SELECT m.state,t.id topic_id,t.name,m.cognitive_level,map.yccd_id FROM mastery_states m JOIN topics t ON t.id=m.topic_id JOIN topic_yccd_map map ON map.topic_id=t.id AND map.status='ACTIVE' WHERE m.student_id=$1 AND t.subject_id=$2 AND t.grade=$3",[s.id,s.subject,s.grade])).rows;
 return {items:rows.map(r=>({...r,linked_topic_mastery:states.filter(m=>m.yccd_id===r.yccd_id).map(m=>({topic_id:m.topic_id,topic_name:m.name,level:m.cognitive_level,score:m.state.mastery_score,confidence:m.state.confidence})),note:'Mastery cấp bài liên kết; không suy thành điểm YCCĐ chính xác nếu chưa có minh chứng riêng.'}))};
}
export async function recommendations(actor,id,raw){
 const s=await studentScope(actor,id,Number(raw.subject_id),Number(raw.grade)),p=await profile(actor,id,{subject_id:s.subject,grade:s.grade}),weak=p.axes.filter(a=>!a.sufficient||a.performance_score<70).map(a=>a.axis_id),result=[];
 const maps=(await pool.query("SELECT DISTINCT ON(target_id) * FROM competency_mapping_versions WHERE target_type='yccd' AND subject_id=$1 AND grade=$2 ORDER BY target_id,id DESC",[s.subject,s.grade])).rows;
 const student=(await pool.query('SELECT id,role,department_id FROM users WHERE id=$1',[s.id])).rows[0];
 for(const m of maps.filter(m=>m.entries.some(e=>weak.includes(e.axis_id)))){
  const content_scope_v2={version:2,subject_id:s.subject,grade:s.grade,clauses:[{topic_id:null,mode:'yccds',yccd_ids:[Number(m.target_id)]}]};
  try{const available=await candidates(pool,student,{subject_id:s.subject,grade:s.grade,content_scope_v2});if(available.length)result.push({content_scope_v2,eligible_questions:available.length,yccd_id:Number(m.target_id)});}catch(e){if(![400,422].includes(e.status))throw e;}
  if(result.length===3)break;
 }
 return {recommendations:result,note:'Chỉ gợi ý phạm vi có câu hợp lệ; kiểm tra lại số câu/tỉ lệ trước khi bắt đầu.'};
}
