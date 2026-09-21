// One-time, non-overwriting clone from the preserved V5 working copy.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(path.basename(root)!=='nganhang-personalized-v6.3')throw Error('Sai thư mục đích');
const require=createRequire(new URL('../backend/package.json',import.meta.url)),pg=require('pg'),dotenv=require('dotenv');
const source=path.resolve(root,'../nganhang-personalized-v5'),cfg=dotenv.parse(fs.readFileSync(path.join(source,'backend/.env')));
if(cfg.DB_NAME!=='nganhang_personalized_v5'||cfg.DATABASE_URL)throw Error('Cấu hình nguồn khác dự kiến');
const target='nganhang_personalized_v63',connection={host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD},db=new pg.Pool({...connection,database:cfg.DB_NAME});
const env={...process.env,PGHOST:cfg.DB_HOST,PGPORT:cfg.DB_PORT||'5432',PGUSER:cfg.DB_USER,PGPASSWORD:cfg.DB_PASSWORD};
const folder=path.join(root,'backups','v5-baseline'),dump=path.join(folder,'database.dump');
function command(cmd,args){const result=spawnSync(cmd,args,{env,encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error(cmd+' thất bại: '+(result.stderr||result.error?.message));}
async function hashes(pool){const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;const result={};for(const {tablename} of tables){const quoted='"'+tablename.replaceAll('"','""')+'"';result[tablename]=(await pool.query("SELECT count(*)::int count,md5(COALESCE(string_agg(to_jsonb(t)::text,'|' ORDER BY to_jsonb(t)::text),'')) hash FROM "+quoted+' t')).rows[0];}return result;}
let cloned;
try{
 if((await db.query('SELECT 1 FROM pg_database WHERE datname=$1',[target])).rowCount)throw Error('Database đích đã tồn tại, không ghi đè');
 if(fs.existsSync(dump))throw Error('Backup đã tồn tại, không ghi đè');
 fs.mkdirSync(folder,{recursive:true});const before=await hashes(db);
 command('pg_dump',['-Fc','-d',cfg.DB_NAME,'-f',dump]);
 await db.query('CREATE DATABASE '+target);
 command('pg_restore',['--no-owner','--no-privileges','-d',target,dump]);
 cloned=new pg.Pool({...connection,database:target});const copied=await hashes(cloned),after=await hashes(db);
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Dữ liệu nguồn thay đổi trong lúc sao chép; cần đối chiếu lại');
 if(JSON.stringify(after)!==JSON.stringify(copied))throw Error('Database bản sao chưa khớp nguồn');
 const manifest={created_at:new Date().toISOString(),source_folder:source,target_folder:root,source_database:cfg.DB_NAME,target_database:target,dump_sha256:crypto.createHash('sha256').update(fs.readFileSync(dump)).digest('hex'),tables:copied,verified:true,source_unchanged:true};
 fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2));
 console.log(JSON.stringify({target_database:target,verified_tables:Object.keys(copied).length,source_unchanged:true}));
}finally{await cloned?.end();await db.end();}
