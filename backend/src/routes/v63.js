import {addLegacyPosition,revokeLegacyPosition,listLegacyPositions} from '../services/access/compatibility.js';
import {contentSubjects} from '../services/capabilities.js';
import {can} from '../services/accessResolver.js';
import {staffQuestionDto} from '../services/access/visibility.js';
import {questionList} from '../services/practice/questions.js';
import {outcomeLabelSql,yccdLabelSql} from '../services/curriculumLabel.js';
import {questionWorkbook} from '../services/questionWorkbook.js';
import {Router} from 'express';
import {z} from 'zod';
import {pool,tx} from '../db/pool.js';
import {curriculumCatalog} from '../services/curriculum.js';
import {contentCapability} from '../services/capabilities.js';
import {enrichMetadata} from '../services/smartMetadata.js';
import {getSubjectFilterSQL} from '../middleware/auth.js';
import {studentAccess} from '../services/practice/authorization.js';
import {scopedSubjects} from '../services/practice/analytics.js';
import {log,fail} from '../services/practice/config.js';
import {bankFilter} from '../middleware/bankScope.js';
const r=Router(),wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
const admin=(req,res,next)=>req.user.role==='admin'?next():res.status(403).json({error:'Chỉ quản trị được phân công vị trí'});
r.get('/questions-export',wrap(async(req,res)=>{if(!req.user.capabilities?.['content.export'])fail('Không đủ quyền xuất nội dung',403);const rows=[];for(let offset=0;offset<=5000;offset+=100){const page=await questionList(req.user,{...req.query,offset,limit:100},'content.export');for(const q of page)rows.push(await can(req.user,'content.export_answers',{subjectId:q.subject_id,grade:q.grade,bankId:q.bank_id})?q:staffQuestionDto(q,false));if(rows.length>5000)fail('Bộ lọc vượt 5000 câu; hãy thu hẹp trước khi xuất',422);if(page.length<100)break;}res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('cau-hoi-advanced.xlsx').send(questionWorkbook(rows));}));
r.get('/curriculum',wrap(async(req,res)=>{const rows=await curriculumCatalog(req.query),visible=[];for(const y of rows)if(req.user.role==='student'||await can(req.user,'curriculum.read',{subjectId:y.subject_id,grade:y.grade}))visible.push(y);res.json(visible);}));
r.post('/metadata/suggest',wrap(async(req,res)=>{if(!req.user.capabilities?.['content.write'])fail('Không có quyền phân loại',403);const d=req.body;if(d.subject_id&&!await contentCapability(req.user,'write',d.subject_id,pool,{grade:Number(d.grade)}))fail('Môn ngoài phạm vi',403);res.json(await enrichMetadata(pool,d));}));
r.get('/positions',admin,wrap(async(req,res)=>res.json(await listLegacyPositions())));
r.post('/positions',admin,wrap(async(req,res)=>res.status(201).json(await addLegacyPosition(req.user,req.body))));
r.delete('/positions/:id',admin,wrap(async(req,res)=>res.json(await revokeLegacyPosition(req.user,req.params.id))));
r.get('/question-quality',wrap(async(req,res)=>{
 if(req.user.role==='student')fail('Trang dành cho nhân sự',403);
 const params=[],where=[bankFilter(req.user,'q',params)],sf=await getSubjectFilterSQL(req.user,'q',params.length+1);if(sf.clause){where.push(sf.clause);params.push(...sf.params);}
 for(const key of ['subject_id','grade','yccd_id'])if(req.query[key]){params.push(req.query[key]);where.push('q.'+key+'=$'+params.length);}
 const rows=(await pool.query(`SELECT q.id,q.question_code,q.stem_text,q.yccd_id,q.metadata_status,q.lifecycle,q.usage_count,
 count(i.id) FILTER(WHERE a.status='completed')::int answered_items,count(DISTINCT a.student_id) FILTER(WHERE a.status='completed')::int unique_students,
 count(i.id) FILTER(WHERE a.status='completed' AND i.grade_result->>'isCorrect'='true')::int correct,
 count(i.id) FILTER(WHERE a.status='completed' AND (i.grade_result->>'score')::numeric>0 AND (i.grade_result->>'score')::numeric<1)::int partial,
 count(i.id) FILTER(WHERE a.status='completed' AND i.skipped)::int skipped,count(i.id) FILTER(WHERE a.status='completed' AND i.uncertain)::int uncertain,
 (SELECT count(DISTINCT er.creator_id)::int FROM exam_items ei JOIN exam_runs er ON er.id=ei.run_id WHERE ei.question_id=q.id) teacher_reuse,
 NULL::numeric median_time_seconds,(SELECT count(*)::int FROM question_review_cases rc WHERE rc.question_id=q.id) report_count
 FROM questions q LEFT JOIN attempt_items i ON i.question_id=q.id AND i.question_version_id=q.active_version_id LEFT JOIN attempts a ON a.id=i.attempt_id
 WHERE ${where.join(' AND ')} GROUP BY q.id ORDER BY q.id DESC LIMIT 200`,params)).rows;
 res.json({questions:rows,uncollected:['Thời gian hoạt động từng câu chưa được thu thập chính xác']});
}));
r.get('/learning-map/:studentId',wrap(async(req,res)=>{
 const id=Number(req.params.studentId);await studentAccess(req.user,id);const subjects=await scopedSubjects(req.user,{studentId:id});
 const rows=(await pool.query(`WITH evidence AS(
 SELECT COALESCE((i.curriculum_snapshot->>'yccd_id')::int,qv.yccd_id) yccd_id,
 COALESCE(i.curriculum_snapshot->>'yccd_code','YCCĐ #'||qv.yccd_id::text) code,
 COALESCE(i.curriculum_snapshot->>'yccd_text','Chưa có nhãn lịch sử') text,
 COALESCE((i.curriculum_snapshot->>'outcome_id')::int,qv.outcome_id) outcome_id,
 COALESCE(i.curriculum_snapshot->>'outcome_code','Outcome #'||qv.outcome_id::text) outcome_code,
 COALESCE((i.curriculum_snapshot->>'subject_id')::int,qv.subject_id) subject_id,
 COALESCE((i.curriculum_snapshot->>'grade')::int,qv.grade) grade,
 i.id item_id,a.id attempt_id,qv.question_id,(i.grade_result->>'score')::numeric score
 FROM attempt_items i JOIN attempts a ON a.id=i.attempt_id JOIN question_versions qv ON qv.id=i.question_version_id
 WHERE a.student_id=$1 AND a.status='completed' AND ($2::int[] IS NULL OR qv.subject_id=ANY($2)))
 SELECT e.yccd_id,e.code,e.text,e.outcome_id,e.outcome_code,e.subject_id,e.grade,
 ${yccdLabelSql('ly','lo')} AS yccd_label,${outcomeLabelSql('lo')} AS outcome_label,count(e.item_id)::int evidence_count,
 count(DISTINCT e.attempt_id)::int attempts,count(DISTINCT e.question_id)::int unique_questions,avg(e.score)*100 observed_score
 FROM evidence e LEFT JOIN curriculum_yccds ly ON ly.id=e.yccd_id LEFT JOIN curriculum_outcomes lo ON lo.id=ly.outcome_id
 WHERE e.yccd_id IS NOT NULL GROUP BY e.yccd_id,e.code,e.text,e.outcome_id,e.outcome_code,e.subject_id,e.grade,ly.id,lo.id
 ORDER BY e.outcome_id,e.yccd_id`,[id,subjects])).rows;
 res.json({rows:rows.map(x=>({...x,confidence:x.unique_questions>=10&&x.attempts>=3?'MEDIUM':'LOW',interpretation:x.unique_questions>=10&&x.attempts>=3?(Number(x.observed_score)>=80?'Điểm mạnh quan sát được':Number(x.observed_score)<50?'Cần củng cố':'Đang hình thành'):'Chưa đủ bằng chứng để kết luận'})),note:'Tổng hợp bằng chứng theo phiên bản đã làm, không thay công thức Mastery. Lượt cũ chưa gắn YCCĐ vẫn xem ở bản đồ theo bài.'});
}));
export default r;
