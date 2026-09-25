import {pool} from '../db/pool.js';
import {matrixError} from './matrixValidation.js';
import {outcomeLabelSql,yccdLabelSql} from './curriculumLabel.js';
export async function curriculumCatalog(query={},client=pool){
 const params=[],where=["o.status='ACTIVE'","y.status='ACTIVE'"];
 for(const [key,column] of Object.entries({subject_id:'o.subject_id',grade:'o.grade',domain_code:'o.domain_code',outcome_id:'o.id',curriculum_version:'o.curriculum_version'}))if(query[key]){params.push(query[key]);where.push(column+'=$'+params.length);}
 if(query.topic_id){params.push(query.topic_id);where.push("EXISTS(SELECT 1 FROM topic_yccd_map m WHERE m.topic_id=$"+params.length+" AND m.yccd_id=y.id AND m.status='ACTIVE' AND (m.valid_from IS NULL OR m.valid_from<=CURRENT_DATE) AND (m.valid_to IS NULL OR m.valid_to>=CURRENT_DATE))");}
 return (await client.query(`SELECT y.*,y.code AS yccd_code,y.text AS yccd_text,o.code AS outcome_code,${outcomeLabelSql('o')} AS outcome_label,${yccdLabelSql('y','o')} AS yccd_label,o.title AS outcome_title,o.subject_id,o.grade,o.domain_code,o.curriculum_version,o.source_document,
 (SELECT b.id FROM branches b WHERE b.subject_id=o.subject_id AND (CASE b.code WHEN 'VL' THEN 'L' WHEN 'HH' THEN 'H' WHEN 'SH' THEN 'S' ELSE b.code END)=o.domain_code ORDER BY b.id LIMIT 1) AS branch_id
 FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id WHERE ${where.join(' AND ')} ORDER BY o.domain_code,o.order_index,y.order_index,y.id`,params)).rows;
}
export async function validateCurriculum(client,meta,{required=false}={}){
 if(!meta.yccd_id){if(required)throw matrixError('YCCD_REQUIRED','Chọn YCCĐ chuẩn trước khi duyệt/kích hoạt');return null;}
 const row=(await client.query('SELECT y.*,o.subject_id,o.grade,o.domain_code,o.status AS outcome_status FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id WHERE y.id=$1',[meta.yccd_id])).rows[0];
 if(!row||row.status!=='ACTIVE'||row.outcome_status!=='ACTIVE'||Number(meta.outcome_id)!==row.outcome_id||Number(meta.subject_id)!==row.subject_id||Number(meta.grade)!==row.grade)throw matrixError('YCCD_SCOPE_MISMATCH','YCCĐ không khớp Outcome, môn hoặc khối');
 if(row.domain_code){
  const branch=(await client.query('SELECT * FROM branches WHERE id=$1',[meta.branch_id])).rows[0];
  if(!branch||branch.subject_id!==row.subject_id||({VL:'L',HH:'H',SH:'S'}[branch.code]||branch.code)!==row.domain_code)throw matrixError('YCCD_DOMAIN_MISMATCH','Phân môn không khớp YCCĐ');
 }
 if(meta.topic_id&&!(await client.query('SELECT 1 FROM topics WHERE id=$1 AND subject_id=$2 AND grade=$3 AND ($4::int IS NULL OR branch_id=$4)',[meta.topic_id,row.subject_id,row.grade,meta.branch_id||null])).rowCount)throw matrixError('TOPIC_SCOPE_MISMATCH','Bài không thuộc môn/khối/phân môn đã chọn');
 if(required){if(!meta.topic_id||!(await client.query("SELECT 1 FROM topic_yccd_map m JOIN topics t ON t.id=m.topic_id WHERE m.topic_id=$1 AND m.yccd_id=$2 AND t.status='ACTIVE' AND m.status='ACTIVE' AND (m.valid_from IS NULL OR m.valid_from<=CURRENT_DATE) AND (m.valid_to IS NULL OR m.valid_to>=CURRENT_DATE)",[meta.topic_id,meta.yccd_id])).rowCount)throw matrixError('TOPIC_YCCD_MISMATCH','Bài và YCCĐ chưa có liên kết đang hoạt động; cần quản trị xác nhận');}
 return row;
}
export async function validateMatrixCurriculum(client,matrix){
 const ids=matrix.yccd_scope||[...new Set((matrix.cells||[]).map(c=>c.yccd_id).filter(Boolean))];
 for(const id of ids){
  const found=(await curriculumCatalog({subject_id:matrix.subject_id,grade:matrix.grade},client)).find(y=>y.id===Number(id));
  if(!found)throw matrixError('MATRIX_YCCD_SCOPE','Phạm vi YCCĐ khác môn/khối');
 }
 for(const cell of matrix.cells||[]){
  if(cell.yccd_id&&!ids.includes(cell.yccd_id))throw matrixError('MATRIX_YCCD_SCOPE','Ô nằm ngoài phạm vi YCCĐ đã tick');
  await validateCurriculum(client,{...matrix,...cell});
 }
 return ids;
}
