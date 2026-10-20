import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,question} from './helpers.js';
import {normalizeModes,modeDefaults,answerPoints,rankEligible,settleFastest} from '../../src/services/battle/modes.js';
import {standings} from '../../src/services/battle/engine.js';
import {roomDto} from '../../src/services/battle/dto.js';
import {createRatings} from '../../src/services/battle/ratings.js';
import {createStreams} from '../../src/services/battle/stream.js';
import {EventEmitter} from 'node:events';

const flags={self_paced:true,speed_scoring:true};
async function setup(extra={},overrides={}){
 const f=fixture(overrides);await f.manager.configure({...f.config,battle_modes:{...f.config.battle_modes,...flags,bot:true}});
 const host={id:99,role:'teacher'},room=await f.manager.create(host,{...f.data,kind:'class',class_id:1,capacity:50,pacing:'self',...extra});
 for(const user of f.users.slice(0,2))await f.manager.join(user,room.id);
 await f.manager.command(host,room.id,'start');f.setTime(4000);const r=f.manager.rooms.get(room.id);
 await f.manager.internal(r.id,{action:'open',index:r.index,schedule_version:r.schedule_version});
 return {...f,id:r.id,host,live:()=>f.manager.rooms.get(r.id)};
}
const answer=(f,user=f.users[0],extra={})=>f.manager.command(user,f.id,'answer',{index:f.live().progress[user.id].cursor,client_id:randomUUID(),skip:true,...extra});

