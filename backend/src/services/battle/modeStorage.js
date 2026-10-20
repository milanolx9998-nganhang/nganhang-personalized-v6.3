export const date=v=>v==null?null:new Date(v);
export async function writeProgress(c,room,keys){
 if(!keys?.length)return;
 const rows=keys.map(key=>({player_key:String(key),...room.progress[key]}));
 await c.query(`INSERT INTO battle_player_progress(room_id,player_key,cursor,issued_count,phase,opened_at,deadline,paused_ms,progress_version,auto_next_at)
 SELECT $1,x.player_key,x.cursor,x.issued_count,x.phase,to_timestamp(x.opened_at/1000.0),to_timestamp(x.deadline/1000.0),x.paused_ms,x.progress_version,to_timestamp(x.auto_next_at/1000.0)
 FROM jsonb_to_recordset($2) AS x(player_key text,cursor int,issued_count int,phase text,opened_at bigint,deadline bigint,paused_ms bigint,progress_version int,auto_next_at bigint)
 ON CONFLICT(room_id,player_key) DO UPDATE SET cursor=EXCLUDED.cursor,issued_count=EXCLUDED.issued_count,phase=EXCLUDED.phase,opened_at=EXCLUDED.opened_at,deadline=EXCLUDED.deadline,paused_ms=EXCLUDED.paused_ms,progress_version=EXCLUDED.progress_version,auto_next_at=EXCLUDED.auto_next_at,updated_at=now()`,[room.id,JSON.stringify(rows)]);
}
export async function writeAnswer(c,a){
 const bot=a.bot_slot!=null,table=bot?'battle_bot_answers':'battle_answers',who=bot?'bot_slot':'user_id';
 await c.query(`INSERT INTO ${table}(room_id,idx,${who},client_id,response,score,ms,skipped,received_at,base_points,speed_points,fastest_points,fast_response,timed_out${bot?',schedule_version':''})
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14${bot?',$15':''})`,[a.room_id,a.idx,bot?a.bot_slot:a.user_id,a.client_id,JSON.stringify(a.response),a.score,a.ms,a.skipped,date(a.received_at),a.base_points??null,a.speed_points??null,a.fastest_points??null,Boolean(a.fast_response),Boolean(a.timed_out),...(bot?[a.schedule_version]:[])]);
}
export async function writeModeRoom(c,r){
 const gameplay=Object.fromEntries(['phase','index','opened_at','deadline','close_at','paused_ms','pause_at','remaining','schedule_version','version','reveal_at'].map(k=>[k,r[k]??null]));
 await c.query(`UPDATE battle_rooms SET pacing=$2,scoring=$3,time_limit=$4,total_minutes=$5,reveal_policy=$6,show_live_board=$7,rules_version=$8,play_started_at=$9,ends_at=$10,gameplay=$11 WHERE id=$1`,[r.id,r.pacing??'sync',r.scoring??'accuracy',r.time_limit??'per_question',r.total_minutes??null,r.reveal_policy??'instant',r.show_live_board??true,r.rules_version||'1.3',date(r.play_started_at),date(r.ends_at),gameplay]);
}
export async function writeFastest(c,r,index){
 for(const a of r.answers.filter(a=>a.idx===index))await c.query(`UPDATE ${a.bot_slot!=null?'battle_bot_answers':'battle_answers'} SET fastest_points=$4 WHERE room_id=$1 AND idx=$2 AND ${a.bot_slot!=null?'bot_slot':'user_id'}=$3`,[r.id,index,a.bot_slot??a.user_id,a.fastest_points||0]);
}
