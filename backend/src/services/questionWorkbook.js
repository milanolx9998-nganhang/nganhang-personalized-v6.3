import XLSX from 'xlsx';
export function questionWorkbook(rows){
 const data=rows.map(q=>{const c=q.content||q.normalized_content||{};return {
 record_action:'UPDATE',question_id:q.id,question_version_id:q.current_version_id,
 question_text:c.stem??q.stem_text,question_type:c.type||q.q_type,cognitive_level:c.cognitive_level||q.cognitive_level||'',
 subject_id:q.subject_id||'',grade_code:q.grade||'',topic_id:q.topic_id||'',branch_id:q.branch_id||'',outcome_id:q.outcome_id||'',yccd_id:q.yccd_id||'',
 display_code:c.display_code||q.question_code,answer:c.answer?JSON.stringify(c.answer):(c.answer_key||q.answer_key||''),explanation:c.explanation||'',
 options:JSON.stringify(c.options||[]),statements:JSON.stringify(c.statements||[]),left:JSON.stringify(c.left||[]),right:JSON.stringify(c.right||[]),subitem_levels:JSON.stringify(c.subitem_levels||{}),media:JSON.stringify(c.media||[])
 };});
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data),'05_QUESTION_UPLOAD_ADV');
 return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
}
