import {pool} from '../../db/pool.js';
import {fail} from '../practice/config.js';
import {flexConfig} from './settings.js';

// Lịch trường học theo Asia/Ho_Chi_Minh (UTC+7, không DST); 0=Chủ nhật.
export function occurrence(row,now){
 const first=+new Date(row.starts_at),duration=row.minutes*60000;
 if(!row.active)return null;
 if(!row.repeat_weekdays?.length)return now<first+duration?{starts_at:first,ends_at:first+duration}:null;
 const offset=7*3600000,local=new Date(now+offset),anchor=new Date(first+offset),day=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate())-offset;
 const tod=anchor.getUTCHours()*3600000+anchor.getUTCMinutes()*60000+anchor.getUTCSeconds()*1000;
 for(let d=-1;d<=7;d++){const start=day+d*86400000+tod,weekday=new Date(start+offset).getUTCDay();if(start>=first&&row.repeat_weekdays.includes(weekday)&&start+duration>now)return {starts_at:start,ends_at:start+duration};}
 return null;
}
export function goldenBanners(rows,grade,now,cfg){const f=flexConfig(cfg);return rows.filter(r=>r.grade===grade).flatMap(r=>{const o=occurrence(r,now);return o&&o.starts_at-now<=f.golden_banner_ms?[{id:r.id,grade:r.grade,subject_id:r.subject_id,...o,active:now>=o.starts_at,countdown_ms:Math.max(0,o.starts_at-now)}]:[];});}
export function createGoldenHours(db=pool,{now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}){let rows=[],loaded=0,inflight,timer,config,publish;
 function schedule(){clearTimer(timer);if(!config?.battle_modes?.golden_hour)return;const at=now(),window=flexConfig(config).golden_banner_ms,boundaries=rows.flatMap(r=>{const o=occurrence(r,at);return o?[o.starts_at-window,o.starts_at,o.ends_at].filter(t=>t>at):[];});if(!boundaries.length)return;
  timer=setTimer(()=>{publish?.();schedule();},Math.max(1,Math.min(...boundaries)-at));timer.unref?.();
 }
 return {
 async refresh(){if(now()-loaded>=30000||!loaded){if(!inflight)inflight=db.query('SELECT * FROM battle_golden_hours WHERE active').then(result=>{rows=result.rows;loaded=now();schedule();}).finally(()=>{inflight=null;});await inflight;}return rows;},
 async configure(cfg,notify){config=cfg;publish=notify;if(cfg.battle_modes?.golden_hour)await this.refresh();schedule();},
 dispose(){clearTimer(timer);},
 banners:(grade,now,cfg)=>cfg.battle_modes?.golden_hour?goldenBanners(rows,grade,now,cfg):[],
 async authorize(user,data){if(user.role==='admin')return;if(user.role==='student'||!(await db.query('SELECT 1 FROM battle_golden_hour_grade_grants WHERE user_id=$1 AND grade=$2 UNION ALL SELECT 1 FROM battle_golden_hour_grants WHERE user_id=$1 AND grade=$2 AND subject_id=$3',[user.id,data.grade,data.subject_id??null])).rowCount)fail('Cần quyền quản lý giờ vàng đúng khối và môn',403);},
 async list(user){return (await db.query(`SELECT h.* FROM battle_golden_hours h WHERE $1::boolean OR EXISTS(SELECT 1 FROM battle_golden_hour_grants g WHERE g.user_id=$2 AND g.grade=h.grade AND g.subject_id=h.subject_id) OR EXISTS(SELECT 1 FROM battle_golden_hour_grade_grants g WHERE g.user_id=$2 AND g.grade=h.grade) ORDER BY starts_at`,[user.role==='admin',user.id])).rows;},
 async save(user,data,id=null){
  await this.authorize(user,data);
  if(id){const old=(await db.query('SELECT * FROM battle_golden_hours WHERE id=$1',[id])).rows[0];if(!old)fail('Không có giờ vàng',404);await this.authorize(user,old);}
  const args=[data.grade,data.subject_id??null,data.starts_at,data.minutes,data.repeat_weekdays??null,data.active??true];
  const result=id?await db.query('UPDATE battle_golden_hours SET grade=$1,subject_id=$2,starts_at=$3,minutes=$4,repeat_weekdays=$5,active=$6 WHERE id=$7 RETURNING *',[...args,id]):await db.query('INSERT INTO battle_golden_hours(grade,subject_id,starts_at,minutes,repeat_weekdays,active,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[...args,user.id]);loaded=0;await this.refresh();return result.rows[0];
 },
 async remove(user,id){const old=(await db.query('SELECT * FROM battle_golden_hours WHERE id=$1',[id])).rows[0];if(!old)fail('Không có giờ vàng',404);await this.authorize(user,old);await db.query('DELETE FROM battle_golden_hours WHERE id=$1',[id]);loaded=0;await this.refresh();return {ok:true};}
};}
