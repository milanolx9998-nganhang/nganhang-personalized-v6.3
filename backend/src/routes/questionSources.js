import {storage,sourceKey} from '../services/storage/index.js';
import {Router} from 'express';import path from 'node:path';import fs from 'node:fs/promises';
import {pool} from '../db/pool.js';import {can} from '../services/accessResolver.js';import {reviewQuestionAccess} from '../services/questionReview.js';import {fail,log} from '../services/practice/config.js';
const r=Router(),wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
async function sourceAccess(user,id){const q=await reviewQuestionAccess(pool,user,Number(id));if(!await can(user,'content.download_source',{subjectId:q.subject_id,grade:q.grade,bankId:q.bank_id}))fail('Không có quyền tải tài liệu nguồn',403);return q;}
r.get('/questions/:id/sources',wrap(async(req,res)=>{await sourceAccess(req.user,req.params.id);res.json((await pool.query('SELECT s.id,s.source_type,s.question_version_id FROM question_sources s JOIN question_versions v ON v.id=s.question_version_id WHERE v.question_id=$1 ORDER BY s.id',[req.params.id])).rows);}));
r.get('/questions/:id/source/:sourceId',wrap(async(req,res)=>{
 await sourceAccess(req.user,req.params.id);const s=(await pool.query('SELECT s.* FROM question_sources s JOIN question_versions v ON v.id=s.question_version_id WHERE v.question_id=$1 AND s.id=$2',[req.params.id,req.params.sourceId])).rows[0];if(!s?.source_path)fail('Không tìm thấy tài liệu nguồn',404);
 const key=sourceKey(s.source_path);let bytes;try{bytes=await storage.getAuthorizedDelivery(key,async()=>true);}catch(e){if(e.code==='ENOENT')fail('Tài liệu nguồn không còn trên máy chủ',404);throw e;}
 await log(pool,req.user,'SOURCE_DOWNLOAD',s.id,{question_id:Number(req.params.id),source_type:s.source_type});res.setHeader('Cache-Control','private, no-store');res.attachment('tai-lieu-nguon-'+s.id+path.extname(key));res.send(bytes);
}));
export default r;
