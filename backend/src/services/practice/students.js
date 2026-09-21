import {can,classesFor} from '../accessResolver.js';
import {accountCapability} from '../capabilities.js';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
import {pool,tx} from '../../db/pool.js';
import {staff,studentAccess,classAccess} from './authorization.js';
import {fail,log} from './config.js';

const fields=z.object({
 student_code:z.string().trim().min(1).max(50).regex(/^[a-zA-Z0-9_.-]+$/,'Mã HS chỉ gồm chữ, số, dấu chấm, gạch ngang/gạch dưới'),
 full_name:z.string().trim().min(1).max(200),
 email:z.union([z.string().trim().email().max(254),z.literal('')]).default('')
});
import {passwordRule} from '../passwordPolicy.js';
const admin=user=>{if(user.role!=='admin')fail('Chỉ quản trị được chuyển lớp hoặc khóa tài khoản',403);};
const visible=(alias='m')=>`${alias}.ended_at IS NULL AND ${alias}.valid_from<=CURRENT_DATE AND (${alias}.valid_to IS NULL OR ${alias}.valid_to>=CURRENT_DATE)`;
async function existing(client,user,id){
 const row=(await client.query("SELECT u.id,u.username FROM users u JOIN student_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.role='student' FOR UPDATE OF u",[id])).rows[0];
 if(!row)fail('Không tìm thấy học sinh',404);await studentAccess(user,id,client);return row;
}
async function uniqueOperation(fn){try{return await fn();}catch(e){if(e.code==='23505')fail('Mã học sinh / tên đăng nhập đã tồn tại',409);throw e;}}
export async function studentList(user,query={}){
 if(user.role==='student')fail('Không đủ quyền',403);
 const d=z.object({search:z.string().max(200).default(''),class_id:z.coerce.number().int().positive().optional(),status:z.enum(['active','locked']).optional(),grade:z.coerce.number().int().min(1).max(12).optional(),year:z.string().max(100).optional(),offset:z.coerce.number().int().min(0).default(0)}).parse(Object.fromEntries(Object.entries(query).filter(([,v])=>v!=='')));
 const params=[await classesFor(user,'student.read'),user.role==='admin','%'+d.search+'%',d.class_id||null,d.status||null,d.grade||null,d.year||null];
 const where=`u.role='student' AND ($2 OR EXISTS(SELECT 1 FROM class_memberships m WHERE m.student_id=u.id AND m.class_id=ANY($1::int[]) AND ${visible()})) AND (u.full_name ILIKE $3 OR p.student_code ILIKE $3) AND ($4::int IS NULL OR EXISTS(SELECT 1 FROM class_memberships m WHERE m.student_id=u.id AND m.class_id=$4 AND ${visible()})) AND ($5::text IS NULL OR u.is_active=($5='active')) AND (($6::int IS NULL AND $7::text IS NULL) OR EXISTS(SELECT 1 FROM class_memberships m JOIN classes c ON c.id=m.class_id JOIN school_years y ON y.id=c.school_year_id WHERE m.student_id=u.id AND ${visible()} AND ($6::int IS NULL OR c.grade=$6) AND ($7::text IS NULL OR y.name=$7)))`;
 const total=Number((await pool.query('SELECT count(*) FROM users u JOIN student_profiles p ON p.user_id=u.id WHERE '+where,params)).rows[0].count);
 const rows=(await pool.query(`SELECT u.id,u.username,u.full_name,u.email,u.is_active,u.must_change_password,u.last_login,p.student_code,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'year',y.name)) FROM class_memberships m JOIN classes c ON c.id=m.class_id JOIN school_years y ON y.id=c.school_year_id WHERE m.student_id=u.id AND ${visible()}),'[]') classes
 FROM users u JOIN student_profiles p ON p.user_id=u.id WHERE ${where} ORDER BY u.full_name,u.id LIMIT 30 OFFSET $8`,[...params,d.offset])).rows;
 for(const row of rows)row.permissions=Object.fromEntries(await Promise.all(['manage_basic','reset_password','transfer','disable'].map(async action=>[action,await can(user,'student.'+action,{studentId:row.id})])));
 return {students:rows,total};
}
export async function studentProfile(user,id){
 if(user.role==='student')fail('Không đủ quyền',403);await studentAccess(user,id);
 const row=(await pool.query("SELECT u.id,u.username,u.full_name,u.email,u.is_active,u.must_change_password,p.student_code FROM users u JOIN student_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.role='student'",[id])).rows[0];
 if(!row)fail('Không tìm thấy học sinh',404);
 row.memberships=(await pool.query(`SELECT m.*,c.name AS class_name,y.name AS school_year,(${visible()}) AS current FROM class_memberships m JOIN classes c ON c.id=m.class_id JOIN school_years y ON y.id=c.school_year_id WHERE m.student_id=$1 ORDER BY m.id DESC`,[id])).rows;
 return row;
}
export async function setStudentClass(client,user,id,classId){
 if(!await accountCapability(user,{classId},client))fail('Chỉ GVCN lớp này hoặc quản trị được quản lý tài khoản học sinh',403);
 const cls=(await client.query('SELECT id FROM classes WHERE id=$1',[classId])).rows[0];if(!cls)fail('Không tìm thấy lớp',404);
 await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[id]);
 const current=(await client.query(`SELECT * FROM class_memberships m WHERE student_id=$1 AND ${visible()}`,[id])).rows;
 if(current.length===1&&current[0].class_id===classId)return;
 if(current.some(m=>m.class_id!==classId)&&!await can(user,'student.transfer',{studentId:id},client))fail('Nhờ quản trị chuyển lớp để bảo toàn lịch sử',403);
 await client.query(`UPDATE class_memberships m SET ended_at=now(),valid_to=CURRENT_DATE WHERE student_id=$1 AND ${visible()}`,[id]);
 await client.query('INSERT INTO class_memberships(class_id,student_id) VALUES($1,$2)',[classId,id]);
 await log(client,user,'STUDENT_CLASS_CHANGED',id,{from:current.map(m=>m.class_id),to:classId});
}
export async function createStudent(user,raw){
 if(!(user.role==='board'&&user.capabilities?.student_accounts))staff(user);const d=fields.extend({class_id:z.number().int().positive(),password:passwordRule.optional()}).parse(raw);
 return uniqueOperation(()=>tx(async client=>{
  if(!await accountCapability(user,{classId:d.class_id},client))fail('Chỉ GVCN lớp này hoặc quản trị được thêm học sinh',403);
  const password=d.password||crypto.randomBytes(9).toString('base64url');
  const row=(await client.query("INSERT INTO users(username,full_name,email,password_hash,role,must_change_password) VALUES($1,$2,$3,$4,'student',true) RETURNING id",[d.student_code,d.full_name,d.email||null,await bcrypt.hash(password,12)])).rows[0];
  await client.query('INSERT INTO student_profiles(user_id,student_code) VALUES($1,$2)',[row.id,d.student_code]);
  await setStudentClass(client,user,row.id,d.class_id);await log(client,user,'STUDENT_CREATED',row.id,{student_code:d.student_code});
  return {...row,student_code:d.student_code,temporary_password:password};
 }));
}
export async function updateStudent(user,id,raw){
 if(!(user.role==='board'&&user.capabilities?.student_accounts))staff(user);const d=fields.parse(raw);
 return uniqueOperation(()=>tx(async client=>{
  if(!await accountCapability(user,{studentId:id},client))fail('Không có quyền sửa tài khoản học sinh',403);
  const old=await existing(client,user,id);
  await client.query('UPDATE users SET username=$1,full_name=$2,email=$3,token_version=token_version+$5 WHERE id=$4',[d.student_code,d.full_name,d.email||null,id,old.username!==d.student_code?1:0]);
  await client.query('UPDATE student_profiles SET student_code=$1 WHERE user_id=$2',[d.student_code,id]);
  await log(client,user,'STUDENT_UPDATED',id,{old_code:old.username,new_code:d.student_code});return {ok:true};
 }));
}
export async function transferStudent(user,id,raw){
 if(!await can(user,'student.transfer',{studentId:id}))fail('Không có quyền chuyển lớp',403);const d=z.object({class_id:z.number().int().positive()}).parse(raw);
 return tx(async c=>{await existing(c,user,id);await setStudentClass(c,user,id,d.class_id);return {ok:true};});
}
export async function studentStatus(user,id,raw){
 if(!await can(user,'student.disable',{studentId:id}))fail('Không có quyền khóa học sinh',403);const d=z.object({is_active:z.boolean()}).parse(raw);
 return tx(async c=>{await existing(c,user,id);await c.query('UPDATE users SET is_active=$1,token_version=token_version+1 WHERE id=$2',[d.is_active,id]);await log(c,user,d.is_active?'STUDENT_UNLOCKED':'STUDENT_LOCKED',id);return {ok:true};});
}
export async function setStudentPassword(user,id,raw={}){
 if(!(user.role==='board'&&user.capabilities?.student_accounts))staff(user);const d=z.object({new_password:passwordRule.optional()}).parse(raw);
 return tx(async c=>{if(!await accountCapability(user,{studentId:id,capability:'student.reset_password'},c))fail('Chỉ GVCN hoặc quản trị được đổi mật khẩu học sinh',403);await existing(c,user,id);const password=d.new_password||crypto.randomBytes(9).toString('base64url');await c.query('UPDATE users SET password_hash=$1,must_change_password=true,token_version=token_version+1 WHERE id=$2',[await bcrypt.hash(password,12),id]);await log(c,user,'PASSWORD_RESET',id);return {temporary_password:password};});
}
