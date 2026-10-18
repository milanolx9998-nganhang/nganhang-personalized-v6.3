import {randomUUID} from 'node:crypto';
import {pool} from '../../db/pool.js';
import {fail,log} from '../practice/config.js';
// Giới hạn riêng cho ghi ván; không thay đổi pool dùng bởi tự luyện.
export async function battleTx(work,db=pool){
 let timedOut=false,timer;
 const acquiring=db.connect().then(c=>{if(timedOut){c.release();return null;}return c;});
 const client=await Promise.race([acquiring,new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;const e=new Error('Hệ thống đang bận, thử lại');e.status=503;reject(e);},2000);})]).finally(()=>clearTimeout(timer));
 try{await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='3s'");const result=await work(client);await client.query('COMMIT');return result;}
 catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.status)throw e;throw Object.assign(new Error('Chưa lưu được dữ liệu ván, hãy thử lại',{cause:e}),{status:503});}
 finally{client.release();}
}
export function createStorage(db=pool){
 const transaction=fn=>battleTx(fn,db);
 async function save(room,{create=false,questions=false}={}){return transaction(async c=>{
  if(create)await c.query(`INSERT INTO battle_rooms(id,code,run_id,kind,visibility,host_id,class_id,grade,subject_id,branch_id,scope,content_mode,capacity,question_count,seconds,time_factors,rematch_of,created_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,[room.id,room.code,room.run_id,room.kind,room.visibility,room.host_id,room.class_id,room.grade,room.scope.subject_id,room.scope.branch_id,room.scope,room.content_mode,room.capacity,room.question_count,room.seconds,room.time_factors,room.rematch_of||null,new Date(room.created_at)]);
  await c.query('UPDATE battle_rooms SET host_id=$2,scope=$3,subject_id=$4,branch_id=$5,status=$6,asked_count=$7,end_reason=$8,started_at=$9,ended_at=$10 WHERE id=$1',[room.id,room.host_id,room.scope,room.scope.subject_id,room.scope.branch_id,room.status,room.asked_count,room.end_reason||null,room.started_at?new Date(room.started_at):null,room.ended_at?new Date(room.ended_at):null]);
  if(room.players.length)await c.query(`INSERT INTO battle_players(room_id,user_id,team,display_name,class_name,ready,joined_at,left_at,leave_reason,points,correct,rank)
   SELECT $1,x.user_id,x.team,x.display_name,x.class_name,x.ready,to_timestamp(x.joined_at/1000.0),to_timestamp(x.left_at/1000.0),x.leave_reason,COALESCE(x.points,0),COALESCE(x.correct,0),x.rank
   FROM jsonb_to_recordset($2) AS x(user_id int,team int,display_name text,class_name text,ready boolean,joined_at bigint,left_at bigint,leave_reason text,points numeric,correct int,rank int)
   ON CONFLICT(room_id,user_id) DO UPDATE SET team=EXCLUDED.team,ready=EXCLUDED.ready,left_at=EXCLUDED.left_at,leave_reason=EXCLUDED.leave_reason,points=EXCLUDED.points,correct=EXCLUDED.correct,rank=EXCLUDED.rank`,[room.id,JSON.stringify(room.players)]);
  if(questions)await c.query(`INSERT INTO battle_questions(room_id,idx,question_version_id,question_id,topic_id,cognitive_level,curriculum_snapshot,seconds)
   SELECT $1,x.idx,x.question_version_id,x.question_id,x.topic_id,x.cognitive_level,x.curriculum_snapshot,x.seconds FROM jsonb_to_recordset($2) AS x(idx int,question_version_id uuid,question_id int,topic_id int,cognitive_level int,curriculum_snapshot jsonb,seconds numeric)`,[room.id,JSON.stringify(room.questions)]);
  if(create||questions||room.ended_at)await log(c,{id:room.host_id},create?'BATTLE_CREATE':questions?'BATTLE_START':'BATTLE_END',room.id,{status:room.status,asked_count:room.asked_count});
 });}
 async function load(id){
  const r=(await db.query('SELECT * FROM battle_rooms WHERE id=$1',[id])).rows[0];if(!r)fail('Không tìm thấy phòng',404);
  r.players=(await db.query('SELECT * FROM battle_players WHERE room_id=$1 ORDER BY joined_at,user_id',[id])).rows.map(p=>({...p,joined_at:+new Date(p.joined_at),left_at:p.left_at?+new Date(p.left_at):null}));
  r.questions=(await db.query('SELECT q.*,v.content,v.auto_gradable FROM battle_questions q JOIN question_versions v ON v.id=q.question_version_id WHERE room_id=$1 ORDER BY idx',[id])).rows;
  r.answers=(await db.query('SELECT * FROM battle_answers WHERE room_id=$1',[id])).rows.map(a=>({...a,score:Number(a.score),received_at:+new Date(a.received_at)}));
  return {...r,phase:r.status,index:r.asked_count-1,version:1,schedule_version:0,show_top3:Boolean(r.scope.show_top3)};
 }
 return {save,load,answer:answer=>transaction(c=>c.query('INSERT INTO battle_answers(room_id,idx,user_id,client_id,response,score,ms,skipped,received_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[answer.room_id,answer.idx,answer.user_id,answer.client_id,JSON.stringify(answer.response),answer.score,answer.ms,answer.skipped,new Date(answer.received_at)])),
  receipt:async(roomId,index,userId)=>{const a=(await db.query('SELECT * FROM battle_answers WHERE room_id=$1 AND idx=$2 AND user_id=$3',[roomId,index,userId])).rows[0];return a?{...a,score:Number(a.score),received_at:+new Date(a.received_at)}:null;},
  recover:()=>transaction(async c=>{const runId=randomUUID();await c.query("UPDATE battle_rooms SET status='closed',end_reason='restart',ended_at=now(),run_id=$1 WHERE status='lobby'",[runId]);await c.query("UPDATE battle_rooms SET status='interrupted',end_reason='restart',ended_at=now(),run_id=$1 WHERE status='playing'",[runId]);}),
  history:async user=>(await db.query("SELECT r.id FROM battle_rooms r WHERE r.status IN('finished','interrupted','closed') AND (EXISTS(SELECT 1 FROM battle_players p WHERE p.room_id=r.id AND p.user_id=$1) OR r.kind='class' AND r.host_id=$1) ORDER BY r.ended_at DESC LIMIT 10",[user.id])).rows.map(r=>r.id),
  transaction};
}
