import {pool} from '../../db/pool.js';
import {can,getEffectiveAccess,decide,contextsFor} from '../accessResolver.js';
import {SUPER_HIGH_RISK} from './catalog.js';
import {fail} from '../practice/config.js';
export function requirePermissionAdmin(actor){
 if(actor.role!=='admin'||actor.is_active===false)fail('Chỉ Admin được cấp hoặc thu hồi quyền; quản lý hồ sơ không đồng nghĩa quản lý quyền',403);
}
export function validateDelegation(actor,targetId,d){
 requirePermissionAdmin(actor);
 if(Number(actor.id)===Number(targetId))fail('Không tự cấp hoặc sửa ngoại lệ quyền của chính mình',403);
 if(d.effect!=='DENY'&&SUPER_HIGH_RISK.has(d.capability)&&!d.confirmed)fail('Cần xác nhận rõ quyền nghiệp vụ đặc biệt nhạy cảm',400);
 if(d.capability==='system.config'&&(d.scope_type!=='WHOLE_SCHOOL'||Object.keys(d.scope_payload).length))fail('Cấu hình hệ thống dùng phạm vi toàn trường không kèm bộ lọc');
 if(d.capability==='staff.manage'&&!['WHOLE_SCHOOL','DEPARTMENT'].includes(d.scope_type))fail('Quản lý hồ sơ nhân sự hỗ trợ phạm vi toàn trường hoặc tổ chuyên môn');
 if(d.capability==='staff.manage'&&Object.keys(d.scope_payload).some(k=>!['department_ids'].includes(k)))fail('Phạm vi hồ sơ nhân sự không kết hợp bộ lọc học tập');
}
export async function mayManageStaff(actor,target,client=pool){
 if(actor.role==='admin')return actor.is_active!==false;
 if(!target||target.role==='student'||target.role==='admin'||Number(actor.id)===Number(target.id))return false;
 if(!await can(actor,'staff.manage',{departmentId:target.department_id},client))return false;
 // Password reset must not enable takeover of a more privileged account.
 const access=await getEffectiveAccess(target.id,client);
 if(contextsFor(access).some(ctx=>['staff.manage','system.config'].some(k=>decide(access,k,ctx).allowed)))return false;
 const actorAccess=await getEffectiveAccess(actor.id,client);
 if(contextsFor(access).some(ctx=>[...SUPER_HIGH_RISK].some(k=>decide(access,k,ctx).allowed&&!decide(actorAccess,k,ctx).allowed)))return false;
 return true;
}
export async function requireStaffTarget(actor,id,client=pool){
 const target=(await client.query('SELECT id,role,department_id FROM users WHERE id=$1',[id])).rows[0];
 if(!target)fail('Không tìm thấy nhân sự',404);
 if(!await mayManageStaff(actor,target,client))fail('Nhân sự ngoài phạm vi quản lý hoặc là tài khoản được bảo vệ',403);
 return target;
}
