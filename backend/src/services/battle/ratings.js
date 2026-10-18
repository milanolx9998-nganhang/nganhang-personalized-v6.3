import {pool} from '../../db/pool.js';
import {rankConfig} from './settings.js';
import {standings} from './engine.js';
import {fail} from '../practice/config.js';

export function ratingLabel(row,cfg){const c=rankConfig(cfg),size=c.divisions*c.division_lp,tier=Math.min(c.tiers.length-1,Math.floor(row.lp/size)),within=row.lp-tier*size,division=Math.max(1,c.divisions-Math.floor(within/c.division_lp));return {tier,name:c.tiers[tier],division,lp:within-(c.divisions-division)*c.division_lp,total_lp:row.lp,games:row.games,placement_left:Math.max(0,c.placement_games-row.games),hidden:row.hidden,can_show:tier>=c.visible_tier};}
export function lpDelta({size,rank,tied=false,mmr,opponentMmr,width='chapter',bot=false,games=0},cfg){
 const c=rankConfig(cfg);let delta;
 if(size===2)delta=tied?c.tie:mmr+c.underdog_gap<=opponentMmr?(rank===1?c.underdog_win:c.underdog_loss):rank===1?c.duel_win:c.duel_loss;
 else delta=(size===3?c.lp_three:c.lp_four)[rank-1];
 if(!Number.isFinite(delta))return 0;
 delta*=width==='multi'?c.multi_subject_factor:width==='subject'?c.subject_factor:c.chapter_factor;
 if(delta>0&&games>0&&games<c.placement_games)delta+=c.placement_bonus;
 if(bot)delta=delta>0?Math.min(c.bot_win_cap,delta):delta<0?c.bot_loss:0;
 return Math.round(delta);
}
export function floorLP(lp,delta,highest,cfg){const c=rankConfig(cfg),size=c.divisions*c.division_lp;return Math.max(highest*size,lp+delta,0);}
export function mmrCompatible(group,subjectIds,now,cfg){const c=rankConfig(cfg);if(group.every(e=>now-e.at>=c.mmr_window_ms))return true;const values=group.map(e=>subjectIds.reduce((s,id)=>s+Number(e.mmr?.[id]??c.base_mmr),0)/subjectIds.length);return Math.max(...values)-Math.min(...values)<=c.mmr_window;}
const localDay=at=>new Date(at+7*3600000).toISOString().slice(0,10);

