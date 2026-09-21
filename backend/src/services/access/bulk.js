import {z} from 'zod';
import {tx} from '../../db/pool.js';
import {getEffectiveAccess} from '../accessResolver.js';
import {editableAssignments,previewAssignments,saveAssignments,assignmentsSchema} from './staff.js';
import {fail,log} from '../practice/config.js';
const id=z.number().int().positive();
export async function previewBulk(raw){
 const d=z.object({user_ids:z.array(id).min(1).max(100),school_year_id:id,subject_id:id.optional(),class_ids:z.array(id).min(1).max(100).optional(),position:assignmentsSchema.shape.positions.element.optional(),reason:z.string().trim().min(3).max(1000)}).strict().parse(raw),items=[];
 if(!d.position&&(!d.subject_id||!d.class_ids?.length))fail('Chọn vị trí hoặc môn và lớp');
 if(d.position&&d.subject_id)fail('Chỉ chọn một loại phân công trong một lượt');
 for(const userId of [...new Set(d.user_ids)].sort((a,b)=>a-b)){
  const a=await getEffectiveAccess(userId);if(a.user.role==='admin'||a.user.role==='student')fail('Phân công hàng loạt chỉ dành nhân sự nghiệp vụ');
  const draft=editableAssignments(a,d.school_year_id);draft.reason=d.reason;
  if(d.position){draft.positions.push(d.position);items.push({user_id:userId,draft,preview:await previewAssignments(userId,draft)});continue;}
  const matching=draft.teaching.filter(t=>t.subject_id===d.subject_id);
  if(matching.length>1)fail('Nhân sự có nhiều thời hạn cho môn này; mở hồ sơ để phân công riêng');
  if(matching.length)matching[0].class_ids=[...new Set([...matching[0].class_ids,...d.class_ids])];
  else draft.teaching.push({subject_id:d.subject_id,class_ids:d.class_ids});
  items.push({user_id:userId,draft,preview:await previewAssignments(userId,draft)});
 }
 return {items};
}
export async function saveBulk(actor,raw){
 const d=z.object({items:z.array(z.object({user_id:id,draft:assignmentsSchema}).strict()).min(1).max(100)}).strict().parse(raw);
 if(new Set(d.items.map(i=>i.user_id)).size!==d.items.length)fail('Danh sách nhân sự bị trùng');
 if(d.items.some(i=>i.draft.expected_access_version===undefined))fail('Phải xem trước để khóa phiên bản phân công');
 return tx(async c=>{const results=[];for(const item of [...d.items].sort((a,b)=>a.user_id-b.user_id)){
  const a=await getEffectiveAccess(item.user_id,c);if(['admin','student'].includes(a.user.role))fail('Chỉ gán hàng loạt nhân sự nghiệp vụ');
  results.push({user_id:item.user_id,...await saveAssignments(actor,item.user_id,item.draft,c)});
 }await log(c,actor,'STAFF_BULK_ASSIGNMENTS','batch',{user_ids:d.items.map(i=>i.user_id)});return {ok:true,results};});
}
export async function previewYearCopy(userId,raw){
 const d=z.object({source_year_id:id,target_year_id:id,class_map:z.array(z.object({from:id,to:id}).strict()).max(1000),reason:z.string().trim().min(3).max(1000)}).strict().parse(raw);
 if(d.source_year_id===d.target_year_id)fail('Chọn hai năm học khác nhau');
 const a=await getEffectiveAccess(userId),source=editableAssignments(a,d.source_year_id),draft=editableAssignments(a,d.target_year_id),year=a.org.years.find(y=>y.id===d.target_year_id);
 if(!year)fail('Năm học đích không tồn tại');
 if(draft.positions.length||draft.teaching.length)fail('Năm học đích đã có phân công. Sửa trực tiếp để không ghi đè');
 if(new Set(d.class_map.map(m=>m.from)).size!==d.class_map.length)fail('Một lớp nguồn chỉ ánh xạ một lần');
 const map=new Map(d.class_map.map(m=>[m.from,m.to]));
 for(const m of d.class_map)if(!a.org.classes.some(c=>c.id===m.from&&c.school_year_id===d.source_year_id)||!a.org.classes.some(c=>c.id===m.to&&c.school_year_id===d.target_year_id))fail('Lớp ánh xạ không thuộc năm nguồn/đích');
 const classes=ids=>(ids||[]).map(cid=>{if(!map.has(cid))fail('Phải chọn lớp đích cho mọi lớp nguồn');return map.get(cid);});
 const iso=v=>v instanceof Date?[v.getFullYear(),String(v.getMonth()+1).padStart(2,'0'),String(v.getDate()).padStart(2,'0')].join('-'):v;
 const dates={valid_from:iso(year.start_date)||a.now,...(year.end_date?{valid_to:iso(year.end_date)}:{})};
 draft.positions=source.positions.map(p=>({type:p.type,scope_type:p.scope_type,scope_payload:{...p.scope_payload,school_year_id:d.target_year_id,...(p.scope_payload.class_ids?{class_ids:classes(p.scope_payload.class_ids)}:{})},...dates}));
 draft.teaching=source.teaching.map(t=>({subject_id:t.subject_id,class_ids:classes(t.class_ids),...dates}));draft.reason=d.reason;
 if(!draft.positions.length&&!draft.teaching.length)fail('Năm nguồn không có phân công để sao chép');
 return {draft,preview:await previewAssignments(userId,draft),overrides_copied:false};
}
