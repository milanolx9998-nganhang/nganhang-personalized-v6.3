import {normalizeQuestion} from '../practice/grading.js';
// Luật thuần: thời gian và nguồn bốc thăm do bên gọi cung cấp.
export const terminal = room => ['finished','interrupted','closed'].includes(room.status);
export const activePlayers = room => room.players.filter(p=>!p.left_at);
export const answerKey = (index,userId) => `${index}:${userId}`;
export function standings(room, through=room.asked_count) {
 const rows=room.players.filter(p=>!room.scope?.roster_ids||room.scope.roster_ids.includes(p.user_id)).map(p=>{
  const answers=room.answers.filter(a=>a.user_id===p.user_id&&a.idx<through);
  return {user_id:p.user_id,name:p.display_name,class_name:p.class_name,team:p.team,points:answers.reduce((s,a)=>s+Number(a.score)*100,0),correct:answers.filter(a=>Number(a.score)===1).length,ms:answers.reduce((s,a)=>s+a.ms,0)};
 });
 return rows.map(p=>({...p,rank:1+rows.filter(x=>x.points>p.points+1e-8).length})).sort((a,b)=>b.points-a.points);
}
export function teamStandings(room,through=room.asked_count){
 const rows=standings(room,through),teams=[1,2].map(team=>{const members=rows.filter(p=>p.team===team);return {team,points:members.length?members.reduce((s,p)=>s+p.points,0)/members.length:0};});
 return teams.map(t=>({...t,rank:1+teams.filter(x=>x.points>t.points+1e-8).length}));
}
export function startReasons(room,now){
 const players=activePlayers(room),reasons=[];
 if(room.phase!=='lobby'||room.vote)reasons.push('Chờ chọn xong nội dung');
 if(!room.scope.subject_id)reasons.push('Chưa chọn nội dung');
 if(players.length<(room.kind==='class'?1:2)||players.length>room.capacity)reasons.push('Chưa đủ người hoặc vượt sức chứa');
 if(room.kind!=='class'&&players.some(p=>!p.ready))reasons.push('Chờ mọi người Sẵn sàng');
 if(room.kind==='team'&&([1,2].some(t=>{const n=players.filter(p=>p.team===t).length;return n<1||n>4;})||players.some(p=>![1,2].includes(p.team))))reasons.push('Cần đúng hai đội, mỗi đội 1–4 bạn');
 return reasons;
}
export function intersectScopes(scopes){
 let result={subject_id:null,branch_id:null,topic_ids:null};
 for(const s of scopes){
  for(const key of ['subject_id','branch_id'])if(s[key]!=null){if(result[key]!=null&&result[key]!==s[key])return null;result[key]=s[key];}
  if(s.topic_ids!=null){result.topic_ids=result.topic_ids==null?[...new Set(s.topic_ids)]:result.topic_ids.filter(id=>s.topic_ids.includes(id));if(!result.topic_ids.length)return null;}
 }
 return result;
}
export function voteDecision(vote,now,random=()=>0,force=false){
 const counts=Object.fromEntries(vote.options.map(o=>[o.id,0]));
 for(const uid of vote.voters){const id=vote.ballots[uid];if(id in counts)counts[id]++;}
 const max=Math.max(0,...Object.values(counts)),leaders=Object.keys(counts).filter(k=>counts[k]===max);
 if(max===vote.voters.length&&max>0||force&&max>vote.voters.length/2||now>=vote.deadline&&max>0)return {winner:leaders[Math.min(leaders.length-1,Math.floor(random()*leaders.length))],tied:leaders.length>1,counts};
 if(now>=vote.deadline)return vote.extended?{fallback:true,counts}:{extend:true,counts};
 return {counts};
}
export function timerCurrent(room,command){return command.index===room.index&&command.schedule_version===room.schedule_version;}
export function distribution(room,index){
 const answers=room.answers.filter(a=>a.idx===index),total=room.scope?.roster_ids?.length??room.players.length,q=normalizeQuestion(room.questions[index]);
 return {correct:answers.filter(a=>!a.skipped&&Number(a.score)===1).length,partial:answers.filter(a=>Number(a.score)>0&&Number(a.score)<1).length,incorrect:answers.filter(a=>!a.skipped&&Number(a.score)===0).length,blank:total-answers.filter(a=>!a.skipped).length,...(q.type==='multiple_choice'?{choices:Object.fromEntries(q.options.map(o=>[o.id,answers.filter(a=>!a.skipped&&String(a.response).trim().toUpperCase()===o.id).length]))}:{})};
}
export function badges(room){
 const rows=standings(room),best=Math.max(0,...rows.map(p=>p.correct)),accurate=rows.filter(p=>p.correct===best&&best>0);
 const sure=rows.filter(p=>room.asked_count>0&&p.correct/room.asked_count>=.8).map(p=>({...p,average:room.answers.filter(a=>a.user_id===p.user_id&&a.idx<room.asked_count&&Number(a.score)===1).reduce((s,a)=>s+a.ms,0)/p.correct})),fast=Math.min(...sure.map(p=>p.average));
 return {accurate:accurate.map(p=>p.user_id),quick_and_sure:sure.filter(p=>p.average===fast).map(p=>p.user_id)};
}
