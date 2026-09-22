import crypto from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {z} from 'zod';
import {pool,tx} from '../../db/pool.js';
import {can} from '../accessResolver.js';
import {fail,log} from '../practice/config.js';
import {curriculumImpact} from '../curriculumManagement.js';
import {mapRows,validateRows,fields} from './importRules.js';
import {detectTrustedProfile,normalizeSourceRows,BLOCKING_SOURCE_FLAGS,HARD_BLOCK_SOURCE_FLAGS,TRUSTED_PROFILE} from './trustedProfiles.js';
import {canonicalKey} from '../questionCode.js';
export async function permitted(actor,capability,version,c=pool){
 if(!await can(actor,capability,{subjectId:version.subject_id,grade:version.grade},c))fail('Không có quyền chương trình trong môn/khối này',403);
}
export async function getVersion(c,id,lock=false){
 const v=(await c.query('SELECT * FROM curriculum_versions WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];
 if(!v)fail('Không tìm thấy phiên bản',404);return v;
}
function draft(v){if(v.status!=='DRAFT')fail('Phiên bản đã công bố: hãy sao chép thành bản nháp trước khi sửa',409);}
async function audit(c,actor,v,action,before,after,reason){
 await c.query('INSERT INTO curriculum_change_log(version_id,actor_id,action,before_data,after_data,reason) VALUES($1,$2,$3,$4,$5,$6)',[v.id,actor.id,action,before,after,reason]);
 await c.query('UPDATE curriculum_versions SET revision=revision+1 WHERE id=$1',[v.id]);
 await log(c,actor,'CURRICULUM_'+action,v.id,{before,after,reason});
}
const versionInput=z.object({subject_id:z.number().int().positive(),grade:z.number().int().min(1).max(12),version_code:z.string().trim().min(1).max(80),title:z.string().trim().min(1).max(200),source_name:z.string().max(300).default(''),source_ref:z.string().max(1000).default('')}).strict();
export async function createVersion(actor,raw){const d=versionInput.parse(raw);await permitted(actor,'curriculum.edit_draft',d);return tx(async c=>{const v=(await c.query('INSERT INTO curriculum_versions(subject_id,grade,version_code,title,source_name,source_ref,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[d.subject_id,d.grade,d.version_code,d.title,d.source_name,d.source_ref,actor.id])).rows[0];await audit(c,actor,v,'VERSION_CREATED',null,d,'Tạo phiên bản nháp');return v;});}
export async function listVersions(actor){
 const rows=(await pool.query('SELECT v.*,s.name AS subject_name FROM curriculum_versions v JOIN subjects s ON s.id=v.subject_id ORDER BY v.id DESC')).rows,items=[];
 for(const v of rows)if(await can(actor,'curriculum.read',{subjectId:v.subject_id,grade:v.grade}))items.push(v);
 return items;
}
export async function detail(actor,id,c=pool){
 const v=await getVersion(c,id);await permitted(actor,'curriculum.read',v,c);
 const outcomes=(await c.query('SELECT * FROM curriculum_outcomes WHERE curriculum_version_id=$1 ORDER BY order_index,id',[id])).rows;
 const yccds=(await c.query('SELECT * FROM curriculum_yccds WHERE curriculum_version_id=$1 ORDER BY order_index,id',[id])).rows;
 const history=(await c.query('SELECT action,reason,created_at FROM curriculum_change_log WHERE version_id=$1 ORDER BY id DESC LIMIT 100',[id])).rows;
 return {version:v,outcomes,yccds,history};
}
export async function listImports(actor,id){
 const v=await getVersion(pool,id);await permitted(actor,'curriculum.import',v);
 return (await pool.query('SELECT id,filename,status,revision FROM curriculum_import_jobs WHERE version_id=$1 ORDER BY created_at DESC,id DESC',[id])).rows;
}
const itemInput=z.object({version_id:z.number().int().positive(),code:z.string().trim().min(1).max(120),text:z.string().min(1).max(10000),domain_code:z.string().max(80).default(''),outcome_id:z.number().int().positive().nullable().default(null),source_page:z.string().max(300).default(''),order_index:z.number().int().min(0).default(0),reason:z.string().trim().min(3).max(1000),revision:z.number().int().positive()}).strict();
export async function saveItem(actor,type,id,raw){
 if(!['outcome','yccd'].includes(type))fail('Loại chuẩn không hợp lệ');const d=itemInput.parse(raw);
 return tx(async c=>{const v=await getVersion(c,d.version_id,true);await permitted(actor,'curriculum.edit_draft',v,c);draft(v);if(v.revision!==d.revision)fail('Phiên bản đã thay đổi; tải lại trước khi lưu',409);
 const table=type==='outcome'?'curriculum_outcomes':'curriculum_yccds';
 const old=id?(await c.query('SELECT * FROM '+table+' WHERE id=$1 AND curriculum_version_id=$2',[id,v.id])).rows[0]:null;if(id&&!old)fail('Chuẩn không thuộc phiên bản',404);
 if(type==='yccd'&&!(await c.query('SELECT 1 FROM curriculum_outcomes WHERE id=$1 AND curriculum_version_id=$2 AND status<>\'RETIRED\'',[d.outcome_id,v.id])).rowCount)fail('Chọn Outcome trong cùng phiên bản');
 let row;
 if(type==='outcome')row=(await c.query(id?'UPDATE curriculum_outcomes SET code=$1,title=$2,domain_code=$3,source_locator=$4,order_index=$5,updated_at=now() WHERE id=$6 RETURNING *':"INSERT INTO curriculum_outcomes(code,title,domain_code,source_locator,order_index,subject_id,grade,curriculum_version,source_document,status,curriculum_version_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'DRAFT',$10) RETURNING *",id?[d.code,d.text,d.domain_code,d.source_page,d.order_index,id]:[d.code,d.text,d.domain_code,d.source_page,d.order_index,v.subject_id,v.grade,v.version_code,v.source_name,v.id])).rows[0];
 else row=(await c.query(id?'UPDATE curriculum_yccds SET code=$1,text=$2,outcome_id=$3,source_locator=$4,order_index=$5,updated_at=now() WHERE id=$6 RETURNING *':"INSERT INTO curriculum_yccds(code,text,outcome_id,source_locator,order_index,curriculum_version_id,status) VALUES($1,$2,$3,$4,$5,$6,'DRAFT') RETURNING *",[d.code,d.text,d.outcome_id,d.source_page,d.order_index,id||v.id])).rows[0];
 if(old&&old.code!==d.code)await c.query('INSERT INTO curriculum_aliases(entity_type,entity_id,old_code,created_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[type,id,old.code,actor.id]);
 await audit(c,actor,v,'ITEM_SAVED',old,row,d.reason);return row;});
}
export async function removeItem(actor,type,id,raw){
 const d=z.object({reason:z.string().trim().min(3),revision:z.number().int(),retire:z.boolean().default(true)}).strict().parse(raw);
 if(!['outcome','yccd'].includes(type))fail('Loại chuẩn không hợp lệ');
 return tx(async c=>{const table=type==='outcome'?'curriculum_outcomes':'curriculum_yccds',old=(await c.query('SELECT * FROM '+table+' WHERE id=$1',[id])).rows[0];if(!old?.curriculum_version_id)fail('Chuẩn legacy: dùng tác động/ngừng sử dụng hiện hữu',409);
 const v=await getVersion(c,old.curriculum_version_id,true);await permitted(actor,d.retire?'curriculum.retire':'curriculum.edit_draft',v,c);draft(v);if(v.revision!==d.revision)fail('Tải lại phiên bản',409);
 const impact=await curriculumImpact(c,type,id);if(Object.values(impact.counts).some(n=>n>0))fail('Chuẩn đã được tham chiếu; không sửa/xóa lịch sử. Tạo phiên bản thay thế',409,impact.counts);
 if(type==='outcome'&&(await c.query('SELECT 1 FROM curriculum_yccds WHERE outcome_id=$1',[id])).rowCount)fail('Xử lý YCCĐ con trước');
 await c.query(d.retire?"UPDATE "+table+" SET status='RETIRED' WHERE id=$1":'DELETE FROM '+table+' WHERE id=$1',[id]);await audit(c,actor,v,d.retire?'ITEM_RETIRED':'DRAFT_DELETED',old,null,d.reason);return {ok:true};});
}
export async function copyVersion(actor,id,raw){
 const d=z.object({version_code:z.string().trim().min(1).max(80),title:z.string().trim().min(1).max(200)}).strict().parse(raw);
 return tx(async c=>{const old=await getVersion(c,id,true);await permitted(actor,'curriculum.edit_draft',old,c);
 const v=(await c.query('INSERT INTO curriculum_versions(subject_id,grade,version_code,title,source_name,source_ref,based_on,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[old.subject_id,old.grade,d.version_code,d.title,old.source_name,old.source_ref,id,actor.id])).rows[0];
 const os=(await c.query('SELECT * FROM curriculum_outcomes WHERE curriculum_version_id=$1',[id])).rows;
 // Bản sao phải mang theo dấu vết nguồn và khóa tra cứu, nếu không mã câu sẽ không resolve được
 // vào phiên bản mới sau khi công bố.
 for(const o of os){const n=(await c.query("INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document,source_locator,order_index,status,curriculum_version_id,lineage_id,source_branch_code,source_ordinal,canonical_key,source_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id",[o.subject_id,o.grade,o.domain_code,o.code,o.title,v.version_code,o.source_document,o.source_locator,o.order_index,o.status==='RETIRED'?'RETIRED':'DRAFT',v.id,o.lineage_id,o.source_branch_code,o.source_ordinal,o.canonical_key,o.source_text])).rows[0];
 await c.query('INSERT INTO curriculum_replacements(entity_type,original_id,replacement_id,version_id,created_by) VALUES(\'outcome\',$1,$2,$3,$4)',[o.id,n.id,v.id,actor.id]);
 const ys=(await c.query('SELECT * FROM curriculum_yccds WHERE outcome_id=$1',[o.id])).rows;
 for(const y of ys){const yn=(await c.query("INSERT INTO curriculum_yccds(outcome_id,code,text,source_locator,source_row,order_index,status,curriculum_version_id,lineage_id,source_ordinal,canonical_key,source_text,source_page) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id",[n.id,y.code,y.text,y.source_locator,y.source_row,y.order_index,y.status==='RETIRED'?'RETIRED':'DRAFT',v.id,y.lineage_id,y.source_ordinal,y.canonical_key,y.source_text,y.source_page])).rows[0];await c.query("INSERT INTO curriculum_replacements(entity_type,original_id,replacement_id,version_id,created_by) VALUES('yccd',$1,$2,$3,$4)",[y.id,yn.id,v.id,actor.id]);}}
 await audit(c,actor,v,'VERSION_COPIED',{id},v,'Sao chép, giữ lineage; không tự sao chép mapping bài học');return v;});
}
export async function publishVersion(actor,id,raw){
 const d=z.object({revision:z.number().int(),confirmed:z.literal(true),reason:z.string().trim().min(3).max(1000)}).strict().parse(raw);
 return tx(async c=>{const v=await getVersion(c,id,true);await permitted(actor,'curriculum.publish',v,c);draft(v);if(v.revision!==d.revision)fail('Tải lại phiên bản trước khi công bố',409);
 const count=(await c.query("SELECT count(*)::int n FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id WHERE y.curriculum_version_id=$1 AND y.status<>'RETIRED' AND o.status<>'RETIRED'",[id])).rows[0].n;if(!count)fail('Cần ít nhất một YCCĐ có Outcome hợp lệ');
 await c.query("UPDATE curriculum_outcomes SET status='ACTIVE' WHERE curriculum_version_id=$1 AND status='DRAFT'",[id]);await c.query("UPDATE curriculum_yccds SET status='ACTIVE' WHERE curriculum_version_id=$1 AND status='DRAFT'",[id]);
 await c.query("UPDATE curriculum_versions SET status='PUBLISHED',published_by=$2,published_at=now() WHERE id=$1",[id,actor.id]);await audit(c,actor,v,'PUBLISHED',v,{status:'PUBLISHED',count},d.reason);return {ok:true};});
}
export async function diffVersions(actor,a,b){
 const x=await detail(actor,a),y=await detail(actor,b);if(x.version.subject_id!==y.version.subject_id||x.version.grade!==y.version.grade)fail('Chỉ đối chiếu cùng môn/khối');
 const changes=[];for(const type of ['outcomes','yccds']){const before=new Map(x[type].map(r=>[r.lineage_id,r])),after=new Map(y[type].map(r=>[r.lineage_id,r]));for(const key of new Set([...before.keys(),...after.keys()])){const p=before.get(key),n=after.get(key);const fields=['code',type==='outcomes'?'title':'text','source_locator','order_index','status'];const changed=fields.filter(k=>p?.[k]!==n?.[k]);if(type==='yccds'&&p&&n&&x.outcomes.find(o=>o.id===p.outcome_id)?.lineage_id!==y.outcomes.find(o=>o.id===n.outcome_id)?.lineage_id)changed.push('outcome');if(changed.length)changes.push({type,kind:!p?'ADDED':!n?'REMOVED':n.status==='RETIRED'?'RETIRED':'CHANGED',code:n?.code||p.code,before:p?.text||p?.title||'',after:n?.text||n?.title||'',fields:changed});}}
 return {changes,note:'Mapping bài học không được tự sao chép giữa phiên bản; cần rà soát riêng.'};
}
export async function parseWorkbook(file){
 if(!file||! /\.(xlsx|xls|csv)$/i.test(file.originalname))fail('Chọn XLSX, XLS hoặc CSV');
 return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./workbookWorker.js',import.meta.url),{workerData:{bytes:file.buffer},resourceLimits:{maxOldGenerationSizeMb:160}}),timer=setTimeout(()=>{worker.terminate();reject(Object.assign(Error('Tệp quá phức tạp'),{status:400}));},15000);worker.once('message',r=>{clearTimeout(timer);worker.terminate();r.error?reject(Object.assign(Error(r.error),{status:400})):resolve(r);});worker.once('error',()=>{clearTimeout(timer);reject(Object.assign(Error('Không phân tích được workbook'),{status:400}));});});
}
export async function upload(actor,versionId,file){
 const v=await getVersion(pool,versionId);await permitted(actor,'curriculum.import',v);draft(v);const workbook=await parseWorkbook(file);
 return tx(async c=>{const current=await getVersion(c,versionId,true);await permitted(actor,'curriculum.import',current,c);draft(current);
 const job=(await c.query('INSERT INTO curriculum_import_jobs(version_id,filename,checksum,workbook,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,filename,revision',[v.id,file.originalname,crypto.createHash('sha256').update(file.buffer).digest('hex'),workbook,actor.id])).rows[0];await audit(c,actor,v,'IMPORT_UPLOADED',null,{job:job.id,checksum:crypto.createHash('sha256').update(file.buffer).digest('hex')},'Tải nguồn vào staging');return {...job,sheets:workbook.sheets};});
}
async function getJob(actor,id,c,lock=false){const j=(await c.query('SELECT * FROM curriculum_import_jobs WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];if(!j)fail('Không tìm thấy import',404);const v=await getVersion(c,j.version_id,lock);await permitted(actor,'curriculum.import',v,c);return {j,v};}
export async function preview(actor,id){const {j,v}=await getJob(actor,id,pool);
 // Bộ 4 workbook KHTN chính thức được nhận diện sẵn để không phải map cột lại mỗi lần (§27).
 const detected=detectTrustedProfile(j.workbook);
 const trusted=detected?{...detected,sheets:detected.sheets.map(s=>({...s,grade_matches_version:s.grade===v.grade}))}:null;
 return {job:{id:j.id,version_id:v.id,filename:j.filename,revision:j.revision,status:j.status,mapping:j.mapping},trusted,sheets:j.workbook.sheets,rows:(await pool.query('SELECT * FROM curriculum_import_rows WHERE import_job_id=$1 ORDER BY source_row,source_segment',[id])).rows};}
export async function mapImport(actor,id,raw){
 const d=z.object({sheet:z.string(),header_row:z.number().int().min(1).max(5000),columns:z.record(z.enum(fields),z.number().int().min(0).max(49)),topic_as_outcome:z.boolean().default(false),source_profile:z.enum([TRUSTED_PROFILE]).nullable().optional(),revision:z.number().int()}).strict().parse(raw);
 return tx(async c=>{const {j,v}=await getJob(actor,id,c,true);draft(v);if(j.status==='COMMITTED'||j.revision!==d.revision)fail('Import đã thay đổi hoặc đã commit',409);
 const sheet=j.workbook.sheets.find(s=>s.name===d.sheet);if(!sheet)fail('Sheet không hợp lệ');
 // Với hồ sơ nguồn chính thức, máy chủ tự nhận diện lại từ workbook đã lưu và dùng chính ánh xạ do
 // mình suy ra. Client chỉ được chọn sheet; nó không phải nguồn tin cậy cho header/cột/khối.
 let effective={header_row:d.header_row,columns:d.columns,topic_as_outcome:d.topic_as_outcome};
 if(d.source_profile===TRUSTED_PROFILE){
  const detected=detectTrustedProfile(j.workbook);
  if(!detected)fail('Tệp này không phải bộ Outcome/YCCĐ chính thức',409,{code:'TRUSTED_SOURCE_NOT_DETECTED'});
  const trusted=detected.sheets.find(s=>s.sheet===d.sheet);
  if(!trusted)fail('Sheet đã chọn không thuộc bộ nguồn chính thức',409,{code:'TRUSTED_SOURCE_SHEET_UNKNOWN',sheets:detected.sheets.map(s=>({sheet:s.sheet,grade:s.grade}))});
  if(trusted.grade!==v.grade)fail(`Sheet là khối ${trusted.grade} nhưng phiên bản chương trình là khối ${v.grade}`,409,{code:'TRUSTED_SOURCE_GRADE_MISMATCH',sheet_grade:trusted.grade,version_grade:v.grade});
  effective={header_row:trusted.header_row,columns:trusted.columns,topic_as_outcome:true};
 }
 if(effective.columns.text===undefined)fail('Bắt buộc chọn cột YCCĐ');
 const source=sheet.rows.slice(effective.header_row);
 let rows=mapRows(source,effective.columns,effective.topic_as_outcome).map((row,index)=>({...row,__origin:index}));
 // Chỉ hồ sơ tin cậy mới được tách ô nhiều YCCĐ và đọc số thứ tự từ nguồn. Bảng tính bất kỳ giữ
 // nguyên hành vi cũ: một dòng là một dòng.
 if(d.source_profile===TRUSTED_PROFILE)rows=normalizeSourceRows(rows);
 const mapped=validateRows(rows);
 await c.query('DELETE FROM curriculum_import_rows WHERE import_job_id=$1',[id]);
 const segments=new Map();
 for(let i=0;i<mapped.length;i++){
  const origin=rows[i].__origin;
  if(source[origin].every(v=>!String(v).trim()))continue;
  const {row_status,validation_result,__origin,...value}=mapped[i];
  // Một dòng nguồn tách ra nhiều YCCĐ thì mỗi yêu cầu là một dòng staging, giữ nguyên số dòng gốc
  // để truy vết và đánh thêm thứ tự trong dòng.
  const segment=(segments.get(origin)||0)+1;segments.set(origin,segment);
  // Dòng có cờ nguồn đáng ngờ không được commit cho tới khi người dùng xác nhận.
  const sourceFlags=value.source_flags||[];
  const hard=sourceFlags.filter(f=>HARD_BLOCK_SOURCE_FLAGS.has(f));
  const flags=sourceFlags.filter(f=>BLOCKING_SOURCE_FLAGS.has(f)||HARD_BLOCK_SOURCE_FLAGS.has(f));
  const status=hard.length?'BLOCKED':flags.length&&row_status==='READY'?'WARNING':row_status;
  const notes=[...validation_result,...flags.map(f=>SOURCE_FLAG_MESSAGES[f]||f)];
  await c.query('INSERT INTO curriculum_import_rows(import_job_id,source_sheet,source_row,source_segment,raw_payload,mapped_payload,validation_result,row_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,d.sheet,effective.header_row+origin+1,segment,JSON.stringify(source[origin]),value,JSON.stringify(notes),status]);}
 // Lưu ánh xạ thực sự đã dùng, không lưu thứ client gửi lên.
 const applied={sheet:d.sheet,...effective,source_profile:d.source_profile||null};
 await c.query("UPDATE curriculum_import_jobs SET mapping=$2,status='MAPPED',revision=revision+1 WHERE id=$1",[id,applied]);await audit(c,actor,v,'IMPORT_MAPPED',null,{job:id,mapping:applied,rows:mapped.length},'Người dùng chọn mapping cột');return {ok:true,rows:mapped.length,mapping:applied};});
}
const SOURCE_FLAG_MESSAGES={
 SOURCE_NUMBER_MALFORMED:'Số thứ tự trong nguồn viết sai định dạng; đã đọc tạm, cần xác nhận',
 SOURCE_ORDINAL_FALLBACK:'Nguồn không có số thứ tự; hệ thống đếm tuần tự, cần xác nhận',
 SOURCE_YCCD_NUMBER_MISSING:'Ô YCCĐ không có số thứ tự trong nguồn',
 SOURCE_OUTCOME_NUMBER_MISSING:'Chủ đề không có số thứ tự trong nguồn',
 SOURCE_ROW_SPLIT:'Một ô nguồn chứa nhiều YCCĐ; đã tách thành từng yêu cầu',
 SOURCE_LEADIN_TEXT:'Ô nguồn có câu dẫn không đánh số; đã gắn vào yêu cầu đầu tiên',
 SOURCE_ORDINAL_DUPLICATE:'Nguồn đánh trùng số cho hai YCCĐ khác nhau; cần sửa số trước khi nhập',
};
export async function editRows(actor,id,raw){
 const d=z.object({revision:z.number().int(),rows:z.array(z.object({id:z.coerce.number().int().positive(),values:z.object({domain:z.string().max(80),outcome_code:z.string().max(120),outcome_title:z.string().max(10000),code:z.string().max(120),text:z.string().max(10000),group:z.string().max(10000),page:z.string().max(300),order:z.number().int().min(0),notes:z.string().max(10000),ignored:z.boolean(),
 // Cho sửa số thứ tự nguồn: đây là cách duy nhất gỡ được trùng số do chính văn bản nguồn gây ra.
 outcome_ordinal:z.number().int().positive().nullable().optional(),yccd_ordinal:z.number().int().positive().nullable().optional()}).strict()}).strict()).max(5000)}).strict().parse(raw);
 return tx(async c=>{const {j,v}=await getJob(actor,id,c,true);draft(v);if(j.status!=='MAPPED'||j.revision!==d.revision)fail('Import đã thay đổi; tải lại',409);
 const all=(await c.query('SELECT * FROM curriculum_import_rows WHERE import_job_id=$1 ORDER BY source_row,source_segment',[id])).rows,lookup=new Map(d.rows.map(r=>[Number(r.id),r.values]));if(d.rows.some(r=>!all.some(a=>Number(a.id)===r.id)))fail('Dòng không thuộc import',403);
 // Ghép sửa của người dùng lên payload đã lưu, giữ lại số thứ tự nguồn và cờ chuẩn hóa.
 const merged=all.map(r=>({...r.mapped_payload,...(lookup.get(Number(r.id))||{})}));
 // Tính lại cờ trùng số sau khi người dùng sửa: sửa đúng thì cờ phải tự mất, không bắt map lại từ đầu.
 const groups=new Map();
 for(const row of merged){if(row.yccd_ordinal==null)continue;const key=[row.branch_code,row.outcome_ordinal,row.yccd_ordinal].join(':');groups.set(key,(groups.get(key)||0)+1);}
 for(const row of merged){
  const rest=(row.source_flags||[]).filter(f=>f!=='SOURCE_ORDINAL_DUPLICATE');
  const key=[row.branch_code,row.outcome_ordinal,row.yccd_ordinal].join(':');
  row.source_flags=row.yccd_ordinal!=null&&groups.get(key)>1?[...rest,'SOURCE_ORDINAL_DUPLICATE']:rest;
 }
 const checked=validateRows(merged);
 for(let i=0;i<all.length;i++){const {row_status,validation_result,...value}=checked[i];
  const sourceFlags=value.source_flags||[];
  const hard=sourceFlags.filter(f=>HARD_BLOCK_SOURCE_FLAGS.has(f));
  const flags=sourceFlags.filter(f=>BLOCKING_SOURCE_FLAGS.has(f)||HARD_BLOCK_SOURCE_FLAGS.has(f));
  const status=hard.length?'BLOCKED':flags.length&&row_status==='READY'?'WARNING':row_status;
  const notes=[...validation_result,...flags.map(f=>SOURCE_FLAG_MESSAGES[f]||f)];
  await c.query('UPDATE curriculum_import_rows SET mapped_payload=$1,validation_result=$2,row_status=$3 WHERE id=$4',[value,JSON.stringify(notes),status,all[i].id]);}
 await c.query('UPDATE curriculum_import_jobs SET revision=revision+1 WHERE id=$1',[id]);await audit(c,actor,v,'IMPORT_ROWS_EDITED',null,{job:id,rows:d.rows},'Sửa staging, raw payload giữ nguyên');return {ok:true};});
}
export async function commitImport(actor,id,raw){
 const d=z.object({revision:z.number().int(),confirmed:z.literal(true),reason:z.string().trim().min(3),accept_source_warnings:z.boolean().default(false)}).strict().parse(raw);
 return tx(async c=>{const {j,v}=await getJob(actor,id,c,true);draft(v);await permitted(actor,'curriculum.edit_draft',v,c);if(j.status!=='MAPPED'||j.revision!==d.revision)fail('Import đã thay đổi hoặc đã commit',409);
 const rows=(await c.query("SELECT * FROM curriculum_import_rows WHERE import_job_id=$1 AND row_status<>'IGNORED' ORDER BY source_row,source_segment",[id])).rows;
 if(!rows.length||rows.some(r=>['BLOCKED','DUPLICATE'].includes(r.row_status)))fail('Xử lý dòng bị chặn/trùng trước khi commit');
 const subject=(await c.query('SELECT code FROM subjects WHERE id=$1',[v.subject_id])).rows[0];
 // Số thứ tự đã được chốt ở bước map, lấy nguyên từ văn bản nguồn. Không đánh số lại ở đây, vì
 // mỗi tệp có quy ước riêng (lớp 8 đánh liên tục theo phân môn, lớp 7 đánh lại theo từng Chủ đề).
 const risky=rows.filter(r=>(r.mapped_payload.source_flags||[]).some(f=>BLOCKING_SOURCE_FLAGS.has(f)));
 if(risky.length&&!d.accept_source_warnings)fail('Còn dòng có số thứ tự nguồn đáng ngờ; rà soát rồi xác nhận trước khi commit',409,{rows:risky.map(r=>({source_row:r.source_row,flags:r.mapped_payload.source_flags,text:String(r.mapped_payload.text||'').slice(0,160)}))});
 let unchanged=0;
 for(let i=0;i<rows.length;i++){const r=rows[i],m=rows[i].mapped_payload;
 const key=m.outcome_code||'O-'+crypto.createHash('sha256').update(m.domain+'|'+m.outcome_title).digest('hex').slice(0,12);
 const outcomeKey=m.branch_code?canonicalKey({subject_code:subject.code,grade:v.grade,branch_code:m.branch_code,outcome_number:m.outcome_ordinal}):null;
 let o=(await c.query('SELECT * FROM curriculum_outcomes WHERE curriculum_version_id=$1 AND ((canonical_key IS NOT NULL AND canonical_key=$4) OR (domain_code=$2 AND code=$3))',[v.id,m.domain,key,outcomeKey])).rows[0];
 if(o&&o.title!==m.outcome_title)fail('Mã Outcome đã có nội dung khác',409,{canonical_key:outcomeKey,existing:o.title,incoming:m.outcome_title});
 if(!o)o=(await c.query("INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document,source_locator,status,curriculum_version_id,order_index,source_branch_code,source_ordinal,canonical_key,source_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT',$9,$10,$11,$12,$13,$14) RETURNING *",[v.subject_id,v.grade,m.domain,key,m.outcome_title,v.version_code,j.filename,m.page,v.id,m.order,m.branch_code,m.branch_code?m.outcome_ordinal:null,outcomeKey,m.outcome_title])).rows[0];
 const code=m.code||'Y-'+crypto.randomUUID().slice(0,12);
 const yccdKey=outcomeKey?outcomeKey+':'+m.yccd_ordinal:null;
 const existing=(await c.query('SELECT * FROM curriculum_yccds WHERE outcome_id=$1 AND ((canonical_key IS NOT NULL AND canonical_key=$4) OR code=$2 OR text=$3)',[o.id,code,m.text,yccdKey])).rows[0];
 // Nạp lại đúng bộ nguồn phải là idempotent: cùng khóa, cùng nội dung thì bỏ qua thay vì báo lỗi.
 if(existing){if(existing.text===m.text){unchanged++;continue;}fail('YCCĐ cùng khóa nhưng khác nội dung; đối chiếu rồi sửa staging',409,{canonical_key:yccdKey,existing:existing.text,incoming:m.text});}
 await c.query("INSERT INTO curriculum_yccds(outcome_id,code,text,source_locator,source_row,order_index,status,curriculum_version_id,source_ordinal,canonical_key,source_text,source_page) VALUES($1,$2,$3,$4,$5,$6,'DRAFT',$7,$8,$9,$10,$11)",[o.id,code,m.text,m.page,r.source_row,m.order,v.id,m.branch_code?m.yccd_ordinal:null,yccdKey,m.text,m.page]);}
 await c.query("UPDATE curriculum_import_jobs SET status='COMMITTED',revision=revision+1 WHERE id=$1",[id]);await audit(c,actor,v,'IMPORT_COMMITTED',null,{job:id,count:rows.length,unchanged},d.reason);return {ok:true,count:rows.length,unchanged,imported:rows.length-unchanged};});
}
