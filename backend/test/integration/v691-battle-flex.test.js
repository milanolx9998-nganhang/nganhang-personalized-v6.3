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
if(!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST||'localhost'))throw Error('Bộ V691 chỉ cho phép PostgreSQL local; không truy cập mạng');
const name='nganhang_v691_test_'+Date.now(),port=3128,origin='http://127.0.0.1:'+port,artifacts=path.resolve('../artifacts');
fs.mkdirSync(artifacts,{recursive:true});
const dump=path.join(artifacts,name+'.dump'),uploadsDir=path.join(artifacts,name+'-uploads'),logPath=path.join(artifacts,'v691-integration-server.log');
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
 await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>{cleanup();reject(Error('Khởi động quá hạn; xem v691-integration-server.log'));},30000);const onData=chunk=>{output+=chunk;if(output.includes(origin)){cleanup();resolve();}},onExit=()=>{cleanup();reject(Error('Server thoát khi khởi động; xem log'));};function cleanup(){clearTimeout(timer);server.stdout.off('data',onData);server.off('exit',onExit);}server.stdout.on('data',onData);server.once('exit',onExit);});
}
async function stop(){if(server&&server.exitCode===null){const ended=once(server,'exit');server.kill();await ended;}}
async function login(key){return expect(await req('POST','/auth/login',{username:'v691_'+key,password:pw})).token;}
test.before(async()=>{
 const dumped=spawnSync('pg_dump',['-Fc','-d',source,'-f',dump],{env,encoding:'utf8',timeout:60000});assert.equal(dumped.status,0,'Không sao chép được PostgreSQL local');
 await adminPool.query('CREATE DATABASE '+name);created=true;
 const restored=spawnSync('pg_restore',['--no-owner','--no-privileges','-d',name,dump],{env,encoding:'utf8',timeout:60000});assert.equal(restored.status,0,restored.stderr);
 db=new pg.Pool({...connection,database:name});const hash=await bcrypt.hash(pw,10);
 // B0: ngay cả khi nguồn đã có V691, chỉ che bảng trên bản sao để tái hiện thiếu migration.
 const hasBattle=(await db.query("SELECT to_regclass('battle_rooms') IS NOT NULL AS present")).rows[0].present;
 if(hasBattle)await db.query('ALTER TABLE battle_rooms RENAME TO battle_rooms_v691_test_hidden');
 await db.query("INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES('v691_boot_admin',$1,'Kiểm thử khởi động','admin',false)",[hash]);
 await launch();const bootToken=await login('boot_admin');expect(await req('GET','/health',undefined,bootToken));
 const unavailable=await req('GET','/battle/me',undefined,bootToken);expect(unavailable,503);assert.equal(unavailable.data.error,'Đấu chưa sẵn sàng');
 await stop();if(hasBattle)await db.query('ALTER TABLE battle_rooms_v691_test_hidden RENAME TO battle_rooms');
 // Chỉ chạy migration trên database vừa tạo, không bao giờ trên nguồn.
 const migrated=spawnSync(process.execPath,['src/db/upgrade.js'],{env,encoding:'utf8',timeout:60000});assert.equal(migrated.status,0,migrated.stderr);
 for(const [key,role] of [['admin','admin'],['teacher','teacher'],['one','student'],['two','student'],['three','student'],['outside','student'],['other_grade','student']])ids[key]=(await db.query('INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES($1,$2,$1,$3,false) RETURNING id',['v691_'+key,hash,role])).rows[0].id;
 const year=(await db.query("INSERT INTO school_years(name,start_date,end_date) VALUES($1,CURRENT_DATE-30,CURRENT_DATE+330) RETURNING id",[name])).rows[0].id;
 classId=(await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('9-V691',9,$1) RETURNING id",[year])).rows[0].id;
 const otherClass=(await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('8-V691',8,$1) RETURNING id",[year])).rows[0].id;
 for(const key of ['one','two','three','outside','other_grade']){await db.query('INSERT INTO student_profiles(user_id,student_code) VALUES($1,$2)',[ids[key],'V691-'+key]);await db.query('INSERT INTO class_memberships(class_id,student_id) VALUES($1,$2)',[key==='other_grade'?otherClass:classId,ids[key]]);}
 const dep=(await db.query("INSERT INTO departments(code,name) VALUES('V691','Tổ kiểm thử V691') RETURNING id")).rows[0].id;
 subjectId=(await db.query("INSERT INTO subjects(code,name,department_id) VALUES('V691','Môn kiểm thử V691',$1) RETURNING id",[dep])).rows[0].id;
 topicId=(await db.query("INSERT INTO topics(subject_id,grade,chapter,name) VALUES($1,9,'Chương thử','Bài kiểm thử') RETURNING id",[subjectId])).rows[0].id;
 topicIds.push(topicId);for(let i=1;i<3;i++)topicIds.push((await db.query("INSERT INTO topics(subject_id,grade,chapter,name,order_index) VALUES($1,9,$2,$3,$4) RETURNING id",[subjectId,i===1?'Chapter A':'Chapter B','Lesson '+i,i])).rows[0].id);await db.query("UPDATE topics SET chapter='Chapter A',order_index=0 WHERE id=$1",[topicId]);
 await db.query('INSERT INTO teacher_class_assignments(teacher_id,class_id,subject_id) VALUES($1,$2,$3)',[ids.teacher,classId,subjectId]);
 const outcome=(await db.query("INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document) VALUES($1,9,'','V691.O','Kiểm thử','TEST','Fixture') RETURNING id",[subjectId])).rows[0].id;
 const yccd=(await db.query("INSERT INTO curriculum_yccds(outcome_id,code,text) VALUES($1,'V691.Y','Kiểm thử') RETURNING id",[outcome])).rows[0].id;
 for(const tid of topicIds)await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')",[tid,yccd]);
 await launch();admin=await login('admin');teacher=await login('teacher');students=await Promise.all(['one','two','three'].map(login));outsider=await login('outside');wrongGrade=await login('other_grade');
 const bank=expect(await req('GET','/practice/banks')).find(b=>b.kind==='school');
 const templates=[{type:'multiple_choice',options:['A','B','C','D'].map(id=>({id,text:id})),answer:{correct:'B'}},{type:'true_false',statements:['a','b','c','d'].map(id=>({id,text:id})),answer:{values:{a:true,b:false,c:true,d:false}}},{type:'short_answer',answer:{numeric:2.5,unit:'m',tolerance:.1}},{type:'matching',left:[{id:'a',text:'A'},{id:'b',text:'B'}],right:[{id:'1',text:'Một'},{id:'2',text:'Hai'}],answer:{pairs:{a:'1',b:'2'}}}];
 for(let i=0;i<21;i++){const q=expect(await req('POST','/practice/questions',{...templates[i%4],subject_id:subjectId,topic_id:topicIds[Math.floor(i/7)],grade:9,outcome_id:outcome,yccd_id:yccd,cognitive_level:i<3?1:i<6?2:3,stem:'Câu V691 '+i,explanation:'Giải thích V691 '+i,bank_id:bank.id}),201);for(const status of ['pending_review','approved','active'])expect(await req('POST',`/practice/questions/${q.id}/workflow`,{status}));}
 expect(await req('POST','/battle/admin/settings',{battle_enabled:true,battle_emergency_stop:false,battle_modes:modes,battle_flex:{countdown_ms:50,public_start_ms:100,round_ms:100,bot_time_min:.01,bot_time_max:.02},battle_rank:{abnormal_ms:0}}));
});
test.after(async()=>{if(created)await cleanupIntegration({server,db,adminPool,name,dump,uploadsDir});else{await db?.end();await adminPool.end();}});
const ticket=(extra={})=>({kinds:['duel'],choices:[{subject_id:subjectId}],lengths:[7],flex:'strict',ranked:false,...extra});
async function clearPlayers(){for(const token of students){expect(await req('DELETE','/battle/match',undefined,token));const me=expect(await req('GET','/battle/me',undefined,token));if(me.current_room_id)expect(await req('POST',`/battle/rooms/${me.current_room_id}/leave`,{},token));}}
test.afterEach(clearPlayers);
async function play(roomId,tokens,{wrong=[],disconnect=false}={}){
 const stream=await connectStream(origin,`/battle/rooms/${roomId}/stream`,tokens[0]);
 try{for(let index=0;index<7;index++){
  const state=await stream.waitFor(s=>s.phase==='question'&&s.question.index===index);assert.equal(state.question.answer,undefined);assert.equal(state.question.explanation,undefined);assert.equal(state.bot_plans,undefined);assert.equal(state.match_meta,undefined);
  const responses={multiple_choice:'B',true_false:{a:true,b:false,c:true,d:false},short_answer:{value:2.5,unit:'m'},matching:{a:'1',b:'2'}};
  for(let i=0;i<tokens.length;i++)expect(await req('POST',`/battle/rooms/${roomId}/answer`,{index,client_id:crypto.randomUUID(),...(wrong.includes(i)?{skip:true}:{response:responses[state.question.type]})},tokens[i]));
  await stream.waitFor(s=>s.phase==='reveal'&&s.question.index===index);for(const token of tokens)expect(await req('POST',`/battle/rooms/${roomId}/next`,{},token));
 }return await stream.waitFor(s=>s.status==='finished');}finally{await stream.close();}
}
test('V691: nhiều lựa chọn, rộng gặp hẹp ngay, ghép tự chạy; hai người không còn vé',async()=>{
 expect(await req('POST','/battle/match',ticket({choices:[{subject_id:subjectId,topic_ids:[topicIds[2]]},{subject_id:subjectId,topic_ids:[topicIds[0]]}]}),students[0]));
 const got=expect(await req('POST','/battle/match',ticket({choices:[{subject_id:subjectId,topic_ids:[topicIds[0]]}]}),students[1]));assert.ok(got.current_room_id);assert.equal(got.queue,null);
 const room=(await db.query('SELECT * FROM battle_rooms WHERE id=$1',[got.current_room_id])).rows[0];assert.equal(room.auto_match,true);assert.equal(room.status,'playing');assert.deepEqual(room.scope.topic_ids,[topicIds[0]]);assert.equal((await db.query('SELECT count(*)::int AS n FROM battle_players WHERE room_id=$1 AND ready',[room.id])).rows[0].n,2);
 assert.equal(expect(await req('GET','/battle/me',undefined,students[0])).queue,null);const result=await play(room.id,students.slice(0,2));assert.equal(result.asked_count,7);assert.equal(result.ranked,false);
});
test('V691: ba vé FFA giao cả nhóm và không xé nguồn tính/không tính hạng',async()=>{
 const broad={subject_id:subjectId,topic_ids:topicIds.slice(0,2)};
 for(let i=0;i<2;i++)expect(await req('POST','/battle/match',ticket({kinds:['ffa'],choices:[broad],ranked:i===0}),students[i]));
 const got=expect(await req('POST','/battle/match',ticket({kinds:['ffa'],choices:[broad],ranked:true}),students[2]));assert.ok(got.current_room_id);
 const result=await play(got.current_room_id,students,{wrong:[1,2]});assert.equal(result.me.rank,1);const events=(await db.query('SELECT user_id,delta_lp FROM battle_rating_events WHERE room_id=$1 ORDER BY user_id',[got.current_room_id])).rows;
 assert.deepEqual(events.map(e=>e.user_id),[ids.one,ids.three]);assert.equal(events[0].delta_lp,30);assert.equal(events[1].delta_lp,1); // đồng hạng 2–3: (10-8)/2
 const again=expect(await req('GET',`/battle/rooms/${got.current_room_id}/result`,undefined,students[0]));assert.equal(again.ranked,true);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM battle_rating_events WHERE room_id=$1',[got.current_room_id])).rows[0].n,2);
});
test('V691: nới có trần dữ liệu luyện thật, không chạm Bài chưa luyện',async()=>{
 const aid=crypto.randomUUID(),q=(await db.query('SELECT id,question_id FROM question_versions WHERE topic_id=$1 LIMIT 1',[topicIds[1]])).rows[0];
 await db.query("INSERT INTO attempts(id,student_id,source,mode,config,seed) VALUES($1,$2,'self_practice','practice','{}','test')",[aid,ids.one]);
 await db.query("INSERT INTO attempt_items(attempt_id,question_version_id,question_id,sequence,selection_reason,response) VALUES($1,$2,$3,1,'new','\"B\"')",[aid,q.id,q.question_id]);
 expect(await req('POST','/battle/admin/settings',{battle_flex:{chapter_ms:100,subject_ms:200,exit_ms:300}}));
 const stream=await connectStream(origin,'/battle/lobby/stream',students[0]);try{
  expect(await req('POST','/battle/match',ticket({choices:[{subject_id:subjectId,topic_ids:[topicIds[0]]}],flex:'gradual'}),students[0]));
  const state=await stream.waitFor(s=>s.match?.widened==='subject');assert.deepEqual(state.match.scope.topic_ids,topicIds.slice(0,2));assert.equal(state.match.waiting,null);assert.ok(state.match.school_practicing>=1);assert.equal(state.match.quick_question.answer,undefined);
 }finally{await stream.close();expect(await req('POST','/battle/admin/settings',{battle_flex:{chapter_ms:10000,subject_ms:20000,exit_ms:30000}}));}
});
test('V691: open_slots, quyền chủ phòng, gợi ý xác nhận, chặn hai chiều và loại khi rời',async()=>{
 const room=expect(await req('POST','/battle/rooms',{kind:'ffa',visibility:'code',scope:{subject_id:subjectId,topic_ids:[topicId]},seconds:30},students[0]),201);
 expect(await req('POST',`/battle/rooms/${room.id}/visibility`,{visibility:'code',open_slots:true},students[1]),403);
 expect(await req('POST',`/battle/rooms/${room.id}/visibility`,{visibility:'code',open_slots:true},students[0]));
 const got=expect(await req('POST','/battle/match',ticket({kinds:['ffa']}),students[1]));assert.equal(got.queue.suggestion_room.id,room.id);assert.equal(got.current_room_id,null);
 expect(await req('POST','/battle/match/accept-room',{room_id:room.id},students[1]));assert.equal(expect(await req('GET','/battle/me',undefined,students[1])).queue,null);
 expect(await req('POST',`/battle/rooms/${room.id}/leave`,{},students[1]));assert.equal(expect(await req('POST','/battle/match',ticket({kinds:['ffa']}),students[1])).queue.suggestion_room,null);
 expect(await req('POST','/battle/blocks',{user_id:ids.one},students[1]));expect(await req('POST','/battle/match/accept-room',{room_id:room.id},students[1]),409);
 expect(await req('DELETE',`/battle/blocks/${ids.one}`,undefined,students[1]));
});
test('V691: rank rộng gặp hẹp lấy 4 câu hẹp + 3 câu rộng trong trần chung; người hẹp không nhận LP',async()=>{
 expect(await req('POST','/battle/match',ticket({ranked:true,choices:[{subject_id:subjectId,topic_ids:[topicId]}]}),students[0]));
 const got=expect(await req('POST','/battle/match',ticket({ranked:true}),students[1]));assert.ok(got.current_room_id);
 const room=(await db.query('SELECT scope,match_meta FROM battle_rooms WHERE id=$1',[got.current_room_id])).rows[0];assert.equal(room.match_meta.ranked[ids.one],false);assert.equal(room.match_meta.ranked[ids.two],true);assert.deepEqual(room.scope.topic_ids,topicIds.slice(0,2));
 const counts=(await db.query('SELECT topic_id,count(*)::int AS n FROM battle_questions WHERE room_id=$1 GROUP BY topic_id ORDER BY topic_id',[got.current_room_id])).rows;assert.deepEqual(counts.map(x=>x.n),[4,3]);
 await play(got.current_room_id,students.slice(0,2));assert.deepEqual((await db.query('SELECT user_id FROM battle_rating_events WHERE room_id=$1',[got.current_room_id])).rows.map(x=>x.user_id),[ids.two]);
});
test('V691: phòng công khai tự chạy khi đủ sẵn sàng, phòng tự tạo không có LP',async()=>{
 const room=expect(await req('POST','/battle/rooms',{kind:'duel',visibility:'public',scope:{subject_id:subjectId},seconds:20},students[0]),201);
 expect(await req('POST',`/battle/rooms/${room.id}/join`,{},students[1]));for(const t of students.slice(0,2))expect(await req('POST',`/battle/rooms/${room.id}/ready`,{ready:true},t));
 const result=await play(room.id,students.slice(0,2));assert.equal(result.ranked,false);assert.equal((await db.query('SELECT 1 FROM battle_rating_events WHERE room_id=$1',[room.id])).rowCount,0);
});
test('V691: đấu máy trọn ván, danh tính riêng, không lộ đáp án; không huy hiệu so sánh',async()=>{
 const got=expect(await req('POST','/battle/bot',{choices:[{subject_id:subjectId}],difficulty:'hard',lengths:[7]},students[0]),201),result=await play(got.current_room_id,[students[0]]);
 assert.equal(result.label,'Đấu với máy');assert.deepEqual(result.badges,{});assert.equal(result.podium.filter(p=>p.is_bot).length,1);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM battle_bot_answers WHERE room_id=$1',[got.current_room_id])).rows[0].n,7);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM battle_answers WHERE room_id=$1',[got.current_room_id])).rows[0].n,7);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM battle_players WHERE room_id=$1',[got.current_room_id])).rows[0].n,1);
 expect(await req('POST','/battle/reports',{room_id:got.current_room_id,target_id:'bot:1',reason:'other'},students[0]),400);
});
test('V691: máy từ vé sau mốc, rank tối đa +12, chấm đúng một lần và rollback nguyên tử',async()=>{
 expect(await req('POST','/battle/admin/settings',{battle_flex:{bot_ms:0,bot_probability_min:0,bot_probability_max:0},battle_rank:{bot_wait_ms:0}}));
 expect(await req('POST','/battle/match',ticket({ranked:true}),students[0]));const got=expect(await req('POST','/battle/match/exit',{to:'bot',difficulty:'easy'},students[0]));
 const result=await play(got.current_room_id,[students[0]]);assert.equal(result.ranked,true);
 const events=(await db.query('SELECT * FROM battle_rating_events WHERE room_id=$1',[got.current_room_id])).rows;assert.equal(events.length,1);assert.equal(events[0].delta_lp,12);
 const {createStorage}=await import('../../src/services/battle/storage.js'),storage=createStorage(db),loaded=await storage.load(got.current_room_id);await storage.save(loaded);await storage.save(loaded);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM battle_rating_events WHERE room_id=$1',[got.current_room_id])).rows[0].n,1);
 // Giao dịch thử một ván mới: rollback cả phòng lẫn LP khi bước sau settle bị lỗi.
 const {createRatings}=await import('../../src/services/battle/ratings.js'),rater=createRatings(db),before=(await db.query('SELECT lp,games FROM battle_ratings WHERE user_id=$1',[ids.one])).rows;
 const client=await db.connect();try{await client.query('BEGIN');const id=crypto.randomUUID();await client.query('INSERT INTO battle_rooms SELECT (jsonb_populate_record(NULL::battle_rooms,to_jsonb(r)||jsonb_build_object(\'id\',$2::text))).* FROM battle_rooms r WHERE id=$1',[got.current_room_id,id]);loaded.id=id;loaded.ended_at=Date.now();await rater.settle(client,loaded,{battle_rank:loaded.match_meta.rank_rules});await client.query('ROLLBACK');}finally{client.release();}
 assert.deepEqual((await db.query('SELECT lp,games FROM battle_ratings WHERE user_id=$1',[ids.one])).rows,before);
 expect(await req('POST','/battle/admin/settings',{battle_flex:{bot_ms:15000,bot_probability_min:.05,bot_probability_max:.95},battle_rank:{bot_wait_ms:25000}}));
});
test('V691: giờ vàng CRUD đúng quyền khối/môn, banner và lịch nới nhanh',async()=>{
 const data={grade:9,subject_id:subjectId,starts_at:new Date(Date.now()-60000).toISOString(),minutes:15};expect(await req('POST','/battle/golden-hours',data,teacher),403);expect(await req('POST','/battle/golden-hours',data,students[0]),403);
 expect(await req('PUT','/battle/admin/golden-hour-grants',{user_id:ids.teacher,grade:9,subject_id:subjectId,enabled:true}));
 const h=expect(await req('POST','/battle/golden-hours',data,teacher),201);expect(await req('PUT',`/battle/golden-hours/${h.id}`,{...data,minutes:20},teacher));
 expect(await req('POST','/battle/admin/settings',{battle_flex:{golden_chapter_ms:100,golden_subject_ms:200,golden_exit_ms:300}}));
 const stream=await connectStream(origin,'/battle/lobby/stream',students[0]);try{
  expect(await req('POST','/battle/match',ticket({choices:[{subject_id:subjectId,topic_ids:[topicId]}],flex:'gradual'}),students[0]));const state=await stream.waitFor(s=>s.match?.exits_available);assert.ok(state.golden_hours.some(b=>b.id===h.id&&b.active));assert.equal(state.match.widened,'subject');
 }finally{await stream.close();expect(await req('DELETE',`/battle/golden-hours/${h.id}`,undefined,teacher));}
 assert.equal(expect(await req('GET','/battle/lobby',undefined,students[0])).golden_hours.length,0);
 expect(await req('GET','/battle/leaderboard',undefined,students[0]),403);const rank=expect(await req('GET','/battle/rank',undefined,students[0]));assert.ok(rank.rating.hidden);assert.equal(rank.mmr,undefined);expect(await req('PATCH','/battle/rank',{hidden:false},students[0]),409);
});
test('V692: giới hạn LP bền vững, chuỗi thắng, khiên mạng, trần máy/ngày, mùa reset mềm',async()=>{
 const {createRatings}=await import('../../src/services/battle/ratings.js'),{rankDefaults}=await import('../../src/services/battle/settings.js'),service=createRatings(db);
 const season='test-'+Date.now(),rules={...rankDefaults,season,placement_bonus:0,mmr_k:0},cfg={battle_rank:rules};
 async function settle({win=true,bot=false,disconnected=false,left=false,fast=false,seasonRules=rules}={}){
  const id=crypto.randomUUID(),players=[{user_id:ids.one,display_name:'A',disconnected,left_at:left?Date.now():null,leave_reason:left?'left':null},{user_id:bot?'bot:1':ids.two,display_name:'B',is_bot:bot}],room={id,kind:'duel',grade:9,status:'finished',end_reason:left?'left':'completed',auto_match:true,has_bots:bot,ended_at:Date.now()+7*86400000+(seasonRules.season.endsWith('-network')?1:seasonRules.season.endsWith('-bot')?2:seasonRules.season.endsWith('-fast')?3:seasonRules.season.endsWith('-reset')?4:seasonRules.season.endsWith('-left')?5:0)*86400000,asked_count:7,scope:{subject_id:subjectId,topic_ids:topicIds.slice(0,2)},players,answers:players.flatMap((p,n)=>Array.from({length:7},(_,idx)=>({user_id:p.user_id,idx,score:n===(win?0:1)?1:0,ms:fast?100:5000,skipped:false}))),match_meta:{rank_enabled:true,ranked:{[ids.one]:true},subject_ids:[subjectId],width:'chapter',rank_rules:seasonRules}};
  const client=await db.connect();try{await client.query('BEGIN');await client.query("INSERT INTO battle_rooms(id,code,run_id,kind,visibility,host_id,grade,scope,content_mode,capacity,question_count,seconds,status,asked_count) VALUES($1,'123456',$2,'duel','code',$3,9,$4,'fixed',2,7,20,'finished',7)",[id,crypto.randomUUID(),ids.one,room.scope]);await service.settle(client,room,{battle_rank:seasonRules});await service.settle(client,room,{battle_rank:seasonRules});await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  return (await db.query('SELECT * FROM battle_rating_events WHERE room_id=$1',[id])).rows[0];
 }
 for(let i=0;i<3;i++)assert.equal((await settle()).delta_lp,25);assert.equal((await settle()).delta_lp,13);
 for(let i=4;i<10;i++)await settle();const capped=await settle();assert.equal(capped.delta_lp,0);assert.equal(capped.reason.cap,'pair_daily');
 const shieldRules={...rules,season:season+'-network'};await db.query('INSERT INTO battle_ratings(user_id,grade,season,lp) VALUES($1,9,$2,100)',[ids.one,shieldRules.season]);
 const shield=await settle({win:false,disconnected:true,seasonRules:shieldRules});assert.equal(shield.delta_lp,0);assert.equal(shield.shield,true);const second=await settle({win:false,disconnected:true,seasonRules:shieldRules});assert.equal(second.delta_lp,-10);assert.equal(second.shield,false);
 const botRules={...rules,season:season+'-bot'};for(let i=0;i<3;i++)assert.equal((await settle({bot:true,seasonRules:botRules})).delta_lp,12);assert.equal((await settle({bot:true,seasonRules:botRules})).reason.cap,'bot_daily');
 const abnormalRules={...rules,season:season+'-fast'};const fast=await settle({fast:true,seasonRules:abnormalRules});assert.equal(fast.reason.abnormal,true);assert.equal(fast.delta_lp,13);
 const resetRules={...rules,season:season+'-reset'};await db.query('UPDATE battle_ratings SET lp=800,tier=2,updated_at=now() WHERE user_id=$1 AND season=$2',[ids.one,abnormalRules.season]);await db.query('UPDATE battle_subject_ratings SET mmr=1400 WHERE user_id=$1 AND season=$2',[ids.one,abnormalRules.season]);
 const reset=await settle({seasonRules:resetRules});assert.equal(reset.mmr_before[subjectId],1200);assert.equal(reset.lp_after,425);
 const label=await service.profile(ids.one,9,{battle_rank:resetRules});assert.equal(label.rating.hidden,true);assert.equal(label.rating.games,1);assert.equal(label.rating.placement_left,2);assert.equal(label.history.length,1);
 const quit=await settle({left:true,disconnected:true,seasonRules:{...rules,season:season+'-left'}});assert.equal(quit.delta_lp,-10);assert.equal(quit.reason.left,true);assert.equal(quit.shield,false);
});
test('V691: bot lấp nhóm FFA chỉ khi cả hai cho phép, sau mốc; LP vẫn giới hạn',async()=>{
 expect(await req('POST','/battle/admin/settings',{battle_flex:{pair_ms:500},battle_rank:{bot_wait_ms:600}}));
 const stream=await connectStream(origin,'/battle/lobby/stream',students[0]);let id;
 try{for(const t of students.slice(0,2))expect(await req('POST','/battle/match',ticket({kinds:['ffa'],bot_fill:true,ranked:true,choices:[{subject_id:subjectId,topic_ids:topicIds.slice(0,2)}]}),t));id=(await stream.waitFor(s=>Boolean(s.current_room_id))).current_room_id;}finally{await stream.close();}
 try{assert.equal((await db.query('SELECT count(*)::int AS n FROM battle_bot_players WHERE room_id=$1',[id])).rows[0].n,1);await play(id,students.slice(0,2));assert.ok((await db.query('SELECT delta_lp FROM battle_rating_events WHERE room_id=$1',[id])).rows.every(e=>e.delta_lp<=12));}finally{expect(await req('POST','/battle/admin/settings',{battle_flex:{pair_ms:20000},battle_rank:{bot_wait_ms:25000}}));}
});
test('V692: phòng tự tạo không hạng mặc định, bật chính sách vẫn cần từng người đồng ý',async()=>{
 // Isolate accelerated scenarios without weakening production rate limits.
 await stop(); await launch();
 expect(await req('POST','/battle/rooms',{kind:'duel',ranked:true,scope:{subject_id:subjectId}},students[0]),403);
 expect(await req('POST','/battle/admin/settings',{battle_rank:{self_created:true}}));
 try{const r=expect(await req('POST','/battle/rooms',{kind:'duel',visibility:'public',ranked:true,scope:{subject_id:subjectId,chapter:'Chapter A'},seconds:20},students[0]),201);expect(await req('POST',`/battle/rooms/${r.id}/join`,{},students[1]));for(const t of students.slice(0,2))expect(await req('POST',`/battle/rooms/${r.id}/ready`,{ready:true},t));const result=await play(r.id,students.slice(0,2));assert.equal(result.ranked,true);assert.ok(result.rank_result);assert.deepEqual((await db.query('SELECT user_id FROM battle_rating_events WHERE room_id=$1',[r.id])).rows.map(x=>x.user_id),[ids.one]);}finally{expect(await req('POST','/battle/admin/settings',{battle_rank:{self_created:false}}));}
});
test('V692: hiện/ẩn huy hiệu theo đồng ý, không xuất MMR; giáo viên được cấp quyền toàn khối',async()=>{
 const season=expect(await req('GET','/battle/admin/settings')).battle_rank.season;
 await db.query('UPDATE battle_ratings SET lp=600,tier=2,hidden=true WHERE user_id=$1 AND season=$2',[ids.one,season]);expect(await req('PATCH','/battle/rank',{hidden:false},students[0]));
 const r=expect(await req('POST','/battle/rooms',{kind:'ffa',visibility:'public',scope:{subject_id:subjectId}},students[0]),201);let card=expect(await req('GET','/battle/lobby',undefined,students[1])).rooms.find(x=>x.id===r.id);assert.equal(card.host_badge.name,'Tinh anh');assert.equal(card.host_badge.mmr,undefined);expect(await req('PATCH','/battle/rank',{hidden:true},students[0]));card=expect(await req('GET','/battle/lobby',undefined,students[1])).rooms.find(x=>x.id===r.id);assert.equal(card.host_badge,null);
 expect(await req('PUT','/battle/admin/golden-hour-grants',{user_id:ids.teacher,grade:9,subject_id:null,enabled:true}));const h=expect(await req('POST','/battle/golden-hours',{grade:9,subject_id:null,starts_at:new Date().toISOString(),minutes:15},teacher),201);expect(await req('DELETE',`/battle/golden-hours/${h.id}`,undefined,teacher));expect(await req('PUT','/battle/admin/golden-hour-grants',{user_id:ids.teacher,grade:9,subject_id:null,enabled:false}));expect(await req('POST','/battle/golden-hours',{grade:9,subject_id:null,starts_at:new Date().toISOString(),minutes:15},teacher),403);
});
