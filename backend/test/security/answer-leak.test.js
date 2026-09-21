import test from 'node:test';import assert from 'node:assert/strict';
import {canRevealAnswer} from '../../src/services/practice/answerRelease.js';
import {studentQuestion,studentAssignment} from '../../src/services/practice/studentDto.js';
test('Nộp xong không vượt NEVER/MANUAL/DEADLINE; practice được chốt từng câu',()=>{
 const a={assignment_id:'assigned',status:'completed',mode:'practice'},i={is_final:true};
 for(const policy of ['NEVER','MANUAL_RELEASE','AFTER_EACH_RESPONSE'])assert.equal(canRevealAnswer(a,i,{answer_release_policy:policy}),false);
 assert.equal(canRevealAnswer(a,i,{answer_release_policy:'AFTER_DEADLINE',closes_at:'2100-01-01'},Date.now()),false);
 assert.equal(canRevealAnswer(a,i,{answer_release_policy:'MANUAL_RELEASE',answers_released_at:'2020-01-01'}),true);
 assert.equal(canRevealAnswer({...a,status:'in_progress'},i,{answer_release_policy:'AFTER_SUBMIT'}),false);
 assert.equal(canRevealAnswer({mode:'practice',status:'in_progress'},i),true);
});
test('DTO allowlist không để lọt đáp án lồng phương án, block, hay fixed_versions',()=>{
 const sentinel='SECRET_ANSWER_CANARY';
 for(const type of ['multiple_choice','true_false','matching','short_answer','essay']){
  const row={id:'A',text:'Nội dung',correct:sentinel,answer:sentinel,rubric:sentinel};
  const dto=studentQuestion({type,stem:'Đề',answer:{correct:sentinel},explanation:sentinel,options:[row],statements:[row],left:[row],right:[row],blocks:[{type:'paragraph',text:'Đoạn',answer:sentinel},{type:'solution',text:sentinel}]});
  assert(!JSON.stringify(dto).includes(sentinel),type);
 }
 assert(!JSON.stringify(studentAssignment({id:1,config:{count:10,answer:sentinel},fixed_versions:[sentinel],share_token:sentinel,curriculum_snapshot:sentinel})).includes(sentinel));
});
