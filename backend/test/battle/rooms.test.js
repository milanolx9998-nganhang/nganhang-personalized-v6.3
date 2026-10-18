import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSerial,createStudentLocks} from '../../src/services/battle/rooms.js';
import {fixture} from './helpers.js';
test('Hàng lệnh tuần tự; lỗi một lệnh không chặn lệnh sau',async()=>{const q=createSerial(),seen=[];let release;const gate=new Promise(r=>{release=r;});const a=q.run('r',async()=>{seen.push(1);await gate;seen.push(2);throw Error('lỗi');});const rejected=assert.rejects(a);const b=q.run('r',()=>seen.push(3));await Promise.resolve();assert.deepEqual(seen,[1]);release();await rejected;await b;assert.deepEqual(seen,[1,2,3]);});
test('Trần chỉ áp dụng lệnh HTTP; nội bộ luôn vào hàng',async()=>{const q=createSerial({maxPending:1});let release;const a=q.run('r',()=>new Promise(r=>{release=r;}));await Promise.resolve();const b=q.run('r',()=>1);await assert.rejects(q.run('r',()=>2),{status:503});const c=q.run('r',()=>3,{internal:true});release();await a;assert.equal(await b,1);assert.equal(await c,3);});
test('Lệnh hết hạn chờ không chạy muộn',async()=>{let timeout;const q=createSerial({setTimer:fn=>{timeout=fn;return 1;},clearTimer:()=>{}});let release;const a=q.run('r',()=>new Promise(r=>{release=r;}));await Promise.resolve();let executed=false;const b=q.run('r',()=>{executed=true;});const error=assert.rejects(b,{status:503});timeout();release();await a;await error;assert.equal(executed,false);});
test('Khóa nhiều học sinh theo thứ tự nên không bế tắc',async()=>{const locks=createStudentLocks();const result=await Promise.all([locks.run([2,1],()=>1),locks.run([1,2],()=>2)]);assert.deepEqual(result,[1,2]);});
test('Biên nhận sau commit; gửi lại sau pha kết thúc vẫn đúng; khác client_id 409',async()=>{
 const f=fixture(),{id}=await f.playing();const data={index:0,client_id:randomUUID(),response:'B'};let committed=false;f.store.answer=async()=>{await Promise.resolve();committed=true;};
 const ack=await f.manager.command(f.users[0],id,'answer',data,5000);assert.equal(committed,true);assert.equal(ack.received,true);
 f.manager.rooms.get(id).phase='finished';f.manager.rooms.get(id).status='finished';
 assert.deepEqual(await f.manager.command(f.users[0],id,'answer',data,999999),ack);
 await assert.rejects(f.manager.command(f.users[0],id,'answer',{...data,client_id:randomUUID()}),e=>e.status===409&&e.details.receipt.at===5000);
});
test('Lỗi DB không tạo đáp án RAM hay ACK, gửi lại cùng client_id được',async()=>{const f=fixture(),{id}=await f.playing(),data={index:0,client_id:randomUUID(),response:'B'};f.store.answer=async()=>{throw Object.assign(Error('DB lỗi'),{status:503});};await assert.rejects(f.manager.command(f.users[0],id,'answer',data,5000),{status:503});assert.equal(f.manager.rooms.get(id).answers.length,0);f.store.answer=async()=>{};assert.equal((await f.manager.command(f.users[0],id,'answer',data,5000)).received,true);});
test('Nhận sát close_at hợp lệ; trễ bị chặn',async()=>{const f=fixture(),{id}=await f.playing(),at=f.manager.rooms.get(id).close_at;await assert.rejects(f.manager.command(f.users[1],id,'answer',{index:0,client_id:randomUUID(),response:'B'},at+1),{status:409});assert.equal((await f.manager.command(f.users[0],id,'answer',{index:0,client_id:randomUUID(),response:'B'},at)).received,true);});
test('Pause/resume lớp, trừ thời gian dừng, bỏ timer cũ và không tự chuyển lời giải',async()=>{
 const f=fixture(),{id,host}=await f.playing('class'),before=structuredClone(f.manager.rooms.get(id));f.setTime(6000);await f.manager.command(host,id,'pause');assert.equal(await f.manager.internal(id,{action:'close',index:0,schedule_version:before.schedule_version}),false);
 await assert.rejects(f.manager.command(f.users[0],id,'answer',{index:0,client_id:randomUUID(),response:'B'},7000),{status:409});
 f.setTime(10000);await f.manager.command(host,id,'resume');const resumed=f.manager.rooms.get(id);assert.equal(resumed.phase,'question');assert.equal(resumed.deadline,before.deadline+4000);
 await f.manager.command(f.users[0],id,'answer',{index:0,client_id:randomUUID(),response:'B'},11000);assert.equal(f.manager.rooms.get(id).answers[0].ms,3000);
 await f.manager.internal(id,{action:'close',index:0,schedule_version:resumed.schedule_version});assert.equal(f.manager.rooms.get(id).phase,'reveal');await assert.rejects(f.manager.command(host,id,'pause'),{status:409});await assert.rejects(f.manager.command(f.users[0],id,'next'),{status:403});
 assert.equal([...f.timers.values()].filter(t=>t.ms===20000).length,0);await f.manager.command(host,id,'next');assert.equal(f.manager.rooms.get(id).asked_count,2);
});
test('Ngoài phòng không đọc/ghi; hai người vào chỗ cuối chỉ một người thành công',async()=>{const f=fixture();await f.manager.configure(f.config);const r=await f.manager.create(f.users[0],f.data);const results=await Promise.allSettled([f.manager.join(f.users[1],r.id),f.manager.join(f.users[2],r.id)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);await assert.rejects(f.manager.snapshot({id:999},r.id),{status:403});await assert.rejects(f.manager.command({id:999},r.id,'answer',{index:0,client_id:randomUUID(),response:'B'}),{status:403});});
test('Dừng nhận ván mới cho ván cũ chơi; dừng khẩn cấp kết thúc và giải phóng chỗ',async()=>{const f=fixture(),{id}=await f.playing();await f.manager.configure({...f.config,battle_enabled:false});assert.equal((await f.manager.command(f.users[0],id,'answer',{index:0,client_id:randomUUID(),response:'B'},5000)).received,true);await f.manager.configure({...f.config,battle_emergency_stop:true});assert.equal(f.manager.rooms.get(id).status,'interrupted');assert.equal(f.manager.studentRooms.size,0);});
test('B1: trả lời không phát sảnh; sảnh dùng một truy vấn chặn và cache tư cách 60 giây',async()=>{
 const f=fixture(),{id}=await f.playing(),published=[];f.streams.publish=key=>published.push(key);
 await f.manager.command(f.users[0],id,'answer',{index:0,client_id:randomUUID(),response:'B'},5000);assert.ok(!published.includes('lobby'));
 let queries=0;f.safety.blockedIds=async()=>{queries++;return [];};f.calls.length=0;
 for(let i=0;i<100;i++)f.manager.rooms.set('lobby'+i,{...f.data,id:'lobby'+i,phase:'lobby',grade:9,visibility:'public',players:[],scope:{subject_id:1}});
 await f.manager.lobby(f.users[2]);assert.equal(queries,1);await f.manager.lobby(f.users[2]);assert.equal(queries,2);assert.equal(f.calls.filter(c=>c==='identity').length,1);
 f.setTime(65000);await f.manager.lobby(f.users[2]);assert.equal(f.calls.filter(c=>c==='identity').length,2);
});
test('Q6: tên trùng đánh số theo lượt vào, người rời không làm đổi hoặc tái dùng số',async()=>{const f=fixture();await f.manager.configure(f.config);f.users.forEach(u=>u.full_name='Nguyễn Ngọc');const room=await f.manager.create(f.users[0],{...f.data,kind:'ffa',capacity:20});await f.manager.join(f.users[1],room.id);await f.manager.leave(f.users[0],room.id);await f.manager.join(f.users[2],room.id);assert.deepEqual(f.manager.rooms.get(room.id).players.map(p=>p.display_name),['Ngọc','Ngọc 2','Ngọc 3']);});
