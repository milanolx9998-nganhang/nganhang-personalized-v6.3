export const fields=['domain','outcome_code','outcome_title','code','text','group','page','order','notes'];
export function mapRows(rows,mapping,topicAsOutcome=false){
 return rows.map((row,index)=>{
  const value={};for(const field of fields)value[field]=Number.isInteger(mapping[field])?String(row[mapping[field]]??''):'';
  if(topicAsOutcome&&!value.outcome_title)value.outcome_title=value.group;
  return {...value,order:/^\d+$/.test(value.order)?Number(value.order):index,ignored:false};
 });
}
const normalized=s=>String(s||'').normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g,' ').trim();
export function validateRows(rows,existing=[]){
 const seen=[...existing],outcomes=new Map();
 return rows.map(value=>{
  const warnings=[];let status='READY';
  if(value.ignored)return {...value,row_status:'IGNORED',validation_result:[]};
  if(!value.text?.trim()||!value.outcome_title?.trim()){status='BLOCKED';warnings.push('Thiếu YCCĐ hoặc Outcome rõ ràng; giữ staging, chưa được commit');}
  const group=value.domain+'|'+(value.outcome_code||normalized(value.outcome_title));
  if(outcomes.has(group)&&outcomes.get(group)!==value.outcome_title){status='BLOCKED';warnings.push('Một mã Outcome có nhiều nội dung');}outcomes.set(group,value.outcome_title);
  for(const prior of seen){
   const sameGroup=prior.domain===value.domain&&(prior.outcome_code||normalized(prior.outcome_title))===(value.outcome_code||normalized(value.outcome_title));
   if(sameGroup&&value.code&&prior.code===value.code){status=prior.text===value.text?'DUPLICATE':'BLOCKED';warnings.push(prior.text===value.text?'Trùng mã và nội dung':'Cùng mã nhưng khác nội dung');break;}
   if(normalized(prior.text)===normalized(value.text)){if(status!=='BLOCKED')status='DUPLICATE';warnings.push('Trùng nội dung; cần sửa hoặc bỏ qua, không tự gộp');break;}
   const a=new Set(normalized(value.text).split(' ')),b=new Set(normalized(prior.text).split(' '));
   if(a.size>5&&[...a].filter(w=>b.has(w)).length/new Set([...a,...b]).size>.85){if(status==='READY')status='WARNING';warnings.push('Nội dung gần giống; cần người dùng rà soát');}
  }
  seen.push(value);
  return {...value,row_status:status,validation_result:warnings};
 });
}
