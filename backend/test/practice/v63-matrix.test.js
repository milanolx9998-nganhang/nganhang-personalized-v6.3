import test from 'node:test';
import assert from 'node:assert/strict';
import {autoDistribute,redistribute,totalScoreOf} from '../../src/services/matrixBalancer.js';
const levels=['M1','M2','M3','M4'];
const scores=cells=>levels.map(l=>Math.round(cells.filter(c=>c.cognitive_level===l).reduce((s,c)=>s+c.question_count*c.score_per_question,0)*100)/100);
test('V6.3 tỷ lệ theo ĐIỂM, không nhân thiên lệch loại câu',()=>{
 const cells=autoDistribute({totalScore:10,ratios:[30,30,20,20],branchConfigs:[{branch_code:'T',score:10,tn:24,ds:8,tl:0}]});
 assert.equal(totalScoreOf(cells),10);assert.deepEqual(scores(cells),[3,3,2,2]);
});
test('V6.3 phối hợp các dạng để đạt mục tiêu có thể đạt',()=>{
 const cells=autoDistribute({totalScore:10,ratios:[30,30,20,20],branchConfigs:[{branch_code:'T',score:10,tn:20,ds:6,tln:4,tl:0}]});
 assert.deepEqual(scores(cells),[3,3,2,2]);
});
test('V6.3 cấu hình rời rạc không thể đủ tỷ lệ vẫn giữ tổng và số câu',()=>{
 const cells=autoDistribute({totalScore:1,ratios:[30,30,20,20],branchConfigs:[{branch_code:'T',score:1,tn:4}]});
 assert.equal(totalScoreOf(cells),1);assert.notDeepEqual(scores(cells),[.3,.3,.2,.2]);
});
test('V6.3 giữ nguyên ô khóa và bù tỷ lệ từ phần chưa khóa',()=>{
 const locked={branch_code:'T',q_type:'mcq4',cognitive_level:'M1',question_count:12,score_per_question:.25,is_locked:true};
 const cells=redistribute({cells:[locked],totalScore:10,ratios:[30,30,20,20],branchConfigs:[{branch_code:'T',score:10,tn:24,ds:8}]});
 assert.deepEqual(cells.find(c=>c.is_locked),locked);assert.deepEqual(scores(cells),[3,3,2,2]);
});
test('V6.3 không nhận tỷ lệ âm dù tổng bằng 100',()=>{
 assert.throws(()=>autoDistribute({totalScore:10,ratios:[-10,60,30,20],branchConfigs:[{score:10,tn:40}]}));
});
