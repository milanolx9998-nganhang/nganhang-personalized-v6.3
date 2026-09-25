import {can} from '../services/accessResolver.js';
import {staffQuestionDto} from '../services/access/visibility.js';
import {Router} from 'express';
import {pool,tx} from '../db/pool.js';
import {getSubjectFilterSQL} from '../middleware/auth.js';
import {bankFilter} from '../middleware/bankScope.js';
import {canReviewQuestion,reviewQuestionAccess,classifyQuestionChange,openReviewCase,resolveReviewCase,versionWorkflow} from '../services/questionReview.js';
import {persistQuestion} from '../services/practice/questions.js';
import {normalizeQuestion} from '../services/practice/grading.js';
import {fail,log} from '../services/practice/config.js';
import {outcomeLabelSql,yccdLabelSql} from '../services/curriculumLabel.js';
const r=Router(),wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
r.get('/review-cases',wrap(async(req,res)=>{
 if(req.user.role==='student')fail('Học sinh không truy cập hàng đợi duyệt',403);
 const params=[],where=[bankFilter(req.user,'q',params)],sf=await getSubjectFilterSQL(req.user,'q',params.length+1);
 if(sf.clause){where.push(sf.clause);params.push(...sf.params);}
 for(const [key,col] of Object.entries({subject_id:'q.subject_id',grade:'q.grade',branch_id:'q.branch_id',reason_code:'c.reason_code',severity:'c.severity',status:'c.status',author:'c.opened_by',assigned_to:'c.assigned_to'}))if(req.query[key]){params.push(req.query[key]);where.push(col+'=$'+params.length);}
 res.json((await pool.query("SELECT c.*,q.question_code,q.stem_text,q.current_version_id,q.active_version_id,q.quarantined,u.full_name AS opened_by_name,v.review_status,v.version_number,extract(epoch FROM now()-c.opened_at)/86400 AS age_days FROM question_review_cases c JOIN questions q ON q.id=c.question_id LEFT JOIN users u ON u.id=c.opened_by LEFT JOIN question_versions v ON v.id=q.current_version_id WHERE "+where.join(' AND ')+" ORDER BY CASE c.status WHEN 'OPEN' THEN 0 WHEN 'IN_REVIEW' THEN 1 ELSE 2 END,c.severity,c.opened_at LIMIT 200",params)).rows);
}));
r.post('/questions/:id/review-cases',wrap(async(req,res)=>res.status(201).json(await tx(async c=>{const q=await reviewQuestionAccess(c,req.user,Number(req.params.id),'read');return openReviewCase(c,req.user,q,req.body);}))));
r.post('/attempts/:id/items/:itemId/report',wrap(async(req,res)=>res.status(201).json(await tx(async c=>{
 if(req.user.role!=='student')fail('Chỉ học sinh gửi phản ánh từ bài làm',403);
 const row=(await c.query('SELECT i.question_id,i.question_version_id FROM attempt_items i JOIN attempts a ON a.id=i.attempt_id WHERE a.id=$1 AND i.id=$2 AND a.student_id=$3',[req.params.id,req.params.itemId,req.user.id])).rows[0];if(!row)fail('Không tìm thấy câu trong bài của em',404);
 const q=(await c.query('SELECT * FROM questions WHERE id=$1',[row.question_id])).rows[0];return openReviewCase(c,req.user,q,{reason_code:'STUDENT_REPORT',question_version_id:row.question_version_id,note:req.body.note,source_ref:req.params.id+':'+req.params.itemId});
}))));
r.post('/review-cases/:id/resolve',wrap(async(req,res)=>res.json(await tx(c=>resolveReviewCase(c,req.user,Number(req.params.id),req.body)))));
r.post('/questions/:id/version-workflow',wrap(async(req,res)=>res.json(await tx(c=>versionWorkflow(c,req.user,Number(req.params.id),req.body.action,req.body)))));
r.get('/questions/:id/reviewers',wrap(async(req,res)=>{
 const q=await reviewQuestionAccess(pool,req.user,Number(req.params.id),'review');
 const staff=(await pool.query("SELECT id,full_name,role,subject_id,department_id FROM users WHERE is_active AND role<>'student' ORDER BY full_name")).rows,eligible=[];
 for(const user of staff)if(await canReviewQuestion(pool,user,q)){try{await reviewQuestionAccess(pool,user,q.id,'read');eligible.push({id:user.id,full_name:user.full_name});}catch(e){if(e.status!==403)throw e;}}
 res.json(eligible);
}));
r.get('/questions/:id/compare',wrap(async(req,res)=>{
 const q=await reviewQuestionAccess(pool,req.user,Number(req.params.id));
 if(!await can(req.user,'content.view_answer',{subjectId:q.subject_id,grade:q.grade,bankId:q.bank_id}))fail('Không có quyền xem đáp án để so sánh phiên bản',403);
 const versions=(await pool.query('SELECT v.*,'+outcomeLabelSql('o')+' AS outcome_label,'+yccdLabelSql('y','yo')+' AS yccd_label FROM question_versions v LEFT JOIN curriculum_yccds y ON y.id=v.yccd_id LEFT JOIN curriculum_outcomes yo ON yo.id=y.outcome_id LEFT JOIN curriculum_outcomes o ON o.id=v.outcome_id WHERE v.question_id=$1 ORDER BY v.version_number DESC',[q.id])).rows;
 const after=versions.find(v=>v.id===(req.query.after||q.current_version_id)),before=versions.find(v=>v.id===(req.query.before||after?.based_on_version_id||q.active_version_id))||null;
 if(!after)fail('Không tìm thấy phiên bản',404);
 const diff=classifyQuestionChange(before?.content||{},after.content);
 res.json({question:{id:q.id,question_code:q.question_code,current_version_id:q.current_version_id,active_version_id:q.active_version_id,quarantined:q.quarantined},before:before?staffQuestionDto(before,true):null,after:staffQuestionDto(after,true),diff,versions:versions.map(v=>staffQuestionDto(v,true))});
}));
r.post('/questions/:id/restore',wrap(async(req,res)=>res.status(201).json(await tx(async c=>{
 const q=await reviewQuestionAccess(c,req.user,Number(req.params.id),'write');
 const v=(await c.query('SELECT * FROM question_versions WHERE id=$1 AND question_id=$2',[req.body.version_id,q.id])).rows[0];if(!v)fail('Không tìm thấy bản lịch sử',404);
 if(!String(req.body.reason||'').trim())fail('Cần lý do khôi phục');
 await c.query("SELECT set_config('app.force_version','true',true),set_config('app.restored_from',$1,true)",[v.id]);
 const content=normalizeQuestion(v),result=await persistQuestion(c,req.user,{...content,subject_id:q.subject_id,grade:q.grade,topic_id:q.topic_id,branch_id:q.branch_id,outcome_id:q.outcome_id,yccd_id:q.yccd_id,question_version_id:q.current_version_id},{id:q.id});
 await c.query("SELECT set_config('app.force_version','false',true),set_config('app.restored_from','',true)");
 await log(c,req.user,'QUESTION_RESTORE_DRAFT',q.id,{from:v.id,to:result.current_version_id,reason:req.body.reason});return result;
}))));
r.get('/questions/:id/version-quality',wrap(async(req,res)=>{
 const q=await reviewQuestionAccess(pool,req.user,Number(req.params.id));
 res.json((await pool.query("SELECT v.id,v.version_number,v.review_status,v.id=$2 AS is_active,count(i.id) FILTER(WHERE a.status='completed')::int responses,count(DISTINCT a.student_id) FILTER(WHERE a.status='completed')::int students,avg((i.grade_result->>'score')::numeric) FILTER(WHERE a.status='completed') AS mean_score,count(i.id) FILTER(WHERE a.status='completed' AND i.skipped)::int skipped FROM question_versions v LEFT JOIN attempt_items i ON i.question_version_id=v.id LEFT JOIN attempts a ON a.id=i.attempt_id WHERE v.question_id=$1 GROUP BY v.id ORDER BY v.version_number DESC",[q.id,q.active_version_id])).rows);
}));
export default r;
