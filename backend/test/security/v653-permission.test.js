import test from 'node:test';
import assert from 'node:assert/strict';
import {access,position} from './fixtures.js';
import {decide} from '../../src/services/access/policy.js';
import {validateDelegation} from '../../src/services/access/delegation.js';
test('V653: chỉ Admin cấp quyền, không tự cấp và phải xác nhận SUPER_HIGH_RISK',()=>{
 const d={capability:'staff.manage',scope_type:'DEPARTMENT',scope_payload:{department_ids:[1]},confirmed:true};
 assert.doesNotThrow(()=>validateDelegation({id:1,role:'admin'},2,d));
 assert.throws(()=>validateDelegation({id:1,role:'teacher'},2,d));
 assert.throws(()=>validateDelegation({id:1,role:'admin'},1,d));
 assert.throws(()=>validateDelegation({id:1,role:'admin'},2,{...d,confirmed:false}));
 assert.throws(()=>validateDelegation({id:1,role:'admin'},2,{...d,capability:'system.config'}));
});
test('V653: BGH chuyên môn có đáp án đúng scope, BGH giám sát không có',()=>{
 for(const type of ['BOARD_PROFESSIONAL','BOARD']){
  const a=access([position(type,{subject_ids:[5],grade_ids:[8]})]);
  assert.equal(decide(a,'content.view_answer',{subjectId:5,grade:8}).allowed,type==='BOARD_PROFESSIONAL');
  assert.equal(decide(a,'content.view_answer',{subjectId:5,grade:9}).allowed,false);
 }
});
test('V653: quyền nghiệp vụ nhạy cảm được ủy quyền theo scope, DENY vẫn thắng',()=>{
 const grant={capability:'staff.manage',effect:'ALLOW',scope_type:'DEPARTMENT',scope_payload:{department_ids:[1]}};
 assert.equal(decide(access([],[grant]),'staff.manage',{departmentId:1}).allowed,true);
 assert.equal(decide(access([],[grant]),'staff.manage',{departmentId:2}).allowed,false);
 assert.equal(decide(access([],[grant,{...grant,effect:'DENY'}]),'staff.manage',{departmentId:1}).allowed,false);
 assert.equal(decide(access([],[]),'root.secret.manage').allowed,false);
});
