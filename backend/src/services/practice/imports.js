import {storage,sourceKey} from '../storage/index.js';
import {contentFilterSQL} from '../accessResolver.js';
import {enrichMetadata,validateDraft} from '../smartMetadata.js';
import {resolveQuestionFromCode,applyResolution} from '../curriculumResolver.js';
import {parseQuestionCode,inferNumberingMode,checkNumbering,isCodeAttempt,FORMS} from '../questionCode.js';
import crypto from 'node:crypto';
import {bankFilter} from '../../middleware/bankScope.js';
import {duplicateSignals} from './duplicates.js';
import {Worker} from 'node:worker_threads';
import path from 'node:path';
import fs from 'node:fs/promises';
import {pool,tx} from '../../db/pool.js';
import {normalizeQuestion} from './grading.js';
import {persistQuestion} from './questions.js';
import {openReviewCase} from '../questionReview.js';
import {staff,subjectAccess} from './authorization.js';
import {evaluateBulk,MAX_BULK_IDS} from './bulkWorkflow.js';
import {fail,log} from './config.js';
const root=path.resolve(process.env.UPLOAD_DIR||'uploads');
async function parseInWorker(file,sheetName=''){return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./importWorker.js',import.meta.url),{workerData:{path:file.path,filename:file.originalname,sheetName},resourceLimits:{maxOldGenerationSizeMb:256}});const timer=setTimeout(()=>{worker.terminate();reject(new Error('Tệp quá phức tạp; thời gian phân tích vượt 60 giây'));},60000);worker.once('message',msg=>{clearTimeout(timer);msg.error?reject(new Error(msg.error)):resolve(msg.result);});worker.once('error',e=>{clearTimeout(timer);reject(e);});});}

// ---------------------------------------------------------------------------------------------
// Mức độ nghiêm trọng của từng loại vấn đề (§51).
//   blocking — không được xác nhận nhập cho tới khi xử lý
//   review   — nhập được, nhưng đưa vào nhóm "Cần xem" để người dùng nhìn qua
//   info     — chỉ thông báo, câu vẫn tính là sẵn sàng
// ---------------------------------------------------------------------------------------------
const SEVERITY={
 INVALID_CODE:'blocking',UNKNOWN_OUTCOME:'blocking',UNKNOWN_YCCD:'blocking',GRADE_CONTEXT_MISSING:'blocking',
 CODE_METADATA_CONFLICT:'blocking',CURRICULUM_RETIRED:'blocking',SESSION_CONTEXT_MISMATCH:'blocking',
 LESSON_UNMAPPED:'review',LESSON_AMBIGUOUS:'review',LESSON_NOT_LINKED:'review',DUPLICATE_SUSPECT:'review',
 OPTIONAL_LESSON_MISMATCH:'review',OPTIONAL_CHAPTER_MISMATCH:'review',OPTIONAL_BRANCH_MISMATCH:'review',OPTIONAL_LEVEL_MISMATCH:'review',OPTIONAL_TYPE_MISMATCH:'review',
 METADATA_INCOMPLETE:'review',
 LEGACY_CODE_FORMAT:'info',LESSON_KEPT_BY_CODE:'info',NOTE:'info',
};
export const issueSeverity=code=>SEVERITY[code]||'review';
const issue=(code,message,extra={})=>({code,severity:issueSeverity(code),message,...extra});
const RESOLVER_ERRORS={OUTCOME_NOT_FOUND:'UNKNOWN_OUTCOME',YCCD_NOT_FOUND:'UNKNOWN_YCCD',GRADE_CONTEXT_MISSING:'GRADE_CONTEXT_MISSING',SUBJECT_UNKNOWN:'GRADE_CONTEXT_MISSING',OUTCOME_RETIRED:'CURRICULUM_RETIRED',YCCD_RETIRED:'CURRICULUM_RETIRED'};
const FIELD_LABEL={outcome_id:'Outcome',yccd_id:'YCCĐ',type:'dạng câu',cognitive_level:'mức'};
const FORM_OF=Object.fromEntries(Object.entries(FORMS).map(([form,type])=>[type,form]));
const LEVELS=['NB','TH','VD','VDC'];

// Trường được áp hàng loạt trong staging. Outcome/YCCĐ/Mức/Dạng nằm trong mã câu nên KHÔNG có ở đây:
// sửa hàng loạt các trường đó làm mã và phân loại mâu thuẫn (§23). Chúng chỉ sửa được từng câu, qua
// đường có kiểm xung đột và đề xuất mã mới.
const BULK_FIELDS=['topic_id'];
// Câu không có mã hiện hành thì mức/dạng chỉ là metadata, nên được phép điền hàng loạt.
const UNCODED_BULK_FIELDS=['cognitive_level','type'];

// Môn + Khối là ngữ cảnh quyết định của cả phiên. Phân môn/Bài/Mức/Dạng chọn thêm chỉ là "kỳ vọng":
// dùng để đối chiếu, và làm giá trị dự phòng cho câu không có mã — không bao giờ đè lên mã (§5, §10).
export function splitMetadata(meta={}){
 const e=meta.expectations||{};
 const expectations=Object.fromEntries(Object.entries({
  topic_id:Number(e.topic_id)||null,
  branch_code:/^[A-ZĐ]{1,3}$/u.test(e.branch_code||'')?e.branch_code:null,
  cognitive_level:[1,2,3,4].includes(Number(e.cognitive_level))?Number(e.cognitive_level):null,
  type:Object.values(FORMS).includes(e.type)?e.type:null,
  // Chương / Chủ đề (topics.chapter): thu hẹp danh sách Bài và đối chiếu Bài theo mã (V6.6.6.1).
  chapter:typeof e.chapter==='string'&&e.chapter.trim()?e.chapter.trim().slice(0,200):null,
 }).filter(([,v])=>v!=null));
 return {
  subject_id:Number(meta.subject_id)||null,
  grade:Number(meta.grade)||null,
  sheet_name:meta.sheet_name||null,
  bank_id:Number(meta.bank_id)||null,
  expectations,
 };
}

async function curriculumLabel(client,field,id){
 if(!id)return null;
 if(field==='yccd_id'){const r=(await client.query('SELECT COALESCE(o.source_branch_code,o.domain_code) b,o.source_ordinal oo,y.source_ordinal yo,y.code FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id WHERE y.id=$1',[id])).rows[0];return r?(r.oo&&r.yo?`${r.b}.${r.oo}.${r.yo}`:r.code):null;}
 if(field==='outcome_id'){const r=(await client.query('SELECT COALESCE(source_branch_code,domain_code) b,source_ordinal oo,code FROM curriculum_outcomes WHERE id=$1',[id])).rows[0];return r?(r.oo?`${r.b}.${r.oo}`:r.code):null;}
 return null;
}

// Tính trạng thái cuối cùng từ danh sách vấn đề — một nơi duy nhất, dùng lại sau khi thêm cảnh báo trùng.
function settle(v){
 const blocking=v.issues.filter(i=>i.severity==='blocking'),review=v.issues.filter(i=>i.severity==='review');
 v.errors=[...v.base_errors,...blocking.map(i=>i.message)];
 v.warnings=v.issues.filter(i=>i.severity!=='blocking').map(i=>i.message);
 v.status=v.errors.length?'ERROR':review.length?'NEEDS_REVIEW':'VALID';
 // "Tự nhận diện từ mã" chỉ dành cho câu mà mã câu thật sự resolve ra chuẩn chương trình (§19).
 v.category=v.errors.length?'ERROR':review.length?'NEEDS_REVIEW':v.auto_resolved?'AUTO_RESOLVED':'VALID_METADATA';
 return v;
}

function withDuplicates(v,duplicates,decision){
 v.issues=v.issues.filter(i=>i.code!=='DUPLICATE_SUSPECT');
 const best=[...(duplicates||[])].sort((a,b)=>(b.similarity||0)-(a.similarity||0))[0];
 if(best&&decision==='import')v.issues.push(issue('DUPLICATE_SUSPECT',`Có thể trùng ${best.display_code||best.question_code} · ${best.similarity}%`,{candidate_id:best.id,similarity:best.similarity}));
 return settle(v);
}

async function enrich(client,draft,{context={},expectations={},bulk={}}={}){
 const coded=isCodeAttempt(draft.display_code||draft.code_raw||'');
 const allowed=coded?BULK_FIELDS:[...BULK_FIELDS,...UNCODED_BULK_FIELDS];
 const picked=Object.fromEntries(allowed.filter(k=>bulk[k]!==''&&bulk[k]!=null).map(k=>[k,k==='type'?String(bulk[k]):Number(bulk[k])]));
 let q=normalizeQuestion({...draft,...picked});
 const issues=[];
 const ack=new Set(draft.ack_codes||[]);
 // "Đã xem, giữ theo mã" chỉ tắt được cảnh báo cần-xem; lỗi chặn thì phải sửa thật.
 const push=entry=>{if(entry.severity==='blocking'||!ack.has(entry.code))issues.push(entry);};

 // Dòng tự khai môn/khối khác ngữ cảnh phiên thì chặn, không lặng lẽ đổi (§22).
 if(context.subject_id){
  if(draft.declared_subject_id&&Number(draft.declared_subject_id)!==Number(context.subject_id))push(issue('SESSION_CONTEXT_MISMATCH','Dòng này khai môn khác với môn đã chọn cho phiên nhập'));
  q.subject_id=Number(context.subject_id);
 }
 if(context.grade){
  if(draft.declared_grade&&Number(draft.declared_grade)!==Number(context.grade))push(issue('SESSION_CONTEXT_MISMATCH',`Dòng này khai khối ${draft.declared_grade} nhưng phiên nhập là khối ${context.grade}`));
  q.grade=Number(context.grade);
 }
 if(!q.subject_id&&q.subject_text)q.subject_id=(await client.query('SELECT id FROM subjects WHERE name=$1 OR code=$1',[q.subject_text])).rows[0]?.id;
 if(!q.topic_id&&q.subject_id&&q.sub_topic){const found=(await client.query('SELECT id FROM topics WHERE subject_id=$1 AND grade=$2 AND name=$3',[q.subject_id,q.grade,q.sub_topic])).rows;if(found.length===1)q.topic_id=found[0].id;}

 const rawCode=q.display_code||draft.code_raw||draft.question_code||'';
 const attempt=isCodeAttempt(rawCode);
 let resolution=null,applied=null;
 if(attempt){
  if(!q.subject_id||!q.grade)push(issue('GRADE_CONTEXT_MISSING','Chọn Môn và Khối của phiên nhập để hệ thống đọc được mã câu'));
  else{
   // Mã câu + Môn/Khối là nguồn quyết định Outcome/YCCĐ; chạy trước gợi ý theo từ khóa để mã thắng.
   resolution=await resolveQuestionFromCode(client,rawCode,{subject_id:q.subject_id,grade:q.grade});
   if(resolution.ok){applied=applyResolution(q,resolution);q=normalizeQuestion(applied.draft);}
   else if(resolution.stage==='CODE')push(issue('INVALID_CODE',`Mã câu “${rawCode}” không đúng cấu trúc Câu L/H/S. Outcome. YCCĐ. NB/TH/VD/VDC. Số. TN/ĐS/TLN/GN/TL`));
   else push(issue(RESOLVER_ERRORS[resolution.error]||'UNKNOWN_YCCD',resolution.message,resolution.replacement?{replacement:resolution.replacement}:{}));
  }
 }else{
  // Không có mã hiện hành: kỳ vọng của phiên chỉ lấp chỗ trống. Câu này là "hợp lệ theo metadata",
  // không bao giờ được gọi là "tự nhận diện từ mã" (§10B).
  if(!q.topic_id&&expectations.topic_id)q.topic_id=expectations.topic_id;
  if(!q.cognitive_level&&expectations.cognitive_level)q.cognitive_level=expectations.cognitive_level;
  if(!q.type&&expectations.type)q.type=expectations.type;
  q=normalizeQuestion(q);
 }

 const profile=q.subject_id?(await client.query('SELECT config FROM subject_profiles WHERE subject_id=$1',[q.subject_id])).rows[0]?.config||{}:{};
 q=await enrichMetadata(client,q);
 const base=validateDraft(q,profile);

 let resolutionView=null;
 if(resolution?.ok){
  const {code,curriculum,lesson}=resolution;
  for(const w of resolution.warnings||[])push(issue(w.code==='LEGACY_CODE_FORMAT'?'LEGACY_CODE_FORMAT':'NOTE',w.message));
  if(draft.code_legacy)push(issue('LEGACY_CODE_FORMAT','Mã viết liền kiểu cũ; đã chuẩn hóa lại theo mẫu chính thức'));
  for(const c of applied.conflicts){
   const byMetadata=c.field==='outcome_id'||c.field==='yccd_id'?await curriculumLabel(client,c.field,c.by_metadata):c.field==='type'?FORM_OF[c.by_metadata]||c.by_metadata:c.by_metadata_label;
   push(issue('CODE_METADATA_CONFLICT',`Mã câu ghi ${FIELD_LABEL[c.field]} ${c.by_code_label}, nhưng phân loại đang là ${byMetadata||'khác'}`,{field:c.field,by_code:c.by_code,by_metadata:c.by_metadata,by_code_label:c.by_code_label,by_metadata_label:byMetadata}));
  }
  if(applied.lessonStatus==='AMBIGUOUS')push(issue('LESSON_AMBIGUOUS',`YCCĐ ${curriculum.yccd.label} được dùng ở ${lesson.candidates.length} Bài; chọn Bài cho câu này`));
  if(applied.lessonStatus==='UNMAPPED')push(issue('LESSON_UNMAPPED',lesson.master_data_missing
   ?`YCCĐ hợp lệ · chưa có dữ liệu Bài cho ${curriculum.subject.name} khối ${curriculum.grade} phần ${curriculum.branch?.name||code.branch_code} (dữ liệu nền, không phải lỗi người nhập)`
   :`YCCĐ ${curriculum.yccd.label} chưa gắn Bài; câu vẫn nhập được vào kho`));
  if(applied.lessonStatus==='MANUAL_UNLINKED')push(issue('LESSON_NOT_LINKED','Bài chọn tay chưa có liên kết với YCCĐ này trong dữ liệu nền'));
  if(lesson.status==='AUTO_MAPPED'&&draft.topic_id&&Number(draft.topic_id)!==lesson.topic_id)push(issue('LESSON_KEPT_BY_CODE',`Giữ Bài theo liên kết chuẩn: ${lesson.topic.name}`));

  // Kỳ vọng của phiên chỉ để đối chiếu với kết quả theo mã (§46–48).
  if(expectations.branch_code&&code.branch_code!==expectations.branch_code)push(issue('OPTIONAL_BRANCH_MISMATCH',`Câu thuộc phân môn ${curriculum.branch?.name||code.branch_code} trong phiên được giới hạn ${expectations.branch_code}`,{expected:expectations.branch_code,actual:code.branch_code}));
  // Chưa có Bài theo liên kết thì đã có cảnh báo LESSON_*; ở đó giao diện cho "Gắn Bài đã chọn".
  if(expectations.topic_id&&q.topic_id&&q.topic_id!==expectations.topic_id)push(issue('OPTIONAL_LESSON_MISMATCH','Mã câu dẫn tới Bài khác với Bài đã chọn cho phiên',{expected:expectations.topic_id,actual:q.topic_id}));
  if(expectations.chapter&&q.topic_id){const chapter=(await client.query('SELECT chapter FROM topics WHERE id=$1',[q.topic_id])).rows[0]?.chapter||null;
   if(chapter!==expectations.chapter)push(issue('OPTIONAL_CHAPTER_MISMATCH',`Mã câu dẫn tới Bài thuộc ${chapter||'chương khác'}, phiên nhập chọn ${expectations.chapter}`,{expected:expectations.chapter,actual:chapter}));}
  if(expectations.cognitive_level&&LEVELS.indexOf(code.declared_level)+1!==expectations.cognitive_level)push(issue('OPTIONAL_LEVEL_MISMATCH',`Mã ghi mức ${code.declared_level}, phiên kỳ vọng ${LEVELS[expectations.cognitive_level-1]}`,{expected:expectations.cognitive_level,actual:code.declared_level}));
  if(expectations.type&&FORMS[code.question_form]!==expectations.type)push(issue('OPTIONAL_TYPE_MISMATCH',`Mã ghi dạng ${code.question_form}, phiên kỳ vọng ${FORM_OF[expectations.type]}`,{expected:expectations.type,actual:FORMS[code.question_form]}));

  resolutionView={
   state:issues.some(i=>i.severity==='blocking')?'BLOCKED':issues.some(i=>i.severity==='review')?'NEEDS_REVIEW':'RESOLVED',
   branch:curriculum.branch?.name||null,
   outcome:curriculum.outcome.label,outcome_title:curriculum.outcome.title,
   yccd:curriculum.yccd.label,yccd_text:curriculum.yccd.text,
   level:code.declared_level,form:code.question_form,content_number:code.content_number,
   lesson_status:applied.lessonStatus,
   lesson:q.topic_id?{id:q.topic_id,name:(lesson.candidates.find(t=>t.id===q.topic_id)||lesson.topic)?.name||null}:null,
   lesson_candidates:lesson.candidates.map(t=>({id:t.id,name:t.name,chapter:t.chapter})),
   master_data_missing:!!lesson.master_data_missing,
   code_values:applied.codeValues,
   conflicts:applied.conflicts,
  };
 }else if(resolution){
  resolutionView={state:resolution.stage==='CODE'?'CODE_UNREADABLE':'BLOCKED',error:resolution.error,replacement:resolution.replacement||null};
 }

 // Kiểm tra cấu trúc câu: lỗi thì chặn; "Thiếu ..." thì cần xem; phần còn lại chỉ thông báo.
 const lessonIssue=issues.some(i=>i.code.startsWith('LESSON_'));
 for(const w of base.warnings){
  if(/^Thiếu /.test(w)){if(!(lessonIssue&&/chuyên đề|bài/i.test(w)))push(issue('METADATA_INCOMPLETE',w));}
  else push(issue('NOTE',w));
 }
 for(const w of q.parser_warnings||[])push(issue('NOTE',w));

 const validation=settle({issues,base_errors:base.errors,auto_resolved:!!resolution?.ok,resolution:resolutionView});
 return {q,validation};
}

// Mức giống nhau giữa câu nhập và câu đã có trong kho, để người dùng quyết nhanh "bỏ qua / nhập mới / tạo bản mới".
const SIGNAL_WEIGHT={stem:40,options:20,answer:20,image_checksum:10,source_id:10};
async function findDuplicates(client,user,q){
 const params=[q.subject_id||null,q.stem,q.display_code||null];const scope=bankFilter(user,'q',params),subjectScope=await contentFilterSQL(user,'q',params,'content.read',client);
 const rows=(await client.query(`SELECT q.* FROM questions q WHERE q.subject_id=$1 AND (lower(regexp_replace(q.stem_text,'\\s+',' ','g'))=lower(regexp_replace($2,'\\s+',' ','g')) OR ($3::text IS NOT NULL AND (q.normalized_content->>'display_code'=$3 OR q.question_code=$3))) AND ${scope} AND ${subjectScope} ORDER BY q.id DESC LIMIT 30`,params)).rows;
 return rows.map(row=>{const signals=duplicateSignals(q,normalizeQuestion(row.normalized_content||row));return {id:row.id,question_code:row.question_code,display_code:row.normalized_content?.display_code||null,current_version_id:row.current_version_id,signals,similarity:Object.entries(SIGNAL_WEIGHT).reduce((n,[k,w])=>n+(signals[k]?w:0),0)};});
}

// Dòng đầu tệp Word (trước câu đầu tiên) có thể ghi "Bài: …", "Môn: …", "Khối: …" (§22). Hoàn toàn
// tùy chọn; chỉ để đối chiếu, không thay ngữ cảnh đã chọn trên giao diện.
function documentHints(lines=[]){
 const out={};
 for(const raw of lines){const m=/^(Bài|Môn|Khối|Nhãn|Nguồn)\s*:\s*(.+)$/iu.exec(String(raw).trim());if(!m)continue;
  const key={bài:'lesson_name',môn:'subject_text',khối:'grade',nhãn:'tag',nguồn:'source'}[m[1].toLowerCase()];out[key]=m[2].trim();}
 if(out.grade)out.grade=Number(String(out.grade).match(/\d+/)?.[0])||null;
 return out;
}

export async function parseJob(user,file,metadata={}){
 staff(user);if(!user.capabilities?.['content.write'])fail('Không có quyền nhập câu hỏi',403);if(!file)fail('Chưa chọn tệp');let parsed;
 const context=splitMetadata(metadata);
 try{parsed=await parseInWorker(file,context.sheet_name||'');}catch(e){await log(pool,user,'IMPORT_PARSE_ERROR',file.originalname,{error:e.message});fail(e.message);}
 const storedSource=sourceKey(file.path);if(!await storage.exists(storedSource))await storage.put(storedSource,await fs.readFile(file.path));
 return tx(async client=>{
  context.document=documentHints(parsed.metadata);
  // Bài ghi ở đầu tệp Word được dùng như một kỳ vọng — chỉ khi người dùng chưa chọn Bài trên giao diện.
  if(context.document.lesson_name&&!context.expectations.topic_id&&context.subject_id&&context.grade){
   const found=(await client.query('SELECT id FROM topics WHERE subject_id=$1 AND grade=$2 AND name ILIKE $3',[context.subject_id,context.grade,context.document.lesson_name.trim()+'%'])).rows;
   if(found.length===1){context.expectations.topic_id=found[0].id;context.document.lesson_topic_id=found[0].id;}
  }
  const job=(await client.query('INSERT INTO import_jobs(created_by,parser_type,source_name,source_path,context) VALUES($1,$2,$3,$4,$5) RETURNING *',[user.id,path.extname(file.originalname),file.originalname,storedSource,JSON.stringify(context)])).rows[0];
  const media=[];await fs.mkdir(path.join(root,'media'),{recursive:true});
  for(const m of parsed.media){const key=m.checksum+'.'+m.ext;if(!await storage.exists('media/'+key))await storage.put('media/'+key,Buffer.from(m.data,'base64'),m.mime);const row=(await client.query('INSERT INTO media_assets(storage_key,original_filename,mime,size_bytes,checksum,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(checksum) DO UPDATE SET checksum=EXCLUDED.checksum RETURNING *',[key,m.filename,m.mime,Buffer.from(m.data,'base64').length,m.checksum,user.id])).rows[0];media.push({...row,url:m.url});}
  for(let i=0;i<parsed.items.length;i++){
   const item=parsed.items[i];
   // Giữ nguyên môn/khối mà chính dòng dữ liệu khai, để còn đối chiếu với ngữ cảnh phiên ở mọi lần kiểm lại.
   const draft={...item,declared_subject_id:item.subject_id||null,declared_grade:item.grade||null};
   const {q,validation}=await enrich(client,draft,{context,expectations:context.expectations});q.media=media.filter(m=>JSON.stringify(q).includes(m.url)).map((m,index)=>({id:m.id,location:'content',order:index}));
   const duplicates=await findDuplicates(client,user,q);
   await client.query('INSERT INTO import_items(job_id,sequence,draft,validation,duplicate_candidates) VALUES($1,$2,$3,$4,$5)',[job.id,i+1,JSON.stringify(q),JSON.stringify(withDuplicates(validation,duplicates,'import')),JSON.stringify(duplicates)]);
  }
  await log(client,user,'IMPORT_PARSED',job.id,{count:parsed.items.length,context});return job;
 });
}

// Kiểm cách đánh số của cả lô. Tính khi đọc nên luôn phản ánh bản nháp hiện tại. Chỉ cảnh báo:
// mã câu là do người soạn đặt, hệ thống không tự sửa. Câu không có mã không bao giờ bị gắn chế độ
// đánh số suy ra từ các câu khác (§31).
export function batchNumbering(items){
 const parsed=items.map(i=>parseQuestionCode(i.draft?.display_code||''));
 const codedParsed=parsed.filter(p=>p.ok),coded=codedParsed.length,total=items.length,issues=[];
 if(!coded)return {mode:'CUSTOM',coded_mode:null,scope:'NONE',issues,coded,total};
 if(coded<total)issues.push({code:'PARTIAL_CODE_COVERAGE',message:`${total-coded}/${total} câu không có mã hiện hành; chế độ đánh số chỉ áp cho ${coded} câu có mã`});
 const codedMode=coded<2?'CUSTOM':inferNumberingMode(codedParsed);
 const checked=checkNumbering(codedParsed,codedMode);
 return {mode:coded<total?'CUSTOM':codedMode,coded_mode:codedMode,scope:checked.scope,issues:[...issues,...checked.issues],coded,total};
}

// Cảnh báo cấp lần nhập: cách đánh số, và thông tin đầu tệp Word lệch ngữ cảnh phiên.
// So tên môn đầu tệp với môn của phiên: không dấu, không phân biệt hoa thường; chấp nhận mã môn, tên
// môn, tên viết tắt theo chữ cái đầu ("Khoa học tự nhiên" ↔ "KHTN") hoặc một bên chứa bên kia.
const foldText=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function subjectMatches(declared,subject){
 const d=foldText(declared);if(!d||!subject)return true;
 const names=[subject.code,subject.name].map(foldText).filter(Boolean);
 const initials=names.map(n=>n.split(' ').filter(Boolean).map(w=>w[0]).join(''));
 return names.some(n=>n===d||n.includes(d)||d.includes(n))||initials.includes(d.replace(/ /g,''))||names.includes(d.split(' ').map(w=>w[0]).join(''));
}
function jobWarnings(job){
 const out=[...(job.numbering?.issues||[])];
 const doc=job.context?.document||{};
 if(doc.subject_text&&job.subject&&!subjectMatches(doc.subject_text,job.subject))out.push({code:'DOCUMENT_SUBJECT_MISMATCH',message:`Đầu tệp ghi “Môn: ${doc.subject_text}”, nhưng phiên nhập đang là môn ${job.subject.name}`});
 if(doc.grade&&job.context?.grade&&doc.grade!==job.context.grade)out.push({code:'DOCUMENT_CONTEXT_MISMATCH',message:`Đầu tệp ghi khối ${doc.grade}, nhưng phiên nhập đang là khối ${job.context.grade}`});
 if(doc.lesson_name&&!doc.lesson_topic_id)out.push({code:'DOCUMENT_LESSON_UNKNOWN',message:`Đầu tệp ghi “Bài: ${doc.lesson_name}” nhưng không tìm thấy đúng một Bài như vậy trong môn/khối đã chọn`});
 return out;
}

export async function getJob(user,id,client=pool){const job=(await client.query('SELECT * FROM import_jobs WHERE id=$1',[id])).rows[0];if(!job||job.created_by!==user.id&&user.role!=='admin')fail('Không có quyền với lần nhập này',403);job.items=(await client.query('SELECT * FROM import_items WHERE job_id=$1 ORDER BY sequence',[id])).rows;job.subject=job.context?.subject_id?(await client.query('SELECT id,code,name FROM subjects WHERE id=$1',[job.context.subject_id])).rows[0]||null:null;job.numbering=batchNumbering(job.items);job.warnings=jobWarnings(job);return job;}
// §30 — reloading the browser must not lose a staging job. Visibility matches getJob(): a teacher
// only ever sees their own jobs, so the list cannot be used to discover someone else's batch.
export async function listJobs(user,query={}){
 staff(user);const params=[],where=[];
 if(user.role!=='admin'){params.push(user.id);where.push('j.created_by=$'+params.length);}
 else if(query.created_by){params.push(Number(query.created_by));where.push('j.created_by=$'+params.length);}
 if(query.status){params.push(query.status);where.push('j.status=$'+params.length);}
 params.push(Math.min(50,Math.max(1,Number(query.limit)||20)));
 return (await pool.query(`SELECT j.id,j.source_name,j.parser_type,j.status,j.created_at,j.confirmed_at,j.created_by,j.context,
  s.name AS subject_name,(j.context->>'grade')::int AS grade,
  count(i.id)::int AS item_count,
  count(i.id) FILTER(WHERE i.validation->>'status'='ERROR')::int AS error_count,
  count(i.id) FILTER(WHERE i.validation->>'status'='NEEDS_REVIEW')::int AS review_count,
  count(i.result_question_id)::int AS imported_count
  FROM import_jobs j LEFT JOIN import_items i ON i.job_id=j.id LEFT JOIN subjects s ON s.id=NULLIF(j.context->>'subject_id','')::int
  ${where.length?'WHERE '+where.join(' AND '):''}
  GROUP BY j.id,s.name ORDER BY j.created_at DESC LIMIT $${params.length}`,params)).rows;
}

export async function editJob(user,id,changes){staff(user);return tx(async client=>{
 await client.query('SELECT id FROM import_jobs WHERE id=$1 FOR UPDATE',[id]);const job=await getJob(user,id,client);if(job.status!=='preview')fail('Lần nhập đã xác nhận');
 const context={...(job.context||{}),expectations:{...(job.context?.expectations||{})}};
 // Đổi hoặc bỏ kỳ vọng của phiên ("Đổi Bài đã chọn", "Hủy chọn tùy chọn") rồi kiểm lại cả lô (§11–12).
 if(changes.expectations&&typeof changes.expectations==='object'){context.expectations=splitMetadata({expectations:changes.expectations}).expectations;await client.query('UPDATE import_jobs SET context=$2 WHERE id=$1',[id,JSON.stringify(context)]);}
 for(const item of job.items){
  const change=changes.items?.find(i=>i.id===item.id);
  const bulk=!changes.bulk_ids||changes.bulk_ids.includes(item.id)?changes.bulk||{}:{};
  const {q,validation}=await enrich(client,{...item.draft,...change?.draft},{context,expectations:context.expectations,bulk});
  const duplicates=await findDuplicates(client,user,q);const decision=change?.decision||item.decision;
  if(!['import','skip','version','replace'].includes(decision))fail('Lựa chọn xử lý trùng không hợp lệ');
  await client.query('UPDATE import_items SET draft=$1,validation=$2,decision=$3,duplicate_candidates=$5 WHERE id=$4',[JSON.stringify(q),JSON.stringify(withDuplicates(validation,duplicates,decision)),decision,item.id,JSON.stringify(duplicates)]);
 }
 return {ok:true};
});}

// Thống kê gắn Bài cho CẢ lô đã nhập, tính ở máy chủ — không đếm trên một trang của hàng đợi.
async function lessonSummary(client,jobId){
 return (await client.query(`SELECT count(*) FILTER (WHERE q.topic_id IS NOT NULL)::int AS assigned,count(*) FILTER (WHERE q.topic_id IS NULL)::int AS unassigned
  FROM questions q WHERE q.id IN (SELECT result_question_id FROM import_items WHERE job_id=$1 AND result_question_id IS NOT NULL)`,[jobId])).rows[0];
}

// Một mục nhập "tạo phiên bản / thay thế" trỏ vào câu đã có, nên nhiều mục có thể cùng là một câu trong kho.
// processed_items = số mục đã xử lý; unique_questions = số câu khác nhau (đơn vị của thống kê Bài và gửi duyệt).
// `imported` giữ lại = processed_items cho client cũ.
function importResult(jobId,questionIds,lessons){
 const unique=new Set(questionIds).size;
 return {ok:true,job_id:jobId,imported:questionIds.length,processed_items:questionIds.length,unique_questions:unique,question_ids:questionIds,lessons};
}

export async function confirmJob(user,id,ids,bankId){staff(user);return tx(async client=>{
 await client.query('SELECT id FROM import_jobs WHERE id=$1 FOR UPDATE',[id]);const job=await getJob(user,id,client);
 // §31 — the caller needs the batch back, not just a count, so the UI can open exactly what was imported.
 if(job.status==='confirmed'){const done=job.items.filter(i=>i.result_question_id);return importResult(id,done.map(i=>i.result_question_id),await lessonSummary(client,id));}
 const checksum=crypto.createHash('sha256').update(await storage.get(sourceKey(job.source_path))).digest('hex');
 const items=job.items.filter(i=>ids.includes(i.id)&&i.decision!=='skip');if(!items.length)fail('Chọn ít nhất một câu hợp lệ');
 const context=job.context||{},targetBank=bankId||context.bank_id||undefined;
 const questionIds=[];
 // Chế độ đánh số chỉ gắn cho câu có mã; câu không mã để trống thay vì nhận chế độ suy ra từ câu khác.
 const numbering=batchNumbering(items);
 for(const item of items){
  const coded=parseQuestionCode(item.draft?.display_code||'').ok;
  const {q,validation}=await enrich(client,{...item.draft,numbering_mode:coded?(item.draft?.numbering_mode||numbering.coded_mode):null},{context,expectations:context.expectations||{}});
  if(validation.errors.length)fail(`Câu ${item.sequence}: ${validation.errors.join('; ')}`);
  if(q.subject_id)await subjectAccess(user,q.subject_id);
  const duplicateAction=['version','replace'].includes(item.decision);const isUpdate=q.record_action==='UPDATE';const duplicateId=isUpdate?Number(q.question_id):duplicateAction?item.duplicate_candidates[0]?.id:null;
  if(isUpdate&&(!duplicateId||!q.question_version_id))fail('UPDATE cần question_id và question_version_id');if(duplicateAction&&!duplicateId)fail('Không có bản gốc để tạo version');
  const result=await persistQuestion(client,user,q,{id:duplicateId,bankId:targetBank,source:{type:job.parser_type,path:job.source_path,locator:q.source_locator,checksum}});
  await client.query('UPDATE import_items SET result_question_id=$1 WHERE id=$2',[result.id,item.id]);questionIds.push(result.id);
  await log(client,user,'IMPORT_DUPLICATE_DECISION',item.id,{decision:item.decision,candidates:item.duplicate_candidates.map(c=>c.id)});
  // Tín hiệu nghi trùng không được mất sau khi nhập: người nhập chọn "nhập thành câu mới" thì câu mang theo
  // một hồ sơ rà soát DUPLICATE_SUSPECT, nên không lọt vào "Sạch" và hiện trong "Nghi trùng" ở màn Duyệt.
  if(item.decision==='import'&&item.duplicate_candidates?.length){
   const best=[...item.duplicate_candidates].sort((a,b)=>(b.similarity||0)-(a.similarity||0))[0];
   const fresh=(await client.query('SELECT id,subject_id,current_version_id FROM questions WHERE id=$1',[result.id])).rows[0];
   await openReviewCase(client,user,fresh,{reason_code:'DUPLICATE_SUSPECT',severity:'P2',source_ref:'IMPORT:'+id,
    note:`Nhập từ tệp ${job.source_name} dù nghi trùng ${best.display_code||best.question_code||('#'+best.id)} (${best.similarity??'?'}%); người nhập chọn nhập thành câu mới.`,
    question_version_id:fresh.current_version_id});
  }
 }
 await client.query("UPDATE import_jobs SET status='confirmed',confirmed_at=now() WHERE id=$1",[id]);await log(client,user,'IMPORT_CONFIRM',id,{count:items.length});return importResult(id,questionIds,await lessonSummary(client,id));
});}

// Gửi duyệt mọi câu của một lần nhập đã xác nhận. Máy chủ tự chia phần ≤ MAX_BULK_IDS, mỗi phần một transaction:
// câu đủ điều kiện được gửi, câu chưa đủ giữ nguyên và được trả kèm lý do — lô nhập lớn đến đâu cũng gửi được.
// Gọi lại an toàn (V6.6.6.3): câu đã chờ duyệt / đã duyệt được đếm riêng, không bị báo là "chưa gửi được" — nên
// thử lại sau khi mất mạng, hay sau khi một phần đã chạy xong và phần sau lỗi, vẫn cho số đúng với trạng thái thật.
export async function submitImportJob(user,id){
 staff(user);const job=await getJob(user,id);
 if(job.status!=='confirmed')fail('Lần nhập chưa được xác nhận',409);
 const ids=[...new Set(job.items.map(i=>i.result_question_id).filter(Boolean))];
 const submittedNow=[],alreadySubmitted=[],alreadyHandled=[],notSubmitted=[];
 for(let start=0;start<ids.length;start+=MAX_BULK_IDS){
  const chunk=ids.slice(start,start+MAX_BULK_IDS);
  const plan=await tx(async client=>{
   // Khóa các câu của phần này rồi mới phân loại, để hai yêu cầu song song không cùng gửi một câu.
   const state=new Map((await client.query(`SELECT q.id,v.review_status FROM questions q LEFT JOIN question_versions v ON v.id=q.current_version_id
     WHERE q.id=ANY($1::int[]) FOR UPDATE OF q`,[chunk])).rows.map(r=>[r.id,r.review_status]));
   const pending=chunk.filter(q=>state.get(q)==='PENDING_REVIEW');
   const approved=chunk.filter(q=>state.get(q)==='APPROVED');
   const todo=chunk.filter(q=>!['PENDING_REVIEW','APPROVED'].includes(state.get(q)));
   const p=todo.length?await evaluateBulk(client,user,{ids:todo,action:'submit'}):{eligible:[],blocked:[],requires_deep_review:[]};
   if(p.eligible.length)await log(client,user,'QUESTION_BULK_WORKFLOW',crypto.randomUUID(),{action:'submit',source_ref:'IMPORT:'+id,
    question_ids:p.eligible.map(e=>e.question_id),count:p.eligible.length,result:'APPLIED'});
   return {...p,pending,approved};
  });
  submittedNow.push(...plan.eligible.map(e=>e.question_id));
  alreadySubmitted.push(...plan.pending);
  alreadyHandled.push(...plan.approved);
  notSubmitted.push(...plan.blocked,...plan.requires_deep_review);
 }
 const summary={requested:ids.length,submitted_now:submittedNow.length,already_submitted:alreadySubmitted.length,
  already_handled:alreadyHandled.length,not_submitted:notSubmitted.length};
 await log(pool,user,'IMPORT_SUBMIT',id,summary);
 return {ok:true,job_id:id,...summary,question_ids:submittedNow,blocked:notSubmitted};
}
