import {intersectScopes} from './engine.js';
import {fail} from '../practice/config.js';
export function createMatchmaking({rooms,deck,safety,identity,normalizeScope,broaden,streams,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const entries=new Map(),offers=new Map();let matching=Promise.resolve();
 const status=id=>{const e=entries.get(id);return e?{kind:e.kind,scope:e.scope,joined_at:e.at,offer:e.offer||null,suggestion:now()-e.at>=60000?'public_room_or_practice':null,waiting:[...entries.values()].filter(x=>x.grade===e.grade&&x.scope.subject_id===e.scope.subject_id).length}:null;};
 function removeUnlocked(id){entries.delete(id);clearTimer(offers.get(id));offers.delete(id);streams.publish('lobby');}
 async function attempt(){
  const list=[...entries.values()].sort((a,b)=>a.at-b.at);
  if(list.length<2)return;
  const pairs=await safety.blockedPairs(list.map(e=>e.user.id)),blocked=new Set();
  for(const pair of pairs){blocked.add(`${pair.user_id}:${pair.blocked_id}`);blocked.add(`${pair.blocked_id}:${pair.user_id}`);}
  const counts=new Map();
  async function count(grade,scope){const key=JSON.stringify([grade,scope]);if(!counts.has(key))counts.set(key,await deck.count(grade,scope));return counts.get(key);}
  for(const first of list){
   if(!entries.has(first.user.id))continue;const group=[first];let common=first.scope;
   for(const candidate of list){if(candidate===first||!entries.has(candidate.user.id)||candidate.grade!==first.grade||candidate.kind!==first.kind)continue;
    const combined=intersectScopes([...group.map(e=>e.scope),candidate.scope]);if(!combined||group.some(e=>blocked.has(`${candidate.user.id}:${e.user.id}`)))continue;
    if(combined.subject_id&&await count(first.grade,combined)<7)continue;group.push(candidate);common=combined;
    if(first.kind==='duel'||group.length>=3)break;
   }
   if(group.length<2||first.kind==='ffa'&&group.length<3&&!group.every(e=>now()-e.at>30000))continue;
   await rooms.locks.run(group.map(e=>e.user.id),async()=>{
    if(group.some(e=>entries.get(e.user.id)!==e||rooms.studentRooms.has(e.user.id)))return;
    for(const e of group)await safety.assertAvailable(e.user.id);
    const r=await rooms.createUnlocked(first.user,{kind:first.kind,visibility:first.kind==='ffa'?'public':'code',content_mode:common.subject_id?'fixed':'vote',scope:common,question_count:7,seconds:30,capacity:first.kind==='duel'?2:20},group.map(e=>e.user));
    for(const e of group)removeUnlocked(e.user.id);streams.publish('lobby',true);return r;
   });
  }
 }
 function match(){matching=matching.catch(()=>{}).then(attempt);return matching;}
 async function join(user,data){rooms.admission();rooms.feature('matchmaking');if(data.kind==='ffa'){rooms.feature('ffa');rooms.feature('lobby');}
  await rooms.locks.run([user.id],async()=>{
   if(entries.has(user.id)||rooms.studentRooms.has(user.id))fail('Em đã ở phòng hoặc hàng chờ',409);await safety.assertAvailable(user.id);
   const info=await identity(user),scope=await normalizeScope(info.grade,data.scope);if(!scope.subject_id)rooms.feature('vote');else if(await deck.count(info.grade,scope)<7)fail('Phạm vi chưa đủ câu');
   const e={user,grade:info.grade,kind:data.kind,scope,at:now()};entries.set(user.id,e);
   const timer=setTimer(async()=>{offers.delete(user.id);if(entries.get(user.id)!==e)return;try{e.offer=await broaden(e.grade,e.scope);streams.publish('lobby');await match();}catch{/* Hàng chờ vẫn giữ nguyên phạm vi khi không thể đề nghị nới. */}if(entries.get(user.id)===e){const suggestion=setTimer(()=>{offers.delete(user.id);streams.publish('lobby');},30000);suggestion.unref?.();offers.set(user.id,suggestion);}},30001);timer.unref?.();offers.set(user.id,timer);
  });await match();return {current_room_id:rooms.studentRooms.get(user.id)||null,queue:status(user.id)};
 }
 return {join,status,has:id=>entries.has(id),removeUnlocked,clear:()=>{for(const id of entries.keys())removeUnlocked(id);},
  leave:user=>rooms.locks.run([user.id],async()=>{removeUnlocked(user.id);return {ok:true};}),
  expand:async user=>{rooms.feature('matchmaking');await rooms.locks.run([user.id],async()=>{const e=entries.get(user.id);if(!e?.offer)fail('Chưa có lời mời nới phạm vi',409);e.scope=e.offer.scope;e.offer=null;});await match();return {queue:status(user.id),current_room_id:rooms.studentRooms.get(user.id)||null};},
  match,
 };
}
