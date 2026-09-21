import {visibleQuestion} from '../services/access/visibility.js';
import {can} from '../services/accessResolver.js';
import {Router} from 'express';
import {z} from 'zod';
import {pool} from '../db/pool.js';
import {auth,getSubjectFilterSQL,checkSubjectAccess} from '../middleware/auth.js';
import {contentCapability} from '../services/capabilities.js';
import {audit} from '../utils/audit.js';
import {generateExam,readExamItems} from '../services/examGenerator.js';
import {buildExamDocx,buildAnswerKeyDocx} from '../services/wordExport.js';
import {buildQtiZip} from '../services/qtiExport.js';
import {bankFilter} from '../middleware/bankScope.js';
const r=Router();r.use(auth);
const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
async function permitted(user,action,subject,grade){if(!await can(user,action.includes('.')?action:'exam.'+({write:'generate',review:'create'}[action]||action),{subjectId:subject,grade}))throw Object.assign(new Error('Không có quyền với đề môn này'),{status:403});}
async function runFor(user,id){
 const row=(await pool.query('SELECT er.*,m.subject_id AS legacy_subject_id,m.name AS legacy_matrix_name FROM exam_runs er LEFT JOIN matrix_templates m ON m.id=er.matrix_id WHERE er.id=$1',[id])).rows[0];
 if(!row)throw Object.assign(new Error('Không tìm thấy đề'),{status:404});
 const snapshot=row.matrix_snapshot||{};
 const result={...row,subject_id:snapshot.subject_id||row.legacy_subject_id,matrix_name:snapshot.name||row.legacy_matrix_name,subject_name:snapshot.subject_name,grade:snapshot.grade,duration_minutes:snapshot.duration_minutes};
 await permitted(user,'read',result.subject_id,result.grade);return result;
}
r.get('/',wrap(async(req,res)=>{
 const sf=await getSubjectFilterSQL(req.user,'scope',1,'exam.read');
 res.json((await pool.query("SELECT er.*,COALESCE(er.matrix_snapshot->>'name',m.name) AS matrix_name,s.name AS subject_name,u.full_name AS creator_name,(SELECT count(DISTINCT exam_code)::int FROM exam_items WHERE run_id=er.id) AS code_count FROM exam_runs er LEFT JOIN matrix_templates m ON m.id=er.matrix_id CROSS JOIN LATERAL (SELECT COALESCE((er.matrix_snapshot->>'subject_id')::int,m.subject_id) AS subject_id,COALESCE((er.matrix_snapshot->>'grade')::int,m.grade) AS grade) scope LEFT JOIN subjects s ON s.id=scope.subject_id LEFT JOIN users u ON u.id=er.creator_id "+(sf.clause?'WHERE '+sf.clause:'')+' ORDER BY er.id DESC LIMIT 200',sf.params)).rows);
}));
r.get('/:id(\\d+)',wrap(async(req,res)=>{
 const run=await runFor(req.user,req.params.id),items=await readExamItems(run.id),codes={};
 for(const item of items)(codes[item.exam_code]||=[]).push(await visibleQuestion(req.user,item));
 res.json({...run,codes});
}));
r.post('/generate',wrap(async(req,res)=>{
 const data=z.object({matrix_id:z.number().int().positive(),exam_name:z.string().trim().min(1).max(300),exam_code_count:z.number().int().min(1).max(20).default(1),shuffle_options:z.boolean().default(true),avoid_cross_code_overlap:z.boolean().default(true),anti_repeat_days:z.number().int().min(0).max(365).default(180),tag_extras:z.array(z.object({tag_id:z.number().int().positive(),count:z.number().int().min(1).max(20)})).default([])}).parse(req.body);
 const matrix=(await pool.query('SELECT subject_id,grade FROM matrix_templates WHERE id=$1',[data.matrix_id])).rows[0];
 if(!matrix)throw Object.assign(new Error('Không tìm thấy ma trận'),{status:404});await permitted(req.user,'write',matrix.subject_id,matrix.grade);
 const result=await generateExam({matrixId:data.matrix_id,examName:data.exam_name,examCodeCount:data.exam_code_count,shuffleOptions:data.shuffle_options,avoidCrossCodeOverlap:data.avoid_cross_code_overlap,antiRepeatDays:data.anti_repeat_days,tagExtras:data.tag_extras,creatorId:req.user.id,actor:req.user});
 await audit(req.user.id,'GENERATE_EXAM','exam_run',result.exam_run_id,{matrix_id:data.matrix_id,code_count:data.exam_code_count},req.ip);res.status(201).json(result);
}));
async function exportItems(run,code){
 const items=await readExamItems(run.id,code);
 if(!items.length)throw Object.assign(new Error('Mã đề không tồn tại'),{status:404});
 if(items.some(q=>q.legacy_unverifiable))throw Object.assign(new Error('Đề cũ không có snapshot phiên bản; không xuất nội dung hiện tại như thể là lịch sử'),{status:409});
 return items;
}
r.get('/:id/download',wrap(async(req,res)=>{
 const run=await runFor(req.user,req.params.id),code=req.query.code||'101',kind=req.query.kind==='answer'?'answer':'exam',items=await exportItems(run,code);
 await permitted(req.user,'content.export',run.subject_id,run.grade);if(kind==='answer'){await permitted(req.user,'content.export_answers',run.subject_id,run.grade);await permitted(req.user,'content.view_answer',run.subject_id,run.grade);}
 const buf=await(kind==='answer'?buildAnswerKeyDocx:buildExamDocx)({examName:run.exam_name,matrix:run,code,items});
 res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document');res.setHeader('Content-Disposition','attachment; filename="'+kind+'_'+run.id+'_'+encodeURIComponent(code)+'.docx"');res.send(buf);
}));
r.get('/:id/download-qti',wrap(async(req,res)=>{
 const run=await runFor(req.user,req.params.id),code=req.query.code||'101',items=await exportItems(run,code);
 await permitted(req.user,'content.export',run.subject_id,run.grade);await permitted(req.user,'content.export_answers',run.subject_id,run.grade);await permitted(req.user,'content.view_answer',run.subject_id,run.grade);
 const buf=await buildQtiZip({title:run.exam_name+' · Mã '+code,questions:items});
 res.type('application/zip');res.setHeader('Content-Disposition','attachment; filename="qti_'+run.id+'_'+encodeURIComponent(code)+'.zip"');res.send(buf);
}));
r.delete('/:id',wrap(async(req,res)=>{const run=await runFor(req.user,req.params.id);await permitted(req.user,'review',run.subject_id,run.grade);await pool.query('DELETE FROM exam_runs WHERE id=$1',[run.id]);await audit(req.user.id,'DELETE_EXAM','exam_run',run.id,{},req.ip);res.json({ok:true});}));
// Export Question Bank → QTI ZIP (filter theo subject + grade)
r.get('/export-qti-bank', async (req, res, next) => {
  try {
    if(!req.user.capabilities?.['content.export'])return res.status(403).json({error:'Không có quyền xuất nội dung'});
    const { subject_id, grade } = req.query;
    const where = [];
    const params = [];
    where.push(bankFilter(req.user,'q',params));
    for(const capability of ['content.read','content.export','content.view_answer']){const sf=await getSubjectFilterSQL(req.user,'q',params.length+1,capability);if(sf.clause){where.push(sf.clause);params.push(...sf.params);}}

    if (subject_id) { params.push(subject_id); where.push(`q.subject_id = $${params.length}`); }
    if (grade) { params.push(grade); where.push(`q.grade = $${params.length}`); }
    where.push(`q.status IN ('Đã rà soát', 'Đã duyệt', 'Đã sử dụng')`);

    const { rows } = await pool.query(`
      SELECT q.id, q.question_code, q.stem_text, q.q_type,
             q.option_a, q.option_b, q.option_c, q.option_d,
             q.answer_key, q.explanation, q.score, q.image_url,q.cognitive_level,q.normalized_content AS content,q.topic_id,q.subject_id,q.grade,
             s.name AS subject_name
      FROM questions q
      LEFT JOIN subjects s ON s.id = q.subject_id
      WHERE ${where.join(' AND ')}
      ORDER BY q.id
      LIMIT 500
    `, params);

    const title = `Ngân hàng câu hỏi${subject_id ? ` - ${rows[0]?.subject_name || ''}` : ''}${grade ? ` Lớp ${grade}` : ''}`;
    const buf = await buildQtiZip({ title, questions: rows });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="qti_bank.zip"`);
    res.send(buf);
  } catch (err) { next(err); }
});

export default r;
