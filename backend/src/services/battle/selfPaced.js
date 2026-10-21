import {randomUUID} from 'node:crypto';
import {gradeQuestion} from '../practice/grading.js';
import {activePlayers} from './engine.js';
import {answerPoints,modeError,progressDto,totalExpired} from './modes.js';

// Chỉ gọi bên trong hàng lệnh phòng.
export function createSelfPaced({now,commit,finish,bots,getConfig,random}){
 function issue(r,key){
  const old=r.progress[key],cursor=old?old.cursor+1:0;
  r.progress[key]={cursor,issued_count:cursor+1,phase:'question',opened_at:null,deadline:null,paused_ms:0,progress_version:(old?.progress_version||0)+1,auto_next_at:null};
  r.asked_count=Math.max(r.asked_count,cursor+1);
  const player=r.players.find(p=>String(p.user_id)===String(key));
  if(player?.is_bot){r.bot_plans??={};r.bot_plans[key]=bots.plan(r,player,getConfig(),random);}
 }
 async function open(r){
  r.phase='question';r.schedule_version++;r.progress={};
  const keys=activePlayers(r).map(p=>p.user_id);for(const key of keys)issue(r,key);
  return commit(null,r,{progressKeys:keys,openKeys:keys,noPlayers:true});
 }
 function answer(r,key,data,at,timedOut=false){
  const p=r.progress[key],player=r.players.find(x=>String(x.user_id)===String(key));
  if(r.phase!=='question'||p?.phase!=='question'||p.cursor!==data.index||at<p.opened_at||(!timedOut&&r.time_limit!=='total'&&at>p.deadline))modeError('BATTLE_QUESTION_CLOSED','Câu đã đóng hoặc đang tạm dừng',409);
  const score=data.skip?0:gradeQuestion(r.questions[p.cursor],data.response).score;
  if(score==null)modeError('BATTLE_QUESTION_CLOSED','Câu không tự chấm được',409);
  const ms=Math.max(0,at-p.opened_at-p.paused_ms),a={room_id:r.id,idx:p.cursor,user_id:player.user_id,bot_slot:player.bot_slot,client_id:data.client_id,response:data.skip?null:data.response,score,ms,skipped:Boolean(data.skip),timed_out:timedOut,received_at:at,schedule_version:r.schedule_version,...answerPoints(r,r.questions[p.cursor],score,ms)};
  r.answers.push(a);p.phase=p.cursor===r.questions.length-1?'done':'feedback';p.deadline=null;p.auto_next_at=p.phase==='feedback'&&r.time_limit!=='total'?now()+3000:null;p.progress_version++;
  return a;
 }
 const completed=r=>activePlayers(r).every(p=>r.progress[p.user_id]?.phase==='done');
 async function save(r,flags){
  if(completed(r))return finish(r,'completed','finished',flags);
  return commit(null,r,{...flags,noPlayers:true,lean:true,privateKeys:flags.progressKeys});
 }
 async function submit(r,key,data,at){const a=answer(r,key,data,at);await save(r,{progressKeys:[key],answers:[a]});return a;}
 async function next(r,key,expected){
  const p=r.progress[key];
  if(!Number.isInteger(expected)||!p||expected!==p.cursor)modeError('BATTLE_CURSOR_CONFLICT','Tiến độ đã thay đổi',409,{my_progress:progressDto(p)});
  if(r.phase!=='question'||p.phase!=='feedback')modeError('BATTLE_QUESTION_CLOSED','Chưa thể chuyển câu',409);
  // Đồng hồ được kiểm tra lại sau thời gian chờ DB; không phát câu sau hạn.
  if(totalExpired(r,now()))return finish(r,'total_timeout');
  const asked=r.asked_count;issue(r,key);return save(r,{progressKeys:[key],openKeys:[key],askedChanged:r.asked_count!==asked});
 }
 function events(r){
  if(r.phase!=='question')return [];
  const list=[];
  if(r.ends_at!=null)list.push({at:r.ends_at,kind:'total'});
  for(const player of activePlayers(r)){
   const key=player.user_id,p=r.progress?.[key];if(!p)continue;
   if(p.phase==='question'){
    if(p.deadline!=null)list.push({at:p.deadline,kind:'timeout',key});
    if(player.is_bot&&r.bot_plans?.[key])list.push({at:p.opened_at+p.paused_ms+r.bot_plans[key].delay,kind:'bot',key});
   }else if(p.phase==='feedback'&&p.auto_next_at!=null)list.push({at:p.auto_next_at,kind:'next',key});
  }
  return list.sort((a,b)=>a.at-b.at);
 }
 async function tick(r){
  if(r.phase!=='question')return r;
  if(totalExpired(r,now()))return finish(r,'total_timeout');
  const due=events(r).filter(e=>e.at<=now()),keys=new Set(),opened=[],answers=[],asked=r.asked_count;
  for(const e of due){
   if(keys.has(e.key))continue;
   const p=r.progress[e.key];
   if(e.kind==='next'){issue(r,e.key);opened.push(e.key);}
   else if(e.kind==='timeout'||e.kind==='bot'){
    const expired=e.kind==='timeout'||p.deadline!=null&&now()>p.deadline;
    answers.push(answer(r,e.key,{index:p.cursor,client_id:randomUUID(),...(expired?{skip:true}:{response:r.bot_plans[e.key].response})},now(),expired));
   }
   keys.add(e.key);
  }
  if(!keys.size)return r;
  return save(r,{progressKeys:[...keys],openKeys:opened,answers,askedChanged:r.asked_count!==asked});
 }
 function pause(r){r.pause_at=now();r.phase='paused';r.schedule_version++;}
 function resume(r){
  const elapsed=now()-r.pause_at;
  if(r.ends_at!=null)r.ends_at+=elapsed;
  for(const p of Object.values(r.progress||{})){
   if(p.phase==='question'){p.paused_ms+=elapsed;if(p.deadline!=null)p.deadline+=elapsed;}
   if(p.auto_next_at!=null)p.auto_next_at+=elapsed;p.progress_version++;
  }
  r.phase='question';r.schedule_version++;
 }
 return {open,submit,next,tick,events,pause,resume,completed};
}
