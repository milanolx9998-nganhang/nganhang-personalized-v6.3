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
const source=process.env.DB_NAME;
if(!source?.startsWith('nganhang_personalized'))throw Error('Cần database nguồn personalized để sao chép');
if(!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST||'localhost'))throw Error('Bộ V69 chỉ cho phép PostgreSQL local; không truy cập mạng');
const name='nganhang_v69_test_'+Date.now(),port=3127,origin='http://127.0.0.1:'+port,artifacts=path.resolve('../artifacts');
fs.mkdirSync(artifacts,{recursive:true});
const dump=path.join(artifacts,name+'.dump'),uploadsDir=path.join(artifacts,name+'-uploads'),logPath=path.join(artifacts,'v69-integration-server.log');
const env={...process.env,DATABASE_URL:'',DB_NAME:name,PGHOST:process.env.DB_HOST||'localhost',PGPORT:process.env.DB_PORT||'5432',PGUSER:process.env.DB_USER,PGPASSWORD:process.env.DB_PASSWORD,PORT:String(port),HOST:'127.0.0.1',UPLOAD_DIR:uploadsDir,CACHE_DRIVER:'memory'};
const connection={host:env.PGHOST,port:env.PGPORT,user:env.PGUSER,password:env.PGPASSWORD,connectionTimeoutMillis:2000};
const adminPool=new pg.Pool({...connection,database:source});const pw=crypto.randomBytes(18).toString('base64url');
let db,server,admin,teacher,students=[],outsider,wrongGrade,subjectId,topicId,classId,created=false;const ids={};
const modes={class:true,duel_code:true,lobby:true,matchmaking:true,vote:true,ffa:true,team:true};
async function req(method,url,body,token=admin){const r=await fetch(origin+'/api'+url,{method,headers:{Authorization:'Bearer '+token,...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data};}
const expect=(r,s=200)=>{assert.equal(r.status,s,JSON.stringify(r.data));return r.data;};
async function launch(){
 fs.mkdirSync(uploadsDir,{recursive:true});const sink=fs.createWriteStream(logPath,{flags:'a'});
 server=spawn(process.execPath,['src/server.js'],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});server.stdout.pipe(sink,{end:false});server.stderr.pipe(sink,{end:false});server.once('exit',()=>sink.end());
 await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>{cleanup();reject(Error('Khởi động quá hạn; xem v69-integration-server.log'));},30000);const onData=chunk=>{output+=chunk;if(output.includes(origin)){cleanup();resolve();}},onExit=()=>{cleanup();reject(Error('Server thoát khi khởi động; xem log'));};function cleanup(){clearTimeout(timer);server.stdout.off('data',onData);server.off('exit',onExit);}server.stdout.on('data',onData);server.once('exit',onExit);});
}
async function stop(){if(server&&server.exitCode===null){const ended=once(server,'exit');server.kill();await ended;}}
async function login(key){return expect(await req('POST','/auth/login',{username:'v69_'+key,password:pw})).token;}
test.before(async()=>{
 const dumped=spawnSync('pg_dump',['-Fc','-d',source,'-f',dump],{env,encoding:'utf8',timeout:60000});assert.equal(dumped.status,0,'Không sao chép được PostgreSQL local');
 await adminPool.query('CREATE DATABASE '+name);created=true;
 const restored=spawnSync('pg_restore',['--no-owner','--no-privileges','-d',name,dump],{env,encoding:'utf8',timeout:60000});assert.equal(restored.status,0,restored.stderr);
 db=new pg.Pool({...connection,database:name});const hash=await bcrypt.hash(pw,10);
 // B0: ngay cả khi nguồn đã có V69, chỉ che bảng trên bản sao để tái hiện thiếu migration.
 const hasBattle=(await db.query("SELECT to_regclass('battle_rooms') IS NOT NULL AS present")).rows[0].present;
 if(hasBattle)await db.query('ALTER TABLE battle_rooms RENAME TO battle_rooms_v69_test_hidden');
 await db.query("INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES('v69_boot_admin',$1,'Kiểm thử khởi động','admin',false)",[hash]);
 await launch();const bootToken=await login('boot_admin');expect(await req('GET','/health',undefined,bootToken));
 const unavailable=await req('GET','/battle/me',undefined,bootToken);expect(unavailable,503);assert.equal(unavailable.data.error,'Đấu chưa sẵn sàng');
 await stop();if(hasBattle)await db.query('ALTER TABLE battle_rooms_v69_test_hidden RENAME TO battle_rooms');
 // Chỉ chạy migration trên database vừa tạo, không bao giờ trên nguồn.
 const migrated=spawnSync(process.execPath,['src/db/upgrade.js'],{env,encoding:'utf8',timeout:60000});assert.equal(migrated.status,0,migrated.stderr);
 for(const [key,role] of [['admin','admin'],['teacher','teacher'],['one','student'],['two','student'],['three','student'],['outside','student'],['other_grade','student']])ids[key]=(await db.query('INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES($1,$2,$1,$3,false) RETURNING id',['v69_'+key,hash,role])).rows[0].id;
 const year=(await db.query("INSERT INTO school_years(name,start_date,end_date) VALUES($1,CURRENT_DATE-30,CURRENT_DATE+330) RETURNING id",[name])).rows[0].id;
 classId=(await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('9-V69',9,$1) RETURNING id",[year])).rows[0].id;
 const otherClass=(await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('8-V69',8,$1) RETURNING id",[year])).rows[0].id;
 for(const key of ['one','two','three','outside','other_grade']){await db.query('INSERT INTO student_profiles(user_id,student_code) VALUES($1,$2)',[ids[key],'V69-'+key]);await db.query('INSERT INTO class_memberships(class_id,student_id) VALUES($1,$2)',[key==='other_grade'?otherClass:classId,ids[key]]);}
 const dep=(await db.query("INSERT INTO departments(code,name) VALUES('V69','Tổ kiểm thử V69') RETURNING id")).rows[0].id;
 subjectId=(await db.query("INSERT INTO subjects(code,name,department_id) VALUES('V69','Môn kiểm thử V69',$1) RETURNING id",[dep])).rows[0].id;
 topicId=(await db.query("INSERT INTO topics(subject_id,grade,chapter,name) VALUES($1,9,'Chương thử','Bài kiểm thử') RETURNING id",[subjectId])).rows[0].id;
 await db.query('INSERT INTO teacher_class_assignments(teacher_id,class_id,subject_id) VALUES($1,$2,$3)',[ids.teacher,classId,subjectId]);
 const outcome=(await db.query("INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document) VALUES($1,9,'','V69.O','Kiểm thử','TEST','Fixture') RETURNING id",[subjectId])).rows[0].id;
 const yccd=(await db.query("INSERT INTO curriculum_yccds(outcome_id,code,text) VALUES($1,'V69.Y','Kiểm thử') RETURNING id",[outcome])).rows[0].id;
 await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')",[topicId,yccd]);
 await launch();admin=await login('admin');teacher=await login('teacher');students=await Promise.all(['one','two','three'].map(login));outsider=await login('outside');wrongGrade=await login('other_grade');
 const bank=expect(await req('GET','/practice/banks')).find(b=>b.kind==='school');
 const templates=[{type:'multiple_choice',options:['A','B','C','D'].map(id=>({id,text:id})),answer:{correct:'B'}},{type:'true_false',statements:['a','b','c','d'].map(id=>({id,text:id})),answer:{values:{a:true,b:false,c:true,d:false}}},{type:'short_answer',answer:{numeric:2.5,unit:'m',tolerance:.1}},{type:'matching',left:[{id:'a',text:'A'},{id:'b',text:'B'}],right:[{id:'1',text:'Một'},{id:'2',text:'Hai'}],answer:{pairs:{a:'1',b:'2'}}}];
 for(let i=0;i<7;i++){const q=expect(await req('POST','/practice/questions',{...templates[i%4],subject_id:subjectId,topic_id:topicId,grade:9,outcome_id:outcome,yccd_id:yccd,cognitive_level:i<3?1:i<6?2:3,stem:'Câu V69 '+i,explanation:'Giải thích V69 '+i,bank_id:bank.id}),201);for(const status of ['pending_review','approved','active'])expect(await req('POST',`/practice/questions/${q.id}/workflow`,{status}));}
 expect(await req('POST','/battle/admin/settings',{battle_enabled:true,battle_emergency_stop:false,battle_modes:modes}));
});
test.after(async()=>{if(created)await cleanupIntegration({server,db,adminPool,name,dump,uploadsDir});else{await db?.end();await adminPool.end();}});
const setupRoom=async(kind='duel',tokens=students.slice(0,2))=>{
 const host=kind==='class'?teacher:tokens[0],room=expect(await req('POST','/battle/rooms',{kind,...(kind==='class'?{class_id:classId}:{}),scope:{subject_id:subjectId,topic_ids:[topicId]},question_count:7,seconds:20},host),201);
 for(const token of (kind==='class'?tokens:tokens.slice(1)))expect(await req('POST','/battle/rooms/join',{code:room.code},token));
 if(kind==='team')for(let index=0;index<tokens.length;index++)expect(await req('POST',`/battle/rooms/${room.id}/team`,{team:index%2+1},tokens[index]));
 if(kind!=='class')for(const token of tokens)expect(await req('POST',`/battle/rooms/${room.id}/ready`,{ready:true},token));
 const stream=await connectStream(origin,`/battle/rooms/${room.id}/stream`,tokens[0]);expect(await req('POST',`/battle/rooms/${room.id}/start`,{},host));await stream.waitFor(s=>s.phase==='question');return {room,stream,host};
};
async function mastery(){return {events:(await db.query('SELECT * FROM mastery_events WHERE student_id=ANY($1::int[]) ORDER BY id',[[ids.one,ids.two,ids.three]])).rows,states:(await db.query('SELECT * FROM mastery_states WHERE student_id=ANY($1::int[]) ORDER BY student_id,topic_id,cognitive_level',[[ids.one,ids.two,ids.three]])).rows};}
test('V69: ván 3 học sinh, 4 loại, quyền đọc ghi, SSE, retry không ảnh hưởng mastery',async()=>{
 const before=await mastery(),{room,stream}=await setupRoom('ffa',students);const types=new Set();let firstAnswer;
 try{
  expect(await req('GET',`/battle/rooms/${room.id}/result`,undefined,outsider),403);
  expect(await req('POST',`/battle/rooms/${room.id}/answer`,{index:0,client_id:crypto.randomUUID(),response:'B'},wrongGrade),403);
  expect(await req('POST','/battle/rooms/join',{code:room.code},wrongGrade),403);
  const forbidden=await fetch(origin+`/api/battle/rooms/${room.id}/stream`,{headers:{Authorization:'Bearer '+outsider}});assert.equal(forbidden.status,403);await forbidden.text();
  for(let index=0;index<7;index++){
   const state=await stream.waitFor(s=>s.phase==='question'&&s.question.index===index);assert.equal(state.question.answer,undefined);assert.equal(state.distribution,undefined);types.add(state.question.type);
   const responses={multiple_choice:'B',true_false:{a:true,b:false,c:true},short_answer:{value:'2,55',unit:'m'},matching:{a:'1'}};
   for(let player=0;player<3;player++){const data={index,client_id:crypto.randomUUID(),...(player===0?{skip:true}:{response:responses[state.question.type]})};const ack=expect(await req('POST',`/battle/rooms/${room.id}/answer`,data,students[player]));assert.equal(ack.received,true);if(index===0&&player===0)firstAnswer={data,ack};assert.equal((await db.query('SELECT count(*)::int AS n FROM battle_answers WHERE room_id=$1 AND idx=$2 AND user_id=$3',[room.id,index,ids[['one','two','three'][player]]])).rows[0].n,1);}
   await stream.waitFor(s=>s.phase==='reveal'&&s.question.index===index);
   for(const token of students)expect(await req('POST',`/battle/rooms/${room.id}/next`,{},token));
  }
  const result=await stream.waitFor(s=>s.status==='finished');assert.equal(types.size,4);assert.equal(result.questions.length,7);assert.equal(result.review.length,7);assert.equal(result.players,undefined);assert.deepEqual(await mastery(),before);
  assert.deepEqual(expect(await req('POST',`/battle/rooms/${room.id}/answer`,firstAnswer.data,students[0])),firstAnswer.ack);
  expect(await req('POST',`/battle/rooms/${room.id}/answer`,{...firstAnswer.data,client_id:crypto.randomUUID()},students[0]),409);
  const a=expect(await req('POST',`/battle/rooms/${room.id}/retry-wrong`,{},students[0]));const again=expect(await req('POST',`/battle/rooms/${room.id}/retry-wrong`,{},students[0]));assert.equal(a.id,again.id);assert.equal(a.source,'battle_retry');
  const items=expect(await req('GET',`/practice/attempts/${a.id}`,undefined,students[0])).items;assert.equal(items.length,7);
  const persisted=(await db.query('SELECT question_version_id,selection_reason FROM attempt_items WHERE attempt_id=$1',[a.id])).rows;const expected=(await db.query('SELECT question_version_id FROM battle_questions WHERE room_id=$1',[room.id])).rows;assert.deepEqual(persisted.map(x=>x.question_version_id).sort(),expected.map(x=>x.question_version_id).sort());assert.ok(persisted.every(x=>x.selection_reason==='repeat'));
  expect(await req('POST',`/practice/attempts/${a.id}/submit`,{},students[0]));assert.deepEqual(await mastery(),before);
  const next=expect(await req('POST',`/practice/attempts/${a.id}/retry`,{},students[0]),201);assert.equal(next.source,'battle_retry');assert.equal(next.battle_room_id,room.id);
  expect(await req('POST',`/practice/attempts/${next.id}/submit`,{},students[0]));assert.deepEqual(await mastery(),before);
  const review=expect(await req('GET','/practice/review-questions',undefined,students[0]));assert.equal(review.items.filter(x=>x.room_id===room.id).length,7);
 }finally{await stream.close();}
});
test('V69: phòng lớp pause/resume, sát hạn/đóng/trễ, giáo viên điều khiển',async()=>{
 const {room,stream,host}=await setupRoom('class');try{
  const state=await stream.waitFor(s=>s.phase==='question');expect(await req('POST',`/battle/rooms/${room.id}/pause`,{},students[0]),403);
  expect(await req('POST',`/battle/rooms/${room.id}/pause`,{},host));expect(await req('POST',`/battle/rooms/${room.id}/answer`,{index:0,client_id:crypto.randomUUID(),response:'B'},students[0]),409);
  expect(await req('POST',`/battle/rooms/${room.id}/resume`,{},host));const resumed=await stream.waitFor(s=>s.phase==='question'&&s.deadline>state.deadline);
  // Chờ một mốc thật sát hạn hiển thị, vẫn còn khoảng ân hạn 500 ms; biên bằng close_at được unit kiểm bằng đồng hồ tiêm vào.
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,resumed.deadline-Date.now()-100)));
  expect(await req('POST',`/battle/rooms/${room.id}/answer`,{index:0,client_id:crypto.randomUUID(),response:'B'},students[0]));
  await stream.waitFor(s=>s.phase==='reveal');expect(await req('POST',`/battle/rooms/${room.id}/answer`,{index:0,client_id:crypto.randomUUID(),response:'B'},students[1]),409);
  expect(await req('POST',`/battle/rooms/${room.id}/pause`,{},host),409);expect(await req('POST',`/battle/rooms/${room.id}/next`,{},students[0]),403);
  expect(await req('POST',`/battle/rooms/${room.id}/next`,{},host));await stream.waitFor(s=>s.phase==='question'&&s.question.index===1);expect(await req('POST',`/battle/rooms/${room.id}/end`,{},host));const result=await stream.waitFor(s=>s.status==='finished');assert.equal(result.questions.length,2);
 }finally{await stream.close();}
});
test('V69: restart giữ ACK, interrupted chỉ lộ câu đã phát; dừng khẩn cấp',async()=>{
 const {room,stream}=await setupRoom();const data={index:0,client_id:crypto.randomUUID(),response:'B'},ack=expect(await req('POST',`/battle/rooms/${room.id}/answer`,data,students[0]));await stream.close();await stop();await launch();
 const result=expect(await req('GET',`/battle/rooms/${room.id}/result`,undefined,students[0]));assert.equal(result.status,'interrupted');assert.equal(result.questions.length,1);assert.deepEqual(expect(await req('POST',`/battle/rooms/${room.id}/answer`,data,students[0])),ack);
 const next=await setupRoom();await next.stream.close();expect(await req('POST','/battle/admin/settings',{battle_emergency_stop:true}));const interrupted=expect(await req('GET',`/battle/rooms/${next.room.id}/result`,undefined,students[0]));assert.equal(interrupted.end_reason,'emergency');assert.equal(interrupted.questions.length,1);
 expect(await req('POST','/battle/admin/settings',{battle_emergency_stop:false}));
});
test('V69: đội, không sai câu nào; lớp vào từ thẻ ghim khi lobby tắt',async()=>{
 const {room,stream}=await setupRoom('team');try{
  for(let index=0;index<7;index++){
   const state=await stream.waitFor(s=>s.phase==='question'&&s.question.index===index),responses={multiple_choice:'B',true_false:{a:true,b:false,c:true,d:false},short_answer:{value:'2,5',unit:'m'},matching:{a:'1',b:'2'}};
   for(const token of students.slice(0,2))expect(await req('POST',`/battle/rooms/${room.id}/answer`,{index,client_id:crypto.randomUUID(),response:responses[state.question.type]},token));
   await stream.waitFor(s=>s.phase==='reveal'&&s.question.index===index);for(const token of students.slice(0,2))expect(await req('POST',`/battle/rooms/${room.id}/next`,{},token));
  }
  const result=await stream.waitFor(s=>s.status==='finished');assert.equal(result.teams[0].points,700);assert.equal(result.teams[1].points,700);
  const retry=await req('POST',`/battle/rooms/${room.id}/retry-wrong`,{},students[0]);expect(retry,409);assert.equal(retry.data.error,'Em không sai câu nào trong ván này');
 }finally{await stream.close();}
 expect(await req('POST','/battle/admin/settings',{battle_modes:{...Object.fromEntries(Object.keys(modes).map(k=>[k,false])),class:true}}));
 const pinned=expect(await req('POST','/battle/rooms',{kind:'class',class_id:classId,scope:{subject_id:subjectId,topic_ids:[topicId]}},teacher),201);
 assert.ok(expect(await req('GET','/battle/lobby',undefined,students[0])).rooms.some(r=>r.id===pinned.id));
 expect(await req('POST',`/battle/rooms/${pinned.id}/join`,{},students[0]));
 expect(await req('POST',`/battle/rooms/${pinned.id}/leave`,{},students[0]));
 expect(await req('POST','/battle/admin/settings',{battle_modes:modes}));
});
test('V69: bỏ phiếu, chặn tự rời phòng chờ, báo cáo và tạm khóa',async()=>{
 const room=expect(await req('POST','/battle/rooms',{kind:'ffa',content_mode:'vote'},students[2]),201);
 expect(await req('POST','/battle/rooms/join',{code:room.code},students[1]));
 const subject=expect(await req('POST',`/battle/rooms/${room.id}/vote`,{option_id:String(subjectId)},students[2]));assert.equal(subject.vote.stage,'scope');
 expect(await req('POST',`/battle/rooms/${room.id}/vote`,{option_id:'all'},students[2]));
 const final=expect(await req('POST',`/battle/rooms/${room.id}/vote`,{option_id:'all'},students[1]));assert.equal(final.scope.subject_id,subjectId);assert.equal(final.vote,undefined);
 const report=expect(await req('POST','/battle/reports',{room_id:room.id,target_id:ids.two,reason:'bullying'},students[2]),201);
 assert.ok((await db.query('SELECT 1 FROM battle_safety_events WHERE room_id=$1',[room.id])).rowCount>0);
 expect(await req('POST','/battle/blocks',{user_id:ids.two},students[2]));assert.equal(expect(await req('GET','/battle/me',undefined,students[2])).current_room_id,null);
 expect(await req('POST','/battle/admin/reports',{id:report.id,status:'resolved'}));
 expect(await req('POST','/battle/admin/suspensions',{user_id:ids.two,days:1,reason:'Kiểm thử'}));assert.equal(expect(await req('GET','/battle/me',undefined,students[1])).current_room_id,null);
 expect(await req('POST','/battle/rooms',{kind:'duel',scope:{subject_id:subjectId}},students[1]),403);
 expect(await req('GET','/battle/admin/reports',undefined,students[0]),403);
});

