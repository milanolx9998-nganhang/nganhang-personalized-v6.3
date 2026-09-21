import {accountCapability} from '../capabilities.js';
import {setStudentClass} from './students.js';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import XLSX from 'xlsx';
import fs from 'node:fs';
import {z} from 'zod';
import {pool,tx} from '../../db/pool.js';
import {staff,classAccess,studentAccess} from './authorization.js';
import {fail,log} from './config.js';
import {safeZip} from './importAdapters.js';
const rowSchema=z.object({student_code:z.coerce.string().trim().min(1).max(50).regex(/^[a-zA-Z0-9_.-]+$/),full_name:z.string().trim().min(1).max(200),class_name:z.string().min(1),grade:z.coerce.number().int().min(1).max(12),school_year:z.string().min(4)});
function readRows(file){if(!file||!file.originalname.toLowerCase().endsWith('.xlsx'))fail('Chọn tệp XLSX danh sách học sinh');const buffer=fs.readFileSync(file.path);safeZip(buffer);const wb=XLSX.read(buffer,{type:'buffer'});const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});if(!rows.length||rows.length>2000)fail('Danh sách cần từ 1–2000 dòng');return rows;}
async function applyRows(client,user,rows){
 const result=[];for(const row of rows){
  let year=(await client.query('SELECT id FROM school_years WHERE name=$1',[row.school_year])).rows[0];if(!year){if(user.role!=='admin')fail('Nhờ quản trị tạo năm học trước',403);year=(await client.query('INSERT INTO school_years(name) VALUES($1) RETURNING id',[row.school_year])).rows[0];}
  let cls=(await client.query('SELECT id FROM classes WHERE name=$1 AND school_year_id=$2',[row.class_name,year.id])).rows[0];if(!cls){if(user.role!=='admin')fail('Lớp chưa được quản trị tạo',403);cls=(await client.query('INSERT INTO classes(name,grade,school_year_id) VALUES($1,$2,$3) RETURNING id',[row.class_name,row.grade,year.id])).rows[0];}
  if(!await accountCapability(user,{classId:cls.id},client))fail('Chỉ GVCN hoặc quản trị được nhập danh sách học sinh',403);
  let profile=(await client.query('SELECT user_id FROM student_profiles WHERE student_code=$1',[row.student_code])).rows[0];let password=null;
  if(profile){await studentAccess(user,profile.user_id,client);await client.query('UPDATE users SET full_name=$1 WHERE id=$2',[row.full_name,profile.user_id]);}
  if(!profile){password=crypto.randomBytes(9).toString('base64url');const u=(await client.query("INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES($1,$2,$3,'student',true) RETURNING id",[row.student_code,await bcrypt.hash(password,12),row.full_name])).rows[0];await client.query('INSERT INTO student_profiles(user_id,student_code) VALUES($1,$2)',[u.id,row.student_code]);profile={user_id:u.id};}
  await setStudentClass(client,user,profile.user_id,cls.id);result.push({student_code:row.student_code,full_name:row.full_name,class_name:row.class_name,temporary_password:password});
 }await log(client,user,'ROSTER_IMPORT','roster',{count:rows.length});return result;
 }
