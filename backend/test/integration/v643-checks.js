import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {chromium} from 'playwright';
export function registerV643(get){
 let a,b,y2,fixture=[],attempt,firstItem,draft,approvedVersion,editedVersion,matrix;
 const ok=(r,status=200)=>assert.equal(r.status,status,JSON.stringify(r.data));
 const payload=(topic,yccd_id,extra={})=>{const {master,school}=get();return {...master,topic_id:topic,yccd_id,bank_id:school,type:'multiple_choice',cognitive_level:1,stem:'TEST V643 câu '+Math.random(),options:['A','B','C','D'].map(id=>({id,text:'Lựa chọn '+id})),answer:{correct:'A'},...extra};};
 async function create(body,active=true){const {req}=get(),r=await req('POST','/practice/questions',body);ok(r,201);if(active)for(const status of ['pending_review','approved','active'])ok(await req('POST','/practice/questions/'+r.data.id+'/workflow',{status}));return r.data;}
 const scope=clauses=>({version:2,subject_id:get().master.subject_id,grade:7,clauses});
 const cfg=clauses=>({subject_id:get().master.subject_id,grade:7,count:10,percent:[100,0,0,0],types:['multiple_choice'],mode:'challenge',content_scope_v2:scope(clauses)});
 test('V643 C1 quan hệ nhiều–nhiều, kiểm tra scope, không tự duyệt ứng viên',async()=>{
  const {db,req,master}=get();
  a=(await db.query("INSERT INTO topics(subject_id,grade,branch_id,name,chapter) VALUES($1,7,$2,'TEST V643 Bài A','TEST V643') RETURNING id",[master.subject_id,master.branch_id])).rows[0].id;
  b=(await db.query("INSERT INTO topics(subject_id,grade,branch_id,name,chapter) VALUES($1,7,$2,'TEST V643 Bài B','TEST V643') RETURNING id",[master.subject_id,master.branch_id])).rows[0].id;
  y2=(await db.query("INSERT INTO curriculum_yccds(outcome_id,code,text) VALUES($1,'TEST.V643.Y2','TEST V643 mục tiêu thứ hai, chỉ là fixture kỹ thuật') RETURNING id",[master.outcome_id])).rows[0].id;
  ok(await req('PUT','/practice/curriculum/topics/'+a+'/mappings',{yccd_ids:[master.yccd_id,y2],status:'CANDIDATE',reason:'TEST'}));
  let cat=await req('GET','/practice/content-scope/catalog?subject_id='+master.subject_id+'&grade=7',undefined,'student');ok(cat);assert(!cat.data.maps.some(m=>m.topic_id===a));assert(!JSON.stringify(cat.data).includes('source_document'));
  for(const [topic,ys] of [[a,[master.yccd_id,y2]],[b,[y2]]])ok(await req('PUT','/practice/curriculum/topics/'+topic+'/mappings',{yccd_ids:ys,status:'ACTIVE',reason:'TEST xác nhận từ fixture, không phải chương trình thật'}));
  const foreign=(await db.query("SELECT y.id FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id WHERE o.domain_code IN('H','S') LIMIT 1")).rows[0];
  const bad=await req('PUT','/practice/curriculum/topics/'+a+'/mappings',{yccd_ids:[foreign.id],status:'ACTIVE',reason:'TEST sai phân môn'});assert(bad.status>=400);
  assert.equal((await db.query('SELECT count(*)::int n FROM topic_yccd_map WHERE topic_id=$1 AND status=$2',[a,'ACTIVE'])).rows[0].n,2);
 });
 test('V643 T5/T6 OR/AND, Outcome giới hạn theo bài, đếm khớp và không lộ câu',async()=>{
  const {req,master}=get();for(let i=0;i<15;i++)fixture.push(await create(payload(i<10?a:b,i<10?master.yccd_id:y2)));
  const resolve=await req('POST','/practice/content-scope/resolve',scope([{topic_id:b,mode:'outcomes',outcome_ids:[master.outcome_id]}]),'student');ok(resolve);assert.deepEqual(resolve.data.resolved.clauses[0].yccd_ids,[y2]);
  const mixed=[{topic_id:a,mode:'all'},{topic_id:b,mode:'yccds',yccd_ids:[y2]}];
  const counted=await req('POST','/practice/content-scope/counts',cfg(mixed),'student');ok(counted);assert.equal(counted.data.total,15);assert(!JSON.stringify(counted.data).includes('answer'));
  const bad=await req('POST','/practice/content-scope/resolve',scope([{topic_id:b,mode:'yccds',yccd_ids:[master.yccd_id]}]),'student');ok(bad,422);assert.equal(bad.data.code,'TOPIC_YCCD_MISMATCH');
  const bank=await req('POST','/practice/questions/search',{content_scope_v2:scope(mixed),limit:100});ok(bank);assert.equal(bank.data.length,15);
  const direct=await req('POST','/practice/content-scope/counts',cfg([{topic_id:null,mode:'yccds',yccd_ids:[y2]}]),'student');ok(direct);assert.equal(direct.data.total,5);
 });
 test('V643 giao bài fixed/dynamic giữ mixed scope; gợi ý không vượt bài; đếm không lộ kho riêng',async()=>{
  const {req,db,master,users,cls}=get(),clauses=[{topic_id:a,mode:'all'},{topic_id:b,mode:'yccds',yccd_ids:[y2]}];
  for(const kind of ['fixed','dynamic']){
   const assignment=await req('POST','/practice/assignments',{title:'TEST V643 mixed '+kind,kind,config:cfg(clauses),class_ids:[cls]});ok(assignment,201);
   const row=(await db.query('SELECT * FROM assignments WHERE id=$1',[assignment.data.id])).rows[0];assert.equal(row.config.content_scope_v2.clauses.length,2);assert.equal(row.curriculum_snapshot.length,10);
   const started=await req('POST','/practice/assignments/'+row.id+'/start',{},'student');ok(started,201);
   const items=(await db.query('SELECT * FROM attempt_items WHERE attempt_id=$1 ORDER BY sequence',[started.data.id])).rows;
   assert.equal(items.length,10);assert(items.every(i=>i.curriculum_snapshot.topic_id===a||i.curriculum_snapshot.topic_id===b&&i.curriculum_snapshot.yccd_id===y2));
   if(kind==='fixed')assert.deepEqual(items.map(i=>i.question_version_id),row.fixed_versions);
  }
  const raw=payload(b,null,{outcome_id:null,stem:'Nêu được ý nghĩa vật lí của tốc độ'});
  const suggestion=await req('POST','/practice/metadata/suggest',raw);ok(suggestion);assert((suggestion.data.metadata_suggestions?.yccds||[]).every(y=>y.id===y2));
  const bank=(await db.query("SELECT id FROM banks WHERE kind='personal' AND owner_id=$1",[users.teacher])).rows[0];assert(bank);
  await create(payload(a,master.yccd_id,{bank_id:bank.id}));
  const studentCount=await req('POST','/practice/content-scope/counts',cfg(clauses),'student');ok(studentCount);assert.equal(studentCount.data.total,15);
  const adminCount=await req('POST','/practice/content-scope/counts',cfg(clauses));ok(adminCount);assert.equal(adminCount.data.total,16);
 });
 test('V643 F1–F7 cờ idempotent, đúng chủ, sau nộp giữ điểm và uncertain',async()=>{
  const {req,db}=get(),r=await req('POST','/practice/attempts',cfg([{topic_id:a,mode:'all'}]),'student');ok(r,201);attempt=r.data.id;
  const view=await req('GET','/practice/attempts/'+attempt,undefined,'student');ok(view);firstItem=view.data.items[0];
  const url='/practice/attempts/'+attempt+'/items/'+firstItem.id+'/flag';
  ok(await req('PATCH',url,{flagged:true},'student'));ok(await req('PATCH',url,{flagged:true},'student'));
  ok(await req('PATCH',url,{flagged:false},'other'),404);
  const row=(await db.query('SELECT * FROM attempt_items WHERE id=$1',[firstItem.id])).rows[0];assert.equal(row.uncertain,false);assert.equal(row.response,null);assert.equal(row.is_flagged,true);
  ok(await req('POST','/practice/attempts/'+attempt+'/submit',{},'student'));
  const before=(await db.query('SELECT score,percentage FROM attempts WHERE id=$1',[attempt])).rows[0];
  ok(await req('PATCH',url,{flagged:false},'student'));ok(await req('PATCH',url,{flagged:true},'student'));
  assert.deepEqual((await db.query('SELECT score,percentage FROM attempts WHERE id=$1',[attempt])).rows[0],before);
  await assert.rejects(()=>db.query("UPDATE attempt_items SET response='\"B\"' WHERE id=$1",[firstItem.id]),/immutable/);
  const flagged=await req('GET','/practice/flagged-items',undefined,'student');ok(flagged);assert(flagged.data.some(i=>i.id===firstItem.id));
  const foreign=await req('GET','/practice/flagged-items',undefined,'other');ok(foreign);assert(!foreign.data.some(i=>i.id===firstItem.id));
 });
 test('V643 R1 nháp sửa tại chỗ; pending không sửa; trả sửa không tạo rác',async()=>{
  const {req,db,master}=get();draft=await create(payload(a,master.yccd_id,{stem:'TEST V643 bản nháp'}),false);
  const body=payload(a,master.yccd_id,{stem:'TEST V643 bản nháp đã sửa'});
  let r=await req('PUT','/practice/questions/'+draft.id,{...body,question_version_id:draft.current_version_id});ok(r);assert.equal(r.data.current_version_id,draft.current_version_id);assert.equal((await db.query('SELECT updated_by FROM question_versions WHERE id=$1',[draft.current_version_id])).rows[0].updated_by,get().users.admin);
  ok(await req('POST','/practice/questions/'+draft.id+'/version-workflow',{action:'submit'}));
  r=await req('PUT','/practice/questions/'+draft.id,body);ok(r,409);
  ok(await req('POST','/practice/questions/'+draft.id+'/version-workflow',{action:'request_changes',reason:'TEST cần giải thích rõ'}));
  r=await req('PUT','/practice/questions/'+draft.id,{...body,stem:'TEST V643 sửa theo phản hồi'});ok(r);assert.equal(r.data.current_version_id,draft.current_version_id);
  assert.equal((await db.query('SELECT count(*)::int n FROM question_versions WHERE question_id=$1',[draft.id])).rows[0].n,1);
 });
 test('V643 R2 bản đã duyệt / đã dùng bất biến, sửa tạo nháp và không tắt bản active',async()=>{
  const {req,db,master}=get(),q=fixture[0];approvedVersion=q.current_version_id;
  const old=(await db.query('SELECT content FROM question_versions WHERE id=$1',[approvedVersion])).rows[0].content;
  const r=await req('PUT','/practice/questions/'+q.id,{...old,stem:'TEST V643 nội dung sửa cần duyệt'});ok(r);editedVersion=r.data.current_version_id;assert.notEqual(editedVersion,approvedVersion);
  assert.equal((await db.query('SELECT active_version_id FROM questions WHERE id=$1',[q.id])).rows[0].active_version_id,approvedVersion);
  await assert.rejects(()=>db.query("UPDATE question_versions SET content=content||'{\"stem\":\"HACK\"}' WHERE id=$1",[approvedVersion]),/immutable/);
  const rows=await req('POST','/practice/content-scope/counts',cfg([{topic_id:a,mode:'all'}]),'student');ok(rows);assert.equal(rows.data.total,10);
  assert.deepEqual((await db.query('SELECT content FROM question_versions WHERE id=$1',[approvedVersion])).rows[0].content,old);
 });
 test('V643 R3/R4 phân loại metadata không sinh content version, case dedup và không sửa lịch sử',async()=>{
  const {req,db}=get(),q=fixture[1],old=(await db.query('SELECT normalized_content FROM questions WHERE id=$1',[q.id])).rows[0].normalized_content;
  const v=q.current_version_id,history=(await db.query('SELECT curriculum_snapshot FROM attempt_items WHERE question_id=$1',[q.id])).rows[0].curriculum_snapshot;
  const r=await req('PUT','/practice/questions/'+q.id,{...old,yccd_id:y2,change_reason:'TEST đổi mục tiêu'});ok(r);assert.equal(r.data.current_version_id,v);
  const c1=await req('POST','/practice/questions/'+q.id+'/review-cases',{reason_code:'CURRICULUM_MISMATCH',note:'TEST bằng chứng thứ hai'});ok(c1,201);
  const c2=await req('POST','/practice/questions/'+q.id+'/review-cases',{reason_code:'CURRICULUM_MISMATCH',note:'TEST bằng chứng thứ ba'});ok(c2,201);assert.equal(c1.data.id,c2.data.id);assert(c2.data.evidence_snapshot.length>=3);
  assert.deepEqual((await db.query('SELECT curriculum_snapshot FROM attempt_items WHERE question_id=$1',[q.id])).rows[0].curriculum_snapshot,history);
  ok(await req('POST','/practice/review-cases/'+c1.data.id+'/resolve',{resolution_type:'METADATA_CORRECTED',note:'TEST xác nhận đúng mapping'}));
  assert.equal((await db.query('SELECT current_version_id FROM questions WHERE id=$1',[q.id])).rows[0].current_version_id,v);
 });
 test('V643 R5 khóa tự duyệt theo policy, ngoại lệ admin có audit',async()=>{
  const {req,db,master}=get(),q=fixture[0];
  ok(await req('POST','/practice/questions/'+q.id+'/version-workflow',{action:'submit'}));
  const prior=(await db.query('SELECT config FROM subject_profiles WHERE subject_id=$1',[master.subject_id])).rows[0]?.config||{};
  await db.query("UPDATE subject_profiles SET config=config||'{\"question_review\":{\"allow_admin_self_approve\":false}}' WHERE subject_id=$1",[master.subject_id]);
  ok(await req('POST','/practice/questions/'+q.id+'/version-workflow',{action:'approve'}),403);
  await db.query('UPDATE subject_profiles SET config=$1 WHERE subject_id=$2',[JSON.stringify(prior),master.subject_id]);
  ok(await req('POST','/practice/questions/'+q.id+'/version-workflow',{action:'approve'}));
  assert((await db.query("SELECT 1 FROM practice_audit WHERE action='QUESTION_SELF_APPROVAL_EXCEPTION' AND entity_id=$1",[String(q.id)])).rowCount);
  assert.equal((await db.query('SELECT active_version_id FROM questions WHERE id=$1',[q.id])).rows[0].active_version_id,editedVersion);
 });
 test('V643 R6 khôi phục tạo phiên bản mới, không trỏ lùi bản active',async()=>{
  const {req,db}=get(),q=fixture[0],r=await req('POST','/practice/questions/'+q.id+'/restore',{version_id:approvedVersion,reason:'TEST khôi phục'});ok(r,201);assert.notEqual(r.data.current_version_id,approvedVersion);
  const v=(await db.query('SELECT * FROM question_versions WHERE id=$1',[r.data.current_version_id])).rows[0];assert.equal(v.restored_from_version_id,approvedVersion);assert.equal(v.review_status,'DRAFT');
  assert.equal((await db.query('SELECT active_version_id FROM questions WHERE id=$1',[q.id])).rows[0].active_version_id,editedVersion);
 });
 test('V643 R7 nghi sai đáp án cách ly lượt mới, NO_ISSUE giữ nguyên version',async()=>{
  const {req,db}=get(),q=fixture[2],c=await req('POST','/practice/questions/'+q.id+'/review-cases',{reason_code:'SUSPECTED_WRONG_KEY',note:'TEST nghi vấn đáp án'});ok(c,201);
  let count=await req('POST','/practice/content-scope/counts',cfg([{topic_id:a,mode:'all'}]),'student');ok(count);assert.equal(count.data.total,9);
  ok(await req('POST','/practice/review-cases/'+c.data.id+'/resolve',{resolution_type:'NO_ISSUE',note:'TEST đã kiểm tra đáp án đúng'}));
  count=await req('POST','/practice/content-scope/counts',cfg([{topic_id:a,mode:'all'}]),'student');ok(count);assert.equal(count.data.total,10);assert.equal((await db.query('SELECT current_version_id FROM questions WHERE id=$1',[q.id])).rows[0].current_version_id,q.current_version_id);
 });
 test('V643 C8 matrix scope snapshot giữ bài và phát hiện mapping drift',async()=>{
  const {req,master}=get(),resolved=await req('POST','/practice/content-scope/resolve-matrix',scope([{topic_id:b,mode:'all'}]));ok(resolved);assert.deepEqual(resolved.data.yccd_ids,[y2]);
  const r=await req('POST','/matrix',{name:'TEST V643 ma trận snapshot',subject_id:master.subject_id,grade:7,total_score:1,ratio_m1:100,ratio_m2:0,ratio_m3:0,ratio_m4:0,content_scope_v2:scope([{topic_id:b,mode:'all'}]),cells:[{...master,yccd_id:y2,q_type:'mcq4',cognitive_level:'M1',question_count:4,score_per_question:.25}]});ok(r,201);matrix=r.data.id;
  ok(await req('PUT','/practice/curriculum/topics/'+b+'/mappings',{yccd_ids:[master.yccd_id],status:'ACTIVE',reason:'TEST thêm mapping sau lưu'}));
  const now=await req('GET','/matrix/'+matrix);ok(now);assert(now.data.mapping_change);assert.deepEqual(now.data.scope_snapshot.yccd_ids,[y2]);
  const coverage=await req('GET','/matrix/'+matrix+'/coverage');ok(coverage);assert.equal(coverage.data.cells[0].exact_available,5);
 });
 test('V643 metadata mới không làm lệch bản active; alias nhãn và báo lỗi giữ lịch sử',async()=>{
  const {req,db,master,users}=get(),student=users.student,q=fixture[3];
  const before=(await db.query('SELECT curriculum_snapshot FROM attempt_items WHERE question_id=$1',[q.id])).rows[0].curriculum_snapshot;
  const content=(await db.query('SELECT normalized_content FROM questions WHERE id=$1',[q.id])).rows[0].normalized_content;
  ok(await req('PUT','/practice/questions/'+q.id,{...content,cognitive_level:2,stem:content.stem+' thay đổi nội dung cần duyệt'}));
  const active=(await db.query('SELECT cognitive_level FROM question_selection_metadata WHERE id=$1',[q.id])).rows[0];assert.equal(active.cognitive_level,'M1');
  const oldLabel=(await db.query('SELECT * FROM curriculum_yccds WHERE id=$1',[master.yccd_id])).rows[0];
  ok(await req('POST','/practice/curriculum/yccd/'+master.yccd_id+'/change',{action:'minor',code:'TEST.RECODE.V643',text:oldLabel.text+' (sửa nhãn TEST)',reason:'TEST sửa nhãn, không đổi nghĩa'}));
  assert((await db.query('SELECT 1 FROM curriculum_aliases WHERE entity_type=$1 AND entity_id=$2 AND old_code=$3',['yccd',master.yccd_id,oldLabel.code])).rowCount);
  const report=await req('POST','/practice/attempts/'+attempt+'/items/'+firstItem.id+'/report',{note:'TEST học sinh phát hiện nội dung cần xem'},'student');ok(report,201);assert.equal(report.data.reason_code,'STUDENT_REPORT');
  ok(await req('POST','/practice/attempts/'+attempt+'/items/'+firstItem.id+'/report',{note:'TEST không sở hữu'},'other'),404);
  const portfolio=await req('GET','/practice/students/'+student+'/attempts/'+attempt,undefined,'student');ok(portfolio);assert.equal(portfolio.data.items.find(i=>i.question_id===q.id).topic_name,before.topic_name);
  const map=await req('GET','/practice/learning-map/'+student,undefined,'student');ok(map);assert(map.data.rows.some(r=>r.code===before.yccd_code));assert(!map.data.rows.some(r=>r.code==='TEST.RECODE.V643'));
  assert.deepEqual((await db.query('SELECT curriculum_snapshot FROM attempt_items WHERE question_id=$1',[q.id])).rows[0].curriculum_snapshot,before);
  ok(await req('POST','/practice/curriculum/yccd/'+master.yccd_id+'/change',{action:'minor',code:oldLabel.code,text:oldLabel.text,reason:'TEST trả nhãn fixture'}));
 });
 test('V643 C10 nghỉ YCCĐ cần preview; bài cũ nguyên snapshot và học sinh không thấy chuẩn nghỉ',async()=>{
  const {req,db}=get(),q=fixture[1],before=(await db.query('SELECT curriculum_snapshot FROM attempt_items WHERE question_id=$1',[q.id])).rows[0].curriculum_snapshot;
  ok(await req('POST','/practice/curriculum/yccd/'+y2+'/change',{action:'retire',reason:'TEST nghỉ chuẩn'}),409);
  const impact=await req('GET','/practice/curriculum/yccd/'+y2+'/impact');ok(impact);assert(impact.data.counts.questions>=5);
  ok(await req('POST','/practice/curriculum/yccd/'+y2+'/change',{action:'retire',reason:'TEST nghỉ chuẩn',impact_fingerprint:impact.data.fingerprint}));
  assert.deepEqual((await db.query('SELECT curriculum_snapshot FROM attempt_items WHERE question_id=$1',[q.id])).rows[0].curriculum_snapshot,before);
  ok(await req('POST','/practice/content-scope/resolve',scope([{topic_id:null,mode:'yccds',yccd_ids:[y2]}]),'student'),422);
  const hist=await req('GET','/practice/attempts/'+attempt,undefined,'student');ok(hist);assert.equal(hist.data.status,'completed');
 });
 test('V643 quyền duyệt giới hạn khối, lịch sử ngoài môn bị chặn và chuẩn thay thế tách ID',async()=>{
  const {req,db,users,master}=get(),q=fixture[0];
  const position=(await db.query("INSERT INTO user_positions(user_id,position,subject_id,grade,can_approve) VALUES($1,'board',$2,8,true) RETURNING id",[users.board,master.subject_id])).rows[0];
  // Xóa quyền subject không giới hạn của fixture trước đó, chỉ trong DB thử.
  const old=(await db.query("SELECT * FROM user_positions WHERE user_id=$1 AND position='board' AND subject_id=$2 AND id<>$3",[users.board,master.subject_id,position.id])).rows;
  await db.query("UPDATE user_positions SET can_approve=false WHERE user_id=$1 AND position='board' AND subject_id=$2 AND id<>$3",[users.board,master.subject_id,position.id]);
  ok(await req('GET','/practice/questions/'+q.id+'/reviewers',undefined,'board'),403);
  await db.query('UPDATE user_positions SET grade=7 WHERE id=$1',[position.id]);
  ok(await req('GET','/practice/questions/'+q.id+'/reviewers',undefined,'board'));
  await db.query('DELETE FROM user_positions WHERE id=$1',[position.id]);for(const p of old)await db.query('UPDATE user_positions SET can_approve=$1 WHERE id=$2',[p.can_approve,p.id]);
  ok(await req('GET','/practice/questions/'+q.id+'/versions',undefined,'other'),403);
  const draft=await req('POST','/practice/curriculum/yccd',{outcome_id:master.outcome_id,code:'TEST.OLD.REPLACE',text:'TEST chuẩn trước',source_locator:'TEST fixture'});ok(draft,201);
  const impact=await req('GET','/practice/curriculum/yccd/'+draft.data.id+'/impact');ok(impact);
  ok(await req('POST','/practice/curriculum/yccd/'+draft.data.id+'/change',{action:'replace',code:'TEST.NEW.REPLACE',text:'TEST chuẩn mới nghĩa mới',reason:'TEST không sửa đè',impact_fingerprint:impact.data.fingerprint}));
  const oldY=(await db.query('SELECT * FROM curriculum_yccds WHERE id=$1',[draft.data.id])).rows[0];assert.equal(oldY.status,'RETIRED');assert(oldY.superseded_by);assert.equal(oldY.text,'TEST chuẩn trước');
  assert.equal((await db.query('SELECT status FROM curriculum_yccds WHERE id=$1',[oldY.superseded_by])).rows[0].status,'DRAFT');
 });
 test('V643 duyệt bản mới vẫn cách ly khi hồ sơ P0 chưa kết luận',async()=>{
  const {req,db}=get(),q=fixture[4],current=(await db.query('SELECT normalized_content FROM questions WHERE id=$1',[q.id])).rows[0].normalized_content;
  const c=await req('POST','/practice/questions/'+q.id+'/review-cases',{reason_code:'SUSPECTED_WRONG_KEY',note:'TEST giữ cách ly đến khi kết luận'});ok(c,201);
  ok(await req('PUT','/practice/questions/'+q.id,{...current,explanation:'TEST bổ sung giải thích đáp án'}));
  ok(await req('POST','/practice/questions/'+q.id+'/version-workflow',{action:'submit'}));ok(await req('POST','/practice/questions/'+q.id+'/version-workflow',{action:'approve'}));
  assert.equal((await db.query('SELECT quarantined FROM questions WHERE id=$1',[q.id])).rows[0].quarantined,true);
  ok(await req('POST','/practice/review-cases/'+c.data.id+'/resolve',{resolution_type:'NEW_VERSION_APPROVED',note:'TEST đã xác nhận bản mới'}));
  assert.equal((await db.query('SELECT quarantined FROM questions WHERE id=$1',[q.id])).rows[0].quarantined,false);
 });
 test('V643 UI học sinh tick bài, cờ persist/offline; quản trị và review hiển thị',{timeout:90000},async()=>{
  const {origin,pw,dir,master}=get(),browser=await chromium.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   async function login(name){await page.goto(origin+'/login');await page.getByPlaceholder('admin').fill(name);await page.locator('input[type=password]').fill(pw);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL(url=>!url.pathname.includes('login'));}
   await login('v63_student');await page.goto(origin+'/practice/new');await page.getByLabel('Môn học',{exact:true}).selectOption(String(master.subject_id));await page.getByLabel('Khối',{exact:true}).selectOption('7');await page.getByLabel('Tìm bài / chuyên đề',{exact:true}).fill('TEST V643 Bài A');
   await page.locator('.scope-v2-lesson').getByRole('checkbox').first().check();await page.screenshot({path:path.join(dir,'v6_4-practice-scope.png'),fullPage:true});
   await page.goto(origin+'/practice/attempts/'+attempt+'?item='+firstItem.id);await page.getByRole('button',{name:'Bỏ đánh dấu câu này',exact:true}).waitFor();assert.equal(await page.locator('input[type=radio]').count(),4);
   await page.context().setOffline(true);await page.getByRole('button',{name:'Bỏ đánh dấu câu này',exact:true}).click();await page.getByText(/Cờ chưa đồng bộ/).waitFor();await page.context().setOffline(false);
   await page.getByText('Đã lưu cờ xem lại',{exact:true}).waitFor();await page.reload();await page.getByRole('button',{name:'Đánh dấu câu cần xem lại',exact:true}).waitFor();
   await page.getByRole('button',{name:'Đánh dấu câu cần xem lại',exact:true}).click();await page.getByText('Đã lưu cờ xem lại',{exact:true}).waitFor();await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));assert.equal(await page.locator('#app-sidebar').evaluate(el=>getComputedStyle(el).visibility),'hidden');assert.equal(await page.locator('input[type=radio]').count(),4);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(dir,'v6_4-student-flag-mobile.png'),fullPage:true,animations:'disabled'});
   await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>localStorage.removeItem('nganhang_token'));await login('v63_admin');
   // Từ V6.6.4–V6.6.6 Kho là bàn làm việc chung (lọc Bài qua URL, không còn khung "Tinh chỉnh Outcome / YCCĐ");
   // so sánh phiên bản mở bằng "Xem kỹ", hồ sơ rà soát nằm ở tab "Cần xem kỹ" của màn Duyệt.
   await page.goto(origin+'/practice/banks?subject_id='+master.subject_id+'&grade=7&topic_id='+a);await page.getByRole('heading',{name:'Ngân hàng câu hỏi',exact:true}).waitFor();
   await page.locator('.queue-table tbody tr').first().click();await page.screenshot({path:path.join(dir,'v6_4-bank-lesson-scope.png'),fullPage:true});
   await page.getByRole('button',{name:'Xem kỹ',exact:true}).click();await page.getByText('So sánh và duyệt phiên bản',{exact:true}).waitFor();assert.equal(await page.locator('.review-diff-grid').evaluate(el=>getComputedStyle(el).display),'grid');await page.screenshot({path:path.join(dir,'v6_4-question-version-review.png'),fullPage:true});
   await page.goto(origin+'/practice/reviews?tab=cases');await page.getByRole('heading',{name:'Hồ sơ rà soát câu hỏi',exact:true}).waitFor();await page.getByRole('button',{name:'Mở hồ sơ và so sánh',exact:true}).first().click();await page.getByRole('heading',{name:/^Hồ sơ #\d+/}).waitFor();await page.screenshot({path:path.join(dir,'v6_4-review-case.png'),fullPage:true});
   await page.goto(origin+'/practice/curriculum');await page.getByLabel('Môn',{exact:true}).selectOption(String(master.subject_id),{timeout:7000}).catch(async e=>{await page.screenshot({path:path.join(dir,'v643-ui-error.png'),fullPage:true});throw Error(e.message+' Errors: '+JSON.stringify(errors)+' DOM: '+(await page.locator('body').innerText()).slice(0,2500));});await page.getByRole('button',{name:'Mở chương trình',exact:true}).click();await page.getByLabel('Bài học',{exact:true}).selectOption(String(a));await page.getByRole('button',{name:'Xem tác động / lưu trữ bài',exact:true}).click();await page.getByRole('heading',{name:'Tác động trước thay đổi'}).waitFor();await page.screenshot({path:path.join(dir,'v6_4-curriculum-impact.png'),fullPage:true});
   await page.goto(origin+'/matrix');await page.getByRole('button',{name:'🧪 KHTN (3 phân môn)',exact:true}).click();await page.getByLabel('Môn học',{exact:true}).selectOption(String(master.subject_id));await page.getByLabel('Khối',{exact:true}).selectOption('7');
   await page.getByLabel('Tìm bài / chuyên đề',{exact:true}).fill('TEST V643 Bài A');await page.locator('.scope-v2-lesson').getByRole('checkbox').first().check();await page.getByRole('button',{name:'Xác nhận phạm vi bài → YCCĐ',exact:true}).click();await page.getByRole('button',{name:'Thiết lập từ phạm vi đã chọn',exact:true}).waitFor();
   await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(dir,'v6_4-matrix-lesson-scope.png'),fullPage:true,animations:'disabled'});
   assert.deepEqual(errors,[]);
  }finally{await browser.close();}
 });
}
