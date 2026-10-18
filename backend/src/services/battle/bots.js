import {pool} from '../../db/pool.js';
import {normalizeQuestion,gradeQuestion} from '../practice/grading.js';
import {flexConfig} from './settings.js';
export function botProbability(raw,stats,difficulty,cfg){const f=flexConfig(cfg),base=stats?.n>=f.bot_min_samples?Number(stats.rate):[f.bot_nb,f.bot_th,f.bot_vd][normalizeQuestion(raw).cognitive_level-1];return Math.max(f.bot_probability_min,Math.min(f.bot_probability_max,base*f['bot_'+difficulty]));}
export function botDelay(seconds,cfg,random=Math.random){const f=flexConfig(cfg);return Math.floor(seconds*1000*(f.bot_time_min+(f.bot_time_max-f.bot_time_min)*random()));}
export function botResponse(raw,p,random=Math.random){
 const q=normalizeQuestion(raw),a=q.answer,ok=()=>random()<p;
 if(q.type==='multiple_choice')return ok()?a.correct:q.options.filter(o=>o.id!==a.correct)[Math.floor(random()*(q.options.length-1))].id;
 if(q.type==='true_false')return Object.fromEntries(Object.entries(a.values).map(([id,v])=>[id,ok()?v:!v]));
 if(q.type==='matching')return Object.fromEntries(Object.entries(a.pairs).map(([id,v])=>[id,ok()?v:q.right.find(x=>String(x.id)!==String(v))?.id??'']));
 if(ok())return {value:a.numeric??a.aliases[0],unit:a.unit};
 // Giá trị sai phải thực sự sai cả khi tác giả có nhiều aliases hoặc tolerance lớn.
 let response={value:'__khong_biet__',unit:a.unit};while(gradeQuestion(raw,response).score)response.value+='_';return response;
}
export function createBots(db=pool){return {
 async prepare(room,cfg){
  const ids=room.questions.map(q=>q.question_id),rows=(await db.query(`WITH samples AS (
   SELECT v.question_id,(i.grade_result->>'score')::numeric AS score FROM attempt_items i JOIN attempts a ON a.id=i.attempt_id JOIN question_versions v ON v.id=i.question_version_id
   WHERE v.question_id=ANY($1::int[]) AND v.grade=$2 AND a.status='completed' AND i.grade_result->>'score' IS NOT NULL
   UNION ALL SELECT q.question_id,a.score FROM battle_answers a JOIN battle_questions q ON q.room_id=a.room_id AND q.idx=a.idx JOIN battle_rooms r ON r.id=a.room_id
   WHERE q.question_id=ANY($1::int[]) AND r.grade=$2 AND r.status='finished'
  ) SELECT question_id,count(*)::int AS n,avg(score)::float8 AS rate FROM samples GROUP BY question_id`,[ids,room.grade])).rows;
  room.bot_stats=Object.fromEntries(rows.map(s=>[s.question_id,s]));
 },
 plan(room,bot,cfg,random=Math.random){const q=room.questions[room.index],p=botProbability(q,room.bot_stats?.[q.question_id],bot.difficulty,cfg);return {response:botResponse(q,p,random),delay:botDelay(q.seconds,cfg,random)};}
};}
