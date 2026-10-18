import {randomInt} from 'node:crypto';
import {pool} from '../../db/pool.js';
import {USABLE_FROM,USABLE_WHERE,USABLE_LESSON} from '../practice/attempts.js';
import {normalizeQuestion,validateQuestion,gradeQuestion} from '../practice/grading.js';
import {fail,settings} from '../practice/config.js';
import {lessonProgress,currentLesson} from '../practice/lessonMap.js';
const types=['multiple_choice','true_false','short_answer','matching'];
// Tìm ảnh cả trong khóa cấu trúc, HTML, Markdown và URL nằm sâu trong nội dung.
export function hasImage(value,key=''){
 if(value==null||value===''||value===false)return false;
 if(/image|media|picture|attachment|asset|srcset/i.test(key))return Array.isArray(value)?value.length>0:true;
 if(typeof value==='string')return /!\[[^\]]*\]\s*(?:\(|\[)|<\s*(?:img|svg|picture|video|object)\b|data:image\/|\/(?:uploads|media|images)\/|\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#\s"')]|$)/i.test(value)||key==='type'&&/^(image|media|figure)$/i.test(value);
 if(Array.isArray(value))return value.some(v=>hasImage(v));
 return typeof value==='object'&&Object.entries(value).some(([k,v])=>hasImage(v,k));
}
export function eligibleQuestion(raw){
 const q=normalizeQuestion(raw);
 if(!types.includes(q.type)||![1,2,3].includes(q.cognitive_level)||!q.auto_gradable||raw.auto_gradable===false||hasImage(raw.content||raw)||raw.has_media)return false;
 if(validateQuestion(raw).errors.length)return false;
 const a=q.answer,response=q.type==='multiple_choice'?a.correct:q.type==='true_false'?a.values:q.type==='matching'?a.pairs:{value:a.numeric??a.aliases?.[0],unit:a.unit};
 return gradeQuestion(raw,response).score===1;
}
export async function normalizeScope(grade,scope={},client=pool){
 if(scope.subject_ids?.length>1){
  const ids=[...new Set(scope.topic_ids||[])],subjects=[...new Set(scope.subject_ids)];
  const valid=(await client.query("SELECT id FROM topics WHERE id=ANY($1::int[]) AND subject_id=ANY($2::int[]) AND grade=$3 AND status='ACTIVE'",[ids,subjects,grade])).rows;
  if(!ids.length||valid.length!==ids.length)fail('Bài ngoài các môn / khối');return {subject_id:null,subject_ids:subjects,branch_id:null,topic_ids:ids};
 }
 const out={subject_id:scope.subject_id??null,branch_id:scope.branch_id??null,topic_ids:scope.topic_ids??null};
 if(!out.subject_id){if(out.branch_id||out.topic_ids||scope.chapter)fail('Cần chọn môn trước phạm vi');return out;}
 if(!(await client.query('SELECT 1 FROM subjects WHERE id=$1',[out.subject_id])).rowCount)fail('Không tìm thấy môn');
 if(out.branch_id&&!(await client.query('SELECT 1 FROM branches WHERE id=$1 AND subject_id=$2',[out.branch_id,out.subject_id])).rowCount)fail('Phân môn không thuộc môn');
 if(scope.chapter){out.topic_ids=(await client.query("SELECT id FROM topics WHERE subject_id=$1 AND grade=$2 AND chapter=$3 AND status='ACTIVE' AND ($4::int IS NULL OR branch_id=$4)",[out.subject_id,grade,scope.chapter,out.branch_id])).rows.map(t=>t.id);}
 if(out.topic_ids){
  out.topic_ids=[...new Set(out.topic_ids)].sort((a,b)=>a-b);
  const valid=(await client.query("SELECT id FROM topics WHERE id=ANY($1::int[]) AND subject_id=$2 AND grade=$3 AND status='ACTIVE' AND ($4::int IS NULL OR branch_id=$4)",[out.topic_ids,out.subject_id,grade,out.branch_id])).rows;
  if(!out.topic_ids.length||valid.length!==out.topic_ids.length)fail('Bài ngoài phạm vi môn / khối / phân môn');
 }
 return out;
}
export function createDeck({client=pool,now=Date.now,random=()=>randomInt(0,0x1000000)/0x1000000}={}){
 const cache=new Map(),inflight=new Map();
 async function candidates(grade,scope){
  const {rows}=await client.query(`SELECT v.*,q.topic_id,q.subject_id,q.grade,q.branch_id,right(q.cognitive_level::text,1)::int AS cognitive_level,
   q.active_metadata AS curriculum_snapshot,t.name AS topic_name,t.chapter,t.order_index,
   EXISTS(SELECT 1 FROM question_media_links ml WHERE ml.question_version_id=v.id) AS has_media
   ${USABLE_FROM} JOIN topics t ON t.id=q.topic_id
   WHERE ${USABLE_WHERE} AND ${USABLE_LESSON} AND b.kind='school' AND q.grade=$1
   AND ($2::int IS NULL OR q.subject_id=$2) AND ($3::int IS NULL OR q.branch_id=$3)
   AND ($4::int[] IS NULL OR q.topic_id=ANY($4)) AND right(q.cognitive_level::text,1)::int IN(1,2,3)`,[grade,scope.subject_id,scope.branch_id,scope.topic_ids]);
  return rows.filter(eligibleQuestion).map(q=>({...q,curriculum_snapshot:{...(q.curriculum_snapshot||{}),subject_id:q.subject_id,grade:q.grade,topic_id:q.topic_id,topic_name:q.topic_name,cognitive_level:'M'+q.cognitive_level}}));
 }
 async function available(grade,scope={}){
  let hit=cache.get(grade);
  if(!hit||now()-hit.at>=60000){
   if(!inflight.has(grade))inflight.set(grade,candidates(grade,{}).then(rows=>{const value={at:now(),rows};cache.set(grade,value);return value;}).finally(()=>inflight.delete(grade)));
   hit=await inflight.get(grade);
  }
  return hit.rows.filter(q=>(scope.subject_id==null||q.subject_id===scope.subject_id)&&(scope.branch_id==null||q.branch_id===scope.branch_id)&&(scope.topic_ids==null||scope.topic_ids.includes(q.topic_id)));
 }
 async function count(grade,scope){return (await available(grade,scope)).length;}
 async function draw(room){
  const rows=await candidates(room.grade,room.scope);if(rows.length<room.question_count)fail('Kho không còn đủ câu; hãy chọn lại nội dung',409);
  const ordered=rows.map(q=>({q,r:random()})).sort((a,b)=>Number(Boolean(b.q.content.explanation))-Number(Boolean(a.q.content.explanation))||a.r-b.r).map(x=>x.q);
  const needs=[Math.round(room.question_count*.4),Math.round(room.question_count*.4)];needs.push(room.question_count-needs[0]-needs[1]);
  const selected=[];for(let level=1;level<=3;level++)selected.push(...ordered.filter(q=>q.cognitive_level===level).slice(0,needs[level-1]));
  selected.push(...ordered.filter(q=>!selected.includes(q)).slice(0,room.question_count-selected.length));
  if(room.match_meta?.mix){
   const {narrow,narrow_count}=room.match_meta.mix,inside=ordered.filter(q=>narrow.includes(q.topic_id)),outside=ordered.filter(q=>!narrow.includes(q.topic_id));
   if(inside.length<narrow_count||outside.length<room.question_count-narrow_count)fail('Kho không còn đủ câu cho bộ hẹp/rộng',409);
   selected.splice(0,selected.length,...inside.slice(0,narrow_count),...outside.slice(0,room.question_count-narrow_count));
  }
  return selected.map(q=>({q,r:random()})).sort((a,b)=>a.r-b.r).map(({q},idx)=>({...q,idx,question_version_id:q.id,seconds:room.seconds*room.time_factors[normalizeQuestion(q).type]}));
 }
 return {candidates,available,count,draw,clear:()=>cache.clear()};
}
export const deck=createDeck();
export async function contentOptions(grade,count=7,userId=null,scope={}){
 const rows=await deck.available(grade,scope),subjects=(await pool.query('SELECT id,name FROM subjects')).rows,branches=(await pool.query('SELECT id,name FROM branches')).rows;
 const grouped=(key,labels)=>[...new Set(rows.map(q=>q[key]).filter(Boolean))].map(id=>({id,name:labels.find(x=>x.id===id)?.name||String(id),count:rows.filter(q=>q[key]===id).length})).filter(x=>x.count>=count);
 const topics=grouped('topic_id',rows.map(q=>({id:q.topic_id,name:q.topic_name}))).map(t=>{const q=rows.find(q=>q.topic_id===t.id);return {...t,subject_id:q.subject_id,branch_id:q.branch_id,chapter:q.chapter};});
 const chapters=[...new Set(rows.map(q=>JSON.stringify([q.subject_id,q.chapter])))].map(key=>{const [subject_id,name]=JSON.parse(key),items=rows.filter(q=>q.subject_id===subject_id&&q.chapter===name);return {subject_id,name,topic_ids:[...new Set(items.map(q=>q.topic_id))],count:items.length};}).filter(c=>c.count>=count);
 const suggestions=[];
 if(userId){
  const states=(await pool.query("SELECT topic_id,state FROM mastery_states WHERE student_id=$1 AND updated_at>=now()-interval '30 days'",[userId])).rows,cfg=await settings();
  const weak=states.filter(r=>r.state.mastery_score<70).sort((a,b)=>a.state.mastery_score-b.state.mastery_score).slice(0,3);
  const recent=(await pool.query("SELECT COALESCE((i.curriculum_snapshot->>'topic_id')::int,v.topic_id) AS topic_id FROM attempts a JOIN attempt_items i ON i.attempt_id=a.id JOIN question_versions v ON v.id=i.question_version_id WHERE a.student_id=$1 AND a.started_at>=now()-interval '30 days' GROUP BY COALESCE((i.curriculum_snapshot->>'topic_id')::int,v.topic_id) ORDER BY max(a.started_at) DESC LIMIT 3",[userId])).rows;
  for(const subject_id of new Set(topics.map(t=>t.subject_id))){
   const open=topics.filter(t=>t.subject_id===subject_id).sort((a,b)=>(rows.find(q=>q.topic_id===a.id)?.order_index||0)-(rows.find(q=>q.topic_id===b.id)?.order_index||0)).map(t=>({...t,progress:lessonProgress(states.filter(s=>s.topic_id===t.id).map(s=>s.state),cfg.mastery_threshold)}));
   if(open.some(t=>t.progress.status!=='new')){const current=currentLesson(open);if(current)recent.unshift({topic_id:current.id});}
  }
  for(const [items,reason] of [[recent,'recent'],[weak,'weak']])for(const r of items)if(topics.some(t=>t.id===r.topic_id)&&!suggestions.some(s=>s.topic_id===r.topic_id&&s.reason===reason))suggestions.push({topic_id:r.topic_id,reason});
 }
 return {subjects:grouped('subject_id',subjects),branches:grouped('branch_id',branches),chapters,topics,suggestions};
}
