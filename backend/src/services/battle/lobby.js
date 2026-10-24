import {activePlayers} from './engine.js';
import {lobbyCard,liveCard} from './dto.js';

const subjectIds=scope=>scope.subject_ids?.length?scope.subject_ids:scope.subject_id?[scope.subject_id]:[];
export const scopeTopics=(scope,catalog)=>!subjectIds(scope).length?[]:catalog.topics.filter(t=>subjectIds(scope).includes(t.subject_id)&&(scope.branch_id==null||t.branch_id===scope.branch_id)&&(!scope.chapter||t.chapter===scope.chapter)&&(!scope.topic_ids||scope.topic_ids.includes(t.id)));
export function scopeLabel(scope,catalog){
 const topics=scopeTopics(scope,catalog),ids=subjectIds(scope);
 const subject=ids.length?ids.map(id=>catalog.subjects.find(s=>s.id===id)?.name||`Môn ${id}`).join(' + '):null;
 const branches=[...new Set(topics.map(t=>t.branch_id))],chapters=[...new Set(topics.map(t=>t.chapter).filter(Boolean))];
 const branchId=scope.branch_id??(scope.topic_ids&&branches.length===1?branches[0]:null);
 const branch=branchId?catalog.branches.find(b=>b.id===branchId)?.name||`Phân môn ${branchId}`:null;
 const chapter=scope.chapter||(scope.topic_ids&&topics.length&&chapters.length===1&&topics.every(t=>t.chapter)?chapters[0]:null);
 const names=scope.chapter?[]:scope.topic_ids?scope.topic_ids.map(id=>catalog.topics.find(t=>t.id===id)?.name||`Bài ${id}`):[];
 return {subject,branch,chapter,topics:names,label:[subject,branch,chapter,names.length===1?names[0]:names.length?`${names.length} bài`:null].filter(Boolean).join(' · ')||'Chưa chọn nội dung'};
}
function matchesTopics(topics,query){return topics.some(t=>(!query.subject_id||t.subject_id===query.subject_id)&&(!query.branch_id||t.branch_id===query.branch_id)&&(!query.chapter||t.chapter===query.chapter)&&(!query.topic_id||t.id===query.topic_id));}
export function matchesScope(scope,query,catalog){
 if(!query.subject_id&&!query.branch_id&&!query.chapter&&!query.topic_id)return true;
 return matchesTopics(scopeTopics(scope,catalog),query);
}
// Tính phạm vi vé một lần cho cả khối/nhịp; dữ liệu nội bộ có ID, tuyệt đối không xuất thẳng.
export function prepareSeeking(entries){return entries.map(e=>{
 const selected=new Set((e.choices||[]).flatMap(subjectIds));
 if(!selected.size)return {userId:e.user.id,grade:e.grade,any:true,buckets:[]};
 const ids=new Set(e.current.ids),topics=e.topics.filter(t=>ids.has(t.id)&&selected.has(t.subject_id)),buckets=[];
 for(const subject_id of new Set(topics.map(t=>t.subject_id))){
  const ts=topics.filter(t=>t.subject_id===subject_id),branches=new Set(ts.map(t=>t.branch_id??null)),chapters=new Set(ts.map(t=>t.chapter||null));
  buckets.push({subject_id,branch_id:branches.size===1?ts[0].branch_id??null:null,chapter:branches.size===1&&chapters.size===1?ts[0].chapter||null:null});
 }
 return {userId:e.user.id,grade:e.grade,any:false,buckets};
});}
const countDto=n=>({count:n===1?null:n,has_waiters:n>0});
export function projectSeeking(prepared,{grade,blocked,viewerId,query={}}){
 const groups=new Map();let any=0;
 for(const e of prepared){
  if(e.grade!==grade||e.userId===viewerId||blocked.has(e.userId))continue;
  if(e.any){any++;continue;}
  for(const bucket of e.buckets){const key=JSON.stringify(bucket);if(!groups.has(key))groups.set(key,{...bucket,count:0});groups.get(key).count++;}
 }
 const safe=new Map();
 for(const g of groups.values()){
  const row=g.count<2?{...g,branch_id:null,chapter:null}:g,key=JSON.stringify([row.subject_id,row.branch_id,row.chapter]);
  if(!safe.has(key))safe.set(key,{...row,count:0});safe.get(key).count+=row.count;
 }
 const seeking=query.topic_id?[]:[...safe.values()].filter(g=>(!query.subject_id||g.subject_id===query.subject_id)&&(!query.branch_id||g.branch_id===query.branch_id)&&(!query.chapter||g.chapter===query.chapter)).sort((a,b)=>a.subject_id-b.subject_id||(a.branch_id||0)-(b.branch_id||0)||String(a.chapter).localeCompare(String(b.chapter))).map(g=>({...g,...countDto(g.count)}));
 return {seeking,seeking_any:countDto(query.subject_id?0:any)};
}
export const seekingGroups=(entries,context)=>projectSeeking(prepareSeeking(entries),context).seeking;