test('V693: chỉ Quiz lớp nhận trục mới, cờ mặc định tắt, Redemption và tổ hợp sai bị chặn',()=>{
 for(const kind of ['duel','ffa','team'])for(const change of [{pacing:'self'},{scoring:'speed'},{time_limit:'total',total_minutes:3},{reveal_policy:'deferred'},{show_live_board:false}])assert.throws(()=>normalizeModes({kind,...change},{battle_modes:flags}),{status:400,code:'BATTLE_MODE_INVALID'});
 assert.deepEqual(Object.fromEntries(Object.keys(modeDefaults).map(k=>[k,normalizeModes({kind:'duel'},{} )[k]])),modeDefaults);
 for(const change of [{pacing:'self'},{scoring:'speed'},{reveal_policy:'deferred'},{show_live_board:false}])assert.throws(()=>normalizeModes({kind:'class',...change},{}),{status:403,code:'BATTLE_FEATURE_OFF'});
 assert.throws(()=>normalizeModes({kind:'class',redemption:true},{}),{code:'BATTLE_REDEMPTION_UNSUPPORTED'});
 // Thi theo phút: số phút tùy chọn, nguyên 1–90
 const on={battle_modes:{self_paced:true,speed_scoring:true}};
 for(const m of [1,7,45,90])assert.equal(normalizeModes({kind:'class',pacing:'self',time_limit:'total',total_minutes:m},on).total_minutes,m);
 for(const m of [0,91,2.5,null])assert.throws(()=>normalizeModes({kind:'class',pacing:'self',time_limit:'total',total_minutes:m},on),{status:400,code:'BATTLE_MODE_INVALID'});
 for(const change of [{time_limit:'total',total_minutes:3},{pacing:'self',time_limit:'total',total_minutes:95},{total_minutes:3}])assert.throws(()=>normalizeModes({kind:'class',...change},{battle_modes:flags}),{code:'BATTLE_MODE_INVALID'});
});
test('V693: điểm liên tục, từng phần, loại câu; hòa speed dùng accuracy, lịch sử NULL giữ điểm',()=>{
 for(const ms of [0,1499,1500,20000,999999]){const a=answerPoints({scoring:'speed'},{seconds:20},.75,ms);assert.equal(a.base_points+a.speed_points,Math.round(.75*(600+Math.round(400*Math.max(0,1-ms/20000)))));}
 assert.equal(answerPoints({scoring:'speed'},{seconds:30},1,15000).speed_points,200);
 const r={scoring:'speed',players:[{user_id:1},{user_id:2},{user_id:3}],questions:[],asked_count:1,answers:[{idx:0,user_id:1,score:.5,base_points:500,ms:1},{idx:0,user_id:2,score:1,base_points:500,ms:999},{idx:0,user_id:3,score:1,base_points:500,ms:1}]};
 assert.deepEqual(standings(r).map(p=>[p.user_id,p.rank]),[[2,1],[3,1],[1,3]]);
 r.scoring='accuracy';r.answers[0].base_points=null;assert.equal(standings(r).find(p=>p.user_id===1).points,50);
});
test('V693: đáp án + tiến độ commit trước ACK, hai tab chỉ chuyển một lần, A không vô hiệu hạn B',async()=>{
 const f=await setup(),before=structuredClone(f.live()),save=f.store.save,data={index:0,client_id:randomUUID(),skip:true};
 f.store.save=async()=>{throw Object.assign(Error('DB'),{status:503});};await assert.rejects(f.manager.command(f.users[0],f.id,'answer',data),{status:503});assert.deepEqual(f.live(),before);
 let saved;f.store.save=async(r,options)=>{saved=options;await save(r);};
 const ack=await f.manager.command(f.users[0],f.id,'answer',data);assert.equal(saved.answers.length,1);assert.deepEqual(saved.progressKeys,[1]);assert.equal(saved.noPlayers,true);
 assert.deepEqual(await f.manager.command(f.users[0],f.id,'answer',data),ack);
 await assert.rejects(f.manager.command(f.users[0],f.id,'answer',{...data,client_id:randomUUID()}),{status:409});
 const results=await Promise.allSettled([1,2].map(()=>f.manager.command(f.users[0],f.id,'next',{expected_cursor:0})));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'BATTLE_CURSOR_CONFLICT');
 assert.equal(f.live().progress[2].deadline,before.progress[2].deadline);assert.equal(f.live().progress[2].progress_version,before.progress[2].progress_version);assert.equal(f.timers.size,1);
 f.setTime(before.progress[2].deadline);await f.manager.internal(f.id,{action:'self_tick',index:-1,schedule_version:f.live().schedule_version});assert.equal(f.live().answers.find(a=>a.user_id===2).timed_out,true);
});
test('V693: A tới câu 6, B câu 1; toàn JSON riêng không lộ tương lai, deferred/màn chiếu/tắt bảng',async()=>{
 const f=await setup({reveal_policy:'deferred'});
 for(let i=0;i<5;i++){await answer(f);await f.manager.command(f.users[0],f.id,'next',{expected_cursor:i});}
 const b=await f.manager.snapshot(f.users[1],f.id);assert.equal(b.question.index,0);assert.equal(b.public_board.some(p=>'points'in p),false);
 for(let i=1;i<7;i++)assert.ok(!JSON.stringify(b).includes('Câu '+i));assert.equal(JSON.stringify(b).includes('Lời giải'),false);
 const teach=await f.manager.snapshot(f.host,f.id),screen=await f.manager.snapshot(f.host,f.id,false,{projector:true});assert.ok(teach.teacher_progress);assert.equal(screen.teacher_progress,undefined);assert.equal(screen.question,undefined);
 f.live().show_live_board=false;assert.equal((await f.manager.snapshot(f.users[1],f.id)).public_board,undefined);
 await f.manager.command(f.host,f.id,'end');const result=await f.manager.snapshot(f.users[1],f.id,true);assert.equal(result.questions.length,1);assert.equal(result.me.submitted,0);assert.equal(result.me.issued,1);assert.equal(result.me.total,7);
});
test('V693: hạn tổng, nhận trước hạn nhưng DB xong sau hạn, next/answer/timer trễ, pause',async()=>{
 const f=await setup({time_limit:'total',total_minutes:3,scoring:'speed'}),initial=f.live().ends_at;
 assert.equal(initial,184000);assert.equal(f.live().progress[1].deadline,null);
 f.setTime(5000);await f.manager.command(f.host,f.id,'pause');f.setTime(15000);await f.manager.command(f.host,f.id,'resume');assert.equal(f.live().ends_at,initial+10000);assert.equal(f.live().progress[1].paused_ms,10000);
 const end=f.live().ends_at,save=f.store.save;f.setTime(end-1);f.store.save=async(r,o)=>{await save(r,o);f.setTime(end+1000);};const a=await answer(f);assert.equal(a.received,true);assert.equal(f.live().progress[1].auto_next_at,null);
 f.store.save=save;await assert.rejects(f.manager.command(f.users[0],f.id,'next',{expected_cursor:0}),{code:'BATTLE_TOTAL_EXPIRED'});assert.equal(f.live().status,'finished');assert.equal(f.live().progress[2].issued_count,1);assert.equal(f.live().answers.some(a=>a.user_id===2),false);
 const g=await setup({time_limit:'total',total_minutes:3});g.setTime(g.live().ends_at);await assert.rejects(answer(g),{code:'BATTLE_TOTAL_EXPIRED'});assert.equal(g.live().answers.length,0);
 const h=await setup({time_limit:'total',total_minutes:3});h.setTime(h.live().ends_at+5000);await h.manager.internal(h.id,{action:'self_tick',index:-1,schedule_version:h.live().schedule_version});assert.equal(h.live().status,'finished');assert.equal(h.live().asked_count,1);
});
test('V693: mở câu lỗi không phát nội dung, mốc mở sau commit, auto-next và pause feedback',async()=>{
 const f=await setup();await answer(f);const original=structuredClone(f.live()),save=f.store.save;
 f.store.save=async()=>{throw Object.assign(Error('DB'),{status:503});};await assert.rejects(f.manager.command(f.users[0],f.id,'next',{expected_cursor:0}),{status:503});assert.deepEqual(f.live(),original);
 f.store.save=async(r,o)=>{await save(r,o);f.setTime(6000);};await f.manager.command(f.users[0],f.id,'next',{expected_cursor:0});assert.equal(f.live().progress[1].opened_at,6000);
 f.store.save=save;await answer(f);const auto=f.live().progress[1].auto_next_at;await f.manager.command(f.host,f.id,'pause');f.setTime(16000);await f.manager.command(f.host,f.id,'resume');assert.equal(f.live().progress[1].auto_next_at,auto+10000);
 f.setTime(auto+10000);await f.manager.internal(f.id,{action:'self_tick',index:-1,schedule_version:f.live().schedule_version});assert.equal(f.live().progress[1].cursor,2);
});
test('V693: fastest quyết toán nguyên tử, đồng thời cùng thưởng, không cộng khi end giữa câu',async()=>{
 const f=await setup({pacing:'sync',scoring:'speed'});f.setTime(6000);
 await f.manager.command(f.users[0],f.id,'answer',{index:0,client_id:randomUUID(),response:'B'});
 const save=f.store.save;f.store.save=async()=>{throw Error('DB close');};await assert.rejects(f.manager.internal(f.id,{action:'close',index:0,schedule_version:f.live().schedule_version}));assert.equal(f.live().phase,'question');assert.equal(f.live().answers[0].fastest_points,0);
 f.store.save=save;await f.manager.internal(f.id,{action:'close',index:0,schedule_version:f.live().schedule_version});const dto=await f.manager.snapshot(f.users[0],f.id);assert.deepEqual(dto.fastest,{names:['1'],ms:2000});assert.equal(dto.my_answer.fastest_points,100);
 const r={scoring:'speed',pacing:'sync',index:0,answers:[{idx:0,score:1,ms:1},{idx:0,score:1,ms:1},{idx:0,score:.5,ms:0}]};settleFastest(r);settleFastest(r);assert.deepEqual(r.answers.map(a=>a.fastest_points),[100,100,0]);
 const g=await setup({pacing:'sync',scoring:'speed'});await g.manager.command(g.users[0],g.id,'answer',{index:0,client_id:randomUUID(),response:'B'});await g.manager.command(g.host,g.id,'end');assert.equal(g.live().answers[0].fastest_points,0);
});
test('V693: metadata rank sai không có bất kỳ ghi rating; kill switch dọn chỗ và timer gameplay',async()=>{
 const ratings=createRatings(),db={query:()=>{throw Error('Không được đọc/ghi rating');}};
 for(const change of [{pacing:'self'},{scoring:'speed'},{time_limit:'total'},{kind:'class'}]){const room={kind:'duel',...change,status:'finished',end_reason:'completed',asked_count:7,auto_match:true,match_meta:{rank_enabled:true,ranked:{1:true}}};assert.equal(rankEligible(room),false);await ratings.settle(db,room,{});}
 const f=await setup();await f.manager.configure({...f.config,battle_emergency_stop:true});assert.equal(f.live().status,'interrupted');assert.equal(f.manager.studentRooms.size,0);assert.equal([...f.timers.values()].filter(t=>t.ms!==600000).length,0);
});
test('V693: bot dùng con trỏ riêng, pause dịch lịch cả self và sync',async()=>{
 for(const pacing of ['self','sync']){
  const seen=[],f=await setup({pacing,bot_difficulty:'medium'},{bots:{prepare:async()=>{},plan:r=>{seen.push(r.pacing==='self'?r.progress['bot:1'].cursor:r.index);return {response:'B',delay:7000};}}});
  f.setTime(6000);await f.manager.command(f.host,f.id,'pause');assert.equal(f.timers.size,0);f.setTime(16000);await f.manager.command(f.host,f.id,'resume');assert.equal([...f.timers.values()][0].ms,5000);
  f.setTime(21000);await f.manager.internal(f.id,{action:pacing==='self'?'self_tick':'bot_answer',user_id:'bot:1',response:'B',index:f.live().index,schedule_version:f.live().schedule_version});assert.equal(f.live().answers.find(a=>a.user_id==='bot:1').ms,7000);
  if(pacing==='self'){f.setTime(24000);await f.manager.internal(f.id,{action:'self_tick',index:-1,schedule_version:f.live().schedule_version});assert.deepEqual(seen,[0,1]);assert.equal(f.live().progress[1].cursor,0);}
 }
});
test('V693: bảng tối đa 1 Hz, phản hồi riêng tới ngay và không vào màn chiếu',async()=>{
 let time=0,serial=0;const timers=new Map(),stream=createStreams({now:()=>time,setTimer:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimer:id=>timers.delete(id)}),received=[[],[],[]];
 for(let i=0;i<3;i++){const res=new EventEmitter();res.writableLength=0;res.status=()=>res;res.set=()=>res;res.flushHeaders=()=>{};res.write=data=>received[i].push(data);res.end=()=>{};await stream.open({res,key:'r',user:{id:i===2?1:i+1},projector:i===2,snapshot:async()=>({at:time})});}
 stream.publishPrivate('r',1);await new Promise(setImmediate);assert.deepEqual(received.map(x=>x.length),[2,1,1]);
 let refresh=0;stream.publishBoard('r',1000,()=>refresh++);stream.publishBoard('r',100,()=>refresh++);assert.equal([...timers.values()].filter(t=>t.ms===1000).length,1);time=1000;[...timers.values()].find(t=>t.ms===1000).fn();await new Promise(setImmediate);assert.equal(refresh,1);assert.deepEqual(received.map(x=>x.length),[3,2,2]);stream.dispose();
});
test('V693: 40 người × 15 câu, một timer gameplay, ghi theo người và đủ 600 đáp án',async()=>{
 const f=fixture({deck:{count:async()=>15,draw:async()=>Array.from({length:15},(_,i)=>question('multiple_choice',i))}}),host={id:99,role:'teacher'};
 await f.manager.configure({...f.config,battle_modes:{...f.config.battle_modes,...flags}});const r=await f.manager.create(host,{...f.data,kind:'class',class_id:1,capacity:50,question_count:15,pacing:'self'}),users=Array.from({length:40},(_,i)=>({id:i+1,role:'student'}));for(const u of users)await f.manager.join(u,r.id);
 await f.manager.command(host,r.id,'start');f.setTime(4000);await f.manager.internal(r.id,{action:'open',index:-1,schedule_version:f.manager.rooms.get(r.id).schedule_version});
 const save=f.store.save;f.store.save=async(room,o)=>{if(!room.ended_at){assert.equal(o.noPlayers,true);assert.equal(o.progressKeys.length,1);}await save(room,o);};
 for(let idx=0;idx<15;idx++)for(const u of users){await f.manager.command(u,r.id,'answer',{index:idx,client_id:randomUUID(),response:'B'});if(idx<14)await f.manager.command(u,r.id,'next',{expected_cursor:idx});if(f.manager.rooms.get(r.id).status==='playing')assert.equal(f.timers.size,1);}
 assert.equal(f.manager.rooms.get(r.id).answers.length,600);assert.equal(f.manager.rooms.get(r.id).status,'finished');
});
