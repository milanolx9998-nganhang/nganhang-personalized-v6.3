import {rankEligible,defaultAxes} from './modes.js';
import {pool} from '../../db/pool.js';
import {flexConfig} from './settings.js';

// Cùng thứ tự với lessonMap.lessonsOf: order_index, rồi id, không sắp theo tên Bài.
export function learningCeiling(topics,practiced){
 const learned=new Set(practiced),last=new Map();
 for(const t of topics)if(learned.has(t.id))last.set(t.subject_id,t.id);
 const allowed=new Set();
 for(const subject of last.keys()){for(const t of topics.filter(t=>t.subject_id===subject)){allowed.add(t.id);if(t.id===last.get(subject))break;}}
 return allowed;
}
export const inScope=(t,s)=>(s.subject_id==null||t.subject_id===s.subject_id)&&(s.branch_id==null||t.branch_id===s.branch_id)&&(s.topic_ids==null||s.topic_ids.includes(t.id));
export function prepareTicket(choices,topics,practiced){
 const selections=choices.length?choices:[{}],original=new Set(topics.filter(t=>selections.some(s=>inScope(t,s))).map(t=>t.id)),learned=learningCeiling(topics,practiced);
 const subjectIds=new Set(topics.filter(t=>original.has(t.id)).map(t=>t.subject_id));
 // Chưa luyện: chỉ giữ phần chủ động chọn; có luyện: nới trong trần môn tương ứng.
 const ceiling=new Set([...original,...topics.filter(t=>subjectIds.has(t.subject_id)&&learned.has(t.id)).map(t=>t.id)]);
 return {original:[...original],ceiling:[...ceiling],topics,selections};
}
export function ticketState(e,now,cfg={},golden=false){
 const f=flexConfig(cfg),elapsed=Math.max(0,now-e.at),isGolden=id=>golden===true||golden instanceof Set&&golden.has(id);
 const stageFor=id=>{const prefix=isGolden(id)?'golden_':'';return e.flex==='strict'?0:elapsed>=f[prefix+'subject_ms']?2:elapsed>=f[prefix+'chapter_ms']?1:0;};
 const source=e.topics.filter(t=>e.original.includes(t.id)),stages=source.map(t=>stageFor(t.subject_id));
 // Giữ phần đã được chấp nhận khi giờ vàng kết thúc hoặc quản trị kéo dài lịch.
 const ids=new Set([...e.original,...(e.current?.ids||[])]);
 for(const t of e.topics){if(!e.ceiling.includes(t.id))continue;const stage=stageFor(t.subject_id);if(!stage)continue;
  if(source.some(s=>s.subject_id===t.subject_id&&(stage===2?e.selections.some(c=>inScope(s,c)&&(!c.branch_id||c.branch_id===t.branch_id)):s.chapter&&s.chapter===t.chapter&&s.branch_id===t.branch_id)))ids.add(t.id);
 }
 const stage=Math.max(0,...stages,['none','chapter','subject'].indexOf(e.current?.widened)),accelerated=source.some(t=>isGolden(t.subject_id));
 return {ids:[...ids],widened:['none','chapter','subject'][stage],elapsed_ms:elapsed,lengths:e.lengths==='any'?[7,10,15]:elapsed>=f.length_ms?e.lengths:e.current?.lengths||e.lengths.slice(0,1),kinds:elapsed>=f.kind_ms?e.kinds:e.current?.kinds||e.kinds.slice(0,1),exits_available:Boolean(e.current?.exits_available)||elapsed>=f[(accelerated?'golden_':'')+'exit_ms'],bot_available:Boolean(e.current?.bot_available)||elapsed>=f.bot_ms};
}
export const intersection=arrays=>arrays.reduce((out,items)=>out.filter(x=>items.includes(x)),arrays[0]||[]);
export function commonScopes(group){
 const ids=intersection(group.map(e=>e.current.ids)),topics=group[0].topics.filter(t=>ids.includes(t.id)),scopes=[];
 for(const subject_id of new Set(topics.map(t=>t.subject_id))){const ts=topics.filter(t=>t.subject_id===subject_id),branches=new Set(ts.map(t=>t.branch_id));scopes.push({subject_id,branch_id:branches.size===1?ts[0].branch_id:null,topic_ids:ts.map(t=>t.id)});}
 scopes.sort((a,b)=>a.topic_ids.length-b.topic_ids.length||a.subject_id-b.subject_id);
 if(scopes.length>1)scopes.push({subject_id:null,subject_ids:scopes.map(s=>s.subject_id),branch_id:null,topic_ids:topics.map(t=>t.id)});
 return scopes;
}
export function scopeWidth(scope,topics){
 if(scope.subject_ids?.length>1)return scope.subject_ids.every(id=>scopeWidth({subject_id:id,topic_ids:scope.topic_ids},topics)!=='lesson')?'multi':'lesson';
 const selected=topics.filter(t=>scope.topic_ids.includes(t.id)),chapters=new Map();
 for(const t of topics.filter(t=>t.subject_id===scope.subject_id)){const key=JSON.stringify([t.branch_id,t.chapter]);if(t.chapter){if(!chapters.has(key))chapters.set(key,[]);chapters.get(key).push(t.id);}}
 const whole=[...chapters.values()].filter(ids=>ids.every(id=>scope.topic_ids.includes(id)));
 if(!whole.length)return 'lesson';
 const subject=topics.filter(t=>t.subject_id===scope.subject_id),branchIds=new Set(selected.map(t=>t.branch_id));
 if(subject.every(t=>scope.topic_ids.includes(t.id)))return 'subject';
 if(branchIds.size===1&&selected[0]?.branch_id&&subject.filter(t=>t.branch_id===selected[0].branch_id).every(t=>scope.topic_ids.includes(t.id)))return 'subject';
 return 'chapter';
}
export function roomFits(e,r,now,cfg){
 if(!rankEligible(r)||!defaultAxes(r))return false;
 if(cfg?.battle_modes?.lobby===false&&!r.auto_match)return false;
 if(r.phase!=='lobby'||r.vote||r.content_mode!=='fixed'||r.grade!==e.grade||!(r.visibility==='public'||r.open_slots||r.auto_match)||r.players.filter(p=>!p.left_at).length>=r.capacity||!e.current.kinds.includes(r.kind)||!e.current.lengths.includes(r.question_count)||r.seconds!==flexConfig(cfg).seconds)return false;
 const ids=e.topics.filter(t=>inScope(t,r.scope)).map(t=>t.id);
 return ids.length>0&&ids.every(id=>e.current.ids.includes(id));
}
export function createLearningCatalog(db=pool){let cached=new Map();return {
 async forStudent(userId,grade){let hit=cached.get(grade);if(!hit||Date.now()-hit.at>60000){hit={at:Date.now(),topics:(await db.query("SELECT id,subject_id,branch_id,chapter,order_index FROM topics WHERE grade=$1 AND status='ACTIVE' ORDER BY order_index,id",[grade])).rows};cached.set(grade,hit);}
 const rows=(await db.query(`SELECT DISTINCT COALESCE((i.curriculum_snapshot->>'topic_id')::int,v.topic_id) AS topic_id FROM attempts a JOIN attempt_items i ON i.attempt_id=a.id JOIN question_versions v ON v.id=i.question_version_id WHERE a.student_id=$1 AND i.response IS NOT NULL`,[userId])).rows;
 return {topics:hit.topics,practiced:rows.map(x=>x.topic_id)};
 },
 async activity(since){return (await db.query(`SELECT DISTINCT student_id FROM (SELECT a.student_id FROM attempts a WHERE a.started_at >= $1 OR a.completed_at >= $1 OR a.status='in_progress' AND EXISTS(SELECT 1 FROM attempt_items i WHERE i.attempt_id=a.id AND i.saved_at >= $1) UNION SELECT p.user_id FROM battle_players p JOIN battle_rooms r ON r.id=p.room_id WHERE p.joined_at >= $1 OR r.status='playing') s`,[new Date(since)])).rows.map(r=>r.student_id);}
};}
