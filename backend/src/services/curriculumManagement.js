import {openReviewCase} from './questionReview.js';
import crypto from 'node:crypto';
import {pool} from '../db/pool.js';
import {can} from './accessResolver.js';
import {contentCapability} from './capabilities.js';
import {fail,log} from './practice/config.js';
import {normalizeContentScope} from './contentScopeV2.js';
import {activeMapSQL} from './contentScopeV2.js';
const tables={topic:'topics',outcome:'curriculum_outcomes',yccd:'curriculum_yccds'};
export async function curriculumPermission(user,subject,{publish=false,client=pool,grade=null}={}){
 if(user.role==='admin')return;
 if(!await can(user,publish?'curriculum.publish':'curriculum.propose_mapping',{subjectId:Number(subject),grade},client))fail('Không có quyền chương trình trong phạm vi này',403);
}
export async function curriculumEntity(client,type,id){
 if(!tables[type])fail('Loại dữ liệu không hợp lệ');
 const r=(await client.query(type==='yccd'?'SELECT y.*,o.subject_id,o.grade,o.domain_code FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id WHERE y.id=$1':'SELECT * FROM '+tables[type]+' WHERE id=$1',[id])).rows[0];
 if(!r)fail('Không tìm thấy nội dung',404);return r;
}
export async function curriculumImpact(client,type,id){
 const entity=await curriculumEntity(client,type,id),column={topic:'topic_id',outcome:'outcome_id',yccd:'yccd_id'}[type];
 const p=[id],map=type==='topic'?'m.topic_id=$1':type==='yccd'?'m.yccd_id=$1':'m.yccd_id IN(SELECT id FROM curriculum_yccds WHERE outcome_id=$1)';
 const counts=(await client.query(`SELECT
 (SELECT count(*)::int FROM questions WHERE ${column}=$1) questions,
 (SELECT count(*)::int FROM question_versions WHERE ${column}=$1) versions,
 (SELECT count(*)::int FROM topic_yccd_map m WHERE ${map}) mappings,
 (SELECT count(DISTINCT mt.id)::int FROM matrix_templates mt JOIN matrix_cells mc ON mc.template_id=mt.id WHERE mc.${column}=$1 AND mt.workflow_status IN('draft','pending_review')) draft_matrices,
 (SELECT count(DISTINCT mt.id)::int FROM matrix_templates mt JOIN matrix_cells mc ON mc.template_id=mt.id WHERE mc.${column}=$1 AND mt.workflow_status IN('approved','locked')) approved_matrices,
 (SELECT count(*)::int FROM assignments a WHERE EXISTS(SELECT 1 FROM question_versions v WHERE v.id=ANY(a.fixed_versions) AND v.${column}=$1)) assignments,
 (SELECT count(*)::int FROM attempt_items i JOIN question_versions v ON v.id=i.question_version_id WHERE v.${column}=$1) attempt_items`,p)).rows[0];
 // Match typed scope IDs, never substrings (e.g. YCCĐ 1 must not match 10).
 const targets=(await client.query(`SELECT t.id topic_id,y.id yccd_id,o.id outcome_id FROM topic_yccd_map m JOIN topics t ON t.id=m.topic_id JOIN curriculum_yccds y ON y.id=m.yccd_id JOIN curriculum_outcomes o ON o.id=y.outcome_id WHERE ${type==='topic'?'t.id=$1':type==='yccd'?'y.id=$1':'o.id=$1'}`,[id])).rows;
 const affected=raw=>{
  let s;try{s=normalizeContentScope(raw);}catch{return false;}
  if(s.subject_id!==entity.subject_id||s.grade!==entity.grade)return false;
  return s.clauses.some(c=>{
   const rows=targets.filter(t=>!c.topic_id||t.topic_id===c.topic_id);
   if(c.mode==='all')return type==='topic'?c.topic_id===Number(id):rows.length>0;
   if(c.mode==='yccds')return type==='yccd'?c.yccd_ids.includes(Number(id))&&(!c.topic_id||rows.some(t=>t.yccd_id===Number(id))):rows.some(t=>c.yccd_ids.includes(t.yccd_id));
   if(c.mode==='outcomes')return type==='outcome'?c.outcome_ids.includes(Number(id))&&(!c.topic_id||rows.length>0):rows.some(t=>c.outcome_ids.includes(t.outcome_id));
   return type==='topic'&&c.topic_id===Number(id);
  });
 };
 const assignments=(await client.query(`SELECT a.id,a.kind,a.config,EXISTS(SELECT 1 FROM question_versions v WHERE v.id=ANY(a.fixed_versions) AND v.${column}=$1) fixed_hit FROM assignments a WHERE (a.config->>'subject_id')::int=$2`,[id,entity.subject_id])).rows;
 counts.assignments=assignments.filter(a=>a.kind==='fixed'?a.fixed_hit:affected(a.config)).length;
 const matrices=(await client.query(`SELECT mt.id,mt.workflow_status,mt.content_scope_v2,EXISTS(SELECT 1 FROM matrix_cells mc WHERE mc.template_id=mt.id AND mc.${column}=$1) cell_hit FROM matrix_templates mt WHERE mt.subject_id=$2`,[id,entity.subject_id])).rows;
 for(const [key,statuses] of [['draft_matrices',['draft','pending_review']],['approved_matrices',['approved','locked']]])counts[key]=matrices.filter(m=>statuses.includes(m.workflow_status)&&(m.cell_hit||m.content_scope_v2&&affected(m.content_scope_v2))).length;
 if(type==='outcome'||type==='yccd')counts.competency_mappings=(await client.query('SELECT count(*)::int count FROM competency_mapping_versions WHERE target_type=$1 AND target_id=$2',[type,String(id)])).rows[0].count;
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify({entity,counts,targets})).digest('hex');
 return {entity,counts,fingerprint,note:'Không đổi phiên bản/bài làm/đề cũ. Phạm vi bài giao và ma trận được đối chiếu theo ID chuẩn có kiểu, không tìm chuỗi gần giống.'};
}
export async function saveTopicMapping(client,user,topicId,raw){
 const topic=await curriculumEntity(client,'topic',topicId),status=raw.status||'CANDIDATE';
 if(!['ACTIVE','CANDIDATE','RETIRED'].includes(status))fail('Trạng thái liên kết không hợp lệ');
 await curriculumPermission(user,topic.subject_id,{publish:status!=='CANDIDATE',client,grade:topic.grade});
 if(!Array.isArray(raw.yccd_ids)||!raw.yccd_ids.length||raw.yccd_ids.length>300||raw.yccd_ids.some(n=>!Number.isSafeInteger(n)||n<1))fail('Chọn từ 1 đến 300 YCCĐ');
 if(!['core','supporting'].includes(raw.relation_type||'core'))fail('Loại liên kết không hợp lệ');
 if(status==='ACTIVE'&&!String(raw.reason||'').trim())fail('Ghi căn cứ xác nhận liên kết từ chương trình nguồn');
 const branch=topic.branch_id?(await client.query('SELECT code FROM branches WHERE id=$1',[topic.branch_id])).rows[0]:null;
 const domain=({VL:'L',HH:'H',SH:'S'}[branch?.code]||branch?.code||'');
 for(const id of [...new Set(raw.yccd_ids)]){
  const y=await curriculumEntity(client,'yccd',id);
  if(y.subject_id!==topic.subject_id||y.grade!==topic.grade||domain&&y.domain_code&&domain!==y.domain_code)throw Object.assign(new Error('Liên kết ngoài môn/khối/phân môn'),{status:422,code:'TOPIC_YCCD_MISMATCH'});
  if(status==='ACTIVE'&&(topic.status!=='ACTIVE'||y.status!=='ACTIVE'))fail('Bài hoặc YCCĐ chưa hoạt động',422);
  const prior=(await client.query('SELECT * FROM topic_yccd_map WHERE topic_id=$1 AND yccd_id=$2',[topicId,id])).rows[0];
  if(prior?.status==='ACTIVE'&&status==='CANDIDATE')fail('Đề xuất không được ghi đè liên kết đã công bố',409);
  await client.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status,relation_type,created_by,updated_by,source_evidence) VALUES($1,$2,$3,$4,$5,$5,$6) ON CONFLICT(topic_id,yccd_id) DO UPDATE SET status=EXCLUDED.status,relation_type=EXCLUDED.relation_type,updated_by=EXCLUDED.updated_by,source_evidence=EXCLUDED.source_evidence",[topicId,id,status,raw.relation_type||'core',user.id,JSON.stringify({reason:raw.reason||'',previous:prior?.source_evidence||null})]);
 }
 await log(client,user,'TOPIC_YCCD_MAPPING',topicId,raw);return {ok:true};
}
export async function changeCurriculum(client,user,type,id,raw){
 const impact=await curriculumImpact(client,type,id),old=impact.entity;
 await curriculumPermission(user,old.subject_id,{publish:true,client,grade:old.grade});
 const action=raw.action||'minor';
 if(!['minor','activate','retire','replace','move'].includes(action))fail('Thao tác không hợp lệ');
 const reason=String(raw.reason||'').trim();if(!reason)fail('Cần lý do thay đổi');
 if(['retire','replace','move'].includes(action)&&raw.impact_fingerprint!==impact.fingerprint)fail('Xem lại tác động mới nhất trước khi xác nhận',409);
 const table=tables[type],label=type==='topic'?'name':type==='outcome'?'title':'text';
 if(action==='minor'){
  if(!String(raw[label]||old[label]||'').trim())fail('Nội dung không được rỗng');
  await client.query('UPDATE '+table+' SET '+label+'=$1,updated_at=now() WHERE id=$2',[String(raw[label]||old[label]).trim(),id]);
  if(raw.code&&type!=='topic'&&raw.code!==old.code){
   await client.query('INSERT INTO curriculum_aliases(entity_type,entity_id,old_code,created_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[type,id,old.code,user.id]);
   await client.query('UPDATE '+table+' SET code=$1 WHERE id=$2',[raw.code,id]);
  }
  for(const field of ['source_locator',...(type==='outcome'?['source_document']:[])])if(raw[field]!==undefined)await client.query('UPDATE '+table+' SET '+field+'=$1 WHERE id=$2',[raw[field]||null,id]);
 }else if(action==='activate'){
  if(type==='yccd'&&!(await client.query("SELECT 1 FROM curriculum_outcomes WHERE id=$1 AND status='ACTIVE'",[old.outcome_id])).rowCount)fail('Outcome cha chưa hoạt động');
  await client.query("UPDATE "+table+" SET status='ACTIVE',updated_at=now() WHERE id=$1",[id]);
 }else{
  if(action==='move'&&type!=='yccd')fail('Chỉ chuyển YCCĐ sang Outcome bằng bản thay thế');
  let replacement=null;
  if(action==='replace'||action==='move'){
   if(type==='topic')fail('Bài được lưu trữ; tạo bài mới bằng màn hình môn học');
   if(!String(raw.code||'').trim()||!String(raw[label]||'').trim())fail('Nhập mã và nội dung chuẩn thay thế');
   const parent=action==='move'?await curriculumEntity(client,'outcome',Number(raw.target_outcome_id)):null;
   if(parent&&(parent.subject_id!==old.subject_id||parent.grade!==old.grade))fail('Outcome đích phải cùng môn/khối');
   replacement=type==='yccd'?(await client.query("INSERT INTO curriculum_yccds(outcome_id,code,text,status,source_locator) VALUES($1,$2,$3,'DRAFT',$4) RETURNING id",[parent?.id||old.outcome_id,raw.code,raw.text,raw.source_locator||old.source_locator])).rows[0].id:(await client.query("INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document,source_locator,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT') RETURNING id",[old.subject_id,old.grade,old.domain_code,raw.code,raw.title,old.curriculum_version,raw.source_document||old.source_document,raw.source_locator||old.source_locator])).rows[0].id;
  }
  await client.query('UPDATE '+table+' SET status=$1,updated_at=now()'+(type==='topic'?'':',superseded_by=$3')+' WHERE id=$2',type==='topic'?['ARCHIVED',id]:['RETIRED',id,replacement]);
  const column={topic:'topic_id',outcome:'outcome_id',yccd:'yccd_id'}[type];
  const affected=(await client.query('SELECT * FROM questions WHERE '+column+'=$1',[id])).rows;
  for(const q of affected)await openReviewCase(client,user,q,{reason_code:type==='outcome'?'OUTCOME_RETIRED':type==='yccd'?'YCCD_RETIRED':'CURRICULUM_MISMATCH',note:'Chuẩn / bài ngừng sử dụng mới: '+reason});
  await client.query("UPDATE questions SET metadata_status='NEEDS_REVIEW' WHERE "+column+'=$1',[id]);
 }
 await log(client,user,'CURRICULUM_'+action.toUpperCase(),type+':'+id,{before:old,request:raw,impact:impact.counts});
 return {ok:true,impact};
}
