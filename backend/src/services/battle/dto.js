import {modeDefaults,rankEligible,issuedFor,pointsOf,progressDto} from './modes.js';
import {normalizeQuestion} from '../practice/grading.js';
import {activePlayers,standings,teamStandings,startReasons,distribution,badges,terminal,voteDecision} from './engine.js';
const text=v=>String(v??'');
const choices=rows=>(rows||[]).map(r=>({id:text(r.id),text:text(r.text)}));
// Không trải JSON do tác giả soạn ra ngoài, kể cả ở các cấu trúc lồng nhau.
export function questionDto(raw,reveal=false){
 const q=normalizeQuestion(raw),out={type:q.type,stem:text(q.stem),topic_id:raw.topic_id,topic_name:text(raw.curriculum_snapshot?.topic_name),blocks:(q.blocks||[]).filter(b=>['paragraph','table'].includes(b.type)).map(b=>b.type==='table'?{type:'table',rows:(b.rows||[]).map(row=>row.map(text))}:{type:'paragraph',text:text(b.text)})};
 if(q.type==='multiple_choice')out.options=choices(q.options);
 if(q.type==='true_false')out.statements=choices(q.statements);
 if(q.type==='matching'){out.left=choices(q.left);out.right=choices(q.right);}
 if(q.type==='short_answer'&&q.answer?.unit)out.unit=text(q.answer.unit);
 if(reveal){
  const a=q.answer||{};
  out.answer=q.type==='multiple_choice'?{correct:text(a.correct)}:q.type==='true_false'?{values:Object.fromEntries((q.statements||[]).map(s=>[s.id,a.values?.[s.id]===true]))}:q.type==='matching'?{pairs:Object.fromEntries((q.left||[]).map(s=>[s.id,text(a.pairs?.[s.id])]))}:{aliases:(a.aliases||[]).map(text),...(a.numeric!==undefined?{numeric:Number(a.numeric),tolerance:Number(a.tolerance||0),tolerance_mode:text(a.tolerance_mode)}:{}),...(a.unit?{unit:text(a.unit)}:{})};
  out.explanation=text(q.explanation);
 }
 return out;
}
// Điểm lẻ (Đúng/Sai, ghép nối chấm từng phần) chỉ làm tròn khi xuất; xếp hạng vẫn dùng số gốc.
const shownPoints=v=>Math.round(Number(v)||0);
const publicRank=p=>({id:p.user_id,is_bot:Boolean(p.is_bot),name:p.name,class_name:p.class_name,points:shownPoints(p.points),correct:p.correct,rank:p.rank});
function legacyRoomDto(room,viewer,now){
 const ended=terminal(room),revealed=room.phase==='reveal'||ended,through=revealed?room.asked_count:Math.max(0,room.asked_count-1);
 const rows=standings(room,through),own=room.players.find(p=>p.user_id===viewer.id),isTeacher=room.kind==='class'&&room.host_id===viewer.id;
 const out={id:room.id,run_id:room.run_id,version:room.version,status:room.status,phase:room.phase,server_now:now,kind:room.kind,asked_count:room.asked_count,question_count:room.question_count,capacity:room.capacity,seconds:room.seconds,scope:{subject_id:room.scope.subject_id??null,subject_ids:room.scope.subject_ids,branch_id:room.scope.branch_id??null,topic_ids:room.scope.topic_ids??null},end_reason:room.end_reason??null,host_id:room.host_id};
 Object.assign(out,{visibility:room.visibility,open_slots:Boolean(room.open_slots),auto_match:Boolean(room.auto_match),countdown_at:room.countdown_at??null,auto_start_at:room.auto_start_at??null,label:room.has_bots?'Đấu với máy':room.open_slots?'Nhóm bạn đang tìm thêm người':null,ranked:Boolean(room.match_meta?.ranked?.[viewer.id])});
 if(isTeacher)out.class_id=room.class_id;
 if(room.phase==='lobby')out.rank_requested=Boolean(own?.rank_requested);
 if(room.phase==='lobby'){
  out.code=room.code;out.host_id=room.host_id;out.start_reasons=startReasons(room,now);
  out.players=room.players.filter(p=>!p.left_at).map(p=>({id:p.user_id,is_bot:Boolean(p.is_bot),name:p.display_name,class_name:p.class_name,ready:p.ready,team:p.team}));
  if(room.vote)out.vote={stage:room.vote.stage,deadline:room.vote.deadline,options:room.vote.options.map(o=>({id:o.id,label:o.label})),counts:voteDecision(room.vote,now).counts,mine:room.vote.ballots[viewer.id]??null,eligible:room.vote.voters.includes(viewer.id)};
  if(room.vote_result)out.vote_result={tied:room.vote_result.tied,label:room.vote_result.label};
 }else if(!ended){
  out.deadline=room.deadline??null;out.remaining=room.phase==='paused'?room.remaining:null;
  out.answered_count=room.answers.filter(a=>a.idx===room.index).length;out.player_count=activePlayers(room).length;
  if(!isTeacher)out.players=rows.map(p=>({id:p.user_id,is_bot:Boolean(p.is_bot),name:p.name,class_name:p.class_name,points:shownPoints(p.points),correct:p.correct,answered:room.answers.some(a=>a.idx===room.index&&a.user_id===p.user_id)}));
 }
 // Đếm ngược chưa phát câu: tuyệt đối không gửi nội dung tương lai trong ảnh chụp.
 if(room.index>=0&&room.index<room.asked_count&&!ended){
  out.question={index:room.index,total:room.question_count,...questionDto(room.questions[room.index],revealed)};
  const a=room.answers.find(a=>a.idx===room.index&&a.user_id===viewer.id);
  if(own)out.my_answer=a?{received:true,response:a.response,skipped:a.skipped,...(revealed?{score:Number(a.score)}:{})}:{received:false};
  if(revealed)out.distribution=distribution(room,room.index);
 }
 if(room.kind==='team')out.teams=teamStandings(room,through).map(t=>({...t,points:shownPoints(t.points)}));
 if(ended){
  out.podium=isTeacher&&!room.show_top3?[]:rows.filter(p=>p.rank<=3).slice(0,3).map(publicRank);
  const rank=rows.find(p=>p.user_id===viewer.id);out.me=rank?{...publicRank(rank),total:rows.length}:null;
  out.questions=room.questions.slice(0,room.asked_count).map((q,idx)=>{const a=room.answers.find(a=>a.idx===idx&&a.user_id===viewer.id);return {index:idx,...questionDto(q,true),...(own?{response:a?.response??null,score:Number(a?.score||0),skipped:!a||a.skipped}:{})};});
  out.review=own?out.questions.filter(q=>q.score<1).map(q=>({index:q.index,topic_id:q.topic_id,source:'battle',source_label:'Ván đấu'})):[];
  const b=badges(room);out.badges=own&&!room.has_bots?{accurate:b.accurate.includes(viewer.id),quick_and_sure:b.quick_and_sure.includes(viewer.id)}:{};
 }
 if(room.emote&&['lobby','reveal'].includes(room.phase))out.emote={kind:room.emote.kind,at:room.emote.at};
 if(out.players)for(const p of out.players)p.badge=room.public_badges?.[p.id]||null;
 if(ended&&own)out.rank_result=room.rating_results?.[viewer.id]||null;
 return out;
}
export function lobbyCard(room){return {id:room.id,label:room.has_bots?'Đấu với máy':room.open_slots?'Nhóm bạn đang tìm thêm người':null,kind:room.kind,visibility:room.visibility,open_slots:Boolean(room.open_slots),auto_match:Boolean(room.auto_match),host_name:room.players.find(p=>p.user_id===room.host_id)?.display_name||'Giáo viên',scope:{subject_id:room.scope.subject_id??null,subject_ids:room.scope.subject_ids,branch_id:room.scope.branch_id??null,topic_ids:room.scope.topic_ids??null},players:activePlayers(room).length,capacity:room.capacity,question_count:room.question_count,seconds:room.seconds,class_id:room.class_id};}