export function prepareLobby({rooms,grade,catalog,progress,now=Date.now()}){
 const entries=[];
 for(const r of rooms){
  if(r.grade!==grade||r.phase!=='lobby'&&r.status!=='playing')continue;
  const players=activePlayers(r),waiting=r.phase==='lobby';
  if(waiting&&players.length>=r.capacity||!waiting&&r.kind==='class')continue;
  const visible=r.visibility==='public'||r.open_slots||!waiting&&r.auto_match&&!r.has_bots;
  if(r.kind!=='class'&&!visible)continue;
  const card={...(waiting?lobbyCard(r):liveCard(r,progress(r))),scope_label:scopeLabel(r.scope,catalog)};
  entries.push({card,waiting,classId:r.class_id,isClass:r.kind==='class',ids:players.filter(p=>!p.is_bot).map(p=>p.user_id),topics:scopeTopics(r.scope,catalog),stale:waiting&&(Boolean(players.find(p=>p.user_id===r.host_id)?.disconnected)||now-r.created_at>180000)});
 }
 return entries;
}
// Chỉ chiếu quyền, lọc và đếm theo người; nhãn/phạm vi/thẻ đã dựng chung trước đó.
export function buildLobby({rooms,prepared,info,blocked,config,catalog,query={},seeking=[],seeking_any=countDto(0),progress,now}){
 const waiting=[],live=[],pinned=[];
 for(const row of prepared||prepareLobby({rooms,grade:info.grade,catalog,progress,now})){
  const {card,isClass}=row;
  if(isClass){if(config.battle_modes.class&&row.classId===info.class_id)pinned.push(card);continue;}
  if(!config.battle_modes.lobby||row.ids.some(id=>blocked.has(id)))continue;
  if(Object.keys(query).length&&!matchesTopics(row.topics,query))continue;
  if(row.waiting)waiting.push(row);else live.push(card);
 }
 waiting.sort((a,b)=>Number(a.stale)-Number(b.stale)||(a.card.capacity-a.card.players)-(b.card.capacity-b.card.players)||b.card.created_at-a.card.created_at||a.card.id.localeCompare(b.card.id));
 pinned.sort((a,b)=>b.created_at-a.created_at||a.id.localeCompare(b.id));
 live.sort((a,b)=>(b.started_at||0)-(a.started_at||0)||a.id.localeCompare(b.id));
 const subjects=new Map();
 function add(id,key,n=1){
  if(query.subject_id&&query.subject_id!==id)return;
  if(!subjects.has(id))subjects.set(id,{id,name:id===null?'Chưa chọn môn':catalog.subjects.find(s=>s.id===id)?.name||`Môn ${id}`,waiting:0,live:0,seeking:0,has_seekers:false});
  const s=subjects.get(id);s[key]=s[key]===null||n===null?null:s[key]+n;if(key==='seeking')s.has_seekers=true;
 }
 for(const [items,key] of [[waiting.map(r=>r.card),'waiting'],[live,'live']])for(const r of items){const ids=subjectIds(r.scope);for(const id of new Set(ids.length?ids:[null]))add(id,key);}
 for(const row of seeking)add(row.subject_id,'seeking',row.count);
 const summaries=[...subjects.values()].sort((a,b)=>Number(b.waiting>0)-Number(a.waiting>0)||(b.waiting+(b.seeking??0))-(a.waiting+(a.seeking??0))||b.live-a.live||(a.id??Infinity)-(b.id??Infinity));
 return {rooms:[...pinned,...waiting.slice(0,100).map(r=>r.card)],live:live.slice(0,50),seeking,seeking_any,subjects:summaries};
}
