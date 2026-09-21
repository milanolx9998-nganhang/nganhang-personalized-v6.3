import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../backend/package.json',import.meta.url));
require('dotenv').config({path:new URL('../backend/.env',import.meta.url)});
const {Pool}=require('pg'),bcrypt=require('bcryptjs');
const db=new Pool(process.env.DATABASE_URL?{connectionString:process.env.DATABASE_URL}:{host:process.env.DB_HOST,port:process.env.DB_PORT,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
const client=await db.connect();
try{
 const username=process.env.BOOTSTRAP_ADMIN_USERNAME||'pilot_admin',password=crypto.randomBytes(18).toString('base64url');
 if((await client.query('SELECT 1 FROM users WHERE username=$1',[username])).rowCount)throw new Error('Tài khoản đã có, không ghi đè.');
 const file=fileURLToPath(new URL('../backend/bootstrap-admin.secret.json',import.meta.url));
 if(fs.existsSync(file))throw new Error('Tệp mật khẩu bootstrap đã tồn tại; bảo quản tệp trước khi tạo tài khoản khác.');
 await client.query('BEGIN');
 try{
  const u=(await client.query("INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES($1,$2,$3,'admin',true) RETURNING id",[username,await bcrypt.hash(password,12),'Quản trị Pilot'])).rows[0];
  fs.writeFileSync(file,JSON.stringify({username,temporary_password:password,user_id:u.id,must_change_password:true},null,2),{flag:'wx',mode:0o600});
  await client.query('COMMIT');console.log('Đã tạo admin. Mật khẩu tạm nằm trong tệp riêng: '+file);
 }catch(e){await client.query('ROLLBACK');throw e;}
}finally{client.release();await db.end();}
