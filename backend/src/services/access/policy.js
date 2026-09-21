import {CAPABILITIES,PRESETS,SCHOOL_LEVELS,NON_DELEGABLE} from './catalog.js';
const date=v=>v instanceof Date?[v.getFullYear(),String(v.getMonth()+1).padStart(2,'0'),String(v.getDate()).padStart(2,'0')].join('-'):v?.slice(0,10);
export function active(row,org,now){
 if(row.revoked_at||date(row.valid_from)>now||date(row.valid_to)&&date(row.valid_to)<now)return false;
 const yearId=row.scope_payload?.school_year_id||row.school_year_id;
 const y=org.years?.find(y=>y.id===Number(yearId));
 return !yearId||!!y&&(!date(y.start_date)||date(y.start_date)<=now)&&(!date(y.end_date)||date(y.end_date)>=now);
}
export function contextFor(org,raw={}){
 const context={...raw};
 if(raw.classId!=null){const c=org.classes.find(c=>c.id===Number(raw.classId));if(!c)return {invalid:true};Object.assign(context,{classId:c.id,grade:c.grade,schoolYearId:c.school_year_id});}
 if(raw.subjectId!=null){const s=org.subjects.find(s=>s.id===Number(raw.subjectId));if(!s)return {invalid:true};Object.assign(context,{subjectId:s.id,departmentId:s.department_id});}
 if(raw.bankId!=null){const b=org.banks?.find(b=>b.id===Number(raw.bankId));if(!b)return {invalid:true};context.bankId=b.id;context.bankDepartmentId=b.department_id;}
 if(context.grade!=null)context.schoolLevel=Object.keys(SCHOOL_LEVELS).find(k=>SCHOOL_LEVELS[k].includes(Number(context.grade)))||null;
 return context;
}
const dimensions={subject_ids:'subjectId',class_ids:'classId',department_ids:'departmentId',grade_ids:'grade',bank_ids:'bankId'};
export function scopeMatches(scope,context){
 if(context.invalid||!scope)return false;
 const p=scope.scope_payload||{},meaningful=Object.entries(p).filter(([k,v])=>k!=='school_year_id'&&v!=null);
 if(scope.scope_type!=='WHOLE_SCHOOL'&&!meaningful.length)return false;
 for(const [key,ctx] of Object.entries(dimensions))if(key in p&&(!Array.isArray(p[key])||!p[key].length||context[ctx]==null||!p[key].map(Number).includes(Number(context[ctx]))))return false;
 if(p.school_level&&context.schoolLevel!==p.school_level)return false;
 // School year is always checked for validity; only learning/class resources carry a year.
 if(p.school_year_id&&context.schoolYearId!=null&&Number(p.school_year_id)!==Number(context.schoolYearId))return false;
 return true;
}
function projected(position,capability,org){
 const p={...position.scope_payload};
 if(position.type==='SUBJECT_TEACHER'&&!p.class_ids?.length)return null;
 if(/^(content|matrix|exam|curriculum)\./.test(capability)||['competency.read','competency.manage_framework','competency.manage_mapping'].includes(capability)){
  if(p.class_ids){const grades=[...new Set(org.classes.filter(c=>p.class_ids.map(Number).includes(c.id)).map(c=>c.grade))];p.grade_ids=p.grade_ids?grades.filter(g=>p.grade_ids.map(Number).includes(g)):grades;delete p.class_ids;}
 }
 // A department leader's teaching list must not restrict the departmental learning preset.
 return {...position,scope_payload:p};
}
export function buildAccess({user,positions=[],overrides=[],memberships=[],org,now=new Date().toISOString().slice(0,10),legacy=[]}){
 const grants=[];
 if(user.role!=='student')for(const p of [...positions,...legacy]){
  if(!active(p,org,now))continue;
  for(const capability of p.capabilities||PRESETS[p.type]||[]){const scope=projected(p,capability,org);if(scope)grants.push({capability,scope,type:p.source||'POSITION',id:p.id,position:p.type});}
 }
 return {user,org,now,positions,overrides:overrides.filter(o=>active(o,org,now)),memberships,grants};
}
export function decide(access,capability,raw={}){
 const result={allowed:false,capability,sources:[],overrides:[],reason:'Không có quyền trong phạm vi này'};
 if(access.user.is_active===false)return {...result,reason:'Tài khoản đã khóa'};
 if(!CAPABILITIES.includes(capability)||access.user.role==='student')return result;
 const context=contextFor(access.org,raw);
 if(access.user.role==='admin')return {...result,allowed:true,sources:[{type:'ADMIN'}],reason:'Quản trị hệ thống'};
 if(NON_DELEGABLE.has(capability))return {...result,reason:'Quyền dành riêng cho quản trị hệ thống'};
 if(context.invalid)return {...result,reason:'Tài nguyên không tồn tại'};
 const overrides=access.overrides.filter(o=>o.capability===capability&&active(o,access.org,access.now)&&scopeMatches(o,context));
 result.overrides=overrides;
 if(overrides.some(o=>o.effect==='DENY'))return {...result,reason:'Ngoại lệ DENY trong phạm vi này'};
 if(overrides.some(o=>o.effect==='ALLOW'))return {...result,allowed:true,reason:'Ngoại lệ ALLOW trong phạm vi này'};
 const sources=access.grants.filter(g=>g.capability===capability&&scopeMatches(g.scope,context));
 return {...result,allowed:!!sources.length,sources,reason:sources.length?'Được cấp từ vị trí hoặc quyền tương thích':result.reason};
}
export function bankDecision(access,permission,bank){
 const capability='bank.'+permission,result={allowed:false,capability,sources:[],overrides:[],reason:'Kho ngoài phạm vi'};
 if(!bank||access.user.role==='student'||access.user.is_active===false||!['read','write','review','manage'].includes(permission))return result;
 if(access.user.role==='admin')return {...result,allowed:true,sources:[{type:'ADMIN'}]};
 const context={bankId:bank.id,departmentId:bank.department_id};
 const ovs=access.overrides.filter(o=>o.capability===capability&&active(o,access.org,access.now)&&scopeMatches(o,context));
 if(ovs.some(o=>o.effect==='DENY'))return {...result,overrides:ovs,reason:'DENY kho cụ thể'};
 if(bank.owner_id===access.user.id)return {...result,allowed:true,sources:[{type:'BANK_OWNER',id:bank.id}]};
 if(ovs.some(o=>o.effect==='ALLOW'))return {...result,allowed:true,overrides:ovs};
 const permissions={read:['read'],write:['read','write'],review:['read','review'],manage:['read','write','review','manage']};
 const m=access.memberships.find(m=>m.bank_id===bank.id&&(!m.valid_to||date(m.valid_to)>=access.now)&&(!m.valid_from||date(m.valid_from)<=access.now)&&!m.revoked_at);
 if(m&&permissions[m.permission]?.includes(permission))return {...result,allowed:true,sources:[{type:'BANK_MEMBERSHIP',...m}]};
 const grants=access.grants.filter(g=>{
  if(g.capability!==capability)return false;
  if(g.scope.scope_payload.bank_ids)return scopeMatches(g.scope,context);
  if(bank.kind!=='department')return false;
  const p=g.scope.scope_payload;
  if(p.department_ids&&!p.department_ids.includes(bank.department_id))return false;
  if(p.subject_ids&&!access.org.subjects.some(s=>p.subject_ids.includes(s.id)&&s.department_id===bank.department_id))return false;
  if(permission==='read')return true; // Content/grade restrictions remain enforced on each question.
  return ['DEPT_LEADER'].includes(g.position)||g.id==='legacy-bank';
 });
 if(grants.length)return {...result,allowed:true,sources:grants};
 if(bank.kind==='school'&&permission==='read')return {...result,allowed:true,sources:[{type:'SCHOOL_STAFF_READ'}]};
 return result;
}
