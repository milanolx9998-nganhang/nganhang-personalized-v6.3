import {z} from 'zod';
import {tx} from '../../db/pool.js';
import {getEffectiveAccess} from '../accessResolver.js';
import {editableAssignments,previewAssignments,saveAssignments,saveOverride} from './staff.js';
import {active} from './policy.js';
import {NON_DELEGABLE,HIGH_RISK} from './catalog.js';
import {fail,log} from '../practice/config.js';
const schema=z.object({source_user_id:z.number().int().positive(),school_year_id:z.number().int().positive(),include_positions:z.boolean().default(true),include_overrides:z.boolean().default(false),confirmed:z.boolean().default(false),reason:z.string().trim().min(3).max(1000),source_version:z.number().int().optional(),target_version:z.number().int().optional()}).strict();
const iso=v=>v instanceof Date?v.toISOString().slice(0,10):v?.slice(0,10);
export async function previewStaffCopy(targetId,raw,client){
 const d=schema.parse(raw);if(d.source_user_id===targetId)fail('Chọn nhân sự nguồn khác');if(!d.include_positions&&!d.include_overrides)fail('Chọn nội dung sao chép');
 const source=await getEffectiveAccess(d.source_user_id,client),target=await getEffectiveAccess(targetId,client);
 if([source,target].some(a=>['admin','student'].includes(a.user.role)))fail('Không sao chép quyền hệ thống hoặc học sinh');
 const sourceDraft=editableAssignments(source,d.school_year_id),draft=editableAssignments(target,d.school_year_id);
 const year=source.org.years.find(y=>y.id===d.school_year_id),eligible=p=>active(p,source.org,source.now)&&(!p.valid_to||p.scope_payload?.school_year_id&&iso(p.valid_to)===iso(year?.end_date));
 if(d.include_positions){
  const positions=sourceDraft.positions.filter(p=>p.type!=='VIEWER'&&eligible(p));
  const teaching=sourceDraft.teaching.filter(t=>eligible({...t,scope_payload:{school_year_id:d.school_year_id}}));
  const unique=rows=>[...new Map(rows.map(r=>[JSON.stringify(r),r])).values()];draft.positions=unique([...draft.positions,...positions]);draft.teaching=unique([...draft.teaching,...teaching]);
 }
 draft.reason=d.reason;
 const overrides=d.include_overrides?source.overrides.filter(o=>active(o,source.org,source.now)&&!o.valid_to&&!NON_DELEGABLE.has(o.capability)).map(o=>({capability:o.capability,effect:o.effect,scope_type:o.scope_type,scope_payload:o.scope_payload,reason:d.reason,confirmed:d.confirmed})):[];
 return {draft,overrides,preview:await previewAssignments(targetId,draft,client),source_version:source.user.access_version,target_version:target.user.access_version,high_risk:overrides.filter(o=>o.effect==='ALLOW'&&HIGH_RISK.has(o.capability)).map(o=>o.capability),expired_temporary_excluded:true};
}
export async function applyStaffCopy(actor,targetId,raw){return tx(async c=>{
 const d=schema.parse(raw);for(const id of [d.source_user_id,targetId].sort((a,b)=>a-b))await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[id]);
 const p=await previewStaffCopy(targetId,d,c);if(p.source_version!==d.source_version||p.target_version!==d.target_version)fail('Quyền đã thay đổi; xem trước lại',409);
 if(p.high_risk.length&&!d.confirmed)fail('Cần xác nhận ngoại lệ nhạy cảm');
 if(d.include_positions)await saveAssignments(actor,targetId,p.draft,c);
 for(const override of p.overrides)await saveOverride(actor,targetId,override,c);
 await log(c,actor,'STAFF_PERMISSIONS_COPIED',targetId,{source_user_id:d.source_user_id,positions:d.include_positions,overrides:d.include_overrides,reason:d.reason});return {ok:true};
});}