export async function importRoster(user,file){if(!(user.role==='board'&&user.capabilities?.student_accounts))staff(user);const rows=readRows(file).map(r=>rowSchema.parse(r));return tx(c=>applyRows(c,user,rows));}
export async function resetStudent(user,id){if(!(user.role==='board'&&user.capabilities?.student_accounts))staff(user);return tx(async client=>{if(!await accountCapability(user,{studentId:id,capability:'student.reset_password'},client))fail('Không có quyền đổi mật khẩu',403);await studentAccess(user,id,client);const password=crypto.randomBytes(9).toString('base64url');const r=await client.query("UPDATE users SET password_hash=$1,must_change_password=true,token_version=token_version+1 WHERE id=$2 AND role='student'",[await bcrypt.hash(password,12),id]);if(!r.rowCount)fail('Không tìm thấy học sinh');await log(client,user,'PASSWORD_RESET',id);return {temporary_password:password};});}
const previews=new Map();
const fingerprint=rows=>crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
async function inspectRows(client,user,rows){
 const seen=new Set(),result=[];
 for(let index=0;index<rows.length;index++){
  const parsed=rowSchema.safeParse(rows[index]),row=parsed.success?parsed.data:rows[index];
  const entry={row:index+2,student_code:String(row.student_code||''),full_name:String(row.full_name||''),class_name:String(row.class_name||''),grade:row.grade,school_year:String(row.school_year||'')};
  if(!parsed.success){result.push({...entry,status:'ERROR',message:'Thiếu hoặc sai dữ liệu: '+parsed.error.issues.map(i=>i.path.join('.')).join(', ')});continue;}
  if(seen.has(row.student_code)){result.push({...entry,status:'CONFLICT',message:'Trùng mã học sinh trong tệp'});continue;}seen.add(row.student_code);
  try{
   const cls=(await client.query('SELECT c.id,c.grade FROM classes c JOIN school_years y ON y.id=c.school_year_id WHERE c.name=$1 AND y.name=$2',[row.class_name,row.school_year])).rows[0];
   if(!cls&&user.role!=='admin')fail('Nhờ quản trị tạo lớp/năm học trước',403);
   if(cls){if(!await accountCapability(user,{classId:cls.id},client))fail('Chỉ GVCN hoặc quản trị được nhập danh sách học sinh',403);if(cls.grade!==row.grade)fail('Khối không khớp lớp hiện có',409);}
   const student=(await client.query('SELECT u.id,u.full_name,p.student_code FROM users u LEFT JOIN student_profiles p ON p.user_id=u.id WHERE u.username=$1 OR p.student_code=$1',[row.student_code])).rows;
   if(student.length>1||student[0]&&!student[0].student_code)fail('Mã trùng tài khoản không phải học sinh',409);
   const current=student[0];
   if(current)await studentAccess(user,current.id,client);
   const memberships=current?(await client.query('SELECT class_id FROM class_memberships WHERE student_id=$1 AND ended_at IS NULL AND valid_from<=CURRENT_DATE AND (valid_to IS NULL OR valid_to>=CURRENT_DATE) ORDER BY class_id',[current.id])).rows:[];
   if(user.role!=='admin'&&memberships.some(m=>m.class_id!==cls?.id))fail('Nhờ quản trị chuyển lớp',403);
   const unchanged=current&&current.full_name===row.full_name&&memberships.length===1&&memberships[0].class_id===cls?.id;
   result.push({...entry,status:!current?'NEW':unchanged?'UNCHANGED':'UPDATE',message:!current?'Tạo tài khoản và mật khẩu tạm':unchanged?'Giữ nguyên':'Cập nhật họ tên/lớp; giữ mật khẩu',snapshot:{student:current||null,class:cls||null,memberships}});
  }catch(e){if(!e.status&&!e.statusCode)throw e;result.push({...entry,status:'CONFLICT',message:e.message});}
 }
 return result;
}
export async function previewRoster(user,file){
 if(!(user.role==='board'&&user.capabilities?.student_accounts))staff(user);const now=Date.now();for(const [id,p] of previews)if(p.expires<now)previews.delete(id);
 if(previews.size>=100)fail('Có nhiều bản xem trước đang chờ, vui lòng thử lại sau',429);
 const rows=readRows(file),checked=await inspectRows(pool,user,rows),token=crypto.randomUUID();
 previews.set(token,{actor:user.id,rows,hash:fingerprint(checked),expires:now+15*60*1000});
 return {token,expires_at:new Date(now+15*60*1000).toISOString(),rows:checked.map(({snapshot,...row})=>row),can_confirm:checked.every(r=>!['ERROR','CONFLICT'].includes(r.status))};
}
export async function confirmRoster(user,token){
 if(!(user.role==='board'&&user.capabilities?.student_accounts))staff(user);z.string().uuid().parse(token);const p=previews.get(token);
 if(!p||p.actor!==user.id||p.expires<Date.now())fail('Bản xem trước hết hạn hoặc không thuộc tài khoản này; vui lòng tải lại',409);
 const result=await tx(async client=>{
  await client.query("SELECT pg_advisory_xact_lock(hashtext('roster-confirm'))");
  // Serialize roster confirmation against concurrent profile/class mutations.
  await client.query('LOCK TABLE users,student_profiles,classes,school_years,class_memberships,teacher_class_assignments,user_positions IN SHARE ROW EXCLUSIVE MODE');
  if((await client.query("SELECT 1 FROM practice_audit WHERE action='ROSTER_CONFIRMED' AND entity_id=$1",[token])).rowCount)fail('Danh sách đã được xác nhận',409);
  const checked=await inspectRows(client,user,p.rows);
  if(fingerprint(checked)!==p.hash)fail('Dữ liệu hoặc quyền đã thay đổi; cần xem trước lại',409);
  if(checked.some(r=>['ERROR','CONFLICT'].includes(r.status)))fail('Sửa các dòng lỗi/xung đột trước khi xác nhận',409);
  const students=await applyRows(client,user,p.rows.map(r=>rowSchema.parse(r)));
  await log(client,user,'ROSTER_CONFIRMED',token,{count:students.length});return {students};
 });previews.delete(token);return result;
}
