import {storage,sourceKey} from '../storage/index.js';
import {getEffectiveAccess,contentFilterSQL} from '../accessResolver.js';
import {enrichMetadata,validateDraft} from '../smartMetadata.js';
import {resolveQuestionFromCode,applyResolution} from '../curriculumResolver.js';
import {parseQuestionCode,inferNumberingMode,checkNumbering} from '../questionCode.js';
import crypto from 'node:crypto';
import {bankFilter} from '../../middleware/bankScope.js';
import {duplicateSignals} from './duplicates.js';
import {Worker} from 'node:worker_threads';
import path from 'node:path';
import fs from 'node:fs/promises';
import {pool,tx} from '../../db/pool.js';
import {normalizeQuestion,validateQuestion} from './grading.js';
import {persistQuestion} from './questions.js';
import {staff,subjectAccess} from './authorization.js';
import {fail,log} from './config.js';
const root=path.resolve(process.env.UPLOAD_DIR||'uploads');
async function parseInWorker(file,sheetName=''){return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./importWorker.js',import.meta.url),{workerData:{path:file.path,filename:file.originalname,sheetName},resourceLimits:{maxOldGenerationSizeMb:256}});const timer=setTimeout(()=>{worker.terminate();reject(new Error('Tệp quá phức tạp; thời gian phân tích vượt 60 giây'));},60000);worker.once('message',msg=>{clearTimeout(timer);msg.error?reject(new Error(msg.error)):resolve(msg.result);});worker.once('error',e=>{clearTimeout(timer);reject(e);});});}
async function enrich(client,draft,bulk={}){
 let q=normalizeQuestion({...draft,...Object.fromEntries(Object.entries(bulk).filter(([,v])=>v!==''&&v!=null))});
 if(!q.subject_id&&q.subject_text)q.subject_id=(await client.query('SELECT id FROM subjects WHERE name=$1 OR code=$1',[q.subject_text])).rows[0]?.id;
 if(!q.topic_id&&q.subject_id&&q.sub_topic){const found=(await client.query('SELECT id FROM topics WHERE subject_id=$1 AND grade=$2 AND name=$3',[q.subject_id,q.grade,q.sub_topic])).rows;if(found.length===1)q.topic_id=found[0].id;}
 // V6.6.5 — mã câu quyết định Outcome/YCCĐ trong ngữ cảnh Môn + Khối của phiên nhập; Bài đến sau,
 // qua topic_yccd_map. Chạy trước enrichMetadata để mã tường minh thắng gợi ý theo từ khóa.
 const rawCode=q.display_code||draft.display_code||draft.question_code||'';
 let resolution=null,conflicts=[];
 if(rawCode&&q.subject_id&&q.grade){
  resolution=await resolveQuestionFromCode(client,rawCode,{subject_id:q.subject_id,grade:q.grade});
  if(resolution.ok){const applied=applyResolution(q,resolution);q=normalizeQuestion(applied.draft);conflicts=applied.conflicts;}
 }
 const profile=q.subject_id?(await client.query('SELECT config FROM subject_profiles WHERE subject_id=$1',[q.subject_id])).rows[0]?.config||{}:{};
 q=await enrichMetadata(client,q);const validation=validateDraft(q,profile);validation.warnings.push(...q.parser_warnings||[]);
 if(resolution)Object.assign(validation,resolutionOutcome(resolution,conflicts,validation));
 if(validation.warnings.length&&validation.status==='VALID')validation.status='WARNING';
 return {q,validation};
}
// Chuyển kết quả resolve thành trạng thái dòng staging.
// Chặn khi mã đọc được nhưng chuẩn chương trình không tồn tại — tuyệt đối không tự tạo Outcome/YCCĐ.
// Mã không đọc được chỉ là "cần xem": nhiều tệp cũ chưa theo quy ước mã hiện hành.
function resolutionOutcome(resolution,conflicts,validation){
 const errors=[...validation.errors],warnings=[...validation.warnings];
 for(const w of resolution.warnings||[])warnings.push(w.message);
 if(!resolution.ok){
  if(resolution.stage==='CURRICULUM'){errors.push(resolution.message);return {errors,warnings,status:'ERROR',resolution:{state:'BLOCKED',error:resolution.error}};}
  warnings.push(resolution.message);
  return {errors,warnings,status:errors.length?'ERROR':'NEEDS_REVIEW',resolution:{state:'CODE_UNREADABLE',error:resolution.error}};
 }
 for(const c of conflicts)warnings.push(`Mã câu và metadata không khớp ở ${c.field}: theo mã #${c.by_code}, theo metadata #${c.by_metadata}`);
 const lesson=resolution.lesson;
 if(lesson.status==='AMBIGUOUS')warnings.push(`YCCĐ ${resolution.curriculum.yccd.label} được dùng ở ${lesson.candidates.length} bài; cần chọn Bài`);
 if(lesson.status==='UNMAPPED')warnings.push(`YCCĐ ${resolution.curriculum.yccd.label} chưa gắn Bài; câu vẫn được nhập kho`);
 const state=errors.length?'BLOCKED':conflicts.length||lesson.status==='AMBIGUOUS'?'NEEDS_REVIEW':'RESOLVED';
 return {
  errors,warnings,
  status:errors.length?'ERROR':state==='NEEDS_REVIEW'?'NEEDS_REVIEW':validation.status,
  resolution:{
   state,
   branch:resolution.curriculum.branch?.name||null,
   outcome:resolution.curriculum.outcome.label,
   outcome_title:resolution.curriculum.outcome.title,
   yccd:resolution.curriculum.yccd.label,
   yccd_text:resolution.curriculum.yccd.text,
   level:resolution.code.declared_level,
   form:resolution.code.question_form,
   content_number:resolution.code.content_number,
   lesson_status:lesson.status,
   lesson:lesson.topic?{id:lesson.topic.id,name:lesson.topic.name}:null,
   lesson_candidates:lesson.candidates.map(t=>({id:t.id,name:t.name,chapter:t.chapter})),
   conflicts,
  },
 };
}
async function findDuplicates(client,user,q){
 const params=[q.subject_id||null,q.stem,q.display_code||null];const scope=bankFilter(user,'q',params),subjectScope=await contentFilterSQL(user,'q',params,'content.read',client);
 const rows=(await client.query(`SELECT q.* FROM questions q WHERE q.subject_id=$1 AND (lower(regexp_replace(q.stem_text,'\\s+',' ','g'))=lower(regexp_replace($2,'\\s+',' ','g')) OR ($3::text IS NOT NULL AND (q.normalized_content->>'display_code'=$3 OR q.question_code=$3))) AND ${scope} AND ${subjectScope} ORDER BY q.id DESC LIMIT 30`,params)).rows;
 return rows.map(row=>({id:row.id,question_code:row.question_code,current_version_id:row.current_version_id,signals:duplicateSignals(q,normalizeQuestion(row.normalized_content||row))}));
}
export async function parseJob(user,file,bulk){
 staff(user);if(!user.capabilities?.['content.write'])fail('Không có quyền nhập câu hỏi',403);if(!file)fail('Chưa chọn tệp');let parsed;
 try{parsed=await parseInWorker(file);}catch(e){await log(pool,user,'IMPORT_PARSE_ERROR',file.originalname,{error:e.message});fail(e.message);}
 const storedSource=sourceKey(file.path);if(!await storage.exists(storedSource))await storage.put(storedSource,await fs.readFile(file.path));
 return tx(async client=>{
  const job=(await client.query('INSERT INTO import_jobs(created_by,parser_type,source_name,source_path) VALUES($1,$2,$3,$4) RETURNING *',[user.id,path.extname(file.originalname),file.originalname,storedSource])).rows[0];
  const media=[];await fs.mkdir(path.join(root,'media'),{recursive:true});
  for(const m of parsed.media){const key=m.checksum+'.'+m.ext;if(!await storage.exists('media/'+key))await storage.put('media/'+key,Buffer.from(m.data,'base64'),m.mime);const row=(await client.query('INSERT INTO media_assets(storage_key,original_filename,mime,size_bytes,checksum,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(checksum) DO UPDATE SET checksum=EXCLUDED.checksum RETURNING *',[key,m.filename,m.mime,Buffer.from(m.data,'base64').length,m.checksum,user.id])).rows[0];media.push({...row,url:m.url});}
  for(let i=0;i<parsed.items.length;i++){
   const {q,validation}=await enrich(client,parsed.items[i],bulk);q.media=media.filter(m=>JSON.stringify(q).includes(m.url)).map((m,index)=>({id:m.id,location:'content',order:index}));
   const duplicates=await findDuplicates(client,user,q);
   await client.query('INSERT INTO import_items(job_id,sequence,draft,validation,duplicate_candidates) VALUES($1,$2,$3,$4,$5)',[job.id,i+1,JSON.stringify(q),JSON.stringify(validation),JSON.stringify(duplicates)]);
  }
  await log(client,user,'IMPORT_PARSED',job.id,{count:parsed.items.length});return job;
 });
}
// Kiểm cách đánh số của cả lô. Tính khi đọc nên không cần cột mới và luôn phản ánh bản nháp hiện tại.
// Chỉ cảnh báo: mã câu là do người soạn đặt, hệ thống không tự sửa (§13, §33).
export function batchNumbering(items){
 const parsed=items.map(i=>parseQuestionCode(i.draft?.display_code||''));
 const coded=parsed.filter(p=>p.ok);
 if(coded.length<2)return {mode:'CUSTOM',scope:'NONE',issues:[],coded:coded.length,total:items.length};
 const mode=inferNumberingMode(parsed);
 const {issues,scope}=checkNumbering(parsed,mode);
 return {mode,scope,issues,coded:coded.length,total:items.length};
}
export async function getJob(user,id,client=pool){const job=(await client.query('SELECT * FROM import_jobs WHERE id=$1',[id])).rows[0];if(!job||job.created_by!==user.id&&user.role!=='admin')fail('Không có quyền với lần nhập này',403);job.items=(await client.query('SELECT * FROM import_items WHERE job_id=$1 ORDER BY sequence',[id])).rows;job.numbering=batchNumbering(job.items);return job;}
// §30 — reloading the browser must not lose a staging job. Visibility matches getJob(): a teacher
// only ever sees their own jobs, so the list cannot be used to discover someone else's batch.
export async function listJobs(user,query={}){
 staff(user);const params=[],where=[];
 if(user.role!=='admin'){params.push(user.id);where.push('j.created_by=$'+params.length);}
 else if(query.created_by){params.push(Number(query.created_by));where.push('j.created_by=$'+params.length);}
 if(query.status){params.push(query.status);where.push('j.status=$'+params.length);}
 params.push(Math.min(50,Math.max(1,Number(query.limit)||20)));
 return (await pool.query(`SELECT j.id,j.source_name,j.parser_type,j.status,j.created_at,j.confirmed_at,j.created_by,
  count(i.id)::int AS item_count,
  count(i.id) FILTER(WHERE i.validation->>'status'='ERROR')::int AS error_count,
  count(i.result_question_id)::int AS imported_count
  FROM import_jobs j LEFT JOIN import_items i ON i.job_id=j.id
  ${where.length?'WHERE '+where.join(' AND '):''}
  GROUP BY j.id ORDER BY j.created_at DESC LIMIT $${params.length}`,params)).rows;
}
export async function editJob(user,id,changes){staff(user);return tx(async client=>{await client.query('SELECT id FROM import_jobs WHERE id=$1 FOR UPDATE',[id]);const job=await getJob(user,id,client);if(job.status!=='preview')fail('Lần nhập đã xác nhận');for(const item of job.items){const change=changes.items?.find(i=>i.id===item.id);const {q,validation}=await enrich(client,{...item.draft,...change?.draft},!changes.bulk_ids||changes.bulk_ids.includes(item.id)?changes.bulk||{}:{});const duplicates=await findDuplicates(client,user,q);const decision=change?.decision||item.decision;if(!['import','skip','version','replace'].includes(decision))fail('Lựa chọn xử lý trùng không hợp lệ');await client.query('UPDATE import_items SET draft=$1,validation=$2,decision=$3,duplicate_candidates=$5 WHERE id=$4',[JSON.stringify(q),JSON.stringify(validation),decision,item.id,JSON.stringify(duplicates)]);}return {ok:true};});}
export async function confirmJob(user,id,ids,bankId){staff(user);return tx(async client=>{
 await client.query('SELECT id FROM import_jobs WHERE id=$1 FOR UPDATE',[id]);const job=await getJob(user,id,client);
 // §31 — the caller needs the batch back, not just a count, so the UI can open exactly what was imported.
 if(job.status==='confirmed'){const done=job.items.filter(i=>i.result_question_id);return {ok:true,job_id:id,imported:done.length,question_ids:done.map(i=>i.result_question_id)};}
 const checksum=crypto.createHash('sha256').update(await storage.get(sourceKey(job.source_path))).digest('hex');
 const items=job.items.filter(i=>ids.includes(i.id)&&i.decision!=='skip');if(!items.length)fail('Chọn ít nhất một câu hợp lệ');
 const questionIds=[];
 // Chế độ đánh số là thuộc tính của cả lô, nên suy một lần rồi gắn cho từng câu.
 const numbering=batchNumbering(items);
 for(const item of items){const {q,validation}=await enrich(client,{...item.draft,numbering_mode:item.draft?.numbering_mode||numbering.mode});if(validation.errors.length)fail(`Câu ${item.sequence}: ${validation.errors.join('; ')}`);if(q.subject_id)await subjectAccess(user,q.subject_id);const duplicateAction=['version','replace'].includes(item.decision);const isUpdate=q.record_action==='UPDATE';const duplicateId=isUpdate?Number(q.question_id):duplicateAction?item.duplicate_candidates[0]?.id:null;if(isUpdate&&(!duplicateId||!q.question_version_id))fail('UPDATE cần question_id và question_version_id');if(duplicateAction&&!duplicateId)fail('Không có bản gốc để tạo version');const result=await persistQuestion(client,user,q,{id:duplicateId,bankId,source:{type:job.parser_type,path:job.source_path,locator:q.source_locator,checksum}});await client.query('UPDATE import_items SET result_question_id=$1 WHERE id=$2',[result.id,item.id]);questionIds.push(result.id);await log(client,user,'IMPORT_DUPLICATE_DECISION',item.id,{decision:item.decision,candidates:item.duplicate_candidates.map(c=>c.id)});}
 await client.query("UPDATE import_jobs SET status='confirmed',confirmed_at=now() WHERE id=$1",[id]);await log(client,user,'IMPORT_CONFIRM',id,{count:items.length});return {ok:true,job_id:id,imported:items.length,question_ids:questionIds};
 });}
