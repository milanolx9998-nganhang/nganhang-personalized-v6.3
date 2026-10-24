// /api/vocab — Ngân hàng từ vựng (tách khỏi ngân hàng câu hỏi): bộ từ, dòng từ, nhập tệp.
import {Router} from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {overview,listSets,createSet,updateSet,listEntries,updateEntry,parseVocabFile,previewImport,confirmImport,templateWorkbook} from '../services/vocab/bank.js';
const r=Router(),wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
const temp=path.resolve(process.env.UPLOAD_DIR||'uploads','private-imports');fs.mkdirSync(temp,{recursive:true});
const upload=multer({storage:multer.diskStorage({destination:temp,filename:(_r,file,cb)=>cb(null,crypto.randomUUID()+path.extname(file.originalname).toLowerCase())}),limits:{fileSize:5*1024*1024,files:1},fileFilter:(_req,file,cb)=>cb(null,['.csv','.json','.xlsx'].includes(path.extname(file.originalname).toLowerCase()))});
const id=req=>z.coerce.number().int().positive().parse(req.params.id);
r.get('/subjects',wrap(async(req,res)=>res.json({subjects:await overview(req.user)})));
r.get('/sets',wrap(async(req,res)=>res.json({sets:await listSets(req.user,z.coerce.number().int().positive().parse(req.query.subject_id))})));
r.post('/sets',wrap(async(req,res)=>res.status(201).json(await createSet(req.user,req.body))));
r.patch('/sets/:id',wrap(async(req,res)=>res.json(await updateSet(req.user,id(req),req.body))));
r.get('/entries',wrap(async(req,res)=>res.json(await listEntries(req.user,req.query))));
r.patch('/entries/:id',wrap(async(req,res)=>res.json(await updateEntry(req.user,id(req),req.body))));
r.delete('/entries/:id',wrap(async(req,res)=>res.json(await updateEntry(req.user,id(req),{status:'retired'}))));
r.post('/import/preview',upload.single('file'),wrap(async(req,res)=>{try{
 const d=z.object({subject_id:z.coerce.number().int().positive(),source:z.string().trim().max(40).optional(),set:z.string().trim().max(120).optional()}).parse(req.body);
 res.json(await previewImport(req.user,{subject_id:d.subject_id,rows:parseVocabFile(req.file),source:d.source||null,set:d.set||null}));
}finally{if(req.file)fs.unlink(req.file.path,()=>{});}}));
r.post('/import/confirm',wrap(async(req,res)=>res.json(await confirmImport(req.user,req.body?.token))));
r.get('/template',wrap(async(req,res)=>{const lang=req.query.lang==='zh'?'zh':'en';res.attachment(lang==='zh'?'mau-tu-vung-tieng-trung.xlsx':'mau-tu-vung-tieng-anh.xlsx').type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(templateWorkbook(lang));}));
export default r;
