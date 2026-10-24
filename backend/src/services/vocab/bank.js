// Ngân hàng từ vựng: quản trị bộ từ / dòng từ và nhập CSV · JSON · XLSX (xem trước → xác nhận), tách khỏi ngân hàng câu hỏi.
import crypto from 'node:crypto';
import fs from 'node:fs';
import XLSX from 'xlsx';
import {z} from 'zod';
import {pool,tx} from '../../db/pool.js';
import {fail,log} from '../practice/config.js';
import {staff,subjectAccess} from '../practice/authorization.js';
import {can} from '../accessResolver.js';
import {safeZip} from '../practice/importAdapters.js';
import {clean,fold,isHan,hasToneMarks} from './generator.js';

// Cột chấp nhận (không phân biệt hoa thường, bỏ dấu cách/gạch).
const ALIASES={term:['word','term','tu','hanzi','chu_han','tu_vung'],meaning_vi:['meaning_vi','meaning','nghia','nghia_viet'],set:['set','bo_tu','topic_name','topic','unit','bai'],
 reading:['reading','ipa','pinyin','phien_am'],han_viet:['han_viet','hanviet'],pos:['pos','loai_tu','part_of_speech'],example:['example','vi_du','cau_vi_du'],example_vi:['example_vi','vi_du_nghia','dich_vi_du'],
 level:['hsk','level','cap','hsk_level'],source_ref:['id','source_ref','ma']};
// Bộ Bufopia dùng mã chủ đề làm tên; đổi sang tên dễ đọc.
const PRETTY={daily:'Daily life',school:'School',travel:'Travel',food:'Food',environment:'Environment',technology:'Technology',communication:'Communication',ielts:'IELTS',toeic:'TOEIC'};
const key=k=>String(k).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const previews=new Map(),TTL=15*60*1000;

export function parseVocabFile(file){
 const name=String(file?.originalname||'').toLowerCase();if(!file)fail('Chọn tệp CSV, JSON hoặc XLSX');
 const buffer=fs.readFileSync(file.path);let rows;
 if(name.endsWith('.json')){let data;try{data=JSON.parse(buffer.toString('utf8').replace(/^﻿/,''));}catch{fail('Tệp JSON không đọc được');}rows=Array.isArray(data)?data:Array.isArray(data?.entries)?data.entries:null;if(!rows)fail('JSON cần là danh sách từ');}
 else if(name.endsWith('.csv')){const wb=XLSX.read(buffer.toString('utf8').replace(/^﻿/,''),{type:'string',raw:true});if(!wb.SheetNames?.length)fail('Tệp CSV rỗng');rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:'',raw:false});}
 else if(name.endsWith('.xlsx')){safeZip(buffer);const wb=XLSX.read(buffer,{type:'buffer'});if(!wb.SheetNames?.length)fail('Tệp XLSX không có trang tính');rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:'',raw:false});}
 else fail('Chỉ nhận tệp .csv, .json hoặc .xlsx');
 if(!rows.length||rows.length>5000)fail('Tệp cần từ 1 đến 5000 dòng');
 return rows;
}
export function mapRow(raw,defaults={}){
 const by=Object.fromEntries(Object.entries(raw||{}).map(([k,v])=>[key(k),v])),pick=f=>{for(const a of ALIASES[f])if(by[a]!=null&&clean(by[a])!=='')return clean(by[a]);return '';};
 let set=pick('set')||clean(defaults.set);if(PRETTY[fold(set)])set=PRETTY[fold(set)];
 const level=pick('level')?Number(String(pick('level')).replace(/\D/g,'')):null;
 return {set,term:pick('term'),meaning_vi:pick('meaning_vi'),reading:pick('reading')||null,han_viet:pick('han_viet')||null,pos:pick('pos')||null,example:pick('example')||null,example_vi:pick('example_vi')||null,level:Number.isInteger(level)&&level>=1&&level<=9?level:null,source_ref:pick('source_ref')||null};
}
function rowErrors(r){
 const e=[];if(!r.term)e.push('Thiếu từ');if(!r.meaning_vi)e.push('Thiếu nghĩa');if(!r.set&&!r.level)e.push('Thiếu bộ từ / cấp HSK');
 if(r.term.length>120)e.push('Từ quá dài');if(r.meaning_vi.length>300)e.push('Nghĩa quá dài');if(r.set.length>120)e.push('Tên bộ quá dài');
 // Trợ từ khinh thanh một chữ (的 de, 吗 ma, 呢 ne, 吧 ba…) không có dấu thanh nên được chấp nhận.
 if(isHan(r.term)&&r.reading&&!hasToneMarks(r.reading)&&!/[1-5]/.test(r.reading)&&[...r.term].length>1)e.push('Pinyin cần có dấu thanh (vd nǐ hǎo)');
 return e;
}
const setName=r=>r.set||`HSK ${r.level}`;
const entryKey=(set,r)=>`${fold(set)}|${fold(r.term)}|${clean(r.meaning_vi)}`;
const FIELDS=['reading','han_viet','pos','example','example_vi'];

