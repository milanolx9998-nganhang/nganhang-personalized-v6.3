import {pool} from '../db/pool.js';
import {matrixError} from './matrixValidation.js';
const bad=(message,code='CONTENT_SCOPE_INVALID')=>{throw matrixError(code,message);};
const positive=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):bad('ID phạm vi không hợp lệ');
const ids=v=>{if(!Array.isArray(v)||!v.length||v.length>300)bad('Chọn ít nhất một mục, tối đa 300 mục');return [...new Set(v.map(positive))].sort((a,b)=>a-b);};
export function normalizeContentScope(raw){
 if(typeof raw==='string'){try{raw=JSON.parse(raw);}catch{bad('Phạm vi không phải JSON hợp lệ');}}
 if(!raw||typeof raw!=='object')bad('Thiếu phạm vi nội dung');
 raw=raw.content_scope_v2||raw.content_scope||raw;
 const subject_id=positive(raw.subject_id),grade=positive(raw.grade);if(grade>12)bad('Khối ngoài phạm vi');
 let clauses=raw.clauses;
 if(raw.version!=null&&raw.version!==2)bad('Phiên bản phạm vi chưa hỗ trợ');
 if(!clauses){
  clauses=raw.selection_mode==='yccd'?(raw.yccd_keys||[]).map(key=>{
   let k;try{k=JSON.parse(key);}catch{bad('Khóa YCCĐ cũ không hợp lệ');}
   if(k[0]==='master')return {topic_id:null,mode:'yccds',yccd_ids:[positive(k[1])]};
   if(k[0]==='node'&&k.length===2)return {topic_id:null,mode:'legacy',legacy_key:['node',positive(k[1])]};
   if(k[0]==='code'&&k.length===5)return {topic_id:positive(k[1]),mode:'legacy',legacy_key:k};
   return bad('Khóa YCCĐ cũ chưa hỗ trợ');
  }):(raw.topic_ids||[]).map(topic_id=>({topic_id,mode:'all'}));
 }
 if(!Array.isArray(clauses)||!clauses.length||clauses.length>100)bad('Chọn ít nhất một bài hoặc mục tiêu học tập (tối đa 100 mục)');
 const normalized=clauses.map(c=>{
  const topic_id=c.topic_id==null?null:positive(c.topic_id);
  if(c.mode==='all'){if(!topic_id)bad('Chọn cả bài cần ID bài');return {topic_id,mode:'all'};}
  if(c.mode==='outcomes')return {topic_id,mode:c.mode,outcome_ids:ids(c.outcome_ids)};
  if(c.mode==='yccds')return {topic_id,mode:c.mode,yccd_ids:ids(c.yccd_ids)};
  if(c.mode==='legacy'&&Array.isArray(c.legacy_key)){
   const k=c.legacy_key;
   if(k[0]==='node'&&k.length===2)return {topic_id,mode:'legacy',legacy_key:['node',positive(k[1])]};
   if(k[0]==='code'&&k.length===5&&k.slice(2).every(x=>typeof x==='string'&&x.length<500))return {topic_id:positive(k[1]),mode:'legacy',legacy_key:k};
  }
  bad('Cách chọn nội dung không hợp lệ');
 });
 return {version:2,subject_id,grade,clauses:[...new Map(normalized.map(c=>[JSON.stringify(c),c])).values()]};
}
export const activeMapSQL=(alias='m')=>alias+".status='ACTIVE' AND ("+alias+".valid_from IS NULL OR "+alias+".valid_from<=CURRENT_DATE) AND ("+alias+".valid_to IS NULL OR "+alias+".valid_to>=CURRENT_DATE)";
export async function validateContentScope(raw,client=pool){
 const s=normalizeContentScope(raw),topics=[...new Set(s.clauses.map(c=>c.topic_id).filter(Boolean))];
 if(topics.length){
  const rows=(await client.query("SELECT id FROM topics WHERE id=ANY($1::int[]) AND subject_id=$2 AND grade=$3 AND status='ACTIVE'",[topics,s.subject_id,s.grade])).rows;
  if(topics.some(id=>!rows.some(r=>r.id===id)))bad('Bài ngoài môn/khối hoặc đã lưu trữ','TOPIC_SCOPE_MISMATCH');
 }
 for(const c of s.clauses){
  if(c.mode==='outcomes'){
   const rows=(await client.query("SELECT id FROM curriculum_outcomes WHERE id=ANY($1::int[]) AND subject_id=$2 AND grade=$3 AND status='ACTIVE'",[c.outcome_ids,s.subject_id,s.grade])).rows;
   if(c.outcome_ids.some(id=>!rows.some(r=>r.id===id)))bad('Outcome không hoạt động trong môn/khối','OUTCOME_SCOPE_MISMATCH');
  }
  if(c.mode==='yccds'){
   const rows=(await client.query("SELECT y.id FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id WHERE y.id=ANY($1::int[]) AND o.subject_id=$2 AND o.grade=$3 AND y.status='ACTIVE' AND o.status='ACTIVE' AND ($4::int IS NULL OR EXISTS(SELECT 1 FROM topic_yccd_map m WHERE m.topic_id=$4 AND m.yccd_id=y.id AND "+activeMapSQL()+"))",[c.yccd_ids,s.subject_id,s.grade,c.topic_id])).rows;
   if(c.yccd_ids.some(id=>!rows.some(r=>r.id===id)))bad('YCCĐ không hoạt động hoặc chưa được liên kết với bài','TOPIC_YCCD_MISMATCH');
  }
 }
 return s;
}
export async function resolveContentScope(raw,client=pool){
 const s=await validateContentScope(raw,client),clauses=[];
 for(const c of s.clauses){
  if(c.mode!=='outcomes'){clauses.push(c);continue;}
  const rows=(await client.query("SELECT y.id FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id WHERE o.id=ANY($1::int[]) AND y.status='ACTIVE' AND o.status='ACTIVE' AND ($2::int IS NULL OR EXISTS(SELECT 1 FROM topic_yccd_map m WHERE m.topic_id=$2 AND m.yccd_id=y.id AND "+activeMapSQL()+")) ORDER BY y.id",[c.outcome_ids,c.topic_id])).rows;
  if(!rows.length)bad('Outcome chưa có YCCĐ được liên kết trong bài đã chọn','CONTENT_SCOPE_EMPTY');
  clauses.push({topic_id:c.topic_id,mode:'yccds',yccd_ids:rows.map(r=>r.id)});
 }
 return {...s,clauses};
}
// Parameterized SQL: OR across clauses, AND within a clause. Never flatten topic×YCCĐ.
export function compileQuestionScopeSQL(raw,alias='q',startIndex=1){
 if(!/^[a-z][a-z0-9_]*$/i.test(alias)||!Number.isInteger(startIndex)||startIndex<1)bad('Bí danh SQL không hợp lệ');
 const s=normalizeContentScope(raw),params=[],bind=v=>{params.push(v);return '$'+(startIndex+params.length-1);};
 const root=alias+'.subject_id='+bind(s.subject_id)+' AND '+alias+'.grade='+bind(s.grade);
 const clauses=s.clauses.map(c=>{
  const and=[];if(c.topic_id)and.push(alias+'.topic_id='+bind(c.topic_id));
  if(c.mode==='yccds')and.push(alias+'.yccd_id=ANY('+bind(c.yccd_ids)+'::int[])');
  if(c.mode==='outcomes')bad('Cần resolve Outcome trước khi biên dịch SQL');
  if(c.mode==='legacy'){
   const k=c.legacy_key;
   if(k[0]==='node')and.push((alias==='q'?'(SELECT taxonomy_node_id FROM question_versions WHERE id=COALESCE(q.active_version_id,q.current_version_id))':alias+'.taxonomy_node_id')+'='+bind(k[1]));
   else for(const [i,key] of [[2,'branch_code'],[3,'outcome'],[4,'yccd']])and.push("COALESCE("+alias+"."+(alias==='q'?'normalized_content':'content')+"->>'"+key+"','')="+bind(k[i]));
  }
  return '('+and.join(' AND ')+')';
 });
 return {sql:'('+root+' AND ('+clauses.join(' OR ')+'))',params};
}
export async function describeContentScope(raw,client=pool){
 const s=await validateContentScope(raw,client),names=(await client.query('SELECT id,name FROM topics WHERE id=ANY($1::int[])',[s.clauses.map(c=>c.topic_id).filter(Boolean)])).rows;
 return s.clauses.map(c=>({topic_id:c.topic_id,label:c.topic_id?names.find(t=>t.id===c.topic_id)?.name:'Mục tiêu xuyên bài',detail:c.mode==='all'?'Toàn bộ bài':c.mode==='outcomes'?c.outcome_ids.length+' nhóm mục tiêu':c.mode==='yccds'?c.yccd_ids.length+' yêu cầu cần đạt':'Phạm vi chuyển tiếp'}));
}
export async function activeCurriculumVersion(subject,grade,client=pool){
 return (await client.query("SELECT DISTINCT curriculum_version FROM curriculum_outcomes WHERE subject_id=$1 AND grade=$2 AND status='ACTIVE' ORDER BY curriculum_version",[subject,grade])).rows.map(r=>r.curriculum_version);
}
