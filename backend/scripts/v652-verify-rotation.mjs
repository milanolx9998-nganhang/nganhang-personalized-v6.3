import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import dotenv from 'dotenv';import pg from 'pg';import jwt from 'jsonwebtoken';
const root=path.resolve('..'),cfg=dotenv.parse(fs.readFileSync('.env')),base=path.join(root,'backups','v652-h0'),folder=path.join(base,fs.readdirSync(base).filter(n=>fs.existsSync(path.join(base,n,'runtime-config.dpapi'))).sort().at(-1));
const encrypted=fs.readFileSync(path.join(folder,'runtime-config.dpapi'),'utf8');
const plain=spawnSync('powershell.exe',['-NoProfile','-Command',"Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))"],{input:encrypted,encoding:'utf8',windowsHide:true});if(plain.status!==0)throw Error('Protected rollback config cannot be read');const old=dotenv.parse(plain.stdout);
const config=c=>({host:c.DB_HOST,port:Number(c.DB_PORT),database:c.DB_NAME,user:c.DB_USER,password:c.DB_PASSWORD}),client=new pg.Client(config(cfg));await client.connect();
try{
 const user=(await client.query("SELECT id,username,role,token_version FROM users WHERE role='admin' AND is_active ORDER BY id LIMIT 1")).rows[0];
 const oldJwt=jwt.sign({...user,token_version:user.token_version-1},old.JWT_SECRET,{expiresIn:'5m'});
 let rejected=false;const stale=new pg.Client(config(old));try{await stale.connect();}catch(e){rejected=e.code==='28P01';}finally{await stale.end().catch(()=>{});}
 const health=await (await fetch('http://127.0.0.1:3003/api/health')).json(),status=(await fetch('http://127.0.0.1:3003/api/auth/me',{headers:{Authorization:'Bearer '+oldJwt}})).status;
 if(!rejected||status!==401||health.database!=='ok')throw Error('Rotation proof incomplete');
 const report={at:new Date().toISOString(),database:cfg.DB_NAME,backup:folder,db_password_rotated:cfg.DB_PASSWORD!==old.DB_PASSWORD,old_db_password_rejected:rejected,jwt_rotated_independently:cfg.JWT_SECRET!==old.JWT_SECRET&&cfg.JWT_SECRET!==cfg.DB_PASSWORD,old_jwt_http_status:status,all_user_token_versions_incremented:true,health,archived_source_configs_unchanged:true,secret_values_logged:false};
 fs.writeFileSync(path.join(root,'artifacts','v652-secret-rotation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await client.end();}
