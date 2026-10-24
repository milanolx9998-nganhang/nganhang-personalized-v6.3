import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import {cleanupIntegration} from './helpers/cleanup.js';
import {connectStream} from '../battle/sseClient.js';
import {signToken} from '../../src/middleware/auth.js';
const source=process.env.DB_NAME;
if(!source?.startsWith('nganhang_personalized'))throw Error('Cần database nguồn personalized để sao chép');
if(!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST||'localhost'))throw Error('Bộ V694 chỉ cho phép PostgreSQL local; không truy cập mạng');
const name='nganhang_v694_test_'+Date.now(),port=3131,origin='http://127.0.0.1:'+port,artifacts=path.resolve('../artifacts');
fs.mkdirSync(artifacts,{recursive:true});
const dump=path.join(artifacts,name+'.dump'),uploadsDir=path.join(artifacts,name+'-uploads'),logPath=path.join(artifacts,'v694-integration-server.log');
const env={...process.env,DATABASE_URL:'',DB_NAME:name,PGHOST:process.env.DB_HOST||'localhost',PGPORT:process.env.DB_PORT||'5432',PGUSER:process.env.DB_USER,PGPASSWORD:process.env.DB_PASSWORD,PORT:String(port),HOST:'127.0.0.1',UPLOAD_DIR:uploadsDir,CACHE_DRIVER:'memory'};
const connection={host:env.PGHOST,port:env.PGPORT,user:env.PGUSER,password:env.PGPASSWORD,connectionTimeoutMillis:2000};
const adminPool=new pg.Pool({...connection,database:source});const pw=crypto.randomBytes(18).toString('base64url');
let db,server,admin,teacher,students=[],outsider,wrongGrade,subjectId,topicId,classId,created=false;const topicIds=[],ids={};
const modes={class:true,duel_code:true,lobby:true,matchmaking:true,vote:true,ffa:true,team:true,bot:true,golden_hour:true,ranked:true,leaderboard:false};
async function req(method,url,body,token=admin){const r=await fetch(origin+'/api'+url,{method,headers:{Authorization:'Bearer '+token,...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data};}
const expect=(r,s=200)=>{assert.equal(r.status,s,JSON.stringify(r.data));return r.data;};
async function launch(){
 fs.mkdirSync(uploadsDir,{recursive:true});const sink=fs.createWriteStream(logPath,{flags:'a'});
 server=spawn(process.execPath,['src/server.js'],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});server.stdout.pipe(sink,{end:false});server.stderr.pipe(sink,{end:false});server.once('exit',()=>sink.end());
 await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>{cleanup();reject(Error('Khởi động quá hạn; xem v694-integration-server.log'));},30000);const onData=chunk=>{output+=chunk;if(output.includes(origin)){cleanup();resolve();}},onExit=()=>{cleanup();reject(Error('Server thoát khi khởi động; xem log'));};function cleanup(){clearTimeout(timer);server.stdout.off('data',onData);server.off('exit',onExit);}server.stdout.on('data',onData);server.once('exit',onExit);});
}
async function stop(){if(server&&server.exitCode===null){const ended=once(server,'exit');server.kill();await ended;}}
async function login(key){return expect(await req('POST','/auth/login',{username:'v694_'+key,password:pw})).token;}
test.before(async()=>{
 const dumped=spawnSync('pg_dump',['-Fc','-d',source,'-f',dump],{env,encoding:'utf8',timeout:60000});assert.equal(dumped.status,0,'Không sao chép được PostgreSQL local');
 await adminPool.query('CREATE DATABASE '+name);created=true;
 const restored=spawnSync('pg_restore',['--no-owner','--no-privileges','-d',name,dump],{env,encoding:'utf8',timeout:60000});assert.equal(restored.status,0,restored.stderr);
 db=new pg.Pool({...connection,database:name});const hash=await bcrypt.hash(pw,10);
 // B0: ngay cả khi nguồn đã có V694, chỉ che bảng trên bản sao để tái hiện thiếu migration.
 const hasBattle=(await db.query("SELECT to_regclass('battle_rooms') IS NOT NULL AS present")).rows[0].present;
 if(hasBattle)await db.query('ALTER TABLE battle_rooms RENAME TO battle_rooms_v694_test_hidden');
 await db.query("INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES('v694_boot_admin',$1,'Kiểm thử khởi động','admin',false)",[hash]);
 await launch();const bootToken=await login('boot_admin');expect(await req('GET','/health',undefined,bootToken));
 const unavailable=await req('GET','/battle/me',undefined,bootToken);expect(unavailable,503);assert.equal(unavailable.data.error,'Đấu chưa sẵn sàng');
 await stop();if(hasBattle)await db.query('ALTER TABLE battle_rooms_v694_test_hidden RENAME TO battle_rooms');
 // Chỉ chạy migration trên database vừa tạo, không bao giờ trên nguồn.
 const migrated=spawnSync(process.execPath,['src/db/upgrade.js'],{env,encoding:'utf8',timeout:60000});assert.equal(migrated.status,0,migrated.stderr);
 for(const [key,role] of [['admin','admin'],['teacher','teacher'],['one','student'],['two','student'],['three','student'],['outside','student'],['other_grade','student']])ids[key]=(await db.query('INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES($1,$2,$1,$3,false) RETURNING id',['v694_'+key,hash,role])).rows[0].id;
 const year=(await db.query("INSERT INTO school_years(name,start_date,end_date) VALUES($1,CURRENT_DATE-30,CURRENT_DATE+330) RETURNING id",[name])).rows[0].id;
 classId=(await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('9-V694',9,$1) RETURNING id",[year])).rows[0].id;
 const outsiderClass=(await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('9-V694-other',9,$1) RETURNING id",[year])).rows[0].id;
 const otherClass=(await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('8-V694',8,$1) RETURNING id",[year])).rows[0].id;
 for(const key of ['one','two','three','outside','other_grade']){await db.query('INSERT INTO student_profiles(user_id,student_code) VALUES($1,$2)',[ids[key],'V694-'+key]);await db.query('INSERT INTO class_memberships(class_id,student_id) VALUES($1,$2)',[key==='other_grade'?otherClass:key==='outside'?outsiderClass:classId,ids[key]]);}
 const dep=(await db.query("INSERT INTO departments(code,name) VALUES('V694','Tổ kiểm thử V694') RETURNING id")).rows[0].id;
 subjectId=(await db.query("INSERT INTO subjects(code,name,department_id) VALUES('V694','Môn kiểm thử V694',$1) RETURNING id",[dep])).rows[0].id;
 topicId=(await db.query("INSERT INTO topics(subject_id,grade,chapter,name) VALUES($1,9,'Chương thử','Bài kiểm thử') RETURNING id",[subjectId])).rows[0].id;
 topicIds.push(topicId);for(let i=1;i<3;i++)topicIds.push((await db.query("INSERT INTO topics(subject_id,grade,chapter,name,order_index) VALUES($1,9,$2,$3,$4) RETURNING id",[subjectId,i===1?'Chapter A':'Chapter B','Lesson '+i,i])).rows[0].id);await db.query("UPDATE topics SET chapter='Chapter A',order_index=0 WHERE id=$1",[topicId]);
 await db.query('INSERT INTO teacher_class_assignments(teacher_id,class_id,subject_id) VALUES($1,$2,$3)',[ids.teacher,classId,subjectId]);
 const outcome=(await db.query("INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document) VALUES($1,9,'','V694.O','Kiểm thử','TEST','Fixture') RETURNING id",[subjectId])).rows[0].id;
 const yccd=(await db.query("INSERT INTO curriculum_yccds(outcome_id,code,text) VALUES($1,'V694.Y','Kiểm thử') RETURNING id",[outcome])).rows[0].id;
 for(const tid of topicIds)await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')",[tid,yccd]);
 await launch();admin=await login('admin');teacher=await login('teacher');students=await Promise.all(['one','two','three'].map(login));outsider=await login('outside');wrongGrade=await login('other_grade');
 const bank=expect(await req('GET','/practice/banks')).find(b=>b.kind==='school');
 const templates=[{type:'multiple_choice',options:['A','B','C','D'].map(id=>({id,text:id})),answer:{correct:'B'}},{type:'true_false',statements:['a','b','c','d'].map(id=>({id,text:id})),answer:{values:{a:true,b:false,c:true,d:false}}},{type:'short_answer',answer:{numeric:2.5,unit:'m',tolerance:.1}},{type:'matching',left:[{id:'a',text:'A'},{id:'b',text:'B'}],right:[{id:'1',text:'Một'},{id:'2',text:'Hai'}],answer:{pairs:{a:'1',b:'2'}}}];
 for(let i=0;i<21;i++){const q=expect(await req('POST','/practice/questions',{...templates[i%4],subject_id:subjectId,topic_id:topicIds[Math.floor(i/7)],grade:9,outcome_id:outcome,yccd_id:yccd,cognitive_level:i<3?1:i<6?2:3,stem:'Câu V694 '+i,explanation:'Giải thích V694 '+i,bank_id:bank.id}),201);for(const status of ['pending_review','approved','active'])expect(await req('POST',`/practice/questions/${q.id}/workflow`,{status}));}
 expect(await req('POST','/battle/admin/settings',{battle_enabled:true,battle_emergency_stop:false,battle_modes:modes,battle_flex:{countdown_ms:50,public_start_ms:1000,round_ms:100,bot_time_min:.01,bot_time_max:.02},battle_rank:{abnormal_ms:0}}));
});
test.after(async()=>{if(created)await cleanupIntegration({server,db,adminPool,name,dump,uploadsDir});else{await db?.end();await adminPool.end();}});
const ticket=(extra={})=>({kinds:['duel'],choices:[{subject_id:subjectId}],lengths:[7],flex:'strict',ranked:false,...extra});
async function clearPlayers(){for(const token of students){expect(await req('DELETE','/battle/match',undefined,token));const me=expect(await req('GET','/battle/me',undefined,token));if(me.current_room_id)expect(await req('POST',`/battle/rooms/${me.current_room_id}/leave`,{},token));}}
test.afterEach(clearPlayers);
const lobby=(token=students[2],query='')=>req('GET','/battle/lobby'+query,undefined,token).then(expect);
const create=(token=students[0],extra={})=>req('POST','/battle/rooms',{kind:'duel',visibility:'public',scope:{subject_id:subjectId,topic_ids:[topicId]},...extra},token).then(r=>expect(r,201));

test('V694 HTTP/SSE: trường cũ, nhãn, query, phòng mã riêng/lớp khác, quyền người ngoài',async()=>{
 const stream=await connectStream(origin,'/battle/lobby/stream?subject_id='+subjectId,students[2]);
 let classroom;
 try{
  const room=await create();const snap=await stream.waitFor(s=>s.rooms.some(r=>r.id===room.id));
  for(const k of ['rooms','golden_hours','match','current_room_id','live','seeking','subjects','run_id','version','server_now'])assert.ok(k in snap,k);
  const card=snap.rooms.find(r=>r.id===room.id);assert.equal(card.scope_label.subject,'Môn kiểm thử V694');assert.deepEqual(card.scope_label.topics,['Bài kiểm thử']);assert.equal(card.mode,'duel');assert.equal(typeof card.created_at,'number');assert.equal(typeof card.ranked,'boolean');
  const filtered=await lobby(students[2],`?subject_id=${subjectId}&chapter=Chapter%20A&topic_id=${topicId}`);assert.ok(filtered.rooms.some(r=>r.id===room.id));
  assert.equal((await lobby(students[2],'?subject_id=2147483647')).rooms.length,0);
  for(const q of ['?topic_id=1','?subject_id=-1','?subject_id=1.5','?subject_id=1&chapter=%20','?subject_id=1&evil=1','?subject_id=1&subject_id=2']){
   expect(await req('GET','/battle/lobby'+q,undefined,students[2]),400);expect(await req('GET','/battle/lobby/stream'+q,undefined,students[2]),400);
  }
  const secret=await create(students[1],{visibility:'code'});assert.ok(!(await lobby()).rooms.some(r=>r.id===secret.id));
  classroom=await create(teacher,{kind:'class',class_id:classId,visibility:'code',capacity:50});
  assert.ok((await lobby()).rooms.some(r=>r.id===classroom.id));assert.ok(!(await lobby(outsider)).rooms.some(r=>r.id===classroom.id));assert.equal((await lobby(wrongGrade)).rooms.length,0);
  expect(await req('GET','/battle/lobby',undefined,teacher),403);
  expect(await req('GET',`/battle/rooms/${room.id}`,undefined,students[2]),403);
 }finally{await stream.close();if(classroom)expect(await req('POST',`/battle/rooms/${classroom.id}/leave`,{},teacher));}
});

test('V694: block/unblock hai chiều đổi HTTP và SSE ngay khi cache nóng',async()=>{
 const room=await create();expect(await req('POST',`/battle/rooms/${room.id}/join`,{},students[2]));expect(await req('POST',`/battle/rooms/${room.id}/leave`,{},students[2]));
 const stream=await connectStream(origin,'/battle/lobby/stream',students[2]);
 try{
  await stream.waitFor(s=>s.rooms.some(r=>r.id===room.id));await lobby();
  expect(await req('POST','/battle/blocks',{user_id:ids.three},students[0]));
  await stream.waitFor(s=>!s.rooms.some(r=>r.id===room.id));assert.ok(!(await lobby()).rooms.some(r=>r.id===room.id));
  expect(await req('DELETE','/battle/blocks/'+ids.three,undefined,students[0]));await stream.waitFor(s=>s.rooms.some(r=>r.id===room.id));
  expect(await req('POST','/battle/blocks',{user_id:ids.one},students[2]));await stream.waitFor(s=>!s.rooms.some(r=>r.id===room.id));
  expect(await req('DELETE','/battle/blocks/'+ids.one,undefined,students[2]));await stream.waitFor(s=>s.rooms.some(r=>r.id===room.id));
 }finally{await stream.close();}
});

test('V694: vé ghép từ RAM, singleton chỉ môn; auto-match live ẩn danh, tiến độ và kết thúc qua SSE',async()=>{
 const stream=await connectStream(origin,'/battle/lobby/stream?subject_id='+subjectId,students[2]);let playStream;
 try{
  expect(await req('POST','/battle/match',ticket({choices:[{subject_id:subjectId,topic_ids:[topicId]}]}),students[0]));
  const waiting=await stream.waitFor(s=>s.seeking.some(r=>r.subject_id===subjectId));assert.deepEqual(waiting.seeking,[{subject_id:subjectId,branch_id:null,chapter:null,count:null,has_waiters:true}]);
  assert.equal((await lobby(students[0])).seeking.length,0);assert.equal((await lobby(students[2],`?subject_id=${subjectId}&chapter=Chapter%20A`)).seeking.length,0);
  const match=expect(await req('POST','/battle/match',ticket(),students[1]));const roomId=match.current_room_id;assert.ok(roomId);
  playStream=await connectStream(origin,`/battle/rooms/${roomId}/stream`,students[0]);await playStream.waitFor(s=>s.phase==='question');
  const live=await stream.waitFor(s=>s.live.some(r=>r.id===roomId&&r.asked_count===1));assert.equal(live.seeking.length,0);
  const card=live.live.find(r=>r.id===roomId);assert.equal(card.auto_match,true);assert.equal(card.players,2);assert.equal(typeof card.started_at,'number');
  for(const key of ['code','host_id','host_name','questions','answers','points','public_board','players[]'])assert.ok(!JSON.stringify(card).includes('"'+key+'"'));
  expect(await req('GET',`/battle/rooms/${roomId}`,undefined,students[2]),403);expect(await req('GET',`/battle/rooms/${roomId}/stream`,undefined,students[2]),403);
  expect(await req('POST','/battle/blocks',{user_id:ids.three},students[0]));await stream.waitFor(s=>!s.live.some(r=>r.id===roomId));assert.equal((await lobby()).live.length,0);
  expect(await req('DELETE','/battle/blocks/'+ids.three,undefined,students[0]));await stream.waitFor(s=>s.live.some(r=>r.id===roomId));
  for(const token of students.slice(0,2))expect(await req('POST',`/battle/rooms/${roomId}/answer`,{index:0,client_id:crypto.randomUUID(),skip:true},token));
  await playStream.waitFor(s=>s.phase==='reveal');for(const token of students.slice(0,2))expect(await req('POST',`/battle/rooms/${roomId}/next`,{},token));
  await stream.waitFor(s=>s.live.some(r=>r.id===roomId&&r.asked_count===2));
  for(const token of students.slice(0,2))expect(await req('POST',`/battle/rooms/${roomId}/leave`,{},token));await stream.waitFor(s=>!s.live.some(r=>r.id===roomId));
 }finally{await playStream?.close();await stream.close();}
});

test('V694: cờ lobby tắt giữ thẻ lớp, nhóm mới rỗng; khẩn cấp chặn snapshot',async()=>{
 await create();const pin=await create(teacher,{kind:'class',class_id:classId,visibility:'code',capacity:50});expect(await req('POST','/battle/admin/settings',{battle_modes:{lobby:false}}));
 const hidden=await lobby();assert.deepEqual(hidden.rooms.map(r=>r.id),[pin.id]);assert.deepEqual(hidden.live,[]);assert.deepEqual(hidden.seeking,[]);assert.deepEqual(hidden.subjects,[]);
 expect(await req('POST','/battle/admin/settings',{battle_modes:{lobby:true},battle_emergency_stop:true}));
 expect(await req('GET','/battle/lobby',undefined,students[2]),403);expect(await req('GET','/battle/lobby/stream',undefined,students[2]),403);
 expect(await req('POST','/battle/admin/settings',{battle_emergency_stop:false}));
});

test('V694 Argon HTTP: phòng chưa chọn môn, chọn chương, vé mọi môn không làm đông giả',async()=>{
 const vote=await create(students[0],{scope:{},content_mode:'vote'});
 const all=await lobby();assert.equal(all.subjects.find(s=>s.id===null)?.waiting,1);assert.ok(!(await lobby(students[2],'?subject_id='+subjectId)).rooms.some(r=>r.id===vote.id));
 const chapter=await create(students[1],{scope:{subject_id:subjectId,chapter:'Chapter A'}});
 const card=(await lobby()).rooms.find(r=>r.id===chapter.id);assert.equal(card.scope.chapter,'Chapter A');assert.deepEqual(card.scope_label.topics,[]);
 await clearPlayers();
 expect(await req('POST','/battle/match',ticket({choices:[]}),students[0]));
 const seeking=await lobby();assert.deepEqual(seeking.seeking,[]);assert.deepEqual(seeking.seeking_any,{count:null,has_waiters:true});assert.deepEqual(seeking.subjects,[]);
});

test('V694 tải local: 50 phòng + 300 kết nối SSE thật, đo HTTP khi giữ luồng',async()=>{
 const rows=Array.from({length:350},(_,i)=>({username:'v694_load_'+i,full_name:'Fixture '+i}));
 const users=(await db.query(`INSERT INTO users(username,full_name,password_hash,role,must_change_password)
  SELECT x.username,x.full_name,$1,'student',false FROM jsonb_to_recordset($2) AS x(username text,full_name text) RETURNING *`,[await bcrypt.hash(pw,10),JSON.stringify(rows)])).rows;
 const userIds=users.map(u=>u.id),tokens=users.map(signToken),streams=[],roomIds=[];
 await db.query("INSERT INTO student_profiles(user_id,student_code) SELECT id,'V694-LOAD-'||id FROM users WHERE id=ANY($1::int[])",[userIds]);
 await db.query('INSERT INTO class_memberships(class_id,student_id) SELECT $1,unnest($2::int[])',[classId,userIds]);
 try{
  for(let i=0;i<50;i++)roomIds.push((await create(tokens[i])).id);
  const start=performance.now();
  for(let offset=50;offset<350;offset+=30){
   const batch=await Promise.allSettled(tokens.slice(offset,offset+30).map(token=>connectStream(origin,'/battle/lobby/stream?subject_id='+subjectId,token)));
   for(const r of batch)if(r.status==='fulfilled')streams.push(r.value);
   for(const r of batch)if(r.status==='rejected')throw r.reason;
  }
  assert.equal(streams.length,300);await Promise.all(streams.map(s=>s.waitFor(snap=>snap.rooms.length===50)));
  const opened=performance.now()-start,latency=[];
  for(let offset=50;offset<350;offset+=30)await Promise.all(tokens.slice(offset,offset+30).map(async token=>{const at=performance.now();assert.equal((await lobby(token,'?subject_id='+subjectId)).rooms.length,50);latency.push(performance.now()-at);}));
  // Sự kiện thực thay đổi một phòng phải tới đủ 300 người xem, không lấy lại bằng HTTP.
  expect(await req('POST',`/battle/rooms/${roomIds[0]}/visibility`,{visibility:'code',open_slots:false},tokens[0]));
  await Promise.all(streams.map(s=>s.waitFor(snap=>snap.rooms.length===49)));
  latency.sort((a,b)=>a-b);const report={at:new Date().toISOString(),transport:'HTTP + 300 SSE loopback; PostgreSQL clone',rooms:50,connections:300,http_requests:300,http_p50_ms:latency[149],http_p95_ms:latency[284],http_p99_ms:latency[296],open_300_ms:opened,updated_connections:300};
  fs.writeFileSync(path.join(artifacts,'v694-load-50x300.json'),JSON.stringify(report,null,2));console.log('V694_LOAD '+JSON.stringify(report));
 }finally{await Promise.all(streams.map(s=>s.close()));for(let i=0;i<roomIds.length;i++)await req('POST',`/battle/rooms/${roomIds[i]}/leave`,{},tokens[i]);}
});
