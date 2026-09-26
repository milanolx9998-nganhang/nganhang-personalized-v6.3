import {Router} from 'express';
import multer from 'multer';
import {pool} from '../db/pool.js';
import {can} from '../services/accessResolver.js';
import {curriculumImpact} from '../services/curriculumManagement.js';
import * as master from '../services/curriculumMaster/service.js';
import * as template from '../services/curriculumMaster/template.js';
const r=Router(),wrap=f=>async(req,res,next)=>{try{await f(req,res);}catch(e){next(e);}};
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:6*1024*1024,files:1,fields:2}});
// File mẫu chương trình: thêm trường subject_id, grade, reason.
const templateUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:6*1024*1024,files:1,fields:4}});
r.get('/catalog',wrap(async(req,res)=>{
 const subjects=(await pool.query('SELECT id,name FROM subjects ORDER BY name')).rows,result=[];
 for(const s of subjects){const grades=[];for(let grade=1;grade<=12;grade++)if(await can(req.user,'curriculum.read',{subjectId:s.id,grade}))grades.push(grade);if(grades.length)result.push({...s,grades});}
 res.json({subjects:result});
}));
r.get('/health',wrap(async(req,res)=>res.json(await master.masterDataHealth(req.user,req.query))));
r.get('/versions',wrap(async(req,res)=>res.json(await master.listVersions(req.user))));
r.post('/versions',wrap(async(req,res)=>res.status(201).json(await master.createVersion(req.user,req.body))));
r.get('/versions/:id',wrap(async(req,res)=>res.json(await master.detail(req.user,Number(req.params.id)))));
r.get('/versions/:id/imports',wrap(async(req,res)=>res.json(await master.listImports(req.user,Number(req.params.id)))));
r.post('/versions/:id/copy',wrap(async(req,res)=>res.status(201).json(await master.copyVersion(req.user,Number(req.params.id),req.body))));
r.post('/versions/:id/publish',wrap(async(req,res)=>res.json(await master.publishVersion(req.user,Number(req.params.id),req.body))));
r.get('/versions/:a/diff/:b',wrap(async(req,res)=>res.json(await master.diffVersions(req.user,Number(req.params.a),Number(req.params.b)))));
for(const type of ['outcome','yccd']){
 r.post('/'+type+'s',wrap(async(req,res)=>res.status(201).json(await master.saveItem(req.user,type,null,req.body))));
 r.patch('/'+type+'s/:id',wrap(async(req,res)=>res.json(await master.saveItem(req.user,type,Number(req.params.id),req.body))));
 r.post('/'+type+'s/:id/retire',wrap(async(req,res)=>res.json(await master.removeItem(req.user,type,Number(req.params.id),req.body))));
 r.get('/'+type+'s/:id/impact',wrap(async(req,res)=>{const result=await curriculumImpact(pool,type,Number(req.params.id));await master.permitted(req.user,'curriculum.read',result.entity);res.json(result);}));
}
// V6.6.7.3 — file mẫu chương trình môn học (Bài + Chủ đề/Outcome + YCCĐ) và bản nháp sửa trên web.
r.get('/template',wrap(async(req,res)=>{const f=await template.templateFile(req.user,req.query);res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition','attachment; filename="'+f.filename+'"');res.send(f.buffer);}));
r.get('/template/workspace',wrap(async(req,res)=>res.json(await template.templateWorkspace(req.user,req.query))));
r.post('/template/preview',templateUpload.single('file'),wrap(async(req,res)=>res.json(await template.previewTemplate(req.user,req.body,req.file))));
r.post('/template/import',templateUpload.single('file'),wrap(async(req,res)=>res.status(201).json(await template.importTemplate(req.user,req.body,req.file))));
r.post('/template/draft',wrap(async(req,res)=>res.status(201).json(await template.startDraft(req.user,req.body))));
r.put('/versions/:id/lesson-plan',wrap(async(req,res)=>res.json(await template.saveLessonPlan(req.user,Number(req.params.id),req.body))));
// V6.6.7.4 — lệnh AI mẫu, mẫu Word nhập câu theo môn, chữ viết tắt của môn trong mã câu.
r.get('/template/prompts',wrap(async(req,res)=>res.json(await template.templatePrompts(req.user,req.query))));
r.get('/template/word',wrap(async(req,res)=>{const f=await template.questionWordTemplate(req.user,req.query);res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');res.setHeader('Content-Disposition','attachment; filename="'+f.filename+'"');res.send(f.buffer);}));
r.put('/subjects/:id/code-letter',wrap(async(req,res)=>res.json(await template.setSubjectLetter(req.user,Number(req.params.id),req.body))));
r.post('/import',upload.single('file'),wrap(async(req,res)=>res.status(201).json(await master.upload(req.user,Number(req.body.version_id),req.file))));
r.get('/import/:id/preview',wrap(async(req,res)=>res.json(await master.preview(req.user,req.params.id))));
r.put('/import/:id/map',wrap(async(req,res)=>res.json(await master.mapImport(req.user,req.params.id,req.body))));
r.put('/import/:id/rows',wrap(async(req,res)=>res.json(await master.editRows(req.user,req.params.id,req.body))));
r.post('/import/:id/commit',wrap(async(req,res)=>res.json(await master.commitImport(req.user,req.params.id,req.body))));
export default r;
