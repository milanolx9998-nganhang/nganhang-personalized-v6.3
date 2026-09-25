import {can,contentFilterSQL,getEffectiveAccess,bankDecision} from './accessResolver.js';
import {compileQuestionScopeSQL} from './contentScopeV2.js';
import {contentCapability} from './capabilities.js';
import {pool} from '../db/pool.js';
import {matrixError,validateMatrixNumbers} from './matrixValidation.js';
import {outcomeLabelSql,yccdLabelSql} from './curriculumLabel.js';
import {normalizeQuestion,legacyTypes} from './practice/grading.js';
const shuffle=arr=>{const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
async function matrixData(client,id){
 const m=(await client.query('SELECT m.*,s.name AS subject_name FROM matrix_templates m JOIN subjects s ON s.id=m.subject_id WHERE m.id=$1',[id])).rows[0];
 if(!m)throw Object.assign(new Error('Không tìm thấy ma trận'),{status:404});
 m.cells=(await client.query('SELECT mc.*,b.name AS branch_name,t.name AS topic_name,y.code AS yccd_code,y.text AS yccd_text,o.code AS outcome_code,'+outcomeLabelSql('o')+' AS outcome_label,'+yccdLabelSql('y','yo')+' AS yccd_label FROM matrix_cells mc LEFT JOIN branches b ON b.id=mc.branch_id LEFT JOIN topics t ON t.id=mc.topic_id LEFT JOIN curriculum_yccds y ON y.id=mc.yccd_id LEFT JOIN curriculum_outcomes o ON o.id=mc.outcome_id LEFT JOIN curriculum_outcomes yo ON yo.id=y.outcome_id WHERE template_id=$1 ORDER BY order_index,mc.id',[id])).rows;
 return m;
}
export async function exactPool(client,matrix,cell,actor=null){
 if(!cell.yccd_id||!cell.outcome_id)return [];
 const params=[matrix.subject_id,matrix.grade,cell.outcome_id,cell.yccd_id,Number(cell.cognitive_level.slice(1)),{mcq4:'multiple_choice',short:'short_answer'}[cell.q_type]||cell.q_type];
 const where=["b.kind='school'","q.lifecycle<>'archived'","NOT q.quarantined","v.review_status='APPROVED'","NOT EXISTS(SELECT 1 FROM question_review_cases rc WHERE rc.question_id=q.id AND rc.status IN('OPEN','IN_REVIEW') AND rc.reason_code IN('CURRICULUM_MISMATCH','YCCD_RETIRED','OUTCOME_RETIRED'))","q.metadata_status='VERIFIED'","q.subject_id=$1","q.grade=$2","q.outcome_id=$3","q.yccd_id=$4","right(q.cognitive_level::text,1)::int=$5","(CASE q.q_type::text WHEN 'mcq4' THEN 'multiple_choice' WHEN 'short' THEN 'short_answer' ELSE q.q_type::text END)=$6","cy.status='ACTIVE'","co.status='ACTIVE'"];
 if(actor){where.push(await contentFilterSQL(actor,'q',params,'content.read',client));where.push(await contentFilterSQL(actor,'q',params,'content.view_answer',client));const a=await getEffectiveAccess(actor,client);params.push(a.org.banks.filter(b=>bankDecision(a,'read',b).allowed).map(b=>b.id));where.push('q.bank_id=ANY($'+params.length+'::int[])');}
 if(matrix.scope_snapshot){const compiled=compileQuestionScopeSQL(matrix.scope_snapshot,'q',params.length+1);where.push(compiled.sql);params.push(...compiled.params);}
 where.push("EXISTS(SELECT 1 FROM topics tp JOIN topic_yccd_map tm ON tm.topic_id=tp.id AND tm.yccd_id=q.yccd_id WHERE tp.id=q.topic_id AND tp.status='ACTIVE' AND tm.status='ACTIVE' AND (tm.valid_from IS NULL OR tm.valid_from<=CURRENT_DATE) AND (tm.valid_to IS NULL OR tm.valid_to>=CURRENT_DATE))");
 if(cell.branch_id){params.push(cell.branch_id);where.push('q.branch_id=$'+params.length);}
 if(cell.topic_id){params.push(cell.topic_id);where.push('q.topic_id=$'+params.length);}
 if(matrix.topic_scope?.length){params.push(matrix.topic_scope);where.push('q.topic_id=ANY($'+params.length+'::int[])');}
 return (await client.query('SELECT q.id,q.question_code,q.usage_count,q.active_version_id AS current_version_id,q.active_metadata AS curriculum_snapshot,v.content,right(q.cognitive_level::text,1)::int AS cognitive_level,q.grade,q.subject_id,q.topic_id,v.question_type,q.branch_id,q.outcome_id,q.yccd_id FROM question_selection_metadata q JOIN banks b ON b.id=q.bank_id JOIN question_versions v ON v.id=q.active_version_id JOIN curriculum_yccds cy ON cy.id=q.yccd_id JOIN curriculum_outcomes co ON co.id=q.outcome_id WHERE '+where.join(' AND ')+' ORDER BY q.usage_count,q.id',params)).rows;
}
// Ghép hai phía để các ô có phần giao nhau không lấy hết câu của ô hẹp hơn.
export function allocateExact(cells,pools,rank=()=>0){
 const slots=cells.flatMap((c,i)=>Array.from({length:c.question_count},()=>i));
 const owner=new Map(),chosen=new Map();
 const ordered=pools.map(rows=>shuffle(rows).sort((a,b)=>rank(a)-rank(b)));
 function assign(slot,seen){
  for(const q of ordered[slots[slot]]){
   if(seen.has(q.id))continue;seen.add(q.id);
   const prior=owner.get(q.id);
   if(prior===undefined||assign(prior,seen)){owner.set(q.id,slot);chosen.set(slot,q);return true;}
  }return false;
 }
 for(const slot of slots.map((_,i)=>i).sort((a,b)=>ordered[slots[a]].length-ordered[slots[b]].length))if(!assign(slot,new Set()))return null;
 const output=cells.map(()=>[]);for(const [slot,q] of chosen)output[slots[slot]].push(q);return output;
}
async function recentIds(client,days){
 if(!days)return new Set();
 return new Set((await client.query("SELECT DISTINCT question_id FROM exam_items ei JOIN exam_runs er ON er.id=ei.run_id WHERE er.created_at>=now()-($1::int*interval '1 day')",[days])).rows.map(x=>x.question_id));
}
function coverageRows(matrix,pools,recent){
 const feasible=allocateExact(matrix.cells,pools);
 return matrix.cells.map((c,i)=>{
  const unresolved=!c.yccd_id||!c.outcome_id,exact=pools[i].length,need=c.question_count;
  return {cell_id:c.id,part_name:c.part_name,q_type:c.q_type,cognitive_level:c.cognitive_level,branch_name:c.branch_name,topic_name:c.topic_name,outcome_id:c.outcome_id,yccd_id:c.yccd_id,outcome_code:c.outcome_code,yccd_code:c.yccd_code,yccd_label:c.yccd_label,outcome_label:c.outcome_label,yccd_text:c.yccd_text,subject_id:matrix.subject_id,grade:matrix.grade,
   topic_id:c.topic_id,branch_id:c.branch_id,question_count:need,need,exact_available:exact,available_after_anti_repeat:pools[i].filter(q=>!recent.has(q.id)).length,shortage:Math.max(0,need-exact),
   status:unresolved?'BLOCKED':exact<need||!feasible?'SHORTAGE':'EXACT_READY',
   reason:unresolved?'Chưa ánh xạ YCCĐ chuẩn':!feasible&&exact>=need?'Các ô giao nhau không đủ câu khác nhau trong một mã':null,
   available:{exact},enough_exact:!unresolved&&exact>=need&&!!feasible,enough_any:!unresolved&&exact>=need&&!!feasible};
 });
}
export async function previewCoverage(matrixId,actor=null){
 const client=await pool.connect();try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const m=await matrixData(client,matrixId),pools=[];for(const c of m.cells)pools.push(await exactPool(client,m,c,actor));const rows=coverageRows(m,pools,await recentIds(client,180));await client.query('COMMIT');return rows;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export function examQuestion(row,optionOrder=null,score=null){
 const q=normalizeQuestion({content:row.content,cognitive_level:row.cognitive_level,subject_id:row.subject_id,topic_id:row.topic_id,grade:row.grade});
 const legacy=row.content?.legacy_snapshot||{};
 const order=optionOrder||(q.options||[]).map(o=>o.id);
 if(q.type==='multiple_choice'){
  const original=q.options,answer=q.answer.correct;
  q.options=order.map((id,i)=>({id:String.fromCharCode(65+i),text:original.find(o=>o.id===id)?.text||''}));
  q.answer={...q.answer,correct:String.fromCharCode(65+order.indexOf(answer))};
 }
 return {...q,question_id:row.question_id||row.id,question_code:legacy.question_code||row.question_code,question_version_id:row.question_version_id||row.current_version_id,
  stem_text:q.stem,q_type:legacyTypes[q.type],cognitive_level:'M'+row.cognitive_level,
  score:score==null?null:Number(score),assigned_score:score==null?null:Number(score),
  option_a:q.options?.[0]?.text,option_b:q.options?.[1]?.text,option_c:q.options?.[2]?.text,option_d:q.options?.[3]?.text,
  answer_key:q.type==='multiple_choice'?q.answer.correct:legacy.answer_key,original_answer:legacy.answer_key,q_answer_key:q.type==='multiple_choice'?q.answer.correct:legacy.answer_key};
}
export async function generateExam({matrixId,examName,examCodeCount=1,shuffleOptions=true,avoidCrossCodeOverlap=true,antiRepeatDays=180,creatorId,actor=null,tagExtras=[]}){
 const client=await pool.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  const matrix=await matrixData(client,matrixId);if(actor&&!await can(actor,'exam.generate',{subjectId:matrix.subject_id,grade:matrix.grade},client))throw Object.assign(new Error('Không còn quyền sinh đề môn này'),{status:403});validateMatrixNumbers(matrix);
  if(!matrix.cells.length)throw matrixError('MATRIX_EMPTY','Ma trận chưa có ô');
  const pools=[];for(const cell of matrix.cells)pools.push(await exactPool(client,matrix,cell,actor));
  const recent=await recentIds(client,antiRepeatDays),coverage=coverageRows(matrix,pools,recent);
  if(coverage.some(c=>c.status!=='EXACT_READY'))throw matrixError('MATRIX_CELL_SHORTAGE','Thiếu câu khớp chính xác. Không tự hạ mức hoặc đổi YCCĐ.',{cells:coverage});
  const preferred=new Set(tagExtras.length?(await client.query('SELECT DISTINCT question_id FROM question_tags WHERE tag_id=ANY($1::int[])',[tagExtras.map(t=>t.tag_id)])).rows.map(x=>x.question_id):[]);
  const run=(await client.query('INSERT INTO exam_runs(matrix_id,exam_name,exam_code_count,shuffle_options,avoid_cross_code_overlap,anti_repeat_days,creator_id,matrix_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[matrixId,examName,examCodeCount,shuffleOptions,avoidCrossCodeOverlap,antiRepeatDays,creatorId,JSON.stringify(matrix)])).rows[0];
  const cross=new Set(),warnings=[],codes=[];
  if(tagExtras.length)warnings.push('Nhãn chỉ là ưu tiên trong tập câu khớp chính xác; không thêm câu ngoài ma trận.');
  for(let codeIndex=0;codeIndex<examCodeCount;codeIndex++){
   const code=String(101+codeIndex),selected=allocateExact(matrix.cells,pools,q=>(recent.has(q.id)?1000000:0)+(avoidCrossCodeOverlap&&cross.has(q.id)?100000:0)+(preferred.size&&!preferred.has(q.id)?10000:0)+Math.min(q.usage_count||0,9999));
   if(!selected)throw matrixError('MATRIX_CELL_SHORTAGE','Không đủ câu khác nhau trong mã đề',{cells:coverage});
   const items=[];let orderIndex=0;
   for(const [i,cell] of matrix.cells.entries())for(const row of selected[i]){
    let policy='exact';
    if(recent.has(row.id)){warnings.push('Mã '+code+': tái sử dụng câu '+row.question_code+' trong thời hạn tránh lặp; giữ nguyên YCCĐ/mức/dạng.');policy='exact_repeat';}
    if(avoidCrossCodeOverlap&&cross.has(row.id)){warnings.push('Mã '+code+': trùng câu '+row.question_code+' giữa các mã; giữ nguyên tiêu chí.');policy='exact_overlap';}
    const normalized=normalizeQuestion(row),order=normalized.type==='multiple_choice'?(shuffleOptions?shuffle(normalized.options.map(o=>o.id)):normalized.options.map(o=>o.id)):null;
    const q=examQuestion(row,order,cell.score_per_question);orderIndex++;
    await client.query('INSERT INTO exam_items(run_id,exam_code,question_id,question_version_id,matrix_cell_id,assigned_score,selection_policy,cell_snapshot,part_name,order_index,option_order,fallback_stage,curriculum_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[run.id,code,row.id,row.current_version_id,cell.id,cell.score_per_question,policy,JSON.stringify(cell),cell.part_name,orderIndex,order?JSON.stringify(order):null,'exact',JSON.stringify(row.curriculum_snapshot)]);
    await client.query('UPDATE questions SET usage_count=usage_count+1,last_used_at=now() WHERE id=$1',[row.id]);
    items.push({...q,part_name:cell.part_name,order_index:orderIndex,option_order:order,matrix_cell_id:cell.id,selection_policy:policy});cross.add(row.id);
   }
   codes.push({code,items});
  }
  await client.query('UPDATE exam_runs SET warnings=$1 WHERE id=$2',[JSON.stringify(warnings),run.id]);
  await client.query('COMMIT');return {exam_run_id:run.id,exam_name:examName,matrix_id:matrixId,codes,warnings};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export async function readExamItems(runId,code=null){
 const rows=(await pool.query('SELECT ei.*,v.content,COALESCE(right(ei.curriculum_snapshot->>\'cognitive_level\',1)::int,v.cognitive_level) AS cognitive_level,COALESCE((ei.curriculum_snapshot->>\'subject_id\')::int,v.subject_id) AS subject_id,COALESCE((ei.curriculum_snapshot->>\'topic_id\')::int,v.topic_id) AS topic_id,COALESCE((ei.curriculum_snapshot->>\'grade\')::int,v.grade) AS grade,v.question_type FROM exam_items ei LEFT JOIN question_versions v ON v.id=ei.question_version_id WHERE run_id=$1 AND ($2::text IS NULL OR exam_code=$2) ORDER BY exam_code,order_index',[runId,code])).rows;
 return rows.map(row=>{
  if(!row.question_version_id)return {...row,legacy_unverifiable:true,stem_text:'Đề cũ chưa lưu phiên bản: không thể xác nhận nội dung lịch sử.',score:null};
  return {...row,...examQuestion(row,row.option_order,row.assigned_score),id:row.id,content:undefined};
 });
}