export const usesPrivateProgress=r=>r.pacing==='self'||r.scoring==='speed'||r.reveal_policy==='deferred'||r.show_live_board===false;
export function publicBoard(r){
 const through=r.pacing==='self'||r.phase==='reveal'||terminal(r)?r.asked_count:Math.max(0,r.asked_count-1);
 return standings(r,through).map(p=>({name:p.name,submitted:r.answers.filter(a=>a.user_id===p.user_id&&!a.timed_out&&a.idx<issuedFor(r,p.user_id)).length,total:r.question_count,...(r.reveal_policy!=='deferred'||terminal(r)?{points:shownPoints(p.points)}:{})}));
}
const stats=p=>Object.fromEntries(['points','accuracy_sum','fully_correct','submitted','issued','total','base_points','speed_points','fastest_points'].map(k=>[k,Number(p[k]||0)]));
export function roomDto(room,viewer,now,{projector=false}={}){
 const ended=terminal(room),self=room.pacing==='self',own=room.players.find(p=>p.user_id===viewer.id),teacher=room.kind==='class'&&room.host_id===viewer.id;
 // Không chạy bộ DTO cũ trên deck self: ngay cả các trường phụ cũng không được lộ câu của người khác.
 const safe=self?{...room,index:-1,asked_count:0,answers:[],questions:[],players:room.players,phase:room.phase}:room;
 const out=legacyRoomDto(safe,viewer,now);
 Object.assign(out,Object.fromEntries(Object.keys(modeDefaults).map(k=>[k,room[k]??modeDefaults[k]])),{rules_version:room.rules_version||'1.3',rank_disabled_reason:rankEligible(room)?null:'BATTLE_MODES_UNRANKED'});
 if(!rankEligible(room)){out.ranked=false;out.rank_requested=false;}
 if(room.phase==='reveal'&&room.scoring==='speed'&&room.pacing!=='self'&&room.reveal_policy!=='deferred'){
  const fastest=room.answers.filter(a=>a.idx===room.index&&Number(a.fastest_points)===100);
  out.fastest={names:fastest.map(a=>room.players.find(p=>p.user_id===a.user_id)?.display_name||'Bạn'),ms:fastest.length?fastest[0].ms:null};
  const a=room.answers.find(a=>a.idx===room.index&&a.user_id===viewer.id);
  if(a&&out.my_answer)Object.assign(out.my_answer,{base_points:Number(a.base_points),speed_points:Number(a.speed_points),fastest_points:Number(a.fastest_points)});
 }
 if(usesPrivateProgress(room)){
  if(room.phase!=='lobby')delete out.players;
  delete out.distribution;delete out.teams;delete out.answered_count;delete out.badges;
  if(room.show_live_board!==false){out.public_board=room.public_board_snapshot||[];out.board_version=room.board_version||0;out.board_at=room.board_at??null;}
  if(room.reveal_policy==='deferred'&&!ended){
   if(out.question)out.question={index:room.index,total:room.question_count,...questionDto(room.questions[room.index])};
   if(out.my_answer)delete out.my_answer.score;
  }
 }
 if(self){
  delete out.asked_count;delete out.deadline;delete out.remaining;delete out.my_answer;
  const p=room.progress?.[viewer.id];out.my_progress=progressDto(p);out.feedback=null;
  out.play_started_at=room.play_started_at??null;out.ends_at=room.ends_at??null;
  if(p&&!ended&&p.issued_count>p.cursor){
   const a=room.answers.find(a=>a.idx===p.cursor&&a.user_id===viewer.id);
   out.question={index:p.cursor,total:room.question_count,...questionDto(room.questions[p.cursor])};
   out.my_answer=a?{received:true,response:a.response,skipped:a.skipped}:{received:false};
   if(a){out.feedback={received:true,index:a.idx};if(room.reveal_policy!=='deferred')Object.assign(out.feedback,{score:Number(a.score),base_points:Number(a.base_points??Number(a.score)*100),speed_points:Number(a.speed_points||0),fastest_points:Number(a.fastest_points||0),question:questionDto(room.questions[p.cursor],true)});}
  }
 }
 if(teacher&&usesPrivateProgress(room)&&!projector){
  out.teacher_progress=room.players.map(p=>({id:p.user_id,name:p.display_name,cursor:room.progress?.[p.user_id]?.cursor??room.index,issued:issuedFor(room,p.user_id),phase:room.progress?.[p.user_id]?.phase??room.phase,answers:room.answers.filter(a=>a.user_id===p.user_id&&a.idx<issuedFor(room,p.user_id)).map(a=>({index:a.idx,score:Number(a.score),skipped:a.skipped,fast_response:Boolean(a.fast_response)}))}));
 }
 if(ended){
  const rows=standings(room),me=rows.find(p=>p.user_id===viewer.id);
  out.me=me?{...publicRank(me),...stats(me),participant_count:rows.length}:null;
  const count=own?issuedFor(room,viewer.id):room.asked_count;
  out.questions=room.questions.slice(0,count).map((q,index)=>{const a=room.answers.find(a=>a.idx===index&&a.user_id===viewer.id);return {index,...questionDto(q,true),...(own?{response:a?.response??null,score:Number(a?.score||0),skipped:!a||a.skipped,submitted:Boolean(a&&!a.timed_out),points:a?pointsOf(a):0,base_points:a?Number(a.base_points??Number(a.score)*100):0,speed_points:Number(a?.speed_points||0),fastest_points:Number(a?.fastest_points||0)}:{})};});
  out.review=own?out.questions.filter(q=>q.score<1).map(q=>({index:q.index,topic_id:q.topic_id,source:'battle',source_label:'Ván đấu'})):[];
  out.podium=room.show_live_board===false||teacher&&!room.show_top3?[]:rows.filter(p=>p.rank<=3).slice(0,3).map(publicRank);
 }
 if(projector){
  for(const key of ['teacher_progress','my_progress','my_answer','feedback','me','questions','review','rank_result','rank_requested','badges'])delete out[key];
  if(self){delete out.question;delete out.distribution;}
 }
 return out;
}
