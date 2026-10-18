import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchmaking} from '../../src/services/battle/matchmaking.js';
import {fixture,question} from './helpers.js';
import {createDeck} from '../../src/services/battle/deck.js';
async function setup(blocked=async()=>false){
 const f=fixture();await f.manager.configure(f.config);const timers=[];
 const match=createMatchmaking({rooms:f.manager,identity:async()=>({grade:9}),normalizeScope:async(_g,s)=>s,deck:{count:async()=>20},safety:{blockedPairs:async ids=>await blocked()?ids.slice(1).map(id=>({user_id:ids[0],blocked_id:id})):[],assertAvailable:async()=>{}},streams:f.streams,now:f.now,setTimer:fn=>{timers.push(fn);return timers.length;},clearTimer:()=>{},broaden:async(_g,scope)=>({scope:{...scope,topic_ids:null},label:'Mở rộng?'})});
 f.manager.setMatchmaking(match);return {...f,match,timers};
}
test('Ghép đôi dùng giao cả nhóm và giải phóng hàng chờ',async()=>{const f=await setup();await f.match.join(f.users[0],{kind:'duel',scope:{subject_id:1,topic_ids:[1,2]}});const result=await f.match.join(f.users[1],{kind:'duel',scope:{subject_id:1,topic_ids:[2,3]}});assert.ok(result.current_room_id);assert.deepEqual(f.manager.rooms.get(result.current_room_id).scope.topic_ids,[2]);assert.equal(f.match.has(1),false);assert.equal(f.match.has(2),false);});
test('Chặn một chiều với bất kỳ thành viên nào ngăn ghép',async()=>{const f=await setup(async()=>true);await f.match.join(f.users[0],{kind:'duel',scope:{subject_id:1}});const result=await f.match.join(f.users[1],{kind:'duel',scope:{subject_id:1}});assert.equal(result.current_room_id,null);assert.equal(f.match.has(1),true);});
test('FFA không ghép giao đôi khác rỗng nhưng giao cả nhóm rỗng',async()=>{const f=await setup();for(let i=0;i<3;i++)await f.match.join(f.users[i],{kind:'ffa',scope:{subject_id:1,topic_ids:[[1,2],[2,3],[1,3]][i]}});assert.equal(f.manager.rooms.size,0);});
test('Lời mời sau 30 giây không tự nới, chỉ đổi sau đồng ý',async()=>{const f=await setup();await f.match.join(f.users[0],{kind:'duel',scope:{subject_id:1,topic_ids:[1]}});f.setTime(31001);await f.timers[0]();assert.deepEqual(f.match.status(1).scope.topic_ids,[1]);assert.equal(f.match.status(1).offer.scope.topic_ids,null);await f.match.expand(f.users[0]);assert.equal(f.match.status(1).scope.topic_ids,null);});
test('Vào phòng trong lúc đang tìm đối thủ tự rời hàng chờ dưới khóa học sinh',async()=>{const f=await setup();const room=await f.manager.create(f.users[0],f.data);await f.match.join(f.users[1],{kind:'duel',scope:{subject_id:1}});await f.manager.join(f.users[1],room.id);assert.equal(f.match.has(2),false);assert.equal(f.manager.studentRooms.get(2),room.id);});
test('B2/B3: 100 người đang chờ, mỗi lượt xét ghép dùng tối đa ba truy vấn đọc',async()=>{
 const f=fixture();await f.manager.configure(f.config);let queries=0;
 // Mỗi em có 7 câu riêng + 1 câu chung: phạm vi cá nhân đủ, giao nhóm thiếu câu.
 const rows=Array.from({length:701},(_,i)=>({...question('multiple_choice',i),topic_id:i===0?1:Math.floor((i-1)/7)+2}));
 const deck=createDeck({client:{query:async()=>{queries++;return {rows};}}});
 const match=createMatchmaking({rooms:f.manager,deck,identity:async()=>({grade:9}),normalizeScope:async(_g,s)=>s,safety:{assertAvailable:async()=>{},blockedPairs:async()=>{queries++;return [];}},streams:f.streams,setTimer:()=>1,clearTimer:()=>{},broaden:async()=>null});
 for(let i=1;i<=100;i++)await match.join({id:i,role:'student'},{kind:'duel',scope:{subject_id:1,topic_ids:[1,i+1]}});
 queries=0;deck.clear();await match.match();assert.ok(queries<=3,'Số truy vấn: '+queries);assert.equal(queries,2);assert.equal(match.has(100),true);
});
