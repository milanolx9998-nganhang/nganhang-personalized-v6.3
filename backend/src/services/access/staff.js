import {z} from 'zod';
import {requirePermissionAdmin,validateDelegation} from './delegation.js';
import {pool,tx} from '../../db/pool.js';
import {fail,log} from '../practice/config.js';
import {getEffectiveAccess,contextsFor,decide,bankDecision} from '../accessResolver.js';
import {buildAccess,active} from './policy.js';
import {CAPABILITIES,PRESETS,POSITION_LABELS,SCOPE_TYPES,HIGH_RISK,SCHOOL_LEVELS,NON_DELEGABLE,BUNDLES,SUPER_HIGH_RISK} from './catalog.js';
const ids=z.array(z.number().int().positive()).max(1000).transform(a=>[...new Set(a)].sort((a,b)=>a-b));
const payloadSchema=z.object({school_year_id:z.number().int().positive().optional(),school_level:z.enum(['THCS','THPT']).optional(),grade_ids:z.array(z.number().int().min(1).max(12)).max(12).optional(),department_ids:ids.optional(),subject_ids:ids.optional(),class_ids:ids.optional(),bank_ids:ids.optional()}).strict();
const dates={valid_from:z.string().date().optional(),valid_to:z.string().date().nullable().optional()};
const pSchema=z.object({type:z.enum(Object.keys(PRESETS).filter(k=>k!=='ADMIN')),scope_type:z.enum(SCOPE_TYPES).optional(),scope_payload:payloadSchema.optional(),class_ids:ids.optional(),subject_ids:ids.optional(),department_ids:ids.optional(),grade_ids:z.array(z.number().int().min(1).max(12)).optional(),school_year_id:z.number().int().positive().nullable().optional(),school_level:z.enum(['THCS','THPT']).optional(),...dates}).strict();
export const assignmentsSchema=z.object({school_year_id:z.number().int().positive(),positions:z.array(pSchema).max(100),teaching:z.array(z.object({subject_id:z.number().int().positive(),class_ids:ids,...dates}).strict()).max(100),reason:z.string().trim().min(3).max(1000).default('Cập nhật phân công nhân sự'),expected_access_version:z.number().int().optional()}).strict();
const iso=v=>v instanceof Date?[v.getFullYear(),String(v.getMonth()+1).padStart(2,'0'),String(v.getDate()).padStart(2,'0')].join('-'):v||null;
function canonical(p){return JSON.stringify({type:p.type,scope_type:p.scope_type,scope_payload:Object.fromEntries(Object.entries(p.scope_payload).sort(([a],[b])=>a.localeCompare(b))),valid_from:iso(p.valid_from),valid_to:iso(p.valid_to)});}
export function validateScope(scope_type,raw,org){
 const p=payloadSchema.parse(raw);
 const required={SCHOOL_LEVEL:'school_level',GRADE:'grade_ids',DEPARTMENT:'department_ids',SUBJECT:'subject_ids',CLASS:'class_ids',BANK:'bank_ids'}[scope_type];
 if(required&&!p[required])fail('Phạm vi cần chọn '+required);
 if(scope_type==='WHOLE_SCHOOL'&&Object.keys(p).some(k=>k!=='school_year_id'))fail('Toàn trường không đi cùng bộ lọc khác');
 if(scope_type!=='WHOLE_SCHOOL'&&!Object.keys(p).some(k=>k!=='school_year_id'))fail('Phải chọn phạm vi; để trống không có nghĩa là toàn trường');
 for(const [key,list] of Object.entries({class_ids:org.classes,subject_ids:org.subjects,department_ids:org.departments,bank_ids:org.banks}))if(p[key]&&(!p[key].length||p[key].some(id=>!list.some(r=>r.id===id))))fail('Phạm vi không tồn tại hoặc rỗng: '+key);
 if(p.grade_ids&&!p.grade_ids.length)fail('Chọn ít nhất một khối');
 if(p.school_year_id&&!org.years.some(y=>y.id===p.school_year_id))fail('Năm học không tồn tại');
 if(p.class_ids&&p.school_year_id&&p.class_ids.some(id=>org.classes.find(c=>c.id===id).school_year_id!==p.school_year_id))fail('Lớp không thuộc năm học đã chọn');
 if(p.school_level&&p.grade_ids?.some(g=>!SCHOOL_LEVELS[p.school_level].includes(g)))fail('Khối không thuộc cấp học');
 return Object.fromEntries(Object.entries(p).map(([k,v])=>[k,Array.isArray(v)?[...new Set(v)].sort((a,b)=>a-b):v]));
}
function normalizeDates(p,year,now){
 const valid_from=p.valid_from||(iso(year?.start_date)>now?iso(year.start_date):now),valid_to=p.valid_to||iso(year?.end_date)||null;
 if(valid_to&&valid_from>valid_to)fail('Ngày hết hiệu lực phải từ ngày bắt đầu trở đi');
 if(year?.start_date&&valid_from<iso(year.start_date)||year?.end_date&&valid_to&&valid_to>iso(year.end_date))fail('Thời hạn phân công ngoài năm học');
 return {valid_from,valid_to};
}
export function normalizeAssignments(raw,org,now=new Date().toISOString().slice(0,10)){
 const d=assignmentsSchema.parse(raw),year=org.years.find(y=>y.id===d.school_year_id);if(!year)fail('Năm học không tồn tại');
 const result=[];
 for(const p of d.positions){
  const organizational=['DEPT_LEADER','BOARD','BOARD_PROFESSIONAL'].includes(p.type);
  const yearId=organizational?(p.school_year_id??p.scope_payload?.school_year_id??null):d.school_year_id;
  const payload={...p.scope_payload};delete payload.school_year_id;if(yearId)payload.school_year_id=yearId;for(const key of ['class_ids','subject_ids','department_ids','grade_ids','school_level'])if(p[key]!==undefined)payload[key]=p[key];
  const scope_type=p.scope_type||({HOMEROOM:'CLASS',DEPT_LEADER:'DEPARTMENT',GRADE_LEADER:'GRADE',SUBJECT_TEACHER:'CUSTOM'}[p.type]||'CUSTOM');
  const scope_payload=validateScope(scope_type,payload,org);
  if(p.type==='HOMEROOM'&&(!scope_payload.class_ids?.length||scope_payload.subject_ids||scope_payload.department_ids))fail('GVCN chỉ chọn lớp và năm học');
  if(p.type==='SUBJECT_TEACHER'&&scope_payload.subject_ids?.length!==1)fail('Mỗi dòng giáo viên bộ môn chọn một môn, rồi các lớp của riêng môn đó');
  if(p.type==='DEPT_LEADER'&&!scope_payload.department_ids?.length)fail('Tổ trưởng cần tổ chuyên môn');
  if(p.type==='GRADE_LEADER'&&!scope_payload.grade_ids?.length)fail('Khối trưởng cần chọn khối');
  result.push({type:p.type,scope_type,scope_payload,school_year_id:yearId,...normalizeDates(p,yearId?org.years.find(y=>y.id===yearId):null,now)});
 }
 for(const t of d.teaching)result.push({type:'SUBJECT_TEACHER',scope_type:'CUSTOM',scope_payload:validateScope('CUSTOM',{subject_ids:[t.subject_id],...(t.class_ids.length?{class_ids:t.class_ids}:{}),school_year_id:d.school_year_id},org),school_year_id:d.school_year_id,...normalizeDates(t,year,now)});
 if(new Set(result.map(canonical)).size!==result.length)fail('Phân công bị trùng hoàn toàn');
 return {...d,assignments:result};
}
export function editableAssignments(access,yearId){
 const year=Number(yearId),rows=[...access.positions,...(access.user.access_managed?[]:access.grants.filter(g=>g.type==='LEGACY'&&!String(g.id).startsWith('board-approval:')&&!String(g.id).startsWith('legacy-bank')).map(g=>({...g.scope,type:g.position})))];
 const unique=[...new Map(rows.filter(p=>!p.revoked_at&&(!p.scope_payload.school_year_id||p.scope_payload.school_year_id===year)).map(p=>[JSON.stringify([p.type,p.scope_payload,iso(p.valid_from),iso(p.valid_to)]),p])).values()];
 const teaching=new Map(),positions=[];
 for(const p of unique){
  const dates={...(p.valid_from?{valid_from:iso(p.valid_from)}:{}),...(p.valid_to?{valid_to:iso(p.valid_to)}:{})};
  if(p.type==='SUBJECT_TEACHER')for(const sid of p.scope_payload.subject_ids||[]){
   const key=JSON.stringify([sid,dates]);if(!teaching.has(key))teaching.set(key,{subject_id:sid,class_ids:[],...dates});
   const t=teaching.get(key);t.class_ids=[...new Set([...t.class_ids,...p.scope_payload.class_ids||[]])];
  }else positions.push({type:p.type,scope_type:p.scope_type,scope_payload:p.scope_payload,school_year_id:p.school_year_id??p.scope_payload.school_year_id??null,...dates});
 }
 return {school_year_id:year,positions,teaching:[...teaching.values()],expected_access_version:access.user.access_version};
}
async function target(client,id,lock=false){const u=(await client.query("SELECT id,role,access_version FROM users WHERE id=$1"+(lock?' FOR UPDATE':''),[id])).rows[0];if(!u)fail('Không tìm thấy nhân sự',404);if(u.role==='student')fail('Học sinh không được gán vị trí nhân sự',400);return u;}
export async function previewAssignments(id,raw,client=pool){
 await target(client,id);const before=await getEffectiveAccess(id,client),d=normalizeAssignments(raw,before.org,before.now);
 const remaining=before.positions.filter(p=>p.school_year_id!=null&&p.school_year_id!==d.school_year_id);
 const after=buildAccess({user:{...before.user,access_managed:true},positions:[...remaining,...d.assignments],overrides:before.overrides,memberships:before.memberships,org:before.org,now:before.now});
 const gained=[],lost=[];
 for(const capability of CAPABILITIES){let added=0,removed=0;for(const context of contextsFor(before)){const b=decide(before,capability,context).allowed,a=decide(after,capability,context).allowed;if(a&&!b)added++;if(b&&!a)removed++;}if(added)gained.push({capability,contexts:added});if(removed)lost.push({capability,contexts:removed});}
 const warnings=[];
 const homeroom=d.assignments.filter(p=>p.type==='HOMEROOM').flatMap(p=>p.scope_payload.class_ids||[]);
 if(homeroom.length>1)warnings.push('Nhân sự được chủ nhiệm nhiều lớp; các quyền sẽ được hợp lại.');
 if(homeroom.length){const conflicts=(await client.query("SELECT DISTINCT u.full_name FROM staff_position_assignments p JOIN users u ON u.id=p.user_id WHERE p.user_id<>$1 AND p.type='HOMEROOM' AND p.revoked_at IS NULL AND p.valid_from<=CURRENT_DATE AND (p.valid_to IS NULL OR p.valid_to>=CURRENT_DATE) AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(p.scope_payload->'class_ids') v WHERE v::int=ANY($2::int[]))",[id,homeroom])).rows;if(conflicts.length)warnings.push('Lớp đã có GVCN: '+conflicts.map(x=>x.full_name).join(', ')+'. Không tự thay thế người cũ.');}
 if(before.user.role==='admin')warnings.push('Quản trị hệ thống giữ toàn quyền; vị trí không thu hẹp được quyền quản trị.');
 if(before.overrides.some(o=>o.effect==='DENY'))warnings.push('Ngoại lệ DENY đang có vẫn được giữ và có ưu tiên cao hơn vị trí.');
 return {gained,lost,warnings,positions:d.assignments,access_version:before.user.access_version};
}
export async function saveAssignments(actor,id,raw,providedClient=null){
 requirePermissionAdmin(actor);
 const write=async client=>{
  const user=await target(client,id,true),before=await getEffectiveAccess(id,client),d=normalizeAssignments(raw,before.org,before.now);
  if(d.expected_access_version!==undefined&&user.access_version!==d.expected_access_version)fail('Phân quyền vừa được người khác sửa. Tải lại hồ sơ trước khi lưu.',409);
  const preview=await previewAssignments(id,raw,client);
  // Keep assignments in other school years when first converting the profile.
  if(!before.user.access_managed){
   const historical=[...new Map(before.grants.filter(g=>g.type==='LEGACY'&&g.scope.scope_payload.school_year_id&&g.scope.scope_payload.school_year_id!==d.school_year_id&&!String(g.id).startsWith('board-approval')).map(g=>[JSON.stringify([g.position,g.scope.scope_payload]),{...g.scope,type:g.position}])).values()];
   for(const p of historical)await client.query('INSERT INTO staff_position_assignments(user_id,type,scope_type,scope_payload,school_year_id,valid_from,valid_to,created_by,reason) VALUES($1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE),$7,$8,$9) ON CONFLICT DO NOTHING',[id,p.type,p.scope_type,p.scope_payload,p.scope_payload.school_year_id,p.valid_from||null,p.valid_to||null,actor.id,'Giữ phân công năm học khác khi chuẩn hóa']);
  }
  const current=before.positions.filter(p=>(p.school_year_id===d.school_year_id||p.school_year_id==null)&&!p.revoked_at),wanted=new Set(d.assignments.map(canonical));
  for(const p of current)if(!wanted.has(canonical(p))){await client.query('UPDATE staff_position_assignments SET revoked_at=now() WHERE id=$1',[p.id]);await client.query('UPDATE user_capability_overrides SET revoked_at=now() WHERE position_assignment_id=$1 AND revoked_at IS NULL',[p.id]);await log(client,actor,'POSITION_REVOKED',id,{before:p,reason:d.reason});}
  const existing=new Set(current.map(canonical));
  for(const p of d.assignments)if(!existing.has(canonical(p))){const row=(await client.query('INSERT INTO staff_position_assignments(user_id,type,scope_type,scope_payload,school_year_id,valid_from,valid_to,created_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[id,p.type,p.scope_type,p.scope_payload,p.school_year_id,p.valid_from,p.valid_to,actor.id,d.reason])).rows[0];await log(client,actor,'POSITION_ASSIGNED',id,{after:row,reason:d.reason});}
  const pairs=d.assignments.filter(p=>p.type==='SUBJECT_TEACHER').flatMap(p=>(p.scope_payload.class_ids||[]).map(class_id=>({class_id,subject_id:p.scope_payload.subject_ids[0]}))),pairKey=p=>p.class_id+':'+p.subject_id;
  const old=before.teaching.filter(t=>before.org.classes.find(c=>c.id===t.class_id)?.school_year_id===d.school_year_id);
  for(const p of old)if(!pairs.some(x=>pairKey(x)===pairKey(p))){await client.query('DELETE FROM teacher_class_assignments WHERE teacher_id=$1 AND class_id=$2 AND subject_id=$3',[id,p.class_id,p.subject_id]);await log(client,actor,'TEACHING_REMOVED',id,{before:p,reason:d.reason});}
  for(const p of pairs)if(!old.some(x=>pairKey(x)===pairKey(p))){await client.query('INSERT INTO teacher_class_assignments(teacher_id,class_id,subject_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,p.class_id,p.subject_id]);await log(client,actor,'TEACHING_ADDED',id,{after:p,reason:d.reason});}
  await client.query('UPDATE users SET access_managed=true,access_version=access_version+1 WHERE id=$1',[id]);
  await log(client,actor,'STAFF_ASSIGNMENTS_UPDATED',id,{before:before.positions,after:d.assignments,gained:preview.gained,lost:preview.lost,reason:d.reason});
  return {ok:true,...preview,access_version:user.access_version+1};
 };
 return providedClient?write(providedClient):tx(write);
}
export async function saveOverride(actor,id,raw,providedClient=null){
 const d=z.object({capability:z.enum(CAPABILITIES),effect:z.enum(['ALLOW','DENY']),scope_type:z.enum(SCOPE_TYPES),scope_payload:payloadSchema,reason:z.string().trim().min(3).max(1000),confirmed:z.boolean().default(false),...dates}).strict().parse(raw);
 validateDelegation(actor,id,d);
 if(d.effect==='ALLOW'&&HIGH_RISK.has(d.capability)&&!d.confirmed)fail('Cần xác nhận ngoại lệ có rủi ro cao');
 if(NON_DELEGABLE.has(d.capability))fail('Quyền này chỉ dành cho quản trị hệ thống, không được ủy quyền',403);
 const write=async client=>{await target(client,id,true);const a=await getEffectiveAccess(id,client);const payload=validateScope(d.scope_type,d.scope_payload,a.org),dates=normalizeDates(d,a.org.years.find(y=>y.id===payload.school_year_id),a.now);
  const row=(await client.query('INSERT INTO user_capability_overrides(user_id,capability,effect,scope_type,scope_payload,reason,valid_from,valid_to,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING *',[id,d.capability,d.effect,d.scope_type,payload,d.reason,dates.valid_from,dates.valid_to,actor.id])).rows[0];
  if(!row)fail('Ngoại lệ trùng hoàn toàn đang tồn tại',409);
  await client.query('UPDATE users SET access_version=access_version+1 WHERE id=$1',[id]);await log(client,actor,'CAPABILITY_OVERRIDE_ADDED',id,{before:null,after:row,reason:d.reason});return row;
 };
 return providedClient?write(providedClient):tx(write);
}
export async function revokeOverride(actor,id,overrideId,reason){requirePermissionAdmin(actor);if(Number(actor.id)===Number(id))fail('Không tự sửa quyền của chính mình',403);if(!String(reason||'').trim())fail('Cần lý do thu hồi');return tx(async c=>{await target(c,id,true);const before=(await c.query('UPDATE user_capability_overrides SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING *',[overrideId,id])).rows[0];if(!before)fail('Ngoại lệ không tồn tại hoặc đã thu hồi',404);await c.query('UPDATE users SET access_version=access_version+1 WHERE id=$1',[id]);await log(c,actor,'CAPABILITY_OVERRIDE_REMOVED',id,{before,reason});return {ok:true};});}
export async function staffDetail(id,yearId,client=pool){
 await target(client,id);const a=await getEffectiveAccess(id,client);
 const user=(await client.query('SELECT id,username,full_name,email,role,department_id,is_active,access_version,access_managed FROM users WHERE id=$1',[id])).rows[0];
 const year=Number(yearId)||a.org.years.find(y=>y.active)?.id||a.org.years.at(-1)?.id;
 return {user,positions:a.positions,legacy_positions:a.legacy_positions,teaching:a.teaching,overrides:(await client.query('SELECT * FROM user_capability_overrides WHERE user_id=$1 ORDER BY id DESC',[id])).rows,grants:a.grants,editable:editableAssignments(a,year),banks:a.org.banks.map(b=>({...b,permissions:Object.fromEntries(['read','write','review','manage'].map(p=>[p,bankDecision(a,p,b)])),membership:a.memberships.find(m=>m.bank_id===b.id)})),history:(await client.query("SELECT a.*,u.full_name AS actor_name FROM practice_audit a LEFT JOIN users u ON u.id=a.actor_id WHERE a.entity_id=$1 AND (a.action LIKE 'POSITION_%' OR a.action LIKE 'TEACHING_%' OR a.action LIKE 'CAPABILITY_%' OR a.action LIKE 'STAFF_%' OR a.action LIKE 'BANK_ACCESS_%') ORDER BY a.id DESC LIMIT 100",[String(id)])).rows};
}
export async function staffCatalog(){const a=await getEffectiveAccess((await pool.query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1")).rows[0].id);return {...a.org,presets:PRESETS,bundles:BUNDLES,position_labels:POSITION_LABELS,capabilities:CAPABILITIES,high_risk:[...HIGH_RISK],super_high_risk:[...SUPER_HIGH_RISK],non_delegable:[...NON_DELEGABLE],school_levels:SCHOOL_LEVELS};}
