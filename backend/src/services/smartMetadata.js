import {settings} from './practice/config.js';
import {curriculumCatalog} from './curriculum.js';
import {normalizeQuestion,validateQuestion,levelNumber} from './practice/grading.js';
export function validateDraft(raw,profile={}){
 const q=normalizeQuestion(raw),full=validateQuestion(q,profile);
 const missing=full.errors.filter(e=>e.startsWith('Thiếu ')||e==='Dạng câu chưa được hỗ trợ');
 const errors=full.errors.filter(e=>!missing.includes(e));
 if(raw.record_action&&!['NEW','UPDATE'].includes(raw.record_action))errors.push('record_action chỉ nhận NEW hoặc UPDATE');
 if(raw.record_action==='UPDATE'&&(!raw.question_id||!raw.question_version_id))errors.push('UPDATE cần question_id và question_version_id');
 if(raw.subitem_levels&&Object.values(raw.subitem_levels).some(v=>!levelNumber(v)))errors.push('Mức từng nhận định cần NB/TH/VD/VDC');
 if(!q.stem?.trim())errors.push('Thiếu nội dung câu hỏi');
 return {errors,warnings:[...full.warnings,...missing.filter(e=>e!=='Thiếu nội dung câu hỏi')],status:errors.length?'ERROR':missing.length?'NEEDS_REVIEW':full.status};
}
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d');
export function suggestType(q){
 if(q.left?.length&&q.right?.length)return {value:'matching',confidence:98,reason:'Có hai cột ghép nối'};
 const answer=typeof q.answer==='string'?q.answer:q.answer_key||'';
 if(q.statements?.every(s=>s.text)&&/([a-d])\s*[-:.)]?\s*(Đ|S|true|false)/i.test(answer))return {value:'true_false',confidence:95,reason:'Có nhận định và khóa đúng/sai'};
 if(q.options?.length===4&&q.options.every(o=>o.text?.trim())&&/^[ABCD]$/i.test(answer.trim()))return {value:'multiple_choice',confidence:98,reason:'Bốn phương án và một khóa A–D'};
 if(answer.trim()&&answer.length<120)return {value:'short_answer',confidence:75,reason:'Khóa trả lời ngắn; cần giáo viên xác nhận dạng'};
 return {value:'essay',confidence:50,reason:'Chưa xác định cấu trúc trả lời; cần giáo viên chọn dạng'};
}
export async function enrichMetadata(client,raw,{autoThreshold}={}){
 let q=normalizeQuestion(raw);
 autoThreshold??=(await settings(client)).metadata_auto_threshold;
 if(q.type==='true_false'&&q.subitem_levels){const levels=[...new Set(Object.values(q.subitem_levels).map(levelNumber).filter(Boolean))];q.cognitive_classification=levels.length>1?'HỖN_HỢP':levels[0]?'M'+levels[0]:null;if(levels.length===1&&!q.cognitive_level)q.cognitive_level=levels[0];}
 if(!q.subject_id&&(q.subject_code||q.subject_hint||q.subject_text)){
  const hint=q.subject_code||q.subject_hint||q.subject_text;
  const matches=(await client.query('SELECT id FROM subjects WHERE lower(code)=lower($1) OR lower(name)=lower($1)',[hint])).rows;
  if(matches.length===1)q.subject_id=matches[0].id;
 }
 q.grade=q.grade||Number(q.grade_code||q.grade_hint)||null;
 const candidates=q.subject_id&&q.grade?await curriculumCatalog({subject_id:q.subject_id,grade:q.grade,topic_id:q.topic_id,domain_code:q.domain_code||({VL:'L',HH:'H',SH:'S'}[q.branch_code]||q.branch_code)},client):[];
 if(!q.yccd_id&&q.yccd_code){
  const aliases=(await client.query("SELECT entity_type,entity_id,old_code FROM curriculum_aliases WHERE old_code=ANY($1::text[])",[[q.yccd_code,q.outcome_code].filter(Boolean)])).rows;
  const found=candidates.filter(y=>(y.yccd_code===q.yccd_code||aliases.some(a=>a.entity_type==='yccd'&&a.entity_id===y.id&&a.old_code===q.yccd_code))&&(!q.outcome_code||y.outcome_code===q.outcome_code||aliases.some(a=>a.entity_type==='outcome'&&a.entity_id===y.outcome_id&&a.old_code===q.outcome_code)));
  if(found.length===1){q.yccd_id=found[0].id;q.outcome_id=found[0].outcome_id;q.branch_id=found[0].branch_id;}
 }
 const source=fold(q.stem+' '+q.explanation),tokens=new Set(source.split(/[^a-z0-9]+/).filter(t=>t.length>2));
 const suggestions=candidates.map(y=>{
  const target=fold(y.yccd_text),terms=new Set(target.split(/[^a-z0-9]+/).filter(t=>t.length>2));
  const overlap=[...terms].filter(t=>tokens.has(t)).length/Math.max(1,terms.size);
  return {id:y.id,outcome_id:y.outcome_id,branch_id:y.branch_id,code:y.yccd_code,label:y.yccd_label,text:y.yccd_text,confidence:source.includes(target)?96:Math.round(Math.min(85,overlap*85)),reason:source.includes(target)?'Nội dung trùng nguyên văn YCCĐ trong phạm vi đã chọn':'Từ khóa trùng trong đúng môn/khối/phân môn; chưa xác nhận ý nghĩa'};
 }).filter(s=>s.confidence>0).sort((a,b)=>b.confidence-a.confidence).slice(0,5);
 const detected=suggestType(q),level=Number.isInteger(raw.reasoning_steps)?{value:raw.reasoning_steps===0?1:raw.reasoning_steps===1?2:3,confidence:75,reason:'Số bước suy luận do người nhập cung cấp; cần kiểm tra ngữ cảnh'}:null;
 const autoApplied=[];
 if(!q.type&&detected.confidence>=autoThreshold){q.type=detected.value;delete q.answer;q=normalizeQuestion(q);autoApplied.push('type');}
 if(!q.yccd_id&&suggestions[0]?.confidence>=autoThreshold){Object.assign(q,{yccd_id:suggestions[0].id,outcome_id:suggestions[0].outcome_id,branch_id:suggestions[0].branch_id});autoApplied.push('yccd_id');}
 q.metadata_suggestions={yccds:suggestions,type:detected,cognitive_level:level,auto_applied:autoApplied,threshold:autoThreshold,requires_confirmation:true};
 return q;
}
