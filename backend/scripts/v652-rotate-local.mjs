// Local operator-only operation. Secrets are generated in memory; reports contain booleans only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import dotenv from 'dotenv';
import pg from 'pg';
import jwt from 'jsonwebtoken';
const root=path.resolve('..'),envFile=path.resolve('.env'),original=fs.readFileSync(envFile,'utf8'),old=dotenv.parse(original);
if(old.DB_NAME!=='nganhang_personalized_v63'||old.DB_HOST!=='127.0.0.1')throw Error('Unexpected target');
if(!process.env.CODEX_PATCH_EXEC||!fs.existsSync(process.env.CODEX_PATCH_EXEC))throw Error('Set verified apply_patch executable');
const backupRoot=path.join(root,'backups','v652-h0'),backup=fs.readdirSync(backupRoot).sort().reverse().find(n=>fs.existsSync(path.join(backupRoot,n,'manifest.json')));
if(!backup)throw Error('Database backup required before rotation');
const folder=path.join(backupRoot,backup),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')));
for(const [name,expected] of Object.entries(manifest.checksums))if(crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,name))).digest('hex')!==expected)throw Error('Backup checksum mismatch');
if(spawnSync('pg_restore',['--list',path.join(folder,'database.dump')],{windowsHide:true,stdio:'pipe'}).status!==0)throw Error('Backup is not readable');
const protectedConfig=spawnSync('powershell.exe',['-NoProfile','-Command',"Add-Type -AssemblyName System.Security; $bytes=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))"],{input:original,encoding:'utf8',windowsHide:true});
if(protectedConfig.status!==0)throw Error('Cannot protect rollback config');
fs.writeFileSync(path.join(folder,'runtime-config.dpapi'),protectedConfig.stdout.trim(),{flag:'wx'});
const settings={host:old.DB_HOST,port:Number(old.DB_PORT),database:old.DB_NAME,user:old.DB_USER,password:old.DB_PASSWORD};
const client=new pg.Client(settings);await client.connect();
let committed=false,changedFile=false,nextEnv,server;
function patch(from,to){const patch='*** Begin Patch\n*** Update File: '+envFile.replaceAll('\\','/')+'\n@@\n'+from.replace(/\r/g,'').trimEnd().split('\n').map(s=>'-'+s).join('\n')+'\n'+to.replace(/\r/g,'').trimEnd().split('\n').map(s=>'+'+s).join('\n')+'\n*** End Patch';const r=spawnSync(process.env.CODEX_PATCH_EXEC,['--codex-run-as-apply-patch',patch],{windowsHide:true,stdio:'pipe'});if(r.status!==0)throw Error('Protected configuration patch failed');}
try{
 const others=(await client.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename=current_user AND pid<>pg_backend_pid()')).rows[0].n;
 if(others)throw Error('Other DB clients appeared; inventory again before rotation');
 try{await fetch('http://127.0.0.1:3003/api/health',{signal:AbortSignal.timeout(1000)});throw Error('Target server is running; controlled stop required');}catch(e){if(e.message.startsWith('Target server'))throw e;}
 const user=(await client.query("SELECT id,username,role,token_version FROM users WHERE role='admin' AND is_active ORDER BY id LIMIT 1")).rows[0];
 const oldToken=jwt.sign(user,old.JWT_SECRET,{expiresIn:'5m'}),newPassword=crypto.randomBytes(36).toString('base64url'),newSecret=crypto.randomBytes(64).toString('base64url');
 nextEnv=original.replace(/^DB_PASSWORD=.*$/m,'DB_PASSWORD="'+newPassword+'"').replace(/^JWT_SECRET=.*$/m,'JWT_SECRET="'+newSecret+'"');
 if(nextEnv===original||dotenv.parse(nextEnv).DB_PASSWORD!==newPassword||dotenv.parse(nextEnv).JWT_SECRET!==newSecret)throw Error('Config keys missing');
 await client.query('BEGIN');
 await client.query('ALTER ROLE "'+old.DB_USER.replaceAll('"','""')+'" PASSWORD \''+newPassword+'\'');
 const revocations=await client.query('UPDATE users SET token_version=token_version+1');
 patch(original,nextEnv);changedFile=true;await client.query('COMMIT');committed=true;
 const fresh=new pg.Client({...settings,password:newPassword});await fresh.connect();await fresh.query('SELECT 1');await fresh.end();
 let rejected=false;const stale=new pg.Client(settings);try{await stale.connect();}catch(e){rejected=e.code==='28P01';}finally{await stale.end().catch(()=>{});}
 if(!rejected)throw Error('Old DB password still authenticates');
 const stdout=fs.openSync(path.join(root,'artifacts','local-server.log'),'a'),stderr=fs.openSync(path.join(root,'artifacts','local-server-error.log'),'a');
 server=spawn(process.execPath,['src/server.js'],{cwd:process.cwd(),detached:true,windowsHide:true,stdio:['ignore',stdout,stderr],env:{...process.env,DB_PASSWORD:newPassword,JWT_SECRET:newSecret}});server.unref();fs.closeSync(stdout);fs.closeSync(stderr);
 let health;for(let n=0;n<40;n++){try{const r=await fetch('http://127.0.0.1:3003/api/health',{signal:AbortSignal.timeout(1000)});if(r.ok){health=await r.json();break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 if(!health)throw Error('Rotated config saved but startup health failed');
 const oldJwtStatus=(await fetch('http://127.0.0.1:3003/api/auth/me',{headers:{Authorization:'Bearer '+oldToken}})).status;
 if(oldJwtStatus!==401)throw Error('Old JWT not rejected');
 const report={at:new Date().toISOString(),target_database:old.DB_NAME,archived_configs_unchanged:true,db_password_rotated:true,old_db_password_rejected:true,jwt_secret_rotated_independently:true,old_jwt_http_status:oldJwtStatus,revoked_users:revocations.rowCount,backup:folder,backup_hashes_verified:true,rollback_config:'Windows DPAPI encrypted for current user',pid:server.pid,health};
 fs.writeFileSync(path.join(root,'artifacts','v652-secret-rotation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){if(!committed){await client.query('ROLLBACK').catch(()=>{});if(changedFile)patch(nextEnv,original);}console.error(JSON.stringify({rotation_failed:true,committed,reason:e.message.includes('password')?'Credential verification failed':e.message}));process.exitCode=1;}finally{await client.end();}
