import {registerV643} from './v643-checks.js';
import {registerV65} from './v65-checks.js';
import {registerV652} from './v652-checks.js';
import {registerV653} from './v653-checks.js';
import {registerV66} from './v66-checks.js';
import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import {chromium} from 'playwright';
import {cleanupIntegration} from './helpers/cleanup.js';
const source=process.env.DB_NAME;
if(source!=='nganhang_personalized_v63')throw Error('Chỉ chạy V6.3 integration từ bản sao riêng');
const name='nganhang_v63_test_'+Date.now(),dir=path.resolve('../artifacts'),origin='http://127.0.0.1:3103',pw=crypto.randomBytes(18).toString('base64url');
const connection={host:process.env.DB_HOST,port:process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD};
const sourcePool=new pg.Pool({...connection,database:source}),tokens={},users={};
let db,server,master,topic,school,cls,clsOther,student,otherStudent,matrixId,runId,questions=[];
async function req(method,url,body,actor='admin'){
 const res=await fetch(origin+'/api'+url,{method,headers:{...(tokens[actor]?{Authorization:'Bearer '+tokens[actor]}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
 const text=await res.text();let data;try{data=JSON.parse(text);}catch{data={text};}return {status:res.status,data};
}
const expect=(r,status)=>assert.equal(r.status,status,JSON.stringify(r.data));
// Đăng nhập (lại) mọi vai. Test trình duyệt V652 đăng xuất thật (token_version+1 = "đăng xuất mọi nơi"), nên token
// API cũ của cùng tài khoản hết hiệu lực — test chạy sau phải lấy token mới thay vì dùng lại token từ đầu file.
async function refreshTokens(){for(const actor of Object.keys(users)){const r=await req('POST','/auth/login',{username:'v63_'+actor,password:pw},'none');expect(r,200);tokens[actor]=r.data.token;}}
test.before(async()=>{
 fs.mkdirSync(dir,{recursive:true});
 const env={...process.env,PGHOST:connection.host,PGPORT:String(connection.port),PGUSER:connection.user,PGPASSWORD:connection.password},dump=path.join(dir,name+'.dump');
 let result=spawnSync('pg_dump',['-Fc','-d',source,'-f',dump],{env,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);
 await sourcePool.query('CREATE DATABASE '+name);result=spawnSync('pg_restore',['--no-owner','--no-privileges','-d',name,dump],{env,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);
 db=new pg.Pool({...connection,database:name});
 const hash=await bcrypt.hash(pw,10);
 for(const [key,role] of [['admin','admin'],['teacher','teacher'],['homeroom','teacher'],['board','board'],['student','student'],['other','student']]){
  users[key]=(await db.query('INSERT INTO users(username,password_hash,full_name,role) VALUES($1,$2,$3,$4) RETURNING id',['v63_'+key,hash,'V63 '+key,role])).rows[0].id;
  if(role==='student')await db.query('INSERT INTO student_profiles(user_id,student_code) VALUES($1,$2)',[users[key],'v63_'+key]);
 }
 master=(await db.query("SELECT y.id AS yccd_id,y.outcome_id,o.subject_id,o.grade,b.id AS branch_id FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id JOIN branches b ON b.subject_id=o.subject_id AND b.code IN('L','VL') WHERE y.code='L.1.1' AND o.grade=7 LIMIT 1")).rows[0];assert(master);
 const existing=(await db.query('SELECT id FROM topics WHERE subject_id=$1 AND grade=7 AND branch_id=$2 LIMIT 1',[master.subject_id,master.branch_id])).rows[0];
 topic=existing?.id||(await db.query("INSERT INTO topics(subject_id,grade,branch_id,name) VALUES($1,7,$2,'TEST V63 - bài kỹ thuật') RETURNING id",[master.subject_id,master.branch_id])).rows[0].id;
 await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status,source_evidence) VALUES($1,$2,'ACTIVE','{\"origin\":\"TEST_ONLY\"}') ON CONFLICT(topic_id,yccd_id) DO UPDATE SET status='ACTIVE'",[topic,master.yccd_id]);
 school=(await db.query("SELECT id FROM banks WHERE kind='school' ORDER BY id LIMIT 1")).rows[0].id;
 const year=(await db.query("INSERT INTO school_years(name) VALUES($1) RETURNING id",['TEST V63 '+Date.now()])).rows[0].id;
 cls=(await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('7-V63-A',7,$1) RETURNING id",[year])).rows[0].id;
 clsOther=(await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('7-V63-B',7,$1) RETURNING id",[year])).rows[0].id;
 student=users.student;otherStudent=users.other;
 await db.query('INSERT INTO class_memberships(class_id,student_id) VALUES($1,$2),($3,$4)',[cls,student,clsOther,otherStudent]);
 await db.query('INSERT INTO teacher_class_assignments(teacher_id,class_id,subject_id) VALUES($1,$2,$3)',[users.teacher,cls,master.subject_id]);
 await db.query("INSERT INTO user_positions(user_id,position,class_id) VALUES($1,'homeroom',$2),($3,'board',$2)",[users.homeroom,cls,users.board]);
 const uploads=path.join(dir,name+'-uploads');fs.cpSync(path.resolve(process.env.UPLOAD_DIR||'uploads'),uploads,{recursive:true,errorOnExist:true});
 const fd=fs.openSync(path.join(dir,'v63-integration-server.log'),'w');
 // Cả file chạy nhiều vai qua một tài khoản admin trong vài phút: nới trần 300 request/phút/tài khoản cho server test
 // (rate limit có test riêng ở test/security và v667-perf), để lỗi 429 không che lỗi thật.
 server=spawn(process.execPath,['src/server.js'],{env:{...process.env,DB_NAME:name,PORT:'3103',HOST:'127.0.0.1',UPLOAD_DIR:uploads,RATE_LIMIT_API_USER:'100000'},stdio:['ignore',fd,fd],windowsHide:true});
 let ready=false;for(let i=0;i<120;i++){try{if((await fetch(origin+'/api/health',{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert(ready,'Không chạy được server test');
 await refreshTokens();
 fs.writeFileSync(path.join(dir,'v63-test-database.json'),JSON.stringify({source,test_database:name},null,2));
});
test.after(()=>cleanupIntegration({server,db,adminPool:sourcePool,name,dump:path.join(dir,name+'.dump'),uploadsDir:path.join(dir,name+'-uploads')}));
function matrix(cells,extra={}){return {name:'V63 Ma trận chính xác',subject_id:master.subject_id,grade:7,matrix_type:'TRUONG',total_score:1,ratio_m1:0,ratio_m2:0,ratio_m3:100,ratio_m4:0,yccd_scope:[master.yccd_id],cells:cells.map(c=>({...master,question_count:2,score_per_question:.5,q_type:'mcq4',cognitive_level:'M3',...c})),...extra};}
async function question(level,type='multiple_choice',extra={}){
 const payload={...master,topic_id:topic,type,cognitive_level:level,stem:'TEST V63 '+type+' '+level+' '+crypto.randomUUID(),bank_id:school,options:['A','B','C','D'].map(id=>({id,text:'Phương án '+id})),answer:{correct:'B'},...extra};
 if(type==='matching')Object.assign(payload,{left:[{id:'A',text:'Tốc độ'},{id:'B',text:'Quãng đường'}],right:[{id:'1',text:'m/s'},{id:'2',text:'m'}],answer:{pairs:{A:'1',B:'2'}}});
 const r=await req('POST','/practice/questions',payload);expect(r,201);
 for(const status of ['pending_review','approved','active'])expect(await req('POST','/practice/questions/'+r.data.id+'/workflow',{status}),200);
 questions.push({...r.data,payload});return {...r.data,payload};
}
test('V63 source master đúng 97, không biến dòng minh họa thành master',async()=>{const r=await req('GET','/practice/curriculum?subject_id='+master.subject_id+'&grade=7');expect(r,200);assert.equal(r.data.length,97);assert.equal(r.data.filter(y=>!y.source_locator).length,12);});
test('V63 GVCN quản lý đúng lớp; GV môn và BGH không mặc định đổi mật khẩu',async()=>{
 expect(await req('GET','/practice/students/'+student+'/portfolio',undefined,'homeroom'),200);
 expect(await req('GET','/practice/students/'+otherStudent+'/portfolio',undefined,'homeroom'),403);
 expect(await req('POST','/practice/students/'+student+'/reset-password',{},'teacher'),403);
 expect(await req('POST','/practice/students/'+student+'/reset-password',{},'board'),403);
 const created=await req('POST','/practice/students',{class_id:cls,student_code:'v63_new',full_name:'Học sinh V63'},'homeroom');expect(created,201);
 expect(await req('PUT','/practice/students/'+created.data.id+'/profile',{student_code:'v63_new',full_name:'Đã sửa',email:''},'homeroom'),200);
 expect(await req('POST','/practice/students/'+created.data.id+'/reset-password',{},'homeroom'),200);
 expect(await req('POST','/practice/students/'+created.data.id+'/transfer',{class_id:clsOther},'homeroom'),403);
 expect(await req('PUT','/practice/students/'+created.data.id+'/status',{is_active:false},'homeroom'),403);
 expect(await req('POST','/matrix',matrix([{}]),'homeroom'),403);
});
test('V63 giáo viên tạo draft; tổng sai 422; sai lệch cần xác nhận',async()=>{
 let r=await req('POST','/matrix',matrix([{question_count:1}]),'teacher');expect(r,422);assert.equal(r.data.code,'MATRIX_SCORE_MISMATCH');
 r=await req('POST','/matrix',matrix([{}],{ratio_m1:30,ratio_m2:30,ratio_m3:20,ratio_m4:20}),'teacher');expect(r,422);assert.equal(r.data.code,'MATRIX_RATIO_DEVIATION');
 r=await req('POST','/matrix',matrix([{}]),'teacher');expect(r,201);matrixId=r.data.id;
 expect(await req('POST','/matrix/'+matrixId+'/workflow',{status:'pending_review'},'teacher'),200);
 expect(await req('POST','/matrix/'+matrixId+'/workflow',{status:'approved'},'teacher'),403);
 expect(await req('GET','/matrix/'+matrixId,undefined,'homeroom'),403);
});
test('V63 thiếu VD không lấy NB, không tạo exam_run khi thất bại',async()=>{
 await question(1);
 const coverage=await req('GET','/matrix/'+matrixId+'/coverage',undefined,'teacher');expect(coverage,200);assert.equal(coverage.data.summary.can_generate,false);assert.equal(coverage.data.cells[0].exact_available,0);
 const before=(await db.query('SELECT count(*) FROM exam_runs')).rows[0].count;
 const r=await req('POST','/exams/generate',{matrix_id:matrixId,exam_name:'Phải thiếu'},'teacher');expect(r,422);assert.equal(r.data.code,'MATRIX_CELL_SHORTAGE');assert.equal((await db.query('SELECT count(*) FROM exam_runs')).rows[0].count,before);
});
test('V63 thêm đủ đúng YCCĐ → ready → hai mã, điểm ô, tag không tăng câu',async()=>{
 const q1=await question(3),q2=await question(3);
 const tag=(await db.query("INSERT INTO tags(name) VALUES('TEST V63 ưu tiên') RETURNING id")).rows[0].id;await db.query('INSERT INTO question_tags(question_id,tag_id) VALUES($1,$2)',[q1.id,tag]);
 const c=await req('GET','/matrix/'+matrixId+'/coverage');assert.equal(c.data.summary.can_generate,true);
 const r=await req('POST','/exams/generate',{matrix_id:matrixId,exam_name:'Đề V63 snapshot',exam_code_count:2,tag_extras:[{tag_id:tag,count:20}]},'teacher');expect(r,201);runId=r.data.exam_run_id;
 assert.equal(r.data.codes.length,2);for(const code of r.data.codes){assert.equal(code.items.length,2);assert.equal(new Set(code.items.map(q=>q.question_id)).size,2);assert.equal(code.items.reduce((s,q)=>s+q.score,0),1);assert(code.items.every(q=>q.question_version_id&&q.matrix_cell_id&&q.cognitive_level==='M3'));}
 assert(r.data.warnings.some(w=>w.includes('giữa các mã')));assert.notEqual(q1.current_version_id,q2.current_version_id);
});
test('V63 sửa câu không đổi đề cũ; Word/QTI giữ snapshot/điểm/phương án',async()=>{
 const before=await req('GET','/exams/'+runId);expect(before,200);
 const item=before.data.codes['101'][0],q=questions.find(q=>q.id===item.question_id);
 const changed=await req('PUT','/practice/questions/'+q.id,{...q.payload,stem:'ĐÃ SỬA SAU KHI SINH ĐỀ',answer:{correct:'A'},question_version_id:q.current_version_id});expect(changed,200);
 const after=await req('GET','/exams/'+runId);assert.deepEqual(after.data.codes,before.data.codes);
 const stale=await req('PUT','/practice/questions/'+q.id,{...q.payload,question_version_id:q.current_version_id});expect(stale,409);
 for(const suffix of ['/download?code=101','/download-qti?code=101']){
  const denied=await fetch(origin+'/api/exams/'+runId+suffix,{headers:{Authorization:'Bearer '+tokens.teacher}});assert.equal(denied.status,403);const r=await fetch(origin+'/api/exams/'+runId+suffix,{headers:{Authorization:'Bearer '+tokens.admin}});assert.equal(r.status,200,await r.clone().text());const zip=new AdmZip(Buffer.from(await r.arrayBuffer())),xml=zip.getEntries().filter(e=>e.entryName.endsWith('.xml')).map(e=>e.getData().toString()).join('');
  assert(!xml.includes('ĐÃ SỬA SAU KHI SINH ĐỀ'));if(suffix.includes('qti'))assert(xml.includes('<fieldentry>0.5</fieldentry>'));else assert(xml.includes('0.50 điểm'));
 }
});
test('V63 ghép nối được sinh, xem và xuất Word/QTI',async()=>{
 await question(2,'matching');const m=await req('POST','/matrix',matrix([{q_type:'matching',cognitive_level:'M2',question_count:1,score_per_question:1}],{ratio_m2:100,ratio_m3:0}));expect(m,201);
 const gen=await req('POST','/exams/generate',{matrix_id:m.data.id,exam_name:'TEST GN'});expect(gen,201);
 const view=await req('GET','/exams/'+gen.data.exam_run_id);assert.equal(view.data.codes['101'][0].left.length,2);assert.equal(view.data.codes['101'][0].score,1);
 for(const suffix of ['/download?code=101','/download-qti?code=101']){const r=await fetch(origin+'/api/exams/'+gen.data.exam_run_id+suffix,{headers:{Authorization:'Bearer '+tokens.admin}});assert.equal(r.status,200,await r.clone().text());}
});
test('V63 simple Excel thiếu metadata vẫn là draft; không được tự duyệt',async()=>{
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{question_text:'Câu đơn giản chưa có metadata',answer:'6 m/s'}]),'04_QUESTION_UPLOAD_SIMPLE');
 const form=new FormData();form.append('file',new Blob([XLSX.write(wb,{type:'buffer',bookType:'xlsx'})]),'simple.xlsx');
 const parsed=await req('POST','/practice/imports',form,'teacher');expect(parsed,201);
 const job=await req('GET','/practice/imports/'+parsed.data.id,undefined,'teacher');assert.equal(job.data.items[0].validation.status,'NEEDS_REVIEW');assert.equal(job.data.items[0].draft.cognitive_level,null);
 const confirmed=await req('POST','/practice/imports/'+parsed.data.id+'/confirm',{ids:[job.data.items[0].id]},'teacher');expect(confirmed,200);
 const q=(await db.query('SELECT q.* FROM questions q JOIN import_items i ON i.result_question_id=q.id WHERE i.job_id=$1',[parsed.data.id])).rows[0];assert.equal(q.lifecycle,'draft');assert.equal(q.cognitive_level,null);assert.equal(q.yccd_id,null);
 const visible=await req('GET','/practice/questions?search='+encodeURIComponent('Câu đơn giản chưa có metadata'),undefined,'teacher');expect(visible,200);assert(visible.data.some(row=>row.id===q.id));
 expect(await req('POST','/practice/questions/'+q.id+'/workflow',{status:'pending_review'},'teacher'),200);
 expect(await req('POST','/practice/questions/'+q.id+'/workflow',{status:'approved'}),422);
});
test('V63 UI: tick YCCĐ, cân điểm, shortage; xem snapshot không lỗi',{timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/login');await page.getByPlaceholder('admin').fill('v63_teacher');await page.locator('input[type=password]').fill(pw);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL(origin+'/');
  await page.goto(origin+'/matrix');await page.getByRole('button',{name:'🧪 KHTN (3 phân môn)',exact:true}).click();await page.getByLabel('Tên ma trận',{exact:true}).fill('V63 ma trận giao diện');
  await page.getByText('Xem / chọn YCCĐ trực tiếp (nâng cao)',{exact:true}).click();await page.getByLabel('Tìm Outcome / YCCĐ').fill('L.1.1');await page.locator('.curriculum-row input[type=checkbox]').first().check();
  await page.getByRole('button',{name:'Thiết lập từ phạm vi đã chọn'}).click();await page.getByRole('button',{name:'Tự động phân bổ',exact:true}).click();await page.getByText('Tổng 10.00 / 10 điểm · Khớp tỷ lệ',{exact:true}).waitFor();
  await page.screenshot({path:path.join(dir,'v6_3-matrix-builder.png'),fullPage:true});
  await page.getByRole('button',{name:'Lưu và kiểm tra độ phủ',exact:true}).click();await page.getByText('Chưa thể sinh đề. Bổ sung đúng tiêu chí rồi kiểm tra lại.',{exact:true}).waitFor();
  await page.screenshot({path:path.join(dir,'v6_3-matrix-shortage.png'),fullPage:true});
  await page.locator('.coverage-panel').screenshot({path:path.join(dir,'v6_3-matrix-coverage.png')});
  await page.goto(origin+'/exams');await page.locator('tbody tr').filter({hasText:'Đề V63 snapshot'}).getByRole('button',{name:'Xem',exact:true}).click();await page.getByRole('heading',{name:'Đề V63 snapshot',exact:true}).waitFor();await page.screenshot({path:path.join(dir,'v6_3-exam-preview.png'),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('V63 export → UPDATE đúng phiên bản; nhập lại stale bị chặn',async()=>{
 const q=questions.find(q=>q.payload.type==='matching');
 const response=await fetch(origin+'/api/practice/questions-export?yccd_id='+master.yccd_id+'&q_type=matching',{headers:{Authorization:'Bearer '+tokens.admin}});assert.equal(response.status,200);
 const bytes=Buffer.from(await response.arrayBuffer()),wb=XLSX.read(bytes,{type:'buffer'}),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
 assert(rows.some(row=>row.question_id===q.id&&row.question_version_id===q.current_version_id));
 async function importAgain(){const form=new FormData();form.append('file',new Blob([bytes]),'advanced.xlsx');const r=await req('POST','/practice/imports',form);expect(r,201);const job=(await req('GET','/practice/imports/'+r.data.id)).data;return req('POST','/practice/imports/'+r.data.id+'/confirm',{ids:job.items.map(i=>i.id)});}
 expect(await importAgain(),200);expect(await importAgain(),409);
 expect(await req('GET','/practice/questions-export',undefined,'student'),403);
});
test('V63 BGH chỉ duyệt khi phân công rõ; GVCN kiêm nhiệm và scope ngày',async()=>{
 expect(await req('POST','/matrix/'+matrixId+'/workflow',{status:'approved'},'board'),403);
 const assigned=await req('POST','/practice/positions',{user_id:users.board,position:'board',subject_id:master.subject_id,can_approve:true});expect(assigned,201);
 expect(await req('POST','/matrix/'+matrixId+'/workflow',{status:'approved'},'board'),200);
 expect(await req('POST','/matrix',matrix([{}]),'board'),403);
 expect(await req('DELETE','/practice/positions/'+assigned.data.id),200);
 const homeroom=await req('POST','/practice/positions',{user_id:users.board,position:'homeroom',class_id:cls});expect(homeroom,201);
 expect(await req('PUT','/practice/students/'+student+'/profile',{student_code:'v63_student',full_name:'Học sinh kiêm nhiệm',email:''},'board'),200);
 expect(await req('POST','/practice/students/'+otherStudent+'/reset-password',{},'board'),403);
 expect(await req('DELETE','/practice/positions/'+homeroom.data.id),200);
 const classes=await req('GET','/practice/classes',undefined,'homeroom');assert(classes.data.some(c=>c.id===cls)&&!classes.data.some(c=>c.id===clsOther));
 const expired=await req('POST','/practice/positions',{user_id:users.homeroom,position:'homeroom',class_id:clsOther,valid_from:'2020-01-01',valid_to:'2020-01-02'});expect(expired,201);
 expect(await req('GET','/practice/students/'+otherStudent+'/portfolio',undefined,'homeroom'),403);
});
test('V63 cấu hình gợi ý và học sinh luyện theo khóa master',async()=>{
 expect(await req('PUT','/practice/settings',{metadata_auto_threshold:101}),400);
 expect(await req('PUT','/practice/settings',{metadata_auto_threshold:95}),200);
 const suggest=await req('POST','/practice/metadata/suggest',{...master,stem:'TEST',reasoning_steps:2},'teacher');expect(suggest,200);assert.equal(suggest.data.metadata_suggestions.threshold,95);assert.equal(suggest.data.metadata_suggestions.cognitive_level.value,3);
 const options=await req('GET','/practice/content-options?subject_id='+master.subject_id+'&grade=7',undefined,'student');expect(options,200);assert(options.data.yccd.some(y=>y.key===JSON.stringify(['master',master.yccd_id])));
 const template=await fetch(origin+'/api/practice/templates/TEMPLATE_CHUAN_TOAN_TRUONG_OUTCOME_YCCD_QUESTION_METADATA_V1_1.xlsx',{headers:{Authorization:'Bearer '+tokens.teacher}});assert.equal(template.status,200);
});
test('V63 giao diện: thiếu → bổ sung → kiểm tra lại → sinh; ma trận trên điện thoại', {timeout:60000},async()=>{
 const m=await req('POST','/matrix',matrix([{question_count:1,score_per_question:1,cognitive_level:'M4'}],{ratio_m3:0,ratio_m4:100}),'teacher');expect(m,201);
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(origin+'/login');await page.getByPlaceholder('admin').fill('v63_teacher');await page.locator('input[type=password]').fill(pw);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL(origin+'/');
  await page.goto(origin+'/exams?matrix='+m.data.id);await page.getByText('Chưa thể sinh đề. Bổ sung đúng tiêu chí rồi kiểm tra lại.',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'Sinh đề',exact:true}).isDisabled());
  await question(4);
  await page.getByRole('button',{name:'Kiểm tra lại độ phủ',exact:true}).click();await page.getByText('Đủ câu khớp chính xác — có thể sinh đề.',{exact:true}).waitFor();
  await page.getByPlaceholder('VD: Giữa kỳ I năm 2026').fill('V63 E2E sinh từ giao diện');await page.locator('.modal input[type=number]').nth(0).fill('1');await page.locator('.modal input[type=number]').nth(1).fill('0');
  await page.getByRole('button',{name:'Sinh đề',exact:true}).click();await page.locator('tbody tr').filter({hasText:'V63 E2E sinh từ giao diện'}).getByRole('button',{name:'Xem',exact:true}).click();await page.getByRole('heading',{name:'V63 E2E sinh từ giao diện',exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(dir,'v6_3-exam-mobile.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.goto(origin+'/matrix');await page.getByRole('button',{name:'🧪 KHTN (3 phân môn)',exact:true}).click();await page.getByText('Xem / chọn YCCĐ trực tiếp (nâng cao)',{exact:true}).click();await page.getByLabel('Tìm Outcome / YCCĐ').fill('L.1.1');await page.locator('.curriculum-row input[type=checkbox]').first().check();
  await page.getByRole('button',{name:'Thiết lập từ phạm vi đã chọn'}).click();await page.getByRole('button',{name:'Tự động phân bổ',exact:true}).click();await page.getByText('Tổng 10.00 / 10 điểm · Khớp tỷ lệ',{exact:true}).waitFor();await page.screenshot({path:path.join(dir,'v6_3-matrix-mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('V63 quyền xem môn bổ sung không tự biến thành quyền sửa của GV kiêm nhiệm',async()=>{
 const subject=(await db.query('SELECT id FROM subjects WHERE id<>$1 ORDER BY id LIMIT 1',[master.subject_id])).rows[0];assert(subject);
 const p=await req('POST','/practice/positions',{user_id:users.teacher,position:'board',subject_id:subject.id});expect(p,201);
 expect(await req('GET','/practice/questions?subject_id='+subject.id,undefined,'teacher'),200);
 expect(await req('POST','/matrix',matrix([{}],{subject_id:subject.id}),'teacher'),403);
 expect(await req('DELETE','/practice/positions/'+p.data.id),200);
});
registerV643(()=>({db,req,users,master,topic,school,cls,origin,pw,dir}));
registerV65(()=>({db,req,users,master,topic,school,cls,origin,pw,dir}));
registerV652(()=>({db,req,users,master,topic,school,cls,origin,pw,dir}));
registerV653(()=>({db,req,users,master,topic,school,cls,origin,pw,dir}));
registerV66(()=>({db,req,users,master,topic,school,cls,origin,pw,dir,refreshTokens}));
