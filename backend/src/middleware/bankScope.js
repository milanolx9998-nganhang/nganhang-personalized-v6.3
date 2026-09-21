import {can} from '../services/accessResolver.js';
import {pool,tx} from '../db/pool.js';
import {bankAccess,subjectAccess,staff} from '../services/practice/authorization.js';
import {transition} from '../services/practice/questions.js';
import {fail} from '../services/practice/config.js';
export function bankFilter(user,alias,params){
 if(user.role==='admin')return 'TRUE';
 params.push(user.allowed_bank_ids||[]);return `${alias}.bank_id=ANY($${params.length}::int[])`;
}
export async function legacyQuestionGuard(req,res,next){
 try{
  const id=req.path.match(/^\/(\d+)(?:\/|$)/)?.[1],ids=id?[Number(id)]:Array.isArray(req.body?.ids)?req.body.ids:[];
  const mutation=!['GET','HEAD'].includes(req.method);if(mutation)staff(req.user);
  if((req.path==='/bulk-review'||req.path==='/bulk-delete')&&!ids.length)fail('Chọn ít nhất một câu hỏi');
  const review=req.path.endsWith('/review')||req.path==='/bulk-review';
  if(mutation&&!review&&!req.user.capabilities?.['content.write'])fail('Không có quyền biên soạn',403);
  if(mutation&&!review&&req.body?.subject_id&&!await can(req.user,'content.write',{subjectId:Number(req.body.subject_id),grade:Number(req.body.grade)||undefined}))fail('Môn/khối ngoài quyền biên soạn',403);
  if(ids.length){if(ids.length>500)fail('Tối đa 500 câu mỗi thao tác');const rows=(await pool.query('SELECT id,bank_id,subject_id,grade,lifecycle FROM questions WHERE id=ANY($1::int[])',[ids])).rows;if(rows.length!==new Set(ids.map(Number)).size)fail('Không tìm thấy câu hỏi',404);
   for(const q of rows){if(req.path.endsWith('/history')&&!await can(req.user,'content.view_answer',{subjectId:q.subject_id,grade:q.grade,bankId:q.bank_id}))fail('Không có quyền xem đáp án trong lịch sử',403);if(req.method==='PUT'&&!await can(req.user,'content.create_version',{subjectId:q.subject_id,grade:q.grade,bankId:q.bank_id}))fail('Không có quyền tạo phiên bản',403);if(!await can(req.user,mutation?'content.write':'content.read',{subjectId:q.subject_id,grade:q.grade,bankId:q.bank_id})&&!review)fail('Câu hỏi ngoài phạm vi',403);await bankAccess(req.user,q.bank_id,review?'review':mutation?'write':'read');}
   if(req.method==='DELETE'||req.path==='/bulk-delete'){await tx(async c=>{for(const q of rows)if(q.lifecycle!=='archived')await transition(c,req.user,q.id,'archived');});return res.json({ok:true,deleted:0,archived:rows.length,message:'Đã lưu trữ để giữ lịch sử luyện tập'});}
   if(review){const target={'Đã rà soát':'pending_review','Đã duyệt':'approved','Đã sử dụng':'active','Tạm ẩn':'archived','Mới tạo':'draft'}[req.body.status];if(!target)fail('Trạng thái không hợp lệ');await tx(async c=>{for(const q of rows)if(q.lifecycle!==target)await transition(c,req.user,q.id,target);});return res.json({ok:true,updated:rows.length});}
  }
  next();
 }catch(e){next(e);}
}