async function subjectOf(user,subjectId,client=pool,write=true){
 staff(user);const s=(await client.query('SELECT id,name,code FROM subjects WHERE id=$1',[subjectId])).rows[0];if(!s)fail('Không tìm thấy môn',404);
 await subjectAccess(user,s.id);
 if(write&&user.role!=='admin'&&!await can(user,'content.write',{subjectId:s.id}))fail('Cần quyền soạn nội dung môn này',403);
 return s;
}
async function inspect(client,subject,rows,defaults){
 const sets=new Map((await client.query('SELECT id,name FROM vocab_sets WHERE subject_id=$1',[subject.id])).rows.map(s=>[fold(s.name),s]));
 const existing=new Map((await client.query('SELECT e.*,s.name AS set_name FROM vocab_entries e JOIN vocab_sets s ON s.id=e.set_id WHERE s.subject_id=$1',[subject.id])).rows.map(e=>[entryKey(e.set_name,e),e]));
 const seen=new Set();
 return rows.map((raw,i)=>{
  const r=mapRow(raw,defaults),errors=rowErrors(r),k=entryKey(setName(r),r),old=existing.get(k);
  let status=errors.length?'ERROR':seen.has(k)?'DUPLICATE':!old?'NEW':old.status!=='approved'||FIELDS.some(f=>r[f]&&clean(old[f])!==r[f])?'UPDATE':'SAME';seen.add(k);
  return {row:i+2,...r,set:setName(r),new_set:!sets.has(fold(setName(r))),status,errors};
 });
}
export async function previewImport(user,{subject_id,rows,source=null,set=null}){
 const subject=await subjectOf(user,subject_id),now=Date.now();for(const [t,p] of previews)if(p.expires<now)previews.delete(t);
 if(previews.size>=50)fail('Có nhiều bản xem trước đang chờ, thử lại sau',429);
 const checked=await inspect(pool,subject,rows,{set}),token=crypto.randomUUID();
 previews.set(token,{actor:user.id,subject_id:subject.id,rows,source,set,expires:now+TTL});
 const summary=Object.fromEntries(['NEW','UPDATE','SAME','DUPLICATE','ERROR'].map(s=>[s.toLowerCase(),checked.filter(r=>r.status===s).length]));
 return {token,expires_at:new Date(now+TTL).toISOString(),subject:{id:subject.id,name:subject.name},summary,new_sets:[...new Set(checked.filter(r=>r.new_set&&r.status!=='ERROR').map(r=>r.set))],rows:checked,can_confirm:summary.new+summary.update>0};
}
export async function confirmImport(user,token){
 z.string().uuid().parse(token);const p=previews.get(token);if(!p||p.expires<Date.now())fail('Bản xem trước đã hết hạn, hãy tải lại tệp',410);if(p.actor!==user.id)fail('Bản xem trước của người khác',403);
 previews.delete(token); // lấy token ra khỏi bảng ngay: bấm đúp không chạy hai giao dịch song song
 let result;
 try{
 const subject=await subjectOf(user,p.subject_id);
 result=await tx(async client=>{
  const checked=await inspect(client,subject,p.rows,{set:p.set}),sets=new Map((await client.query('SELECT id,name FROM vocab_sets WHERE subject_id=$1',[subject.id])).rows.map(s=>[fold(s.name),s.id]));
  let created=0,updated=0,newSets=0;
  for(const r of checked.filter(r=>['NEW','UPDATE'].includes(r.status))){
   let setId=sets.get(fold(r.set));
   if(!setId){setId=(await client.query(`INSERT INTO vocab_sets(subject_id,name,kind,level,source,created_by,order_index) VALUES($1,$2,$3,$4,$5,$6,(SELECT COALESCE(max(order_index),0)+1 FROM vocab_sets WHERE subject_id=$1)) RETURNING id`,
    [subject.id,r.set,r.level?'hsk':'topic',r.level,p.source,user.id])).rows[0].id;sets.set(fold(r.set),setId);newSets++;}
   const values=[setId,r.term,r.reading,r.han_viet,r.pos,r.meaning_vi,r.example,r.example_vi,p.source,r.source_ref,user.id];
   const hit=(await client.query(`UPDATE vocab_entries SET reading=COALESCE($3,reading),han_viet=COALESCE($4,han_viet),pos=COALESCE($5,pos),example=COALESCE($7,example),example_vi=COALESCE($8,example_vi),status='approved',updated_by=$9,updated_at=now()
    WHERE set_id=$1 AND lower(term)=lower($2) AND meaning_vi=$6 RETURNING id`,[...values.slice(0,8),user.id])).rowCount;
   if(hit)updated++;else{await client.query(`INSERT INTO vocab_entries(set_id,term,reading,han_viet,pos,meaning_vi,example,example_vi,source,source_ref,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,values);created++;}
  }
  await log(client,user,'VOCAB_IMPORT',token,{subject_id:subject.id,created,updated,new_sets:newSets,source:p.source});
  return {created,updated,new_sets:newSets};
 });
 }catch(e){previews.set(token,p);throw e;}
 return result;
}

export async function overview(user){
 staff(user);
 const rows=(await pool.query(`SELECT s.id,s.name,s.code,count(DISTINCT v.id)::int AS set_count,count(e.id) FILTER (WHERE e.status='approved')::int AS entry_count
  FROM subjects s LEFT JOIN vocab_sets v ON v.subject_id=s.id LEFT JOIN vocab_entries e ON e.set_id=v.id
  WHERE s.code IN ('TiengAnh','TiengTrung') OR lower(s.name) LIKE 'tiếng anh%' OR lower(s.name) LIKE 'tiếng trung%' OR v.id IS NOT NULL
  GROUP BY s.id ORDER BY s.name`)).rows;
 const visible=[];for(const s of rows)if(user.role==='admin'||await subjectAccess(user,s.id).then(()=>true,()=>false))visible.push(s);
 return visible;
}
export async function listSets(user,subjectId){
 await subjectOf(user,subjectId,pool,false);
 return (await pool.query(`SELECT s.*,count(e.id) FILTER (WHERE e.status='approved')::int AS entry_count,count(e.id) FILTER (WHERE e.status='retired')::int AS retired_count
  FROM vocab_sets s LEFT JOIN vocab_entries e ON e.set_id=s.id WHERE s.subject_id=$1 GROUP BY s.id ORDER BY s.kind,s.level NULLS LAST,s.order_index,s.name`,[subjectId])).rows;
}
const setPatch=z.object({name:z.string().trim().min(1).max(120).optional(),kind:z.enum(['topic','unit','hsk']).optional(),level:z.number().int().min(1).max(9).nullable().optional(),grade_min:z.number().int().min(1).max(12).nullable().optional(),grade_max:z.number().int().min(1).max(12).nullable().optional(),topic_id:z.number().int().positive().nullable().optional(),status:z.enum(['active','hidden']).optional(),order_index:z.number().int().min(0).max(100000).optional()}).strict();
const dupName=e=>{if(e?.code==='23505')fail('Môn này đã có bộ từ trùng tên',409);throw e;};
export async function createSet(user,body){
 const d=setPatch.extend({subject_id:z.number().int().positive(),name:z.string().trim().min(1).max(120)}).parse(body);await subjectOf(user,d.subject_id);
 return tx(async c=>{const row=(await c.query(`INSERT INTO vocab_sets(subject_id,name,kind,level,grade_min,grade_max,topic_id,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
  [d.subject_id,d.name,d.kind||'topic',d.level??null,d.grade_min??null,d.grade_max??null,d.topic_id??null,d.status||'active',user.id])).rows[0];await log(c,user,'VOCAB_SET_CREATE',row.id,d);return row;}).catch(dupName);
}
export async function updateSet(user,id,body){
 const d=setPatch.parse(body),old=(await pool.query('SELECT * FROM vocab_sets WHERE id=$1',[id])).rows[0];if(!old)fail('Không tìm thấy bộ từ',404);await subjectOf(user,old.subject_id);
 const next={...old,...d};if(next.grade_min!=null&&next.grade_max!=null&&next.grade_min>next.grade_max)fail('Khối nhỏ nhất phải ≤ khối lớn nhất');
 return tx(async c=>{const row=(await c.query(`UPDATE vocab_sets SET name=$2,kind=$3,level=$4,grade_min=$5,grade_max=$6,topic_id=$7,status=$8,order_index=$9,updated_at=now() WHERE id=$1 RETURNING *`,
  [id,next.name,next.kind,next.level,next.grade_min,next.grade_max,next.topic_id,next.status,next.order_index])).rows[0];await log(c,user,'VOCAB_SET_UPDATE',id,d);return row;}).catch(dupName);
}
export async function listEntries(user,q){
 const d=z.object({set_id:z.coerce.number().int().positive(),q:z.string().max(100).optional(),status:z.enum(['approved','draft','retired']).optional(),page:z.coerce.number().int().min(1).max(1000).default(1)}).parse(q);
 const set=(await pool.query('SELECT * FROM vocab_sets WHERE id=$1',[d.set_id])).rows[0];if(!set)fail('Không tìm thấy bộ từ',404);await subjectOf(user,set.subject_id,pool,false);
 const where=`set_id=$1 AND ($2::text IS NULL OR lower(term) LIKE '%'||lower($2)||'%' OR lower(meaning_vi) LIKE '%'||lower($2)||'%' OR lower(coalesce(reading,'')) LIKE '%'||lower($2)||'%') AND ($3::text IS NULL OR status=$3)`,args=[d.set_id,d.q||null,d.status||null];
 const total=(await pool.query(`SELECT count(*)::int AS n FROM vocab_entries WHERE ${where}`,args)).rows[0].n;
 const entries=(await pool.query(`SELECT * FROM vocab_entries WHERE ${where} ORDER BY status='retired',id LIMIT 100 OFFSET $4`,[...args,(d.page-1)*100])).rows;
 return {set,total,page:d.page,page_size:100,entries};
}
const entryPatch=z.object({term:z.string().trim().min(1).max(120).optional(),meaning_vi:z.string().trim().min(1).max(300).optional(),reading:z.string().trim().max(120).nullable().optional(),han_viet:z.string().trim().max(120).nullable().optional(),pos:z.string().trim().max(40).nullable().optional(),example:z.string().trim().max(500).nullable().optional(),example_vi:z.string().trim().max(500).nullable().optional(),confusable_group:z.string().trim().max(80).nullable().optional(),status:z.enum(['approved','draft','retired']).optional()}).strict();
export async function updateEntry(user,id,body){
 const d=entryPatch.parse(body),old=(await pool.query('SELECT e.*,s.subject_id FROM vocab_entries e JOIN vocab_sets s ON s.id=e.set_id WHERE e.id=$1',[id])).rows[0];if(!old)fail('Không tìm thấy từ',404);await subjectOf(user,old.subject_id);
 const next=Object.fromEntries(Object.entries({...old,...d}).map(([k,v])=>[k,typeof v==='string'?clean(v)||null:v]));if(!next.term||!next.meaning_vi)fail('Cần từ và nghĩa');
 return tx(async c=>{
  if((await c.query('SELECT 1 FROM vocab_entries WHERE set_id=$1 AND lower(term)=lower($2) AND meaning_vi=$3 AND id<>$4',[old.set_id,next.term,next.meaning_vi,id])).rowCount)fail('Bộ đã có từ này với cùng nghĩa',409);
  const row=(await c.query(`UPDATE vocab_entries SET term=$2,meaning_vi=$3,reading=$4,han_viet=$5,pos=$6,example=$7,example_vi=$8,confusable_group=$9,status=$10,updated_by=$11,updated_at=now() WHERE id=$1 RETURNING *`,
   [id,next.term,next.meaning_vi,next.reading,next.han_viet,next.pos,next.example,next.example_vi,next.confusable_group,next.status,user.id])).rows[0];
  await log(c,user,'VOCAB_ENTRY_UPDATE',id,d);return row;
 });
}
export function templateWorkbook(lang='en'){
 const rows=lang==='zh'
  ?[{hsk:1,bo_tu:'HSK 1',hanzi:'你好',pinyin:'nǐ hǎo',han_viet:'nhĩ hảo',loai_tu:'cụm từ',nghia:'xin chào',vi_du:'你好，老师！',vi_du_nghia:'Chào thầy/cô!'}]
  :[{bo_tu:'Unit 1: My new school',word:'uniform',ipa:'ˈjuːnɪfɔːm',loai_tu:'n',nghia:'đồng phục',vi_du:'We wear uniforms on Monday.',vi_du_nghia:'Chúng em mặc đồng phục vào thứ Hai.'}];
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'tu-vung');return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
}
