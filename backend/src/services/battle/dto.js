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
const publicRank=p=>({id:p.user_id,name:p.name,class_name:p.class_name,points:p.points,correct:p.correct,rank:p.rank});
export function roomDto(room,viewer,now){
 const ended=terminal(room),revealed=room.phase==='reveal'||ended,through=revealed?room.asked_count:Math.max(0,room.asked_count-1);
 const rows=standings(room,through),own=room.players.find(p=>p.user_id===viewer.id),isTeacher=room.kind==='class'&&room.host_id===viewer.id;
 const out={id:room.id,run_id:room.run_id,version:room.version,status:room.status,phase:room.phase,server_now:now,kind:room.kind,asked_count:room.asked_count,question_count:room.question_count,capacity:room.capacity,seconds:room.seconds,scope:{subject_id:room.scope.subject_id??null,branch_id:room.scope.branch_id??null,topic_ids:room.scope.topic_ids??null},end_reason:room.end_reason??null};
 if(room.phase==='lobby'){
  out.code=room.code;out.host_id=room.host_id;out.start_reasons=startReasons(room,now);
  out.players=room.players.filter(p=>!p.left_at).map(p=>({id:p.user_id,name:p.display_name,class_name:p.class_name,ready:p.ready,team:p.team}));
  if(room.vote)out.vote={stage:room.vote.stage,deadline:room.vote.deadline,options:room.vote.options.map(o=>({id:o.id,label:o.label})),counts:voteDecision(room.vote,now).counts,mine:room.vote.ballots[viewer.id]??null,eligible:room.vote.voters.includes(viewer.id)};
  if(room.vote_result)out.vote_result={tied:room.vote_result.tied,label:room.vote_result.label};
 }else if(!ended){
  out.deadline=room.deadline??null;out.remaining=room.phase==='paused'?room.remaining:null;
  out.answered_count=room.answers.filter(a=>a.idx===room.index).length;out.player_count=activePlayers(room).length;
  if(!isTeacher)out.players=rows.map(p=>({id:p.user_id,name:p.name,class_name:p.class_name,points:p.points,correct:p.correct,answered:room.answers.some(a=>a.idx===room.index&&a.user_id===p.user_id)}));
 }
 // Đếm ngược chưa phát câu: tuyệt đối không gửi nội dung tương lai trong ảnh chụp.
 if(room.index>=0&&room.index<room.asked_count&&!ended){
  out.question={index:room.index,total:room.question_count,...questionDto(room.questions[room.index],revealed)};
  const a=room.answers.find(a=>a.idx===room.index&&a.user_id===viewer.id);
  if(own)out.my_answer=a?{received:true,response:a.response,skipped:a.skipped,...(revealed?{score:Number(a.score)}:{})}:{received:false};
  if(revealed)out.distribution=distribution(room,room.index);
 }
 if(room.kind==='team')out.teams=teamStandings(room,through);
 if(ended){
  out.podium=isTeacher&&!room.show_top3?[]:rows.filter(p=>p.rank<=3).slice(0,3).map(publicRank);
  const rank=rows.find(p=>p.user_id===viewer.id);out.me=rank?{...publicRank(rank),total:rows.length}:null;
  out.questions=room.questions.slice(0,room.asked_count).map((q,idx)=>{const a=room.answers.find(a=>a.idx===idx&&a.user_id===viewer.id);return {index:idx,...questionDto(q,true),...(own?{response:a?.response??null,score:Number(a?.score||0),skipped:!a||a.skipped}:{})};});
  out.review=own?out.questions.filter(q=>q.score<1).map(q=>({index:q.index,topic_id:q.topic_id,source:'battle',source_label:'Ván đấu'})):[];
  const b=badges(room);out.badges=own?{accurate:b.accurate.includes(viewer.id),quick_and_sure:b.quick_and_sure.includes(viewer.id)}:{};
 }
 if(room.emote&&['lobby','reveal'].includes(room.phase))out.emote={kind:room.emote.kind,at:room.emote.at};
 return out;
}
export function lobbyCard(room){return {id:room.id,kind:room.kind,host_name:room.players.find(p=>p.user_id===room.host_id)?.display_name||'Giáo viên',scope:{subject_id:room.scope.subject_id??null,branch_id:room.scope.branch_id??null,topic_ids:room.scope.topic_ids??null},players:activePlayers(room).length,capacity:room.capacity,question_count:room.question_count,seconds:room.seconds,class_id:room.class_id};}
