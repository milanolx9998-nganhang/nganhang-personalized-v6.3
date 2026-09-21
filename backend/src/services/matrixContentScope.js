import {resolveContentScope,normalizeContentScope,activeMapSQL} from './contentScopeV2.js';
import {matrixError} from './matrixValidation.js';
export async function resolveMatrixScope(raw,client){
 const source=normalizeContentScope(raw),resolved=await resolveContentScope(source,client),clauses=[];
 for(const c of resolved.clauses){
  if(c.mode==='legacy')throw matrixError('MATRIX_YCCD_REQUIRED','Ma trận mới cần chuẩn YCCĐ master');
  if(c.mode!=='all'){clauses.push(c);continue;}
  const rows=(await client.query("SELECT y.id FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id JOIN topic_yccd_map m ON m.yccd_id=y.id WHERE m.topic_id=$1 AND y.status='ACTIVE' AND o.status='ACTIVE' AND "+activeMapSQL()+" ORDER BY y.id",[c.topic_id])).rows;
  if(!rows.length)throw matrixError('MATRIX_MAPPING_EMPTY','Bài chưa có liên kết YCCĐ được công bố; không suy từ câu hỏi');
  clauses.push({topic_id:c.topic_id,mode:'yccds',yccd_ids:rows.map(y=>y.id)});
 }
 const yccd_ids=[...new Set(clauses.flatMap(c=>c.yccd_ids))].sort((a,b)=>a-b);
 const labels=(await client.query('SELECT y.id,y.code,y.text,o.code AS outcome_code,o.title AS outcome_title,o.curriculum_version FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id WHERE y.id=ANY($1::int[]) ORDER BY y.id',[yccd_ids])).rows;
 const topics=(await client.query('SELECT id,name FROM topics WHERE id=ANY($1::int[]) ORDER BY id',[clauses.map(c=>c.topic_id).filter(Boolean)])).rows;
 return {version:2,subject_id:source.subject_id,grade:source.grade,clauses,yccd_ids,labels,topics};
}
export const mappingChanged=(a,b)=>JSON.stringify(a?.clauses)!==JSON.stringify(b?.clauses);
