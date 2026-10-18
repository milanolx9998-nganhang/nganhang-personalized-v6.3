import {randomUUID} from 'node:crypto';
import {defaults} from '../../src/services/practice/config.js';
import {createRooms} from '../../src/services/battle/rooms.js';
export function question(type='multiple_choice',index=0){
 const data={multiple_choice:{options:['A','B','C','D'].map(id=>({id,text:id})),answer:{correct:'B'}},true_false:{statements:['a','b','c','d'].map(id=>({id,text:id})),answer:{values:{a:true,b:false,c:true,d:false}}},short_answer:{answer:{numeric:2.5,tolerance:.1,unit:'m'}},matching:{left:[{id:'a',text:'A'},{id:'b',text:'B'}],right:[{id:'1',text:'Một'},{id:'2',text:'Hai'}],answer:{pairs:{a:'1',b:'2'}}}};
 return {id:randomUUID(),question_version_id:randomUUID(),idx:index,question_id:index+1,topic_id:1,subject_id:1,grade:9,cognitive_level:1,auto_gradable:true,seconds:20,curriculum_snapshot:{topic_name:'Bài kiểm thử',topic_id:1},content:{type,stem:'Câu '+index,explanation:'Lời giải kín '+index,...data[type]}};
}
export function fixture(){
 let time=1000;const calls=[],timers=new Map(),saved=new Map();let serial=0;
 const store={save:async r=>{calls.push('save');saved.set(r.id,structuredClone(r));},load:async id=>structuredClone(saved.get(id)),receipt:async()=>null,answer:async a=>{calls.push('commit_answer');},recover:async()=>{calls.push('recover');},history:async()=>[]};
 const safety={assertAvailable:async()=>{},blockedWith:async()=>false,blockedIds:async()=>[],blockedPairs:async()=>[],record:()=>{},closed:()=>{},purgeExpired:async()=>{},prune:()=>{}};
 const streams={publish:()=>{},configure:()=>{},closeUser:()=>{},closeAll:()=>{},envelope:()=>({})};
 const manager=createRooms({store,safety,streams,deck:{count:async()=>20,draw:async()=>Array.from({length:7},(_,i)=>question(['multiple_choice','true_false','short_answer','matching'][i%4],i))},identity:async()=>{calls.push('identity');return {grade:9,class_id:1,class_name:'9A'};},normalizeScope:async(_g,s)=>s,options:async()=>({subjects:[{id:1,name:'KHTN'}]}),now:()=>time,setTimer:(f,ms)=>{const id=++serial;timers.set(id,{f,ms});return id;},clearTimer:id=>timers.delete(id)});
 const config={...defaults,battle_enabled:true,battle_modes:Object.fromEntries(Object.keys(defaults.battle_modes).map(k=>[k,true]))};
 const users=[1,2,3].map(id=>({id,full_name:'Học sinh '+id,role:'student'}));
 const data={kind:'duel',visibility:'code',content_mode:'fixed',scope:{subject_id:1},capacity:2,question_count:7,seconds:20};
 async function playing(kind='duel'){
  await manager.configure(config);const host=kind==='class'?{id:99,role:'teacher'}:users[0];
  const r=await manager.create(host,{...data,kind,...(kind==='class'?{class_id:1,capacity:50}:{})});
  if(kind==='class')await manager.join(users[0],r.id);await manager.join(users[1],r.id);
  if(kind!=='class')for(const u of users.slice(0,2))await manager.command(u,r.id,'ready',{ready:true});
  await manager.command(host,r.id,'start');const live=manager.rooms.get(r.id);time=4000;
  await manager.internal(r.id,{action:'open',index:live.index,schedule_version:live.schedule_version});return {id:r.id,host};
 }
 return {manager,store,safety,streams,users,data,config,calls,timers,saved,playing,setTime:t=>{time=t;},now:()=>time};
}
