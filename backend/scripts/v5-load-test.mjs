import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import pg from 'pg';
import bcrypt from 'bcryptjs';
// No URL flag: deliberately impossible to load-test the real pilot by accident.
const source=JSON.parse(fs.readFileSync('../artifacts/integration-database.json','utf8')).database;
if(!/^nganhang_pilot_test_\d+$/.test(source))throw new Error('Requires a disposable integration fixture database');
const database='nganhang_load_test_'+Date.now(),port=3102,origin='http://127.0.0.1:'+port,artifacts=path.resolve('../artifacts');
const config={host:process.env.DB_HOST,port:process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD};
const admin=new pg.Pool({...config,database:source}),env={...process.env,PGHOST:config.host,PGPORT:String(config.port||5432),PGUSER:config.user,PGPASSWORD:config.password};
let server,db,logHandle;
const measurements=[],resourceSamples=[],failures=[],runs=[],password=crypto.randomBytes(18).toString('base64url');
async function request(method,url,body,token,phase){
 const start=performance.now(),res=await fetch(origin+'/api'+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
 const elapsed=performance.now()-start,data=await res.json();if(phase)measurements.push({phase,ms:elapsed,status:res.status});
 if(!res.ok)throw new Error(phase+': HTTP '+res.status);return data;
}
try{
 await admin.query('CREATE DATABASE '+database);
 const dump=path.join(artifacts,'v5-load-source.dump');
 for(const [command,args] of [['pg_dump',['-Fc','-d',source,'-f',dump]],['pg_restore',['--no-owner','--no-privileges','-d',database,dump]]]){const p=spawnSync(command,args,{env,windowsHide:true,encoding:'utf8'});if(p.status!==0)throw new Error(command+' failed');}
 db=new pg.Pool({...config,database});
 const topics=(await db.query("SELECT id,subject_id FROM topics WHERE name IN ('Bài tick A','Bài tick B') ORDER BY id")).rows;
 if(topics.length!==2)throw new Error('Missing 20-question disposable fixture');
 const hash=await bcrypt.hash(password,10);
 await db.query("INSERT INTO users(username,password_hash,full_name,role) VALUES('v5_load_admin',$1,'Load test admin','admin')",[hash]);
 const users=[];for(let i=0;i<180;i++){const username='v5_load_'+i;const u=(await db.query("INSERT INTO users(username,password_hash,full_name,role) VALUES($1,$2,$1,'student') RETURNING id",[username,hash])).rows[0];await db.query('INSERT INTO student_profiles(user_id,student_code) VALUES($1,$2)',[u.id,username]);users.push({...u,username});}
 logHandle=fs.openSync(path.join(artifacts,'v5-load-server.log'),'w');
 server=spawn(process.execPath,['src/server.js'],{env:{...process.env,DATABASE_URL:'',DB_NAME:database,HOST:'127.0.0.1',PORT:String(port),NODE_ENV:'test',DEMO_DISABLE_LOGIN_LIMIT:'true'},stdio:['ignore',logHandle,logHandle],windowsHide:true});
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error('Load server exited (port might be occupied)');try{if((await fetch(origin+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 const adminToken=(await request('POST','/auth/login',{username:'v5_load_admin',password})).token;
 let offset=0;
 for(const concurrency of [30,50,100]){
  let stopped=false;const sampler=(async()=>{while(!stopped){try{resourceSamples.push({concurrency,...await request('GET','/practice/operations',undefined,adminToken)});}catch{}await new Promise(r=>setTimeout(r,500));}})();
  const started=performance.now(),startIndex=measurements.length;let complete=0;
  await Promise.all(users.slice(offset,offset+concurrency).map(async user=>{try{
   const token=(await request('POST','/auth/login',{username:user.username,password},null,'login')).token;
   const a=await request('POST','/practice/attempts',{subject_id:topics[0].subject_id,grade:9,topic_ids:topics.map(t=>t.id),count:20,percent:[100,0,0,0],types:['multiple_choice'],mode:'challenge'},token,'create');
   const view=await request('GET','/practice/attempts/'+a.id,undefined,token,'open');
   for(const item of view.items)await request('PUT','/practice/attempts/'+a.id+'/items/'+item.id,{response:'B'},token,'save');
   const submitted=await request('POST','/practice/attempts/'+a.id+'/submit',{},token,'submit');if(Number(submitted.percentage)!==100)throw new Error('Unexpected fixture score');
   await request('GET','/practice/students/'+user.id+'/portfolio',undefined,token,'portfolio');complete++;
  }catch(e){failures.push({concurrency,error:e.message});}}));
  stopped=true;await sampler;offset+=concurrency;
  const slice=measurements.slice(startIndex),sorted=slice.map(x=>x.ms).sort((a,b)=>a-b),pct=p=>sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]||null;
  const phases=Object.fromEntries([...new Set(slice.map(x=>x.phase))].map(phase=>{const list=slice.filter(x=>x.phase===phase).map(x=>x.ms).sort((a,b)=>a-b);return [phase,{requests:list.length,p50_ms:list[Math.ceil(list.length*.5)-1],p95_ms:list[Math.ceil(list.length*.95)-1]}];}));
  runs.push({concurrency,completed_sessions:complete,duration_ms:performance.now()-started,requests:slice.length,http_errors:slice.filter(x=>x.status>=400).length,failed_sessions:concurrency-complete,p50_ms:pct(.5),p95_ms:pct(.95),phases});
  console.log(JSON.stringify(runs.at(-1)));
 }
 const report={at:new Date().toISOString(),environment:'Windows local disposable database; NOT production capacity',database,source,logical_cpus:os.cpus().length,total_memory_bytes:os.totalmem(),login_limit_bypass:'Only this loopback test server; simultaneous demo login burst',runs,failures,resourceSamples,notes:'No think time; each session login/create20/open/save20/submit/portfolio. CPU microseconds are cumulative app process usage, RSS excludes PostgreSQL and browser. Database connection counts sampled, not all-process RAM.'};
 fs.writeFileSync(path.join(artifacts,'v5-load-test.json'),JSON.stringify(report,null,2));
 if(failures.length)process.exitCode=1;
}finally{if(server)server.kill();if(logHandle!==undefined)fs.closeSync(logHandle);await db?.end();await admin.end();}
