// Tương thích tên hàm V6.3; mọi quyết định mới đi qua accessResolver.
import {pool} from '../db/pool.js';
import {getEffectiveAccess,can,subjectsFor,listEffectiveCapabilities,bankDecision} from './accessResolver.js';
export async function positions(user,client=pool){const a=await getEffectiveAccess(user,client);return a.legacy_positions.filter(p=>!p.revoked_at);}
export async function contentSubjects(user,client=pool){return user.role==='admin'?null:subjectsFor(user,'content.read',{},client);}
export async function contentCapability(user,action,subjectId,client=pool,context={}){
 return can(user,'content.'+action,{...context,subjectId:Number(subjectId)},client);
}
export async function accountCapability(user,{classId=null,studentId=null,capability='student.manage_basic'}={},client=pool){
 return can(user,capability,{...(classId?{classId}:{}),...(studentId?{studentId}:{})},client);
}
export async function capabilitySummary(user){
 const summary=await listEffectiveCapabilities(user),a=await getEffectiveAccess(user);
 // Transitional aliases for existing clients; not separate sources of authority.
 return {...summary,positions:await positions(user),allowed_bank_ids:a.org.banks.filter(b=>bankDecision(a,'read',b).allowed).map(b=>b.id),capabilities:{...summary.capabilities,student_accounts:summary.capabilities['student.manage_basic'],content_write:summary.capabilities['content.write'],content_review:summary.capabilities['content.review']}};
}
