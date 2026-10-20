// Luật V6.9.3: dùng chung cho tạo phòng, quyết toán và mọi đường đọc.
export const modeDefaults=Object.freeze({pacing:'sync',scoring:'accuracy',time_limit:'per_question',total_minutes:null,reveal_policy:'instant',show_live_board:true});
export function modeError(code,message,status=400,details){throw Object.assign(new Error(message),{code,status,details});}
export const defaultAxes=r=>Object.entries(modeDefaults).every(([k,v])=>(r[k]??v)===v);
export const rankEligible=r=>r.kind!=='class'&&(r.pacing??'sync')==='sync'&&(r.scoring??'accuracy')==='accuracy'&&(r.time_limit??'per_question')==='per_question';
export const issuedFor=(r,id)=>r.pacing==='self'?Number(r.progress?.[id]?.issued_count||0):Number(r.asked_count||0);
export function normalizeModes(data,cfg){
 const r={...modeDefaults,...data};
 if(r.redemption===true)modeError('BATTLE_REDEMPTION_UNSUPPORTED','V6.9.3 chưa hỗ trợ Redemption');
 if(r.kind!=='class'&&!defaultAxes(r))modeError('BATTLE_MODE_INVALID','Các cách chơi mới chỉ dành cho Quiz lớp');
 if(!['sync','self'].includes(r.pacing)||!['accuracy','speed'].includes(r.scoring)||!['per_question','total'].includes(r.time_limit)||!['instant','deferred'].includes(r.reveal_policy)||typeof r.show_live_board!=='boolean')modeError('BATTLE_MODE_INVALID','Cách chơi không hợp lệ');
 if((r.pacing==='self'||r.time_limit==='total'||r.reveal_policy==='deferred'||!r.show_live_board)&&!cfg?.battle_modes?.self_paced)modeError('BATTLE_FEATURE_OFF','Tự chơi / chính sách công bố đang tắt',403);
 if(r.scoring==='speed'&&!cfg?.battle_modes?.speed_scoring)modeError('BATTLE_FEATURE_OFF','Nhanh tay đang tắt',403);
 if(r.pacing==='self'&&!['duel','ffa','class'].includes(r.kind)||r.time_limit==='total'&&(r.pacing!=='self'||![3,5,10,15,20].includes(r.total_minutes))||r.time_limit==='per_question'&&r.total_minutes!==null)modeError('BATTLE_MODE_INVALID','Tổ hợp cách chơi / thời gian không hợp lệ');
 if(!rankEligible(r)){r.ranked=false;r.match_meta={...r.match_meta,rank_enabled:false,ranked:{}};}
 return r;
}
export function answerPoints(room,q,score,ms){
 if(room.scoring!=='speed')return {base_points:Number(score)*100,speed_points:0,fastest_points:0,fast_response:false};
 const bonus=Math.round(400*Math.max(0,Math.min(1,1-ms/(Number(q.seconds)*1000)))),base=Math.round(score*600);
 return {base_points:base,speed_points:Math.round(score*(600+bonus))-base,fastest_points:0,fast_response:ms<1500};
}
export const pointsOf=a=>a.base_points==null?Number(a.score)*100:Number(a.base_points)+Number(a.speed_points||0)+Number(a.fastest_points||0);
export function settleFastest(r){
 if(r.scoring!=='speed'||r.pacing==='self')return;
 const answers=r.answers.filter(a=>a.idx===r.index),correct=answers.filter(a=>Number(a.score)===1&&!a.skipped),best=Math.min(...correct.map(a=>a.ms));
 for(const a of answers)a.fastest_points=Number(a.score)===1&&!a.skipped&&a.ms===best?100:0;
}
export const totalExpired=(r,at)=>r.time_limit==='total'&&r.phase!=='paused'&&r.ends_at!=null&&at>=r.ends_at;
export function progressDto(p){return p?Object.fromEntries(['cursor','issued_count','phase','opened_at','deadline','paused_ms','progress_version','auto_next_at'].map(k=>[k,p[k]??null])):null;}
