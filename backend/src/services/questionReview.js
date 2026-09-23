import {can} from './accessResolver.js';
import {pool} from '../db/pool.js';
import {contentCapability,positions} from './capabilities.js';
import {bankAccess} from './practice/authorization.js';
import {fail,log} from './practice/config.js';
import {validateQuestion,normalizeQuestion} from './practice/grading.js';
import {validateCurriculum} from './curriculum.js';
const metadata=new Set(['subject_id','grade','topic_id','branch_id','branch_code','outcome_id','yccd_id','outcome','yccd','outcome_code','yccd_code','cognitive_level','type','question_type','q_type','family_id','taxonomy_node_id','subitem_levels']);
const operational=new Set(['id','question_id','question_version_id','current_version_id','active_version_id','bank_id','creator_id','created_at','updated_at','question_code','display_code','tags','internal_notes','quality_notes','source_locator','source_document','metadata_suggestions','parser_warnings','legacy_snapshot','curriculum_snapshot','metadata_status','lifecycle','status','usage_count','last_used_at','record_action','change_reason','alt_text','cognitive_classification']);
const comparable=x=>typeof x==='string'?x.trim().replace(/\s+/g,' '):Array.isArray(x)?x.map(comparable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,comparable(x[k])])):x??null;
export function classifyQuestionChange(before,after){
 const fields=[...new Set([...Object.keys(before||{}),...Object.keys(after||{})])].filter(k=>JSON.stringify(comparable(before?.[k]))!==JSON.stringify(comparable(after?.[k])));
 const contentFields=fields.filter(k=>!metadata.has(k)&&!operational.has(k)),metadataFields=fields.filter(k=>metadata.has(k));
 const classification=contentFields.length?'ASSESSMENT_CONTENT':metadataFields.length?'CURRICULUM_METADATA':'NON_SEMANTIC';
 return {classification,changed_fields:fields,content_fields:contentFields,metadata_fields:metadataFields,requires_content_version:classification==='ASSESSMENT_CONTENT',requires_review:classification!=='NON_SEMANTIC',reasons:classification==='ASSESSMENT_CONTENT'?['Thay đổi nội dung/đáp án/chấm điểm cần duyệt lại']:classification==='CURRICULUM_METADATA'?['Thay đổi phạm vi hoặc phân loại câu hỏi']:['Chỉ thay đổi vận hành/định dạng không đổi nghĩa']};
}
export async function reviewPolicy(client,subject){
 const p=(await client.query('SELECT config FROM subject_profiles WHERE subject_id=$1',[subject])).rows[0]?.config||{};
 return {require_second_reviewer_for_content_change:true,require_review_for_curriculum_remap:true,allow_author_self_approve:false,allow_admin_self_approve:true,wrong_key_auto_quarantine:true,...p.question_review};
}
export async function canReviewQuestion(client,user,q){return can(user,'content.review',{subjectId:q.subject_id,grade:q.grade,bankId:q.bank_id},client);}
export async function reviewQuestionAccess(client,user,id,action='read'){
 const q=(await client.query('SELECT * FROM questions WHERE id=$1'+(action==='read'?'':' FOR UPDATE'),[id])).rows[0];
 if(!q)fail('Không tìm thấy câu hỏi',404);
 if(user.role==='student'||q.subject_id&&!await contentCapability(user,action,q.subject_id,client,{grade:q.grade,bankId:q.bank_id}))fail('Câu ngoài phạm vi được phân quyền',403);
 if(action==='review'&&!await canReviewQuestion(client,user,q))fail('Khối ngoài phạm vi duyệt được giao',403);
 await bankAccess(user,q.bank_id,action==='write'?'write':'read',client);if(!q.subject_id&&q.creator_id!==user.id&&user.role!=='admin')fail('Bản nháp chưa môn chỉ người tạo được xử lý',403);return q;
}
export const reasons=['TEACHER_REPORT','STUDENT_REPORT','SUSPECTED_WRONG_KEY','AMBIGUOUS','HIGH_SKIP_RATE','ABNORMAL_CORRECT_RATE','CURRICULUM_MISMATCH','OUTCOME_RETIRED','YCCD_RETIRED','MEDIA_PROBLEM','DUPLICATE_SUSPECT','MANUAL_REVIEW'];
export async function openReviewCase(client,user,q,raw){
 const reason=raw.reason_code||'MANUAL_REVIEW';if(!reasons.includes(reason))fail('Lý do phản ánh không hợp lệ');
 const severity=raw.severity|| (reason==='SUSPECTED_WRONG_KEY'?'P0':['AMBIGUOUS','MEDIA_PROBLEM'].includes(reason)?'P1':'P2');if(!['P0','P1','P2'].includes(severity))fail('Mức ưu tiên không hợp lệ');
 const note=String(raw.note||'').trim();if(!note)fail('Cần mô tả hoặc bằng chứng');
 const evidence={at:new Date().toISOString(),actor:user.id,note,version_id:raw.question_version_id||q.current_version_id,source_ref:raw.source_ref||null};
 const row=(await client.query("INSERT INTO question_review_cases(question_id,question_version_id,source,source_ref,reason_code,severity,opened_by,evidence_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(question_id,reason_code) WHERE status IN('OPEN','IN_REVIEW') DO UPDATE SET evidence_snapshot=question_review_cases.evidence_snapshot||EXCLUDED.evidence_snapshot,severity=LEAST(question_review_cases.severity,EXCLUDED.severity) RETURNING *",[q.id,raw.question_version_id||q.current_version_id,user.role==='student'?'STUDENT':'TEACHER',raw.source_ref||null,reason,severity,user.id,JSON.stringify([evidence])])).rows[0];
 if(reason==='SUSPECTED_WRONG_KEY'&&(await reviewPolicy(client,q.subject_id)).wrong_key_auto_quarantine)await client.query('UPDATE questions SET quarantined=true WHERE id=$1',[q.id]);
 if(['CURRICULUM_MISMATCH','OUTCOME_RETIRED','YCCD_RETIRED'].includes(reason))await client.query("UPDATE questions SET metadata_status='NEEDS_REVIEW' WHERE id=$1",[q.id]);
 await log(client,user,'QUESTION_REVIEW_OPEN',q.id,{case_id:row.id,reason,severity});return row;
}
// Lý do trả sửa có cấu trúc (§56–57): mã cố định để thống kê và lọc; ghi chú tự do là tùy chọn.
export const RETURN_REASON_CODES=['LEVEL_MISMATCH','CURRICULUM_MISMATCH','INSUFFICIENT_DATA','WEAK_DISTRACTORS','ANSWER_MISMATCH','MEDIA_PROBLEM','DUPLICATE_SUSPECT'];
export function checkReasonCodes(codes){
 if(codes==null)return [];
 if(!Array.isArray(codes))fail('Mã lý do phải là danh sách');
 const unique=[...new Set(codes.map(String))];
 const bad=unique.filter(c=>!RETURN_REASON_CODES.includes(c));if(bad.length)fail('Mã lý do không hợp lệ: '+bad.join(', '));
 return unique;
}
export async function versionWorkflow(client,user,id,action,{reason='',reason_codes=null,version_id=null,targetBankId=null}={}){
 const codes=checkReasonCodes(reason_codes);reason=String(reason||'');
 const q=await reviewQuestionAccess(client,user,id,action==='approve'?'approve':['reject','request_changes'].includes(action)?'review':'write');
 const v=(await client.query('SELECT * FROM question_versions WHERE id=$1 AND question_id=$2 FOR UPDATE',[version_id||q.current_version_id,id])).rows[0];if(!v)fail('Không tìm thấy phiên bản',404);
 const policy=await reviewPolicy(client,q.subject_id);
 if(v.id!==q.current_version_id)fail('Chỉ xử lý bản đang làm việc; lịch sử giữ nguyên',409);
 if(['reject','request_changes'].includes(action)&&!reason.trim()&&!codes.length)fail('Cần lý do trả sửa / từ chối');
 if(action==='submit'){
  if(v.review_status!=='DRAFT')fail('Chỉ nháp được gửi duyệt',409);
  await client.query("UPDATE question_versions SET review_status='PENDING_REVIEW' WHERE id=$1",[v.id]);
  await client.query("UPDATE questions SET lifecycle='pending_review' WHERE id=$1",[id]);
 }else if(action==='approve'){
  if(v.review_status!=='PENDING_REVIEW')fail('Phiên bản chưa chờ duyệt',409);
  const self=(v.created_by===user.id||v.updated_by===user.id),exception=self&&user.role==='admin'&&policy.allow_admin_self_approve;
  if(self&&policy.require_second_reviewer_for_content_change&&!policy.allow_author_self_approve&&!exception)fail('Cần người duyệt khác tác giả',403);
  if(exception)await log(client,user,'QUESTION_SELF_APPROVAL_EXCEPTION',id,{version:v.id,policy:'allow_admin_self_approve',reason:reason||'Ngoại lệ quản trị theo cấu hình'});
  await validateCurriculum(client,q,{required:true});
  const profile=(await client.query('SELECT config FROM subject_profiles WHERE subject_id=$1',[q.subject_id])).rows[0]?.config||{},validation=validateQuestion({...v,content:{...v.content,...q.normalized_content}},profile);if(validation.errors.length)fail(validation.errors.join('; '));
  if(targetBankId)await bankAccess(user,targetBankId,'review',client);
  await client.query("UPDATE question_versions SET review_status='SUPERSEDED' WHERE id=$1 AND review_status='APPROVED'",[q.active_version_id]);
  await client.query("UPDATE question_versions SET review_status='APPROVED',reviewed_by=$1,reviewed_at=now() WHERE id=$2",[user.id,v.id]);
  await client.query("UPDATE questions SET active_version_id=$1,active_metadata=v643_curriculum_snapshot(id),lifecycle='approved',quarantined=EXISTS(SELECT 1 FROM question_review_cases c WHERE c.question_id=questions.id AND c.status IN('OPEN','IN_REVIEW') AND c.severity='P0'),bank_id=COALESCE($3,bank_id) WHERE id=$2",[v.id,id,targetBankId]);
 }else if(['reject','request_changes'].includes(action)){
  if(v.review_status!=='PENDING_REVIEW')fail('Chỉ bản đang chờ duyệt được trả sửa / từ chối',409);
  await client.query('UPDATE question_versions SET review_status=$1,reviewed_by=$2,reviewed_at=now() WHERE id=$3',[action==='reject'?'REJECTED':'DRAFT',user.id,v.id]);
  await client.query("UPDATE questions SET lifecycle=CASE WHEN active_version_id IS NULL THEN 'draft' ELSE 'active' END WHERE id=$1",[id]);
 }else fail('Thao tác duyệt không hợp lệ');
 await log(client,user,'QUESTION_VERSION_'+action.toUpperCase(),id,{version:v.id,reason,...(codes.length?{reason_codes:codes}:{})});return {ok:true};
}
export async function resolveReviewCase(client,user,id,raw){
 const c=(await client.query('SELECT * FROM question_review_cases WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!c)fail('Không tìm thấy hồ sơ',404);
 const q=await reviewQuestionAccess(client,user,c.question_id,'review');
 if(!['OPEN','IN_REVIEW'].includes(c.status))fail('Hồ sơ đã đóng',409);
 if(raw.action==='assign'){
  const assignee=(await client.query('SELECT * FROM users WHERE id=$1 AND is_active',[raw.assigned_to])).rows[0];if(!assignee||!await canReviewQuestion(client,assignee,q))fail('Người được giao cần quyền duyệt đúng môn');
  await client.query("UPDATE question_review_cases SET assigned_to=$1,status='IN_REVIEW' WHERE id=$2",[assignee.id,id]);return {ok:true};
 }
 const resolution=raw.resolution_type,note=String(raw.note||'').trim();
 if(!['NO_ISSUE','METADATA_CORRECTED','NEW_VERSION_APPROVED','QUESTION_RETIRED','DUPLICATE_LINKED','DEFERRED'].includes(resolution)||!note)fail('Chọn kết luận và ghi lý do');
 if(resolution==='METADATA_CORRECTED'){await validateCurriculum(client,q,{required:true});await client.query('UPDATE questions SET active_metadata=v643_curriculum_snapshot(id) WHERE id=$1',[q.id]);}
 if(resolution==='NEW_VERSION_APPROVED'&&(!q.active_version_id||q.active_version_id===c.question_version_id))fail('Chưa có phiên bản mới được duyệt',409);
 if(resolution==='QUESTION_RETIRED')await client.query("UPDATE questions SET lifecycle='archived',quarantined=true WHERE id=$1",[q.id]);
 if(resolution==='DUPLICATE_LINKED')fail('Chưa triển khai liên kết câu trùng; dùng kết luận khác hoặc tạm hoãn');
 if(resolution==='DEFERRED'){await client.query("UPDATE question_review_cases SET status='IN_REVIEW',resolution_note=$1 WHERE id=$2",[note,id]);}
 else {
  await client.query("UPDATE question_review_cases SET status=$1,resolved_by=$2,resolved_at=now(),resolution_type=$3,resolution_note=$4 WHERE id=$5",[resolution==='NO_ISSUE'?'DISMISSED':'RESOLVED',user.id,resolution,note,id]);
  if(resolution!=='QUESTION_RETIRED'&&!(await client.query("SELECT 1 FROM question_review_cases WHERE question_id=$1 AND status IN('OPEN','IN_REVIEW') AND severity='P0'",[q.id])).rowCount)await client.query('UPDATE questions SET quarantined=false WHERE id=$1',[q.id]);
 }
 await log(client,user,'QUESTION_REVIEW_RESOLVE',q.id,{case_id:id,resolution,note});return {ok:true};
}
