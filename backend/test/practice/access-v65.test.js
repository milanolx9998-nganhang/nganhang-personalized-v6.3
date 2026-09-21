import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAccess,decide,bankDecision} from '../../src/services/access/policy.js';
const now='2026-09-17';
const org={subjects:[{id:5,department_id:3},{id:6,department_id:3},{id:7,department_id:4}],classes:[{id:101,grade:7,school_year_id:1},{id:102,grade:7,school_year_id:1},{id:103,grade:8,school_year_id:1},{id:104,grade:10,school_year_id:1}],years:[{id:1,start_date:'2026-08-01',end_date:'2027-07-31'}],banks:[{id:10,kind:'department',department_id:3},{id:11,kind:'personal',owner_id:99},{id:12,kind:'school'}]};
const pos=(type,payload,scope_type='CUSTOM',extra={})=>({id:1,type,scope_type,scope_payload:payload,...extra});
const access=(positions,overrides=[],user={id:2,role:'teacher',access_managed:true})=>buildAccess({user,positions,overrides,org,now});
const allowed=(a,key,context)=>decide(a,key,context).allowed;
test('V65: GVCN quản lý/reset đúng lớp, không sửa nội dung hoặc chuyển lớp',()=>{
 const a=access([pos('HOMEROOM',{class_ids:[101],school_year_id:1},'CLASS')]);
 for(const key of ['student.read','student.manage_basic','student.reset_password','learning.read'])assert.equal(allowed(a,key,{classId:101,subjectId:7}),true,key);
 for(const key of ['student.reset_password','student.manage_basic'])assert.equal(allowed(a,key,{classId:102}),false,key);
 for(const key of ['content.write','content.review','student.transfer','student.disable'])assert.equal(allowed(a,key,{classId:101,subjectId:7}),false,key);
});
test('V652 SECURITY_RESTRICTION_EXPECTED: GV đúng môn × lớp, nội dung theo khối được giao',()=>{
 const a=access([pos('SUBJECT_TEACHER',{subject_ids:[5],class_ids:[101],school_year_id:1})]);
 assert.equal(allowed(a,'learning.read',{subjectId:5,classId:101}),true);
 assert.equal(allowed(a,'learning.read',{subjectId:5,classId:102}),false);
 assert.equal(allowed(a,'learning.read',{subjectId:7,classId:101}),false);
 assert.equal(allowed(a,'content.write',{subjectId:5,grade:9}),false);
 assert.equal(allowed(a,'content.write',{subjectId:5,grade:7}),true);
 assert.equal(allowed(a,'content.write',{subjectId:7}),false);
 assert.equal(allowed(a,'student.reset_password',{classId:101}),false);
});
test('V65: nhiều vị trí hợp quyền, không tạo tích Descartes môn/lớp',()=>{
 const a=access([pos('SUBJECT_TEACHER',{subject_ids:[5],class_ids:[103],school_year_id:1}),pos('HOMEROOM',{class_ids:[101]},'CLASS')]);
 assert.equal(allowed(a,'learning.read',{subjectId:7,classId:101}),true);
 assert.equal(allowed(a,'learning.read',{subjectId:7,classId:103}),false);
 assert.equal(allowed(a,'learning.read',{subjectId:5,classId:102}),false);
});
test('V65: khối trưởng chỉ đọc khối; BGH THCS không duyệt mặc định',()=>{
 const a=access([pos('GRADE_LEADER',{grade_ids:[7],school_year_id:1},'GRADE')]);
 assert.equal(allowed(a,'learning.read',{classId:101,subjectId:7}),true);
 assert.equal(allowed(a,'learning.read',{classId:103,subjectId:7}),false);
 assert.equal(allowed(a,'content.approve',{subjectId:5,grade:7}),false);
 const b=access([pos('BOARD',{school_level:'THCS'},'SCHOOL_LEVEL')]);
 assert.equal(allowed(b,'content.read',{subjectId:7,grade:9}),true);
 assert.equal(allowed(b,'content.read',{subjectId:7,grade:10}),false);
 assert.equal(allowed(b,'content.approve',{subjectId:5,grade:7}),false);
});
test('V65: ALLOW đúng phạm vi, DENY thắng và không lan sang môn khác',()=>{
 const a=access([pos('DEPT_LEADER',{department_ids:[3]},'DEPARTMENT')],[{id:1,capability:'content.approve',effect:'DENY',scope_type:'SUBJECT',scope_payload:{subject_ids:[6],grade_ids:[9]}}]);
 assert.equal(allowed(a,'content.approve',{subjectId:5,grade:9}),true);
 assert.equal(allowed(a,'content.approve',{subjectId:6,grade:9}),false);
 assert.equal(allowed(a,'content.approve',{subjectId:6,grade:8}),true);
 const b=access([pos('BOARD',{},'WHOLE_SCHOOL')],[{capability:'content.approve',effect:'ALLOW',scope_type:'DEPARTMENT',scope_payload:{department_ids:[3]}}]);
 assert.equal(allowed(b,'content.approve',{subjectId:5}),true);
 assert.equal(allowed(b,'content.approve',{subjectId:7}),false);
});
test('V65: ngày hết hạn/năm học đóng không cấp quyền; scope rỗng không là ALL',()=>{
 for(const p of [pos('HOMEROOM',{class_ids:[101]},'CLASS',{valid_to:'2026-09-16'}),pos('BOARD',{},'CUSTOM'),pos('HOMEROOM',{class_ids:[]},'CLASS')])assert.equal(allowed(access([p]),'student.read',{classId:101}),false);
 const a=buildAccess({user:{id:2,role:'teacher',access_managed:true},positions:[pos('HOMEROOM',{class_ids:[101],school_year_id:1},'CLASS')],org:{...org,years:[{id:1,end_date:'2026-09-16'}]},now});
 assert.equal(allowed(a,'student.reset_password',{classId:101}),false);
});
test('V65: ADMIN vượt DENY; học sinh không trở thành nhân sự nhờ payload',()=>{
 const denied={capability:'content.write',effect:'DENY',scope_type:'WHOLE_SCHOOL',scope_payload:{}};
 assert.equal(allowed(access([],[denied],{id:1,role:'admin'}),'content.write',{subjectId:7}),true);
 assert.equal(allowed(access([pos('BOARD',{},'WHOLE_SCHOOL')],[],{id:1,role:'student'}),'content.read',{subjectId:7}),false);
});
test('V65: scope giao, context lớp/môn dùng tổ chức thật thay vì dữ liệu giả',()=>{
 const a=access([pos('BOARD',{grade_ids:[7],department_ids:[3]},'CUSTOM')]);
 assert.equal(allowed(a,'learning.read',{classId:103,subjectId:7,grade:7,departmentId:3}),false);
 assert.equal(allowed(a,'learning.read',{classId:101,subjectId:5}),true);
});
test('V65: kho tổ / ACL chéo / kho lạ; DENY kho cụ thể',()=>{
 const a=access([pos('DEPT_LEADER',{department_ids:[3]},'DEPARTMENT')]);
 assert.equal(bankDecision(a,'review',org.banks[0]).allowed,true);
 assert.equal(bankDecision(a,'read',org.banks[1]).allowed,false);
 a.memberships=[{bank_id:11,permission:'read'}];
 assert.equal(bankDecision(a,'read',org.banks[1]).allowed,true);
 assert.equal(bankDecision(a,'write',org.banks[1]).allowed,false);
 a.overrides=[{capability:'bank.read',effect:'DENY',scope_type:'BANK',scope_payload:{bank_ids:[11]}}];
 assert.equal(bankDecision(a,'read',org.banks[1]).allowed,false);
 assert.equal(bankDecision(a,'read',org.banks[2]).allowed,true);
});
test('V65: giải thích quyền có nguồn và DENY khớp',()=>{
 const a=access([pos('HOMEROOM',{class_ids:[101]},'CLASS')]);
 const d=decide(a,'student.reset_password',{classId:101});
 assert.equal(d.sources[0].type,'POSITION');assert.equal(d.capability,'student.reset_password');
 assert.equal(decide(a,'made.up',{classId:101}).allowed,false);
});
