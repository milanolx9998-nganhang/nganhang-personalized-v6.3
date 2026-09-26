import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {chromium} from 'playwright';
export function registerV66(context){
 test('V66: năng lực có phân quyền, khung bất biến và dữ liệu thiếu không thành 0',async()=>{
  const {req,master,users,refreshTokens}=context();
  await refreshTokens(); // V652 đã đăng xuất học sinh trên trình duyệt → token cũ hết hiệu lực.
  let r=await req('POST','/competency/frameworks',{subject_id:master.subject_id,grade_from:7,grade_to:7,code:'TEST-KHTN',title:'Khung KHTN kiểm thử',source:'Master Prompt — dữ liệu test',version:'test-1',template:'KHTN'});assert.equal(r.status,201,JSON.stringify(r.data));const f=r.data;
  assert.equal((await req('POST',`/competency/frameworks/${f.id}/publish`,{revision:f.revision,confirmed:true,reason:'Kiểm thử quyền'},'teacher')).status,403);
  r=await req('GET','/competency/frameworks');assert.equal(r.status,200);const axes=r.data.frameworks.find(x=>x.id===f.id).axes;assert.equal(axes.length,3);assert(!axes[1].allowed_evidence.includes('AUTO_GRADED_ITEM'));
  r=await req('POST',`/competency/frameworks/${f.id}/publish`,{revision:f.revision,confirmed:true,reason:'Công bố fixture'});assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal((await req('PUT',`/competency/frameworks/${f.id}/axes`,{id:axes[0].id,revision:f.revision+1,code:'X',name:'Không được sửa',allowed_evidence:['TEACHER_RUBRIC'],reason:'Kiểm thử'})).status,409);
  const url=`/practice/students/${users.student}/competency-profile?subject_id=${master.subject_id}&grade=7`;
  r=await req('GET',url,undefined,'student');assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.axes.length,3);assert(r.data.axes.every(a=>a.performance_score===null&&!a.sufficient));
  assert.equal((await req('GET',url,undefined,'other')).status,403);
  r=await req('GET',`/practice/students/${users.student}/learning-habits?subject_id=${master.subject_id}&grade=7`,undefined,'student');assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal((await req('POST','/competency/rubrics',{student_id:users.student},'student')).status,403);
  const mapping={entries:[{axis_id:axes[0].id,weight:.8},{axis_id:axes[2].id,weight:.2}],normalize:true,confirmed:true,reason:'Ánh xạ minh chứng kiểm thử'};
  assert.equal((await req('PUT','/competency/mappings/yccd/'+master.yccd_id,mapping,'teacher')).status,403);
  r=await req('PUT','/competency/mappings/yccd/'+master.yccd_id,mapping);assert.equal(r.status,200,JSON.stringify(r.data));
  r=await req('GET',`/competency/mappings?subject_id=${master.subject_id}&grade=7`);assert.equal(r.status,200);assert.deepEqual(r.data.mappings.find(m=>m.target_type==='yccd'&&String(m.target_id)===String(master.yccd_id)).entries.map(e=>e.weight),[.8,.2]);
  const rubric={student_id:users.student,subject_id:master.subject_id,grade:7,axis_id:axes[1].id,evidence_type:'PRACTICAL_TASK',activity:'Đo và ghi số liệu cá nhân',performance:.75,notes:'Minh chứng test riêng',occurred_at:new Date(Date.now()-1000).toISOString(),reason:'Quan sát thực hành'};
  r=await req('POST','/competency/rubrics',rubric,'teacher');assert.equal(r.status,201,JSON.stringify(r.data));
  assert.equal((await req('POST','/competency/rubrics',{...rubric,student_id:users.other},'teacher')).status,403);
  r=await req('POST','/competency/rubrics',rubric);assert.equal(r.status,201,JSON.stringify(r.data));
  r=await req('GET',url,undefined,'student');assert.equal(r.status,200);const axis=r.data.axes.find(a=>a.axis_id===axes[1].id);assert.equal(axis.evidence_count,2);assert.equal(axis.performance_score,75);assert.equal(axis.sufficient,false);
 });
 let version,outcome,yccd,copied;
 test('V66: CRUD nháp, publish bất biến, copy lineage và diff',async()=>{
  const {req,master}=context();
  let r=await req('POST','/curriculum/versions',{subject_id:master.subject_id,grade:7,version_code:'v66-test-original',title:'Chương trình kiểm thử'});assert.equal(r.status,201,JSON.stringify(r.data));version=r.data.id;
  const detail=async()=>{const r=await req('GET','/curriculum/versions/'+version);assert.equal(r.status,200);return r.data;};
  const values={version_id:version,code:'TEST-O',text:'Outcome nguồn',domain_code:'L',source_page:'33',order_index:0,reason:'Nhập nguồn kiểm thử'};
  r=await req('POST','/curriculum/outcomes',{...values,revision:(await detail()).version.revision});assert.equal(r.status,201,JSON.stringify(r.data));outcome=r.data.id;
  r=await req('POST','/curriculum/yccds',{...values,code:'TEST-Y',text:'Nguyên văn\nYCCĐ',outcome_id:outcome,revision:(await detail()).version.revision});assert.equal(r.status,201,JSON.stringify(r.data));yccd=r.data.id;
  assert.equal((await req('POST','/curriculum/versions/'+version+'/publish',{revision:(await detail()).version.revision,confirmed:true,reason:'Duyệt nguồn kiểm thử'},'teacher')).status,403);
  assert.equal((await req('POST','/curriculum/versions/'+version+'/publish',{revision:(await detail()).version.revision,confirmed:true,reason:'Duyệt nguồn kiểm thử'})).status,200);
  assert.equal((await req('PATCH','/curriculum/yccds/'+yccd,{...values,code:'TEST-Y',text:'Không được sửa lịch sử',outcome_id:outcome,revision:(await detail()).version.revision})).status,409);
  r=await req('POST','/curriculum/versions/'+version+'/copy',{version_code:'v66-test-revision',title:'Chương trình bản nháp sửa'});assert.equal(r.status,201,JSON.stringify(r.data));copied=r.data.id;
  const next=(await req('GET','/curriculum/versions/'+copied)).data,ny=next.yccds[0];
  assert.notEqual(ny.id,yccd);assert.equal(ny.lineage_id,(await detail()).yccds[0].lineage_id);
  r=await req('PATCH','/curriculum/yccds/'+ny.id,{...values,version_id:copied,code:'TEST-Y-NEW',text:'Nội dung bản mới',outcome_id:next.outcomes[0].id,revision:next.version.revision});assert.equal(r.status,200,JSON.stringify(r.data));
  const diff=(await req('GET',`/curriculum/versions/${version}/diff/${copied}`)).data;assert(diff.changes.some(c=>c.fields.includes('text')));assert.equal((await detail()).yccds[0].text,'Nguyên văn\nYCCĐ');
 });
 test('V66: import CSV map cột rõ ràng, commit đúng một lần',async()=>{
  const {req}=context(),form=new FormData();form.append('version_id',String(copied));form.append('file',new Blob(['Outcome,YCCD,Code\nOutcome CSV,Chuẩn CSV,YCSV\n']),'nguon.csv');
  let r=await req('POST','/curriculum/import',form);assert.equal(r.status,201,JSON.stringify(r.data));const id=r.data.id,sheet=r.data.sheets[0].name;
  assert.equal((await req('GET','/curriculum/import/'+id+'/preview',undefined,'teacher')).status,403);
  assert.equal((await req('PUT','/curriculum/import/'+id+'/map',{sheet,header_row:1,columns:{outcome_title:0,text:1,code:2},revision:1})).status,200);
  r=await req('GET','/curriculum/import/'+id+'/preview');assert.equal(r.data.rows.length,1);assert.equal(r.data.rows[0].row_status,'READY');
  const jobs=await req('GET','/curriculum/versions/'+copied+'/imports');assert.equal(jobs.status,200);assert(jobs.data.some(j=>j.id===id));assert.equal(r.data.job.mapping.header_row,1);
  assert.equal((await req('GET','/curriculum/versions/'+copied+'/imports',undefined,'teacher')).status,403);
  const commit={revision:r.data.job.revision,confirmed:true,reason:'Nhập dữ liệu kiểm thử CSV'};
  r=await req('POST','/curriculum/import/'+id+'/commit',commit);assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal((await req('POST','/curriculum/import/'+id+'/commit',commit)).status,409);
 });
 test('V66: giao diện editor/version/diff hoạt động, mobile không tràn',async()=>{
  const {pw}=context(),browser=await chromium.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:3103/login');await page.getByPlaceholder('admin').fill('v63_admin');await page.locator('input[type=password]').fill(pw);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL('http://127.0.0.1:3103/');
   await page.goto('http://127.0.0.1:3103/admin/curriculum');
   // V6.6.7.4: file mẫu chuyển sang trang riêng /curriculum; trang quản trị chỉ còn công cụ nâng cao.
   await page.getByRole('heading',{name:'Chương trình nâng cao',exact:true}).waitFor();await page.getByRole('button',{name:'Outcome & YCCĐ (nâng cao)',exact:true}).click();
   await page.getByLabel('Phiên bản chương trình',{exact:true}).selectOption(String(copied));await page.getByText('TEST-Y-NEW',{exact:true}).waitFor();
   await page.screenshot({path:path.resolve('../artifacts/v66-outcome-yccd-editor.png'),fullPage:true});
   await page.getByRole('button',{name:'Phiên bản & lịch sử',exact:true}).click();await page.getByLabel('So với phiên bản',{exact:true}).selectOption(String(version));await page.getByRole('button',{name:'Xem khác biệt',exact:true}).click();await page.getByText('Sau: Nội dung bản mới',{exact:true}).waitFor();
   await page.screenshot({path:path.resolve('../artifacts/v66-curriculum-diff.png'),fullPage:true});
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.resolve('../artifacts/v66-curriculum-mobile.png'),fullPage:true,animations:'disabled'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
   await page.getByRole('button',{name:'Khung năng lực',exact:true}).click();await page.getByRole('heading',{name:'Khung năng lực theo môn'}).waitFor();
   const frames=(await context().req('GET','/competency/frameworks')).data.frameworks,frame=frames.find(f=>f.code==='TEST-KHTN');
   await page.locator('select').filter({has:page.locator('option[value="'+frame.id+'"]')}).last().selectOption(String(frame.id));
   await page.getByText('Gán trục năng lực cho YCCĐ',{exact:true}).click();await page.getByRole('button',{name:'Tải danh mục YCCĐ'}).click();await page.getByLabel('YCCĐ ánh xạ',{exact:true}).selectOption(String(context().master.yccd_id));
   await page.getByLabel('Trọng số KHTN-C1',{exact:true}).fill('0.6');await page.getByLabel('Lý do mapping',{exact:true}).fill('Rà soát ánh xạ qua giao diện');await page.getByLabel('Xác nhận ánh xạ và trọng số đã được rà soát').check();await page.getByRole('button',{name:'Lưu mapping phiên bản'}).click();await page.getByText('Đã lưu phiên bản ánh xạ. Bài làm cũ giữ nguyên.').waitFor();
   await page.screenshot({path:path.resolve('../artifacts/v66-mapping-mobile.png'),fullPage:true});
   await page.goto('http://127.0.0.1:3103/practice/students/'+context().users.student+'/portfolio?tab=competency');await page.getByLabel('Môn học',{exact:true}).selectOption(String(context().master.subject_id));await page.getByText('Nhập minh chứng rubric giáo viên',{exact:true}).click();
   await page.getByLabel('Trục minh chứng',{exact:true}).selectOption(String(frame.axes[1].id));await page.getByLabel('Hoạt động / sản phẩm',{exact:true}).fill('Quan sát thí nghiệm qua giao diện');await page.getByLabel('Mức đạt quan sát (%)',{exact:true}).fill('80');await page.getByLabel('Thời điểm quan sát',{exact:true}).fill('2026-01-01T09:00');await page.getByLabel('Căn cứ / lý do',{exact:true}).fill('Rubric quan sát cá nhân');await page.getByLabel('Tôi xác nhận minh chứng cá nhân và mức đạt đã được kiểm tra').check();
   await page.getByRole('button',{name:'Ghi minh chứng',exact:true}).click();await page.getByText('Tìm hiểu tự nhiên — xem minh chứng',{exact:true}).click();await page.getByText('Quan sát thí nghiệm qua giao diện',{exact:true}).waitFor();
   const studentPage=await browser.newPage({viewport:{width:390,height:844}});studentPage.on('pageerror',e=>errors.push(e.message));
   await studentPage.goto('http://127.0.0.1:3103/login');await studentPage.getByPlaceholder('admin').fill('v63_student');await studentPage.locator('input[type=password]').fill(pw);await studentPage.getByRole('button',{name:'Đăng nhập',exact:true}).click();await studentPage.waitForURL('http://127.0.0.1:3103/practice');
   await studentPage.goto('http://127.0.0.1:3103/practice/portfolio?tab=competency');await studentPage.getByRole('heading',{name:'Năng lực theo minh chứng'}).waitFor();await studentPage.getByLabel('Môn học',{exact:true}).selectOption(String(context().master.subject_id));await studentPage.getByText('Chưa đủ dữ liệu để vẽ radar đầy đủ.',{exact:false}).waitFor();
   await studentPage.screenshot({path:path.resolve('../artifacts/v66-student-competency-mobile.png'),fullPage:true});assert(await studentPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await studentPage.getByLabel('Phần hồ sơ',{exact:true}).selectOption('habits');await studentPage.getByRole('heading',{name:'Ngày học trong 30 ngày'}).waitFor();await studentPage.screenshot({path:path.resolve('../artifacts/v66-student-habits-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
  }finally{await browser.close();}
 });
}
