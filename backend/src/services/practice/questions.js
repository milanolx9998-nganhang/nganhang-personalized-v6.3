import {visibleQuestion} from '../access/visibility.js';
import {validateAuthoredMedia} from './privateMedia.js';
import {getEffectiveAccess,bankDecision,can} from '../accessResolver.js';
import {classifyQuestionChange,reviewPolicy,openReviewCase,versionWorkflow} from '../questionReview.js';
import {resolveContentScope,compileQuestionScopeSQL} from '../contentScopeV2.js';
import {validateDraft} from '../smartMetadata.js';
import {validateCurriculum} from '../curriculum.js';
import {codeForMetadata} from '../curriculumResolver.js';
import {parseQuestionCode} from '../questionCode.js';
import {contentCapability} from '../capabilities.js';
import {getSubjectFilterSQL} from '../../middleware/auth.js';
import crypto from 'node:crypto';
import {pool} from '../../db/pool.js';
import {normalizeQuestion,validateQuestion,legacyTypes} from './grading.js';
import {bankAccess,staff,subjectAccess} from './authorization.js';
import {fail,log} from './config.js';
export async function personalBank(client,user){await client.query("INSERT INTO banks(name,kind,owner_id) VALUES($1,'personal',$2) ON CONFLICT DO NOTHING",['Kho cá nhân · '+user.full_name,user.id]);return (await client.query("SELECT id FROM banks WHERE kind='personal' AND owner_id=$1",[user.id])).rows[0].id;}
export async function persistQuestion(client,user,raw,{id=null,bankId=null,source=null}={}){
 staff(user);const q=normalizeQuestion(raw);if(q.subject_id&&!await contentCapability(user,'write',q.subject_id,client,{grade:q.grade,bankId:bankId||raw.bank_id}))fail('Không có quyền sửa nội dung môn này',403);
 await validateCurriculum(client,q);
 await validateAuthoredMedia(user,q,client);
 const profile=(await client.query('SELECT config FROM subject_profiles WHERE subject_id=$1',[q.subject_id])).rows[0]?.config||{};
 const validation=validateDraft(q,profile);if(validation.errors.length)fail(validation.errors.join('; '));
 if(q.taxonomy_node_id){const node=(await client.query('SELECT n.id FROM taxonomy_nodes n JOIN taxonomy_versions v ON v.id=n.version_id WHERE n.id=$1 AND v.subject_id=$2',[q.taxonomy_node_id,q.subject_id])).rows[0];if(!node)fail('Nút chương trình không thuộc môn đã chọn');}
 const topic=(await client.query('SELECT id FROM topics WHERE id=$1 AND subject_id=$2 AND grade=$3',[q.topic_id,q.subject_id,q.grade])).rows[0];if(q.topic_id&&!topic)fail('Chuyên đề không thuộc môn/khối đã chọn');
 let previous=null,impact=null;await client.query("SELECT set_config('app.actor_id',$1,true),set_config('app.change_kind','',true)",[String(user.id)]);
 if(id){if(!await can(user,'content.create_version',{subjectId:q.subject_id,grade:q.grade},client))fail('Không có quyền tạo phiên bản',403);const old=(await client.query('SELECT * FROM questions WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!old)fail('Không tìm thấy câu hỏi',404);if(old.subject_id&&!await contentCapability(user,'write',old.subject_id,client,{grade:old.grade,bankId:old.bank_id}))fail('Không có quyền sửa môn gốc của câu hỏi',403);await bankAccess(user,old.bank_id,'write',client);if(old.creator_id!==user.id&&user.role!=='admin')await bankAccess(user,old.bank_id,'review',client);if(raw.question_version_id&&raw.question_version_id!==old.current_version_id)fail('Câu đã có phiên bản mới; tải lại trước khi cập nhật',409);bankId=old.bank_id;previous=old;
 const version=(await client.query('SELECT * FROM question_versions WHERE id=$1',[old.current_version_id])).rows[0];
 if(version?.review_status==='PENDING_REVIEW')fail('Bản đang chờ duyệt; cần trả về bản nháp trước khi sửa',409);
 const before=normalizeQuestion(old.normalized_content||version.content);
 impact=classifyQuestionChange(before,q);
 await client.query("SELECT set_config('app.change_kind',$1,true)",[impact.classification]);
 if(impact.classification==='CURRICULUM_METADATA')await client.query('INSERT INTO question_metadata_revisions(question_id,before_metadata,after_metadata,reason,created_by) VALUES($1,$2,$3,$4,$5)',[id,JSON.stringify(Object.fromEntries(impact.metadata_fields.map(k=>[k,before[k]??null]))),JSON.stringify(Object.fromEntries(impact.metadata_fields.map(k=>[k,q[k]??null]))),raw.change_reason||'Cập nhật phân loại có nhật ký',user.id]);
 }
 else {bankId=bankId||await personalBank(client,user);await bankAccess(user,bankId,'write',client);}
 const allocatedId=id||Number((await client.query("SELECT nextval(pg_get_serial_sequence('questions','id')) AS id")).rows[0].id);
 // §67–69 — mã câu và phân loại phải nói cùng một điều. Câu tạo tay có YCCĐ + số thì sinh mã chuẩn;
 // câu đã có mã hiện hành mà phân loại lệch thì dừng lại (409) và đề xuất mã mới, trừ khi người dùng
 // chọn rõ "tạo lại mã theo phân loại".
 {const parsed=parseQuestionCode(q.display_code||'');const regenerate=!!q.regenerate_code;delete q.regenerate_code;
  if(parsed.ok&&q.yccd_id){
   q.content_number=parsed.value.content_number;
   const expected=await codeForMetadata(client,{yccd_id:q.yccd_id,cognitive_level:q.cognitive_level,type:q.type,content_number:parsed.value.content_number});
   if(expected&&expected!==parsed.value.canonical_code){if(!regenerate)fail('Mã câu không khớp phân loại (YCCĐ / mức / dạng). Tạo lại mã theo phân loại, hoặc sửa phân loại cho khớp mã.',409,{code:'CODE_METADATA_CONFLICT',current_code:parsed.value.canonical_code,suggested_code:expected});q.display_code=expected;}
   else if(expected)q.display_code=expected;
  }else if(!q.display_code&&q.yccd_id&&q.content_number){const generated=await codeForMetadata(client,{yccd_id:q.yccd_id,cognitive_level:q.cognitive_level,type:q.type,content_number:Number(q.content_number)});if(generated)q.display_code=generated;}}
 if(!q.display_code&&q.subject_id&&q.cognitive_level){const subject=(await client.query('SELECT code FROM subjects WHERE id=$1',[q.subject_id])).rows[0];const tokens={subject:subject.code,branch:q.branch_code,outcome:q.outcome,yccd:q.yccd,level:'M'+q.cognitive_level,sequence:allocatedId,type:{multiple_choice:'TN',true_false:'ĐS',short_answer:'TLN',matching:'GN',essay:'TL'}[q.type]};q.display_code=(profile.display_code_template||'{subject}.{level}.{sequence}').replace(/\{(\w+)\}/g,(_m,key)=>{if(tokens[key]==null||tokens[key]==='')return 'CHUA-GAN';return String(tokens[key]);});}
 const options=q.type==='true_false'?q.statements:q.options;
 const answer=q.type==='multiple_choice'?q.answer.correct:q.type==='true_false'?Object.entries(q.answer.values).map(([k,v])=>`${k}-${v?'Đ':'S'}`).join('; '):q.type==='matching'?Object.entries(q.answer.pairs).map(([k,v])=>`${k}-${v}`).join('; '):q.type==='short_answer'?String(q.answer.numeric??q.answer.aliases?.[0]??''):q.answer?.reference||'';
 // V6.6.5: content_number là số đơn vị kiến thức trong mã câu, không phải số thứ tự toàn tệp.
 const lessonStatus=['AUTO_MAPPED','MANUAL','UNMAPPED','AMBIGUOUS'].includes(q.lesson_status)?q.lesson_status:q.topic_id?'MANUAL':null;
 const numberingMode=['CONTENT_UNIT_5_FORMS','INDEPENDENT_10','CUSTOM'].includes(q.numbering_mode)?q.numbering_mode:null;
 const values=[q.subject_id,q.topic_id,q.grade,q.cognitive_level?'M'+q.cognitive_level:null,legacyTypes[q.type]||null,q.stem,...[0,1,2,3].map(i=>options?.[i]?.text||null),answer,q.explanation,JSON.stringify(q),bankId,user.id,q.branch_id||null,q.outcome_id||null,q.yccd_id||null,numberingMode,Number.isInteger(Number(q.content_number))&&Number(q.content_number)>0?Number(q.content_number):null,lessonStatus];
 let result;
 if(id){values.push(id);result=(await client.query(`UPDATE questions SET subject_id=$1,topic_id=$2,grade=$3,cognitive_level=$4,q_type=$5,stem_text=$6,option_a=$7,option_b=$8,option_c=$9,option_d=$10,answer_key=$11,explanation=$12,normalized_content=$13,bank_id=$14,creator_id=COALESCE(creator_id,$15),lifecycle='draft',status='Mới tạo'  ,branch_id=$16,outcome_id=$17,yccd_id=$18,numbering_mode=COALESCE($19,numbering_mode),content_number=COALESCE($20,content_number),lesson_status=COALESCE($21,lesson_status) WHERE id=$22 RETURNING *`,values)).rows[0];}
 else {values.push('Q-'+crypto.randomUUID(),allocatedId);result=(await client.query(`INSERT INTO questions(subject_id,topic_id,grade,cognitive_level,q_type,stem_text,option_a,option_b,option_c,option_d,answer_key,explanation,normalized_content,bank_id,creator_id,branch_id,outcome_id,yccd_id,numbering_mode,content_number,lesson_status,question_code,id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,values)).rows[0];}
 result=(await client.query('SELECT * FROM questions WHERE id=$1',[result.id])).rows[0];
 if(previous?.active_version_id){await client.query('UPDATE questions SET lifecycle=$1 WHERE id=$2',[previous.lifecycle==='archived'?'archived':previous.lifecycle==='active'?'active':'approved',id]);}
 if(impact?.classification==='CURRICULUM_METADATA'&&(await reviewPolicy(client,q.subject_id)).require_review_for_curriculum_remap)await openReviewCase(client,user,result,{reason_code:'CURRICULUM_MISMATCH',note:raw.change_reason||'Thay đổi metadata cần rà soát',question_version_id:result.current_version_id});
 await client.query("SELECT set_config('app.change_kind','',true)");
 result=(await client.query('SELECT * FROM questions WHERE id=$1',[result.id])).rows[0];
 result.change_impact=impact;
 if(source)await client.query('INSERT INTO question_sources(question_version_id,source_type,source_path,source_locator,checksum) VALUES($1,$2,$3,$4,$5)',[result.current_version_id,source.type,source.path,source.locator,source.checksum]);
 for(const media of q.media||[])await client.query('INSERT INTO question_media_links(question_version_id,media_id,location,order_index) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[result.current_version_id,media.id,media.location||'stem',media.order||0]);
 await log(client,user,id?'QUESTION_VERSION':'QUESTION_CREATE',result.id,{version:result.current_version_id});return result;
}
// Every question listing (list, review queue, selection ids, bulk selection) resolves its scope
// here so one change to access rules reaches all of them. Consumers MUST use QUESTION_FROM, since
// the filters below reference both `q` and `v`.
export const QUESTION_FROM='FROM questions q JOIN banks b ON b.id=q.bank_id LEFT JOIN question_versions v ON v.id=q.current_version_id';
// Kiểm tra máy cho từng câu (§34, §61): chỉ trả đúng/sai, không bao giờ trả nội dung đáp án.
// Dùng chung cho dải kiểm tra trong hàng đợi và cho bộ lọc ngoại lệ, để "Sạch" ở hai nơi là một.
const DC="COALESCE(q.normalized_content->>'display_code','')";
const CODED=`(${DC} ~ '^Câu [LHS]\. [0-9]+\. [0-9]+\. (NB|TH|VD|VDC)\. [0-9]+\. (TN|ĐS|TLN|GN|TL)$')`;
const OPEN_CASE=reason=>`EXISTS(SELECT 1 FROM question_review_cases rc WHERE rc.question_id=q.id AND rc.status IN('OPEN','IN_REVIEW') AND rc.reason_code='${reason}')`;
export const CHECK_SQL={
 coded:CODED,
 code:`(NOT ${CODED} OR (split_part(${DC},'. ',6)=CASE q.q_type::text WHEN 'mcq4' THEN 'TN' WHEN 'true_false' THEN 'ĐS' WHEN 'short' THEN 'TLN' WHEN 'matching' THEN 'GN' WHEN 'essay' THEN 'TL' END
  AND EXISTS(SELECT 1 FROM curriculum_yccds cy JOIN curriculum_outcomes co ON co.id=cy.outcome_id WHERE cy.id=q.yccd_id
   AND COALESCE(co.source_ordinal::text,split_part(${DC},'. ',2))=split_part(${DC},'. ',2) AND COALESCE(cy.source_ordinal::text,split_part(${DC},'. ',3))=split_part(${DC},'. ',3))))`,
 curriculum:"(q.outcome_id IS NOT NULL AND q.yccd_id IS NOT NULL AND COALESCE(q.metadata_status::text,'')<>'NEEDS_REVIEW')",
 lesson:"(q.topic_id IS NOT NULL AND COALESCE(q.lesson_status,'') NOT IN('UNMAPPED','AMBIGUOUS'))",
 level:`(q.cognitive_level IS NOT NULL AND (NOT ${CODED} OR split_part(${DC},'. ',4)=CASE q.cognitive_level::text WHEN 'M1' THEN 'NB' WHEN 'M2' THEN 'TH' WHEN 'M3' THEN 'VD' WHEN 'M4' THEN 'VDC' END))`,
 form:'(q.q_type IS NOT NULL)',
 answer:"(q.q_type::text='essay' OR length(trim(COALESCE(q.answer_key,'')))>0)",
 explanation:"(length(trim(COALESCE(q.explanation,'')))>0)",
 media:`(NOT ${OPEN_CASE('MEDIA_PROBLEM')})`,
 duplicate:`(NOT ${OPEN_CASE('DUPLICATE_SUSPECT')})`,
};
const CLEAN_SQL=`(${['code','curriculum','lesson','level','form','answer','explanation','media','duplicate'].map(k=>CHECK_SQL[k]).join(' AND ')} AND NOT COALESCE(q.quarantined,false)
 AND NOT EXISTS(SELECT 1 FROM question_review_cases rc WHERE rc.question_id=q.id AND rc.status IN('OPEN','IN_REVIEW')))`;
// Bộ lọc ngoại lệ của màn duyệt (§60): Sạch / Cần xem mức / Chưa gắn Bài / Nghi trùng / Lỗi metadata / Media.
export const EXCEPTION_SQL={
 clean:CLEAN_SQL,
 level:`NOT ${CHECK_SQL.level}`,
 lesson:`NOT ${CHECK_SQL.lesson}`,
 duplicate:`NOT ${CHECK_SQL.duplicate}`,
 metadata:`(NOT ${CHECK_SQL.curriculum} OR NOT ${CHECK_SQL.code} OR NOT ${CHECK_SQL.form} OR NOT ${CHECK_SQL.answer})`,
 media:`NOT ${CHECK_SQL.media}`,
};
export async function questionScope(user,query,capability='content.read'){
 const a=await getEffectiveAccess(user),params=[a.org.banks.filter(b=>bankDecision(a,'read',b).allowed).map(b=>b.id)],where=['q.bank_id=ANY($1::int[])'];
 if(user.role==='admin'){where.length=0;params.length=0;}
 const scope=await getSubjectFilterSQL(user,'q',params.length+1,capability);if(scope.clause){params.push(...scope.params);params.push(user.id);where.push(`(${scope.clause} OR (q.subject_id IS NULL AND q.creator_id=$${params.length}))`);}
 if(capability!=='content.read'){const read=await getSubjectFilterSQL(user,'q',params.length+1,'content.read');if(read.clause){where.push(read.clause);params.push(...read.params);}}
 for(const [field,column] of Object.entries({bank_id:'q.bank_id',subject_id:'q.subject_id',topic_id:'q.topic_id',yccd_id:'q.yccd_id',outcome_id:'q.outcome_id',grade:'q.grade',cognitive_level:'q.cognitive_level',q_type:'q.q_type',lifecycle:'q.lifecycle'}))if(query[field]){params.push(query[field]);where.push(`${column}=$${params.length}`);}
 if(query.content_scope_v2){const compiled=compileQuestionScopeSQL(await resolveContentScope(query.content_scope_v2),'q',params.length+1);where.push(compiled.sql);params.push(...compiled.params);}
 if(query.branch_id){params.push(query.branch_id);where.push('q.branch_id=$'+params.length);}
 if(query.chapter){params.push(query.chapter);where.push('EXISTS(SELECT 1 FROM topics t WHERE t.id=q.topic_id AND t.chapter=$'+params.length+')');}
 if(query.metadata_status){params.push(query.metadata_status);where.push('q.metadata_status=$'+params.length);}
 if(query.tag_id){params.push(query.tag_id);where.push('EXISTS(SELECT 1 FROM question_tags qt WHERE qt.question_id=q.id AND qt.tag_id=$'+params.length+')');}
 if(query.outcome_ids?.length){params.push(query.outcome_ids.map(Number));where.push('q.outcome_id=ANY($'+params.length+'::int[])');}
 if(query.review_status){params.push(query.review_status);where.push('v.review_status=$'+params.length);}
 if(query.created_by){params.push(Number(query.created_by));where.push('q.creator_id=$'+params.length);}
 // Góc nhìn "Tôi nhập hôm nay" / "Bị trả sửa" của bàn làm việc (V6.6.6).
 if(query.created_after){if(query.created_after==='today')where.push('q.created_at>=CURRENT_DATE');else if(/^\d{4}-\d{2}-\d{2}$/.test(query.created_after)){params.push(query.created_after);where.push('q.created_at>=$'+params.length+'::date');}else fail('Ngày không hợp lệ');}
 if(query.returned==='1')where.push("v.reviewed_by IS NOT NULL AND v.review_status IN('DRAFT','REJECTED')");
 // "Chưa gắn Bài" là bộ lọc làm việc chính sau khi nhập: câu hợp lệ nhưng còn thiếu liên kết Bài.
 if(query.lesson_status==='UNASSIGNED')where.push("(q.topic_id IS NULL OR q.lesson_status IN('UNMAPPED','AMBIGUOUS'))");
 else if(query.lesson_status){params.push(query.lesson_status);where.push('q.lesson_status=$'+params.length);}
 // Knowing a job id grants nothing on its own: the scope clauses above still apply.
 if(query.import_job_id){params.push(query.import_job_id);where.push('EXISTS(SELECT 1 FROM import_items ii WHERE ii.result_question_id=q.id AND ii.job_id=$'+params.length+')');}
 if(query.exception){if(!EXCEPTION_SQL[query.exception])fail('Bộ lọc ngoại lệ không hợp lệ');where.push(EXCEPTION_SQL[query.exception]);}
 // Mở đúng một tập câu (vd. "Xem 8 câu" còn lại sau khi duyệt nhanh); phạm vi truy cập ở trên vẫn áp dụng.
 if(query.ids){const ids=String(query.ids).split(',').map(Number).filter(n=>Number.isInteger(n)&&n>0).slice(0,500);params.push(ids);where.push('q.id=ANY($'+params.length+'::int[])');}
 if(query.search){params.push('%'+query.search+'%');where.push(`(q.stem_text ILIKE $${params.length} OR q.question_code ILIKE $${params.length} OR q.normalized_content->>'display_code' ILIKE $${params.length})`);}
 return {where,params};
}
export async function questionList(user,query,capability='content.read'){
 const {where,params}=await questionScope(user,query,capability);
 const limit=Math.min(100,Math.max(1,Number(query.limit)||30)),offset=Math.max(0,Number(query.offset)||0);params.push(limit,offset);
 const rows=(await pool.query(`SELECT q.*,COALESCE(q.normalized_content,v.content) AS content,v.version_number,v.review_status,b.name AS bank_name,count(*) OVER()::int AS total ${QUESTION_FROM} ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY q.id DESC LIMIT $${params.length-1} OFFSET $${params.length}`,params)).rows;
 return Promise.all(rows.map(q=>visibleQuestion(user,q)));
}
export async function transition(client,user,id,next,{targetBankId=null,reason=''}={}){
 if(next==='pending_review')return versionWorkflow(client,user,id,'submit',{reason,targetBankId});
 if(next==='approved')return versionWorkflow(client,user,id,'approve',{reason,targetBankId});
 if(next==='draft'){const v=(await client.query('SELECT v.review_status FROM questions q JOIN question_versions v ON v.id=q.current_version_id WHERE q.id=$1',[id])).rows[0];if(v?.review_status==='PENDING_REVIEW')return versionWorkflow(client,user,id,'request_changes',{reason,targetBankId});}
 if(!(user.role==='board'&&user.capabilities?.content_review))staff(user);const q=(await client.query('SELECT * FROM questions WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!q)fail('Không tìm thấy câu hỏi',404);
 const allowed={draft:['pending_review','archived'],pending_review:['draft','approved','archived'],approved:['active','draft','archived'],active:['archived','pending_review'],archived:['draft']};
 if(!allowed[q.lifecycle]?.includes(next))fail('Chuyển trạng thái không hợp lệ');
 const permission=['approved','active'].includes(next)?'review':'write';const canReview=await contentCapability(user,'approve',q.subject_id,client,{grade:q.grade,bankId:q.bank_id});const bank=(await client.query('SELECT kind FROM banks WHERE id=$1',[q.bank_id])).rows[0];if(!(permission==='review'&&canReview&&bank?.kind==='school'))await bankAccess(user,q.bank_id,permission,client);
 if(targetBankId){const target=(await client.query('SELECT kind FROM banks WHERE id=$1',[targetBankId])).rows[0];if(!(canReview&&target?.kind==='school'))await bankAccess(user,targetBankId,'review',client);}
 if(['approved','active'].includes(next)){await validateCurriculum(client,q,{required:true});if(!await contentCapability(user,'approve',q.subject_id,client,{grade:q.grade,bankId:q.bank_id}))fail('Chỉ tổ trưởng đúng môn hoặc quản trị được duyệt',403);const v=(await client.query('SELECT * FROM question_versions WHERE id=$1',[q.current_version_id])).rows[0];const profile=(await client.query('SELECT config FROM subject_profiles WHERE subject_id=$1',[q.subject_id])).rows[0]?.config||{};const validation=validateQuestion(v,profile);if(validation.errors.length)fail(validation.errors.join('; '));}
 await client.query("UPDATE questions SET lifecycle=$1,quarantined=CASE WHEN $1='archived' THEN true ELSE quarantined END,bank_id=COALESCE($2,bank_id),status=CASE WHEN $1='active' THEN 'Đã duyệt'::question_status WHEN $1='archived' THEN 'Tạm ẩn'::question_status ELSE 'Mới tạo'::question_status END WHERE id=$3",[next,targetBankId,id]);
 await log(client,user,'QUESTION_WORKFLOW',id,{from:q.lifecycle,to:next,targetBankId,reason});return {ok:true};
}
