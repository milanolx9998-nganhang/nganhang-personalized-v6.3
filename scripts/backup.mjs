import {fingerprint} from './database-fingerprint.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../backend/package.json',import.meta.url));
require('dotenv').config({path:new URL('../backend/.env',import.meta.url)});
const root=path.resolve(process.env.BACKUP_DIR||fileURLToPath(new URL('../backups',import.meta.url))),uploads=path.resolve(fileURLToPath(new URL('../backend/',import.meta.url)),process.env.UPLOAD_DIR||'uploads');
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
const env={...process.env,PGHOST:process.env.DB_HOST,PGPORT:process.env.DB_PORT||'5432',PGUSER:process.env.DB_USER,PGPASSWORD:process.env.DB_PASSWORD};
function command(name,args){const r=spawnSync(name,args,{env,encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error(name+' failed: '+(r.stderr||r.error?.message));}
export function retention(rows){const keep=new Set(),days=new Set(),weeks=new Set(),months=new Set();for(const name of rows){const day=name.slice(0,10);if(days.size<14&&!days.has(day)){days.add(day);keep.add(name);}const date=new Date(day),week=Math.floor(date.getTime()/(864e5*7)),month=name.slice(0,7);if(weeks.size<8&&!weeks.has(week)){weeks.add(week);keep.add(name);}if(months.size<6&&!months.has(month)){months.add(month);keep.add(name);}}return keep;}
async function backup(){
 fs.mkdirSync(root,{recursive:true});if(root===path.parse(root).root)throw new Error('Unsafe backup root');
 const folder=path.join(root,stamp());fs.mkdirSync(folder);
 try{
 const {Pool}=require('pg'),connection=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});let database_fingerprint;
 try{const c=await connection.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const snapshot=(await c.query('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;database_fingerprint=await fingerprint(c);command('pg_dump',['-Fc','--snapshot='+snapshot,'-d',process.env.DB_NAME,'-f',path.join(folder,'database.dump')]);await c.query('COMMIT');}finally{c.release();}}finally{await connection.end();}

 if(fs.existsSync(uploads))command('tar',['-czf',path.join(folder,'uploads.tar.gz'),'-C',uploads,'.']);
 const checksums=Object.fromEntries(fs.readdirSync(folder).map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,name))).digest('hex')]));
 fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({created_at:new Date().toISOString(),database:process.env.DB_NAME,database_fingerprint,checksums,contains_personal_data:true,includes_env:false,config_instruction:'Store .env separately in a password manager; never in public backups.'},null,2));
 if(process.env.BACKUP_REMOTE_DIR){const remote=path.resolve(process.env.BACKUP_REMOTE_DIR);if(remote===root)throw new Error('Remote backup must be on another location/device');fs.mkdirSync(remote,{recursive:true});const remoteFolder=path.join(remote,path.basename(folder));if(fs.existsSync(remoteFolder))throw new Error('Remote destination exists');fs.cpSync(folder,remoteFolder,{recursive:true,errorOnExist:true});for(const [name,hash] of Object.entries(checksums))if(crypto.createHash('sha256').update(fs.readFileSync(path.join(remoteFolder,name))).digest('hex')!==hash)throw new Error('Remote checksum mismatch');}
 const rows=fs.readdirSync(root).filter(n=>/^\d{4}-\d{2}-\d{2}T/.test(n)&&fs.existsSync(path.join(root,n,'manifest.json'))).sort().reverse(),keep=retention(rows);
 for(const name of rows)if(!keep.has(name)){const target=path.resolve(root,name);if(path.dirname(target)!==root)throw new Error('Unsafe retention path');fs.rmSync(target,{recursive:true});}
 fs.writeFileSync(path.join(root,'status.json'),JSON.stringify({last_success:new Date().toISOString(),folder,bytes:Object.keys(checksums).reduce((n,f)=>n+fs.statSync(path.join(folder,f)).size,0),remote_copied_and_hashed:!!process.env.BACKUP_REMOTE_DIR,off_device_verified:false,last_error:null},null,2));
 console.log(JSON.stringify({backup:folder,verified_hashes:checksums,remote:!!process.env.BACKUP_REMOTE_DIR}));return folder;
 }catch(e){const previous=fs.existsSync(path.join(root,'status.json'))?JSON.parse(fs.readFileSync(path.join(root,'status.json'),'utf8')):{};fs.writeFileSync(path.join(root,'status.json'),JSON.stringify({...previous,last_failure:new Date().toISOString(),last_error:'Backup failed; see protected operator logs'},null,2));console.error(JSON.stringify({backup_failed:folder,error:e.message}));throw e;}
}
if(process.argv.includes('--daemon')){let day='';for(;;){const today=new Date().toISOString().slice(0,10);if(day!==today){try{await backup();day=today;}catch{}}await new Promise(r=>setTimeout(r,3600000));}}
else if(import.meta.url===new URL('file:///'+process.argv[1]?.replaceAll('\\','/')).href||process.argv[1]?.endsWith('backup.mjs'))await backup();
