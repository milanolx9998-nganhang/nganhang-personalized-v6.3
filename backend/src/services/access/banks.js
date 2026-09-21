import {z} from 'zod';
import {tx} from '../../db/pool.js';
import {fail,log} from '../practice/config.js';
export async function saveBankAccess(actor,userId,bankId,raw){
 const d=z.object({permission:z.enum(['read','write','review','manage']).nullable(),confirmed:z.boolean().default(false),valid_from:z.string().date().nullable().default(null),valid_to:z.string().date().nullable().default(null),reason:z.string().trim().min(3).max(1000)}).strict().parse(raw);
 if(d.permission==='manage'&&!d.confirmed)fail('Cần xác nhận quyền quản lý kho');
 if(d.valid_from&&d.valid_to&&d.valid_from>d.valid_to)fail('Ngày hết hiệu lực không hợp lệ');
 return tx(async c=>{
  if(!(await c.query("SELECT 1 FROM users WHERE id=$1 AND role<>'student' FOR UPDATE",[userId])).rowCount)fail('Chỉ cấp kho cho nhân sự');
  if(!(await c.query('SELECT 1 FROM banks WHERE id=$1',[bankId])).rowCount)fail('Không tìm thấy kho',404);
  const old=(await c.query('SELECT * FROM bank_memberships WHERE bank_id=$1 AND user_id=$2 FOR UPDATE',[bankId,userId])).rows[0];
  if(d.permission)await c.query('INSERT INTO bank_memberships(bank_id,user_id,permission,valid_from,valid_to) VALUES($1,$2,$3,$4,$5) ON CONFLICT(bank_id,user_id) DO UPDATE SET permission=EXCLUDED.permission,valid_from=EXCLUDED.valid_from,valid_to=EXCLUDED.valid_to,revoked_at=NULL',[bankId,userId,d.permission,d.valid_from,d.valid_to]);
  else await c.query('UPDATE bank_memberships SET revoked_at=now() WHERE bank_id=$1 AND user_id=$2',[bankId,userId]);
  await c.query('UPDATE users SET access_version=access_version+1 WHERE id=$1',[userId]);
  await log(c,actor,d.permission?'BANK_ACCESS_GRANTED':'BANK_ACCESS_REVOKED',userId,{bank_id:Number(bankId),before:old,after:d,reason:d.reason});return {ok:true};
 });
}
