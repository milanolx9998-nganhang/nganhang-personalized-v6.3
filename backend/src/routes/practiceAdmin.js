import {setLegacyTeaching} from '../services/access/compatibility.js';
import {operations} from '../services/practice/operations.js';
import {Router} from 'express';
import {z} from 'zod';
import {pool,tx} from '../db/pool.js';
import {fail,log} from '../services/practice/config.js';
const r=Router();
const admin=(req,res,next)=>req.user.role==='admin'?next():res.status(403).json({error:'Chỉ quản trị quản lý cấu trúc môn'});
const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
r.get('/operations',admin,wrap(async(_req,res)=>res.json(await operations())));
r.get('/taxonomy',wrap(async(req,res)=>res.json({versions:(await pool.query('SELECT * FROM taxonomy_versions ORDER BY id')).rows,nodes:(await pool.query('SELECT * FROM taxonomy_nodes ORDER BY version_id,id')).rows})));
r.post('/taxonomy/versions',admin,wrap(async(req,res)=>{
 const d=z.object({subject_id:z.number().int().positive(),name:z.string().min(1).max(200)}).parse(req.body);
 const row=(await pool.query('INSERT INTO taxonomy_versions(subject_id,name) VALUES($1,$2) RETURNING *',[d.subject_id,d.name])).rows[0];await log(pool,req.user,'TAXONOMY_VERSION',row.id,d);res.status(201).json(row);
}));
r.post('/taxonomy/nodes',admin,wrap(async(req,res)=>{
 const d=z.object({version_id:z.number().int().positive(),parent_id:z.number().int().positive().nullable().default(null),node_type:z.enum(['topic','specialty']),name:z.string().min(1).max(1000),metadata:z.record(z.unknown()).default({})}).parse(req.body);
 res.status(201).json(await tx(async c=>{if(d.parent_id&&!(await c.query('SELECT 1 FROM taxonomy_nodes WHERE id=$1 AND version_id=$2',[d.parent_id,d.version_id])).rowCount)fail('Nút cha khác phiên bản chương trình');const row=(await c.query('INSERT INTO taxonomy_nodes(version_id,parent_id,node_type,name,metadata) VALUES($1,$2,$3,$4,$5) RETURNING *',[d.version_id,d.parent_id,d.node_type,d.name,JSON.stringify(d.metadata)])).rows[0];await log(c,req.user,'TAXONOMY_NODE',row.id,d);return row;}));
}));
r.put('/profiles/:id',admin,wrap(async(req,res)=>{
 const d=z.object({draft_required_fields:z.array(z.literal('stem')).default(['stem']),activation_required_fields:z.array(z.string()).optional(),question_review:z.object({require_second_reviewer_for_content_change:z.boolean().default(true),require_review_for_curriculum_remap:z.boolean().default(true),allow_author_self_approve:z.boolean().default(false),wrong_key_auto_quarantine:z.boolean().default(true),allow_admin_self_approve:z.boolean().default(true)}).optional(),required_fields:z.array(z.enum(['subject_id','grade','topic_id','cognitive_level','outcome','yccd','branch_code'])).min(4),allowed_types:z.array(z.enum(['multiple_choice','true_false','short_answer','matching','essay'])).min(1),level_labels:z.array(z.string().min(1)).length(4),display_code_template:z.string().min(1).max(300),hierarchy:z.array(z.string()).optional()}).parse(req.body);
 for(const field of ['subject_id','grade','topic_id','cognitive_level'])if(!d.required_fields.includes(field))fail('Không được bỏ trường bắt buộc '+field);
 await pool.query('INSERT INTO subject_profiles(subject_id,config) VALUES($1,$2) ON CONFLICT(subject_id) DO UPDATE SET config=EXCLUDED.config',[req.params.id,JSON.stringify(d)]);await log(pool,req.user,'SUBJECT_PROFILE',req.params.id,d);res.json({ok:true});
}));
r.get('/class-permissions',admin,wrap(async(req,res)=>res.json((await pool.query('SELECT t.*,u.full_name,c.name AS class_name,s.name AS subject_name FROM teacher_class_assignments t JOIN users u ON u.id=t.teacher_id JOIN classes c ON c.id=t.class_id JOIN subjects s ON s.id=t.subject_id')).rows)));
r.delete('/class-permissions',admin,wrap(async(req,res)=>res.json(await setLegacyTeaching(req.user,req.body,true))));
export default r;
