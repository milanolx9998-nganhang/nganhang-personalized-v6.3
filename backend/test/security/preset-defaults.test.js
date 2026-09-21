import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAssignments} from '../../src/services/access/staff.js';
import {decide} from '../../src/services/access/policy.js';
import {org,access,position} from './fixtures.js';
test('Tổ trưởng/BGH không bị buộc hết hạn theo năm học',()=>{
 const d=normalizeAssignments({school_year_id:1,teaching:[],positions:[{type:'BOARD_PROFESSIONAL',scope_type:'WHOLE_SCHOOL',scope_payload:{}}]},org,'2026-09-17');
 assert.equal(d.assignments[0].school_year_id,null);
 assert.equal(d.assignments[0].valid_to,null);
 assert.equal(d.assignments[0].scope_payload.school_year_id,undefined);
});
test('GV/GVCN vẫn gắn năm học, BGH chuyên môn duyệt và xem đáp án theo V653',()=>{
 const d=normalizeAssignments({school_year_id:1,teaching:[{subject_id:5,class_ids:[103]}],positions:[{type:'HOMEROOM',class_ids:[101]}]},org,'2026-09-17');
 for(const p of d.assignments){assert.equal(p.school_year_id,1);assert.equal(p.valid_to,'2027-07-31');}
 const a=access([position('BOARD_PROFESSIONAL',{}, {scope_type:'WHOLE_SCHOOL'})]);
 assert.equal(decide(a,'content.approve',{subjectId:5,grade:8}).allowed,true);
 assert.equal(decide(a,'content.view_answer',{subjectId:5,grade:8}).allowed,true);
});
test('Quyền hạ tầng không nằm trong UI nghiệp vụ',()=>{
 for(const capability of ['root.secret.manage','root.database.manage']){
  const a=access([],[{capability,effect:'ALLOW',scope_type:'WHOLE_SCHOOL',scope_payload:{}}]);
  assert.equal(decide(a,capability).allowed,false);
 }
});
