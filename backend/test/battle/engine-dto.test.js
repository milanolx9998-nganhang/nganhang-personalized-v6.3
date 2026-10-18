import test from 'node:test';
import assert from 'node:assert/strict';
import {standings,teamStandings,intersectScopes,voteDecision,badges} from '../../src/services/battle/engine.js';
import {roomDto,questionDto} from '../../src/services/battle/dto.js';
import {question} from './helpers.js';
const room=()=>({id:'room',run_id:'run',version:1,status:'playing',phase:'question',index:1,asked_count:2,kind:'duel',scope:{subject_id:1},players:[1,2,3].map(user_id=>({user_id,display_name:'Bạn '+user_id,team:user_id===1?1:2})),questions:[question('multiple_choice',0),question('multiple_choice',1),question('multiple_choice',2)],answers:[{idx:0,user_id:1,score:1,ms:100},{idx:0,user_id:2,score:1,ms:20},{idx:1,user_id:1,score:1,ms:1}],question_count:7});
test('Đồng hạng không phụ thuộc tốc độ hay mã tài khoản',()=>{const rows=standings(room(),1);assert.deepEqual(rows.map(p=>p.rank),[1,1,3]);});
test('Điểm đội giữ mẫu số cả người đã rời',()=>{const r=room();r.players[2].left_at=1;assert.equal(teamStandings(r,1)[1].points,50);});
test('Giao phạm vi cả nhóm, không dùng giao từng đôi',()=>{assert.equal(intersectScopes([{topic_ids:[1,2]},{topic_ids:[2,3]},{topic_ids:[1,3]}]),null);assert.deepEqual(intersectScopes([{}, {subject_id:1,topic_ids:[2,3]}, {subject_id:1,topic_ids:[3]}]),{subject_id:1,branch_id:null,topic_ids:[3]});});
test('Phiếu: nhất trí, đa số chốt sớm, hòa bốc thăm, danh sách đóng',()=>{
 const v={voters:[1,2,3],options:[{id:'a'},{id:'b'}],ballots:{1:'a',2:'a',4:'b'},deadline:100};
 assert.equal(voteDecision(v,1).winner,undefined);assert.equal(voteDecision(v,1,()=>0,true).winner,'a');
 v.ballots={1:'a',2:'b'};assert.equal(voteDecision(v,100,()=>.99).winner,'b');assert.equal(voteDecision(v,100).tied,true);
 v.ballots={};assert.equal(voteDecision(v,100).extend,true);v.extended=true;assert.equal(voteDecision(v,100).fallback,true);
});
test('Nhanh mà chắc: đúng ít nhất 80%, so thời gian trung bình câu đúng',()=>{const r=room();r.asked_count=5;r.answers=[];for(let idx=0;idx<5;idx++)for(let user_id=1;user_id<=3;user_id++)r.answers.push({idx,user_id,score:idx<(user_id===1?4:user_id===2?5:3)?1:0,ms:user_id===1?10:user_id===2?20:1});assert.deepEqual(badges(r).quick_and_sure,[1]);});
for(const phase of ['countdown','question','closing','paused','reveal','finished','interrupted'])test('DTO đúng pha '+phase,()=>{
 const r=room();r.phase=phase;if(['finished','interrupted'].includes(phase))r.status=phase;
 const dto=roomDto(r,{id:1,role:'student'},100),text=JSON.stringify(dto);
 assert.ok(!text.includes('Lời giải kín 2'));assert.ok(!text.includes('Câu 2'));
 if(['countdown','question','closing','paused'].includes(phase)){assert.ok(!text.includes('Lời giải kín'));assert.equal(dto.question.answer,undefined);assert.equal(dto.my_answer.score,undefined);assert.equal(dto.players[0].points,100);assert.equal(dto.distribution,undefined);}
 else if(phase==='reveal'){assert.equal(dto.question.answer.correct,'B');assert.equal(dto.players[0].points,200);}
 else{assert.equal(dto.questions.length,2);assert.equal(dto.players,undefined);assert.equal(dto.me.rank,1);}
});
test('Đếm ngược đầu ván không có câu chưa phát; giáo viên không có đáp án sớm',()=>{const r=room();r.kind='class';r.host_id=99;r.phase='countdown';r.index=-1;r.asked_count=0;const dto=roomDto(r,{id:99,role:'teacher'},100);assert.equal(dto.question,undefined);assert.equal(dto.players,undefined);});
test('DTO lồng nhau dùng danh sách cho phép, không sao chép trường tác giả',()=>{const q=question();q.content.options[0].answer='secret';q.content.blocks=[{type:'paragraph',text:'Đề',answer:'secret'}];const dto=questionDto(q);assert.ok(!JSON.stringify(dto).includes('secret'));});
