import {can} from '../services/accessResolver.js';
import {setAttemptFlag,flaggedItems} from '../services/practice/flags.js';
import {resolveMatrixScope} from '../services/matrixContentScope.js';
import {Router} from 'express';
import {pool,tx} from '../db/pool.js';
import {z} from 'zod';
import {contentCapability} from '../services/capabilities.js';
import {curriculumCatalog} from '../services/curriculum.js';
import {resolveContentScope,normalizeContentScope,activeMapSQL,describeContentScope} from '../services/contentScopeV2.js';
import {candidates} from '../services/practice/attempts.js';
import {questionList} from '../services/practice/questions.js';
import {subjectAccess} from '../services/practice/authorization.js';
import {fail,log} from '../services/practice/config.js';
import {curriculumEntity,curriculumPermission,curriculumImpact,saveTopicMapping,changeCurriculum} from '../services/curriculumManagement.js';
const r=Router(),wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
r.patch('/attempts/:id/items/:itemId/flag',wrap(async(req,res)=>res.json(await setAttemptFlag(req.user,req.params.id,req.params.itemId,req.body))));
r.get('/flagged-items',wrap(async(req,res)=>res.json(await flaggedItems(req.user,req.query))));
const context=z.object({subject_id:z.coerce.number().int().positive(),grade:z.coerce.number().int().min(1).max(12)});
r.get('/content-scope/catalog',wrap(async(req,res)=>{
 const d=context.parse(req.query);await subjectAccess(req.user,d.subject_id,d.grade);
 const topics=(await pool.query("SELECT t.id,t.subject_id,t.grade,t.branch_id,t.name,t.chapter,t.order_index FROM topics t WHERE t.subject_id=$1 AND t.grade=$2 AND t.status='ACTIVE' ORDER BY t.order_index,t.id",[d.subject_id,d.grade])).rows;
 let yccds=await curriculumCatalog(d),maps=(await pool.query("SELECT m.topic_id,m.yccd_id,m.relation_type FROM topic_yccd_map m JOIN topics t ON t.id=m.topic_id WHERE t.subject_id=$1 AND t.grade=$2 AND t.status='ACTIVE' AND "+activeMapSQL(),[d.subject_id,d.grade])).rows;
 if(req.user.role==='student')yccds=yccds.map(({id,outcome_id,yccd_code,yccd_label,yccd_text,outcome_code,outcome_label,outcome_title,branch_id})=>({id,outcome_id,yccd_code,yccd_label,yccd_text,outcome_code,outcome_label,outcome_title,branch_id}));
 res.json({topics,yccds,maps});
}));
r.post('/content-scope/resolve-matrix',wrap(async(req,res)=>{const d=normalizeContentScope(req.body);if(req.user.role==='student')fail('Không đủ quyền',403);await subjectAccess(req.user,d.subject_id,d.grade);res.json(await resolveMatrixScope(d,pool));}));
r.post('/content-scope/resolve',wrap(async(req,res)=>{const d=normalizeContentScope(req.body);await subjectAccess(req.user,d.subject_id,d.grade);const resolved=await resolveContentScope(d);res.json({scope:d,resolved,summary:await describeContentScope(d)});}));
r.post('/content-scope/counts',wrap(async(req,res)=>{
 const d=context.parse(req.body),scope=normalizeContentScope(req.body.content_scope_v2||req.body);
 await subjectAccess(req.user,d.subject_id,d.grade);
 if(scope.subject_id!==d.subject_id||scope.grade!==d.grade)fail('Phạm vi không khớp môn/khối');
 const rows=await candidates(pool,req.user,{...d,content_scope_v2:scope}),types=req.body.types||[],levels=req.body.levels||[];
 const filtered=rows.filter(q=>(!types.length||types.includes(q.question_type))&&(!levels.length||levels.includes(q.cognitive_level)));
 const groups=new Map();for(const q of filtered){const key=[q.topic_id,q.outcome_id,q.yccd_id,q.cognitive_level,q.question_type].join(':');const g=groups.get(key)||{topic_id:q.topic_id,outcome_id:q.outcome_id,yccd_id:q.yccd_id,cognitive_level:q.cognitive_level,question_type:q.question_type,count:0};g.count++;groups.set(key,g);}
 res.json({total:filtered.length,groups:[...groups.values()]});
}));
r.post('/questions/search',wrap(async(req,res)=>{if(req.user.role==='student')fail('Không đủ quyền',403);res.json(await questionList(req.user,req.body));}));
r.get('/curriculum/manage',wrap(async(req,res)=>{
 const d=context.parse(req.query);if(req.user.role==='student'||!await can(req.user,'curriculum.read',{subjectId:d.subject_id,grade:d.grade}))fail('Không đủ quyền',403);
 const outcomes=(await pool.query('SELECT * FROM curriculum_outcomes WHERE subject_id=$1 AND grade=$2 ORDER BY order_index,id',[d.subject_id,d.grade])).rows;
 const yccds=(await pool.query('SELECT y.* FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id WHERE o.subject_id=$1 AND o.grade=$2 ORDER BY y.order_index,y.id',[d.subject_id,d.grade])).rows;
 const maps=(await pool.query('SELECT m.* FROM topic_yccd_map m JOIN topics t ON t.id=m.topic_id WHERE t.subject_id=$1 AND t.grade=$2 ORDER BY m.topic_id,m.yccd_id',[d.subject_id,d.grade])).rows;
 res.json({outcomes,yccds,maps,can_propose:await can(req.user,'curriculum.propose_mapping',{subjectId:d.subject_id,grade:d.grade}),can_publish:await can(req.user,'curriculum.publish',{subjectId:d.subject_id,grade:d.grade})});
}));
r.put('/curriculum/topics/:id/mappings',wrap(async(req,res)=>res.json(await tx(c=>saveTopicMapping(c,req.user,Number(req.params.id),req.body)))));
r.get('/curriculum/:type/:id/impact',wrap(async(req,res)=>{
 const entity=await curriculumEntity(pool,req.params.type,Number(req.params.id));if(req.user.role==='student'||!await can(req.user,'curriculum.read',{subjectId:entity.subject_id,grade:entity.grade}))fail('Không đủ quyền',403);
 res.json(await curriculumImpact(pool,req.params.type,Number(req.params.id)));
}));
r.post('/curriculum/:type/:id/change',wrap(async(req,res)=>res.json(await tx(c=>changeCurriculum(c,req.user,req.params.type,Number(req.params.id),req.body)))));
r.post('/curriculum/:type',wrap(async(req,res)=>{
 const type=req.params.type,d=req.body;if(!['outcome','yccd'].includes(type))fail('Loại chuẩn không hợp lệ');
 res.status(201).json(await tx(async c=>{
  const parent=type==='yccd'?await curriculumEntity(c,'outcome',Number(d.outcome_id)):context.parse(d);
  await curriculumPermission(req.user,parent.subject_id,{client:c,grade:parent.grade});
  if(!String(d.code||'').trim()||!String((type==='outcome'?d.title:d.text)||'').trim())fail('Thiếu mã hoặc nội dung');
  const row=type==='outcome'?(await c.query("INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document,source_locator,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT') RETURNING *",[parent.subject_id,parent.grade,d.domain_code||'',d.code,d.title,d.curriculum_version||'GDPT2018',d.source_document||'[CẦN BỔ SUNG]',d.source_locator||null])).rows[0]:(await c.query("INSERT INTO curriculum_yccds(outcome_id,code,text,source_locator,status) VALUES($1,$2,$3,$4,'DRAFT') RETURNING *",[parent.id,d.code,d.text,d.source_locator||null])).rows[0];
  await log(c,req.user,'CURRICULUM_DRAFT',type+':'+row.id,d);return row;
 }));
}));
export default r;
