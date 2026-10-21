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
import {createStorage} from '../../src/services/battle/storage.js';
import {createRooms} from '../../src/services/battle/rooms.js';
import {createRatings} from '../../src/services/battle/ratings.js';
import {signToken} from '../../src/middleware/auth.js';
const source=process.env.DB_NAME;
if(!source?.startsWith('nganhang_personalized'))throw Error('Cần database nguồn personalized để sao chép');
if(!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST||'localhost'))throw Error('Bộ V693 chỉ cho phép PostgreSQL local; không truy cập mạng');
const name='nganhang_v693_test_'+Date.now(),port=3130,origin='http://127.0.0.1:'+port,artifacts=path.resolve('../artifacts');
fs.mkdirSync(artifacts,{recursive:true});
const dump=path.join(artifacts,name+'.dump'),uploadsDir=path.join(artifacts,name+'-uploads'),logPath=path.join(artifacts,'v693-integration-server.log');
const env={...process.env,DATABASE_URL:'',DB_NAME:name,PGHOST:process.env.DB_HOST||'localhost',PGPORT:process.env.DB_PORT||'5432',PGUSER:process.env.DB_USER,PGPASSWORD:process.env.DB_PASSWORD,PORT:String(port),HOST:'127.0.0.1',UPLOAD_DIR:uploadsDir,CACHE_DRIVER:'memory'};
const connection={host:env.PGHOST,port:env.PGPORT,user:env.PGUSER,password:env.PGPASSWORD,connectionTimeoutMillis:2000};
const adminPool=new pg.Pool({...connection,database:source});const pw=crypto.randomBytes(18).toString('base64url');
let db,server,admin,teacher,students=[],outsider,wrongGrade,subjectId,topicId,classId,created=false;const ids={};
const modes={class:true,duel_code:true,lobby:true,matchmaking:true,vote:true,ffa:true,team:true,self_paced:true,speed_scoring:true};
async function req(method,url,body,token=admin){const r=await fetch(origin+'/api'+url,{method,headers:{Authorization:'Bearer '+token,...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data};}
const expect=(r,s=200)=>{assert.equal(r.status,s,JSON.stringify(r.data));return r.data;};
async function launch(){
 fs.mkdirSync(uploadsDir,{recursive:true});const sink=fs.createWriteStream(logPath,{flags:'a'});
 server=spawn(process.execPath,['src/server.js'],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});server.stdout.pipe(sink,{end:false});server.stderr.pipe(sink,{end:false});server.once('exit',()=>sink.end());
 await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>{cleanup();reject(Error('Khởi động quá hạn; xem v693-integration-server.log'));},30000);const onData=chunk=>{output+=chunk;if(output.includes(origin)){cleanup();resolve();}},onExit=()=>{cleanup();reject(Error('Server thoát khi khởi động; xem log'));};function cleanup(){clearTimeout(timer);server.stdout.off('data',onData);server.off('exit',onExit);}server.stdout.on('data',onData);server.once('exit',onExit);});
}
async function stop(){if(server&&server.exitCode===null){const ended=once(server,'exit');server.kill();await ended;}}
async function login(key){return expect(await req('POST','/auth/login',{username:'v693_'+key,password:pw})).token;}
test.before(async()=>{
 const dumped=spawnSync('pg_dump',['-Fc','-d',source,'-f',dump],{env,encoding:'utf8',timeout:60000});assert.equal(dumped.status,0,'Không sao chép được PostgreSQL local');
 await adminPool.query('CREATE DATABASE '+name);created=true;
 const restored=spawnSync('pg_restore',['--no-owner','--no-privileges','-d',name,dump],{env,encoding:'utf8',timeout:60000});assert.equal(restored.status,0,restored.stderr);
 db=new pg.Pool({...connection,database:name});const hash=await bcrypt.hash(pw,10);
 // B0: ngay cả khi nguồn đã có V693, chỉ che bảng trên bản sao để tái hiện thiếu migration.
 const hasBattle=(await db.query("SELECT to_regclass('battle_rooms') IS NOT NULL AS present")).rows[0].present;
 if(hasBattle)await db.query('ALTER TABLE battle_rooms RENAME TO battle_rooms_v693_test_hidden');
 await db.query("INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES('v693_boot_admin',$1,'Kiểm thử khởi động','admin',false)",[hash]);
 await launch();const bootToken=await login('boot_admin');expect(await req('GET','/health',undefined,bootToken));
 const unavailable=await req('GET','/battle/me',undefined,bootToken);expect(unavailable,503);assert.equal(unavailable.data.error,'Đấu chưa sẵn sàng');
 await stop();if(hasBattle)await db.query('ALTER TABLE battle_rooms_v693_test_hidden RENAME TO battle_rooms');
 // Chỉ chạy migration trên database vừa tạo, không bao giờ trên nguồn.
 const migrated=spawnSync(process.execPath,['src/db/upgrade.js'],{env,encoding:'utf8',timeout:60000});assert.equal(migrated.status,0,migrated.stderr);
 for(const [key,role] of [['admin','admin'],['teacher','teacher'],['one','student'],['two','student'],['three','student'],['outside','student'],['other_grade','student']])ids[key]=(await db.query('INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES($1,$2,$1,$3,false) RETURNING id',['v693_'+key,hash,role])).rows[0].id;
 const year=(await db.query("INSERT INTO school_years(name,start_date,end_date) VALUES($1,CURRENT_DATE-30,CURRENT_DATE+330) RETURNING id",[name])).rows[0].id;
 classId=(await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('9-V693',9,$1) RETURNING id",[year])).rows[0].id;
 const otherClass=(await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('8-V693',8,$1) RETURNING id",[year])).rows[0].id;
 for(const key of ['one','two','three','outside','other_grade']){await db.query('INSERT INTO student_profiles(user_id,student_code) VALUES($1,$2)',[ids[key],'V693-'+key]);await db.query('INSERT INTO class_memberships(class_id,student_id) VALUES($1,$2)',[key==='other_grade'?otherClass:classId,ids[key]]);}
 const dep=(await db.query("INSERT INTO departments(code,name) VALUES('V693','Tổ kiểm thử V693') RETURNING id")).rows[0].id;
 subjectId=(await db.query("INSERT INTO subjects(code,name,department_id) VALUES('V693','Môn kiểm thử V693',$1) RETURNING id",[dep])).rows[0].id;
 topicId=(await db.query("INSERT INTO topics(subject_id,grade,chapter,name) VALUES($1,9,'Chương thử','Bài kiểm thử') RETURNING id",[subjectId])).rows[0].id;
 await db.query('INSERT INTO teacher_class_assignments(teacher_id,class_id,subject_id) VALUES($1,$2,$3)',[ids.teacher,classId,subjectId]);
 const outcome=(await db.query("INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document) VALUES($1,9,'','V693.O','Kiểm thử','TEST','Fixture') RETURNING id",[subjectId])).rows[0].id;
 const yccd=(await db.query("INSERT INTO curriculum_yccds(outcome_id,code,text) VALUES($1,'V693.Y','Kiểm thử') RETURNING id",[outcome])).rows[0].id;
 await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')",[topicId,yccd]);
 await launch();admin=await login('admin');teacher=await login('teacher');students=await Promise.all(['one','two','three'].map(login));outsider=await login('outside');wrongGrade=await login('other_grade');
 const bank=expect(await req('GET','/practice/banks')).find(b=>b.kind==='school');
 const templates=[{type:'multiple_choice',options:['A','B','C','D'].map(id=>({id,text:id})),answer:{correct:'B'}},{type:'true_false',statements:['a','b','c','d'].map(id=>({id,text:id})),answer:{values:{a:true,b:false,c:true,d:false}}},{type:'short_answer',answer:{numeric:2.5,unit:'m',tolerance:.1}},{type:'matching',left:[{id:'a',text:'A'},{id:'b',text:'B'}],right:[{id:'1',text:'Một'},{id:'2',text:'Hai'}],answer:{pairs:{a:'1',b:'2'}}}];
 for(let i=0;i<15;i++){const q=expect(await req('POST','/practice/questions',{...templates[i%4],subject_id:subjectId,topic_id:topicId,grade:9,outcome_id:outcome,yccd_id:yccd,cognitive_level:i<3?1:i<6?2:3,stem:'Câu V693 '+i,explanation:'Giải thích V693 '+i,bank_id:bank.id}),201);for(const status of ['pending_review','approved','active'])expect(await req('POST',`/practice/questions/${q.id}/workflow`,{status}));}
 expect(await req('POST','/battle/admin/settings',{battle_enabled:true,battle_emergency_stop:false,battle_modes:modes}));
});
test.after(async()=>{if(created)await cleanupIntegration({server,db,adminPool,name,dump,uploadsDir});else{await db?.end();await adminPool.end();}});

const prefix=id=>`/battle/rooms/${id}`;
const snapshot=async(id,token=students[0])=>expect(await req('GET',prefix(id),undefined,token));
const responses={multiple_choice:'B',true_false:{a:true,b:false,c:true,d:false},short_answer:{value:2.5,unit:'m'},matching:{a:'1',b:'2'}};
let deckSnapshot;
async function quiz(extra={},host=teacher){
 const room=expect(await req('POST','/battle/rooms',{kind:'class',class_id:classId,scope:{subject_id:subjectId,topic_ids:[topicId]},pacing:'self',seconds:20,...extra},host),201);
 for(const token of students.slice(0,2))expect(await req('POST','/battle/rooms/join',{code:room.code},token));
 const stream=await connectStream(origin,prefix(room.id)+'/stream',students[0]);
 expect(await req('POST',prefix(room.id)+'/start',{},host));await stream.waitFor(s=>s.phase==='question');
 deckSnapshot=(await createStorage(db).load(room.id)).questions;
 return {id:room.id,stream,host};
}
async function endQuiz(q){expect(await req('POST',prefix(q.id)+'/end',{},q.host));await q.stream.close();}
function noFuture(payload,questions,issued){const json=JSON.stringify(payload);for(const q of questions.slice(issued)){assert.ok(!json.includes(q.content.stem),'Không được lộ stem tương lai');assert.ok(!json.includes(q.content.explanation),'Không được lộ lời giải tương lai');assert.ok(!json.includes(q.question_version_id),'Không được lộ version tương lai');}}

test('V693 API: cờ tắt 403 rõ ràng, Phụ lục 1.2 chặn phòng học sinh/ghép trận/rematch',async()=>{
 expect(await req('POST','/battle/admin/settings',{battle_modes:{self_paced:false,speed_scoring:false}}));
 for(const change of [{pacing:'self'},{scoring:'speed'}]){const res=await req('POST','/battle/rooms',{kind:'class',class_id:classId,scope:{subject_id:subjectId},...change});expect(res,403);assert.equal(res.data.code,'BATTLE_FEATURE_OFF');}
 for(const kind of ['duel','ffa','team'])for(const change of [{pacing:'self'},{scoring:'speed'},{time_limit:'total',total_minutes:3},{reveal_policy:'deferred'},{show_live_board:false}]){const res=await req('POST','/battle/rooms',{kind,scope:{subject_id:subjectId},...change},students[0]);expect(res,400);assert.equal(res.data.code,'BATTLE_MODE_INVALID');}
 for(const url of ['/battle/match',prefix(crypto.randomUUID())+'/rematch']){const res=await req('POST',url,{pacing:'self'},students[0]);expect(res,400);assert.equal(res.data.code,'BATTLE_MODE_INVALID');}
 const redemption=await req('POST','/battle/rooms',{kind:'duel',redemption:true},students[0]);expect(redemption,400);assert.equal(redemption.data.code,'BATTLE_REDEMPTION_UNSUPPORTED');
 expect(await req('POST','/battle/admin/settings',{battle_modes:{self_paced:true,speed_scoring:true}}));
});

test('V693 API/SSE: hai tab, A nhanh/B chậm, result/history/retry/createAttempt/portfolio chỉ câu đã phát',async()=>{
 const q=await quiz(),bStream=await connectStream(origin,prefix(q.id)+'/stream',students[1]);
 try{
  const body={index:0,client_id:crypto.randomUUID(),skip:true},ack=expect(await req('POST',prefix(q.id)+'/answer',body,students[0]));
  // Bỏ phản hồi đầu rồi gửi lại như mất ACK: không chấm/ghi thêm.
  assert.deepEqual(expect(await req('POST',prefix(q.id)+'/answer',body,students[0])),ack);
  expect(await req('POST',prefix(q.id)+'/answer',{...body,client_id:crypto.randomUUID()},students[0]),409);
  const tabs=await Promise.all([1,2].map(()=>req('POST',prefix(q.id)+'/next',{expected_cursor:0},students[0])));assert.deepEqual(tabs.map(r=>r.status).sort(),[200,409]);assert.equal(tabs.find(r=>r.status===409).data.code,'BATTLE_CURSOR_CONFLICT');
  for(let cursor=1;cursor<5;cursor++){expect(await req('POST',prefix(q.id)+'/answer',{index:cursor,client_id:crypto.randomUUID(),skip:true},students[0]));expect(await req('POST',prefix(q.id)+'/next',{expected_cursor:cursor},students[0]));}
  const live=await snapshot(q.id,students[1]);assert.equal(live.my_progress.cursor,0);assert.equal(live.question.answer,undefined);noFuture(live,deckSnapshot,1);
  for(const frame of bStream.snapshots)noFuture(frame,deckSnapshot,1);
  expect(await req('GET',prefix(q.id)+'/projector',undefined,students[0]),403);
  const projector=expect(await req('GET',prefix(q.id)+'/projector',undefined,teacher));assert.equal(projector.teacher_progress,undefined);assert.equal(projector.question,undefined);
  const ownTeacher=await snapshot(q.id,teacher);assert.equal(ownTeacher.teacher_progress.find(p=>p.id===ids.one).issued,6);
  const progress=(await db.query('SELECT player_key,issued_count FROM battle_player_progress WHERE room_id=$1 ORDER BY player_key',[q.id])).rows;assert.equal(progress.find(p=>p.player_key===String(ids.one)).issued_count,6);assert.equal(progress.find(p=>p.player_key===String(ids.two)).issued_count,1);
  await endQuiz(q);const result=expect(await req('GET',prefix(q.id)+'/result',undefined,students[1]));assert.equal(result.questions.length,1);assert.equal(result.me.issued,1);assert.equal(result.me.total,7);assert.equal(result.me.submitted,0);noFuture(result,deckSnapshot,1);
  const history=expect(await req('GET','/battle/history',undefined,students[1])).find(r=>r.id===q.id);noFuture(history,deckSnapshot,1);
  const retry=expect(await req('POST',prefix(q.id)+'/retry-wrong',{},students[1]));const attempt=expect(await req('GET','/practice/attempts/'+retry.id,undefined,students[1]));assert.equal(attempt.items.length,1);noFuture(attempt,deckSnapshot,1);
  const versions=(await db.query('SELECT question_version_id FROM attempt_items WHERE attempt_id=$1',[retry.id])).rows;assert.deepEqual(versions.map(v=>v.question_version_id),[deckSnapshot[0].question_version_id]);
  const review=expect(await req('GET','/practice/review-questions',undefined,students[1])).items.filter(i=>i.room_id===q.id);assert.deepEqual(review.map(i=>i.index),[0]);
  assert.deepEqual(expect(await req('POST',prefix(q.id)+'/answer',body,students[0])),ack);
 }finally{await q.stream.close();await bStream.close();}
});

test('V693 API: deferred không lộ đúng/sai/điểm; pause, màn chiếu SSE, tắt bảng, rematch giữ trục',async()=>{
 const q=await quiz({time_limit:'total',total_minutes:3,scoring:'speed',reveal_policy:'deferred',show_live_board:false});
 const screen=await connectStream(origin,prefix(q.id)+'/projector/stream',teacher);
 try{
  const before=await snapshot(q.id),body={index:0,client_id:crypto.randomUUID(),response:responses[before.question.type]};expect(await req('POST',prefix(q.id)+'/answer',body,students[0]));
  const feedback=await q.stream.waitFor(s=>s.feedback?.received);assert.deepEqual(feedback.feedback,{received:true,index:0});assert.equal(feedback.public_board,undefined);assert.equal(feedback.my_answer.score,undefined);assert.equal(feedback.question.answer,undefined);assert.equal(feedback.my_progress.auto_next_at,null);
  expect(await req('POST',prefix(q.id)+'/pause',{},teacher));const paused=await snapshot(q.id);assert.equal(paused.phase,'paused');
  expect(await req('POST',prefix(q.id)+'/answer',{index:0,client_id:crypto.randomUUID(),skip:true},students[1]),409);
  expect(await req('POST',prefix(q.id)+'/next',{expected_cursor:0},students[0]),409);
  expect(await req('POST',prefix(q.id)+'/resume',{},teacher));const resumed=await snapshot(q.id);assert.ok(resumed.ends_at>=before.ends_at);assert.ok(resumed.my_progress.progress_version>before.my_progress.progress_version);
  for(const frame of screen.snapshots){assert.equal(frame.teacher_progress,undefined);assert.equal(frame.feedback,undefined);assert.equal(frame.public_board,undefined);assert.equal(frame.question,undefined);}
  await endQuiz(q);const result=expect(await req('GET',prefix(q.id)+'/result',undefined,students[0]));assert.equal(result.questions[0].score,1);assert.ok(result.me.points>=600);assert.equal(result.me.submitted,1);
  const rematch=expect(await req('POST',prefix(q.id)+'/rematch',{},teacher),201);for(const k of ['pacing','scoring','time_limit','total_minutes','reveal_policy','show_live_board'])assert.equal(rematch[k],before[k]);
  expect(await req('POST',prefix(rematch.id)+'/leave',{},teacher));
 }finally{await q.stream.close();await screen.close();}
});

test('V693 API: sync speed reveal có fastest và ba thành phần điểm; DB lỗi không quyết toán nửa chừng',async()=>{
 const q=await quiz({pacing:'sync',scoring:'speed'});
 try{
  const state=await snapshot(q.id);expect(await req('POST',prefix(q.id)+'/answer',{index:0,client_id:crypto.randomUUID(),response:responses[state.question.type]},students[0]));
  expect(await req('POST',prefix(q.id)+'/answer',{index:0,client_id:crypto.randomUUID(),response:responses[state.question.type]},students[1]));
  const revealed=await q.stream.waitFor(s=>s.phase==='reveal');assert.ok(revealed.fastest.names.length>=1);assert.ok(Number.isFinite(revealed.fastest.ms));assert.equal(revealed.my_answer.base_points,600);assert.ok(revealed.my_answer.speed_points>=0);assert.ok([0,100].includes(revealed.my_answer.fastest_points));
  const rows=(await db.query('SELECT base_points,speed_points,fastest_points FROM battle_answers WHERE room_id=$1',[q.id])).rows;assert.equal(rows.filter(a=>Number(a.fastest_points)===100).length,revealed.fastest.names.length);
  await endQuiz(q);
 }finally{await q.stream.close();}
});

// Đồng hồ tiêm vào engine, nhưng toàn bộ ghi/đọc và rollback dùng PostgreSQL clone thật.
async function clockQuiz(extra={}){
 let time=10000,serial=0;const timers=new Map(),store=createStorage(db),host={id:ids.teacher,role:'teacher'},users=[ids.one,ids.two].map(id=>({id,role:'student'}));
 const cfg={battle_enabled:true,battle_modes:modes,battle_limits:{rooms:120}},manager=createRooms({store,deck:{count:async()=>7,draw:async()=>structuredClone(deckSnapshot)},safety:{assertAvailable:async()=>{},blockedWith:async()=>false,record:()=>{},closed:()=>{}},streams:{publish:()=>{},configure:()=>{},closeAll:()=>{},closeUser:()=>{}},identity:async()=>({grade:9,class_id:classId,class_name:'9-V693'}),normalizeScope:async(_g,s)=>s,now:()=>time,setTimer:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimer:id=>timers.delete(id)});
 await manager.configure(cfg);const room=await manager.create(host,{kind:'class',class_id:classId,visibility:'code',content_mode:'fixed',scope:{subject_id:subjectId,topic_ids:[topicId]},capacity:50,question_count:7,seconds:20,pacing:'self',time_limit:'total',total_minutes:3,...extra});
 for(const u of users)await manager.join(u,room.id);await manager.command(host,room.id,'start');time=13000;const live=()=>manager.rooms.get(room.id);await manager.internal(room.id,{action:'open',index:-1,schedule_version:live().schedule_version});
 return {id:room.id,manager,store,host,users,live,timers,cfg,setTime:v=>{time=v;}};
}
test('V693 DB: hạn tổng giữa câu, pause, rollback đáp án/tiến độ, request trước hạn, rank giả không ghi',async()=>{
 const f=await clockQuiz({scoring:'speed'}),body={index:0,client_id:crypto.randomUUID(),skip:true};
 try{
  await db.query(`CREATE FUNCTION v693_fail_progress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.phase='feedback' THEN RAISE EXCEPTION 'v693 injected'; END IF; RETURN NEW; END $$; CREATE TRIGGER v693_progress_failure BEFORE UPDATE ON battle_player_progress FOR EACH ROW EXECUTE FUNCTION v693_fail_progress()`);
  await assert.rejects(f.manager.command(f.users[0],f.id,'answer',body),{status:503});assert.equal(f.live().answers.length,0);assert.equal((await db.query('SELECT count(*)::int AS n FROM battle_answers WHERE room_id=$1',[f.id])).rows[0].n,0);assert.equal((await f.store.load(f.id)).progress[ids.one].phase,'question');
  await db.query('DROP TRIGGER v693_progress_failure ON battle_player_progress; DROP FUNCTION v693_fail_progress()');
  const end=f.live().ends_at;f.setTime(14000);await f.manager.command(f.host,f.id,'pause');f.setTime(24000);await f.manager.command(f.host,f.id,'resume');assert.equal(f.live().ends_at,end+10000);
  f.setTime(f.live().ends_at-1);const ack=await f.manager.command(f.users[0],f.id,'answer',body);assert.equal(ack.received,true);
  f.setTime(f.live().ends_at);await assert.rejects(f.manager.command(f.users[1],f.id,'answer',{...body,client_id:crypto.randomUUID()}),{code:'BATTLE_TOTAL_EXPIRED'});
  const persisted=await f.store.load(f.id);assert.equal(persisted.status,'finished');assert.equal(persisted.answers.length,1);assert.equal(persisted.progress[ids.two].issued_count,1);
  const result=await f.manager.snapshot(f.users[1],f.id,true);assert.equal(result.questions.length,1);assert.equal(result.questions[0].submitted,false);assert.equal(result.questions[0].score,0);noFuture(result,deckSnapshot,1);
  const before=(await db.query('SELECT count(*)::int AS n FROM battle_rating_events')).rows[0].n;
  persisted.match_meta={rank_enabled:true,ranked:{[ids.one]:true,[ids.two]:true},subject_ids:[subjectId]};persisted.auto_match=true;persisted.end_reason='completed';
  await f.store.transaction(c=>createRatings(db).settle(c,persisted,{}));assert.equal((await db.query('SELECT count(*)::int AS n FROM battle_rating_events')).rows[0].n,before);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM battle_ratings WHERE user_id=ANY($1::int[])',[[ids.one,ids.two]])).rows[0].n,0);
 }finally{await db.query('DROP TRIGGER IF EXISTS v693_progress_failure ON battle_player_progress; DROP FUNCTION IF EXISTS v693_fail_progress()');f.manager.dispose();}
});

test('V693 DB: thưởng nhanh nhất rollback cùng pha reveal, kết thúc giữa câu không thưởng',async()=>{
 const f=await clockQuiz({pacing:'sync',time_limit:'per_question',total_minutes:null,scoring:'speed'});
 try{
  await f.manager.command(f.users[0],f.id,'answer',{index:0,client_id:crypto.randomUUID(),response:responses[deckSnapshot[0].content.type]});
  await db.query(`CREATE FUNCTION v693_fail_fastest() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.fastest_points>0 THEN RAISE EXCEPTION 'v693 injected'; END IF; RETURN NEW; END $$; CREATE TRIGGER v693_fastest_failure BEFORE UPDATE ON battle_answers FOR EACH ROW EXECUTE FUNCTION v693_fail_fastest()`);
  const close={action:'close',index:0,schedule_version:f.live().schedule_version};await assert.rejects(f.manager.internal(f.id,close),{status:503});assert.equal(f.live().phase,'question');
  const failed=(await db.query('SELECT gameplay FROM battle_rooms WHERE id=$1',[f.id])).rows[0];assert.equal(failed.gameplay.phase,'question');assert.equal(Number((await f.store.load(f.id)).answers[0].fastest_points),0);
  await db.query('DROP TRIGGER v693_fastest_failure ON battle_answers; DROP FUNCTION v693_fail_fastest()');await f.manager.internal(f.id,close);assert.equal(Number((await f.store.load(f.id)).answers[0].fastest_points),100);assert.equal(await f.manager.internal(f.id,close),false);
  await f.manager.command(f.host,f.id,'end');
 }finally{await db.query('DROP TRIGGER IF EXISTS v693_fastest_failure ON battle_answers; DROP FUNCTION IF EXISTS v693_fail_fastest()');f.manager.dispose();}
});

test('V693 API: recover interrupted, biên nhận sau restart và dữ liệu lịch sử NULL tương thích',async()=>{
 const q=await quiz({},admin),state=await snapshot(q.id),body={index:0,client_id:crypto.randomUUID(),response:responses[state.question.type]},ack=expect(await req('POST',prefix(q.id)+'/answer',body,students[0]));
 expect(await req('POST',prefix(q.id)+'/next',{expected_cursor:0},students[0]));await q.stream.close();await stop();await launch();
 const result=expect(await req('GET',prefix(q.id)+'/result',undefined,students[1]));assert.equal(result.status,'interrupted');assert.equal(result.questions.length,1);assert.equal(result.public_board.length,2);assert.equal(result.public_board.reduce((sum,p)=>sum+p.submitted,0),1);noFuture(result,deckSnapshot,1);assert.deepEqual(expect(await req('POST',prefix(q.id)+'/answer',body,students[0])),ack);
 // Phòng cũ không gửi trục: vẫn sync, và điểm NULL đọc theo score*100 sau reload.
 const legacy=expect(await req('POST','/battle/rooms',{kind:'duel',scope:{subject_id:subjectId,topic_ids:[topicId]},seconds:20},students[0]),201);assert.equal(legacy.pacing,'sync');assert.equal(legacy.scoring,'accuracy');
 expect(await req('POST','/battle/rooms/join',{code:legacy.code},students[1]));for(const token of students.slice(0,2))expect(await req('POST',prefix(legacy.id)+'/ready',{ready:true},token));
 const stream=await connectStream(origin,prefix(legacy.id)+'/stream',students[0]);expect(await req('POST',prefix(legacy.id)+'/start',{},students[0]));const first=await stream.waitFor(s=>s.phase==='question');
 expect(await req('POST',prefix(legacy.id)+'/answer',{index:0,client_id:crypto.randomUUID(),response:responses[first.question.type]},students[0]));
 for(const token of students.slice(0,2))expect(await req('POST',prefix(legacy.id)+'/leave',{},token));await stream.close();
 await db.query('UPDATE battle_answers SET base_points=NULL,speed_points=NULL,fastest_points=NULL WHERE room_id=$1',[legacy.id]);await stop();await launch();
 const old=expect(await req('GET',prefix(legacy.id)+'/result',undefined,students[0]));assert.equal(old.me.points,100);assert.equal(old.me.accuracy_sum,1);assert.equal(old.questions.length,1);
});

test('V693 tải HTTP/SSE + PostgreSQL clone: lớp 40 học sinh × 15 câu, đo ACK và số hàng ghi',async()=>{
 const fixtures=Array.from({length:40},(_,i)=>({username:'v693_load_'+i,full_name:'Kiểm thử L'+i}));
 const users=(await db.query(`INSERT INTO users(username,full_name,password_hash,role,must_change_password)
 SELECT x.username,x.full_name,$1,'student',false FROM jsonb_to_recordset($2) AS x(username text,full_name text) RETURNING *`,[await bcrypt.hash(pw,10),JSON.stringify(fixtures)])).rows;
 const userIds=users.map(u=>u.id),tokens=users.map(signToken),streams=[];
 await db.query("INSERT INTO student_profiles(user_id,student_code) SELECT id,'V693-LOAD-'||id FROM users WHERE id=ANY($1::int[])",[userIds]);
 await db.query('INSERT INTO class_memberships(class_id,student_id) SELECT $1,unnest($2::int[])',[classId,userIds]);
 const q=expect(await req('POST','/battle/rooms',{kind:'class',class_id:classId,scope:{subject_id:subjectId,topic_ids:[topicId]},pacing:'self',time_limit:'total',total_minutes:7,question_count:15,seconds:20},teacher),201);
 // Chỉ đo trên clone; trigger ghi đếm giúp phát hiện upsert cả lớp trong mỗi lệnh.
 await db.query(`CREATE TABLE v693_write_audit(table_name text,player_key text,room_id uuid,transaction_id bigint);
 CREATE FUNCTION v693_count_writes() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO v693_write_audit VALUES(TG_TABLE_NAME,COALESCE(to_jsonb(NEW)->>'player_key',to_jsonb(NEW)->>'user_id'),NEW.room_id,txid_current()); RETURN NEW; END $$;
 CREATE TRIGGER v693_count_players AFTER UPDATE ON battle_players FOR EACH ROW EXECUTE FUNCTION v693_count_writes();
 CREATE TRIGGER v693_count_progress AFTER INSERT OR UPDATE ON battle_player_progress FOR EACH ROW EXECUTE FUNCTION v693_count_writes()`);
 const latency=[],nextLatency=[];let report;
 try{
  for(const token of tokens)expect(await req('POST','/battle/rooms/join',{code:q.code},token));
  for(const token of tokens)streams.push(await connectStream(origin,prefix(q.id)+'/stream',token));
  expect(await req('POST',prefix(q.id)+'/start',{},teacher));await Promise.all(streams.map(s=>s.waitFor(r=>r.phase==='question')));
  const playQuestions=(await createStorage(db).load(q.id)).questions;
  await db.query('TRUNCATE v693_write_audit');const start=performance.now();
  for(let index=0;index<15;index++){
   const response=responses[playQuestions[index].content.type];assert.notEqual(response,undefined);
   await Promise.all(tokens.map(async token=>{const at=performance.now();const ack=expect(await req('POST',prefix(q.id)+'/answer',{index,client_id:crypto.randomUUID(),response},token));latency.push(performance.now()-at);assert.equal(ack.received,true);}));
   if(index<14)await Promise.all(tokens.map(async token=>{const at=performance.now();const state=expect(await req('POST',prefix(q.id)+'/next',{expected_cursor:index},token));nextLatency.push(performance.now()-at);assert.equal(state.my_progress.cursor,index+1);}));
  }
  const elapsed=performance.now()-start;await Promise.all(streams.map(s=>s.waitFor(r=>r.status==='finished')));
  const counts=(await db.query('SELECT count(*)::int AS n,count(DISTINCT (idx,user_id))::int AS distinct_n,count(*) FILTER (WHERE score=1 AND NOT skipped)::int AS correct_n FROM battle_answers WHERE room_id=$1',[q.id])).rows[0];assert.deepEqual(counts,{n:600,distinct_n:600,correct_n:600});
  const writes=(await db.query('SELECT table_name,count(*)::int AS n,count(DISTINCT transaction_id)::int AS transactions FROM v693_write_audit WHERE room_id=$1 GROUP BY table_name',[q.id])).rows;
  assert.equal(writes.find(w=>w.table_name==='battle_players').n,40,'Chỉ quyết toán cuối ván ghi cả lớp');
  assert.equal(writes.find(w=>w.table_name==='battle_player_progress').n,1720,'600 chốt + 560 lần mở (hai giao dịch/hàng)');
  const multi=(await db.query("SELECT transaction_id,count(*)::int AS n FROM v693_write_audit WHERE room_id=$1 AND table_name='battle_player_progress' GROUP BY transaction_id HAVING count(*)>1",[q.id])).rows;assert.equal(multi.length,0);
  for(const stream of streams){const times=[...new Set(stream.snapshots.filter(s=>s.board_at!=null).map(s=>s.board_at))];for(let i=1;i<times.length;i++)assert.ok(times[i]-times[i-1]>=1000,'Bảng không được đổi nhanh hơn 1 Hz');}
  const percentile=(values,p)=>Math.round([...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]*100)/100;
  report={at:new Date().toISOString(),transport:'HTTP + 40 SSE, loopback; PostgreSQL clone; có trigger đếm ghi',workload:'self + accuracy + total; 40 đáp án đúng đồng loạt mỗi vòng, đủ TN/ĐS/TLN/GN',players:40,questions:15,answers:counts.n,fully_correct:counts.correct_n,duplicates:counts.n-counts.distinct_n,elapsed_ms:Math.round(elapsed),ack_ms:{p50:percentile(latency,.5),p95:percentile(latency,.95),p99:percentile(latency,.99),max:Math.round(Math.max(...latency))},next_ms:{p95:percentile(nextLatency,.95),p99:percentile(nextLatency,.99)},writes,board_rate_check:'pass',ack_p95_gate_300ms:percentile(latency,.95)<=300};
  fs.writeFileSync(path.join(artifacts,'v693-load-40x15.json'),JSON.stringify(report,null,2));
  console.log('V693_LOAD '+JSON.stringify(report));
 }finally{
  await Promise.all(streams.map(s=>s.close()));
  await db.query('DROP TRIGGER IF EXISTS v693_count_players ON battle_players; DROP TRIGGER IF EXISTS v693_count_progress ON battle_player_progress; DROP FUNCTION IF EXISTS v693_count_writes(); DROP TABLE IF EXISTS v693_write_audit');
 }
});
