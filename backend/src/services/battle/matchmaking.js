import {prepareSeeking,seekingGroups} from './lobby.js';
import {fail} from '../practice/config.js';
import {prepareTicket,ticketState,commonScopes,intersection,roomFits,scopeWidth} from './flex.js';
import {flexConfig,rankConfig} from './settings.js';
import {mmrCompatible} from './ratings.js';
import {questionDto,lobbyCard} from './dto.js';

export function createMatchmaking({rooms,deck,safety,identity,normalizeScope,learning,goldenHours,ratings,streams,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const entries=new Map(),excluded=new Map(),counts=new Map();let running=null,dirty=false,timer,cursor=0,activity={at:0,n:0};
 async function count(grade,scope){const key=JSON.stringify([grade,scope]);if(!counts.has(key))counts.set(key,await deck.count(grade,scope));return counts.get(key);}
 const cfg=()=>rooms.getConfig(),flex=()=>flexConfig(cfg());
 function refresh(e){const banners=goldenHours?.banners(e.grade,now(),cfg()).filter(b=>b.active)||[],golden=banners.some(b=>!b.subject_id)?true:new Set(banners.map(b=>b.subject_id));e.current=ticketState(e,now(),cfg(),golden);return e;}
 function status(id){const e=entries.get(id);if(!e)return null;refresh(e);const count=[...entries.values()].filter(x=>x.grade===e.grade).length;
  return {...e.current,ids:undefined,kinds:e.kinds,choices:e.choices,lengths:e.lengths,accepted_kinds:e.current.kinds,accepted_lengths:e.current.lengths,bot_available:Boolean(cfg().battle_modes?.bot&&e.current.bot_available),flex:e.flex,ranked:e.ranked,bot_fill:e.bot_fill,joined_at:e.at,scope:{subject_id:e.choices[0]?.subject_id??null,topic_ids:e.current.ids},current_scope_label:({none:'Phần em đã chọn',chapter:'Mở tới Chương trong phần em đã học',subject:'Mở tới môn trong phần em đã học'})[e.current.widened],suggestion_room:e.suggestion||null,waiting:count>=flex().waiting_visible_min?count:null,school_practicing:Array.isArray(activity.ids)?new Set([...activity.ids,...entries.keys(),...rooms.studentRooms.keys()]).size:Math.max(activity.n,new Set([...entries.keys(),...rooms.studentRooms.keys()]).size),quick_question:e.quick_question||null};
 }
 function removeUnlocked(id){entries.delete(id);if(!entries.size){clearTimer(timer);timer=null;}streams.publish('lobby');}
 function exclude(id,room){excluded.set(id+':'+room,now()+flex().exclude_ms);}
 function isExcluded(id,room){return (excluded.get(id+':'+room)||0)>now();}
 function arm(){if(timer||!entries.size)return;timer=setTimer(async()=>{timer=null;try{await match();}catch{/* Vé còn nguyên nếu DB bận; vòng sau kiểm lại. */}finally{arm();}},flex().round_ms);timer.unref?.();}
 async function makeEntry(user,data){
  const info=await identity(user),choices=[],rawChoices=data.choices??(data.scope?[data.scope]:[]);for(const raw of rawChoices)choices.push(await normalizeScope(info.grade,raw));
  const {topics,practiced}=await learning.forStudent(user.id,info.grade),e={user,grade:info.grade,kinds:data.kinds??[data.kind],choices,lengths:data.lengths??'any',flex:data.flex??'gradual',ranked:data.ranked!==false,bot_fill:Boolean(data.bot_fill),at:now(),...prepareTicket(choices,topics,practiced),mmr:ratings?await ratings.mmrs(user.id,info.grade,cfg()):{}};
  refresh(e);if(!e.original.length)fail('Khối chưa có Bài phù hợp');
  e.single_lesson=e.original.length===1&&rawChoices.every(s=>s.topic_ids?.length===1&&!s.chapter);
  let enough=false;for(const s of commonScopes([e]))if(await deck.count(e.grade,s)>=Math.min(...(e.lengths==='any'?[7,10,15]:e.lengths))){enough=true;break;}if(!enough)fail('Phạm vi chưa đủ câu');
  if(deck.available){const q=(await deck.available(e.grade,{topic_ids:e.original}))[0];if(q)e.quick_question=questionDto(q);}
  return e;
 }
 function checkFeatures(e){rooms.admission();rooms.feature('matchmaking');if(e.kinds.includes('ffa'))rooms.feature('ffa');}
 async function rankMeta(group,scope,length,bot=false){
  if(!cfg().battle_modes?.ranked)return {scope,meta:{rank_enabled:false}};
  const subjectIds=scope.subject_ids||[scope.subject_id],d=rankConfig(cfg()),ranked={},width=scopeWidth(scope,group[0].topics);
  for(const e of group)ranked[e.user.id]=Boolean(cfg().battle_modes?.ranked&&e.ranked&&!(e.single_lesson&&e.current.widened==='none')&&d.ranked_lengths.includes(length)&&scopeWidth({...scope,topic_ids:e.current.ids.filter(id=>e.topics.some(t=>t.id===id&&subjectIds.includes(t.subject_id)))},e.topics)!=='lesson'&&(!bot||now()-e.at>=d.bot_wait_ms));
  let finalScope=scope,mix=null,finalWidth=width;
  if(Object.values(ranked).some(Boolean)){
   const cap=intersection(group.map(e=>e.ceiling)),broad=intersection(group.filter(e=>ranked[e.user.id]).map(e=>e.current.ids));
   const ids=cap.filter(id=>broad.includes(id)&&group[0].topics.some(t=>t.id===id&&subjectIds.includes(t.subject_id))),candidate={...scope,topic_ids:ids};
   if(scopeWidth(candidate,group[0].topics)!=='lesson'){
    finalScope=candidate;finalWidth=scopeWidth(candidate,group[0].topics);
    if(ids.some(id=>!scope.topic_ids.includes(id))){const outside=ids.filter(id=>!scope.topic_ids.includes(id)),narrowCount=Math.ceil(length*d.narrow_ratio);
     if(await count(group[0].grade,scope)>=narrowCount&&await count(group[0].grade,{...scope,topic_ids:outside})>=length-narrowCount)mix={narrow:scope.topic_ids,narrow_count:narrowCount};else finalScope=scope;
    }
   }
   if(scopeWidth(finalScope,group[0].topics)==='lesson')for(const key of Object.keys(ranked))ranked[key]=false;
  }
  finalWidth=scopeWidth(finalScope,group[0].topics);
  return {scope:finalScope,meta:{rank_enabled:Object.values(ranked).some(Boolean),ranked,width:finalWidth,subject_ids:subjectIds,rank_rules:d,mix}};
 }
 async function groupPlan(group){
  const kinds=intersection(group.map(e=>e.current.kinds)),lengths=intersection(group.map(e=>e.current.lengths)).sort((a,b)=>a-b);if(!kinds.length||!lengths.length)return null;
  const kind=group.length>2?'ffa':kinds.includes('duel')?'duel':'ffa';if(!kinds.includes(kind))return null;
  for(const scope of commonScopes(group)){
   if(!mmrCompatible(group,scope.subject_ids||[scope.subject_id],now(),cfg()))continue;
   for(const length of lengths)if(await count(group[0].grade,scope)>=length){const ranked=await rankMeta(group,scope,length);if(ranked.meta.rank_enabled&&group.length>rankConfig(cfg()).max_players)continue;return {kind,question_count:length,...ranked};}
  }return null;
 }
 async function createGroup(group,plan,extra={}){
  return rooms.locks.run(group.map(e=>e.user.id),async()=>{
   if(group.some(e=>entries.get(e.user.id)!==e||rooms.studentRooms.has(e.user.id)))return null;
   for(const e of group){checkFeatures(e);refresh(e);await safety.assertAvailable(e.user.id);}
   const checked=group.length>1?await groupPlan(group):plan;if(!checked)return null;
   const r=await rooms.createUnlocked(group[0].user,{kind:checked.kind,visibility:cfg().battle_modes?.lobby?'public':'code',content_mode:'fixed',scope:checked.scope,question_count:checked.question_count,seconds:flex().seconds,capacity:checked.kind==='duel'?2:group.length+(extra.bot_difficulty?1:0),auto_match:true,match_meta:checked.meta,...extra},group.map(e=>e.user));
   for(const e of group)removeUnlocked(e.user.id);return r;
  });
 }
 async function attempt(){
  counts.clear();
  if(!entries.size)return;if(!cfg()?.battle_enabled||cfg().battle_emergency_stop||!cfg().battle_modes?.matchmaking){clear();return;}
  if(goldenHours&&cfg().battle_modes?.golden_hour)await goldenHours.refresh();
  if(now()-activity.at>=10000||!activity.at){const value=await learning.activity(now()-flex().activity_ms);activity={at:now(),n:Array.isArray(value)?value.length:value,ids:Array.isArray(value)?value:null};}
  for(const [key,until] of excluded)if(until<=now())excluded.delete(key);
  const all=[...entries.values()].sort((a,b)=>a.at-b.at||a.user.id-b.user.id),limit=flex().batch_size;
  // Gốc luôn lâu nhất; con trỏ quét phần còn lại để vé ngoài 50 đầu không bị bỏ đói.
  const rest=all.slice(1),window=[];for(let i=0;i<Math.min(limit-1,rest.length);i++)window.push(rest[(cursor+i)%rest.length]);cursor=rest.length?(cursor+limit-1)%rest.length:0;
  const list=[all[0],...window].sort((a,b)=>a.at-b.at||a.user.id-b.user.id).map(refresh),roomList=[...rooms.rooms.values()].filter(r=>r.phase==='lobby'),ids=[...new Set([...list.map(e=>e.user.id),...roomList.flatMap(r=>r.players.filter(p=>!p.is_bot&&!p.left_at).map(p=>p.user_id))])];
  const pairs=await safety.blockedPairs(ids),blocked=new Set(pairs.flatMap(p=>[p.user_id+':'+p.blocked_id,p.blocked_id+':'+p.user_id]));
  for(const e of list)e.suggestion=roomList.filter(r=>!isExcluded(e.user.id,r.id)&&roomFits(e,r,now(),cfg())&&!r.players.some(p=>!p.left_at&&blocked.has(e.user.id+':'+p.user_id))).sort((a,b)=>a.created_at-b.created_at).map(lobbyCard)[0]||null;
  for(const first of list){
   if(!entries.has(first.user.id)||first.suggestion)continue;
   let group=[first],plan=null;
   const candidates=list.filter(e=>e!==first&&entries.has(e.user.id)&&!e.suggestion&&e.grade===first.grade).sort((a,b)=>intersection([first.current.ids,a.current.ids]).length-intersection([first.current.ids,b.current.ids]).length||a.at-b.at);
   for(const e of candidates){if(group.some(g=>blocked.has(g.user.id+':'+e.user.id)))continue;
    const next=await groupPlan([...group,e]);if(!next)continue;group.push(e);plan=next;if(next.kind==='duel'||group.length>=Math.min(flex().max_group,next.meta.rank_enabled?rankConfig(cfg()).max_players:flex().max_group))break;
   }
   if(plan&&plan.kind==='ffa'&&group.length>=2&&group.length<rankConfig(cfg()).max_players&&cfg().battle_modes?.bot&&group.every(e=>e.bot_fill&&now()-e.at>=rankConfig(cfg()).bot_wait_ms)){await createGroup(group,plan,{bot_difficulty:flex().bot_default});continue;}
   if(!plan||group.length<2||plan.kind==='ffa'&&group.length<flex().min_group&&!group.every(e=>now()-e.at>=(group.every(x=>x.bot_fill)&&cfg().battle_modes?.bot?Math.max(flex().pair_ms,rankConfig(cfg()).bot_wait_ms):flex().pair_ms)))continue;
   await createGroup(group,plan);
  }
  streams.publish('lobby');
 }
 function match(){dirty=true;if(running)return running;running=(async()=>{do{dirty=false;await attempt();}while(dirty);})().finally(()=>{running=null;arm();});return running;}
 async function join(user,data){const e=await makeEntry(user,data);checkFeatures(e);await rooms.locks.run([user.id],async()=>{if(entries.has(user.id)||rooms.studentRooms.has(user.id))fail('Em đã ở phòng hoặc hàng chờ',409);await safety.assertAvailable(user.id);entries.set(user.id,e);});await match();return {current_room_id:rooms.studentRooms.get(user.id)||null,queue:status(user.id)};}
 async function acceptRoom(user,id){const existing=rooms.rooms.get(id);return rooms.locks.run([user.id,...(existing?.players||[]).filter(p=>!p.is_bot).map(p=>p.user_id)],async()=>{
  const e=entries.get(user.id);if(!e)fail('Không còn vé',409);checkFeatures(e);refresh(e);
  const r=await rooms.joinUnlocked(user,id,async r=>{if(isExcluded(user.id,id)||!roomFits(e,r,now(),cfg()))fail('Phòng không còn phù hợp',409);});return {current_room_id:r.id,queue:null};
 });}
 async function exit(user,{to,difficulty},direct=null){
  let e=entries.get(user.id);if(direct){if(e)fail('Dùng lối thoát trên vé đang chờ',409);e=await makeEntry(user,{...direct,kinds:['duel'],ranked:false});}
  if(!e)fail('Không còn vé',409);refresh(e);
  if(to==='bot'){rooms.admission();rooms.feature('bot');if(!direct&&!e.current.bot_available)fail('Chưa tới mốc đấu với máy',409);}
  else if(!e.current.exits_available)fail('Chưa tới mốc mở lối thoát',409);
  return rooms.locks.run([user.id],async()=>{
   if((!direct&&entries.get(user.id)!==e)||rooms.studentRooms.has(user.id))fail('Vé đã đổi',409);await safety.assertAvailable(user.id);
   if(to==='practice'){const scope=commonScopes([{...e,current:{...e.current,ids:e.original}}])[0];removeUnlocked(user.id);return {to:'practice',scope,choices:e.choices,current_room_id:null};}
   let scope,length;for(const s of commonScopes([e])){for(const n of e.current.lengths.slice().sort((a,b)=>a-b))if(await deck.count(e.grade,s)>=n){scope=s;length=n;break;}if(scope)break;}if(!scope)fail('Kho không còn đủ câu',409);
   const meta=await rankMeta([e],scope,length,to==='bot');
   const r=await rooms.createUnlocked(user,{kind:to==='bot'?'duel':e.current.kinds[0],visibility:to==='bot'?'code':'public',content_mode:'fixed',scope:meta.scope,question_count:length,seconds:flex().seconds,capacity:to==='bot'||e.current.kinds[0]==='duel'?2:flex().max_group,auto_match:to==='bot',...(to==='bot'?{bot_difficulty:difficulty||flex().bot_default,match_meta:direct?{rank_enabled:false}:meta.meta}:{})});removeUnlocked(user.id);return {to,current_room_id:r.id,queue:null};
  });
 }
 function clear(){clearTimer(timer);timer=null;entries.clear();streams.publish('lobby');}
 return {join,status,has:id=>entries.has(id),removeUnlocked,exclude,acceptRoom,exit,match,clear,
  lobbyEntries:grade=>prepareSeeking([...entries.values()].filter(e=>e.grade===grade).map(refresh)),
  seeking:context=>seekingGroups([...entries.values()].map(refresh),context),
  participants:(grade,subject)=>[...entries.values()].filter(e=>e.grade===grade&&(!subject||e.topics.some(t=>t.subject_id===subject&&e.current.ids.includes(t.id)))).length+[...rooms.rooms.values()].filter(r=>r.grade===grade&&r.status==='playing'&&(!subject||r.scope.subject_id===subject||r.scope.subject_ids?.includes(subject))).reduce((n,r)=>n+r.players.filter(p=>!p.is_bot&&!p.left_at).length,0),
  leave:user=>rooms.locks.run([user.id],async()=>{removeUnlocked(user.id);return {ok:true};}),
  expand:async()=>fail('Vé mới dùng flex:gradual để đồng ý lịch nới ngay khi vào hàng chờ',410)
 };
}
