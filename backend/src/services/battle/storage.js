import {writeProgress,writeAnswer,writeModeRoom,writeFastest} from './modeStorage.js';
import {randomUUID} from 'node:crypto';
import {pool} from '../../db/pool.js';
import {fail,log} from '../practice/config.js';
import {createRatings} from './ratings.js';
import {entryOutcomes} from '../vocab/generator.js';
// Giới hạn riêng cho ghi ván; không thay đổi pool dùng bởi tự luyện.
export async function battleTx(work,db=pool){
 let timedOut=false,timer;
 const acquiring=db.connect().then(c=>{if(timedOut){c.release();return null;}return c;});
 const client=await Promise.race([acquiring,new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;const e=new Error('Hệ thống đang bận, thử lại');e.status=503;reject(e);},2000);})]).finally(()=>clearTimeout(timer));
 try{await client.query("BEGIN; SET LOCAL statement_timeout='3s'");const result=await work(client);await client.query('COMMIT');return result;}
 catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.status)throw e;throw Object.assign(new Error('Chưa lưu được dữ liệu ván, hãy thử lại',{cause:e}),{status:503});}
 finally{client.release();}
}
// Thống kê từ hay sai: mỗi ván từ vựng chỉ cộng một lần (đánh dấu vocab_stat_rooms); chấm theo từng từ (câu ghép theo từng cặp),
// câu đã phát mà em không trả lời (hết giờ / bỏ qua) tính là chưa đúng; bỏ qua từ đã bị xoá khỏi ngân hàng.
async function countVocab(c,roomId){
 if(!(await c.query('INSERT INTO vocab_stat_rooms(room_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING room_id',[roomId])).rowCount)return;
 const asked=(await c.query('SELECT asked_count FROM battle_rooms WHERE id=$1',[roomId])).rows[0]?.asked_count||0;
 const questions=(await c.query("SELECT idx,vocab_entry_ids,content_snapshot FROM battle_questions WHERE room_id=$1 AND source='vocab' AND idx<$2",[roomId,asked])).rows;
 if(!questions.length)return;
 const players=(await c.query('SELECT user_id FROM battle_players WHERE room_id=$1',[roomId])).rows.map(r=>r.user_id);
 const answers=new Map((await c.query('SELECT idx,user_id,response,score FROM battle_answers WHERE room_id=$1',[roomId])).rows.map(a=>[a.idx+':'+a.user_id,a]));
 const stats=new Map();
 for(const user of players)for(const q of questions){
  const a=answers.get(q.idx+':'+user),ok=entryOutcomes(q.content_snapshot,q.vocab_entry_ids,a?.response,a?Number(a.score):0);
  for(const entry of q.vocab_entry_ids){const key=user+':'+entry,row=stats.get(key)||{user,entry,seen:0,correct:0,wrong:false};row.seen++;if(ok[entry])row.correct++;else row.wrong=true;stats.set(key,row);}
 }
 const rows=[...stats.values()];if(!rows.length)return;
 await c.query(`INSERT INTO vocab_student_stats(student_id,entry_id,seen,correct,last_wrong_at)
  SELECT x.user_id,x.entry_id,x.seen,x.correct,CASE WHEN x.wrong THEN now() END FROM jsonb_to_recordset($1) AS x(user_id int,entry_id int,seen int,correct int,wrong boolean)
  JOIN vocab_entries e ON e.id=x.entry_id
  ON CONFLICT(student_id,entry_id) DO UPDATE SET seen=vocab_student_stats.seen+EXCLUDED.seen,correct=vocab_student_stats.correct+EXCLUDED.correct,
   last_wrong_at=COALESCE(EXCLUDED.last_wrong_at,vocab_student_stats.last_wrong_at),updated_at=now()`,[JSON.stringify(rows.map(r=>({user_id:r.user,entry_id:r.entry,seen:r.seen,correct:r.correct,wrong:r.wrong})))]);
}
export function createStorage(db=pool){
 const ratings=createRatings(db);
 const transaction=fn=>battleTx(fn,db);
 async function save(room,{create=false,questions=false,progressKeys=[],answers=[],settleIndex=null,noPlayers=false,lean=false,askedChanged=false}={}){return transaction(async c=>{
  // Tự chơi: chốt/chuyển câu của một người chỉ đổi tiến độ + đáp án; không ghi lại thông tin phòng.
  if(lean){if(askedChanged)await c.query('UPDATE battle_rooms SET asked_count=$2 WHERE id=$1 AND asked_count<$2',[room.id,room.asked_count]);await writeProgress(c,room,progressKeys);for(const a of answers)await writeAnswer(c,a);return;}
  if(create)await c.query(`INSERT INTO battle_rooms(id,code,run_id,kind,visibility,host_id,class_id,grade,subject_id,branch_id,scope,content_mode,capacity,question_count,seconds,time_factors,rematch_of,created_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,[room.id,room.code,room.run_id,room.kind,room.visibility,room.host_id,room.class_id,room.grade,room.scope.subject_id,room.scope.branch_id,room.scope,room.content_mode,room.capacity,room.question_count,room.seconds,room.time_factors,room.rematch_of||null,new Date(room.created_at)]);
  await c.query('UPDATE battle_rooms SET host_id=$2,scope=$3,subject_id=$4,branch_id=$5,status=$6,asked_count=$7,end_reason=$8,started_at=$9,ended_at=$10 WHERE id=$1',[room.id,room.host_id,room.scope,room.scope.subject_id,room.scope.branch_id,room.status,room.asked_count,room.end_reason||null,room.started_at?new Date(room.started_at):null,room.ended_at?new Date(room.ended_at):null]);
  await c.query('UPDATE battle_rooms SET visibility=$2,open_slots=$3,auto_match=$4,has_bots=$5,auto_start_at=$6,match_meta=$7 WHERE id=$1',[room.id,room.visibility,Boolean(room.open_slots),Boolean(room.auto_match),Boolean(room.has_bots),room.auto_start_at?new Date(room.auto_start_at):null,room.match_meta||{}]);
  if(!noPlayers&&room.players.length)await c.query(`INSERT INTO battle_players(room_id,user_id,team,display_name,class_name,ready,joined_at,left_at,leave_reason,points,correct,rank)
   SELECT $1,x.user_id,x.team,x.display_name,x.class_name,x.ready,to_timestamp(x.joined_at/1000.0),to_timestamp(x.left_at/1000.0),x.leave_reason,COALESCE(x.points,0),COALESCE(x.correct,0),x.rank
   FROM jsonb_to_recordset($2) AS x(user_id int,team int,display_name text,class_name text,ready boolean,joined_at bigint,left_at bigint,leave_reason text,points numeric,correct int,rank int)
   ON CONFLICT(room_id,user_id) DO UPDATE SET team=EXCLUDED.team,ready=EXCLUDED.ready,left_at=EXCLUDED.left_at,leave_reason=EXCLUDED.leave_reason,points=EXCLUDED.points,correct=EXCLUDED.correct,rank=EXCLUDED.rank`,[room.id,JSON.stringify(room.players.filter(p=>!p.is_bot))]);
  for(const p of noPlayers?[]:room.players.filter(p=>p.is_bot))await c.query(`INSERT INTO battle_bot_players(room_id,bot_slot,difficulty,joined_at,left_at,points,correct,rank) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(room_id,bot_slot) DO UPDATE SET left_at=EXCLUDED.left_at,points=EXCLUDED.points,correct=EXCLUDED.correct,rank=EXCLUDED.rank`,[room.id,p.bot_slot,p.difficulty,new Date(p.joined_at),p.left_at?new Date(p.left_at):null,p.points||0,p.correct||0,p.rank||null]);
  if(questions)await c.query(`INSERT INTO battle_questions(room_id,idx,question_version_id,question_id,topic_id,cognitive_level,curriculum_snapshot,seconds,source,vocab_entry_ids,content_snapshot)
   SELECT $1,x.idx,x.question_version_id,x.question_id,x.topic_id,x.cognitive_level,x.curriculum_snapshot,x.seconds,COALESCE(x.source,'bank'),x.vocab_entry_ids,x.content_snapshot FROM jsonb_to_recordset($2) AS x(idx int,question_version_id uuid,question_id int,topic_id int,cognitive_level int,curriculum_snapshot jsonb,seconds numeric,source text,vocab_entry_ids int[],content_snapshot jsonb)`,[room.id,JSON.stringify(room.questions.map(({content,...q})=>q))]);
  await writeModeRoom(c,room);
  await writeProgress(c,room,progressKeys);
  for(const a of answers)await writeAnswer(c,a);
  if(settleIndex!==null)await writeFastest(c,room,settleIndex);
  if(create||questions||room.ended_at)await log(c,{id:room.host_id},create?'BATTLE_CREATE':questions?'BATTLE_START':'BATTLE_END',room.id,{status:room.status,asked_count:room.asked_count});
  if(room.ended_at&&room.scope?.content==='vocab')await countVocab(c,room.id);
  if(room.ended_at){await ratings.settle(c,room,{battle_rank:room.match_meta?.rank_rules});room.rating_results=Object.fromEntries((await c.query('SELECT user_id,delta_lp,lp_after,reason FROM battle_rating_events WHERE room_id=$1',[room.id])).rows.map(({user_id,...event})=>[user_id,event]));}
 });}
 async function load(id){
  const r=(await db.query('SELECT * FROM battle_rooms WHERE id=$1',[id])).rows[0];if(!r)fail('Không tìm thấy phòng',404);
  r.progress=Object.fromEntries((await db.query('SELECT * FROM battle_player_progress WHERE room_id=$1',[id])).rows.map(p=>[p.player_key,{...p,paused_ms:Number(p.paused_ms),...Object.fromEntries(['opened_at','deadline','auto_next_at'].map(k=>[k,p[k]?+new Date(p[k]):null]))}]));
  r.play_started_at=r.play_started_at?+new Date(r.play_started_at):null;r.ends_at=r.ends_at?+new Date(r.ends_at):null;
  r.players=(await db.query('SELECT * FROM battle_players WHERE room_id=$1 ORDER BY joined_at,user_id',[id])).rows.map(p=>({...p,joined_at:+new Date(p.joined_at),left_at:p.left_at?+new Date(p.left_at):null}));
  r.players.push(...(await db.query('SELECT * FROM battle_bot_players WHERE room_id=$1 ORDER BY bot_slot',[id])).rows.map(p=>({...p,user_id:'bot:'+p.bot_slot,is_bot:true,class_name:'',ready:true,joined_at:+new Date(p.joined_at),left_at:p.left_at?+new Date(p.left_at):null})));
  r.questions=(await db.query('SELECT q.*,COALESCE(v.content,q.content_snapshot) AS content,COALESCE(v.auto_gradable,true) AS auto_gradable FROM battle_questions q LEFT JOIN question_versions v ON v.id=q.question_version_id WHERE room_id=$1 ORDER BY idx',[id])).rows;
  r.answers=(await db.query('SELECT * FROM battle_answers WHERE room_id=$1',[id])).rows.map(a=>({...a,score:Number(a.score),received_at:+new Date(a.received_at)}));
  r.answers.push(...(await db.query('SELECT * FROM battle_bot_answers WHERE room_id=$1',[id])).rows.map(a=>({...a,user_id:'bot:'+a.bot_slot,score:Number(a.score),received_at:+new Date(a.received_at)})));
  r.rating_results=Object.fromEntries((await db.query('SELECT user_id,delta_lp,lp_after,reason FROM battle_rating_events WHERE room_id=$1',[id])).rows.map(({user_id,...event})=>[user_id,event]));
  return {...r,phase:r.status,index:r.asked_count-1,version:1,schedule_version:0,show_top3:Boolean(r.scope.show_top3)};
 }
 return {save,load,answer:a=>transaction(c=>writeAnswer(c,a)),botAnswer:a=>transaction(c=>writeAnswer(c,a)),
  stampOpening:(r,keys=[],{room=true}={})=>transaction(async c=>{if(room)await writeModeRoom(c,r);await writeProgress(c,r,keys);}),
  receipt:async(roomId,index,userId)=>{const a=(await db.query('SELECT * FROM battle_answers WHERE room_id=$1 AND idx=$2 AND user_id=$3',[roomId,index,userId])).rows[0];return a?{...a,score:Number(a.score),received_at:+new Date(a.received_at)}:null;},
  recover:()=>transaction(async c=>{await c.query('SELECT open_slots,match_meta,pacing,scoring,time_limit,gameplay FROM battle_rooms LIMIT 0');await c.query('SELECT 1 FROM battle_player_progress LIMIT 0');await c.query('SELECT 1 FROM battle_bot_players,battle_bot_answers,battle_golden_hours,battle_ratings,battle_rating_events LIMIT 0');const runId=randomUUID();await c.query("UPDATE battle_rooms SET status='closed',end_reason='restart',ended_at=now(),run_id=$1 WHERE status='lobby'",[runId]);await c.query("UPDATE battle_rooms SET status='interrupted',end_reason='restart',ended_at=now(),run_id=$1 WHERE status='playing'",[runId]);}),
  history:async user=>(await db.query("SELECT r.id FROM battle_rooms r WHERE r.status IN('finished','interrupted','closed') AND (EXISTS(SELECT 1 FROM battle_players p WHERE p.room_id=r.id AND p.user_id=$1) OR r.kind='class' AND r.host_id=$1) ORDER BY r.ended_at DESC LIMIT 10",[user.id])).rows.map(r=>r.id),
  transaction};
}
