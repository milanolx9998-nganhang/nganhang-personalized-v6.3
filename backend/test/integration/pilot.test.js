import 'dotenv/config';
import {cleanupIntegration} from './helpers/cleanup.js';
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';import pg from 'pg';import bcrypt from 'bcryptjs';import XLSX from 'xlsx';import AdmZip from 'adm-zip';
const source=process.env.DB_NAME;if(!source?.startsWith('nganhang_personalized'))throw new Error('Integration tests require an isolated personalized database');
const name='nganhang_pilot_test_'+Date.now();const adminPool=new pg.Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,database:source,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
const artifacts=path.resolve('../artifacts');fs.mkdirSync(artifacts,{recursive:true});const dump=path.join(artifacts,'integration-source.dump');const env={...process.env,PGHOST:process.env.DB_HOST,PGPORT:process.env.DB_PORT,PGUSER:process.env.DB_USER,PGPASSWORD:process.env.DB_PASSWORD};
let db,server;const port=3101,origin='http://127.0.0.1:'+port;let adminToken,studentToken,otherToken,teacherToken,studentId,subjectId,topicId,questionIds=[],versionIds=[],attemptId,classId,assignmentId,importId,masterOutcome,masterYccd;
const pw=crypto.randomBytes(12).toString('base64url');
async function req(method,url,body,token=adminToken){const res=await fetch(origin+'/api'+url,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});const data=await res.json();return {status:res.status,data};}
async function login(username){const r=await req('POST','/auth/login',{username,password:pw},null);assert.equal(r.status,200,JSON.stringify(r.data));return r.data.token;}
test.before(async()=>{
 const d=spawnSync('pg_dump',['-Fc','-d',source,'-f',dump],{env,encoding:'utf8'});assert.equal(d.status,0,d.stderr);
 await adminPool.query('CREATE DATABASE '+name);const restored=spawnSync('pg_restore',['--no-owner','--no-privileges','-d',name,dump],{env,encoding:'utf8'});assert.equal(restored.status,0,restored.stderr);
 db=new pg.Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,database:name,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
 const hash=await bcrypt.hash(pw,10);
 for(const [username,role] of [['pilot_test_admin','admin'],['pilot_test_teacher','teacher'],['pilot_test_student','student'],['pilot_test_other','student'],['pilot_test_viewer','viewer']]){const u=(await db.query('INSERT INTO users(username,password_hash,full_name,role) VALUES($1,$2,$3,$4) RETURNING id',[username,hash,username,role])).rows[0];if(role==='student'){await db.query('INSERT INTO student_profiles(user_id,student_code) VALUES($1,$2)',[u.id,username]);if(username==='pilot_test_student')studentId=u.id;}}
 const subject=(await db.query('SELECT * FROM subjects ORDER BY id LIMIT 1')).rows[0];subjectId=subject.id;topicId=(await db.query('SELECT id FROM topics WHERE subject_id=$1 AND grade=9 LIMIT 1',[subjectId])).rows[0]?.id;
 if(!topicId)topicId=(await db.query("INSERT INTO topics(subject_id,grade,name) VALUES($1,9,'Kiểm thử V1') RETURNING id",[subjectId])).rows[0].id;
 await db.query("UPDATE users SET subject_id=$1 WHERE username='pilot_test_teacher'",[subjectId]);
 masterOutcome=(await db.query("INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document) VALUES($1,9,'','TEST.O','Fixture kỹ thuật, không phải chương trình','TEST','Chỉ trong database kiểm thử') RETURNING id",[subjectId])).rows[0].id;
 masterYccd=(await db.query("INSERT INTO curriculum_yccds(outcome_id,code,text) VALUES($1,'TEST.Y','YCCĐ giả lập chỉ dùng kiểm thử hồi quy') RETURNING id",[masterOutcome])).rows[0].id;
 await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')",[topicId,masterYccd]);
 const isolatedUploads=path.join(artifacts,'integration-uploads-'+name);fs.cpSync(path.resolve(process.env.UPLOAD_DIR||'uploads'),isolatedUploads,{recursive:true,errorOnExist:true});
 const output=fs.openSync(path.join(artifacts,'integration-server.log'),'w');server=spawn(process.execPath,['src/server.js'],{env:{...process.env,DB_NAME:name,UPLOAD_DIR:isolatedUploads,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore',output,output],windowsHide:true});
 let ready=false;for(let i=0;i<240;i++){if(server.exitCode!==null)throw new Error('Server exited: '+fs.readFileSync(path.join(artifacts,'integration-server.log'),'utf8'));try{const r=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert(ready,'Server not healthy: '+fs.readFileSync(path.join(artifacts,'integration-server.log'),'utf8'));
 adminToken=await login('pilot_test_admin');studentToken=await login('pilot_test_student');otherToken=await login('pilot_test_other');teacherToken=await login('pilot_test_teacher');
 fs.writeFileSync(path.join(artifacts,'integration-database.json'),JSON.stringify({database:name,source},null,2));
});

let scopeFixture;
test('Chọn theo bài và YCCĐ: lọc thật, không lộ kho riêng, không tự mở rộng khi sai mã',async()=>{
 const version=await req('POST','/practice/taxonomy/versions',{subject_id:subjectId,name:'Chọn nội dung kiểm thử'});
 const bank=(await req('GET','/practice/banks')).data.find(b=>b.kind==='school');
 const groups=[];
 for(const letter of ['A','B']){
  const topic=(await db.query("INSERT INTO topics(subject_id,grade,name) VALUES($1,9,$2) RETURNING id",[subjectId,'Bài tick '+letter])).rows[0];
  // Legacy nodes are read-only now: simulate pre-existing rows, not new master through deprecated API.
  const node={data:(await db.query("INSERT INTO taxonomy_nodes(version_id,node_type,name) VALUES($1,'yccd',$2) RETURNING id",[version.data.id,'YCCĐ tick '+letter])).rows[0]};
  await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')",[topic.id,masterYccd]);
  for(let i=0;i<10;i++){const q=await req('POST','/practice/questions',{subject_id:subjectId,topic_id:topic.id,grade:9,outcome_id:masterOutcome,yccd_id:masterYccd,type:'multiple_choice',cognitive_level:1,stem:'Câu kỹ thuật tick '+letter+' '+i,options:['A','B','C','D'].map(id=>({id,text:id})),answer:{correct:'B'},taxonomy_node_id:node.data.id,bank_id:bank.id});assert.equal(q.status,201,JSON.stringify(q.data));for(const status of ['pending_review','approved','active'])assert.equal((await req('POST','/practice/questions/'+q.data.id+'/workflow',{status})).status,200);}
  groups.push({topic:topic.id,key:JSON.stringify(['node',node.data.id])});
 }
 const privateNode={data:(await db.query("INSERT INTO taxonomy_nodes(version_id,node_type,name) VALUES($1,'yccd','YCCĐ kho riêng không được lộ') RETURNING id",[version.data.id])).rows[0]};
 const privateQuestion=await req('POST','/practice/questions',{subject_id:subjectId,topic_id:groups[0].topic,grade:9,outcome_id:masterOutcome,yccd_id:masterYccd,type:'short_answer',cognitive_level:1,stem:'Câu riêng có YCCĐ',answer:{numeric:0},taxonomy_node_id:privateNode.data.id});assert.equal(privateQuestion.status,201);
 for(const status of ['pending_review','approved','active'])assert.equal((await req('POST','/practice/questions/'+privateQuestion.data.id+'/workflow',{status})).status,200);
 const options=await req('GET','/practice/content-options?subject_id='+subjectId+'&grade=9',undefined,studentToken);assert.equal(options.status,200);assert(!JSON.stringify(options.data).includes('answer'));assert(!options.data.yccd.some(i=>i.name.includes('kho riêng')));
 for(const g of groups)assert.equal(options.data.yccd.find(i=>i.key===g.key).question_count,10);
 const config={subject_id:subjectId,grade:9,topic_ids:[],selection_mode:'yccd',yccd_keys:[groups[0].key],count:10,percent:[100,0,0,0],types:['multiple_choice'],mode:'challenge'};
 const preview=await req('POST','/practice/availability',config,studentToken);assert.equal(preview.status,200);assert.equal(preview.data.availability[0].available,10);
 const both=await req('POST','/practice/availability',{...config,yccd_keys:groups.map(g=>g.key)},studentToken);assert.equal(both.data.availability[0].available,20);
 const a=await req('POST','/practice/attempts',config,studentToken);assert.equal(a.status,201,JSON.stringify(a.data));const rows=(await db.query('SELECT v.taxonomy_node_id FROM attempt_items i JOIN question_versions v ON v.id=i.question_version_id WHERE attempt_id=$1',[a.data.id])).rows;assert(rows.every(r=>JSON.stringify(['node',r.taxonomy_node_id])===groups[0].key));
 assert.equal((await req('POST','/practice/availability',{...config,yccd_keys:[]},studentToken)).status,400);
 const invalid=await req('POST','/practice/availability',{...config,yccd_keys:['unknown']},studentToken);assert.equal(invalid.status,422);assert.equal((await req('POST','/practice/attempts',{...config,yccd_keys:['unknown']},studentToken)).status,422);
 const byTopic=await req('POST','/practice/attempts',{...config,selection_mode:'topic',topic_ids:[groups[1].topic],yccd_keys:[]},studentToken);assert.equal(byTopic.status,201);const view=await req('GET','/practice/attempts/'+byTopic.data.id,undefined,studentToken);assert(view.data.items.every(i=>i.question.topic_id===groups[1].topic));
 assert.equal((await req('GET','/practice/content-options?subject_id='+subjectId+'&grade=8',undefined,studentToken)).data.yccd.some(i=>groups.some(g=>g.key===i.key)),false);
 scopeFixture={groups,config};
});
test('Trình duyệt tick nhiều bài, tìm/bỏ chọn, chuyển YCCĐ và tạo bài đúng lựa chọn trên mobile',{timeout:60000},async()=>{
 const {chromium}=await import('playwright');const b=await chromium.launch({headless:true});
 try{const p=await b.newPage({viewport:{width:1440,height:1000}});await p.goto(origin+'/login');await p.getByPlaceholder('admin').fill('pilot_test_student');await p.locator('input[type=password]').fill(pw);await p.getByRole('button',{name:'Đăng nhập',exact:true}).click();await p.getByRole('heading',{name:'Việc học của em'}).waitFor();
 await p.goto(origin+'/practice/new');await p.getByLabel('Môn học',{exact:true}).selectOption(String(subjectId));await p.getByLabel('Tìm bài / chuyên đề',{exact:true}).fill('Bài tick');
 const lessons=p.locator('.scope-v2-lesson');await lessons.filter({hasText:'Bài tick A'}).getByRole('checkbox').first().check();await lessons.filter({hasText:'Bài tick B'}).getByRole('checkbox').first().check();assert.equal(await lessons.locator(':scope > label > input:checked').count(),2);
 await lessons.filter({hasText:'Bài tick A'}).getByRole('checkbox').first().uncheck();assert.equal(await lessons.locator(':scope > label > input:checked').count(),1);
 await p.screenshot({path:path.join(artifacts,'content-picker-desktop.png'),fullPage:true});
 await p.getByLabel('Khối',{exact:true}).selectOption('8');assert.equal(await p.locator('.scope-v2-lesson > label > input:checked').count(),0);await p.getByLabel('Khối',{exact:true}).selectOption('9');
 await p.getByLabel('Tìm bài / chuyên đề',{exact:true}).fill('Bài tick A');await lessons.filter({hasText:'Bài tick A'}).getByRole('checkbox').first().check();await p.getByLabel('Số câu',{exact:true}).selectOption('10');await p.getByText('Tùy chỉnh nâng cao · mức độ và dạng câu',{exact:true}).click();await p.getByLabel('Phân bố mức độ',{exact:true}).selectOption('M1');
 await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await p.screenshot({path:path.join(artifacts,'content-picker-yccd-mobile.png'),fullPage:true});
 const response=p.waitForResponse(r=>r.url().endsWith('/api/practice/availability'));await p.getByRole('button',{name:'Kiểm tra số câu trong kho',exact:true}).click();assert.equal((await response).status(),200);
 const created=p.waitForResponse(r=>r.url().endsWith('/api/practice/attempts')&&r.request().method()==='POST');await p.getByRole('button',{name:'Tạo bài luyện',exact:true}).click();const result=await (await created).json();assert.equal(result.config.content_scope_v2.clauses[0].topic_id,scopeFixture.groups[0].topic);await p.getByRole('heading',{name:'Bài luyện của em'}).waitFor();

 }finally{await b.close();}
});
test.after(()=>cleanupIntegration({server,db,adminPool,name,dump,uploadsDir:path.join(artifacts,'integration-uploads-'+name)}));
test('Các API V4 và health vẫn đọc được',async()=>{for(const url of ['/health','/users','/taxonomy/subjects','/questions','/matrix','/exams','/reports/dashboard','/analysis/summary','/tags']){const r=await req('GET',url);assert.equal(r.status,200,url+': '+JSON.stringify(r.data));}});
test('Tạo 20 câu đa mức, duyệt và version',async()=>{const bank=(await req('GET','/practice/banks')).data.find(b=>b.kind==='school');for(let i=0;i<20;i++){const result=await req('POST','/practice/questions',{subject_id:subjectId,topic_id:topicId,grade:9,outcome_id:masterOutcome,yccd_id:masterYccd,type:'multiple_choice',cognitive_level:i%4+1,stem:'Câu kiểm thử độc lập '+i,options:['A','B','C','D'].map(id=>({id,text:'Phương án '+id})),answer:{correct:'B'},bank_id:bank.id});assert.equal(result.status,201,JSON.stringify(result.data));questionIds.push(result.data.id);versionIds.push(result.data.current_version_id);for(const status of ['pending_review','approved','active'])assert.equal((await req('POST',`/practice/questions/${result.data.id}/workflow`,{status})).status,200);}});
test('Preview 20 câu đúng 25/25/25/25; tạo challenge không lộ đáp án',async()=>{const config={subject_id:subjectId,topic_ids:[topicId],grade:9,count:20,percent:[25,25,25,25],types:['multiple_choice'],mode:'challenge'};const a=await req('POST','/practice/attempts',config,studentToken);assert.equal(a.status,201,JSON.stringify(a.data));attemptId=a.data.id;const view=await req('GET','/practice/attempts/'+attemptId,undefined,studentToken);assert.equal(view.data.items.length,20);assert(view.data.items.every(i=>!i.question.answer&&!i.question.explanation));});
test('HS khác không mở, lưu hay nộp lượt của bạn; HS không đọc bank',async()=>{assert.equal((await req('GET','/practice/attempts/'+attemptId,undefined,otherToken)).status,403);assert.equal((await req('POST',`/practice/attempts/${attemptId}/submit`,{},otherToken)).status,403);assert.equal((await req('GET','/questions',undefined,studentToken)).status,403);assert.equal((await req('GET','/practice/questions',undefined,studentToken)).status,403);});
test('Autosave, login lại, resume và submit idempotent',async()=>{let view=(await req('GET','/practice/attempts/'+attemptId,undefined,studentToken)).data;for(const item of view.items){const r=await req('PUT',`/practice/attempts/${attemptId}/items/${item.id}`,{response:'B'},studentToken);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.result,null);}studentToken=await login('pilot_test_student');view=(await req('GET','/practice/attempts/'+attemptId,undefined,studentToken)).data;assert(view.items.every(i=>i.response==='B'));assert.equal(Number((await db.query('SELECT count(*) FROM mastery_events WHERE attempt_id=$1',[attemptId])).rows[0].count),0);const result=await req('POST',`/practice/attempts/${attemptId}/submit`,{},studentToken);assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(Number(result.data.percentage),100);const first=(await db.query('SELECT count(*) FROM mastery_events WHERE attempt_id=$1',[attemptId])).rows[0].count;await req('POST',`/practice/attempts/${attemptId}/submit`,{},studentToken);assert.equal((await db.query('SELECT count(*) FROM mastery_events WHERE attempt_id=$1',[attemptId])).rows[0].count,first);});
test('Sửa câu tạo version mới, Attempt giữ nội dung/đáp án cũ',async()=>{const id=questionIds[0];const version=(await db.query('SELECT content FROM question_versions WHERE id=$1',[versionIds[0]])).rows[0].content;const changed=await req('PUT','/practice/questions/'+id,{...version,stem:'Nội dung đã sửa',answer:{correct:'A'}});assert.equal(changed.status,200,JSON.stringify(changed.data));assert.notEqual(changed.data.current_version_id,versionIds[0]);const view=(await req('GET','/practice/attempts/'+attemptId,undefined,studentToken)).data;assert(view.items.every(i=>i.question.stem!=='Nội dung đã sửa'));});
test('Practice khóa đáp án lần đầu và retry là lượt mới',async()=>{const a=await req('POST','/practice/attempts',{subject_id:subjectId,topic_ids:[topicId],grade:9,count:10,percent:[0,50,50,0],types:['multiple_choice'],mode:'practice'},studentToken);assert.equal(a.status,201,JSON.stringify(a.data));const view=(await req('GET','/practice/attempts/'+a.data.id,undefined,studentToken)).data;const item=view.items[0];const r=await req('PUT',`/practice/attempts/${a.data.id}/items/${item.id}`,{response:'A',final:true},studentToken);assert.equal(r.status,200);assert.equal(r.data.result.score,0);assert.equal((await req('PUT',`/practice/attempts/${a.data.id}/items/${item.id}`,{response:'B',final:true},studentToken)).status,409);await req('POST',`/practice/attempts/${a.data.id}/submit`,{},studentToken);const retry=await req('POST',`/practice/attempts/${a.data.id}/retry`,{},studentToken);assert.equal(retry.status,201);assert.equal(retry.data.source,'retry');assert.notEqual(retry.data.id,a.data.id);});
test('Nhập roster Excel, mật khẩu tạm và lịch sử lớp',async()=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{student_code:'new_pilot_student',full_name:'Học sinh kiểm thử',class_name:'9-PILOT',grade:9,school_year:'2026-2027'}]),'Students');const form=new FormData();form.append('file',new Blob([XLSX.write(wb,{type:'buffer',bookType:'xlsx'})]),'students.xlsx');const r=await req('POST','/practice/roster',form);assert.equal(r.status,200,JSON.stringify(r.data));assert(r.data.students[0].temporary_password.length>=12);classId=(await db.query("SELECT id FROM classes WHERE name='9-PILOT'")).rows[0].id;await db.query('INSERT INTO class_memberships(class_id,student_id) VALUES($1,$2)',[classId,studentId]);});
test('Phân quyền lớp và assignment fixed/dynamic, hạn và giới hạn lượt',async()=>{const teacherId=(await db.query("SELECT id FROM users WHERE username='pilot_test_teacher'")).rows[0].id;assert.equal((await req('GET',`/practice/classes/${classId}/dashboard`,undefined,teacherToken)).status,403);await req('POST','/practice/class-permissions',{teacher_id:teacherId,class_id:classId,subject_id:subjectId});assert.equal((await req('GET',`/practice/classes/${classId}/dashboard`,undefined,teacherToken)).status,200);const config={subject_id:subjectId,topic_ids:[topicId],grade:9,count:10,percent:[0,50,50,0],types:['multiple_choice'],mode:'challenge'};for(const kind of ['fixed','dynamic']){const created=await req('POST','/practice/assignments',{title:'Bài kiểm thử '+kind,kind,config,class_ids:[classId],max_attempts:1});assert.equal(created.status,201,JSON.stringify(created.data));assignmentId=created.data.id;const a=await req('POST',`/practice/assignments/${assignmentId}/start`,{},studentToken);assert.equal(a.status,201,JSON.stringify(a.data));assert.equal(a.data.source,'teacher_assigned');assert.equal((await req('POST',`/practice/assignments/${assignmentId}/start`,{},studentToken)).status,400);assert.equal((await req('GET','/practice/shared/'+created.data.share_token,undefined,otherToken)).status,403);}});
test('Word ảnh -> preview -> sửa mức -> confirm transaction',async()=>{const zip=new AdmZip();const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=','base64');zip.addFile('word/media/image1.png',png);zip.addFile('word/_rels/document.xml.rels',Buffer.from('<Relationships><Relationship Id="r1" Target="media/image1.png"/></Relationships>'));const lines=['Câu 1. Câu nhập Word','A. Một','B. Hai','C. Ba','D. Bốn','Đáp án: B'];zip.addFile('word/document.xml',Buffer.from('<w:document xmlns:w="w"><w:body>'+lines.map((line,i)=>'<w:p><w:r><w:t>'+line+'</w:t>'+(i===0?'<w:drawing><a:blip r:embed="r1"/></w:drawing>':'')+'</w:r></w:p>').join('')+'</w:body></w:document>'));const form=new FormData();form.append('file',new Blob([zip.toBuffer()]),'sample.docx');form.append('metadata',JSON.stringify({subject_id:subjectId,topic_id:topicId,grade:9}));const r=await req('POST','/practice/imports',form);assert.equal(r.status,201,JSON.stringify(r.data));importId=r.data.id;let job=(await req('GET','/practice/imports/'+importId)).data;assert.equal(job.items[0].validation.status,'NEEDS_REVIEW');assert(job.items[0].validation.warnings.some(w=>w.includes('mức độ')));await req('PUT','/practice/imports/'+importId,{bulk:{cognitive_level:1}});job=(await req('GET','/practice/imports/'+importId)).data;assert(job.items[0].draft.stem.includes('/uploads/media/'));const confirmed=await req('POST',`/practice/imports/${importId}/confirm`,{ids:[job.items[0].id]});assert.equal(confirmed.status,200,JSON.stringify(confirmed.data));});
test('Viewer read-only; giáo viên không đọc học sinh ngoài scope',async()=>{const viewer=await login('pilot_test_viewer');assert.equal((await req('POST','/practice/questions',{},viewer)).status,403);assert.equal((await req('PUT','/practice/settings',{},viewer)).status,403);const other=(await db.query("SELECT id FROM users WHERE username='pilot_test_other'")).rows[0].id;assert.equal((await req('GET','/practice/students/'+other,undefined,teacherToken)).status,403);});
test('Kho riêng không lộ qua API cũ; phiên bản DB không sửa trực tiếp',async()=>{
 const created=await req('POST','/practice/questions',{subject_id:subjectId,topic_id:topicId,grade:9,outcome_id:masterOutcome,yccd_id:masterYccd,type:'short_answer',cognitive_level:1,stem:'Câu riêng tư của quản trị',answer:{numeric:0}});
 assert.equal(created.status,201,JSON.stringify(created.data));
 assert.equal((await req('GET','/questions/'+created.data.id,undefined,teacherToken)).status,403);
 const list=await req('GET','/practice/questions');assert.equal(list.status,200,JSON.stringify(list.data));
 assert.equal((await req('PUT','/questions/'+created.data.id,{stem_text:'Không được sửa'},teacherToken)).status,403);
 await assert.rejects(db.query("UPDATE question_versions SET content=content||jsonb_build_object('stem','Không được sửa bản đã dùng') WHERE id=$1",[versionIds[0]]),/immutable/);
 const erased=await req('DELETE','/questions/'+created.data.id);assert.equal(erased.status,200);assert.equal(erased.data.archived,1);assert.equal(erased.data.deleted,0);
});
test('Đăng xuất thu hồi token và thiếu quyền không được đặt lại mật khẩu',async()=>{
 const token=await login('pilot_test_other');assert.equal((await req('POST','/auth/logout',{},token)).status,200);
 assert.equal((await req('GET','/practice/dashboard',undefined,token)).status,401);
 assert.equal((await req('POST','/practice/students/'+studentId+'/reset-password',{},token)).status,401);
});
test('Xuất phiếu bài giao: học sinh bị chặn, Word/PDF thật',async()=>{
 const forbidden=await req('GET','/practice/assignments/'+assignmentId+'/export?format=docx',undefined,studentToken);assert.equal(forbidden.status,403);
 for(const format of ['docx','pdf']){
  const res=await fetch(origin+'/api/practice/assignments/'+assignmentId+'/export?format='+format,{headers:{Authorization:'Bearer '+adminToken}});
  assert.equal(res.status,200);const b=Buffer.from(await res.arrayBuffer());assert.equal(b.subarray(0,2).toString(),format==='pdf'?'%P':'PK');fs.writeFileSync(path.join(artifacts,'assignment.'+format),b);
 }
});
test('Trình duyệt thật: đăng nhập, quay lại câu đã lưu, nộp bài, mobile không tràn',{timeout:60000},async()=>{
 const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/login');await page.getByPlaceholder('admin').fill('pilot_test_student');await page.locator('input[type=password]').fill(pw);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('heading',{name:'Việc học của em'}).waitFor();
  const a=await req('POST','/practice/attempts',{subject_id:subjectId,topic_ids:[topicId],grade:9,count:10,percent:[0,50,50,0],types:['multiple_choice'],mode:'challenge'},studentToken);assert.equal(a.status,201);
  await page.goto(origin+'/practice/attempts/'+a.data.id);await page.getByRole('heading',{name:'Bài luyện của em'}).waitFor();
  await page.locator('input[type=radio]').nth(1).check();await page.getByRole('button',{name:'Câu tiếp',exact:true}).click();await page.getByRole('button',{name:'Câu trước',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('input[type=radio]')[1]?.checked,{},{timeout:5000});
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('input[type=radio]')[1]?.checked,{},{timeout:5000});
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);await page.getByRole('button',{name:'Mở menu',exact:true}).click();await page.getByRole('button',{name:'Đóng menu',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);await page.screenshot({path:path.join(artifacts,'student-mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  await page.getByRole('button',{name:'Nộp và xem kết quả',exact:true}).click();await page.getByRole('button',{name:'Vẫn nộp bài',exact:true}).click();await page.getByRole('heading',{name:'Kết quả lượt luyện'}).waitFor();
  await page.screenshot({path:path.join(artifacts,'student-result.png'),fullPage:true});assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('Bài giao: ngày mở, hạn đóng, đích cá nhân và cùng phiên bản fixed',async()=>{
 const config={subject_id:subjectId,topic_ids:[topicId],grade:9,count:10,percent:[0,50,50,0],types:['multiple_choice'],mode:'challenge'};
 for(const times of [{opens_at:new Date(Date.now()+86400000).toISOString()},{closes_at:new Date(Date.now()-86400000).toISOString()}]){
  const a=await req('POST','/practice/assignments',{title:'Kiểm thử thời gian',kind:'fixed',config,student_ids:[studentId],...times});assert.equal(a.status,201,JSON.stringify(a.data));
  assert.equal((await req('POST','/practice/assignments/'+a.data.id+'/start',{},studentToken)).status,400);
 }
 const a=await req('POST','/practice/assignments',{title:'Bộ cố định cá nhân',kind:'fixed',config,student_ids:[studentId]});assert.equal(a.status,201);
 const x=await req('POST','/practice/assignments/'+a.data.id+'/start',{},studentToken),y=await req('POST','/practice/assignments/'+a.data.id+'/start',{},studentToken);
 for(const attempt of [x,y]){assert.equal(attempt.status,201);const ids=(await db.query('SELECT question_version_id FROM attempt_items WHERE attempt_id=$1',[attempt.data.id])).rows.map(r=>r.question_version_id).sort();assert.deepEqual(ids,[...a.data.fixed_versions].sort());}
 const lists=await req('GET','/practice/assignments',undefined,studentToken);assert.equal(lists.status,200,JSON.stringify(lists.data));assert(lists.data.some(x=>x.id===a.data.id));
 assert.equal((await req('PUT','/practice/assignments/'+a.data.id,{title:'Không sửa sau khi HS làm',kind:'fixed',config,student_ids:[studentId]})).status,400);
});
test('Phiên bản chương trình được khóa vào câu; chặn môn khác',async()=>{
 const v=await req('POST','/practice/taxonomy/versions',{subject_id:subjectId,name:'Chương trình kiểm thử '+Date.now()});assert.equal(v.status,201);
 const deprecated=await req('POST','/practice/taxonomy/nodes',{version_id:v.data.id,node_type:'yccd',name:'YCCĐ mẫu kỹ thuật'});assert.equal(deprecated.status,400);
 const node={data:(await db.query("INSERT INTO taxonomy_nodes(version_id,node_type,name) VALUES($1,'yccd','YCCĐ legacy fixture') RETURNING id",[v.data.id])).rows[0]};
 const raw={subject_id:subjectId,topic_id:topicId,grade:9,cognitive_level:1,type:'short_answer',stem:'Mẫu phiên bản chương trình',answer:{numeric:0},taxonomy_node_id:node.data.id};
 const q=await req('POST','/practice/questions',raw);assert.equal(q.status,201,JSON.stringify(q.data));assert.equal((await db.query('SELECT taxonomy_node_id FROM question_versions WHERE id=$1',[q.data.current_version_id])).rows[0].taxonomy_node_id,node.data.id);
 const foreign=(await db.query('SELECT id FROM taxonomy_nodes WHERE version_id IN(SELECT id FROM taxonomy_versions WHERE subject_id<>$1) LIMIT 1',[subjectId])).rows[0];
 if(foreign)assert.equal((await req('POST','/practice/questions',{...raw,taxonomy_node_id:foreign.id})).status,400);
 const source=(await db.query('SELECT checksum FROM question_sources WHERE checksum IS NOT NULL LIMIT 1')).rows[0];assert.match(source.checksum,/^[a-f0-9]{64}$/);
});
test('Hồi quy V4: tạo ma trận, sinh đề, xuất Word và QTI',async()=>{
 const matrix=await req('POST','/matrix',{name:'Ma trận kiểm thử kỹ thuật',subject_id:subjectId,grade:9,matrix_type:'TRUONG',total_score:1,ratio_m1:0,ratio_m2:100,ratio_m3:0,ratio_m4:0,topic_scope:[topicId],cells:[{outcome_id:masterOutcome,yccd_id:masterYccd,q_type:'mcq4',cognitive_level:'M2',topic_id:topicId,question_count:2,score_per_question:0.5}]});assert.equal(matrix.status,201,JSON.stringify(matrix.data));
 const exam=await req('POST','/exams/generate',{matrix_id:matrix.data.id,exam_name:'Đề hồi quy',exam_code_count:1,anti_repeat_days:0});assert.equal(exam.status,201,JSON.stringify(exam.data));
 for(const suffix of ['/download?code=101','/download-qti?code=101']){
  const result=await fetch(origin+'/api/exams/'+exam.data.exam_run_id+suffix,{headers:{Authorization:'Bearer '+adminToken}});
  assert.equal(result.status,200,await result.clone().text());const data=Buffer.from(await result.arrayBuffer());assert.equal(data.subarray(0,2).toString(),'PK');
 }
});
test('Trình duyệt GV: nhập mẫu, xem kho, giao bài và theo dõi lớp',{timeout:60000},async()=>{
 const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/login');await page.getByPlaceholder('admin').fill('pilot_test_teacher');await page.locator('input[type=password]').fill(pw);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL(origin+'/');
  // V6.6.5: nhập câu là ba bước, Môn + Khối là ngữ cảnh chọn một lần ở bước 1.
  await page.goto(origin+'/practice/import');await page.getByRole('heading',{name:'Ngân hàng câu hỏi',exact:true}).waitFor();
  await page.getByLabel('Môn',{exact:true}).selectOption(String(subjectId));await page.getByLabel('Khối',{exact:true}).selectOption('9');
  await page.locator('input[type=file]').setInputFiles(path.resolve('../templates/question-import-khtn.docx'));
  await page.getByRole('button',{name:'Đọc tệp và kiểm tra',exact:true}).click();
  await page.getByRole('heading',{name:/Tìm thấy 5 câu/}).waitFor();
  // Lưới để quét nhanh: không mount trình soạn thảo cho từng dòng.
  assert.equal(await page.locator('.queue-table tbody textarea').count(),0);
  assert.equal(await page.locator('.queue-table tbody tr').count()>0,true);
  await page.goto(origin+'/practice/banks');await page.getByRole('heading',{name:'Ngân hàng câu hỏi',exact:true}).waitFor();
  // Không chọn câu nào thì không có thanh thao tác hàng loạt.
  assert.equal(await page.locator('.bulk-bar').count(),0);
  assert.equal(await page.locator('.filter-row select').count()<=4,true,'Bộ lọc mặc định phải gọn');
  await page.goto(origin+'/practice/assignments');await page.getByRole('button',{name:'Tạo bài giao',exact:true}).click();await page.getByText('Hoặc chọn từng học sinh',{exact:true}).waitFor();
  await page.goto(origin+'/practice');await page.getByLabel('Năm học · Lớp').selectOption(String(classId));await page.getByText('pilot_test_student · pilot_test_student',{exact:true}).waitFor();await page.screenshot({path:path.join(artifacts,'teacher-dashboard.png'),fullPage:true});assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('Mật khẩu tạm: bắt buộc đổi, thu hồi token cũ và đăng nhập lại',async()=>{
 const hash=await bcrypt.hash(pw,10);const u=(await db.query("INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES('force_change_test',$1,'Kiểm thử đổi mật khẩu','student',true) RETURNING id",[hash])).rows[0];await db.query("INSERT INTO student_profiles(user_id,student_code) VALUES($1,'force_change_test')",[u.id]);
 const token=await login('force_change_test');assert.equal((await req('GET','/practice/dashboard',undefined,token)).status,403);
 const changed=await req('POST','/auth/change-password',{old_password:pw,new_password:pw+'-changed'},token);assert.equal(changed.status,200);
 assert.equal((await req('GET','/practice/dashboard',undefined,token)).status,401);
 const next=await req('POST','/auth/login',{username:'force_change_test',password:pw+'-changed'},null);assert.equal(next.status,200);assert.equal(next.data.user.must_change_password,false);
 assert.equal((await req('GET','/practice/dashboard',undefined,next.data.token)).status,200);
});
test('Quản trị: metrics, cấu hình hợp lệ và trang Users không lỗi runtime',{timeout:60000},async()=>{
 for(const url of ['/practice/metrics','/practice/settings','/practice/catalog'])assert.equal((await req('GET',url)).status,200,url);
 assert.equal((await req('PUT','/practice/settings',{practice_min_questions:50})).status,400);
 assert.equal((await req('PUT','/practice/settings',{leaderboard:true})).status,400);
 const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/login');await page.getByPlaceholder('admin').fill('pilot_test_admin');await page.locator('input[type=password]').fill(pw);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL(origin+'/');await page.goto(origin+'/practice/admin');await page.waitForURL(origin+'/admin/school');await page.getByRole('heading',{name:'Năm học & lớp học',exact:true}).waitFor();await page.goto(origin+'/admin/operations');await page.getByRole('heading',{name:'Sử dụng & tiến bộ',exact:true}).waitFor();await page.goto(origin+'/users');await page.waitForURL(origin+'/admin/staff');await page.locator('.staff-person').first().waitFor();assert.deepEqual(errors,[]);}finally{await browser.close();}
});

let managedId,managedToken;
test('Quản trị HS: tạo, tìm, trùng mã và chặn quyền sai',async()=>{
 const created=await req('POST','/practice/students',{student_code:'managed_test',full_name:'Học sinh quản lý',class_id:classId,password:pw});
 assert.equal(created.status,201,JSON.stringify(created.data));managedId=created.data.id;
 const list=await req('GET','/practice/students?search=managed_test');assert.equal(list.status,200,JSON.stringify(list.data));assert.equal(list.data.total,1);assert.equal(list.data.students[0].classes[0].id,classId);
 assert.equal((await req('POST','/practice/students',{student_code:'managed_test',full_name:'Trùng mã',class_id:classId})).status,409);
 assert.equal((await req('GET','/practice/students',undefined,studentToken)).status,403);
 assert.equal((await req('POST','/practice/students',{student_code:'bad_scope',full_name:'Không quyền',class_id:classId},studentToken)).status,403);
 managedToken=await login('managed_test');
});
test('GVCN kiêm giáo viên: sửa mã/tên giữ ID, thu hồi phiên cũ',async()=>{
 const teacherId=(await db.query("SELECT id FROM users WHERE username='pilot_test_teacher'")).rows[0].id;
 assert.equal((await req('POST','/practice/students/'+managedId+'/reset-password',{},teacherToken)).status,403);
 assert.equal((await req('POST','/practice/positions',{user_id:teacherId,position:'homeroom',class_id:classId})).status,201);
 const changed=await req('PUT','/practice/students/'+managedId+'/profile',{student_code:'managed_test_2',full_name:'Học sinh đã sửa',email:'student@example.test'},teacherToken);assert.equal(changed.status,200,JSON.stringify(changed.data));
 const profile=await req('GET','/practice/students/'+managedId+'/profile');assert.equal(profile.data.id,managedId);assert.equal(profile.data.student_code,'managed_test_2');assert.equal(profile.data.full_name,'Học sinh đã sửa');
 assert.equal((await req('GET','/auth/me',undefined,managedToken)).status,401);managedToken=await login('managed_test_2');
});
test('Quản trị HS: chuyển đi/quay lại giữ lịch sử và thu hồi scope lớp cũ',async()=>{
 const cls=await req('POST','/practice/classes',{name:'9-TRANSFER',grade:9,year:'2026-2027'});assert.equal(cls.status,200);
 assert.equal((await req('POST','/practice/students/'+managedId+'/transfer',{class_id:cls.data.id},teacherToken)).status,403);
 assert.equal((await req('POST','/practice/students/'+managedId+'/transfer',{class_id:cls.data.id})).status,200);
 assert.equal((await req('GET','/practice/students/'+managedId+'/profile',undefined,teacherToken)).status,403);for(const suffix of ['/portfolio','/attempts','/mastery','/assignments','/classes'])assert.equal((await req('GET','/practice/students/'+managedId+suffix,undefined,teacherToken)).status,403);
 assert.equal((await req('POST','/practice/students/'+managedId+'/reset-password',{},teacherToken)).status,403);
 assert.equal((await req('POST','/practice/students/'+managedId+'/transfer',{class_id:classId})).status,200);
 const profile=await req('GET','/practice/students/'+managedId+'/profile');assert.equal(profile.data.memberships.length,3);assert.equal(profile.data.memberships.filter(m=>m.current).length,1);
 assert.equal((await req('GET','/practice/students/'+managedId+'/profile',undefined,teacherToken)).status,200);
});
test('Quản trị HS: khóa/mở và đổi mật khẩu không làm mất hồ sơ',async()=>{
 assert.equal((await req('PUT','/practice/students/'+managedId+'/status',{is_active:false})).status,200);assert.equal((await req('GET','/auth/me',undefined,managedToken)).status,401);
 assert.equal((await req('POST','/auth/login',{username:'managed_test_2',password:pw},null)).status,401);
 assert.equal((await req('PUT','/practice/students/'+managedId+'/status',{is_active:true})).status,200);
 const reset=await req('POST','/practice/students/'+managedId+'/reset-password',{new_password:'UpdatedDemo123'},teacherToken);assert.equal(reset.status,200);assert.equal(reset.data.temporary_password,'UpdatedDemo123');
 const login=await req('POST','/auth/login',{username:'managed_test_2',password:'UpdatedDemo123'},null);assert.equal(login.status,200);assert.equal(login.data.user.must_change_password,true);assert.equal((await req('GET','/practice/dashboard',undefined,login.data.token)).status,403);
 assert.equal((await req('GET','/practice/students/'+managedId+'/profile')).data.memberships.length,3);
 const positions=(await req('GET','/practice/positions')).data;for(const p of positions.filter(p=>p.position==='homeroom'&&p.class_id===classId))assert.equal((await req('DELETE','/practice/positions/'+p.id)).status,200);
});
test('Trình duyệt quản lý học sinh: thêm, sửa, mật khẩu, tìm kiếm, mobile',{timeout:60000},async()=>{
 const {chromium}=await import('playwright'),browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/login');await page.getByPlaceholder('admin').fill('pilot_test_admin');await page.locator('input[type=password]').fill(pw);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL(origin+'/');
 await page.goto(origin+'/practice/students');await page.getByRole('heading',{name:'Quản lý học sinh',exact:true}).waitFor();await page.getByRole('button',{name:'+ Thêm học sinh',exact:true}).click();await page.getByLabel('Mã học sinh / tên đăng nhập',{exact:true}).fill('browser_student');await page.getByLabel('Họ và tên',{exact:true}).fill('Học sinh trình duyệt');await page.getByLabel('Lớp học',{exact:true}).selectOption(String(classId));await page.getByRole('button',{name:'Lưu thông tin',exact:true}).click();await page.getByRole('heading',{name:'Tài khoản đã sẵn sàng'}).waitFor();await page.getByRole('button',{name:'Ẩn mật khẩu'}).click();
 await page.getByLabel('Tìm học sinh',{exact:true}).fill('browser_student');const row=page.locator('tbody tr').filter({hasText:'browser_student'});await row.locator('summary').click();await row.getByRole('button',{name:'Sửa',exact:true}).click();await page.getByLabel('Họ và tên',{exact:true}).fill('Học sinh trình duyệt sửa');await page.getByRole('button',{name:'Lưu thông tin',exact:true}).click();await row.getByText('Học sinh trình duyệt sửa',{exact:true}).waitFor();
 await row.getByRole('button',{name:'Mật khẩu',exact:true}).click();await page.getByLabel('Mật khẩu tạm mới (trống = tạo ngẫu nhiên)',{exact:true}).fill('BrowserDemo123');await page.getByRole('button',{name:'Lưu thông tin',exact:true}).click();await page.getByText('BrowserDemo123',{exact:true}).waitFor();await page.getByRole('button',{name:'Ẩn mật khẩu'}).click();
 await page.screenshot({path:path.join(artifacts,'student-management-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:path.join(artifacts,'student-management-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('V4 hồ sơ: phân trang hơn 20 lượt, lọc và quyền hai chiều',async()=>{
 otherToken=await login('pilot_test_other');
 const config={subject_id:subjectId,grade:9,topic_ids:[scopeFixture.groups[0].topic],count:10,percent:[100,0,0,0],types:['multiple_choice'],mode:'challenge'};
 for(let n=0;n<22;n++)assert.equal((await req('POST','/practice/attempts',config,studentToken)).status,201);
 const root='/practice/students/'+studentId;
 const page=await req('GET',root+'/attempts',undefined,studentToken);assert.equal(page.status,200,JSON.stringify(page.data));assert.equal(page.data.items.length,20);assert(page.data.total>20);
 const next=await req('GET',root+'/attempts?offset=20',undefined,studentToken);assert(next.data.items.length);assert(!next.data.items.some(i=>page.data.items.some(j=>j.id===i.id)));
 assert.equal((await req('GET',root+'/attempts?limit=51',undefined,studentToken)).status,400);
 for(const suffix of ['/portfolio','/attempts','/mastery','/assignments','/classes']){
  assert.equal((await req('GET',root+suffix,undefined,otherToken)).status,403);
  const own=await req('GET',root+suffix,undefined,studentToken);assert.equal(own.status,200,JSON.stringify(own.data));
  assert.equal((await req('GET',root+suffix,undefined,teacherToken)).status,200);
 }
 const outsider=(await db.query('SELECT id FROM subjects WHERE id<>$1 LIMIT 1',[subjectId])).rows[0].id;
 const hidden=(await db.query("INSERT INTO attempts(student_id,mode,source,config,seed) VALUES($1,'challenge','self_practice',$2,'portfolio-test') RETURNING id",[studentId,{...config,subject_id:outsider}])).rows[0].id;
 assert(!(await req('GET',root+'/attempts?limit=50',undefined,teacherToken)).data.items.some(a=>a.id===hidden));
 assert.equal((await req('GET',root+'/attempts/'+hidden,undefined,teacherToken)).status,404);
 assert.equal((await req('GET',root+'/attempts/'+hidden,undefined,studentToken)).status,200);
 const view=await req('GET',root+'/attempts/'+page.data.items[0].id,undefined,teacherToken);assert.equal(view.status,200,JSON.stringify(view.data));assert(view.data.items.every(i=>!i.question.answer&&!i.result));
 const historical=await req('GET',root+'/attempts/'+attemptId,undefined,teacherToken);assert.equal(historical.status,200);assert(historical.data.items.every(i=>i.question.stem!=='Nội dung đã sửa'));
 const overview=(await req('GET',root+'/portfolio',undefined,studentToken)).data;
 const total=(await db.query("SELECT count(*)::int n FROM attempts WHERE student_id=$1 AND status='completed'",[studentId])).rows[0].n;assert.equal(overview.summary.completed_attempts,total);
 const before=(await db.query("SELECT md5(COALESCE(jsonb_agg(to_jsonb(m) ORDER BY student_id,topic_id,cognitive_level)::text,'')) hash FROM mastery_states m")).rows[0].hash;
 await req('GET',root+'/mastery',undefined,studentToken);await req('GET',root+'/attempts/'+attemptId,undefined,studentToken);
 assert.equal((await db.query("SELECT md5(COALESCE(jsonb_agg(to_jsonb(m) ORDER BY student_id,topic_id,cognitive_level)::text,'')) hash FROM mastery_states m")).rows[0].hash,before);
});
test('V4 roster: xem trước không ghi, lỗi/xung đột, xác nhận một lần và chống dữ liệu cũ',async()=>{
 const cls=(await db.query('SELECT c.*,y.name AS year FROM classes c JOIN school_years y ON y.id=c.school_year_id WHERE c.id=$1',[classId])).rows[0];
 const row={student_code:'v4_preview_student',full_name:'Học sinh xem trước',class_name:cls.name,grade:cls.grade,school_year:cls.year};
 const form=rows=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Students');const f=new FormData();f.append('file',new Blob([XLSX.write(wb,{type:'buffer',bookType:'xlsx'})]),'roster.xlsx');return f;};
 const before=(await db.query('SELECT count(*)::int n FROM users')).rows[0].n;
 const p=await req('POST','/practice/roster/preview',form([row]));assert.equal(p.status,200,JSON.stringify(p.data));assert.equal(p.data.rows[0].status,'NEW');assert(p.data.can_confirm);
 assert.equal((await db.query('SELECT count(*)::int n FROM users')).rows[0].n,before);
 assert.equal((await req('POST','/practice/roster/confirm',{token:p.data.token},teacherToken)).status,409);
 const saved=await req('POST','/practice/roster/confirm',{token:p.data.token});assert.equal(saved.status,200,JSON.stringify(saved.data));assert(saved.data.students[0].temporary_password);
 assert.equal((await req('POST','/practice/roster/confirm',{token:p.data.token})).status,409);
 const unchanged=await req('POST','/practice/roster/preview',form([row]));assert.equal(unchanged.data.rows[0].status,'UNCHANGED');
 const bad=await req('POST','/practice/roster/preview',form([row,row,{...row,student_code:'bad code',full_name:''}]));assert.equal(bad.status,200);assert.equal(bad.data.can_confirm,false);assert.deepEqual(bad.data.rows.map(r=>r.status),['UNCHANGED','CONFLICT','ERROR']);assert.equal((await req('POST','/practice/roster/confirm',{token:bad.data.token})).status,409);
 const update=await req('POST','/practice/roster/preview',form([{...row,full_name:'Tên mới'}]));assert.equal(update.data.rows[0].status,'UPDATE');
 await db.query("UPDATE users SET full_name='Đã đổi đồng thời' WHERE username=$1",[row.student_code]);assert.equal((await req('POST','/practice/roster/confirm',{token:update.data.token})).status,409);
});
test('V4 trình duyệt: lớp → hồ sơ → lịch sử → lượt làm, tự xem, bốn kích thước',{timeout:120000},async()=>{
 const {chromium}=await import('playwright'),browser=await chromium.launch({headless:true});
 try{
  const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  async function signIn(username){await p.goto(origin+'/login');await p.getByPlaceholder('admin').fill(username);await p.locator('input[type=password]').fill(pw);await p.getByRole('button',{name:'Đăng nhập',exact:true}).click();await p.waitForURL(username.includes('student')?origin+'/practice':origin+'/');}
  await signIn('pilot_test_teacher');await p.goto(origin+'/practice');await p.getByLabel('Năm học · Lớp').selectOption(String(classId));await p.getByRole('link',{name:'pilot_test_student · pilot_test_student',exact:true}).click();await p.getByRole('heading',{name:'pilot_test_student',exact:true}).waitFor();
  for(const size of [{width:1440,height:900},{width:1366,height:768},{width:768,height:1024},{width:390,height:844}]){
   await p.setViewportSize(size);await p.goto(origin+'/practice/students/'+studentId+'/portfolio');await p.getByRole('heading',{name:'Điểm nổi bật',exact:true}).waitFor();
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
   await p.screenshot({path:path.join(artifacts,'v4-portfolio-overview-'+size.width+'.png'),fullPage:true});
   if(p.viewportSize().width<480)await p.getByLabel('Phần hồ sơ',{exact:true}).selectOption('history');else await p.getByRole('link',{name:'Lịch sử làm bài',exact:true}).click();await p.getByText(/lượt phù hợp · trang 1/).waitFor();
   await p.screenshot({path:path.join(artifacts,'v4-portfolio-history-'+size.width+'.png'),fullPage:true});
   await p.getByRole('button',{name:'Trang sau',exact:true}).click();await p.getByText(/lượt phù hợp · trang 2/).waitFor();
  }
  await p.setViewportSize({width:1440,height:900});await p.goto(origin+'/practice/students/'+studentId+'/attempts/'+attemptId);await p.getByRole('heading',{name:'Chi tiết lượt luyện',exact:true}).waitFor();await p.locator('.review-question summary').first().click();await p.getByRole('heading',{name:'Bài làm của học sinh',exact:true}).waitFor();await p.screenshot({path:path.join(artifacts,'v4-attempt-review-desktop.png'),fullPage:true});
  await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await p.screenshot({path:path.join(artifacts,'v4-attempt-review-mobile.png'),fullPage:true});
  await p.goto(origin+'/practice/students/'+studentId+'/portfolio?tab=mastery');await p.getByRole('heading',{name:'Thành thạo theo nội dung',exact:true}).waitFor();await p.screenshot({path:path.join(artifacts,'v4-mastery-mobile.png'),fullPage:true});
  await p.getByRole('button',{name:'Mở menu',exact:true}).click();await p.getByRole('navigation',{name:'Mảng việc'}).waitFor();await p.keyboard.press('Escape');await p.getByRole('button',{name:'Mở menu',exact:true}).waitFor();
  await p.context().clearCookies();await p.evaluate(()=>localStorage.clear());await signIn('pilot_test_student');await p.getByRole('heading',{name:'Việc học của em'}).waitFor();await p.screenshot({path:path.join(artifacts,'v4-student-home-mobile.png'),fullPage:true});await p.getByRole('link',{name:'Xem toàn bộ hồ sơ học tập →',exact:true}).click();await p.getByRole('heading',{name:'pilot_test_student',exact:true}).waitFor();if(p.viewportSize().width<480)await p.getByLabel('Phần hồ sơ',{exact:true}).selectOption('history');else await p.getByRole('link',{name:'Lịch sử làm bài',exact:true}).click();await p.getByText(/lượt phù hợp · trang 1/).waitFor();await p.getByRole('button',{name:'Trang sau',exact:true}).click();await p.getByText(/lượt phù hợp · trang 2/).waitFor();assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('V4 xem lại năm dạng: partial, bỏ qua, tự luận và phiên bản lịch sử',{timeout:60000},async()=>{
 const {gradeQuestion}=await import('../../src/services/practice/grading.js');
 const drafts=[
 {type:'multiple_choice',options:['A','B','C','D'].map(id=>({id,text:'Phương án '+id})),answer:{correct:'B'}},
 {type:'true_false',statements:['a','b','c','d'].map(id=>({id,text:'Nhận định '+id})),answer:{values:{a:true,b:true,c:true,d:true}}},
 {type:'short_answer',answer:{numeric:0,tolerance:0}},
 {type:'matching',left:[{id:'A',text:'Ý thứ nhất'},{id:'B',text:'Ý thứ hai'}],right:[{id:'1',text:'Nội dung 1'},{id:'2',text:'Nội dung 2'}],answer:{pairs:{A:'1',B:'2'}}},
 {type:'essay',answer:{reference:'Đáp án tham khảo tự đối chiếu'}}
 ].map((d,i)=>({...d,subject_id:subjectId,topic_id:topicId,grade:9,cognitive_level:i%4+1,stem:'Kiểm thử hiển thị dạng '+d.type,explanation:'Lời giải kiểm thử'}));
 const responses=['B',{a:true,b:true,c:true,d:false},null,{A:'1',B:'1'},'Bài tự luận của học sinh'];
 const a=(await db.query("INSERT INTO attempts(student_id,mode,source,config,seed,status,completed_at,score,denominator,percentage,duration_seconds) VALUES($1,'challenge','self_practice',$2,'v4-review','completed',now(),2.25,4,56.25,120) RETURNING id",[studentId,{subject_id:subjectId,topic_ids:[topicId],count:5}])).rows[0];
 for(let n=0;n<drafts.length;n++){const q=await req('POST','/practice/questions',drafts[n]);assert.equal(q.status,201,JSON.stringify(q.data));await db.query('INSERT INTO attempt_items(attempt_id,question_version_id,question_id,sequence,selection_reason,response,first_response,is_final,uncertain,skipped,grade_result) VALUES($1,$2,$3,$4,$5,$6,$6,true,$7,$8,$9)',[a.id,q.data.current_version_id,q.data.id,n+1,'assigned',JSON.stringify(responses[n]),n===1,n===2,gradeQuestion(drafts[n],responses[n])]);}
 const review=await req('GET','/practice/students/'+studentId+'/attempts/'+a.id,undefined,studentToken);assert.equal(review.status,200,JSON.stringify(review.data));assert.deepEqual(review.data.items.map(i=>i.question.type),drafts.map(d=>d.type));assert.deepEqual(review.data.summary,{correct:1,partial:2,incorrect:0,skipped:1,uncertain:1,essay:1,pending:0,answered:4});assert.equal(review.data.items[2].question.answer.numeric,0);assert.equal(review.data.items[1].result.details.filter(d=>d.correct).length,3);
 const {chromium}=await import('playwright'),b=await chromium.launch({headless:true});try{const p=await b.newPage({viewport:{width:390,height:844}});await p.goto(origin+'/login');await p.getByPlaceholder('admin').fill('pilot_test_student');await p.locator('input[type=password]').fill(pw);await p.getByRole('button',{name:'Đăng nhập',exact:true}).click();await p.waitForURL(origin+'/practice');await p.goto(origin+'/practice/review/'+a.id);await p.getByRole('heading',{name:'Chi tiết lượt luyện',exact:true}).waitFor();await p.waitForFunction(()=>document.querySelectorAll('.review-question[open]').length===3);assert.equal(await p.locator('.review-question[open]').count(),3);await p.getByRole('button',{name:'Xem tất cả',exact:true}).click();assert.equal(await p.getByRole('heading',{name:'Bài làm của em',exact:true}).count(),5);assert.equal(await p.locator('.review-metadata').count(),0);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await p.screenshot({path:path.join(artifacts,'v4-review-five-types.png'),fullPage:true});}finally{await b.close();}
});
import {registerV5} from './v5-checks.mjs';
registerV5(test,()=>({db,req,login,pw,studentId,classId,subjectId,teacherToken,studentToken}));