test('V69: gợi ý riêng có nhãn, chỉ lấy mastery 30 ngày và không lộ cho người khác',async()=>{
 const state={cognitive_level:1,mastery_score:25,effective_question_count:7,unique_question_count:7,history:[]};
 await db.query('INSERT INTO mastery_states(student_id,topic_id,cognitive_level,mastery_score,state) VALUES($1,$2,1,25,$3)',[ids.three,topicId,state]);
 const own=expect(await req('GET','/battle/options',undefined,students[2]));assert.ok(own.suggestions.some(s=>s.topic_id===topicId&&s.reason==='weak'));assert.ok(own.suggestions.some(s=>s.topic_id===topicId&&s.reason==='recent'));
 assert.deepEqual(expect(await req('GET','/battle/options',undefined,outsider)).suggestions,[]);
 assert.deepEqual(expect(await req('GET',`/battle/options?class_id=${classId}&subject_id=${subjectId}`,undefined,teacher)).suggestions,[]);
 expect(await req('GET',`/battle/options?user_id=${ids.three}`,undefined,outsider),400);
 await db.query("UPDATE mastery_states SET updated_at=now()-interval '31 days' WHERE student_id=$1",[ids.three]);
 assert.deepEqual(expect(await req('GET','/battle/options',undefined,students[2])).suggestions,[]);
});
