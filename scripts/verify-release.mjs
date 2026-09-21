import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)),backend=path.join(root,'backend'),artifacts=path.join(root,'artifacts');
const require=createRequire(new URL('../backend/package.json',import.meta.url));require('dotenv').config({path:path.join(backend,'.env')});const {Pool}=require('pg');
const connection={host:process.env.DB_HOST,port:process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD};
const main=new Pool({...connection,database:process.env.DB_NAME}),report={at:new Date().toISOString()};
try{
 const fresh='nganhang_fresh_test_'+Date.now();await main.query('CREATE DATABASE '+fresh);
 const runs=[];for(let i=0;i<2;i++){const r=spawnSync(process.execPath,['src/db/upgrade.js'],{cwd:backend,env:{...process.env,DB_NAME:fresh},encoding:'utf8',windowsHide:true});runs.push({exit:r.status,output:r.stdout,error:r.stderr});if(r.status!==0)throw new Error(r.stderr);}
 const db=new Pool({...connection,database:fresh});try{report.fresh_migration={database:fresh,runs,migrations:(await db.query('SELECT name FROM app_migrations ORDER BY applied_at')).rows};}finally{await db.end();}
 for(const name of ['nganhang_v4',process.env.DB_NAME]){
  const db=new Pool({...connection,database:name});try{report[name]=(await db.query('SELECT (SELECT count(*) FROM questions)::int questions,(SELECT count(*) FROM topics)::int topics,(SELECT count(*) FROM subjects)::int subjects,(SELECT count(*) FROM users)::int users,(SELECT count(*) FROM matrix_templates)::int matrices,(SELECT count(*) FROM exam_runs)::int exams')).rows[0];}finally{await db.end();}
 }
 const original=path.resolve(root,'../nganhang-v4.3.3/nganhang-v4'),exclude=new Set(['node_modules','.git','dist','uploads','backups','artifacts','.agents']);
 function files(dir,relative=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(exclude.has(e.name)||e.name==='.env'||e.name.endsWith('.secret.json'))return [];const rel=path.join(relative,e.name);return e.isDirectory()?files(path.join(dir,e.name),rel):[rel];});}
 const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const changed=[];for(const file of files(root)){const target=path.join(root,file),source=path.join(original,file);if(!fs.existsSync(source)||hash(target)!==hash(source))changed.push({file:file.replaceAll('\\','/'),status:fs.existsSync(source)?'modified':'added',sha256:hash(target)});}
 report.changed_count=changed.length;report.changes_by_group=changed.reduce((a,x)=>{const k=x.file.split('/').slice(0,x.file.startsWith('backend/src')?3:2).join('/');a[k]=(a[k]||0)+1;return a;},{});
 fs.mkdirSync(artifacts,{recursive:true});fs.writeFileSync(path.join(artifacts,'changed-files.json'),JSON.stringify(changed,null,2));fs.writeFileSync(path.join(artifacts,'release-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await main.end();}
