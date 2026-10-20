import {issuedFor,modeDefaults,normalizeModes} from '../services/battle/modes.js';
import {Router} from 'express';
import {z} from 'zod';
import jwt from 'jsonwebtoken';
import {pool,tx} from '../db/pool.js';
import {cookies,SESSION_COOKIE} from '../middleware/session.js';
import {limiter} from '../middleware/rateLimiter.js';
import {settings,validateSettings,fail,log,onSettingsChanged,notifySettingsChanged} from '../services/practice/config.js';
import {createAttempt} from '../services/practice/attempts.js';
import {deck,normalizeScope,contentOptions} from '../services/battle/deck.js';
import {createStorage} from '../services/battle/storage.js';
import {createRooms} from '../services/battle/rooms.js';
import {createSafety} from '../services/battle/safety.js';
import {createMatchmaking} from '../services/battle/matchmaking.js';
import {streams} from '../services/battle/stream.js';
import {roomDto} from '../services/battle/dto.js';
import {terminal} from '../services/battle/engine.js';
import {createAvailability} from '../services/battle/availability.js';
import {createLearningCatalog} from '../services/battle/flex.js';
import {createGoldenHours} from '../services/battle/goldenHours.js';
import {createRatings} from '../services/battle/ratings.js';
import {flexPatchSchema,rankSchema} from '../services/battle/settings.js';
const r=Router(),wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
const uid=req=>String(req.user.id),idSchema=z.string().uuid(),empty=z.object({}).strict();
const scopeSchema=z.object({subject_id:z.number().int().positive().nullable().optional(),branch_id:z.number().int().positive().nullable().optional(),topic_ids:z.array(z.number().int().positive()).min(1).max(100).nullable().optional(),chapter:z.string().max(200).optional()}).strict();
const createSchema=z.object({pacing:z.enum(['sync','self']).optional(),scoring:z.enum(['accuracy','speed']).optional(),time_limit:z.enum(['per_question','total']).optional(),total_minutes:z.number().int().nullable().optional(),reveal_policy:z.enum(['instant','deferred']).optional(),show_live_board:z.boolean().optional(),redemption:z.boolean().optional(),kind:z.enum(['duel','team','ffa','class']),visibility:z.enum(['public','code']).default('code'),open_slots:z.boolean().default(false),ranked:z.boolean().default(false),class_id:z.number().int().positive().optional(),scope:scopeSchema.default({}),content_mode:z.enum(['fixed','vote']).default('fixed'),capacity:z.number().int().positive().optional(),question_count:z.union([z.literal(7),z.literal(10),z.literal(15)]).default(7),seconds:z.number().int().min(20).max(180).default(30)}).strict().superRefine((v,c)=>{const max={duel:2,team:8,ffa:20,class:50}[v.kind];if(v.capacity&&(v.capacity>max||v.capacity<(v.kind==='class'?1:2)||v.kind==='duel'&&v.capacity!==2))c.addIssue({code:'custom',message:'Sức chứa không hợp lệ'});if(v.kind==='class'?!v.class_id||!v.scope.subject_id||v.content_mode!=='fixed':v.class_id!=null||![20,30,45].includes(v.seconds))c.addIssue({code:'custom',message:'Cấu hình phòng không hợp lệ'});}).transform(v=>({...v,capacity:v.capacity||{duel:2,team:8,ffa:20,class:50}[v.kind]}));
const actionSchemas={next:z.object({expected_cursor:z.number().int().min(0).max(14).optional()}).strict(),visibility:z.object({visibility:z.enum(['code','public']),open_slots:z.boolean().default(false)}).strict(),start:z.object({show_top3:z.boolean().optional()}).strict(),ready:z.object({ready:z.boolean(),ranked:z.boolean().optional()}).strict(),team:z.object({team:z.union([z.literal(1),z.literal(2)])}).strict(),vote:z.object({option_id:z.string().max(80),force:z.boolean().default(false)}).strict(),nominate:z.object({scope:scopeSchema}).strict(),answer:z.object({index:z.number().int().min(0).max(14),client_id:z.string().uuid(),response:z.unknown().optional(),skip:z.boolean().optional()}).strict().refine(v=>v.skip===true?v.response===undefined:v.response!==undefined,'Gửi đáp án hoặc bỏ qua'),emote:z.object({kind:z.enum(['hello','cheer','thanks','well_done'])}).strict()};
export async function battleIdentity(user,classId=null,subjectId=null){
 if(user.role==='student'){
  const rows=(await pool.query(`SELECT c.id AS class_id,c.name AS class_name,c.grade FROM class_memberships m JOIN classes c ON c.id=m.class_id JOIN school_years y ON y.id=c.school_year_id
   WHERE m.student_id=$1 AND m.ended_at IS NULL AND m.valid_from<=CURRENT_DATE AND (m.valid_to IS NULL OR m.valid_to>=CURRENT_DATE)
   AND (y.start_date IS NULL OR y.start_date<=CURRENT_DATE) AND (y.end_date IS NULL OR y.end_date>=CURRENT_DATE)
   ORDER BY m.valid_from DESC,m.id DESC LIMIT 1`,[user.id])).rows;
  // Năm học nhập từ danh sách có thể chưa có ngày: ngày trống không chặn (như access/policy.js); nhiều lớp thì lấy lớp mới nhất như bản đồ bài học.
  if(!rows.length)fail('Em chưa có lớp đang học trong năm hiện tại; hãy liên hệ giáo viên',403);return rows[0];
 }
 if(!classId)return {staff:true};
 const row=(await pool.query('SELECT id AS class_id,name AS class_name,grade FROM classes WHERE id=$1',[classId])).rows[0];if(!row)fail('Không tìm thấy lớp',404);
 if(user.role!=='admin'&&!(await pool.query('SELECT 1 FROM teacher_class_assignments WHERE teacher_id=$1 AND class_id=$2 AND subject_id=$3',[user.id,classId,subjectId])).rowCount)fail('Cần được phân công đúng lớp và môn',403);
 return row;
}
const safety=createSafety(),store=createStorage(),goldenHours=createGoldenHours(),ratings=createRatings();
export const battleRooms=createRooms({store,deck,safety,streams,identity:battleIdentity,normalizeScope,options:contentOptions,goldenHours,ratings,learning:createLearningCatalog()});
const matchmaking=createMatchmaking({rooms:battleRooms,deck,safety,identity:battleIdentity,normalizeScope,streams,learning:createLearningCatalog(),goldenHours,ratings});
battleRooms.setMatchmaking(matchmaking);
export const battleAvailability=createAvailability({initialize:async()=>battleRooms.start(await settings()),cleanup:()=>{battleRooms.dispose();streams.closeAll('unavailable');}});
onSettingsChanged(cfg=>battleAvailability.ready?battleRooms.configure(cfg):undefined);
export async function initializeBattle(){return battleAvailability.start();}
const student=req=>{if(req.user.role!=='student')fail('Trang dành cho học sinh',403);};
const admin=req=>{if(req.user.role!=='admin')fail('Chỉ quản trị xử lý an toàn',403);};
const createLimit=limiter('battle-create',600000,async()=>Number((await settings()).battle_limits.create_rooms),uid),codeLimit=limiter('battle-code',60000,async()=>Number((await settings()).battle_limits.bad_codes),uid,true);
r.use((req,res,next)=>{if(!battleAvailability.ready)return res.status(503).json({error:'Đấu chưa sẵn sàng',code:'BATTLE_UNAVAILABLE'});req.battleReceivedAt??=Date.now();next();});
r.use((req,res,next)=>{try{if(req.user.role==='student'&&req.body&&Object.keys(req.body).some(k=>k in modeDefaults||k==='redemption'))normalizeModes({...req.body,kind:'duel'},battleRooms.getConfig());next();}catch(e){next(e);}});
r.get('/me',wrap(async(req,res)=>{const cfg=await settings(),info=await battleIdentity(req.user);res.json({...info,battle_enabled:cfg.battle_enabled,battle_emergency_stop:cfg.battle_emergency_stop,battle_modes:cfg.battle_modes,current_room_id:battleRooms.studentRooms.get(req.user.id)||null,queue:matchmaking.status(req.user.id),suspension:await safety.suspension(req.user.id),reports:await safety.feedback(req.user)});}));
r.get('/options',wrap(async(req,res)=>{
 const q=z.object({class_id:z.coerce.number().int().positive().optional(),subject_id:z.coerce.number().int().positive().optional(),count:z.coerce.number().int().refine(n=>[7,10,15].includes(n)).default(7)}).strict().parse(req.query);
 // Giáo viên chọn lớp trước: danh sách môn là các môn được phân công ở lớp đó (quản trị: mọi môn), kể cả khi đã chọn một môn.
 if(req.user.role!=='student'&&q.class_id){
  const cls=(await pool.query('SELECT grade FROM classes WHERE id=$1',[q.class_id])).rows[0];if(!cls)fail('Không tìm thấy lớp',404);
  const allowed=req.user.role==='admin'?null:(await pool.query('SELECT DISTINCT subject_id FROM teacher_class_assignments WHERE teacher_id=$1 AND class_id=$2',[req.user.id,q.class_id])).rows.map(r=>Number(r.subject_id));
  if(allowed&&(!allowed.length||q.subject_id&&!allowed.includes(q.subject_id)))fail('Cần được phân công đúng lớp và môn',403);
  const all=await contentOptions(cls.grade,q.count,null,{}),out=q.subject_id?await contentOptions(cls.grade,q.count,null,{subject_id:q.subject_id}):all,ok=x=>!allowed||allowed.includes(Number(x.subject_id));
  return res.json({...out,subjects:all.subjects.filter(s=>!allowed||allowed.includes(Number(s.id))),chapters:out.chapters.filter(ok),topics:out.topics.filter(ok),suggestions:[]});
 }
 const info=await battleIdentity(req.user,q.class_id,q.subject_id);
 if(!info.grade)fail('Giáo viên cần chọn lớp và môn');res.json(await contentOptions(info.grade,q.count,req.user.role==='student'?req.user.id:null,{subject_id:q.subject_id}));
}));
r.get('/lobby',wrap(async(req,res)=>{student(req);const cfg=await settings();if(!cfg.battle_modes.class)battleRooms.feature('lobby');res.json(await battleRooms.lobby(req.user));}));
async function openStream(req,res,key,snapshot,allowed,projector=false){
 if((await settings()).battle_emergency_stop)fail('Đấu đang dừng khẩn cấp',403);
 const token=cookies(req)[SESSION_COOKIE]||(req.headers.authorization||'').slice(7),claims=jwt.decode(token);
 await streams.open({req,res,key,projector,user:req.user,snapshot,expiresAt:claims?.exp*1000,onDisconnect:key==='lobby'?undefined:()=>battleRooms.disconnected(req.user,key),authorized:async()=>{
  if(claims?.exp&&Date.now()>=claims.exp*1000)return false;
  const row=(await pool.query('SELECT token_version FROM users WHERE id=$1 AND is_active=true AND NOT must_change_password',[req.user.id])).rows[0];
  return Boolean(row&&row.token_version===req.user.token_version&&!await safety.suspension(req.user.id)&&await allowed());
 }});
}
r.get('/lobby/stream',wrap(async(req,res)=>{student(req);const cfg=await settings();if(!cfg.battle_modes.class&&!cfg.battle_modes.matchmaking)battleRooms.feature('lobby');await battleIdentity(req.user);await openStream(req,res,'lobby',()=>battleRooms.lobby(req.user),async()=>!(await settings()).battle_emergency_stop);}));
r.post('/rooms',createLimit,wrap(async(req,res)=>{const d=createSchema.parse(req.body);if(d.kind==='class'?req.user.role==='student':req.user.role!=='student')fail('Vai trò không được tạo kiểu phòng này',403);res.status(201).json(roomDto(await battleRooms.create(req.user,d),req.user,Date.now()));}));
r.post('/rooms/join',codeLimit,wrap(async(req,res)=>{student(req);const {code}=z.object({code:z.string().regex(/^\d{6}$/)}).strict().parse(req.body),id=battleRooms.byCode(code);if(!id)fail('Mã phòng không hợp lệ',404);res.json(roomDto(await battleRooms.join(req.user,id),req.user,Date.now()));}));
r.post('/rooms/:id/join',wrap(async(req,res)=>{student(req);const id=idSchema.parse(req.params.id),room=await battleRooms.get(id);if(room.kind!=='class')battleRooms.feature('lobby');if(room.visibility!=='public'&&!room.open_slots&&room.kind!=='class')fail('Phòng này cần mã',403);res.json(roomDto(await battleRooms.join(req.user,id),req.user,Date.now()));}));
r.post('/rooms/:id/leave',wrap(async(req,res)=>{empty.parse(req.body);res.json(roomDto(await battleRooms.leave(req.user,idSchema.parse(req.params.id)),req.user,Date.now()));}));
for(const action of ['visibility','ready','team','vote','nominate','start','next','pause','resume','end','answer','emote'])r.post('/rooms/:id/'+action,wrap(async(req,res)=>res.json(await battleRooms.command(req.user,idSchema.parse(req.params.id),action,(actionSchemas[action]||empty).parse(req.body),req.battleReceivedAt))));
r.get('/rooms/:id',wrap(async(req,res)=>res.json(await battleRooms.snapshot(req.user,idSchema.parse(req.params.id)))));
r.get('/rooms/:id/stream',wrap(async(req,res)=>{const id=idSchema.parse(req.params.id);await battleRooms.snapshot(req.user,id);await openStream(req,res,id,()=>battleRooms.snapshot(req.user,id),async()=>{try{const room=await battleRooms.get(id);battleRooms.access(room,req.user);return true;}catch{return false;}});}));
for(const live of [false,true])r.get('/rooms/:id/projector'+(live?'/stream':''),wrap(async(req,res)=>{
 const id=idSchema.parse(req.params.id),allowed=async()=>{const room=await battleRooms.get(id);return room.kind==='class'&&room.host_id===req.user.id&&req.user.role!=='student';};
 if(!await allowed())fail('Projector access denied',403);
 const snapshot=()=>battleRooms.snapshot(req.user,id,false,{projector:true});
 if(live)await openStream(req,res,id,snapshot,allowed,true);else res.json(await snapshot());
}));
r.get('/rooms/:id/result',wrap(async(req,res)=>res.json(await battleRooms.snapshot(req.user,idSchema.parse(req.params.id),true))));
r.get('/history',wrap(async(req,res)=>res.json(await battleRooms.history(req.user))));
r.post('/rooms/:id/rematch',createLimit,wrap(async(req,res)=>{
 empty.parse(req.body);const old=await battleRooms.get(idSchema.parse(req.params.id));battleRooms.access(old,req.user,false);if(!terminal(old))fail('Ván chưa kết thúc',409);
 if(old.kind==='class'&&req.user.id!==old.host_id)fail('Chỉ giáo viên mở lại ván lớp',403);
 const data=createSchema.parse({...Object.fromEntries(Object.keys(modeDefaults).map(k=>[k,old[k]??modeDefaults[k]])),kind:old.kind,visibility:old.visibility,...(old.class_id?{class_id:old.class_id}:{}),scope:{subject_id:old.scope.subject_id,branch_id:old.scope.branch_id,topic_ids:old.scope.topic_ids},content_mode:'fixed',capacity:old.capacity,question_count:old.question_count,seconds:old.seconds});
 res.status(201).json(roomDto(await battleRooms.create(req.user,{...data,rematch_of:old.id}),req.user,Date.now()));
}));
r.post('/rooms/:id/retry-wrong',wrap(async(req,res)=>{
 student(req);empty.parse(req.body);const room=await battleRooms.get(idSchema.parse(req.params.id));battleRooms.access(room,req.user,false);if(!terminal(room))fail('Ván chưa kết thúc',409);
 const versions=room.questions.slice(0,issuedFor(room,req.user.id)).filter(q=>Number(room.answers.find(a=>a.idx===q.idx&&a.user_id===req.user.id)?.score||0)<1).map(q=>q.question_version_id);
 res.json(await createAttempt(req.user,{}, {battleRetry:{roomId:room.id,versionIds:versions}}));
}));
const lengthsSchema=z.union([z.literal('any'),z.array(z.union([z.literal(7),z.literal(10),z.literal(15)])).min(1).max(3)]);
const ticketSchema=z.object({kinds:z.array(z.enum(['duel','ffa'])).min(1).max(2),choices:z.array(scopeSchema).max(3).default([]),lengths:lengthsSchema.default('any'),flex:z.enum(['strict','gradual']).default('gradual'),ranked:z.boolean().default(true),bot_fill:z.boolean().default(false)}).strict();
const legacyTicket=z.object({kind:z.enum(['duel','ffa']),scope:scopeSchema.default({})}).strict().transform(v=>({kinds:[v.kind],choices:[v.scope],lengths:[7],flex:'strict',ranked:false}));
r.post('/match',wrap(async(req,res)=>{student(req);res.json(await matchmaking.join(req.user,z.union([ticketSchema,legacyTicket]).parse(req.body)));}));
r.patch('/match',wrap(async(req,res)=>{student(req);z.object({accept:z.literal(true)}).strict().parse(req.body);res.json(await matchmaking.expand(req.user));}));
r.delete('/match',wrap(async(req,res)=>{student(req);res.json(await matchmaking.leave(req.user));}));
r.post('/match/accept-room',wrap(async(req,res)=>{student(req);const d=z.object({room_id:idSchema}).strict().parse(req.body);res.json(await matchmaking.acceptRoom(req.user,d.room_id));}));
r.post('/match/exit',wrap(async(req,res)=>{student(req);res.json(await matchmaking.exit(req.user,z.object({to:z.enum(['bot','public_room','practice']),difficulty:z.enum(['easy','medium','hard']).optional()}).strict().parse(req.body)));}));
r.post('/bot',createLimit,wrap(async(req,res)=>{student(req);const d=z.object({choices:z.array(scopeSchema).max(3).default([]),lengths:lengthsSchema.default('any'),difficulty:z.enum(['easy','medium','hard']).optional()}).strict().parse(req.body);res.status(201).json(await matchmaking.exit(req.user,{to:'bot',difficulty:d.difficulty},d));}));
r.get('/rank',wrap(async(req,res)=>{student(req);battleRooms.feature('ranked');const info=await battleIdentity(req.user);res.json(await ratings.profile(req.user.id,info.grade,await settings()));}));
r.patch('/rank',wrap(async(req,res)=>{student(req);battleRooms.feature('ranked');const {hidden}=z.object({hidden:z.boolean()}).strict().parse(req.body),info=await battleIdentity(req.user);const result=await ratings.visibility(req.user.id,info.grade,hidden,await settings());await battleRooms.refreshBadges(req.user.id);res.json(result);}));
r.get('/leaderboard',wrap(async(req,res)=>{student(req);battleRooms.feature('ranked');const info=await battleIdentity(req.user);res.json(await ratings.leaderboard(info.grade,await settings()));}));
const goldenSchema=z.object({grade:z.number().int().min(1).max(12),subject_id:z.number().int().positive().nullable().default(null),starts_at:z.string().datetime({offset:true}),minutes:z.number().int().min(10).max(60),repeat_weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7).nullable().default(null),active:z.boolean().default(true)}).strict();
r.get('/golden-hours',wrap(async(req,res)=>{if(req.user.role==='student')fail('Trang dành cho người quản lý',403);res.json(await goldenHours.list(req.user));}));
r.post('/golden-hours',wrap(async(req,res)=>{res.status(201).json(await goldenHours.save(req.user,goldenSchema.parse(req.body)));streams.publish('lobby');}));
r.put('/golden-hours/:id',wrap(async(req,res)=>{res.json(await goldenHours.save(req.user,goldenSchema.parse(req.body),idSchema.parse(req.params.id)));streams.publish('lobby');}));
r.delete('/golden-hours/:id',wrap(async(req,res)=>{res.json(await goldenHours.remove(req.user,idSchema.parse(req.params.id)));streams.publish('lobby');}));
r.put('/admin/golden-hour-grants',wrap(async(req,res)=>{
 admin(req);const d=z.object({user_id:z.number().int().positive(),grade:z.number().int().min(1).max(12),subject_id:z.number().int().positive().nullable(),enabled:z.boolean()}).strict().parse(req.body);
 if(!(await pool.query("SELECT 1 FROM users WHERE id=$1 AND role<>'student' AND is_active",[d.user_id])).rowCount)fail('Cần tài khoản giáo viên đang hoạt động');
 if(d.subject_id===null)await pool.query(d.enabled?'INSERT INTO battle_golden_hour_grade_grants(user_id,grade) VALUES($1,$2) ON CONFLICT DO NOTHING':'DELETE FROM battle_golden_hour_grade_grants WHERE user_id=$1 AND grade=$2',[d.user_id,d.grade]);
 else await pool.query(d.enabled?'INSERT INTO battle_golden_hour_grants(user_id,grade,subject_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING':'DELETE FROM battle_golden_hour_grants WHERE user_id=$1 AND grade=$2 AND subject_id=$3',[d.user_id,d.grade,d.subject_id]);res.json({ok:true});
}));
r.post('/reports',wrap(async(req,res)=>{student(req);res.status(201).json(await safety.report(req.user,z.object({room_id:idSchema,target_id:z.number().int().positive(),reason:z.enum(['bullying','name','cheating','other']),note:z.string().trim().max(500).default('')}).strict().parse(req.body)));}));
r.get('/blocks',wrap(async(req,res)=>{student(req);res.json(await safety.blocks(req.user));}));
r.post('/blocks',wrap(async(req,res)=>{
 student(req);const {user_id}=z.object({user_id:z.number().int().positive()}).strict().parse(req.body);
 await battleRooms.locks.run([req.user.id,user_id],async()=>{
  const id=battleRooms.studentRooms.get(req.user.id),room=id?await battleRooms.get(id):null;
  if(room?.kind==='class'&&room.players.some(p=>p.user_id===user_id&&!p.left_at))fail('Phòng lớp do thầy cô quản lý; em có thể báo cáo',403);
  await safety.block(req.user,user_id);
  if(room?.phase==='lobby'&&room.players.some(p=>p.user_id===user_id&&!p.left_at))await battleRooms.leaveUnlocked(req.user,id);
 });streams.publish('lobby');res.json({ok:true});
}));
r.delete('/blocks/:userId',wrap(async(req,res)=>{student(req);await safety.unblock(req.user,z.coerce.number().int().positive().parse(req.params.userId));res.json({ok:true});}));
r.get('/admin/reports',wrap(async(req,res)=>{admin(req);res.json(await safety.reports());}));
r.post('/admin/reports',wrap(async(req,res)=>{admin(req);res.json(await safety.handle(req.user,z.object({id:idSchema,status:z.enum(['reviewing','resolved','dismissed'])}).strict().parse(req.body)));}));
r.get('/admin/reports/:id',wrap(async(req,res)=>{admin(req);const report=(await pool.query('SELECT room_id FROM battle_reports WHERE id=$1',[idSchema.parse(req.params.id)])).rows[0];if(!report)fail('Không tìm thấy báo cáo',404);const room=await battleRooms.get(report.room_id);res.json({room:roomDto(room,req.user,Date.now()),events:(await pool.query('SELECT kind,actor_id,at,detail FROM battle_safety_events WHERE room_id=$1 ORDER BY at DESC LIMIT 100',[room.id])).rows});}));
r.get('/admin/suspensions',wrap(async(req,res)=>{admin(req);res.json(await safety.suspensions());}));
r.post('/admin/suspensions',wrap(async(req,res)=>{admin(req);const data=z.object({user_id:z.number().int().positive(),days:z.union([z.literal(1),z.literal(3),z.literal(7)]),reason:z.string().trim().min(1).max(300)}).strict().parse(req.body);await safety.suspend(req.user,data);await battleRooms.suspend(data.user_id);res.json({ok:true});}));
r.get('/admin/settings',wrap(async(req,res)=>{admin(req);res.json(Object.fromEntries(Object.entries(await settings()).filter(([k])=>k.startsWith('battle_'))));}));
r.post('/admin/settings',wrap(async(req,res)=>{
 admin(req);const changes=z.object({battle_enabled:z.boolean().optional(),battle_emergency_stop:z.boolean().optional(),battle_modes:z.record(z.boolean()).optional(),battle_limits:z.record(z.number()).optional(),battle_flex:flexPatchSchema.optional(),battle_rank:rankSchema.optional()}).strict().parse(req.body);
 await tx(async c=>{const current=await settings(c);for(const key of ['battle_modes','battle_flex','battle_rank'])if(changes[key])changes[key]={...current[key],...changes[key]};validateSettings(current,changes);for(const [key,value] of Object.entries(changes))await c.query('INSERT INTO system_settings(key,value,updated_by) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()',[key,JSON.stringify(value),req.user.id]);await log(c,req.user,'BATTLE_SETTINGS','settings',{keys:Object.keys(changes)});});await notifySettingsChanged();res.json({ok:true});
}));
export default r;
