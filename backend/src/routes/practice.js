import {saveBankAccess} from '../services/access/banks.js';
import {setLegacyTeaching} from '../services/access/compatibility.js';
import {classesFor,getEffectiveAccess,bankDecision,invalidateAccess,can} from '../services/accessResolver.js';
import {contentCapability} from '../services/capabilities.js';
import questionReviewRoutes from './questionReview.js';
import questionSources from './questionSources.js';
import {staffQuestionDto} from '../services/access/visibility.js';
import v643Routes from './v643.js';
import {workspaceOverview} from '../services/practice/workspace.js';
import v63Routes from './v63.js';
import {classDashboard,scopedSubjects} from '../services/practice/analytics.js';
import {answered,portfolioOverview,attemptHistory,attemptReview,portfolioMastery,portfolioAssignments,portfolioClasses} from '../services/practice/portfolio.js';
import adminRoutes from './practiceAdmin.js';
import {cached,cachedShared,cacheKey,invalidate,hashOf} from '../services/cache/cache.js';
import {Router} from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {z} from 'zod';
import {auth} from '../middleware/auth.js';
import {pool,tx} from '../db/pool.js';
import {contentOptions,availability,createAttempt,getAttempt,saveResponse,submitAttempt,dashboard} from '../services/practice/attempts.js';
import {assignmentAccess,staff,classAccess,studentAccess,bankAccess,subjectAccess} from '../services/practice/authorization.js';
import {settings,defaults,fail,log,validateSettings} from '../services/practice/config.js';
import {studentAssignment} from '../services/practice/studentDto.js';
import {attemptMedia} from '../services/practice/privateMedia.js';
import {saveAssignment,listAssignments} from '../services/practice/assignments.js';
import {questionList,persistQuestion,transition,personalBank} from '../services/practice/questions.js';
import {questionQueue,selectionIds,authorOptions,viewCounts,exceptionCounts} from '../services/practice/questionQueue.js';
import {quickEdit,quickEditPreflight,undoEditOperation} from '../services/practice/quickEdit.js';
import {lessonOptions,bulkAssignLesson} from '../services/practice/lessonAssignment.js';
import {bulkPreflight,bulkWorkflow,BULK_ACTIONS,MAX_BULK_IDS} from '../services/practice/bulkWorkflow.js';
import {parseJob,getJob,editJob,confirmJob,submitImportJob,listJobs} from '../services/practice/imports.js';
import {studentList,studentProfile,createStudent,updateStudent,transferStudent,studentStatus,setStudentPassword} from '../services/practice/students.js';
import {importRoster,previewRoster,confirmRoster} from '../services/practice/roster.js';
import {buildWorksheet} from '../services/practice/worksheetExport.js';
import {candidates} from '../services/practice/attempts.js';
import {selectQuestions} from '../services/practice/selection.js';
const r=Router();r.use(auth);
r.use(questionReviewRoutes);
r.use(questionSources);
r.use(v643Routes);
r.use(v63Routes);
r.use(adminRoutes);
r.get('/templates/:name',(req,res)=>{
 if(req.user.role==='student')return res.sendStatus(403);
 if(!['question-import-khtn.docx','question-import.xlsx','question-import-images.zip','student-roster.xlsx','TEMPLATE_CHUAN_TOAN_TRUONG_OUTCOME_YCCD_QUESTION_METADATA_V1_1.xlsx'].includes(req.params.name))return res.sendStatus(404);
 res.download(path.resolve('../templates',req.params.name));
});
const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
const admin=user=>{if(user.role!=='admin')fail('Chỉ quản trị được thực hiện',403);};
const uploadPermission=capability=>(req,res,next)=>req.user.capabilities?.[capability]?next():res.status(403).json({error:'Không có quyền tải tệp nghiệp vụ này'});
const temp=path.resolve(process.env.UPLOAD_DIR||'uploads','private-imports');fs.mkdirSync(temp,{recursive:true});
const upload=multer({storage:multer.diskStorage({destination:temp,filename:(_r,file,cb)=>cb(null,crypto.randomUUID()+path.extname(file.originalname).toLowerCase())}),limits:{fileSize:20*1024*1024,files:1},fileFilter:(_req,file,cb)=>cb(null,['.docx','.xlsx','.zip'].includes(path.extname(file.originalname).toLowerCase()))});
r.get('/workspace',wrap(async(req,res)=>res.json(await workspaceOverview(req.user))));
r.get('/settings',wrap(async(req,res)=>res.json(await settings())));
r.put('/settings',wrap(async(req,res)=>{if(!await can(req.user,'system.config',{}))fail('Không có quyền cấu hình hệ thống',403);await tx(async c=>{validateSettings(await settings(c),req.body);for(const [key,value] of Object.entries(req.body)){if(!(key in defaults))fail('Cấu hình không hợp lệ: '+key);if(['personalized_recommendations','auto_personalized_practice','essay_ai_grading','leaderboard','canvas_lti'].includes(key)&&value!==false)fail('Tính năng ngoài V1 chưa được bật');if(typeof defaults[key]==='number'&&(!Number.isFinite(value)||value<0))fail('Giá trị cấu hình không hợp lệ');if(key==='mastery_decay_rate'&&(value<=0||value>1))fail('Hệ số Mastery phải trong (0,1]');await c.query('INSERT INTO system_settings(key,value,updated_by) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()',[key,JSON.stringify(value),req.user.id]);}await log(c,req.user,'SETTINGS_UPDATE','settings',{keys:Object.keys(req.body)});});res.json({ok:true});}));
// PERF V6.6.7: catalog giống nhau với mọi người (~400 KB) → cache chung 10 phút theo thế hệ nội dung, giữ sẵn
// dạng chuỗi JSON để gửi thẳng, không parse / tuần tự hóa lại mỗi request.
r.get('/catalog',wrap(async(req,res)=>res.type('application/json').send(await cachedShared(['catalog','v2'],600,async()=>{const subjects=(await pool.query('SELECT s.*,p.config AS profile FROM subjects s LEFT JOIN subject_profiles p ON p.subject_id=s.id ORDER BY s.name')).rows;const topics=(await pool.query("SELECT * FROM topics WHERE status='ACTIVE' ORDER BY subject_id,grade,order_index")).rows;const taxonomy_nodes=(await pool.query('SELECT n.*,v.subject_id,v.name AS version_name FROM taxonomy_nodes n JOIN taxonomy_versions v ON v.id=n.version_id ORDER BY v.id,n.id')).rows;return JSON.stringify({subjects,topics,taxonomy_nodes});},{raw:true}))));
// Curriculum/YCCĐ/Bài mapping dùng chung theo từng người dùng và môn/khối; không chứa đáp án.
r.get('/content-options',wrap(async(req,res)=>{
 const subject=Number(req.query.subject_id),grade=Number(req.query.grade);
 res.json(await cachedShared(['content-options',req.user.id,subject,grade],600,()=>contentOptions(req.user,{subject_id:subject,grade})));
}));
r.post('/availability',wrap(async(req,res)=>{const {availability:counts,shortages}=await availability(req.user,req.body);res.json({availability:counts,shortages});}));
r.post('/attempts',wrap(async(req,res)=>res.status(201).json(await freshDashboard(req,await createAttempt(req.user,req.body)))));
r.get('/attempts/:id',wrap(async(req,res)=>res.json(await getAttempt(req.user,req.params.id))));
r.get('/attempts/:attemptId/items/:itemId/media/:mediaId',wrap(attemptMedia));
r.put('/attempts/:id/items/:itemId',wrap(async(req,res)=>res.json(await saveResponse(req.user,req.params.id,req.params.itemId,req.body))));
r.post('/attempts/:id/submit',wrap(async(req,res)=>res.json(await freshDashboard(req,await submitAttempt(req.user,req.params.id)))));
r.post('/attempts/:id/retry',wrap(async(req,res)=>res.status(201).json(await freshDashboard(req,await createAttempt(req.user,{}, {retryId:req.params.id})))));
// Dashboard học sinh: cache 15 giây; tạo / nộp bài xóa ngay khóa của học sinh đó.
const dashboardKey=id=>cacheKey('dashboard','student',id);
const freshDashboard=async(req,value)=>{await invalidate(dashboardKey(req.user.id));return value;};
r.get('/dashboard',wrap(async(req,res)=>{if(req.user.role!=='student')fail('Trang dành cho học sinh',403);res.json(await cached(dashboardKey(req.user.id),15,()=>dashboard(req.user.id)));}));
// Danh sách bài giao của học sinh: cache 20 giây theo thế hệ nội dung (giáo viên giao / sửa bài → thế hệ mới).
r.get('/assignments',wrap(async(req,res)=>res.json(req.user.role==='student'?await cachedShared(['assignments','student',req.user.id],20,()=>listAssignments(req.user)):await listAssignments(req.user))));
r.post('/assignments',wrap(async(req,res)=>res.status(201).json(await saveAssignment(req.user,req.body))));
r.put('/assignments/:id',wrap(async(req,res)=>res.json(await saveAssignment(req.user,req.body,req.params.id))));
r.post('/assignments/:id/release-answers',wrap(async(req,res)=>{
 if(req.user.role==='student')fail('Không có quyền công bố đáp án',403);
 const {reason}=z.object({reason:z.string().trim().min(3).max(1000)}).strict().parse(req.body);
 await tx(async c=>{const a=(await c.query('SELECT * FROM assignments WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];await assignmentAccess(req.user,a,c,'assignment.manage');
  if(a.answer_release_policy!=='MANUAL_RELEASE')fail('Bài này không dùng công bố thủ công');
  if(!await can(req.user,'content.view_answer',{subjectId:a.config.subject_id,grade:a.config.grade},c))fail('Không có quyền công bố đáp án môn/khối này',403);
  await c.query('UPDATE assignments SET answers_released_at=COALESCE(answers_released_at,now()),answers_released_by=COALESCE(answers_released_by,$2) WHERE id=$1',[a.id,req.user.id]);await log(c,req.user,'ASSIGNMENT_ANSWERS_RELEASED',a.id,{reason});});res.json({ok:true});
}));
r.get('/shared/:token',wrap(async(req,res)=>{const a=(await pool.query('SELECT * FROM assignments WHERE share_token=$1',[req.params.token])).rows[0];await assignmentAccess(req.user,a);res.json(req.user.role==='student'?studentAssignment(a):a);}));
r.post('/assignments/:id/start',wrap(async(req,res)=>res.status(201).json(await freshDashboard(req,await createAttempt(req.user,{}, {assignmentId:req.params.id})))));
let activeExports=0;
r.get('/assignments/:id/export',wrap(async(req,res)=>{
 if(req.user.role==='student')fail('Chỉ người giao bài được xuất phiếu',403);
 const a=(await pool.query('SELECT * FROM assignments WHERE id=$1',[req.params.id])).rows[0];await assignmentAccess(req.user,a);
 if(!await can(req.user,'content.export',{subjectId:a.config.subject_id,grade:a.config.grade}))fail('Không có quyền xuất nội dung',403);
 if(req.query.answers==='true'&&(!await can(req.user,'content.export_answers',{subjectId:a.config.subject_id,grade:a.config.grade})||!await can(req.user,'content.view_answer',{subjectId:a.config.subject_id,grade:a.config.grade})))fail('Không có quyền xuất đáp án',403);
 const format=req.query.format||'docx';if(!['docx','pdf'].includes(format))fail('Chọn Word hoặc PDF');
 if(activeExports>=2)fail('Đang xuất phiếu khác, vui lòng thử lại sau',429);
 let items;
 if(a.kind==='fixed')items=(await pool.query('SELECT * FROM question_versions WHERE id=ANY($1::uuid[])',[a.fixed_versions])).rows.sort((x,y)=>a.fixed_versions.indexOf(x.id)-a.fixed_versions.indexOf(y.id));
 else {const picked=selectQuestions(await candidates(pool,req.user,a.config),a.config,a.id);if(picked.shortages.length)fail('Kho không còn đủ câu để xuất phiếu',409);items=picked.items;}
 activeExports++;try{const buffer=await buildWorksheet({title:a.title,instructions:a.instructions,items,format,answers:req.query.answers==='true'});res.type(format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document');res.setHeader('Content-Disposition','attachment; filename="phieu-luyen.'+format+'"');res.send(buffer);}finally{activeExports--;}
}));
r.get('/classes',wrap(async(req,res)=>{if(req.user.role==='student')fail('Không đủ quyền',403);res.json((await pool.query('SELECT c.*,y.name AS school_year,(SELECT count(*)::int FROM class_memberships cm WHERE cm.class_id=c.id AND cm.ended_at IS NULL AND cm.valid_from<=CURRENT_DATE AND (cm.valid_to IS NULL OR cm.valid_to>=CURRENT_DATE)) AS student_count FROM classes c JOIN school_years y ON y.id=c.school_year_id WHERE $2 OR c.id=ANY($1::int[]) ORDER BY y.name DESC,c.name',[await classesFor(req.user),req.user.role==='admin'])).rows);}));
r.get('/classes/:id/dashboard',wrap(async(req,res)=>res.json(await classDashboard(req.user,Number(req.params.id),req.query))));
r.get('/students',wrap(async(req,res)=>res.json(await studentList(req.user,req.query))));
r.get('/students/:id/portfolio',wrap(async(req,res)=>res.json(await portfolioOverview(req.user,req.params.id))));
r.get('/students/:id/attempts',wrap(async(req,res)=>res.json(await attemptHistory(req.user,req.params.id,req.query))));
r.get('/students/:id/attempts/:attemptId',wrap(async(req,res)=>res.json(await attemptReview(req.user,req.params.id,req.params.attemptId))));
r.get('/students/:id/mastery',wrap(async(req,res)=>res.json(await portfolioMastery(req.user,req.params.id))));
r.get('/students/:id/assignments',wrap(async(req,res)=>res.json(await portfolioAssignments(req.user,req.params.id))));
r.get('/students/:id/classes',wrap(async(req,res)=>res.json(await portfolioClasses(req.user,req.params.id))));
r.post('/students',wrap(async(req,res)=>res.status(201).json(await createStudent(req.user,req.body))));
r.get('/students/:id/profile',wrap(async(req,res)=>res.json(await studentProfile(req.user,Number(req.params.id)))));
r.put('/students/:id/profile',wrap(async(req,res)=>res.json(await updateStudent(req.user,Number(req.params.id),req.body))));
r.post('/students/:id/transfer',wrap(async(req,res)=>res.json(await transferStudent(req.user,Number(req.params.id),req.body))));
r.put('/students/:id/status',wrap(async(req,res)=>res.json(await studentStatus(req.user,Number(req.params.id),req.body))));
r.get('/students/:id',wrap(async(req,res)=>{await studentAccess(req.user,Number(req.params.id));res.json(await dashboard(Number(req.params.id),pool,await scopedSubjects(req.user,{studentId:Number(req.params.id)})));}));
r.post('/students/:id/reset-password',wrap(async(req,res)=>res.json(await setStudentPassword(req.user,Number(req.params.id),req.body))));
r.post('/roster',uploadPermission('student.manage_basic'),upload.single('file'),wrap(async(req,res)=>res.json({students:await importRoster(req.user,req.file)})));
r.post('/roster/preview',uploadPermission('student.manage_basic'),upload.single('file'),wrap(async(req,res)=>{try{res.json(await previewRoster(req.user,req.file));}finally{if(req.file)fs.unlinkSync(req.file.path);}}));
r.post('/roster/confirm',wrap(async(req,res)=>res.json(await confirmRoster(req.user,req.body.token))));
r.post('/classes',wrap(async(req,res)=>{admin(req.user);const d=z.object({name:z.string().min(1),grade:z.number().int().min(1).max(12),year:z.string().min(4)}).parse(req.body);res.json(await tx(async c=>{const y=(await c.query('INSERT INTO school_years(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',[d.year])).rows[0];return (await c.query('INSERT INTO classes(name,grade,school_year_id) VALUES($1,$2,$3) RETURNING *',[d.name,d.grade,y.id])).rows[0];}));}));
r.post('/class-permissions',wrap(async(req,res)=>{admin(req.user);res.json(await setLegacyTeaching(req.user,req.body));}));
r.get('/banks',wrap(async(req,res)=>{if(req.user.role==='student')fail('Không đủ quyền',403);if(req.user.capabilities?.['content.write']){await personalBank(pool,req.user);invalidateAccess(req.user);}const a=await getEffectiveAccess(req.user);res.json(a.org.banks.filter(b=>bankDecision(a,'read',b).allowed));}));
r.post('/banks',wrap(async(req,res)=>{admin(req.user);const d=z.object({name:z.string().min(1),kind:z.enum(['department','school']),department_id:z.number().int().nullable().default(null)}).parse(req.body);res.json((await pool.query('INSERT INTO banks(name,kind,department_id) VALUES($1,$2,$3) RETURNING *',[d.name,d.kind,d.department_id])).rows[0]);}));
r.post('/bank-permissions',wrap(async(req,res)=>{admin(req.user);const d=z.object({bank_id:z.number().int().positive(),user_id:z.number().int().positive(),permission:z.enum(['read','write','review'])}).strict().parse(req.body);res.json(await saveBankAccess(req.user,d.user_id,d.bank_id,{permission:d.permission,reason:'Cấp quyền kho qua API tương thích'}));}));
r.get('/questions',wrap(async(req,res)=>{if(req.user.role==='student')fail('Không đủ quyền',403);res.json(await questionList(req.user,req.query));}));
// Canonical bulk surface. The legacy /api/questions/bulk-review path stays for old clients only;
// everything new goes through here so preflight and execution share one domain path.
const bulkBody=z.object({
 ids:z.array(z.number().int().positive()).min(1).max(MAX_BULK_IDS),
 action:z.enum(BULK_ACTIONS),
 reason:z.string().trim().max(1000).optional().default(''),
 reason_codes:z.array(z.string().max(40)).max(10).optional().default([]),
 target_bank_id:z.number().int().positive().nullable().optional().default(null),
 expected_versions:z.record(z.string()).nullable().optional().default(null),
}).strict();
r.get('/questions/queue',wrap(async(req,res)=>res.json(await questionQueue(req.user,req.query))));
// Số đếm của bàn làm việc: cache 8 giây theo người xem + bộ lọc + thế hệ nội dung (sửa câu → đếm lại ngay).
r.get('/questions/view-counts',wrap(async(req,res)=>res.json(await cachedShared(['counts','views',req.user.id],8,()=>viewCounts(req.user)))));
r.get('/questions/exception-counts',wrap(async(req,res)=>res.json(await cachedShared(['counts','exceptions',req.user.id,hashOf(req.query)],8,()=>exceptionCounts(req.user,req.query)))));
// V6.6.6 — sửa nhanh mức/Bài từ bàn làm việc; preflight chạy cùng đường trong giao dịch luôn hoàn tác.
const quickEditBody=z.object({
 ids:z.array(z.number().int().positive()).min(1).max(MAX_BULK_IDS).optional(),
 changes:z.object({cognitive_level:z.number().int().min(1).max(4).optional(),topic_id:z.number().int().positive().nullable().optional()}).strict().optional(),
 items:z.array(z.object({id:z.number().int().positive(),cognitive_level:z.number().int().min(1).max(4).optional(),topic_id:z.number().int().positive().nullable().optional()}).strict()).min(1).max(MAX_BULK_IDS).optional(),
 regenerate_code:z.boolean().optional().default(false),
 reason:z.string().trim().max(1000).optional().default(''),
 expected_versions:z.record(z.string().uuid()).nullable().optional().default(null),
}).strict().refine(b=>b.items?!b.ids&&!b.changes:!!(b.ids&&b.changes),{message:'Gửi ids + changes, hoặc items — không trộn hai dạng'});
r.post('/questions/quick-edit/preflight',wrap(async(req,res)=>res.json(await quickEditPreflight(req.user,quickEditBody.parse(req.body)))));
r.post('/questions/quick-edit',wrap(async(req,res)=>res.json(await quickEdit(req.user,quickEditBody.parse(req.body)))));
// Hoàn tác do máy chủ cấp quyền: chỉ nhận mã thao tác, không nhận giá trị cũ từ client.
r.post('/questions/edit-operations/:id/undo',wrap(async(req,res)=>res.json(await undoEditOperation(req.user,z.string().uuid().parse(req.params.id)))));
r.get('/questions/selection-ids',wrap(async(req,res)=>res.json(await selectionIds(req.user,req.query))));
r.get('/questions/author-options',wrap(async(req,res)=>res.json(await authorOptions(req.user,req.query))));
const idList=z.object({ids:z.array(z.number().int().positive()).min(1).max(MAX_BULK_IDS)}).strict();
r.post('/questions/lesson-options',wrap(async(req,res)=>res.json(await lessonOptions(req.user,idList.parse(req.body).ids))));
r.post('/questions/assign-lesson',wrap(async(req,res)=>res.json(await bulkAssignLesson(req.user,z.object({
 assignments:z.array(z.object({question_ids:z.array(z.number().int().positive()).min(1),topic_id:z.number().int().positive()}).strict()).min(1).max(100),
 reason:z.string().trim().max(1000).optional().default(''),
}).strict().parse(req.body)))));
r.post('/questions/bulk-preflight',wrap(async(req,res)=>res.json(await bulkPreflight(req.user,bulkBody.parse(req.body)))));
r.post('/questions/bulk-workflow',wrap(async(req,res)=>res.json(await bulkWorkflow(req.user,bulkBody.parse(req.body)))));
r.post('/questions',wrap(async(req,res)=>res.status(201).json(await tx(c=>persistQuestion(c,req.user,req.body,{bankId:req.body.bank_id})))));
r.put('/questions/:id',wrap(async(req,res)=>res.json(await tx(c=>persistQuestion(c,req.user,req.body,{id:Number(req.params.id)})))));
r.post('/questions/:id/workflow',wrap(async(req,res)=>res.json(await tx(c=>transition(c,req.user,Number(req.params.id),req.body.status,req.body)))));
r.post('/questions/:id/copy',wrap(async(req,res)=>res.json(await tx(async c=>{const q=(await c.query('SELECT * FROM questions WHERE id=$1',[req.params.id])).rows[0];if(!q)fail('Không tìm thấy câu hỏi',404);await bankAccess(req.user,q.bank_id,'read',c);const version=(await c.query('SELECT * FROM question_versions WHERE id=$1',[q.current_version_id])).rows[0];return persistQuestion(c,req.user,version);} ))));
r.get('/questions/:id/versions',wrap(async(req,res)=>{const q=(await pool.query('SELECT * FROM questions WHERE id=$1',[req.params.id])).rows[0];if(!q||req.user.role==='student')fail('Không đủ quyền',403);if(q.subject_id&&!await contentCapability(req.user,'read',q.subject_id,pool,{grade:q.grade,bankId:q.bank_id}))fail('Môn ngoài phạm vi',403);await bankAccess(req.user,q.bank_id);if(!await can(req.user,'content.view_answer',{subjectId:q.subject_id,grade:q.grade,bankId:q.bank_id}))fail('Không có quyền xem đáp án phiên bản',403);res.json((await pool.query('SELECT * FROM question_versions WHERE question_id=$1 ORDER BY version_number DESC',[req.params.id])).rows.map(v=>staffQuestionDto(v,true)));}));
r.post('/imports',uploadPermission('content.write'),upload.single('file'),wrap(async(req,res)=>res.status(201).json(await parseJob(req.user,req.file,req.body.metadata?JSON.parse(req.body.metadata):{}))));
r.get('/imports',wrap(async(req,res)=>res.json(await listJobs(req.user,req.query))));
r.get('/imports/:id',wrap(async(req,res)=>res.json(await getJob(req.user,req.params.id))));
r.put('/imports/:id',wrap(async(req,res)=>res.json(await editJob(req.user,req.params.id,req.body))));
r.post('/imports/:id/submit',wrap(async(req,res)=>res.json(await submitImportJob(req.user,z.string().uuid().parse(req.params.id)))));
r.post('/imports/:id/confirm',wrap(async(req,res)=>{const d=z.object({ids:z.array(z.string().uuid()).min(1),bank_id:z.number().int().optional()}).parse(req.body);res.json(await confirmJob(req.user,req.params.id,d.ids,d.bank_id));}));
r.get('/audit',wrap(async(req,res)=>{admin(req.user);res.json((await pool.query('SELECT a.*,u.full_name FROM practice_audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200')).rows);}));
r.get('/metrics',wrap(async(req,res)=>{admin(req.user);const r=(await pool.query(`SELECT (SELECT count(*) FROM users WHERE role='student' AND last_login IS NOT NULL)::int activated_students,(SELECT count(DISTINCT student_id) FROM attempts)::int students_with_attempts,(SELECT count(*) FROM attempts WHERE status='completed')::int completed_attempts,(SELECT count(*) FROM attempts)::int started_attempts,(SELECT count(*) FROM attempt_items i JOIN attempts a ON a.id=i.attempt_id WHERE a.status='completed' AND ${answered})::int answered,(SELECT count(DISTINCT question_id) FROM attempt_items)::int unique_questions,(SELECT count(*) FROM (SELECT student_id FROM attempts WHERE status='completed' GROUP BY student_id HAVING count(DISTINCT (completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)>=2) s)::int returning_students,(SELECT count(DISTINCT (completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) FROM attempts WHERE status='completed')::int active_days`)).rows[0];const confidence=(await pool.query("SELECT state->>'confidence' AS level,count(*)::int AS count FROM mastery_states GROUP BY 1")).rows;const source=(await pool.query('SELECT source,count(*)::int AS count FROM attempts GROUP BY source')).rows;const topic_usage=(await pool.query('SELECT t.id,t.name,count(DISTINCT e.student_id)::int students,count(DISTINCT e.attempt_id)::int attempts FROM mastery_events e JOIN topics t ON t.id=e.topic_id GROUP BY t.id,t.name ORDER BY attempts DESC LIMIT 30')).rows;const gains=(await pool.query("SELECT avg((state->'history'->-1->>'mastery')::numeric-(state->'history'->0->>'mastery')::numeric) AS mean_gain,count(*)::int AS comparable_levels FROM mastery_states WHERE jsonb_array_length(state->'history')>=2")).rows[0];const improved=(await pool.query("SELECT count(DISTINCT student_id)::int count FROM mastery_states WHERE state->>'confidence' IN ('MEDIUM','HIGH') AND jsonb_array_length(state->'history')>=2 AND (state->'history'->-1->>'mastery')::numeric>(state->'history'->0->>'mastery')::numeric")).rows[0].count;res.json({...r,improved_students:improved,retention_7d:null,retention_note:'Chưa triển khai cohort đủ 7 ngày; không suy từ số lượt quay lại',confidence,source,topic_usage,gains});}));
export default r;
