import {pool} from '../db/pool.js';
import {buildAccess,decide,bankDecision,contextFor} from './access/policy.js';
import {legacyGrants} from './access/legacyAdapter.js';
import {CAPABILITIES,POSITION_LABELS} from './access/catalog.js';
const CACHE=Symbol('requestAccess');
export async function getEffectiveAccess(input,client=pool){
 if(typeof input==='object'&&input[CACHE])return input[CACHE];
 const id=typeof input==='object'?input.id:Number(input);
 const user=(await client.query('SELECT id,role,subject_id,department_id,access_managed,access_version,is_active,CURRENT_DATE::text AS access_today FROM users WHERE id=$1',[id])).rows[0];
 if(!user)throw Object.assign(new Error('Không tìm thấy tài khoản'),{status:404});
 const queries=[['positions','SELECT * FROM staff_position_assignments WHERE user_id=$1'],['oldPositions','SELECT * FROM user_positions WHERE user_id=$1'],['teaching','SELECT * FROM teacher_class_assignments WHERE teacher_id=$1'],['overrides','SELECT * FROM user_capability_overrides WHERE user_id=$1'],['memberships','SELECT * FROM bank_memberships WHERE user_id=$1']];
 const values=Object.fromEntries(await Promise.all(queries.map(async([key,sql])=>[key,(await client.query(sql,[id])).rows])));
 const org=Object.fromEntries(await Promise.all([['subjects','subjects'],['classes','classes'],['years','school_years'],['banks','banks'],['departments','departments']].map(async([key,table])=>[key,(await client.query(`SELECT * FROM ${table}`)).rows])));
 const access=buildAccess({user,...values,org,now:user.access_today,legacy:legacyGrants(user,values.oldPositions,values.teaching,org)});
 access.legacy_positions=values.oldPositions;access.teaching=values.teaching;
 if(typeof input==='object')Object.defineProperty(input,CACHE,{value:access,configurable:true});
 return access;
}
export function attachAccess(user,access){Object.defineProperty(user,CACHE,{value:access,configurable:true});return user;}
export function invalidateAccess(user){delete user[CACHE];}
export async function can(user,capability,context={},client=pool){return (await explainAccess(user,capability,context,client)).allowed;}
export async function explainAccess(user,capability,context={},client=pool){
 const a=await getEffectiveAccess(user,client);
 if(!a.user.is_active)return {allowed:false,capability,sources:[],overrides:[],reason:'Tài khoản bị khóa'};
 if(capability.startsWith('bank.')&&context.bankId)return bankDecision(a,capability.split('.')[1],a.org.banks.find(b=>b.id===Number(context.bankId)));
 if(context.studentId){
  const rows=(await client.query('SELECT class_id FROM class_memberships WHERE student_id=$1 AND ended_at IS NULL AND valid_from<=CURRENT_DATE AND (valid_to IS NULL OR valid_to>=CURRENT_DATE)',[context.studentId])).rows;
  if(a.user.role==='admin')return decide(a,capability,context);
  const results=rows.map(r=>decide(a,capability,{...context,classId:r.class_id}));
  return results.find(d=>d.allowed)||results[0]||{allowed:false,capability,sources:[],overrides:[],reason:'Học sinh chưa thuộc lớp trong phạm vi'};
 }
 return decide(a,capability,context);
}
export async function canBank(user,permission,bankId,client=pool){const a=await getEffectiveAccess(user,client);return bankDecision(a,permission,a.org.banks.find(b=>b.id===Number(bankId)));}
export async function subjectsFor(user,capability='content.read',context={},client=pool){
 const a=await getEffectiveAccess(user,client);
 let contexts=[context];
 if(context.studentId){const rows=(await client.query('SELECT class_id FROM class_memberships WHERE student_id=$1 AND ended_at IS NULL AND valid_from<=CURRENT_DATE AND (valid_to IS NULL OR valid_to>=CURRENT_DATE)',[context.studentId])).rows;contexts=rows.map(r=>({...context,classId:r.class_id}));}
 return a.org.subjects.filter(s=>contexts.some(c=>c.classId||c.grade?decide(a,capability,{...c,subjectId:s.id}).allowed:Array.from({length:12},(_,i)=>i+1).some(grade=>decide(a,capability,{...c,subjectId:s.id,grade}).allowed))).map(s=>s.id);
}
export async function classesFor(user,capability='learning.read',client=pool){
 const a=await getEffectiveAccess(user,client);
 return a.org.classes.filter(c=>a.org.subjects.some(s=>decide(a,capability,{classId:c.id,subjectId:s.id}).allowed)).map(c=>c.id);
}
export function contextsFor(access){
 const out=[{},...(access.org.departments||[]).map(d=>({departmentId:d.id}))];
 for(const s of access.org.subjects)for(let grade=1;grade<=12;grade++)out.push({subjectId:s.id,grade});
 for(const c of access.org.classes)for(const s of access.org.subjects)out.push({classId:c.id,subjectId:s.id});
 for(const b of access.org.banks)out.push({bankId:b.id,departmentId:b.department_id});
 return out;
}
export async function listEffectiveCapabilities(user,client=pool){
 const a=await getEffectiveAccess(user,client),contexts=contextsFor(a),capabilities={};
 for(const key of CAPABILITIES)capabilities[key]=key.startsWith('bank.')?a.org.banks.some(b=>bankDecision(a,key.split('.')[1],b).allowed):contexts.some(c=>decide(a,key,c).allowed);
 return {account_type:a.user.role==='student'?'STUDENT':'STAFF',positions:a.positions,position_labels:[...new Set(a.grants.filter(g=>g.type==='POSITION'||g.type==='LEGACY').filter(g=>g.id!=='legacy-bank').map(g=>POSITION_LABELS[g.position]).filter(Boolean))],capabilities,capability_scopes:a.grants.map(g=>({capability:g.capability,scope:g.scope,type:g.type})),access_version:a.user.access_version,access_managed:a.user.access_managed};
}
export function requireAnyCapability(...capabilities){
 return (req,res,next)=>capabilities.some(key=>req.user?.capabilities?.[key])?next():res.status(403).json({error:'Không có quyền thực hiện thao tác này'});
}
export function requireCapability(capability,context=req=>({})){
 return async(req,res,next)=>{try{if(!await can(req.user,capability,await context(req)))return res.status(403).json({error:'Không có quyền: '+capability});next();}catch(e){next(e);}};
}
// Subject+grade constraints for content queries. Binds all values; aliases are internal constants.
export async function contentFilterSQL(user,alias,params,capability='content.read',client=pool){
 const a=await getEffectiveAccess(user,client);if(!a.user.is_active||a.user.role==='student')return 'FALSE';if(a.user.role==='admin')return 'TRUE';
 const hasBank=['q','questions'].includes(alias),bind=v=>{params.push(v);return '$'+params.length;};
 function scopeSQL(scope){
  const p=scope.scope_payload||{},parts=[];
  if(scope.scope_type!=='WHOLE_SCHOOL'&&!Object.keys(p).some(k=>k!=='school_year_id'))return 'FALSE';
  if(p.class_ids)return 'FALSE'; // content grants are projected before reaching SQL
  for(const [key,col] of [['subject_ids','subject_id'],['grade_ids','grade'],['bank_ids','bank_id']])if(p[key]){
   if(col==='bank_id'&&!hasBank)return 'FALSE';
   parts.push(`${alias}.${col}=ANY(${bind(p[key])}::int[])`);
  }
  if(p.department_ids)parts.push(`${alias}.subject_id IN(SELECT id FROM subjects WHERE department_id=ANY(${bind(p.department_ids)}::int[]))`);
  if(p.school_level)parts.push(`${alias}.grade=ANY(${bind(p.school_level==='THCS'?[6,7,8,9]:[10,11,12])}::int[])`);
  return parts.length?'('+parts.join(' AND ')+')':'TRUE';
 }
 const grants=a.grants.filter(g=>g.capability===capability).map(g=>scopeSQL(g.scope));
 const allow=a.overrides.filter(o=>o.capability===capability&&o.effect==='ALLOW').map(scopeSQL);
 const deny=a.overrides.filter(o=>o.capability===capability&&o.effect==='DENY').map(scopeSQL);
 return `((${[...grants,...allow].join(' OR ')||'FALSE'}) AND NOT (${deny.join(' OR ')||'FALSE'}))`;
}
export {decide,bankDecision,contextFor};
