import {pool} from '../../db/pool.js';
import {battleTx} from './storage.js';
import {fail,log} from '../practice/config.js';

// Dữ liệu đang là chứng cứ của báo cáo còn hạn được giữ tới khi hồ sơ hết hạn.
export async function purgeExpired(db=pool){return battleTx(async c=>{
 const events=await c.query("DELETE FROM battle_safety_events WHERE at<now()-interval '90 days'");
 const reports=await c.query("DELETE FROM battle_reports WHERE created_at<now()-interval '1 year'");
 const expired=(await c.query(`SELECT r.id FROM battle_rooms r WHERE r.status IN('finished','interrupted','closed')
  AND COALESCE((SELECT max(y.end_date) FROM school_years y WHERE r.created_at::date BETWEEN y.start_date AND y.end_date),
   make_date(extract(year FROM r.created_at)::int+CASE WHEN extract(month FROM r.created_at)>=8 THEN 1 ELSE 0 END,7,31))+30<CURRENT_DATE
  AND NOT EXISTS(SELECT 1 FROM battle_reports b WHERE b.room_id=r.id)
  AND NOT EXISTS(SELECT 1 FROM battle_safety_events e WHERE e.room_id=r.id) FOR UPDATE OF r`)).rows.map(r=>r.id);
 if(expired.length){
  await c.query('UPDATE attempts SET battle_room_id=NULL WHERE battle_room_id=ANY($1::uuid[])',[expired]);
  await c.query('UPDATE battle_rooms SET rematch_of=NULL WHERE rematch_of=ANY($1::uuid[])',[expired]);
  for(const table of ['battle_answers','battle_questions','battle_players'])await c.query(`DELETE FROM ${table} WHERE room_id=ANY($1::uuid[])`,[expired]);
  await c.query('DELETE FROM battle_rooms WHERE id=ANY($1::uuid[])',[expired]);
 }
 return {events:events.rowCount,reports:reports.rowCount,rooms:expired.length};
},db);}
export function createSafety({db=pool,transaction=fn=>battleTx(fn,db),now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const buffers=new Map();
 function record(roomId,kind,actorId,detail,at=now()){let b=buffers.get(roomId);if(!b){b={events:[],expires:Infinity};buffers.set(roomId,b);}b.events.push({kind,actor_id:actorId,detail,at});if(b.events.length>50)b.events.shift();}
 async function suspension(userId){return (await db.query('SELECT until FROM battle_suspensions WHERE user_id=$1 AND until>now()',[userId])).rows[0]||null;}
 async function assertAvailable(userId){if(await suspension(userId))fail('Tính năng Đấu đang tạm khóa với tài khoản này',403);}
 async function blockedWith(userId,ids){return ids.length>0&&(await db.query('SELECT 1 FROM battle_blocks WHERE user_id=$1 AND blocked_id=ANY($2::int[]) OR blocked_id=$1 AND user_id=ANY($2::int[]) LIMIT 1',[userId,ids])).rowCount>0;}
 async function blockedIds(userId){return (await db.query('SELECT CASE WHEN user_id=$1 THEN blocked_id ELSE user_id END AS id FROM battle_blocks WHERE user_id=$1 OR blocked_id=$1',[userId])).rows.map(r=>r.id);}
 async function blockedPairs(ids){return (await db.query('SELECT user_id,blocked_id FROM battle_blocks WHERE user_id=ANY($1::int[]) AND blocked_id=ANY($1::int[])',[ids])).rows;}
 async function shared(userId,targetId,roomId=null,c=db){if(userId===targetId)fail('Không áp dụng với chính mình');const result=await c.query('SELECT 1 FROM battle_players a JOIN battle_players b ON b.room_id=a.room_id WHERE a.user_id=$1 AND b.user_id=$2 AND ($3::uuid IS NULL OR a.room_id=$3) LIMIT 1',[userId,targetId,roomId]);if(!result.rowCount)fail('Chỉ áp dụng với người đã cùng phòng',403);}
 async function report(user,data){return transaction(async c=>{
  await shared(user.id,data.target_id,data.room_id,c);
  // Khóa mục tiêu để gộp cả hai báo cáo đến đồng thời.
  await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[data.target_id]);
  const old=(await c.query("SELECT id FROM battle_reports WHERE reporter_id=$1 AND target_id=$2 AND created_at>=now()-interval '24 hours' ORDER BY created_at DESC LIMIT 1",[user.id,data.target_id])).rows[0];if(old)return {id:old.id,received:true};
  const row=(await c.query('INSERT INTO battle_reports(room_id,reporter_id,target_id,reason,note,severity) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[data.room_id,user.id,data.target_id,data.reason,data.note||'',data.reason==='bullying'?'high':'medium'])).rows[0];
  const b=buffers.get(data.room_id);if(b?.events.length&&b.expires>now())await c.query(`INSERT INTO battle_safety_events(room_id,kind,actor_id,at,detail) SELECT $1,x.kind,x.actor_id,to_timestamp(x.at/1000.0),x.detail FROM jsonb_to_recordset($2) AS x(kind text,actor_id int,at bigint,detail jsonb)`,[data.room_id,JSON.stringify(b.events)]);
  await log(c,user,'BATTLE_REPORT',row.id,{room_id:data.room_id});return {id:row.id,received:true};
 });}
 async function block(user,targetId){return transaction(async c=>{await shared(user.id,targetId,null,c);await c.query('INSERT INTO battle_blocks(user_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[user.id,targetId]);await log(c,user,'BATTLE_BLOCK',targetId);return {ok:true};});}
 async function suspend(admin,data){return transaction(async c=>{await c.query("INSERT INTO battle_suspensions(user_id,until,reason,created_by) VALUES($1,now()+$2::int*interval '1 day',$3,$4) ON CONFLICT(user_id) DO UPDATE SET until=EXCLUDED.until,reason=EXCLUDED.reason,created_by=EXCLUDED.created_by",[data.user_id,data.days,data.reason,admin.id]);await log(c,admin,'BATTLE_SUSPEND',data.user_id,{days:data.days});return {ok:true};});}
 return {record,blockedWith,blockedIds,blockedPairs,shared,assertAvailable,suspension,report,block,suspend,
  closed:(id,at)=>{const b=buffers.get(id);if(b){b.expires=at+600000;clearTimer(b.timer);b.timer=setTimer(()=>buffers.delete(id),600000);b.timer.unref?.();}},prune:at=>{for(const [id,b] of buffers)if(b.expires<=at){clearTimer(b.timer);buffers.delete(id);}},
  purgeExpired:()=>purgeExpired(db),bufferSize:id=>buffers.get(id)?.events.length||0,
  unblock:(user,id)=>db.query('DELETE FROM battle_blocks WHERE user_id=$1 AND blocked_id=$2',[user.id,id]),
  blocks:async user=>(await db.query("SELECT b.blocked_id,split_part(u.full_name,' ',array_length(string_to_array(u.full_name,' '),1)) AS name FROM battle_blocks b JOIN users u ON u.id=b.blocked_id WHERE b.user_id=$1",[user.id])).rows,
  feedback:async user=>(await db.query("SELECT id,status,CASE WHEN status IN('resolved','dismissed') THEN 'Đã được xem xét' ELSE 'Đang chờ xem xét' END AS feedback FROM battle_reports WHERE reporter_id=$1 ORDER BY created_at DESC LIMIT 20",[user.id])).rows,
  reports:async()=>(await db.query(`WITH anchored AS (SELECT *,max(created_at) OVER(PARTITION BY target_id) AS anchor FROM battle_reports),
   grouped AS (SELECT *,floor(extract(epoch FROM anchor-created_at)/86400)::int AS batch FROM anchored)
   SELECT target_id,min(created_at) AS from_at,max(created_at) AS to_at,count(*)::int AS reports,count(DISTINCT reporter_id)::int AS reporters,
   CASE WHEN bool_or(reason='bullying') OR count(DISTINCT reporter_id)>=3 THEN 'high' WHEN bool_or(severity='medium') THEN 'medium' ELSE 'low' END AS severity,
   jsonb_agg(jsonb_build_object('id',id,'room_id',room_id,'reason',reason,'note',note,'status',status,'severity',severity,'handled_by',handled_by)) AS items
   FROM grouped GROUP BY target_id,batch ORDER BY to_at DESC LIMIT 100`)).rows,
  handle:(user,data)=>transaction(async c=>{const result=await c.query('UPDATE battle_reports SET status=$2,handled_by=$3,handled_at=now() WHERE id=$1 RETURNING id',[data.id,data.status,user.id]);if(!result.rowCount)fail('Không tìm thấy báo cáo',404);await log(c,user,'BATTLE_REPORT_HANDLED',data.id,{status:data.status});return {ok:true};}),
  suspensions:async()=>(await db.query('SELECT user_id,until,reason,created_by FROM battle_suspensions WHERE until>now() ORDER BY until')).rows,
 };
}
