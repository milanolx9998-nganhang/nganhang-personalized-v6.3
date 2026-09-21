import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {chromium} from 'playwright';
export function registerV65(context){
 let staff,year,classes,subjects,department,otherDepartment,student,token,assignmentBody;
 const expect=(r,s)=>assert.equal(r.status,s,JSON.stringify(r.data));
 const request=async(method,url,body)=>{const {origin}=context();const r=await fetch(origin+'/api'+url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const explain=async(capability,c)=>{const r=await context().req('POST','/access/explain',{user_id:staff.id,capability,context:c});expect(r,200);return r.data.allowed;};
 test('V65 API: tài khoản nhân sự chuẩn hóa, phân công nguyên tử và chống giả role',async()=>{
  const {db,req,pw,origin}=context();
  department=(await db.query("INSERT INTO departments(code,name) VALUES('V65_KHCN','Tổ Khoa học — kiểm thử') RETURNING id")).rows[0].id;
  otherDepartment=(await db.query("INSERT INTO departments(code,name) VALUES('V65_TOAN','Tổ Toán — kiểm thử') RETURNING id")).rows[0].id;
  subjects=[];for(const [code,name,dep] of [['V65_VL','Vật lí — kiểm thử',department],['V65_HH','Hóa học — kiểm thử',department],['V65_TOAN','Toán — kiểm thử',otherDepartment]])subjects.push((await db.query('INSERT INTO subjects(code,name,department_id) VALUES($1,$2,$3) RETURNING id',[code,name,dep])).rows[0].id);
  year=(await db.query("INSERT INTO school_years(name,start_date,end_date) VALUES('V65 Kiểm thử',CURRENT_DATE-100,CURRENT_DATE+365) RETURNING id")).rows[0].id;
  classes=[];for(const [name,grade] of [['7A V65',7],['7B V65',7],['8A V65',8],['10A V65',10]])classes.push((await db.query('INSERT INTO classes(name,grade,school_year_id) VALUES($1,$2,$3) RETURNING id',[name,grade,year])).rows[0].id);
  expect(await req('POST','/staff',{username:'v65_bad',full_name:'Không được nâng quyền',password:pw,role:'admin'}),400);
  const created=await req('POST','/staff',{username:'v65_staff',full_name:'Giáo viên đa nhiệm V6.5',password:pw,department_id:department});expect(created,201);staff=created.data;
  await db.query('UPDATE users SET must_change_password=false WHERE id=$1',[staff.id]);
  const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'v65_staff',password:pw})});token=(await login.json()).token;assert(token);
  const me=await request('GET','/auth/me');expect(me,200);assert.equal(me.data.account_type,'STAFF');assert.equal(me.data.capabilities['content.write'],false);
  assignmentBody={school_year_id:year,positions:[{type:'HOMEROOM',class_ids:[classes[0]]}],teaching:[{subject_id:subjects[0],class_ids:[classes[2]]}]};
  expect(await req('PUT',`/staff/${staff.id}/assignments`,assignmentBody),200);
  expect(await request('PUT',`/staff/${staff.id}/assignments`,assignmentBody),403);
  expect(await req('POST','/practice/bank-permissions',{bank_id:context().school,user_id:context().users.student,permission:'read'}),400);
  const before=(await db.query('SELECT count(*) FROM staff_position_assignments WHERE user_id=$1',[staff.id])).rows[0].count;
  expect(await req('PUT',`/staff/${staff.id}/assignments`,{...assignmentBody,positions:[{type:'HOMEROOM',class_ids:[99999999]}]}),400);
  assert.equal((await db.query('SELECT count(*) FROM staff_position_assignments WHERE user_id=$1',[staff.id])).rows[0].count,before);
  expect(await req('PUT',`/staff/${context().users.student}/assignments`,assignmentBody),400);
 });
 test('V65 API: hợp vị trí nhưng không mở rộng môn × lớp; GVCN reset đúng lớp',async()=>{
  const {req}=context();assert(await explain('learning.read',{subjectId:subjects[2],classId:classes[0]}));
  assert(await explain('learning.read',{subjectId:subjects[0],classId:classes[2]}));
  assert.equal(await explain('learning.read',{subjectId:subjects[2],classId:classes[2]}),false);
  assert.equal(await explain('learning.read',{subjectId:subjects[0],classId:classes[1]}),false);
  assert.equal(await explain('content.write',{subjectId:subjects[0],grade:9}),false);assert(await explain('content.write',{subjectId:subjects[0],grade:8}));
  assert.equal(await explain('content.write',{subjectId:subjects[2],grade:7}),false);
  const created=await request('POST','/practice/students',{student_code:'v65_student',full_name:'Học sinh V65',class_id:classes[0]});expect(created,201);student=created.data.id;
  expect(await request('POST',`/practice/students/${student}/reset-password`,{}),200);
  expect(await request('POST',`/practice/students/${student}/transfer`,{class_id:classes[1]}),403);
  expect(await req('POST',`/practice/students/${student}/transfer`,{class_id:classes[1]}),200);
  expect(await request('POST',`/practice/students/${student}/reset-password`,{}),403);
  expect(await request('GET',`/practice/classes/${classes[1]}/dashboard`),403);
  expect(await request('GET',`/practice/classes/${classes[2]}/dashboard?subject_id=${subjects[2]}`),403);
 });
 test('V65 API: BGH THCS chỉ đọc, ALLOW tổ KHCN, DENY Hóa khối 9 và thu hồi ngay',async()=>{
  const {req}=context();assignmentBody={school_year_id:year,positions:[{type:'BOARD',scope_type:'SCHOOL_LEVEL',scope_payload:{school_level:'THCS'}}],teaching:[]};expect(await req('PUT',`/staff/${staff.id}/assignments`,assignmentBody),200);
  assert(await explain('content.read',{subjectId:subjects[0],grade:9}));assert.equal(await explain('content.read',{subjectId:subjects[0],grade:10}),false);
  assert.equal(await explain('content.approve',{subjectId:subjects[0],grade:9}),false);
  const allow={capability:'content.approve',effect:'ALLOW',scope_type:'DEPARTMENT',scope_payload:{department_ids:[department]},reason:'Phụ trách duyệt tổ Khoa học',confirmed:true};
  expect(await req('POST',`/staff/${staff.id}/capability-overrides`,{...allow,confirmed:false}),400);
  expect(await req('POST',`/staff/${staff.id}/capability-overrides`,allow),201);expect(await req('POST',`/staff/${staff.id}/capability-overrides`,allow),409);
  assert(await explain('content.approve',{subjectId:subjects[0],grade:9}));assert.equal(await explain('content.approve',{subjectId:subjects[2],grade:9}),false);
  const denied=await req('POST',`/staff/${staff.id}/capability-overrides`,{capability:'content.approve',effect:'DENY',scope_type:'SUBJECT',scope_payload:{subject_ids:[subjects[1]],grade_ids:[9]},reason:'Chờ rà soát nội dung Hóa 9'});expect(denied,201);
  assert.equal(await explain('content.approve',{subjectId:subjects[1],grade:9}),false);assert(await explain('content.approve',{subjectId:subjects[0],grade:9}));assert(await explain('content.approve',{subjectId:subjects[1],grade:8}));
  expect(await req('DELETE',`/staff/${staff.id}/capability-overrides/${denied.data.id}`,{reason:'Đã hoàn thành rà soát'}),200);assert(await explain('content.approve',{subjectId:subjects[1],grade:9}));
 });
 test('V65 API: gỡ phân công thu hồi lớp và khối nội dung không còn được giao, giữ lịch sử',async()=>{
  const {req,db}=context();const body={school_year_id:year,positions:[],teaching:[{subject_id:subjects[0],class_ids:[classes[0],classes[2]]}]};expect(await req('PUT',`/staff/${staff.id}/assignments`,body),200);
  expect(await req('PUT',`/staff/${staff.id}/assignments`,{...body,teaching:[{subject_id:subjects[0],class_ids:[classes[2]]}]}),200);
  assert.equal(await explain('learning.read',{subjectId:subjects[0],classId:classes[0]}),false);assert.equal(await explain('content.write',{subjectId:subjects[0],grade:7}),false);assert(await explain('content.write',{subjectId:subjects[0],grade:8}));
  assert((await db.query('SELECT 1 FROM staff_position_assignments WHERE user_id=$1 AND revoked_at IS NOT NULL',[staff.id])).rowCount>0);
  const detail=await req('GET',`/staff/${staff.id}/access?school_year_id=${year}`);expect(detail,200);assert(detail.data.history.some(h=>h.action==='POSITION_REVOKED'));
  expect(await req('PUT',`/staff/${staff.id}/assignments`,{...body,expected_access_version:0}),409);
 });
 test('V65 API: scope rỗng, năm học sai, hết hạn và metadata không hồi sinh quyền',async()=>{
  const {req,db}=context();expect(await req('PUT',`/staff/${staff.id}/assignments`,{school_year_id:year,positions:[{type:'BOARD',scope_type:'CUSTOM',scope_payload:{}}],teaching:[]}),400);
  const oldClass=(await db.query('SELECT id FROM classes WHERE school_year_id<>$1 LIMIT 1',[year])).rows[0];assert(oldClass);
  expect(await req('PUT',`/staff/${staff.id}/assignments`,{school_year_id:year,positions:[{type:'HOMEROOM',class_ids:[oldClass.id]}],teaching:[]}),400);
  await db.query("UPDATE staff_position_assignments SET valid_from=CURRENT_DATE-2,valid_to=CURRENT_DATE-1 WHERE user_id=$1 AND revoked_at IS NULL",[staff.id]);
  await db.query('UPDATE users SET subject_id=$1,department_id=$2 WHERE id=$3',[subjects[0],department,staff.id]);
  assert.equal(await explain('content.write',{subjectId:subjects[0],grade:7}),false);
  const detail=await req('GET',`/staff/${staff.id}/access?school_year_id=${year}`);assert(detail.data.positions.length>0);
 });
 test('V65 API: viewer có ALLOW được ghi đúng môn; DENY reset độc lập sửa hồ sơ',async()=>{
  const {req,db}=context();await db.query("UPDATE users SET role='viewer' WHERE id=$1",[staff.id]);
  const body={school_year_id:year,positions:[{type:'HOMEROOM',class_ids:[classes[1]]}],teaching:[]};expect(await req('PUT',`/staff/${staff.id}/assignments`,body),200);
  expect(await request('POST',`/practice/students/${student}/reset-password`,{}),200);
  expect(await req('POST',`/staff/${staff.id}/capability-overrides`,{capability:'student.reset_password',effect:'DENY',scope_type:'CLASS',scope_payload:{class_ids:[classes[1]]},reason:'Giao bộ phận hỗ trợ đặt lại mật khẩu'}),201);
  expect(await request('POST',`/practice/students/${student}/reset-password`,{}),403);
  assert(await explain('student.manage_basic',{studentId:student}));
  const listed=await request('GET','/practice/students?search=v65_student');expect(listed,200);assert.equal(listed.data.students[0].permissions.manage_basic,true);assert.equal(listed.data.students[0].permissions.reset_password,false);
  expect(await req('POST',`/staff/${staff.id}/capability-overrides`,{capability:'content.write',effect:'ALLOW',scope_type:'SUBJECT',scope_payload:{subject_ids:[subjects[0]]},reason:'Hỗ trợ biên soạn thử nghiệm'}),201);
  const q=await request('POST','/practice/questions',{subject_id:subjects[0],grade:7,stem:'Câu nháp kiểm thử V65',type:'short_answer',answer:{numeric:1},cognitive_level:1});expect(q,201);
  expect(await request('POST','/practice/questions',{subject_id:subjects[2],grade:7,stem:'Không được tạo',type:'short_answer',answer:{numeric:1},cognitive_level:1}),403);
 });
 test('V65 API: DENY lọc cả danh sách/báo cáo; không lộ đáp án hoặc kho qua URL trực tiếp',async()=>{
  const {req,db,school}=context();
  await db.query('UPDATE user_capability_overrides SET revoked_at=now() WHERE user_id=$1',[staff.id]);
  expect(await req('PUT',`/staff/${staff.id}/assignments`,{school_year_id:year,positions:[{type:'BOARD',scope_type:'WHOLE_SCHOOL',scope_payload:{}}],teaching:[]}),200);
  const questions=[];
  for(const grade of [7,9]){const r=await req('POST','/practice/questions',{subject_id:subjects[0],grade,stem:'Câu kiểm tra bảo mật V65 '+grade,type:'short_answer',answer:{numeric:6543},cognitive_level:1,bank_id:school});expect(r,201);questions.push(r.data);}
  expect(await req('POST',`/staff/${staff.id}/capability-overrides`,{capability:'content.read',effect:'DENY',scope_type:'SUBJECT',scope_payload:{subject_ids:[subjects[0]],grade_ids:[9]},reason:'Không đọc nội dung Vật lí 9'}),201);
  expect(await request('GET','/questions/'+questions[1].id),403);
  const list=await request('GET','/practice/questions?subject_id='+subjects[0]);expect(list,200);assert(!list.data.some(q=>q.id===questions[1].id));assert(list.data.some(q=>q.id===questions[0].id));
  const stats=await request('GET','/reports/questions/stats');expect(stats,200);assert(!stats.data.some(r=>r.code==='V65_VL'&&r.grade===9));
  expect(await req('POST',`/staff/${staff.id}/capability-overrides`,{capability:'content.view_answer',effect:'DENY',scope_type:'SUBJECT',scope_payload:{subject_ids:[subjects[0]],grade_ids:[7]},reason:'Chỉ được xem đề, không xem đáp án'}),201);
  const detail=await request('GET','/questions/'+questions[0].id);expect(detail,200);assert.equal(detail.data.answer_hidden,true);assert.equal(/(?:[:\[,]\s*6543\s*[,}\]]|"6543")/.test(JSON.stringify(detail.data)),false);
  expect(await request('GET',`/practice/questions/${questions[0].id}/compare`),403);
  expect(await request('GET',`/practice/questions/${questions[0].id}/versions`),403);
  expect(await request('GET','/practice/questions-export?subject_id='+subjects[0]),403);
  expect(await req('POST',`/staff/${staff.id}/capability-overrides`,{capability:'bank.read',effect:'DENY',scope_type:'BANK',scope_payload:{bank_ids:[school]},reason:'Tạm ngừng quyền đọc kho trường'}),201);
  expect(await request('GET','/questions/'+questions[0].id),403);
  const banks=await request('GET','/practice/banks');expect(banks,200);assert(!banks.data.some(b=>b.id===school));
  const blocked=await request('GET','/practice/questions?subject_id='+subjects[0]);expect(blocked,200);assert(!blocked.data.some(q=>questions.some(x=>x.id===q.id)));
 });
 test('V65 API: phân công hàng loạt nguyên tử và sao chép năm không mang ngoại lệ',async()=>{
  const {req,db,pw}=context();const second=await req('POST','/staff',{username:'v65_bulk',full_name:'Nhân sự nhận phân công hàng loạt',password:pw});expect(second,201);
  const pre=await req('POST','/staff/bulk-preview',{user_ids:[staff.id,second.data.id],school_year_id:year,subject_id:subjects[0],class_ids:[classes[2]],reason:'Phân công cùng môn đầu năm'});expect(pre,200);assert.equal(pre.data.items.length,2);
  const items=pre.data.items.map(({user_id,draft})=>({user_id,draft})),before=(await db.query('SELECT access_version FROM users WHERE id=$1',[staff.id])).rows[0].access_version;
  const stale=structuredClone(items);stale[1].draft.expected_access_version=-1;expect(await req('PUT','/staff/bulk-assignments',{items:stale}),409);
  assert.equal((await db.query('SELECT access_version FROM users WHERE id=$1',[staff.id])).rows[0].access_version,before);
  expect(await req('PUT','/staff/bulk-assignments',{items}),200);
  const target=(await db.query("INSERT INTO school_years(name,start_date,end_date) VALUES('V65 Năm tiếp theo',CURRENT_DATE+366,CURRENT_DATE+730) RETURNING id")).rows[0].id;
  const cls=(await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('9A V65 năm mới',9,$1) RETURNING id",[target])).rows[0].id;
  const copy={source_year_id:year,target_year_id:target,class_map:[{from:classes[2],to:cls}],reason:'Chuyển tiếp phân công năm mới'};
  expect(await req('POST',`/staff/${second.data.id}/copy-year-preview`,{...copy,class_map:[]}),400);
  const preview=await req('POST',`/staff/${second.data.id}/copy-year-preview`,copy);expect(preview,200);assert.equal(preview.data.overrides_copied,false);
  expect(await req('PUT',`/staff/${second.data.id}/assignments`,preview.data.draft),200);
  const future=(await db.query('SELECT * FROM staff_position_assignments WHERE user_id=$1 AND school_year_id=$2',[second.data.id,target])).rows;assert.equal(future.length,1);assert.deepEqual(future[0].scope_payload.class_ids,[cls]);
  expect(await req('POST',`/staff/${second.data.id}/copy-year-preview`,copy),400);
 });
 test('V65 UI: hồ sơ phân công, quyền hiệu lực, BGH và điều hướng không tràn',async()=>{
  const {req,origin,pw,dir}=context();expect(await req('PUT',`/staff/${staff.id}/assignments`,{school_year_id:year,positions:[{type:'HOMEROOM',class_ids:[classes[0]]},{type:'BOARD',scope_type:'SCHOOL_LEVEL',scope_payload:{school_level:'THCS'}}],teaching:[{subject_id:subjects[0],class_ids:[classes[2]]}]}),200);
  const b=await chromium.launch({headless:true});try{const p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/login');await p.getByPlaceholder('admin').fill('v63_admin');await p.locator('input[type=password]').fill(pw);await p.getByRole('button',{name:'Đăng nhập',exact:true}).click();await p.waitForURL(origin+'/');await p.goto(origin+'/admin/staff');await p.getByRole('heading',{name:'Nhân sự & phân công'}).waitFor();await p.getByRole('heading',{name:'Giáo viên đa nhiệm V6.5',exact:true}).waitFor();await p.screenshot({path:path.join(dir,'v6_5-staff-list.png'),fullPage:true});await p.goto(origin+'/admin/staff/'+staff.id);await p.getByRole('heading',{name:'Giáo viên đa nhiệm V6.5',exact:true}).waitFor();await p.getByLabel('Năm học',{exact:true}).selectOption(String(year));await p.getByRole('heading',{name:'Giáo viên bộ môn',exact:true}).waitFor();await p.locator('.staff-teaching').getByText('7B V65',{exact:true}).click();await p.getByRole('button',{name:'Xem tác động trước khi lưu',exact:true}).click();await p.getByRole('heading',{name:'Tác động thay đổi',exact:true}).waitFor();await p.getByRole('button',{name:'Lưu phân công',exact:true}).click();await p.getByRole('status').filter({hasText:'Đã lưu phân công'}).waitFor();const saved=await req('GET',`/staff/${staff.id}/access?school_year_id=${year}`);assert(saved.data.editable.teaching.some(t=>t.subject_id===subjects[0]&&t.class_ids.includes(classes[1])));await p.reload();await p.getByLabel('Năm học',{exact:true}).selectOption(String(year));await p.locator('.staff-teaching').waitFor();assert(await p.locator('.staff-teaching').getByLabel('7B V65',{exact:true}).isChecked());await p.screenshot({path:path.join(dir,'v6_5-staff-detail.png'),fullPage:true});await p.locator('.staff-teaching').screenshot({path:path.join(dir,'v6_5-subject-teacher-matrix.png')});await p.locator('article').filter({has:p.getByText('Giáo viên chủ nhiệm',{exact:true})}).screenshot({path:path.join(dir,'v6_5-homeroom.png')});await p.locator('article').filter({has:p.getByText('BGH giám sát',{exact:true})}).screenshot({path:path.join(dir,'v6_5-board-scope.png')});await p.getByRole('button',{name:'Quyền hiệu lực',exact:true}).click();await p.getByText('Sửa quyền chi tiết · Chỉ khi có ngoại lệ',{exact:true}).waitFor();await p.screenshot({path:path.join(dir,'v6_5-effective-capabilities.png'),fullPage:true});await p.getByRole('button',{name:/Quản trị nhà trường/}).click();await p.screenshot({path:path.join(dir,'v6_5-admin-navigation.png'),fullPage:true});await p.setViewportSize({width:390,height:844});await p.getByRole('button',{name:'Vị trí & phạm vi',exact:true}).click();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);}finally{await b.close();}
 });
}