export function createRatings(db=pool){
 async function seed(c,userId,grade,cfg){const d=rankConfig(cfg),previous=(await c.query('SELECT * FROM battle_ratings WHERE user_id=$1 AND grade=$2 AND season<>$3 ORDER BY updated_at DESC LIMIT 1',[userId,grade,d.season])).rows[0];
  const lp=Math.floor((previous?.lp||0)*d.lp_reset_factor),tier=Math.min(d.tiers.length-1,Math.floor(lp/(d.divisions*d.division_lp)));
  await c.query('INSERT INTO battle_ratings(user_id,grade,season,lp,tier) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[userId,grade,d.season,lp,tier]);
  return previous;
 }
 async function mmrs(userId,grade,cfg){const d=rankConfig(cfg),rows=(await db.query('SELECT s.subject_id,s.mmr,s.season FROM battle_subject_ratings s JOIN battle_ratings r USING(user_id,grade,season) WHERE s.user_id=$1 AND s.grade=$2 ORDER BY r.updated_at DESC',[userId,grade])).rows,out={};for(const r of rows){if(out[r.subject_id]===undefined||r.season===d.season)out[r.subject_id]=r.season===d.season?Number(r.mmr):d.base_mmr+(Number(r.mmr)-d.base_mmr)*d.reset_factor;}return out;}
 async function settle(c,room,cfg){
  const d=rankConfig(cfg),meta=room.match_meta;
  if(!meta?.rank_enabled||room.status!=='finished'||!['completed','left'].includes(room.end_reason)||room.asked_count<1||!room.auto_match&&!d.self_created)return;
  const rows=standings(room),humans=room.players.filter(p=>!p.is_bot).sort((a,b)=>a.user_id-b.user_id),subjects=meta.subject_ids||[room.scope.subject_id],scopeKey=JSON.stringify([subjects.slice().sort((a,b)=>a-b),(room.scope.topic_ids||[]).slice().sort((a,b)=>a-b)]);
  if(rows.length<2||rows.length>d.max_players)return;
  // Khóa giao dịch theo thứ tự ID trước khi đọc/ghi rating của mọi người.
  for(const p of humans)await c.query('SELECT pg_advisory_xact_lock(692,$1)',[p.user_id]);
  const snapshots=new Map();
  for(const p of humans){const previous=await seed(c,p.user_id,room.grade,cfg);const rating=(await c.query('SELECT * FROM battle_ratings WHERE user_id=$1 AND grade=$2 AND season=$3 FOR UPDATE',[p.user_id,room.grade,d.season])).rows[0],mmr={};
   for(const subject of subjects){const old=previous?(await c.query('SELECT mmr FROM battle_subject_ratings WHERE user_id=$1 AND grade=$2 AND season=$3 AND subject_id=$4',[p.user_id,room.grade,previous.season,subject])).rows[0]:null;
    await c.query('INSERT INTO battle_subject_ratings(user_id,grade,season,subject_id,mmr) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[p.user_id,room.grade,d.season,subject,old?d.base_mmr+(Number(old.mmr)-d.base_mmr)*d.reset_factor:d.base_mmr]);
    mmr[subject]=Number((await c.query('SELECT mmr FROM battle_subject_ratings WHERE user_id=$1 AND grade=$2 AND season=$3 AND subject_id=$4',[p.user_id,room.grade,d.season,subject])).rows[0].mmr);
   }snapshots.set(p.user_id,{rating,mmr});
  }
  for(const p of humans){
   if(!meta.ranked?.[p.user_id]||(await c.query('SELECT 1 FROM battle_rating_events WHERE room_id=$1 AND user_id=$2',[room.id,p.user_id])).rowCount)continue;
   const {rating,mmr}=snapshots.get(p.user_id),own=rows.find(x=>x.user_id===p.user_id),others=rows.filter(x=>x.user_id!==p.user_id),opponents=humans.filter(x=>x!==p).map(x=>x.user_id),mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
   const ownMmr=mean(Object.values(mmr)),otherMmr=mean(others.map(o=>snapshots.has(o.user_id)?mean(Object.values(snapshots.get(o.user_id).mmr)):d.base_mmr));
   const todayStart=new Date(localDay(room.ended_at)+'T00:00:00+07:00'),today=(await c.query('SELECT opponents,has_bots,shield FROM battle_rating_events WHERE user_id=$1 AND created_at >= $2 AND created_at < $2::timestamptz+interval \'1 day\'',[p.user_id,todayStart])).rows,bot=Boolean(room.has_bots);
   const forfeited=Boolean(p.left_at&&p.leave_reason==='left');
   let delta=lpDelta({size:rows.length,rank:forfeited?rows.length:own.rank,tied:!forfeited&&rows.length===2&&own.points===others[0].points,mmr:ownMmr,opponentMmr:otherMmr,width:meta.width,bot,games:rating.games},cfg),reason={width:meta.width,bot,...(forfeited?{left:true}:{})},shield=false;
   // Đồng hạng nhiều người chia trung bình các vị trí bị chiếm.
   const tied=rows.filter(x=>x.points===own.points);if(!forfeited&&rows.length>2&&tied.length>1)delta=Math.round(tied.reduce((s,_,i)=>s+lpDelta({size:rows.length,rank:own.rank+i,mmr:ownMmr,opponentMmr:otherMmr,width:meta.width,bot,games:rating.games},cfg),0)/tied.length);
   const pairCap=opponents.some(id=>today.filter(e=>e.opponents.includes(id)).length>=d.pair_daily),botCap=bot&&today.filter(e=>e.has_bots).length>=d.bot_daily;
   if(pairCap||botCap){delta=0;reason.cap=pairCap?'pair_daily':'bot_daily';}
   let streak=false;for(const opponent of opponents){if(own.points<=rows.find(x=>x.user_id===opponent).points)continue;
    const recent=(await c.query('SELECT won,scope_key,reason FROM battle_rating_events WHERE user_id=$1 AND season=$2 AND $3=ANY(opponents) ORDER BY created_at DESC,room_id DESC LIMIT $4',[p.user_id,d.season,opponent,d.streak_wins])).rows;
    if(recent.length===d.streak_wins&&recent.every(e=>(e.won||e.reason?.won_opponents?.includes(opponent))&&e.scope_key===scopeKey))streak=true;
   }
   const abnormal=humans.some(h=>h.left_at&&h.leave_reason!=='disconnected'||room.answers.filter(a=>a.user_id===h.user_id&&a.idx<room.asked_count).length===room.asked_count&&room.answers.filter(a=>a.user_id===h.user_id).every(a=>!a.skipped&&a.ms<d.abnormal_ms));
   if(delta>0&&streak){delta=Math.round(delta*d.streak_factor);reason.streak=true;}
   if(delta>0&&abnormal){delta=Math.round(delta*d.abnormal_factor);reason.abnormal=true;}
   if(!forfeited&&(p.disconnected||meta.disconnected?.[p.user_id])&&delta<0&&today.filter(e=>e.shield).length<d.shield_daily){delta=0;shield=true;reason.network_shield=true;}
   reason.won_opponents=forfeited?[]:opponents.filter(id=>own.points>rows.find(x=>x.user_id===id).points);
   const lp=floorLP(rating.lp,delta,rating.tier,cfg),after={};delta=lp-rating.lp;
   const nextTier=Math.min(d.tiers.length-1,Math.floor(lp/(d.divisions*d.division_lp)));reason.tier_before=rating.tier;reason.tier_after=nextTier;reason.visibility_offer=rating.hidden&&rating.tier<d.visible_tier&&nextTier>=d.visible_tier;
   for(const subject of subjects){const subjectOpponent=mean(others.map(o=>snapshots.get(o.user_id)?.mmr[subject]??d.base_mmr)),expected=1/(1+10**((subjectOpponent-mmr[subject])/d.mmr_scale)),actual=forfeited?0:others.reduce((s,o)=>s+(own.points>o.points?1:own.points===o.points?.5:0),0)/others.length;after[subject]=reason.cap?mmr[subject]:Math.round(mmr[subject]+d.mmr_k*(actual-expected));
    await c.query('UPDATE battle_subject_ratings SET mmr=$5 WHERE user_id=$1 AND grade=$2 AND season=$3 AND subject_id=$4',[p.user_id,room.grade,d.season,subject,after[subject]]);
   }
   await c.query('UPDATE battle_ratings SET lp=$4,tier=GREATEST(tier,$5),games=games+1,updated_at=now() WHERE user_id=$1 AND grade=$2 AND season=$3',[p.user_id,room.grade,d.season,lp,Math.min(d.tiers.length-1,Math.floor(lp/(d.divisions*d.division_lp)))]);
   await c.query('INSERT INTO battle_rating_events(room_id,user_id,grade,season,delta_lp,lp_after,mmr_before,mmr_after,reason,scope_key,opponents,won,has_bots,shield,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',[room.id,p.user_id,room.grade,d.season,delta,lp,mmr,after,reason,scopeKey,opponents,!forfeited&&own.rank===1&&others.every(o=>o.points<own.points),bot,shield,new Date(room.ended_at)]);
  }
 }
 return {settle,mmrs,
  async profile(userId,grade,cfg){const d=rankConfig(cfg),r=(await db.query('SELECT * FROM battle_ratings WHERE user_id=$1 AND grade=$2 AND season=$3',[userId,grade,d.season])).rows[0];return {season:d.season,rating:ratingLabel(r||{lp:0,games:0,hidden:true},cfg),history:(await db.query('SELECT room_id,delta_lp,lp_after,reason,created_at FROM battle_rating_events WHERE user_id=$1 AND grade=$2 AND season=$3 ORDER BY created_at DESC LIMIT 20',[userId,grade,d.season])).rows};},
  async visibility(userId,grade,hidden,cfg){const d=rankConfig(cfg),r=(await db.query('SELECT * FROM battle_ratings WHERE user_id=$1 AND grade=$2 AND season=$3',[userId,grade,d.season])).rows[0];if(!r||!hidden&&!ratingLabel(r,cfg).can_show)fail('Chưa đủ bậc để hiện huy hiệu',409);await db.query('UPDATE battle_ratings SET hidden=$4 WHERE user_id=$1 AND grade=$2 AND season=$3',[userId,grade,d.season,hidden]);return {ok:true};},
  async publicBadges(ids,grade,cfg){const rows=(await db.query('SELECT * FROM battle_ratings WHERE user_id=ANY($1::int[]) AND grade=$2 AND season=$3 AND NOT hidden',[ids,grade,rankConfig(cfg).season])).rows;return Object.fromEntries(rows.filter(r=>ratingLabel(r,cfg).can_show).map(r=>{const label=ratingLabel(r,cfg);return [r.user_id,{name:label.name,tier:label.tier,division:label.division}];}));},
  async leaderboard(grade,cfg){if(!cfg.battle_modes?.leaderboard)fail('Bảng cao thủ đang tắt',403);const rows=(await db.query('SELECT user_id,lp,tier,games,hidden FROM battle_ratings WHERE grade=$1 AND season=$2 AND NOT hidden ORDER BY lp DESC,user_id LIMIT 20',[grade,rankConfig(cfg).season])).rows;return rows.filter(r=>ratingLabel(r,cfg).can_show).map(r=>({user_id:r.user_id,...ratingLabel(r,cfg)}));}
 };
}
