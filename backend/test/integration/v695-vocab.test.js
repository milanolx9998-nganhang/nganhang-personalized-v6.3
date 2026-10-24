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
const source=process.env.DB_NAME;
if(!source?.startsWith('nganhang_personalized'))throw Error('Cần database nguồn personalized để sao chép');
if(!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST||'localhost'))throw Error('Bộ V695 chỉ cho phép PostgreSQL local; không truy cập mạng');
const name='nganhang_v695_test_'+Date.now(),port=3131,origin='http://127.0.0.1:'+port,artifacts=path.resolve('../artifacts');
fs.mkdirSync(artifacts,{recursive:true});
const dump=path.join(artifacts,name+'.dump'),uploadsDir=path.join(artifacts,name+'-uploads'),logPath=path.join(artifacts,'v695-integration-server.log');
const env={...process.env,DATABASE_URL:'',DB_NAME:name,PGHOST:process.env.DB_HOST||'localhost',PGPORT:process.env.DB_PORT||'5432',PGUSER:process.env.DB_USER,PGPASSWORD:process.env.DB_PASSWORD,PORT:String(port),HOST:'127.0.0.1',UPLOAD_DIR:uploadsDir,CACHE_DRIVER:'memory'};
const connection={host:env.PGHOST,port:env.PGPORT,user:env.PGUSER,password:env.PGPASSWORD,connectionTimeoutMillis:2000};
const adminPool=new pg.Pool({...connection,database:source});const pw=crypto.randomBytes(18).toString('base64url');
let db,server,admin,teacher,students=[],otherGrade,classId,en,zh,setA,setB,created=false;const ids={};
const modes={class:true,duel_code:true,lobby:true,matchmaking:true,vote:true,ffa:true,team:true,self_paced:true,speed_scoring:true,vocab:true};
async function req(method,url,body,token=admin){const r=await fetch(origin+'/api'+url,{method,headers:{Authorization:'Bearer '+token,...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data};}
async function upload(url,file,fields,token=admin){const form=new FormData();for(const [k,v] of Object.entries(fields))form.append(k,String(v));form.append('file',new Blob([fs.readFileSync(file)]),path.basename(file));const r=await fetch(origin+'/api'+url,{method:'POST',headers:{Authorization:'Bearer '+token},body:form});return {status:r.status,data:await r.json()};}
const expect=(r,s=200)=>{assert.equal(r.status,s,JSON.stringify(r.data));return r.data;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function launch(){
 fs.mkdirSync(uploadsDir,{recursive:true});const sink=fs.createWriteStream(logPath,{flags:'a'});
 server=spawn(process.execPath,['src/server.js'],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});server.stdout.pipe(sink,{end:false});server.stderr.pipe(sink,{end:false});server.once('exit',()=>sink.end());
 await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>{cleanup();reject(Error('Khởi động quá hạn; xem v695-integration-server.log'));},30000);const onData=chunk=>{output+=chunk;if(output.includes(origin)){cleanup();resolve();}},onExit=()=>{cleanup();reject(Error('Server thoát khi khởi động; xem log'));};function cleanup(){clearTimeout(timer);server.stdout.off('data',onData);server.off('exit',onExit);}server.stdout.on('data',onData);server.once('exit',onExit);});
}
async function login(key){return expect(await req('POST','/auth/login',{username:'v695_'+key,password:pw})).token;}
const EN_A=[['uniform','đồng phục'],['pencil','bút chì'],['ruler','thước kẻ'],['notebook','quyển vở'],['eraser','cục tẩy'],['backpack','cặp sách'],['classroom','lớp học'],['teacher','giáo viên'],['library','thư viện'],['homework','bài tập về nhà'],['calculator','máy tính bỏ túi'],['dictionary','từ điển']];
const EN_B=[['kitchen','nhà bếp'],['bedroom','phòng ngủ'],['bathroom','phòng tắm'],['sofa','ghế sofa'],['lamp','cái đèn'],['fridge','tủ lạnh'],['wardrobe','tủ quần áo'],['garden','khu vườn'],['window','cửa sổ'],['ceiling','trần nhà'],['stairs','cầu thang'],['mirror','cái gương']];
const ZH=[['你好','nǐ hǎo','xin chào'],['谢谢','xièxie','cảm ơn'],['再见','zàijiàn','tạm biệt'],['老师','lǎoshī','giáo viên'],['学生','xuésheng','học sinh'],['朋友','péngyou','bạn bè'],['妈妈','māma','mẹ'],['爸爸','bàba','bố'],['水','shuǐ','nước'],['茶','chá','trà'],['米饭','mǐfàn','cơm'],['苹果','píngguǒ','quả táo']];
test.before(async()=>{
 const dumped=spawnSync('pg_dump',['-Fc','-d',source,'-f',dump],{env,encoding:'utf8',timeout:60000});assert.equal(dumped.status,0,'Không sao chép được PostgreSQL local');
 await adminPool.query('CREATE DATABASE '+name);created=true;
 const restored=spawnSync('pg_restore',['--no-owner','--no-privileges','-d',name,dump],{env,encoding:'utf8',timeout:60000});assert.equal(restored.status,0,restored.stderr);
 const migrated=spawnSync(process.execPath,['src/db/upgrade.js'],{env,encoding:'utf8',timeout:60000});assert.equal(migrated.status,0,migrated.stderr);
 db=new pg.Pool({...connection,database:name});const hash=await bcrypt.hash(pw,10);
 for(const [key,role] of [['admin','admin'],['teacher','teacher'],['one','student'],['two','student'],['three','student'],['other_grade','student']])ids[key]=(await db.query('INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES($1,$2,$1,$3,false) RETURNING id',['v695_'+key,hash,role])).rows[0].id;
 const year=(await db.query("INSERT INTO school_years(name,start_date,end_date) VALUES($1,CURRENT_DATE-30,CURRENT_DATE+330) RETURNING id",[name])).rows[0].id;
 classId=(await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('9-V695',9,$1) RETURNING id",[year])).rows[0].id;
 const otherClass=(await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('8-V695',8,$1) RETURNING id",[year])).rows[0].id;
 for(const key of ['one','two','three','other_grade']){await db.query('INSERT INTO student_profiles(user_id,student_code) VALUES($1,$2)',[ids[key],'V695-'+key]);await db.query('INSERT INTO class_memberships(class_id,student_id) VALUES($1,$2)',[key==='other_grade'?otherClass:classId,ids[key]]);}
 const dep=(await db.query("INSERT INTO departments(code,name) VALUES('V695','Tổ kiểm thử V695') RETURNING id")).rows[0].id;
 en=(await db.query("INSERT INTO subjects(code,name,department_id) VALUES('V695EN','Tiếng Anh V695',$1) RETURNING id",[dep])).rows[0].id;
 zh=(await db.query("SELECT id FROM subjects WHERE code='TiengTrung' OR lower(name)='tiếng trung' LIMIT 1")).rows[0]?.id;
 await db.query('INSERT INTO teacher_class_assignments(teacher_id,class_id,subject_id) VALUES($1,$2,$3)',[ids.teacher,classId,en]);
 const csv=['word,meaning_vi,topic_name',...EN_A.map(([w,m])=>`${w},${m},Unit 1: My new school`),...EN_B.map(([w,m])=>`${w},${m},Unit 2: My house`),'broken,,Unit 1: My new school','pencil,bút chì,Unit 1: My new school'].join('\n');
 fs.writeFileSync(path.join(artifacts,name+'-en.csv'),'﻿'+csv);
 fs.writeFileSync(path.join(artifacts,name+'-zh.json'),JSON.stringify(ZH.map(([h,p,m])=>({hanzi:h,pinyin:p,nghia:m,hsk:1}))));
 await launch();admin=await login('admin');teacher=await login('teacher');students=await Promise.all(['one','two','three'].map(login));otherGrade=await login('other_grade');
 expect(await req('POST','/battle/admin/settings',{battle_enabled:true,battle_emergency_stop:false,battle_modes:modes}));
});
test.after(async()=>{for(const f of ['-en.csv','-zh.json'])fs.rmSync(path.join(artifacts,name+f),{force:true});if(created)await cleanupIntegration({server,db,adminPool,name,dump,uploadsDir});else{await db?.end();await adminPool.end();}});

const prefix=id=>`/battle/rooms/${id}`;
const right=q=>q.content.type==='matching'?q.content.answer.pairs:q.content.answer.correct;
const wrong=q=>q.content.type==='matching'?Object.fromEntries(Object.keys(q.content.answer.pairs).map((k,i,a)=>[k,q.content.answer.pairs[a[(i+1)%a.length]]])):q.content.options.find(o=>o.id!==q.content.answer.correct).id;

test('V695 ngân hàng từ vựng: nhập CSV (UTF-8, có BOM) + JSON HSK, xem trước → xác nhận, sửa/ẩn, học sinh bị chặn',async()=>{
 expect(await req('GET','/vocab/subjects',undefined,students[0]),403);
 const preview=expect(await upload('/vocab/import/preview',path.join(artifacts,name+'-en.csv'),{subject_id:en,source:'test'}));
 assert.deepEqual(preview.summary,{new:24,update:0,same:0,duplicate:1,error:1});assert.deepEqual(preview.new_sets.sort(),['Unit 1: My new school','Unit 2: My house']);
 assert.equal(preview.rows.find(r=>r.term==='uniform').meaning_vi,'đồng phục','CSV tiếng Việt phải đọc đúng UTF-8');
 assert.deepEqual(expect(await req('POST','/vocab/import/confirm',{token:preview.token})),{created:24,updated:0,new_sets:2});
 expect(await req('POST','/vocab/import/confirm',{token:preview.token}),410);
 const again=expect(await upload('/vocab/import/preview',path.join(artifacts,name+'-en.csv'),{subject_id:en}));assert.equal(again.summary.same,24);assert.equal(again.can_confirm,false);
 const sets=expect(await req('GET','/vocab/sets?subject_id='+en)).sets;setA=sets.find(s=>s.name.startsWith('Unit 1')).id;setB=sets.find(s=>s.name.startsWith('Unit 2')).id;assert.equal(sets.find(s=>s.id===setA).entry_count,12);
 expect(await req('PATCH','/vocab/sets/'+setB,{grade_min:8,grade_max:8}));
 const list=expect(await req('GET',`/vocab/entries?set_id=${setA}&q=pen`));assert.equal(list.total,1);
 const edited=expect(await req('PATCH','/vocab/entries/'+list.entries[0].id,{pos:'n',example:'I write with a pencil.'}));assert.equal(edited.pos,'n');
 expect(await req('PATCH','/vocab/entries/'+list.entries[0].id,{meaning_vi:'thước kẻ',term:'ruler'}),409);
 if(zh){
  const zp=expect(await upload('/vocab/import/preview',path.join(artifacts,name+'-zh.json'),{subject_id:zh}));assert.equal(zp.summary.new,12);assert.deepEqual(zp.new_sets,['HSK 1']);
  expect(await req('POST','/vocab/import/confirm',{token:zp.token}));
  const hsk=expect(await req('GET','/vocab/sets?subject_id='+zh)).sets.find(s=>s.name==='HSK 1');assert.equal(hsk.kind,'hsk');assert.equal(hsk.level,1);
 }
 const template=await fetch(origin+'/api/vocab/template?lang=zh',{headers:{Authorization:'Bearer '+admin}});assert.equal(template.status,200);assert.ok((await template.arrayBuffer()).byteLength>1000);
});

test('V695 Đấu từ vựng: cờ, bộ theo khối, hàng chờ riêng ghép đôi, điểm tốc độ, không tính hạng, không lẫn hàng chờ Bài',async()=>{
 expect(await req('POST','/battle/admin/settings',{battle_modes:{vocab:false}}));
 const off=await req('POST','/battle/vocab/match',{vocab_set_ids:[setA]},students[0]);expect(off,403);assert.equal(off.data.code,'BATTLE_FEATURE_OFF');
 expect(await req('POST','/battle/admin/settings',{battle_modes:{vocab:true}}));
 const mine=expect(await req('GET','/battle/vocab/sets?subject_id='+en,undefined,students[0])).sets;assert.deepEqual(mine.map(s=>s.id),[setA]);assert.equal(mine[0].playable,true);assert.equal(mine[0].language,'en');
 assert.deepEqual(expect(await req('GET','/battle/vocab/sets?subject_id='+en,undefined,otherGrade)).sets.map(s=>s.id).sort(),[setA,setB].sort());
 expect(await req('POST','/battle/vocab/match',{vocab_set_ids:[setB]},students[0]),400);
 const queued=expect(await req('POST','/battle/vocab/match',{vocab_set_ids:[setA]},students[0])).queue;assert.equal(queued.scope_label,'Unit 1: My new school');
 expect(await req('POST','/battle/match',{kinds:['duel'],choices:[{subject_id:en}],lengths:'any',flex:'gradual'},students[0]),409);
 expect(await req('POST','/battle/rooms',{kind:'duel',scope:{content:'vocab',vocab_set_ids:[setA]}},students[0]),409);
 expect(await req('POST','/battle/vocab/match/bot',{},students[0]),403);
 expect(await req('POST','/battle/vocab/match',{subject_id:en,vocab_set_ids:[setA]},students[1]));
 let roomId=null;for(let i=0;i<40&&!roomId;i++){await sleep(250);const me=expect(await req('GET','/battle/me',undefined,students[0]));roomId=me.current_room_id;}
 assert.ok(roomId,'Hai bạn cùng bộ phải được ghép');assert.equal(expect(await req('GET','/battle/me',undefined,students[1])).current_room_id,roomId);
 assert.equal(expect(await req('GET','/battle/vocab/match',undefined,students[0])).queue,null);
 const room=await createStorage(db).load(roomId);assert.equal(room.scoring,'speed');assert.ok(!room.match_meta?.rank_enabled,'Không tính hạng');assert.equal(room.questions.length,10);
 for(const q of room.questions){assert.equal(q.source,'vocab');assert.equal(q.question_version_id,null);assert.ok(['multiple_choice','matching'].includes(q.content.type));assert.ok(q.vocab_entry_ids.length>=1);}
 const live=expect(await req('GET',prefix(roomId),undefined,students[0]));assert.equal(live.scope.content,'vocab');assert.equal(live.scope.vocab_label,'Unit 1: My new school');
 const stream=await connectStream(origin,prefix(roomId)+'/stream',students[0]);
 try{
  await stream.waitFor(s=>s.phase==='question',15000);
  expect(await req('POST',prefix(roomId)+'/answer',{index:0,client_id:crypto.randomUUID(),response:right(room.questions[0])},students[0]));
  expect(await req('POST',prefix(roomId)+'/answer',{index:0,client_id:crypto.randomUUID(),response:wrong(room.questions[0])},students[1]));
  const reveal=await stream.waitFor(s=>s.phase==='reveal');assert.ok(reveal.question.answer,'Có đáp án khi công bố');
  const points=(await db.query('SELECT user_id,base_points,speed_points FROM battle_answers WHERE room_id=$1 AND idx=0',[roomId])).rows;
  assert.ok(Number(points.find(p=>p.user_id===ids.one).speed_points)>0,'Đấu từ vựng có điểm tốc độ');
 }finally{await stream.close();}
 for(const token of students.slice(0,2))expect(await req('POST',prefix(roomId)+'/leave',{},token));
 const result=expect(await req('GET',prefix(roomId)+'/result',undefined,students[1]));assert.ok(Array.isArray(result.vocab_missed));assert.deepEqual(result.review,[]);
 expect(await req('POST',prefix(roomId)+'/retry-wrong',{},students[1]),409);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM battle_rating_events WHERE room_id=$1',[roomId])).rows[0].n,0,'Không cộng/trừ LP');
});

test('V695 Quiz lớp từ vựng: tự chơi, Từ em sai, thống kê từng từ chỉ cộng một lần',async()=>{
 const sums=async()=>Object.fromEntries((await db.query('SELECT student_id,sum(seen)::int AS seen,sum(correct)::int AS correct FROM vocab_student_stats GROUP BY student_id')).rows.map(r=>[r.student_id,r]));
 const before=await sums(),delta=(after,id,k)=>after[id][k]-(before[id]?.[k]||0);
 const scope={content:'vocab',subject_id:en,vocab_set_ids:[setA],vocab_kinds:['EN1','EN2']};
 const quiz=expect(await req('POST','/battle/rooms',{kind:'class',class_id:classId,scope,pacing:'self',seconds:30,question_count:7},teacher),201);
 for(const token of students.slice(0,2))expect(await req('POST','/battle/rooms/join',{code:quiz.code},token));
 const stream=await connectStream(origin,prefix(quiz.id)+'/stream',students[0]);
 try{
  expect(await req('POST',prefix(quiz.id)+'/start',{},teacher));await stream.waitFor(s=>s.phase==='question');
  const room=await createStorage(db).load(quiz.id);assert.equal(room.questions.length,7);assert.ok(room.questions.every(q=>q.content.type==='multiple_choice'),'Chỉ dạng giáo viên cho phép');
  for(let i=0;i<7;i++){
   expect(await req('POST',prefix(quiz.id)+'/answer',{index:i,client_id:crypto.randomUUID(),response:right(room.questions[i])},students[0]));
   expect(await req('POST',prefix(quiz.id)+'/answer',{index:i,client_id:crypto.randomUUID(),response:wrong(room.questions[i])},students[1]));
   if(i<6)for(const token of students.slice(0,2))expect(await req('POST',prefix(quiz.id)+'/next',{expected_cursor:i},token));
  }
 }finally{await stream.close();}
 // Cả lớp làm xong thì Quiz tự kết thúc; giáo viên bấm kết thúc sau đó nhận 409.
 assert.ok([200,409].includes((await req('POST',prefix(quiz.id)+'/end',{},teacher)).status));
 const good=expect(await req('GET',prefix(quiz.id)+'/result',undefined,students[0])),bad=expect(await req('GET',prefix(quiz.id)+'/result',undefined,students[1]));
 assert.deepEqual(good.vocab_missed,[]);assert.equal(bad.vocab_missed.length,7);assert.ok(bad.vocab_missed.every(v=>v.term&&v.meaning_vi&&v.entry_id));
 const after=await sums();assert.equal(delta(after,ids.two,'seen'),7);assert.equal(delta(after,ids.two,'correct'),0);assert.equal(delta(after,ids.one,'correct'),7);
 // Lưu kết thúc lần nữa không cộng trùng.
 const storage=createStorage(db),again=await storage.load(quiz.id);again.ended_at=again.ended_at||Date.now();await storage.save(again,{noPlayers:true});
 assert.equal(delta(await sums(),ids.two,'seen'),7);
});

test('V695 thống kê từ hay sai cho giáo viên và dạng câu mới: sau trận của hai học sinh, GV đúng lớp thấy từ sai, GV lớp khác 403, HS 403',async()=>{
 const scope={content:'vocab',subject_id:en,vocab_set_ids:[setA],vocab_kinds:['EN4']};
 const quiz=expect(await req('POST','/battle/rooms',{kind:'class',class_id:classId,scope,pacing:'self',seconds:30,question_count:10},teacher),201);
 for(const token of students.slice(0,2))expect(await req('POST','/battle/rooms/join',{code:quiz.code},token));
 const stream=await connectStream(origin,prefix(quiz.id)+'/stream',students[0]);
 try{
  expect(await req('POST',prefix(quiz.id)+'/start',{},teacher));await stream.waitFor(s=>s.phase==='question');
  const room=await createStorage(db).load(quiz.id);assert.equal(room.questions.length,10);
  assert.ok(room.questions.every(q=>q.content.type==='short_answer'),'Chọn EN4 sinh câu short_answer');
  for(let i=0;i<10;i++){
   const ans=room.questions[i].content.answer.aliases[0];
   expect(await req('POST',prefix(quiz.id)+'/answer',{index:i,client_id:crypto.randomUUID(),response:i===0?ans.toUpperCase()+' ':'sai_chinh_ta'},students[0]));
   expect(await req('POST',prefix(quiz.id)+'/answer',{index:i,client_id:crypto.randomUUID(),response:'sai_chinh_ta'},students[1]));
   if(i<9)for(const token of students.slice(0,2))expect(await req('POST',prefix(quiz.id)+'/next',{expected_cursor:i},token));
  }
 }finally{await stream.close();}
 assert.ok([200,409].includes((await req('POST',prefix(quiz.id)+'/end',{},teacher)).status));
 // Quyền truy cập /api/vocab/stats: học sinh 403, giáo viên lớp khác 403, giáo viên thiếu class_id 403.
 const otherClass=(await db.query("SELECT id FROM classes WHERE name='8-V695'")).rows[0].id;
 const hash=(await db.query('SELECT password_hash FROM users WHERE id=$1',[ids.teacher])).rows[0].password_hash;
 const otherTeacherId=(await db.query("INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES('v695_teacher_other',$1,'GV lớp khác','teacher',false) RETURNING id",[hash])).rows[0].id;
 await db.query('INSERT INTO teacher_class_assignments(teacher_id,class_id,subject_id) VALUES($1,$2,$3)',[otherTeacherId,otherClass,en]);
 const otherTeacher=await login('teacher_other');
 expect(await req('GET',`/vocab/stats?set_id=${setA}&class_id=${classId}`,undefined,students[0]),403);
 expect(await req('GET',`/vocab/stats?set_id=${setA}&class_id=${otherClass}`,undefined,teacher),403);
 expect(await req('GET',`/vocab/stats?set_id=${setA}&class_id=${classId}`,undefined,otherTeacher),403);
 expect(await req('GET',`/vocab/stats?set_id=${setA}`,undefined,teacher),403);
 // Giáo viên đúng lớp thấy danh sách từ hay sai (seen>=3, sắp theo tỉ lệ sai giảm dần, không lộ tên học sinh).
 const stats=expect(await req('GET',`/vocab/stats?set_id=${setA}&class_id=${classId}`,undefined,teacher));
 assert.equal(stats.set.id,setA);assert.ok(stats.rows.length>=5,'Các từ đạt seen>=3 phải hiện ra');
 for(let i=0;i<stats.rows.length;i++){
  const r=stats.rows[i];
  assert.ok(r.entry_id&&r.term&&r.meaning_vi);assert.ok(r.seen>=3);assert.ok(r.students>=2);assert.ok(r.wrong_rate>0&&r.wrong_rate<=1);
  assert.equal('student_id' in r||('full_name' in r),false,'Không lộ thông tin học sinh');
  if(i>0)assert.ok(stats.rows[i-1].wrong_rate>r.wrong_rate||(stats.rows[i-1].wrong_rate===r.wrong_rate&&stats.rows[i-1].seen>=r.seen),'Sắp theo wrong_rate giảm dần, đồng hạng seen giảm dần');
 }
 // Admin xem được toàn trường không cần class_id.
 const allStats=expect(await req('GET',`/vocab/stats?set_id=${setA}&limit=5`,undefined,admin));
 assert.ok(allStats.rows.length>0&&allStats.rows.length<=5);
});