import test from 'node:test';import assert from 'node:assert/strict';
import {projectAxis,habitMetrics,subjectTemplates} from '../../src/services/competency/rules.js';
const config={minimum_evidence:5,minimum_confidence:30,target_evidence:20,target_active_days:4,recency:[1,.85,.7,.55],reliability:{AUTO_GRADED_ITEM:.8,PRACTICAL_TASK:1}},now='2026-09-21T10:00:00Z',axis={id:1,code:'A',name:'Nhận thức',allowed_evidence:['AUTO_GRADED_ITEM']};
test('V66 năng lực: weighted performance tách confidence, thiếu dữ liệu không phải 0',()=>{
 assert.equal(projectAxis(axis,[],config,now).performance_score,null);
 const evidence=[0,1].map((performance,i)=>({axis_id:1,performance,evidence_ref:String(i),mapping_weight:1,evidence_type:'AUTO_GRADED_ITEM',occurred_at:now}));
 const result=projectAxis(axis,evidence,config,now);assert.equal(result.performance_score,50);assert.equal(result.sufficient,false);assert.equal(result.evidence_count,2);
 assert.equal(projectAxis({...axis,allowed_evidence:['PRACTICAL_TASK']},evidence,config,now).evidence_count,0);
 assert.deepEqual(projectAxis(axis,evidence,config,now),projectAxis(axis,evidence.map(e=>({...e,streak:999,time_on_task:9999})),config,now));
});
test('V66 habits: idle và spam tự luyện bỏ dở không nâng chủ động; retry sửa sai được đếm',()=>{
 const spam=Array.from({length:20},()=>({started_at:now,status:'in_progress',source:'self_practice',answered_count:0,question_count:10}));
 assert.equal(habitMetrics(spam,config,now).indices.initiative,null);
 const done={started_at:now,completed_at:now,status:'completed',source:'self_practice',answered_count:5,question_count:5};
 assert.equal(habitMetrics([...spam,done],config,now).completion_rate,100);
 assert.equal(habitMetrics([{...done,source:'retry',retry_of:'original',corrected_count:1},{...done,source:'retry',retry_of:'original',corrected_count:1}],config,now).review_wrong_count,1);
});
test('V66 framework dùng trục môn học 3/5, không thêm hợp tác hoặc tính cách',()=>{
 assert.equal(subjectTemplates.KHTN.axes.length,3);assert.equal(subjectTemplates.MATH.axes.length,5);
 assert(subjectTemplates.MATH.axes.some(a=>a[1]==='Giao tiếp toán học'));
 assert(!JSON.stringify(subjectTemplates).includes('Giao tiếp và hợp tác'));
});

// V6.8.1 — quy tắc mặc định theo mức nhận thức cho câu chưa gắn năng lực riêng.
test('V681 quy tắc theo mức: mức của câu → thành phần năng lực và trọng số; trục ngoài khung hoặc trọng số 0 bị bỏ; luôn cho phép minh chứng tự chấm', async () => {
  const {levelEntries} = await import('../../src/services/competency/rules.js');
  const axes = [{id: 11, code: 'C1', allowed_evidence: ['TEACHER_RUBRIC']}, {id: 12, code: 'C2', allowed_evidence: ['AUTO_GRADED_ITEM']}, {id: 13, code: 'C3', allowed_evidence: []}];
  const rule = {1: {C1: 1}, 2: {C1: 0.7, C2: 0.3}, 3: {C2: 0.4, C3: 0.6, C9: 1}, 4: {C3: 0.8, C2: 0}};
  assert.deepEqual(levelEntries(rule, axes, 1).map(e => [e.axis_id, e.weight]), [[11, 1]]);
  assert.deepEqual(levelEntries(rule, axes, 2).map(e => [e.axis_id, e.weight]), [[11, 0.7], [12, 0.3]]);
  assert.deepEqual(levelEntries(rule, axes, 3).map(e => [e.axis_id, e.weight]), [[12, 0.4], [13, 0.6]]);
  assert.deepEqual(levelEntries(rule, axes, 4).map(e => [e.axis_id, e.weight]), [[13, 0.8]]);
  assert.ok(levelEntries(rule, axes, 1)[0].allowed_evidence.includes('AUTO_GRADED_ITEM'));
  assert.deepEqual(levelEntries(null, axes, 1), []);
  assert.deepEqual(levelEntries(rule, axes, null), []);
});
