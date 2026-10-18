import {randomUUID,randomInt} from 'node:crypto';
import {fail} from '../practice/config.js';
import {gradeQuestion} from '../practice/grading.js';
import {activePlayers,startReasons,terminal,standings,timerCurrent,voteDecision} from './engine.js';
import {roomDto,lobbyCard} from './dto.js';

// Hàng đợi có hủy lệnh hết hạn trước khi chạy; công việc đang chạy luôn được hoàn tất.
export function createSerial({maxPending=200,waitMs=5000,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const queues=new Map();
 function run(key,work,{internal=false,timeoutMs=waitMs}={}){
  let q=queues.get(key);if(!q){q={busy:false,waiting:[]};queues.set(key,q);}
  if(!internal&&q.waiting.length>=maxPending)return Promise.reject(Object.assign(new Error('Phòng đang bận'),{status:503}));
  return new Promise((resolve,reject)=>{
   const entry={work,resolve,reject};
   if(q.busy&&!internal)entry.timer=setTimer(()=>{const i=q.waiting.indexOf(entry);if(i>=0){q.waiting.splice(i,1);reject(Object.assign(new Error('Hệ thống đang bận, thử lại'),{status:503}));}},timeoutMs);
   q.waiting.push(entry);pump();
   function pump(){if(q.busy)return;const next=q.waiting.shift();if(!next){queues.delete(key);return;}q.busy=true;clearTimer(next.timer);Promise.resolve().then(next.work).then(next.resolve,next.reject).finally(()=>{q.busy=false;pump();});}
  });
 }
 return {run,size:key=>queues.get(key)?.waiting.length||0,configure:limit=>{maxPending=limit;}};
}
export function createStudentLocks(options={}){
 const serial=createSerial(options);
 return {run:(ids,work)=>{const sorted=[...new Set(ids)].sort((a,b)=>a-b),end=Date.now()+(options.waitMs||5000);const take=i=>i===sorted.length?work():serial.run(sorted[i],()=>{if(Date.now()>end)fail('Hệ thống đang bận, thử lại',503);return take(i+1);},{timeoutMs:Math.max(0,end-Date.now())});return take(0);}};
}
export function createRooms({store,deck,safety,streams,identity,normalizeScope,options,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,random=()=>randomInt(0,1000000)/1000000,locks=createStudentLocks(),queue=createSerial()}={}){
 const rooms=new Map(),studentRooms=new Map(),timers=new Map(),lobbyIdentities=new Map();let config,matchmaking,housekeeping;
 const isHost=(r,u)=>r.host_id===u.id;
 function feature(name){if(!config?.battle_modes?.[name]){const e=new Error('Khả năng Đấu này đang tắt');e.status=403;e.code='BATTLE_FEATURE_OFF';throw e;}}
 function admission(){if(!config?.battle_enabled)fail('Đang ngừng nhận ván mới',403);if(config.battle_emergency_stop)fail('Đấu đang dừng khẩn cấp',403);}
 function access(r,u,live=true){const p=r.players.find(p=>p.user_id===u.id);if(r.kind==='class'&&isHost(r,u)&&u.role!=='student')return true;if(!p||live&&p.left_at)fail('Em không còn trong phòng này',403);return true;}
 async function get(id){return rooms.get(id)||await store.load(id);}
 const receipt=a=>({received:true,index:a.idx,at:a.received_at});
 function publish(r,immediate=false,lobbyChanged=false){r.version++;streams.publish(r.id,immediate);if(lobbyChanged)streams.publish('lobby');}
 function schedule(r){
  clearTimer(timers.get(r.id));timers.delete(r.id);if(terminal(r))return;
  let at,action;
  if(r.vote){at=r.vote.deadline;action='vote_timeout';}
  else if(r.phase==='countdown'){at=r.countdown_at;action='open';}
  else if(r.phase==='question'){at=r.close_at;action='close';}
  else if(r.phase==='reveal'&&r.kind!=='class'){at=r.reveal_at+20000;action='advance';}
  else if(r.phase==='lobby'){at=r.activity_at+1800000;action='idle';}
  if(at==null)return;
  const command={action,index:r.index,schedule_version:r.schedule_version};
  const timer=setTimer(()=>{timers.delete(r.id);void internal(r.id,command).catch(()=>{streams.closeAll('unavailable');});},Math.max(0,at-now()));timer.unref?.();timers.set(r.id,timer);
 }
 async function commit(old,next,flags={}){await store.save(next,flags);rooms.set(next.id,next);schedule(next);publish(next,old?.phase!==next.phase,old?.phase==='lobby'||next.phase==='lobby');return next;}
 async function finish(r,reason,status='finished'){
  r.status=status;r.phase=status;r.end_reason=reason;r.ended_at=now();r.schedule_version++;r.vote=null;
  const ranked=standings(r);for(const p of r.players){const s=ranked.find(s=>s.user_id===p.user_id);Object.assign(p,{points:s?.points||0,correct:s?.correct||0,rank:s?.rank||null});}
  await commit(rooms.get(r.id),r);
  for(const p of r.players)if(studentRooms.get(p.user_id)===r.id)studentRooms.delete(p.user_id);
  safety.closed(r.id,now());
  const timer=setTimer(()=>{if(terminal(rooms.get(r.id)||{}))rooms.delete(r.id);},600000);timer.unref?.();
  return r;
 }
 async function advance(r){
  if(r.asked_count>=r.questions.length)return finish(r,'completed');
  r.index=r.asked_count;r.asked_count++;r.phase='question';r.schedule_version++;r.opened_at=now();r.paused_ms=0;r.next_votes=[];
  r.deadline=now()+r.questions[r.index].seconds*1000;r.close_at=r.deadline+500;
  return commit(rooms.get(r.id),r);
 }
 async function closeQuestion(r){if(r.phase!=='question')return r;r.phase='reveal';r.reveal_at=now();r.schedule_version++;r.next_votes=[];return commit(rooms.get(r.id),r);}
 async function voteRound(r,stage,choices){r.vote={stage,options:choices,voters:activePlayers(r).map(p=>p.user_id),ballots:{},deadline:now()+30000,extended:false};r.schedule_version++;}
 async function decideVote(r,force=false){
  const decision=voteDecision(r.vote,now(),random,force);
  if(decision.extend){r.vote.extended=true;r.vote.deadline=now()+30000;r.schedule_version++;}
  if(decision.fallback){r.vote=null;r.scope={subject_id:null,branch_id:null,topic_ids:null};r.schedule_version++;}
  if(decision.winner){const chosen=r.vote.options.find(o=>o.id===decision.winner);r.vote_result={tied:decision.tied,label:chosen.label};
   if(r.vote.stage==='subject'){await voteRound(r,'scope',[{id:'all',label:'Cả môn',scope:chosen.scope}]);r.scope=chosen.scope;}
   else{r.scope=chosen.scope;r.vote=null;r.schedule_version++;for(const p of r.players)p.ready=false;}
  }
 }
 async function internal(id,command){return queue.run(id,async()=>{
  const original=rooms.get(id);if(!original||terminal(original)||!timerCurrent(original,command))return false;
  const r=structuredClone(original);
  if(command.action==='close')return closeQuestion(r);
  if(command.action==='open'&&r.phase==='countdown'||command.action==='advance'&&r.phase==='reveal')return advance(r);
  if(command.action==='vote_timeout'&&r.vote){await decideVote(r);return commit(original,r);}
  if(command.action==='idle'&&r.phase==='lobby'&&now()-r.activity_at>=1800000)return finish(r,'idle','closed');
  return false;
 },{internal:true});}
 async function player(user,r){const info=await identity(user);if(info.grade!==r.grade||r.kind==='class'&&info.class_id!==r.class_id)fail('Phòng ngoài khối / lớp của em',403);await safety.assertAvailable(user.id);return info;}
 function addPlayer(r,user,info){
  const short=String(user.full_name||'Bạn').trim().split(/\s+/).at(-1),same=r.players.filter(p=>p.display_name.split(' · ')[0].replace(/ \d+$/,'')===short).length;
  r.players.push({user_id:user.id,display_name:short+(same?' '+(same+1):''),class_name:info.class_name,team:null,ready:false,joined_at:now(),left_at:null});studentRooms.set(user.id,r.id);
 }
 async function createCore(user,data,members=[user]){
  admission();feature(({duel:'duel_code',team:'team',ffa:'ffa',class:'class'})[data.kind]);if(data.visibility==='public')feature('lobby');if(data.content_mode==='vote')feature('vote');
  if(rooms.size&&[...rooms.values()].filter(r=>!terminal(r)).length>=(config.battle_limits?.rooms||120))fail('Đã đạt giới hạn phòng',503);
  const info=data.kind==='class'?await identity(user,data.class_id,data.scope.subject_id):await identity(user);
  const scope=await normalizeScope(info.grade,data.scope);
  if(data.content_mode==='fixed'&&(!scope.subject_id||await deck.count(info.grade,scope)<data.question_count))fail('Phạm vi chưa đủ câu');
  for(const member of members){if(studentRooms.has(member.id))fail('Em đang trong một phòng khác',409);await safety.assertAvailable(member.id);}
  let code;do{code=String(randomInt(100000,1000000));}while([...rooms.values()].some(r=>!terminal(r)&&r.code===code));
  const r={...data,id:randomUUID(),run_id:randomUUID(),version:0,schedule_version:0,code,host_id:user.id,grade:info.grade,class_id:data.kind==='class'?data.class_id:null,scope,status:'lobby',phase:'lobby',index:-1,asked_count:0,players:[],questions:[],answers:[],time_factors:{multiple_choice:1,true_false:1.5,short_answer:1.5,matching:1.5},created_at:now(),activity_at:now()};
  try{
   if(data.kind!=='class')for(const member of members){const p=await player(member,r);if(await safety.blockedWith(member.id,r.players.map(p=>p.user_id)))fail('Không thể cùng phòng với người đã chặn',403);addPlayer(r,member,p);}
   if(data.content_mode==='vote'){const opts=await options(r.grade,r.question_count);await voteRound(r,'subject',opts.subjects.map(s=>({id:String(s.id),label:s.name,scope:{subject_id:s.id,branch_id:null,topic_ids:null}})));if(!r.vote.options.length)fail('Khối chưa đủ câu để cùng chọn');}
   await commit(null,r,{create:true});for(const p of r.players)safety.record(r.id,'join',p.user_id,{},now());return r;
  }catch(e){for(const p of r.players)if(studentRooms.get(p.user_id)===r.id)studentRooms.delete(p.user_id);throw e;}
 }
 const createUnlocked=(user,data,members)=>queue.run('@create',()=>createCore(user,data,members));
 async function create(user,data){return locks.run([user.id],async()=>{if(matchmaking?.has(user.id))fail('Hãy rời hàng chờ trước khi tạo phòng',409);return createUnlocked(user,data);});}
 async function join(user,id){return locks.run([user.id],()=>queue.run(id,async()=>{
  admission();const original=rooms.get(id);if(!original)fail('Phòng đã đóng',404);const r=structuredClone(original);feature(({duel:'duel_code',team:'team',ffa:'ffa',class:'class'})[r.kind]);
  const info=await player(user,r);if(r.phase!=='lobby'||activePlayers(r).length>=r.capacity)fail('Phòng đã bắt đầu hoặc đã đầy',409);
  if(studentRooms.has(user.id))fail('Em đang trong một phòng khác',409);if(r.players.some(p=>p.user_id===user.id))fail('Em đã rời phòng này',409);
  if(r.kind!=='class'&&await safety.blockedWith(user.id,activePlayers(r).map(p=>p.user_id)))fail('Không thể vào phòng này',403);
  addPlayer(r,user,info);r.activity_at=now();
  try{await commit(original,r);matchmaking?.removeUnlocked(user.id);safety.record(id,'join',user.id,{},now());return r;}catch(e){studentRooms.delete(user.id);throw e;}
 }));}
 async function leaveUnlocked(user,id,reason='left'){return queue.run(id,async()=>{
  const original=await get(id);access(original,user);if(terminal(original))return original;const r=structuredClone(original),p=r.players.find(p=>p.user_id===user.id);
  if(!p)return finish(r,reason,'interrupted');p.left_at=now();p.leave_reason=reason;r.activity_at=now();
  if(r.phase==='lobby'&&r.kind!=='class'&&isHost(r,user))r.host_id=activePlayers(r)[0]?.user_id||r.host_id;
  if(!activePlayers(r).length)await finish(r,reason,r.status==='lobby'?'closed':'finished');else await commit(original,r);
  studentRooms.delete(user.id);streams.closeUser(user.id,reason,id);safety.record(id,'leave',user.id,{reason},now());
  if(r.phase==='question'&&activePlayers(r).every(p=>r.answers.some(a=>a.idx===r.index&&a.user_id===p.user_id)))void internal(id,{action:'close',index:r.index,schedule_version:r.schedule_version});
  return r;
 });}
 async function command(user,id,action,data={},receivedAt=now()){return queue.run(id,async()=>{
  const original=await get(id);access(original,user,action!=='answer');
  if(action==='answer'){
   const old=original.answers.find(a=>a.idx===data.index&&a.user_id===user.id)||await store.receipt(id,data.index,user.id);
   if(old){if(old.client_id===data.client_id)return receipt(old);fail('Câu này em đã chốt',409,{receipt:receipt(old)});}
   if(config.battle_emergency_stop)fail('Đấu đang dừng khẩn cấp',403);
   await safety.assertAvailable(user.id);const p=original.players.find(p=>p.user_id===user.id);
   if(!p||p.left_at||original.phase!=='question'||original.index!==data.index||receivedAt>original.close_at||receivedAt<original.opened_at)fail('Câu đã đóng hoặc đang tạm dừng',409);
   const graded=data.skip?{score:0}:gradeQuestion(original.questions[data.index],data.response);if(graded.score==null)fail('Câu không tự chấm được',409);
   const a={room_id:id,idx:data.index,user_id:user.id,client_id:data.client_id,response:data.skip?null:data.response,skipped:Boolean(data.skip),score:graded.score,received_at:receivedAt,ms:Math.max(0,receivedAt-original.opened_at-original.paused_ms)};
   await store.answer(a);original.answers.push(a);publish(original);
   if(activePlayers(original).every(p=>original.answers.some(a=>a.idx===original.index&&a.user_id===p.user_id)))void internal(id,{action:'close',index:original.index,schedule_version:original.schedule_version});
   return receipt(a);
  }
  if(terminal(original))fail('Ván đã kết thúc',409);if(config.battle_emergency_stop)fail('Đấu đang dừng khẩn cấp',403);await safety.assertAvailable(user.id);
  const r=structuredClone(original),p=r.players.find(p=>p.user_id===user.id),host=isHost(r,user);r.activity_at=now();
  if(['ready','team','vote','nominate'].includes(action)&&r.phase!=='lobby')fail('Chỉ dùng trong phòng chờ',409);
  if(['start','pause','resume','end'].includes(action)&&!host)fail('Chỉ chủ phòng được điều khiển',403);
  if(action==='ready'){if(!p)fail('Chỉ người chơi sẵn sàng',403);p.ready=data.ready;}
  else if(action==='team'){feature('team');if(r.kind!=='team'||!p)fail('Không phải phòng đội',409);p.team=data.team;p.ready=false;}
  else if(action==='nominate'){
   feature('vote');if(!p)fail('Chỉ người chơi đề cử',403);
   if(!r.vote){if(!host)fail('Chủ phòng chọn nội dung sau khi hết phiếu',403);const scope=await normalizeScope(r.grade,data.scope);if(!scope.subject_id||await deck.count(r.grade,scope)<r.question_count)fail('Phạm vi chưa đủ câu');r.scope=scope;}
   else{if(r.vote.stage!=='scope'||r.vote.options.length>=4)fail('Đã đủ ba phạm vi đề cử',409);const scope=await normalizeScope(r.grade,{...data.scope,subject_id:r.scope.subject_id});if(await deck.count(r.grade,scope)<r.question_count)fail('Phạm vi chưa đủ câu');const catalog=await options(r.grade,r.question_count);const label=scope.topic_ids?.length===1?catalog.topics.find(t=>t.id===scope.topic_ids[0])?.name:scope.topic_ids?.length?`${scope.topic_ids.length} Bài`:scope.branch_id?catalog.branches.find(b=>b.id===scope.branch_id)?.name:'Cả môn';r.vote.options.push({id:randomUUID(),label:label||'Phạm vi đã chọn',scope});}
  }
  else if(action==='vote'){
   feature('vote');if(!r.vote||!r.vote.voters.includes(user.id))fail('Em không thuộc danh sách bỏ phiếu vòng này',403);
   if(!r.vote.options.some(o=>o.id===data.option_id))fail('Lựa chọn không hợp lệ');r.vote.ballots[user.id]=data.option_id;if(data.force&&!host)fail('Chỉ chủ phòng được chốt luôn',403);await decideVote(r,data.force);
  }
  else if(action==='start'){
   admission();const reasons=startReasons(r,now());if(reasons.length)fail(reasons.join('; '),409);
   r.questions=await deck.draw(r);r.scope.roster_ids=activePlayers(r).map(p=>p.user_id);r.scope.show_top3=r.kind==='class'&&Boolean(data.show_top3);r.show_top3=r.scope.show_top3;r.phase='countdown';r.status='playing';r.started_at=now();r.countdown_at=now()+3000;r.schedule_version++;
   await commit(original,r,{questions:true});return roomDto(r,user,now());
  }
  else if(action==='pause'){
   if(r.kind!=='class'||r.phase!=='question'||now()>=r.deadline)fail('Chỉ tạm dừng câu đang mở trước hạn',409);
   r.remaining=Math.max(1000,r.deadline-now());r.pause_at=now();r.phase='paused';r.schedule_version++;
  }
  else if(action==='resume'){if(r.kind!=='class'||r.phase!=='paused')fail('Phòng không tạm dừng',409);r.paused_ms+=now()-r.pause_at;r.deadline=now()+r.remaining;r.close_at=r.deadline+500;r.phase='question';r.schedule_version++;}
  else if(action==='next'){
   if(r.phase!=='reveal')fail('Chưa tới pha lời giải',409);if(r.kind==='class'&&!host)fail('Chỉ giáo viên được chuyển câu',403);
   r.next_votes=[...new Set([...(r.next_votes||[]),user.id])];if(r.kind==='class'||activePlayers(r).every(p=>r.next_votes.includes(p.user_id))){await advance(r);return roomDto(rooms.get(id),user,now());}
  }
  else if(action==='end'){
   if(!['question','paused','reveal'].includes(r.phase)||r.kind!=='class'&&activePlayers(r).length>1)fail('Chưa được kết thúc ván',409);
   await finish(r,'host_ended');return roomDto(r,user,now());
  }
  else if(action==='emote'){
   if(!p||r.kind==='class'||!['lobby','reveal'].includes(r.phase))fail('Không dùng biểu cảm ở pha này',409);
   if(p.emote_at&&now()-p.emote_at<10000)fail('Chờ 10 giây giữa hai biểu cảm',429);p.emote_at=now();r.emote={kind:data.kind,at:now()};
  }else fail('Lệnh không hợp lệ');
  await commit(original,r);if(action==='emote'||action==='team')safety.record(id,action,user.id,action==='team'?{team:data.team}:{kind:data.kind},now());
  return roomDto(r,user,now());
 });}
 async function snapshot(user,id,result=false){const r=await get(id);access(r,user,!result);if(result&&!terminal(r))fail('Ván chưa kết thúc',409);return roomDto(r,user,now());}
 async function lobby(user){
  let cached=lobbyIdentities.get(user.id);if(!cached||now()-cached.at>=60000){cached={at:now(),info:await identity(user)};if(lobbyIdentities.size>=2400)lobbyIdentities.delete(lobbyIdentities.keys().next().value);lobbyIdentities.set(user.id,cached);}
  const info=cached.info,blocked=new Set(await safety.blockedIds(user.id)),items=[];
  for(const r of rooms.values())if(r.phase==='lobby'&&r.grade===info.grade&&activePlayers(r).length<r.capacity&&(r.kind==='class'?config.battle_modes.class&&r.class_id===info.class_id:config.battle_modes.lobby&&r.visibility==='public'&&!activePlayers(r).some(p=>blocked.has(p.user_id))))items.push(lobbyCard(r));
  return {...streams.envelope(),rooms:items,match:matchmaking?.status(user.id)||null,current_room_id:studentRooms.get(user.id)||null};
 }
 async function configure(next){config=next;queue.configure?.(next.battle_limits?.queue_pending||200);streams.configure(next.battle_limits||{});if(next.battle_emergency_stop){matchmaking?.clear();streams.closeAll('emergency');const results=await Promise.allSettled([...rooms.values()].filter(r=>!terminal(r)).map(r=>queue.run(r.id,()=>finish(structuredClone(rooms.get(r.id)),'emergency','interrupted'),{internal:true})));if(results.some(r=>r.status==='rejected'))fail('Đã chặn chơi; chưa ghi đủ trạng thái gián đoạn, hãy thử dừng lại',503);}}
 function periodic(){housekeeping=setTimer(async()=>{try{await safety.purgeExpired();safety.prune(now());}catch{/* Lỗi dọn không được làm ngừng nhận đáp án. */}finally{periodic();}},3600000);housekeeping.unref?.();}
 return {rooms,studentRooms,locks,queue,feature,admission,access,get,create,createUnlocked,join,command,snapshot,lobby,internal,configure,
  setMatchmaking:value=>{matchmaking=value;},
  byCode:code=>[...rooms.values()].find(r=>!terminal(r)&&r.code===code)?.id,
  leave:(user,id,reason)=>locks.run([user.id],()=>leaveUnlocked(user,id,reason)),leaveUnlocked,
  suspend:userId=>locks.run([userId],async()=>{matchmaking?.removeUnlocked(userId);const id=studentRooms.get(userId);if(id)await leaveUnlocked({id:userId,role:'student'},id,'suspended');streams.closeUser(userId,'suspended');}),
  start:async cfg=>{await store.recover();await configure(cfg);periodic();},
  dispose:()=>{clearTimer(housekeeping);for(const t of timers.values())clearTimer(t);timers.clear();},
  history:async user=>Promise.all((await store.history(user)).map(id=>snapshot(user,id,true))),
 };
}
