import {requirePermissionAdmin,requireStaffTarget,mayManageStaff} from '../services/access/delegation.js';
import {can} from '../services/accessResolver.js';
import {listTemplates,saveTemplate} from '../services/access/templates.js';
import {passwordRule} from '../services/passwordPolicy.js';
import {previewBulk,saveBulk,previewYearCopy} from '../services/access/bulk.js';
import {previewBundle,applyBundle} from '../services/access/bundles.js';
import {previewStaffCopy,applyStaffCopy} from '../services/access/copyStaff.js';
import {saveBankAccess} from '../services/access/banks.js';
import {Router} from 'express';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
import {pool,tx} from '../db/pool.js';
import {getEffectiveAccess,listEffectiveCapabilities,explainAccess} from '../services/accessResolver.js';
import {staffCatalog,staffDetail,previewAssignments,saveAssignments,saveOverride,revokeOverride} from '../services/access/staff.js';
import {fail,log} from '../services/practice/config.js';
const r=Router(),wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
// Delegated managers can manage ordinary profiles only inside their explicit scope.
r.use(async(req,res,next)=>{try{
 if(!req.user.capabilities?.['staff.manage'])fail('Không có quyền quản lý nhân sự',403);
 if(req.user.role!=='admin'){
  const basic=req.method==='GET'&&['/','/catalog'].includes(req.path)||req.method==='POST'&&req.path==='/'||req.method==='GET'&&/^\/\d+\/access$/.test(req.path)||req.method==='PUT'&&/^\/\d+\/profile$/.test(req.path)||req.method==='POST'&&/^\/\d+\/reset-password$/.test(req.path);
  if(!basic)requirePermissionAdmin(req.user);
  const id=req.path.match(/^\/(\d+)\//)?.[1];if(id)await requireStaffTarget(req.user,Number(id));
 }
 next();
}catch(e){next(e);}});
r.get('/permission-templates',wrap(async(req,res)=>res.json(await listTemplates(req.user))));
r.post('/permission-templates',wrap(async(req,res)=>res.status(201).json(await saveTemplate(req.user,req.body))));
r.post('/bulk-preview',wrap(async(req,res)=>res.json(await previewBulk(req.body))));
r.post('/bundle-preview',wrap(async(req,res)=>res.json(await previewBundle(req.body))));
r.put('/bundle-apply',wrap(async(req,res)=>res.json(await applyBundle(req.user,req.body))));
r.put('/bulk-assignments',wrap(async(req,res)=>res.json(await saveBulk(req.user,req.body))));
r.post('/:id/copy-year-preview',wrap(async(req,res)=>res.json(await previewYearCopy(Number(req.params.id),req.body))));
r.post('/:id/copy-staff-preview',wrap(async(req,res)=>res.json(await previewStaffCopy(Number(req.params.id),req.body))));
r.put('/:id/copy-staff',wrap(async(req,res)=>res.json(await applyStaffCopy(req.user,Number(req.params.id),req.body))));
r.get('/catalog',wrap(async(req,res)=>res.json({...await staffCatalog(),can_manage_permissions:req.user.role==='admin'})));
r.get('/',wrap(async(req,res)=>{
 const rows=(await pool.query("SELECT u.id,u.username,u.full_name,u.email,u.role,u.department_id,u.is_active,u.access_managed,u.access_version,d.name AS department_name FROM users u LEFT JOIN departments d ON d.id=u.department_id WHERE u.role<>'student' ORDER BY u.full_name,u.id")).rows;
 const staff=[];for(const row of rows){if(!await mayManageStaff(req.user,row))continue;const a=await getEffectiveAccess(row),s=await listEffectiveCapabilities(row);staff.push({...row,position_labels:s.position_labels,positions:a.positions,scopes:[...new Map(a.grants.map(g=>[JSON.stringify(g.scope.scope_payload),g.scope])).values()],legacy_positions:a.legacy_positions,has_override:a.overrides.length>0,warnings:row.role==='admin'?[]:a.grants.length?[]:['Chưa có vị trí/phạm vi có hiệu lực']});}res.json(staff);
}));
r.post('/',wrap(async(req,res)=>{
 const d=z.object({username:z.string().min(3).max(50).regex(/^[a-z0-9_]+$/i),full_name:z.string().trim().min(1).max(200),email:z.string().email().or(z.literal('')).default(''),password:passwordRule,department_id:z.number().int().positive().nullable().default(null)}).strict().parse(req.body);
 if(!await can(req.user,'staff.manage',{departmentId:d.department_id}))fail('Tổ chuyên môn ngoài phạm vi quản lý',403);
 const row=await tx(async c=>{const row=(await c.query("INSERT INTO users(username,full_name,email,password_hash,role,department_id,access_managed,must_change_password) VALUES($1,$2,$3,$4,'teacher',$5,true,true) RETURNING id,username,full_name",[d.username,d.full_name,d.email||null,await bcrypt.hash(d.password,12),d.department_id])).rows[0];await log(c,req.user,'STAFF_CREATED',row.id,{username:d.username,full_name:d.full_name,department_id:d.department_id});return row;});res.status(201).json(row);
}));
r.get('/:id/access',wrap(async(req,res)=>res.json({...await staffDetail(Number(req.params.id),req.query.school_year_id),summary:await listEffectiveCapabilities(Number(req.params.id))})));
r.put('/:id/profile',wrap(async(req,res)=>{
 const d=z.object({full_name:z.string().trim().min(1).max(200),email:z.string().email().or(z.literal('')).default(''),department_id:z.number().int().positive().nullable(),is_active:z.boolean(),reason:z.string().trim().min(3).max(1000)}).strict().parse(req.body),id=Number(req.params.id);
 if(id===req.user.id&&!d.is_active)fail('Không tự khóa tài khoản đang sử dụng');
 if(req.user.role!=='admin'&&!await can(req.user,'staff.manage',{departmentId:d.department_id}))fail('Không chuyển hồ sơ ra ngoài phạm vi quản lý',403);
 await tx(async c=>{const old=(await c.query("SELECT id,role,is_active,full_name,email,department_id,access_managed FROM users WHERE id=$1 AND role<>'student' FOR UPDATE",[id])).rows[0];if(!old)fail('Không tìm thấy nhân sự',404);if(req.user.role!=='admin'){await requireStaffTarget(req.user,id,c);if(!old.access_managed&&old.department_id!==d.department_id)fail('Admin cần chuyển đổi quyền legacy trước khi đổi tổ',403);}if(old.role==='admin'&&!d.is_active&&!(await c.query("SELECT 1 FROM users WHERE role='admin' AND is_active AND id<>$1",[id])).rowCount)fail('Phải giữ ít nhất một quản trị đang hoạt động');await c.query('UPDATE users SET full_name=$1,email=$2,department_id=$3,is_active=$4,token_version=token_version+$5 WHERE id=$6',[d.full_name,d.email||null,d.department_id,d.is_active,old.is_active!==d.is_active?1:0,id]);await log(c,req.user,'STAFF_PROFILE_UPDATED',id,{before:old,after:d,reason:d.reason});});res.json({ok:true});
}));
r.post('/:id/reset-password',wrap(async(req,res)=>{
 const d=z.object({password:passwordRule,reason:z.string().trim().min(3).max(1000)}).strict().parse(req.body);
 await tx(async c=>{await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.params.id]);await requireStaffTarget(req.user,Number(req.params.id),c);const result=await c.query("UPDATE users SET password_hash=$1,must_change_password=true,token_version=token_version+1 WHERE id=$2 AND role<>'student' RETURNING id",[await bcrypt.hash(d.password,12),req.params.id]);if(!result.rowCount)fail('Không tìm thấy nhân sự',404);await log(c,req.user,'STAFF_PASSWORD_RESET',req.params.id,{reason:d.reason});});res.json({ok:true});
}));
r.post('/:id/access-preview',wrap(async(req,res)=>res.json(await previewAssignments(Number(req.params.id),req.body))));
r.put('/:id/assignments',wrap(async(req,res)=>res.json(await saveAssignments(req.user,Number(req.params.id),req.body))));
r.post('/:id/capability-overrides',wrap(async(req,res)=>res.status(201).json(await saveOverride(req.user,Number(req.params.id),req.body))));
r.delete('/:id/capability-overrides/:overrideId',wrap(async(req,res)=>res.json(await revokeOverride(req.user,Number(req.params.id),Number(req.params.overrideId),req.body.reason))));
r.put('/:id/banks/:bankId',wrap(async(req,res)=>res.json(await saveBankAccess(req.user,Number(req.params.id),Number(req.params.bankId),req.body))));
export const accessRoutes=Router();
accessRoutes.post('/explain',wrap(async(req,res)=>{if(req.user.role!=='admin')await requireStaffTarget(req.user,Number(req.body.user_id));const d=z.object({user_id:z.number().int().positive(),capability:z.string(),context:z.object({subjectId:z.number().int().positive().optional(),classId:z.number().int().positive().optional(),studentId:z.number().int().positive().optional(),bankId:z.number().int().positive().optional(),grade:z.number().int().min(1).max(12).optional()}).strict().default({})}).strict().parse(req.body);res.json(await explainAccess(d.user_id,d.capability,d.context));}));
export default r;
