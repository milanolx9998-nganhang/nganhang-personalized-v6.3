import path from 'node:path';
import {storage} from '../storage/index.js';
import {pool} from '../../db/pool.js';
import {can,canBank} from '../accessResolver.js';
import {studentQuestion} from './studentDto.js';
import {canRevealAnswer,releaseContext} from './answerRelease.js';
const mediaPattern=/\/uploads\/(?:images|media)\/[a-zA-Z0-9_.-]+\.(?:png|jpe?g|gif|webp)(?![a-zA-Z0-9_.-])/gi;
export function mediaRefs(value){return [...new Set(JSON.stringify(value).match(mediaPattern)||[])];}
export function mediaId(url){return Buffer.from(url).toString('base64url');}
export function mediaUrl(id){const url=Buffer.from(String(id),'base64url').toString();return mediaRefs(url)[0]===url&&mediaId(url)===id?url:null;}
export function scopedQuestionMedia(question,attemptId,itemId){
 const replace=value=>typeof value==='string'?value.replace(mediaPattern,url=>`/api/practice/attempts/${attemptId}/items/${itemId}/media/${mediaId(url)}`):Array.isArray(value)?value.map(replace):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)])):value;
 return replace(question);
}
async function send(res,url){
 try{const bytes=await storage.getAuthorizedDelivery(url.slice('/uploads/'.length),async()=>true);res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.type(path.extname(url));res.send(bytes);}catch(e){if(e.code==='ENOENT')return res.sendStatus(404);throw e;}
}
export async function attemptMedia(req,res){
 const {attemptId,itemId,mediaId:id}=req.params,url=mediaUrl(id);
 if(!url||! /^[a-f0-9-]{36}$/i.test(attemptId)||! /^[a-f0-9-]{36}$/i.test(itemId))return res.sendStatus(404);
 const row=(await pool.query('SELECT a.*,i.id AS item_id,i.is_final,v.content FROM attempts a JOIN attempt_items i ON i.attempt_id=a.id JOIN question_versions v ON v.id=i.question_version_id WHERE a.id=$1 AND i.id=$2',[attemptId,itemId])).rows[0];
 if(!row)return res.sendStatus(404);
 if(req.user.role==='student'?row.student_id!==req.user.id:!await can(req.user,'learning.read_attempt',{studentId:row.student_id,subjectId:Number(row.config.subject_id)}))return res.sendStatus(403);
 const reveal=canRevealAnswer(row,{is_final:row.is_final},await releaseContext(pool,row));
 if(!mediaRefs(studentQuestion(row,reveal)).includes(url))return res.sendStatus(404);
 return send(res,url);
}
export async function staffMedia(req,res){
 if(req.user.role==='student')return res.sendStatus(403);
 const url=req.originalUrl.split('?')[0];if(!mediaRefs(url).includes(url))return res.sendStatus(404);
 if(await canReadStaffMedia(req.user,url))return send(res,url);
 return res.sendStatus(403);
}
export async function canReadStaffMedia(user,url,client=pool){
 if(user.role==='student')return false;if(user.role==='admin')return true;
 const rows=(await client.query('SELECT v.content,q.subject_id,q.grade,q.bank_id FROM question_versions v JOIN questions q ON q.id=v.question_id WHERE v.content::text LIKE $1',['%'+url+'%'])).rows;
 for(const q of rows){if(!await can(user,'content.read',{subjectId:q.subject_id,grade:q.grade,bankId:q.bank_id},client)||!(await canBank(user,'read',q.bank_id,client)).allowed)continue;
  const reveal=await can(user,'content.view_answer',{subjectId:q.subject_id,grade:q.grade,bankId:q.bank_id},client);if(mediaRefs(studentQuestion(q,reveal)).includes(url))return true;
 }
 if(!rows.length){const key=path.basename(url),owned=(await client.query('SELECT 1 FROM media_assets WHERE storage_key=$1 AND created_by=$2',[key,user.id])).rowCount;if(owned&&user.capabilities?.['content.write'])return true;}
 return false;
}
export async function validateAuthoredMedia(user,question,client=pool){
 const text=JSON.stringify(question);
 if(/!\[[^\]]*\]\(\s*(?:https?:|data:|\/\/)/i.test(text)||/"image_url"\s*:\s*"(?:https?:|data:|\/\/)/i.test(text))throw Object.assign(Error('Ảnh phải được tải vào kho nội bộ; không dùng URL ảnh bên ngoài'),{status:400});
 for(const url of mediaRefs(question))if(!await canReadStaffMedia(user,url,client))throw Object.assign(Error('Không có quyền sử dụng ảnh này'),{status:403});
}
