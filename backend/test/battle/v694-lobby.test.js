import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {performance} from 'node:perf_hooks';
import {buildLobby,seekingGroups,scopeLabel,prepareSeeking,projectSeeking} from '../../src/services/battle/lobby.js';
import {createLobbyCache} from '../../src/services/battle/lobbyCache.js';
import {createLobbyCatalog,normalizeScope} from '../../src/services/battle/deck.js';
import {createSafety} from '../../src/services/battle/safety.js';
import {createStreams} from '../../src/services/battle/stream.js';
import {fixture} from './helpers.js';

const catalog={subjects:[{id:1,name:'KHTN'},{id:2,name:'Toán'}],branches:[{id:11,name:'Vật lí'},{id:12,name:'Hóa học'}],topics:[{id:1,name:'Tốc độ',subject_id:1,branch_id:11,chapter:'I'},{id:2,name:'Âm',subject_id:1,branch_id:11,chapter:'II'},{id:3,name:'Nguyên tử',subject_id:1,branch_id:12,chapter:'I'},{id:4,name:'Số',subject_id:2,branch_id:null,chapter:'I'}]};
const room=(id,extra={})=>({id:String(id),kind:'duel',status:'waiting',phase:'lobby',visibility:'public',scope:{subject_id:1,topic_ids:[1]},grade:9,capacity:2,players:[{user_id:10,display_name:'Tên kín',class_name:'9A'}],host_id:10,code:'123456',created_at:Number(id)||1,asked_count:1,question_count:7,seconds:20,play_started_at:100,questions:[{stem:'Kín'}],answers:[{score:1}],...extra});
const project=(rooms,extra={})=>buildLobby({rooms,info:{grade:9,class_id:7},blocked:new Set(),config:{battle_modes:{lobby:true,class:true}},catalog,progress:r=>({asked_count:r.asked_count,started_at:r.play_started_at}),...extra});
const entry=(id,ids=[1],grade=9)=>({user:{id},grade,current:{ids},choices:[{subject_id:1},{subject_id:2}],topics:catalog.topics});
test('V694: quyền, chặn hai chiều đã nạp, mã riêng, lớp khác, ván ghép và DTO whitelist',()=>{
 const rooms=[room(1),room(2,{visibility:'code'}),room(3,{kind:'class',class_id:8}),room(4,{kind:'class',class_id:7,visibility:'code'}),room(5,{status:'playing',phase:'question'}),room(6,{status:'playing',phase:'question',visibility:'code'}),room(7,{status:'playing',phase:'question',visibility:'code',auto_match:true}),room(8,{status:'playing',phase:'question',visibility:'code',auto_match:true,has_bots:true}),room(9,{grade:8}),room(10,{kind:'class',class_id:7,status:'playing',phase:'question'})];
 const out=project(rooms);assert.deepEqual(out.rooms.map(r=>r.id),['4','1']);assert.deepEqual(out.live.map(r=>r.id),['5','7']);
 assert.deepEqual(Object.keys(out.live[0]).sort(),['id','kind','scope','scope_label','players','capacity','asked_count','question_count','started_at','auto_match'].sort());
 for(const value of ['Tên kín','9A','123456','Kín','answers','score','host_id'])assert.ok(!JSON.stringify(out.live).includes(value));
 assert.deepEqual(project(rooms,{blocked:new Set([10])}).rooms.map(r=>r.id),['4']);assert.equal(project(rooms,{blocked:new Set([10])}).live.length,0);
 const off=project(rooms,{config:{battle_modes:{lobby:false,class:true}}});assert.deepEqual(off.rooms.map(r=>r.id),['4']);assert.equal(off.live.length,0);
});
test('V694: lọc cùng một bài, tên nhiều môn, thiếu nhãn và tổng trước giới hạn',()=>{
 const multi=room(1,{scope:{subject_id:null,subject_ids:[1,2],topic_ids:[1,4]}});
 assert.equal(project([multi],{query:{subject_id:2,topic_id:4}}).live.length,0);
 assert.equal(project([multi],{query:{subject_id:2,topic_id:4}}).rooms.length,1);
 assert.equal(project([multi],{query:{subject_id:1,branch_id:12,chapter:'II'}}).rooms.length,0);
 assert.equal(project([multi],{query:{subject_id:999}}).rooms.length,0);
 assert.equal(scopeLabel(multi.scope,catalog).subject,'KHTN + Toán');
 assert.deepEqual(scopeLabel({subject_id:99,topic_ids:[999]},catalog).topics,['Bài 999']);
 const all=Array.from({length:110},(_,i)=>room(i+1));all.push(...Array.from({length:60},(_,i)=>room(i+111,{status:'playing',phase:'question'})));
 const out=project(all);assert.equal(out.rooms.length,100);assert.equal(out.live.length,50);assert.equal(out.rooms[0].id,'110');assert.deepEqual(out.subjects,[{id:1,name:'KHTN',waiting:110,live:60,seeking:0,has_seekers:false}]);
 assert.equal(project([room(1,{capacity:20}),room(2,{capacity:2})]).rooms[0].id,'2');
});
test('V694: seeking không đếm bản thân/chặn/khác khối; nhóm nhỏ không bị suy ra qua lọc',()=>{
 const context={grade:9,viewerId:99,blocked:new Set([5])};
 const rows=[entry(1),entry(2,[1]),entry(3,[2]),entry(4,[1],8),entry(5),entry(99)];
 assert.deepEqual(seekingGroups(rows,context),[{subject_id:1,branch_id:null,chapter:null,count:null,has_waiters:true},{subject_id:1,branch_id:11,chapter:'I',count:2,has_waiters:true}]);
 assert.equal(seekingGroups(rows,{...context,query:{chapter:'II'}}).length,0);
 assert.equal(seekingGroups(rows,{...context,query:{topic_id:1}}).length,0);
 assert.deepEqual(seekingGroups([entry(1,[1,2,4])],context),[{subject_id:1,branch_id:null,chapter:null,count:null,has_waiters:true},{subject_id:2,branch_id:null,chapter:null,count:null,has_waiters:true}]);
});
test('V694: cache single-flight, TTL, invalidation khi đọc đang chạy và phục hồi lỗi',async()=>{
 let calls=0,time=0,release;const cache=createLobbyCache(async()=>{calls++;if(calls===1)return new Promise(r=>release=r);return calls;},{now:()=>time});
 const a=cache.get(1),b=cache.get(1);await Promise.resolve();cache.delete(1);release('old');assert.deepEqual(await Promise.all([a,b]),[2,2]);assert.equal(calls,2);
 await cache.get(1);assert.equal(calls,2);time=60000;assert.equal(await cache.get(1),3);
 let fail=true;const retry=createLobbyCache(async()=>{if(fail)throw Error('db');return 4;});await assert.rejects(retry.get(1));fail=false;assert.equal(await retry.get(1),4);
});
test('V694: catalog 3 query mỗi khối/60s, 300 lần đồng thời không nhân query',async()=>{
 let calls=0,time=0;const c=createLobbyCatalog({now:()=>time,client:{query:async()=>{calls++;return {rows:[]};}}});
 await Promise.all(Array.from({length:300},()=>c.get(9)));assert.equal(calls,3);await c.get(8);assert.equal(calls,6);time=60000;await c.get(9);assert.equal(calls,9);
});
test('V694: chặn/bỏ chặn làm mất cache cả hai phía sau commit',async()=>{
 let blocked=false,reads=0;const db={query:async(sql,args)=>{
  if(sql.startsWith('SELECT CASE')){reads++;return {rows:blocked?[{id:args[0]===1?2:1}]:[]};}
  if(sql.startsWith('INSERT INTO battle_blocks'))blocked=true;
  if(sql.startsWith('DELETE FROM battle_blocks'))blocked=false;
  return {rows:[],rowCount:1};
 }};const s=createSafety({db,transaction:fn=>fn(db)});
 await Promise.all([s.lobbyBlockedIds(1),s.lobbyBlockedIds(2)]);await s.lobbyBlockedIds(1);assert.equal(reads,2);
 await s.block({id:1},2);assert.deepEqual(await s.lobbyBlockedIds(1),[2]);assert.deepEqual(await s.lobbyBlockedIds(2),[1]);
 await s.unblock({id:1},2);assert.deepEqual(await s.lobbyBlockedIds(2),[]);assert.deepEqual(await s.lobbyBlockedIds(1),[]);
});
test('V694: ảnh live giữ 5s dù snapshot khác; kết thúc xóa ngay',async()=>{
 const f=fixture({catalog:async()=>catalog});await f.manager.configure(f.config);const r=room(1,{status:'playing',phase:'question'});f.manager.rooms.set(r.id,r);
 assert.equal((await f.manager.lobby(f.users[0])).live[0].asked_count,1);r.asked_count=2;f.setTime(5999);assert.equal((await f.manager.lobby(f.users[0])).live[0].asked_count,1);
 f.setTime(6250);assert.equal((await f.manager.lobby(f.users[0])).live[0].asked_count,2);r.status='finished';f.setTime(6500);assert.equal((await f.manager.lobby(f.users[0])).live.length,0);f.manager.dispose();
});
function response(){const r=new EventEmitter();Object.assign(r,{writableLength:0,body:'',status(){return this;},set(){return this;},setHeader(){},flushHeaders(){},write(s){this.body+=s;return true;},end(){this.emit('close');}});return r;}
test('V694 Argon: chưa chọn môn không khớp bộ lọc, có nhóm riêng; ghim lớp không bị cắt hoặc cộng môn',()=>{
 const vote=room('vote',{scope:{subject_id:null,topic_ids:null},content_mode:'vote'}),pin=room('pin',{kind:'class',class_id:7,capacity:50});
 assert.equal(project([vote],{query:{subject_id:1}}).rooms.length,0);
 assert.equal(project([vote]).subjects[0].id,null);assert.equal(project([vote]).subjects[0].waiting,1);
 const many=Array.from({length:110},(_,i)=>room(i+1));const out=project([...many,pin]);assert.equal(out.rooms.length,101);assert.equal(out.rooms[0].id,'pin');assert.equal(out.subjects[0].waiting,110);
 const off=project([pin,vote],{config:{battle_modes:{lobby:false,class:true}},query:{subject_id:999}});assert.deepEqual(off.rooms.map(r=>r.id),['pin']);assert.deepEqual(off.subjects,[]);
});
test('V694 Argon: TTL và eviction khi cache đầy không nạp lại vô hạn hay xóa pending',async()=>{
 let time=0,calls=0;const release=new Map(),cache=createLobbyCache(async key=>{calls++;if(key>2)return new Promise(r=>release.set(key,r));return key;},{now:()=>time,ttl:10,max:2});
 await cache.get(1);await cache.get(2);time=10;await cache.get(1);
 const jobs=[3,4,5].map(key=>cache.get(key));await Promise.resolve();for(const [key,resolve] of release)resolve(key);
 assert.deepEqual(await Promise.all(jobs),[3,4,5]);assert.equal(calls,6);
 const six=cache.get(6);await Promise.resolve();cache.delete(6);release.get(6)(0);await new Promise(r=>setImmediate(r));release.get(6)(6);assert.equal(await six,6);assert.equal(calls,8);
});
test('V694 Argon: normalizeScope giữ lựa chọn cả chương và DTO không trải danh sách nhãn bài',async()=>{
 const client={query:async(sql)=>({rowCount:1,rows:sql.includes('SELECT id FROM topics')?[{id:1},{id:3}]:[{id:1}]})};
 const scope=await normalizeScope(9,{subject_id:1,chapter:'I'},client);assert.equal(scope.chapter,'I');assert.deepEqual(scope.topic_ids,[1,3]);
 const out=project([room(1,{scope})],{query:{subject_id:1,chapter:'I'}});assert.equal(out.rooms.length,1);assert.equal(out.rooms[0].scope.chapter,'I');assert.deepEqual(out.rooms[0].scope_label.topics,[]);assert.equal(out.rooms[0].scope_label.label,'KHTN · I');
});
test('V694 Argon: vé mọi môn chỉ seeking_any; singleton và tổng môn không trả số chính xác',()=>{
 const context={grade:9,viewerId:99,blocked:new Set()},free={...entry(1,[1,4]),choices:[]};
 const out=projectSeeking(prepareSeeking([free]),context);assert.deepEqual(out,{seeking:[],seeking_any:{count:null,has_waiters:true}});
 assert.equal(projectSeeking(prepareSeeking([free]),{...context,blocked:new Set([1])}).seeking_any.count,0);
 const selected=projectSeeking(prepareSeeking([entry(2)]),context);const result=project([],{...selected});assert.equal(result.subjects[0].seeking,null);assert.equal(result.subjects[0].has_seekers,true);
});
test('V694 Argon: môn vào được trước, phòng mất kết nối/chờ lâu xuống cuối; countdown có thời điểm',async()=>{
 const old=room(1,{created_at:1}),fresh=room(2,{created_at:200000,scope:{subject_id:2,topic_ids:[4]}}),offline=room(3,{created_at:200000,players:[{user_id:10,disconnected:true}]}),live=room(4,{status:'playing',phase:'question'});
 const out=project([old,fresh,offline,live],{now:200001});assert.deepEqual(out.rooms.map(r=>r.id),['2','3','1']);assert.equal(out.subjects[0].id,1);
 assert.equal(project([live,fresh],{now:200001}).subjects[0].id,2);
 const f=fixture({catalog:async()=>catalog});await f.manager.configure(f.config);f.manager.rooms.set('c',room('c',{status:'playing',phase:'countdown',asked_count:0,play_started_at:null,started_at:55}));assert.equal((await f.manager.lobby(f.users[0])).live[0].started_at,55);f.manager.dispose();
});
test('V694: 50 phòng + 300 luồng, snapshot nóng không đọc DB; gộp progress 5s',async t=>{
 let reads=0;const cache=createLobbyCache(async()=>{reads++;return [];});const f=fixture({catalog:async()=>catalog});f.safety.lobbyBlockedIds=id=>cache.get(id);await f.manager.configure(f.config);
 for(let i=0;i<50;i++)f.manager.rooms.set(String(i),room(i));
 const timers=new Map();let seq=0;const streams=createStreams({setTimer:(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;},clearTimer:id=>timers.delete(id)});
 const begin=performance.now();await Promise.all(Array.from({length:300},(_,i)=>streams.open({res:response(),key:'lobby',user:{id:i+100},snapshot:()=>f.manager.lobby({id:i+100,role:'student'})})));
 assert.equal(streams.stats().streams,300);assert.equal(reads,300);assert.equal(f.manager.lobbyStats().builds,1);const identities=f.calls.filter(x=>x==='identity').length;
 const samples=[];for(let i=0;i<300;i++){const at=performance.now();await f.manager.lobby({id:i+100,role:'student'});samples.push(performance.now()-at);}
 assert.equal(reads,300);assert.equal(f.manager.lobbyStats().builds,1);assert.equal(f.calls.filter(x=>x==='identity').length,identities);
 for(let i=0;i<100;i++)streams.publishLobbyProgress();assert.equal([...timers.values()].filter(t=>t.ms===5000).length,1);
 [...timers.values()].find(t=>t.ms===5000).fn();assert.equal([...timers.values()].filter(t=>t.ms===250).length,1);
 samples.sort((a,b)=>a-b);t.diagnostic(JSON.stringify({rooms:50,connections:300,warm_db_reads:0,warm_lobby_p95_ms:samples[284],total_ms:performance.now()-begin}));
 streams.dispose();f.manager.dispose();
});
