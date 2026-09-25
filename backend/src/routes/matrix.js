import {can} from '../services/accessResolver.js';
import {resolveMatrixScope,mappingChanged} from '../services/matrixContentScope.js';
import {Router} from 'express';
import {z} from 'zod';
import {pool,tx} from '../db/pool.js';
import {auth,getSubjectFilterSQL} from '../middleware/auth.js';
import {audit} from '../utils/audit.js';
import {contentCapability} from '../services/capabilities.js';
import {validateMatrixNumbers,matrixError} from '../services/matrixValidation.js';
import {validateMatrixCurriculum} from '../services/curriculum.js';
import {previewCoverage} from '../services/examGenerator.js';
import {outcomeLabelSql,yccdLabelSql} from '../services/curriculumLabel.js';
const r=Router();r.use(auth);
const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
const nullableId=z.number().int().positive().nullable().optional();
const CellSchema=z.object({part_name:z.string().max(50).nullable().optional(),q_type:z.enum(['mcq4','true_false','short','essay','matching']),cognitive_level:z.enum(['M1','M2','M3','M4']),branch_id:nullableId,topic_id:nullableId,outcome_id:nullableId,yccd_id:nullableId,main_topic:z.string().max(300).nullable().optional(),sub_topic:z.string().max(300).nullable().optional(),question_count:z.number().int().min(1).max(500),score_per_question:z.number().finite().positive(),is_locked:z.boolean().default(false),order_index:z.number().int().optional()});
const Schema=z.object({content_scope_v2:z.unknown().optional(),scope_decision:z.enum(['keep','refresh']).optional(),name:z.string().trim().min(1).max(300),subject_id:z.number().int().positive(),subject_code:z.string().max(30).nullable().optional(),grade:z.number().int().min(1).max(12),matrix_type:z.enum(['BGD_2025','TRUONG']).default('BGD_2025'),purpose:z.string().max(50).default('Giữa kỳ'),duration_minutes:z.number().int().min(5).max(300).default(45),total_score:z.number().positive().default(10),part1_count:z.number().int().nonnegative().default(0),part2_count:z.number().int().nonnegative().default(0),part3_count:z.number().int().nonnegative().default(0),part4_count:z.number().int().nonnegative().default(0),ratio_m1:z.number().int().min(0).max(100).default(30),ratio_m2:z.number().int().min(0).max(100).default(30),ratio_m3:z.number().int().min(0).max(100).default(20),ratio_m4:z.number().int().min(0).max(100).default(20),topic_scope:z.array(z.number().int().positive()).nullable().optional(),branch_config:z.array(z.object({branch_id:nullableId,branch_code:z.string().optional(),score:z.number().nonnegative()}).passthrough()).nullable().optional(),yccd_scope:z.array(z.number().int().positive()).optional(),deviation_accepted:z.boolean().default(false),deviation_reason:z.string().max(1000).default(''),cells:z.array(CellSchema).max(500).default([])});
async function permitted(user,action,subject,client=pool,grade){if(!await can(user,'matrix.'+(action==='write'?'create':action),{subjectId:subject,grade},client))throw Object.assign(new Error('Không có quyền với nội dung môn này'),{status:403});}
async function load(client,id,lock=false){
 const m=(await client.query('SELECT * FROM matrix_templates WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];
 if(!m)throw Object.assign(new Error('Không tìm thấy ma trận'),{status:404});
 m.cells=(await client.query('SELECT mc.*,b.name AS branch_name,b.code AS branch_code,b.color AS branch_color,t.name AS topic_name,y.code AS yccd_code,y.text AS yccd_text,o.code AS outcome_code,'+outcomeLabelSql('o')+' AS outcome_label,'+yccdLabelSql('y','yo')+' AS yccd_label FROM matrix_cells mc LEFT JOIN branches b ON b.id=mc.branch_id LEFT JOIN topics t ON t.id=mc.topic_id LEFT JOIN curriculum_yccds y ON y.id=mc.yccd_id LEFT JOIN curriculum_outcomes o ON o.id=mc.outcome_id LEFT JOIN curriculum_outcomes yo ON yo.id=y.outcome_id WHERE template_id=$1 ORDER BY mc.order_index,mc.id',[id])).rows;
 if(m.scope_snapshot)m.cells=m.cells.map(c=>{const y=m.scope_snapshot.labels?.find(y=>y.id===c.yccd_id),t=m.scope_snapshot.topics?.find(t=>t.id===c.topic_id);return {...c,yccd_code:y?.code||c.yccd_code,yccd_text:y?.text||c.yccd_text,outcome_code:y?.outcome_code||c.outcome_code,yccd_label:y?.label||c.yccd_label,outcome_label:y?.outcome_label||c.outcome_label,topic_name:t?.name||c.topic_name};});
 m.yccd_scope=(await client.query('SELECT yccd_id FROM matrix_yccd_scope WHERE template_id=$1 ORDER BY yccd_id',[id])).rows.map(x=>x.yccd_id);
 return m;
}
async function save(client,user,data,id=null){
 await permitted(user,'write',data.subject_id,client,data.grade);
 if(data.content_scope_v2){
  if(Number(data.content_scope_v2.subject_id)!==data.subject_id||Number(data.content_scope_v2.grade)!==data.grade)throw matrixError('MATRIX_SCOPE_MISMATCH','Phạm vi không khớp môn/khối ma trận');
  const latest=await resolveMatrixScope(data.content_scope_v2,client),prior=id?(await client.query('SELECT scope_snapshot FROM matrix_templates WHERE id=$1',[id])).rows[0]?.scope_snapshot:null;
  if(prior&&mappingChanged(prior,latest)&&!data.scope_decision)throw matrixError('MATRIX_MAPPING_CHANGED','Liên kết đã đổi: chọn giữ snapshot hoặc làm mới phạm vi',{before:prior,after:latest});
  data.scope_snapshot=prior&&data.scope_decision==='keep'?prior:latest;
  data.yccd_scope=data.scope_snapshot.yccd_ids;
  for(const c of data.cells){if(!data.scope_snapshot.clauses.some(cl=>cl.yccd_ids.includes(c.yccd_id)&&(!cl.topic_id||!c.topic_id||cl.topic_id===c.topic_id)))throw matrixError('MATRIX_CELL_SCOPE','Ô nằm ngoài phạm vi bài / YCCĐ đã chọn');}
 }
 const report=validateMatrixNumbers(data),scope=await validateMatrixCurriculum(client,data);
 const entries=Object.entries(data).filter(([k])=>!['cells','yccd_scope','scope_decision'].includes(k));
 const values=entries.map(([k,v])=>['topic_scope','branch_config','content_scope_v2','scope_snapshot'].includes(k)?v==null?null:JSON.stringify(v):v);
 let m;
 if(id){values.push(id);m=(await client.query('UPDATE matrix_templates SET '+entries.map(([k],i)=>k+'=$'+(i+1)).join(',')+",workflow_status='draft',status='Bản nháp',approved_by=NULL,approved_at=NULL WHERE id=$"+values.length+' RETURNING *',values)).rows[0];}
 else {values.push(user.id);m=(await client.query('INSERT INTO matrix_templates('+entries.map(([k])=>k).join(',')+',creator_id) VALUES('+values.map((_,i)=>'$'+(i+1)).join(',')+') RETURNING *',values)).rows[0];}
 await client.query('DELETE FROM matrix_cells WHERE template_id=$1',[m.id]);
 await client.query('DELETE FROM matrix_yccd_scope WHERE template_id=$1',[m.id]);
 for(const y of [...new Set(scope)])await client.query('INSERT INTO matrix_yccd_scope(template_id,yccd_id) VALUES($1,$2)',[m.id,y]);
 for(const [i,c] of data.cells.entries())await client.query('INSERT INTO matrix_cells(template_id,part_name,q_type,cognitive_level,branch_id,topic_id,outcome_id,yccd_id,main_topic,sub_topic,question_count,score_per_question,is_locked,order_index) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[m.id,c.part_name||null,c.q_type,c.cognitive_level,c.branch_id||null,c.topic_id||null,c.outcome_id||null,c.yccd_id||null,c.main_topic||null,c.sub_topic||null,c.question_count,c.score_per_question,c.is_locked,c.order_index??i]);
 await client.query('INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5)',[user.id,id?'UPDATE_MATRIX':'CREATE_MATRIX','matrix',m.id,JSON.stringify({balance:report,deviation_accepted:data.deviation_accepted,reason:data.deviation_reason})]);
 return {...m,...report};
}
r.get('/',wrap(async(req,res)=>{
 const sf=await getSubjectFilterSQL(req.user,'m',1,'matrix.read'),params=[...sf.params],where=sf.clause?[sf.clause]:[];
 for(const key of ['subject_id','grade','status'])if(req.query[key]){params.push(req.query[key]);where.push('m.'+key+'=$'+params.length);}
 res.json((await pool.query('SELECT m.*,s.name AS subject_name,u.full_name AS creator_name,(SELECT count(*)::int FROM matrix_cells WHERE template_id=m.id) AS cell_count FROM matrix_templates m LEFT JOIN subjects s ON s.id=m.subject_id LEFT JOIN users u ON u.id=m.creator_id '+(where.length?'WHERE '+where.join(' AND '):'')+' ORDER BY m.id DESC LIMIT 200',params)).rows);
}));
r.get('/:id',wrap(async(req,res)=>{const m=await load(pool,req.params.id);await permitted(req.user,'read',m.subject_id,pool,m.grade);let mapping_change=null;if(m.content_scope_v2&&m.scope_snapshot){try{const current=await resolveMatrixScope(m.content_scope_v2,pool);if(mappingChanged(m.scope_snapshot,current))mapping_change={before:m.scope_snapshot,after:current};}catch(e){mapping_change={error:e.message};}}m.mapping_change=mapping_change;const s=(await pool.query('SELECT name,is_integrated FROM subjects WHERE id=$1',[m.subject_id])).rows[0];res.json({...m,subject_name:s?.name,is_integrated:s?.is_integrated});}));
r.post('/',wrap(async(req,res)=>res.status(201).json(await tx(c=>save(c,req.user,Schema.parse(req.body))))));
r.put('/:id',wrap(async(req,res)=>res.json(await tx(async c=>{
 const m=await load(c,req.params.id,true);await permitted(req.user,'write',m.subject_id,c,m.grade);
 if(m.workflow_status==='locked'||m.status==='Đã chốt')throw Object.assign(new Error('Mở khóa trước khi sửa ma trận'),{status:409});
 if(m.creator_id!==req.user.id&&!await can(req.user,'matrix.review',{subjectId:m.subject_id,grade:m.grade},c))throw Object.assign(new Error('Chỉ người tạo hoặc tổ trưởng môn được sửa'),{status:403});
 const raw={...m,...req.body,total_score:Number(req.body.total_score??m.total_score),cells:req.body.cells??m.cells.map(x=>({...x,score_per_question:Number(x.score_per_question)}))};
 // Đổi cells/tỷ lệ phải xác nhận lại, không kế thừa xác nhận cũ.
 if(req.body.cells||['ratio_m1','ratio_m2','ratio_m3','ratio_m4','total_score'].some(k=>k in req.body)){raw.deviation_accepted=req.body.deviation_accepted===true;raw.deviation_reason=req.body.deviation_reason||'';}
 return save(c,req.user,Schema.parse(raw),m.id);
}))));
r.post('/:id/clone',wrap(async(req,res)=>res.status(201).json(await tx(async c=>{
 const m=await load(c,req.params.id);await permitted(req.user,'read',m.subject_id,c,m.grade);
 return save(c,req.user,Schema.parse({...m,name:m.name+' (bản sao)',total_score:Number(m.total_score),cells:m.cells.map(x=>({...x,score_per_question:Number(x.score_per_question)}))}));
}))));
async function workflow(req,res,desired){
 const result=await tx(async c=>{
  const m=await load(c,req.params.id,true),next=desired||(m.workflow_status==='locked'?'draft':'locked');
  await permitted(req.user,next==='locked'||m.workflow_status==='locked'?'lock':next==='approved'?'approve':next==='draft'&&m.workflow_status==='pending_review'?'review':'write',m.subject_id,c,m.grade);
  if(next==='pending_review'&&m.creator_id!==req.user.id&&req.user.role!=='admin')throw Object.assign(new Error('Chỉ người tạo gửi duyệt'),{status:403});
  const allowed={draft:['pending_review','locked'],pending_review:['draft','approved','locked'],approved:['draft','locked'],locked:['draft'],archived:['draft']};
  if(!allowed[m.workflow_status]?.includes(next))throw matrixError('MATRIX_WORKFLOW','Chuyển trạng thái không hợp lệ');
  if(next!=='draft'){
   validateMatrixNumbers(m);await validateMatrixCurriculum(c,m);
   if(!m.cells.length||m.cells.some(x=>!x.yccd_id))throw matrixError('MATRIX_YCCD_REQUIRED','Chưa có đủ YCCĐ trong các ô');
  }
  const review=['approved','locked'].includes(next);
  await c.query("UPDATE matrix_templates SET workflow_status=$1,status=$2,approved_by=$3,approved_at=CASE WHEN $3::int IS NOT NULL THEN now() ELSE NULL END WHERE id=$4",[next,next==='locked'?'Đã chốt':'Bản nháp',review?req.user.id:null,m.id]);
  await c.query('INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5)',[req.user.id,'MATRIX_WORKFLOW','matrix',m.id,JSON.stringify({from:m.workflow_status,to:next})]);
  return {ok:true,workflow_status:next,status:next==='locked'?'Đã chốt':'Bản nháp'};
 });res.json(result);
}
r.patch('/:id/toggle-lock',wrap((req,res)=>workflow(req,res)));
r.post('/:id/workflow',wrap((req,res)=>workflow(req,res,z.enum(['draft','pending_review','approved','locked','archived']).parse(req.body.status))));
r.delete('/:id',wrap(async(req,res)=>{await tx(async c=>{const m=await load(c,req.params.id,true);await permitted(req.user,'review',m.subject_id,c,m.grade);if((await c.query('SELECT 1 FROM exam_runs WHERE matrix_id=$1',[m.id])).rowCount)throw Object.assign(new Error('Ma trận đã có đề; lưu trữ thay vì xóa'),{status:409});await c.query('DELETE FROM matrix_templates WHERE id=$1',[m.id]);});await audit(req.user.id,'DELETE_MATRIX','matrix',Number(req.params.id),{},req.ip);res.json({ok:true});}));
r.get('/:id/coverage',wrap(async(req,res)=>{const m=await load(pool,req.params.id);await permitted(req.user,'read',m.subject_id,pool,m.grade);const cells=await previewCoverage(m.id,req.user);let issue=null;try{validateMatrixNumbers(m);}catch(e){issue={code:e.code,message:e.message,details:e.details};}
 const fail=cells.filter(c=>c.status!=='EXACT_READY').length;res.json({cells,issue,summary:{total:cells.length,ok:cells.length-fail,partial:0,fail,can_generate:cells.length>0&&!fail&&!issue}});
}));
export default r;
