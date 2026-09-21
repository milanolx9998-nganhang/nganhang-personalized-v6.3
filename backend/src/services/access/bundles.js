import {z} from 'zod';
import crypto from 'node:crypto';
import {tx} from '../../db/pool.js';
import {getEffectiveAccess,contextsFor,decide} from '../accessResolver.js';
import {buildAccess} from './policy.js';
import {CAPABILITIES,NON_DELEGABLE,HIGH_RISK,BUNDLES,SCOPE_TYPES} from './catalog.js';
import {validateScope,saveOverride} from './staff.js';
import {fail,log} from '../practice/config.js';
const schema=z.object({user_ids:z.array(z.number().int().positive()).min(1).max(100),bundle:z.enum(Object.keys(BUNDLES)),capabilities:z.array(z.enum(CAPABILITIES)).min(1).max(100).optional(),scope_type:z.enum(SCOPE_TYPES),scope_payload:z.record(z.unknown()),effect:z.enum(['ALLOW','DENY']).default('ALLOW'),reason:z.string().trim().min(3).max(1000),confirmed:z.boolean().default(false),valid_to:z.string().date().nullable().default(null),versions:z.record(z.number().int()).optional()}).strict();
export async function previewBundle(raw,client){
 const d=schema.parse(raw),capabilities=[...new Set(d.capabilities||BUNDLES[d.bundle])];
 if(capabilities.some(k=>NON_DELEGABLE.has(k)))fail('Không ủy quyền quản trị hệ thống',403);
 const items=[];
 for(const id of [...new Set(d.user_ids)].sort((a,b)=>a-b)){
  const a=await getEffectiveAccess(id,client);if(['admin','student'].includes(a.user.role))fail('Chỉ áp dụng nhóm quyền cho nhân sự nghiệp vụ');
  const scope_payload=validateScope(d.scope_type,d.scope_payload,a.org);
  if(d.valid_to&&d.valid_to<a.now)fail('Ngày hết hiệu lực đã qua');
  const overrides=capabilities.map(capability=>({capability,effect:d.effect,scope_type:d.scope_type,scope_payload,valid_from:a.now,valid_to:d.valid_to}));
  const after=buildAccess({user:a.user,positions:a.positions,legacy:a.grants.filter(g=>g.type==='LEGACY').map(g=>({...g.scope,type:g.position,capabilities:[g.capability]})),overrides:[...a.overrides,...overrides],memberships:a.memberships,org:a.org,now:a.now});
  const gained=[],lost=[];for(const key of capabilities){for(const ctx of contextsFor(a)){const b=decide(a,key,ctx).allowed,n=decide(after,key,ctx).allowed;if(!b&&n&&!gained.includes(key))gained.push(key);if(b&&!n&&!lost.includes(key))lost.push(key);}}
  items.push({user_id:id,access_version:a.user.access_version,gained,lost,overrides});
 }
 return {items,capabilities,high_risk:capabilities.filter(k=>HIGH_RISK.has(k)),draft:d};
}
export async function applyBundle(actor,raw){
 return tx(async c=>{
  const d=schema.parse(raw);if(!d.versions)fail('Cần xem trước thay đổi quyền');
  for(const id of [...new Set(d.user_ids)].sort((a,b)=>a-b))await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[id]);
  const preview=await previewBundle(d,c);if(preview.items.some(i=>d.versions[i.user_id]!==i.access_version))fail('Quyền đã thay đổi. Xem trước lại.',409);
  if(d.effect==='ALLOW'&&preview.high_risk.length&&!d.confirmed)fail('Cần xác nhận cấp nhóm quyền nhạy cảm');
  const batch_id=crypto.randomUUID();
  for(const item of preview.items){for(const o of item.overrides)await saveOverride(actor,item.user_id,{...o,reason:d.reason,confirmed:d.confirmed},c);await log(c,actor,'STAFF_BUNDLE_APPLIED',item.user_id,{batch_id,bundle:d.bundle,capabilities:preview.capabilities,effect:d.effect,reason:d.reason});}
  await log(c,actor,'STAFF_BULK_PERMISSION',batch_id,{user_ids:d.user_ids,bundle:d.bundle,reason:d.reason});return {ok:true,batch_id,users:preview.items.length};
 });
}
