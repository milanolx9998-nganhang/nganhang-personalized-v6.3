import test from 'node:test';import assert from 'node:assert/strict';
export function registerV653(context){
 test('V653: ủy quyền quản lý hồ sơ theo tổ, không tự nâng quyền hoặc chiếm Admin',async()=>{
  const {req,users,db,pw,master}=context(),department=(await db.query('SELECT department_id FROM subjects WHERE id=$1',[master.subject_id])).rows[0].department_id;
  const base={capability:'staff.manage',effect:'ALLOW',scope_type:'DEPARTMENT',scope_payload:{department_ids:[department]},reason:'Ủy quyền quản lý hồ sơ trong tổ kiểm thử',confirmed:true};
  assert.equal((await req('POST',`/staff/${users.teacher}/capability-overrides`,{...base,confirmed:false})).status,400);
  assert.equal((await req('POST',`/staff/${users.admin}/capability-overrides`,base)).status,403);
  const grant=await req('POST',`/staff/${users.teacher}/capability-overrides`,base);assert.equal(grant.status,201,JSON.stringify(grant.data));
  const target=await req('POST','/staff',{username:'v653_managed',full_name:'Nhân sự cùng tổ',password:pw,department_id:department},'teacher');assert.equal(target.status,201,JSON.stringify(target.data));
  assert.equal((await req('GET',`/staff/${target.data.id}/access`,undefined,'teacher')).status,200);
  assert.equal((await req('GET',`/staff/${users.admin}/access`,undefined,'teacher')).status,403);
  assert.equal((await req('POST',`/staff/${users.admin}/reset-password`,{password:pw,reason:'Chiếm quyền admin'},'teacher')).status,403);
  assert.equal((await req('POST',`/staff/${users.teacher}/capability-overrides`,{...base,capability:'system.config',scope_type:'WHOLE_SCHOOL',scope_payload:{}},'teacher')).status,403);
  assert.equal((await req('PUT',`/staff/${target.data.id}/assignments`,{},'teacher')).status,403);
  assert.equal((await req('POST','/staff',{username:'v653_outside',full_name:'Ngoài tổ',password:pw},'teacher')).status,403);
  const list=await req('GET','/staff',undefined,'teacher');assert.equal(list.status,200);assert(list.data.some(u=>u.id===target.data.id));assert(!list.data.some(u=>u.role==='admin'));
  assert.equal((await req('POST',`/staff/${target.data.id}/reset-password`,{password:pw,reason:'Đổi mật khẩu nhân sự được phân công'},'teacher')).status,200);
  const privileged=await req('POST',`/staff/${target.data.id}/capability-overrides`,{...base,capability:'content.approve',scope_type:'WHOLE_SCHOOL',scope_payload:{}});
  assert.equal(privileged.status,201);
  assert.equal((await req('POST',`/staff/${target.data.id}/reset-password`,{password:pw,reason:'Không được chiếm người duyệt'},'teacher')).status,403);
  assert.equal((await req('DELETE',`/staff/${target.data.id}/capability-overrides/${privileged.data.id}`,{reason:'Kết thúc kiểm tra quyền cao hơn'})).status,200);
  const config=await req('POST',`/staff/${users.teacher}/capability-overrides`,{...base,capability:'system.config',scope_type:'WHOLE_SCHOOL',scope_payload:{}});assert.equal(config.status,201);
  assert.equal((await req('PUT','/practice/settings',{practice_default_questions:20},'teacher')).status,200);
  for(const id of [grant.data.id,config.data.id])assert.equal((await req('DELETE',`/staff/${users.teacher}/capability-overrides/${id}`,{reason:'Kết thúc kiểm thử ủy quyền'})).status,200);
  assert.equal((await req('GET','/staff',undefined,'teacher')).status,403);
 });
 test('V653: mẫu quyền chỉ lưu cấu hình, apply vẫn qua preview và confirmation',async()=>{
  const {req,master}=context();
  const r=await req('POST','/staff/permission-templates',{name:'Mẫu STEM thử nghiệm',definition:{bundle:'AUTHOR',capabilities:['content.read','content.write'],scope_type:'SUBJECT',scope_payload:{subject_ids:[master.subject_id]},effect:'ALLOW'},reason:'Lưu mẫu phục vụ kiểm thử'});
  assert.equal(r.status,201,JSON.stringify(r.data));assert((await req('GET','/staff/permission-templates')).data.some(t=>t.id===r.data.id));
  assert.equal((await req('GET','/staff/permission-templates',undefined,'teacher')).status,403);
 });
}
