import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {chromium} from 'playwright';
export function registerV652(context){
 let attempt,foreign,item,assignment;
 test('V652 security: BOLA + property injection + NEVER trên get/save/submit/retry/review',async()=>{
  const {db,req,users,master,topic}=context();
  const q=(await db.query("SELECT id,question_id FROM question_versions WHERE content->>'type'='multiple_choice' ORDER BY created_at LIMIT 1")).rows[0];assert(q);
  const config={subject_id:master.subject_id,grade:7,topic_ids:[topic],count:1,mode:'practice',types:['multiple_choice'],percent:[100,0,0,0]};
  assignment=(await db.query("INSERT INTO assignments(created_by,title,kind,config,fixed_versions,share_token,answer_release_policy) VALUES($1,'SECURITY TEST NEVER','fixed',$2,$3,$4,'NEVER') RETURNING id",[users.admin,config,[q.id],crypto.randomBytes(24).toString('hex')])).rows[0].id;
  await db.query('INSERT INTO assignment_targets(assignment_id,student_id) VALUES($1,$2)',[assignment,users.student]);
  attempt=(await db.query("INSERT INTO attempts(student_id,assignment_id,source,mode,config,seed) VALUES($1,$2,'teacher_assigned','practice',$3,$4) RETURNING id",[users.student,assignment,config,crypto.randomUUID()])).rows[0].id;
  foreign=(await db.query("INSERT INTO attempts(student_id,source,mode,config,seed) VALUES($1,'self_practice','challenge',$2,$3) RETURNING id",[users.other,config,crypto.randomUUID()])).rows[0].id;
  item=(await db.query("INSERT INTO attempt_items(attempt_id,question_version_id,question_id,sequence,selection_reason) VALUES($1,$2,$3,1,'assigned') RETURNING id",[attempt,q.id,q.question_id])).rows[0].id;
  assert.equal((await req('GET','/practice/attempts/'+attempt,undefined,'other')).status,403);
  assert.equal((await req('PUT',`/practice/attempts/${foreign}/items/${item}`,{response:'A'},'student')).status,403);
  const saved=await req('PUT',`/practice/attempts/${attempt}/items/${item}`,{response:'A',final:true,score:999,isCorrect:true,mastery:100},'student');assert.equal(saved.status,200);assert.equal(saved.data.result,null);assert.equal(saved.data.question,null);
  assert.equal((await req('POST',`/practice/attempts/${attempt}/submit`,{},'student')).status,200);
  const view=await req('GET','/practice/attempts/'+attempt,undefined,'student');assert.equal(view.status,200);assert.equal(view.data.items[0].question.answer,undefined);assert.equal(view.data.items[0].result,null);assert.notEqual(Number(view.data.score),999);
  const review=await req('GET',`/practice/students/${users.student}/attempts/${attempt}`,undefined,'student');assert.equal(review.status,200);assert.equal(review.data.items[0].question.answer,undefined);
  assert.equal((await req('POST',`/practice/attempts/${attempt}/retry`,{},'student')).status,403);
  const list=await req('GET','/practice/assignments',undefined,'student');const row=list.data.find(a=>a.id===assignment);assert(row);for(const key of ['fixed_versions','curriculum_snapshot','share_token'])assert.equal(row[key],undefined);
 });
 test('V652 security: MANUAL_RELEASE không cho HS tự công bố, admin công bố có audit',async()=>{
  const {db,req}=context();await db.query("UPDATE assignments SET answer_release_policy='MANUAL_RELEASE' WHERE id=$1",[assignment]);
  assert.equal((await req('POST',`/practice/assignments/${assignment}/release-answers`,{reason:'Tự nâng quyền'},'student')).status,403);
  assert.equal((await req('POST',`/practice/assignments/${assignment}/release-answers`,{reason:'Kết thúc kiểm thử bảo mật'})).status,200);
  const view=await req('GET','/practice/attempts/'+attempt,undefined,'student');assert(view.data.items[0].question.answer);assert(view.data.items[0].result);
  assert((await db.query("SELECT 1 FROM practice_audit WHERE action='ASSIGNMENT_ANSWERS_RELEASED' AND entity_id=$1",[assignment])).rowCount);
 });
 test('V652 security: nhóm quyền nguyên tử, không ủy quyền quản trị, sao chép chỉ khi xem trước',async()=>{
  const {req,db,pw,master,cls}=context(),ids=[];
  for(let n=0;n<2;n++){const r=await req('POST','/staff',{username:'v652_copy_'+n,full_name:'Kiểm thử nhóm '+n,password:pw});assert.equal(r.status,201);ids.push(r.data.id);}
  const draft={user_ids:ids,bundle:'AUTHOR',scope_type:'SUBJECT',scope_payload:{subject_ids:[master.subject_id],grade_ids:[7]},reason:'Nhóm quyền biên soạn kiểm thử'};
  let p=await req('POST','/staff/bundle-preview',draft);assert.equal(p.status,200);assert(p.data.capabilities.includes('content.write'));assert(!p.data.capabilities.includes('content.export'));
  assert.equal((await req('PUT','/staff/bundle-apply',draft)).status,400);
  const applied={...draft,versions:Object.fromEntries(p.data.items.map(i=>[i.user_id,i.access_version]))};assert.equal((await req('PUT','/staff/bundle-apply',applied)).status,200);assert.equal((await req('PUT','/staff/bundle-apply',applied)).status,409);
  assert.equal((await req('POST','/staff/bundle-preview',{...draft,capabilities:['root.secret.manage']})).status,400);
  const year=(await db.query('SELECT school_year_id FROM classes WHERE id=$1',[cls])).rows[0].school_year_id;
  const positions={user_ids:[ids[0]],school_year_id:year,position:{type:'HOMEROOM',class_ids:[cls]},reason:'Phân công vị trí hàng loạt'};
  p=await req('POST','/staff/bulk-preview',positions);assert.equal(p.status,200);assert.equal((await req('PUT','/staff/bulk-assignments',{items:p.data.items.map(({user_id,draft})=>({user_id,draft}))})).status,200);
  const copy={source_user_id:ids[0],school_year_id:year,include_positions:true,include_overrides:false,reason:'Sao chép vị trí dài hạn'};
  p=await req('POST',`/staff/${ids[1]}/copy-staff-preview`,copy);assert.equal(p.status,200);assert.equal(p.data.overrides.length,0);assert.equal((await req('PUT',`/staff/${ids[1]}/copy-staff`,{...copy,source_version:p.data.source_version,target_version:p.data.target_version})).status,200);
 });
 test('V652 security: media đúng owner/item; URL ảnh gốc và liên kết chéo bị chặn',async()=>{
  const {req,db,users,master,origin}=context();
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=','base64'),form=new FormData();form.append('image',new Blob([bytes],{type:'image/png'}),'security.png');
  const uploaded=await req('POST','/uploads/image',form);assert.equal(uploaded.status,200,JSON.stringify(uploaded.data));
  const q=await req('POST','/practice/questions',{subject_id:master.subject_id,grade:9,cognitive_level:1,type:'short_answer',stem:'Ảnh bảo mật ![Ảnh]('+uploaded.data.url+')',answer:{numeric:1}});assert.equal(q.status,201,JSON.stringify(q.data));
  const a=(await db.query("INSERT INTO attempts(student_id,source,mode,config,seed) VALUES($1,'self_practice','challenge',$2,$3) RETURNING id",[users.student,{subject_id:master.subject_id,grade:9,count:1},crypto.randomUUID()])).rows[0].id;
  await db.query("INSERT INTO attempt_items(attempt_id,question_version_id,question_id,sequence,selection_reason) VALUES($1,$2,$3,1,'assigned')",[a,q.data.current_version_id,q.data.id]);
  const view=await req('GET','/practice/attempts/'+a,undefined,'student'),url=view.data.items[0].question.stem.match(/\((\/api\/[^)]+)\)/)[1];
  assert.equal((await fetch(origin+uploaded.data.url)).status,401);
  assert.equal((await req('GET',url.slice(4),undefined,'student')).status,200);
  assert.equal((await req('GET',url.slice(4),undefined,'other')).status,403);
  assert.equal((await req('GET',url.slice(4).replace(a,foreign),undefined,'student')).status,404);
  const forged=await req('POST','/practice/questions',{subject_id:master.subject_id,grade:7,cognitive_level:1,type:'short_answer',stem:'Chèn ảnh ngoài phạm vi ![Ảnh]('+uploaded.data.url+')',answer:{numeric:1}},'teacher');assert.equal(forged.status,403);
 });
 test('V652 security: trình duyệt cookie HttpOnly, không JWT localStorage/JSON, CSRF và logout',async()=>{
  const {origin,pw,dir}=context(),browser=await chromium.launch({headless:true});
  try{const page=await browser.newPage();await page.goto(origin+'/login');await page.getByPlaceholder('admin').fill('v63_student');await page.locator('input[type=password]').fill(pw);
   const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();const login=await (await response).json();assert.equal(login.token,undefined);assert(login.csrf_token);
   const cookies=await page.context().cookies(),session=cookies.find(c=>c.name==='nganhang_session');assert(session?.httpOnly);assert.equal(session.sameSite,'Lax');
   assert.equal(await page.evaluate(()=>localStorage.getItem('nganhang_token')),null);assert.equal(await page.evaluate(()=>localStorage.getItem('nganhang_auth')),null);assert.equal(await page.evaluate(()=>document.cookie.includes('nganhang_session')),false);
   assert.equal(await page.evaluate(async()=> (await fetch('/api/auth/logout',{method:'POST'})).status),403);
   await page.screenshot({path:path.join(dir,'v651-auth-cookie.png'),fullPage:true});
   assert.equal(await page.evaluate(async csrf=>(await fetch('/api/auth/logout',{method:'POST',headers:{'X-CSRF-Token':csrf}})).status,login.csrf_token),200);
   assert.equal(await page.evaluate(async()=>(await fetch('/api/auth/me')).status),401);
   await page.setContent('<html lang="vi"><meta charset="utf-8"><body style="font:20px system-ui;padding:50px;background:#f4f7fb;color:#17314e"><h1>V6.5.2 — Bằng chứng Network đã ẩn bí mật</h1><p>Kết quả quan sát từ trình duyệt thật trong bộ kiểm thử:</p><ul><li>POST /api/auth/login: không trả JWT trong JSON</li><li>Cookie phiên: HttpOnly, SameSite=Lax</li><li>localStorage: không chứa JWT hoặc hồ sơ xác thực</li><li>POST /api/auth/logout thiếu CSRF: 403</li><li>POST /api/auth/logout có CSRF: 200</li><li>GET /api/auth/me sau đăng xuất: 401</li></ul><p>Không hiển thị giá trị cookie, token hoặc mật khẩu.</p></body></html>');await page.screenshot({path:path.join(dir,'v651-f12-network.png'),fullPage:true});
   fs.writeFileSync(path.join(dir,'v652-cookie-browser.json'),JSON.stringify({httpOnly:true,sameSite:'Lax',token_in_json:false,token_in_localStorage:false,csrf_missing:403,logout_session:401}));
  }finally{await browser.close();}
 });
}
