// Ghép trận từ vựng: nhánh riêng, không đi qua bộ ghép theo Bài (flex matchmaking).
// Cùng khối + cùng môn; ưu tiên chung bộ từ, chờ quá widenMs thì ghép mọi bộ của môn (gộp bộ của cả nhóm).
import {fail} from '../practice/config.js';
export function createVocabQueue({rooms,identity,normalizeScope,deck,safety,streams,inOtherQueue=()=>false,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,widenMs=15000,botMs=20000,roundMs=1000,maxGroup=4,questionCount=10,seconds=30}={}){
 const entries=new Map();let timer=null,running=null;
 const cfg=()=>rooms.getConfig(),overlap=(a,b)=>a.scope.vocab_set_ids.some(id=>b.scope.vocab_set_ids.includes(id));
 const waited=e=>now()-e.at,raw=s=>({content:'vocab',subject_id:s.subject_id,vocab_set_ids:s.vocab_set_ids,...(s.vocab_kinds?{vocab_kinds:s.vocab_kinds}:{})});
 function status(id){
  const e=entries.get(id);if(!e)return null;
  return {content:'vocab',joined_at:e.at,subject_id:e.scope.subject_id,vocab_set_ids:e.scope.vocab_set_ids,scope_label:e.scope.vocab_label,widened:waited(e)>=widenMs,
   bot_available:Boolean(cfg()?.battle_modes?.bot)&&waited(e)>=botMs,waiting:[...entries.values()].filter(x=>x.grade===e.grade&&x.scope.subject_id===e.scope.subject_id).length};
 }
 function remove(id){entries.delete(id);if(!entries.size&&timer){clearTimer(timer);timer=null;}streams?.publish('lobby');}
 function arm(){if(timer||!entries.size)return;timer=setTimer(async()=>{timer=null;try{await match();}catch{/* Vé còn nguyên; vòng sau thử lại. */}finally{arm();}},roundMs);timer.unref?.();}
 // Kiểm tra + đặt vé trong cùng khoá học sinh như tạo phòng / ghép trận, để hai yêu cầu đồng thời không lọt cả hai hàng chờ.
 async function join(user,data){
  rooms.admission();rooms.feature('vocab');
  const info=await identity(user),scope=await normalizeScope(info.grade,{...data,content:'vocab'});
  if(await deck.count(info.grade,scope)<questionCount)fail('Bộ từ chưa đủ từ để đấu; hãy chọn thêm bộ');
  return rooms.locks.run([user.id],async()=>{
   if(rooms.studentRooms.has(user.id))fail('Em đang trong một phòng khác',409);
   if(inOtherQueue(user.id))fail('Hãy rời hàng chờ Đấu bài học trước',409);
   await safety.assertAvailable(user.id);
   entries.set(user.id,{user,grade:info.grade,scope,at:now()});arm();streams?.publish('lobby');
   return status(user.id);
  });
 }
 const compatible=(a,b)=>a.grade===b.grade&&a.scope.subject_id===b.scope.subject_id&&(overlap(a,b)||waited(a)>=widenMs&&waited(b)>=widenMs);
 async function groupScope(group){
  const common=group[0].scope.vocab_set_ids.filter(id=>group.every(e=>e.scope.vocab_set_ids.includes(id)));
  const ids=(common.length?common:[...new Set(group.flatMap(e=>e.scope.vocab_set_ids))]).slice(0,20);
  const scope=await normalizeScope(group[0].grade,{content:'vocab',subject_id:group[0].scope.subject_id,vocab_set_ids:ids});
  return await deck.count(group[0].grade,scope)>=questionCount?scope:null;
 }
 async function create(group,extra={}){
  return rooms.locks.run(group.map(e=>e.user.id),async()=>{
   if(group.some(e=>entries.get(e.user.id)!==e||rooms.studentRooms.has(e.user.id)))return null;
   const scope=group.length>1?await groupScope(group):group[0].scope;if(!scope)return null;
   for(const e of group)entries.delete(e.user.id);
   try{return await rooms.createUnlocked(group[0].user,{kind:group.length>2?'ffa':'duel',visibility:'code',content_mode:'fixed',scope:raw(scope),question_count:questionCount,seconds,capacity:group.length+(extra.bot_difficulty?1:0),auto_match:true,...extra},group.map(e=>e.user));}
   catch(e){for(const x of group)if(!rooms.studentRooms.has(x.user.id))entries.set(x.user.id,x);throw e;}
   finally{streams?.publish('lobby');}
  });
 }
 async function match(){
  if(running)return running;
  running=(async()=>{
   const c=cfg();if(!entries.size)return;if(!c?.battle_enabled||c.battle_emergency_stop||!c.battle_modes?.vocab){clear();return;}
   const list=[...entries.values()].sort((a,b)=>a.at-b.at||a.user.id-b.user.id),taken=new Set();
   for(const e of list){
    if(taken.has(e.user.id))continue;const group=[e];
    for(const f of list){if(group.length>=maxGroup)break;if(f===e||taken.has(f.user.id)||!group.every(g=>compatible(g,f)))continue;if(await safety.blockedWith(f.user.id,group.map(g=>g.user.id)))continue;group.push(f);}
    if(group.length<2)continue;for(const g of group)taken.add(g.user.id);
    await create(group).catch(()=>null);
   }
  })().finally(()=>{running=null;});
  return running;
 }
 async function toBot(user,difficulty='medium'){
  const e=entries.get(user.id);if(!e)fail('Em không còn trong hàng chờ từ vựng',409);
  rooms.feature('bot');if(waited(e)<botMs)fail('Chờ thêm một chút rồi mới đấu với máy',409);
  return create([e],{bot_difficulty:difficulty});
 }
 function clear(){entries.clear();if(timer){clearTimer(timer);timer=null;}}
 return {join,leave:user=>{remove(user.id);return {left:true};},removeUnlocked:remove,status,has:id=>entries.has(id),match,toBot,clear,size:()=>entries.size};
}
