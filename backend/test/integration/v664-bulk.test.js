// V6.6.4 — canonical bulk question workflow + import batch continuity.
// Runs against a throwaway clone of the local working database; never touches the working data.
import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const source = process.env.DB_NAME;
if (!source?.startsWith('nganhang_personalized')) throw new Error('Integration tests require an isolated personalized database');

const name = 'nganhang_v664_test_' + Date.now();
const adminPool = new pg.Pool({host: process.env.DB_HOST, port: process.env.DB_PORT, database: source, user: process.env.DB_USER, password: process.env.DB_PASSWORD});
const artifacts = path.resolve('../artifacts');
fs.mkdirSync(artifacts, {recursive: true});
const dump = path.join(artifacts, 'v664-source.dump');
const env = {...process.env, PGHOST: process.env.DB_HOST, PGPORT: process.env.DB_PORT, PGUSER: process.env.DB_USER, PGPASSWORD: process.env.DB_PASSWORD};

const port = 3103, origin = 'http://127.0.0.1:' + port;
const pw = crypto.randomBytes(12).toString('base64url');
let db, server, uploadsDir;
let tokens = {}, users = {}, subjectId, otherSubjectId, departmentId, topicId, outcomeId, yccdId, bankId, classId, yearId;

async function req(method, url, body, token = tokens.admin) {
  const res = await fetch(origin + '/api' + url, {
    method,
    headers: {...(token ? {Authorization: 'Bearer ' + token} : {}), ...(body !== undefined ? {'Content-Type': 'application/json'} : {})},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return {status: res.status, data};
}
const expect = (r, s) => assert.equal(r.status, s, typeof r.data === 'string' ? r.data : JSON.stringify(r.data));

async function login(username) {
  const r = await req('POST', '/auth/login', {username, password: pw}, null);
  expect(r, 200);
  return r.data.token;
}

async function makeQuestion(token = tokens.author, overrides = {}) {
  const r = await req('POST', '/practice/questions', {
    subject_id: subjectId, topic_id: topicId, grade: 9, outcome_id: outcomeId, yccd_id: yccdId,
    type: 'multiple_choice', cognitive_level: 1,
    stem: 'Câu kiểm thử V6.6.4 ' + crypto.randomUUID().slice(0, 8),
    options: ['A', 'B', 'C', 'D'].map(id => ({id, text: 'Phương án ' + id})),
    answer: {correct: 'B'}, explanation: 'Lời giải kỹ thuật cho kiểm thử hồi quy',
    bank_id: bankId, ...overrides,
  }, token);
  expect(r, 201);
  return r.data;
}

const versionOf = async id => (await db.query('SELECT current_version_id FROM questions WHERE id=$1', [id])).rows[0].current_version_id;
const expectedFor = async ids => Object.fromEntries(await Promise.all(ids.map(async id => [String(id), await versionOf(id)])));
const lifecycleOf = async id => (await db.query('SELECT lifecycle FROM questions WHERE id=$1', [id])).rows[0].lifecycle;

test.before(async () => {
  const d = spawnSync('pg_dump', ['-Fc', '-d', source, '-f', dump], {env, encoding: 'utf8'});
  assert.equal(d.status, 0, d.stderr);
  await adminPool.query('CREATE DATABASE ' + name);
  const restored = spawnSync('pg_restore', ['--no-owner', '--no-privileges', '-d', name, dump], {env, encoding: 'utf8'});
  assert.equal(restored.status, 0, restored.stderr);
  db = new pg.Pool({host: process.env.DB_HOST, port: process.env.DB_PORT, database: name, user: process.env.DB_USER, password: process.env.DB_PASSWORD});

  departmentId = (await db.query("INSERT INTO departments(code,name) VALUES('V664_DEP','Tổ kiểm thử V6.6.4') RETURNING id")).rows[0].id;
  const otherDepartment = (await db.query("INSERT INTO departments(code,name) VALUES('V664_OTH','Tổ ngoài phạm vi V6.6.4') RETURNING id")).rows[0].id;
  subjectId = (await db.query("INSERT INTO subjects(code,name,department_id) VALUES('V664_S','Môn kiểm thử V6.6.4',$1) RETURNING id", [departmentId])).rows[0].id;
  otherSubjectId = (await db.query("INSERT INTO subjects(code,name,department_id) VALUES('V664_O','Môn ngoài phạm vi V6.6.4',$1) RETURNING id", [otherDepartment])).rows[0].id;
  yearId = (await db.query("INSERT INTO school_years(name,start_date,end_date) VALUES('V664 kiểm thử',CURRENT_DATE-30,CURRENT_DATE+330) RETURNING id")).rows[0].id;
  classId = (await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('9A V664',9,$1) RETURNING id", [yearId])).rows[0].id;
  const otherClass = (await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('9B V664',9,$1) RETURNING id", [yearId])).rows[0].id;
  topicId = (await db.query("INSERT INTO topics(subject_id,grade,name,status) VALUES($1,9,'Bài kiểm thử V6.6.4','ACTIVE') RETURNING id", [subjectId])).rows[0].id;
  outcomeId = (await db.query("INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document) VALUES($1,9,'','V664.O','Fixture kỹ thuật, không phải chương trình','TEST','Chỉ trong database kiểm thử') RETURNING id", [subjectId])).rows[0].id;
  yccdId = (await db.query("INSERT INTO curriculum_yccds(outcome_id,code,text) VALUES($1,'V664.Y','YCCĐ giả lập chỉ dùng kiểm thử') RETURNING id", [outcomeId])).rows[0].id;
  await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')", [topicId, yccdId]);
  bankId = (await db.query("INSERT INTO banks(name,kind,department_id) VALUES('Kho tổ V6.6.4','department',$1) RETURNING id", [departmentId])).rows[0].id;

  const hash = await bcrypt.hash(pw, 10);
  for (const [key, username, role] of [['admin', 'v664_admin', 'admin'], ['author', 'v664_author', 'teacher'], ['reviewer', 'v664_reviewer', 'teacher'], ['outsider', 'v664_outsider', 'teacher']]) {
    users[key] = (await db.query('INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES($1,$2,$3,$4,false) RETURNING id', [username, hash, username, role])).rows[0].id;
  }

  uploadsDir = path.join(artifacts, 'v664-uploads-' + name);
  fs.cpSync(path.resolve(process.env.UPLOAD_DIR || 'uploads'), uploadsDir, {recursive: true, errorOnExist: true});
  const output = fs.openSync(path.join(artifacts, 'v664-server.log'), 'w');
  server = spawn(process.execPath, ['src/server.js'], {
    env: {...process.env, DB_NAME: name, UPLOAD_DIR: uploadsDir, PORT: String(port), HOST: '127.0.0.1'},
    stdio: ['ignore', output, output], windowsHide: true,
  });
  let ready = false;
  for (let i = 0; i < 240; i++) {
    if (server.exitCode !== null) throw new Error('Server exited: ' + fs.readFileSync(path.join(artifacts, 'v664-server.log'), 'utf8'));
    try { const r = await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1000)}); if (r.ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  assert(ready, 'Server not healthy: ' + fs.readFileSync(path.join(artifacts, 'v664-server.log'), 'utf8'));

  tokens.admin = await login('v664_admin');
  expect(await req('PUT', `/staff/${users.author}/assignments`, {school_year_id: yearId, positions: [], teaching: [{subject_id: subjectId, class_ids: [classId]}], reason: 'Phân công kiểm thử V6.6.4'}), 200);
  expect(await req('PUT', `/staff/${users.reviewer}/assignments`, {school_year_id: yearId, positions: [{type: 'DEPT_LEADER', department_ids: [departmentId]}], teaching: [], reason: 'Phân công kiểm thử V6.6.4'}), 200);
  expect(await req('PUT', `/staff/${users.outsider}/assignments`, {school_year_id: yearId, positions: [], teaching: [{subject_id: otherSubjectId, class_ids: [otherClass]}], reason: 'Phân công kiểm thử V6.6.4'}), 200);
  for (const [user, permission] of [[users.author, 'write'], [users.reviewer, 'review']]) {
    expect(await req('POST', '/practice/bank-permissions', {bank_id: bankId, user_id: user, permission}), 200);
  }
  tokens.author = await login('v664_author');
  tokens.reviewer = await login('v664_reviewer');
  tokens.outsider = await login('v664_outsider');

  const me = await req('GET', '/auth/me', undefined, tokens.reviewer);
  expect(me, 200);
  assert.equal(me.data.capabilities['content.approve'], true, 'Người duyệt phải có content.approve');
  const authorMe = await req('GET', '/auth/me', undefined, tokens.author);
  assert.equal(authorMe.data.capabilities['content.write'], true, 'Tác giả phải có content.write');
  assert.equal(authorMe.data.capabilities['content.approve'], false, 'Tác giả không được có content.approve');
});

test.after(async () => {
  server?.kill();
  await db?.end();
  await adminPool.end();
});

test('V664: queue summary không lộ đáp án và selection-ids trả phiên bản đang xem', async () => {
  const q = await makeQuestion();
  const queue = await req('GET', '/practice/questions/queue?subject_id=' + subjectId, undefined, tokens.reviewer);
  expect(queue, 200);
  const row = queue.data.items.find(i => i.id === q.id);
  assert(row, 'Câu vừa tạo phải xuất hiện trong hàng đợi');
  for (const leaked of ['answer', 'answer_key', 'explanation', 'option_a', 'stem_text', 'normalized_content', 'content']) {
    assert.equal(row[leaked], undefined, 'Tóm tắt hàng đợi không được chứa ' + leaked);
  }
  assert.equal(row.answer_hidden, true);
  assert(row.stem_excerpt.length <= 180);
  assert.equal(row.current_version_id, await versionOf(q.id));

  const selection = await req('GET', '/practice/questions/selection-ids?subject_id=' + subjectId, undefined, tokens.reviewer);
  expect(selection, 200);
  assert.equal(selection.data.expected_versions[String(q.id)], await versionOf(q.id));
  assert.equal(selection.data.truncated, selection.data.total > selection.data.limit);
  assert.equal(selection.data.limit, 500);
});

test('V664: hàng đợi và selection-ids áp dụng phạm vi — người ngoài môn không thấy câu', async () => {
  const q = await makeQuestion();
  const queue = await req('GET', '/practice/questions/queue?subject_id=' + subjectId, undefined, tokens.outsider);
  expect(queue, 200);
  assert.equal(queue.data.items.find(i => i.id === q.id), undefined, 'Người ngoài phạm vi không được thấy câu');
  const selection = await req('GET', '/practice/questions/selection-ids?subject_id=' + subjectId, undefined, tokens.outsider);
  expect(selection, 200);
  assert.equal(selection.data.expected_versions[String(q.id)], undefined);
});

test('V664: bulk submit bản nháp sạch rồi bulk approve bản chờ duyệt', async () => {
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await makeQuestion()).id);

  const submit = await req('POST', '/practice/questions/bulk-workflow', {ids, action: 'submit', expected_versions: await expectedFor(ids)}, tokens.author);
  expect(submit, 200);
  assert.equal(submit.data.applied, 3);
  assert(submit.data.batch_id);
  for (const id of ids) assert.equal(await lifecycleOf(id), 'pending_review');

  const preflight = await req('POST', '/practice/questions/bulk-preflight', {ids, action: 'approve', expected_versions: await expectedFor(ids)}, tokens.reviewer);
  expect(preflight, 200);
  assert.equal(preflight.data.eligible.length, 3, JSON.stringify(preflight.data));
  assert.equal(preflight.data.blocked.length, 0);
  // Preflight must be a dry run: state is unchanged after previewing.
  for (const id of ids) assert.equal(await lifecycleOf(id), 'pending_review');

  const approve = await req('POST', '/practice/questions/bulk-workflow', {ids, action: 'approve', expected_versions: await expectedFor(ids)}, tokens.reviewer);
  expect(approve, 200);
  assert.equal(approve.data.applied, 3);
  for (const id of ids) assert.equal(await lifecycleOf(id), 'approved');

  const audit = (await db.query("SELECT details FROM practice_audit WHERE action='QUESTION_BULK_WORKFLOW' AND entity_id=$1", [approve.data.batch_id])).rows[0];
  assert(audit, 'Mỗi lô phải có một bản ghi nhật ký riêng');
  assert.equal(audit.details.action, 'approve');
  assert.deepEqual(audit.details.question_ids.sort(), ids.slice().sort());
});

test('V664: câu ngoài phạm vi môn bị chặn và không câu nào bị đổi trạng thái', async () => {
  const id = (await makeQuestion()).id;
  const before = await lifecycleOf(id);
  const r = await req('POST', '/practice/questions/bulk-workflow', {ids: [id], action: 'submit', expected_versions: await expectedFor([id])}, tokens.outsider);
  expect(r, 409);
  assert.equal(r.data.details.blocked[0].question_id, id);
  assert.equal(r.data.details.blocked[0].reason_code, 'NO_PERMISSION');
  assert.equal(await lifecycleOf(id), before);
});

test('V664: phiên bản cũ bị từ chối bằng STALE_VERSION', async () => {
  // An unapproved draft is edited in place, so a genuinely stale pointer only exists once the
  // question has been approved at least one time and a later edit forks a new version.
  const q = await makeQuestion();
  expect(await req('POST', '/practice/questions/bulk-workflow', {ids: [q.id], action: 'submit', expected_versions: await expectedFor([q.id])}, tokens.author), 200);
  expect(await req('POST', '/practice/questions/bulk-workflow', {ids: [q.id], action: 'approve', expected_versions: await expectedFor([q.id])}, tokens.reviewer), 200);
  const stale = await versionOf(q.id);

  expect(await req('PUT', `/practice/questions/${q.id}`, {
    subject_id: subjectId, topic_id: topicId, grade: 9, outcome_id: outcomeId, yccd_id: yccdId,
    type: 'multiple_choice', cognitive_level: 1, stem: 'Nội dung đã sửa sau khi chọn',
    options: ['A', 'B', 'C', 'D'].map(id => ({id, text: 'Phương án ' + id})), answer: {correct: 'C'},
    explanation: 'Lời giải đã cập nhật', question_version_id: stale,
  }, tokens.author), 200);
  const fresh = await versionOf(q.id);
  assert.notEqual(fresh, stale, 'Sửa câu đã duyệt phải sinh phiên bản mới');

  const r = await req('POST', '/practice/questions/bulk-workflow', {ids: [q.id], action: 'submit', expected_versions: {[String(q.id)]: stale}}, tokens.author);
  expect(r, 409);
  assert.equal(r.data.details.requires_deep_review[0].reason_code, 'STALE_VERSION');
  assert.equal((await db.query('SELECT review_status FROM question_versions WHERE id=$1', [fresh])).rows[0].review_status, 'DRAFT',
    'Phiên bản mới không được gửi duyệt khi người dùng đang giữ ảnh chụp cũ');
});

test('V664: lô có câu hỏng thì không câu nào được áp dụng', async () => {
  const good = [(await makeQuestion()).id, (await makeQuestion()).id];
  const bad = (await makeQuestion()).id;
  const expected = await expectedFor([...good, bad]);
  expected[String(bad)] = crypto.randomUUID();

  const r = await req('POST', '/practice/questions/bulk-workflow', {ids: [...good, bad], action: 'submit', expected_versions: expected}, tokens.author);
  expect(r, 409);
  assert.equal(r.data.details.atomic, true);
  assert.equal(r.data.details.eligible.length, 2);
  for (const id of [...good, bad]) assert.equal(await lifecycleOf(id), 'draft', 'Không câu nào được đổi khi lô bị chặn');

  // Retrying with only the eligible ids is what the UI offers after an atomic refusal.
  const retry = await req('POST', '/practice/questions/bulk-workflow', {ids: good, action: 'submit', expected_versions: await expectedFor(good)}, tokens.author);
  expect(retry, 200);
  for (const id of good) assert.equal(await lifecycleOf(id), 'pending_review');
});

test('V664: quá 500 ID bị từ chối trước khi chạm dữ liệu', async () => {
  const ids = Array.from({length: 501}, (_, i) => i + 1);
  const r = await req('POST', '/practice/questions/bulk-workflow', {ids, action: 'submit'}, tokens.author);
  assert.equal(r.status, 400, JSON.stringify(r.data));
});

test('V664: yêu cầu sửa bắt buộc có lý do', async () => {
  const id = (await makeQuestion()).id;
  expect(await req('POST', '/practice/questions/bulk-workflow', {ids: [id], action: 'submit', expected_versions: await expectedFor([id])}, tokens.author), 200);
  const noReason = await req('POST', '/practice/questions/bulk-workflow', {ids: [id], action: 'request_changes'}, tokens.reviewer);
  assert.equal(noReason.status, 400, JSON.stringify(noReason.data));
  const withReason = await req('POST', '/practice/questions/bulk-workflow', {ids: [id], action: 'request_changes', reason: 'Cần bổ sung dữ kiện cho đề', expected_versions: await expectedFor([id])}, tokens.reviewer);
  expect(withReason, 200);
});

test('V664: tác giả không tự duyệt bài của mình dù có quyền duyệt', async () => {
  // The reviewer authors a question here, so author and approver are the same person.
  const q = await makeQuestion(tokens.reviewer);
  expect(await req('POST', '/practice/questions/bulk-workflow', {ids: [q.id], action: 'submit', expected_versions: await expectedFor([q.id])}, tokens.reviewer), 200);
  const r = await req('POST', '/practice/questions/bulk-workflow', {ids: [q.id], action: 'approve', expected_versions: await expectedFor([q.id])}, tokens.reviewer);
  expect(r, 409);
  assert.equal(r.data.details.requires_deep_review[0].reason_code, 'SECOND_REVIEWER_REQUIRED');
  assert.equal(await lifecycleOf(q.id), 'pending_review');
});

test('V664: hồ sơ P0 đang mở đẩy câu sang rà soát chi tiết, không duyệt nhanh', async () => {
  const q = await makeQuestion();
  expect(await req('POST', '/practice/questions/bulk-workflow', {ids: [q.id], action: 'submit', expected_versions: await expectedFor([q.id])}, tokens.author), 200);
  expect(await req('POST', `/practice/questions/${q.id}/review-cases`, {reason_code: 'SUSPECTED_WRONG_KEY', note: 'Nghi sai đáp án — kiểm thử'}, tokens.reviewer), 201);

  const preflight = await req('POST', '/practice/questions/bulk-preflight', {ids: [q.id], action: 'approve', expected_versions: await expectedFor([q.id])}, tokens.reviewer);
  expect(preflight, 200);
  assert.equal(preflight.data.eligible.length, 0);
  assert.equal(preflight.data.requires_deep_review.length, 1);
  assert(preflight.data.requires_deep_review[0].signals.some(s => s === 'QUARANTINED' || s === 'OPEN_REVIEW_CASE_P0'));

  const r = await req('POST', '/practice/questions/bulk-workflow', {ids: [q.id], action: 'approve', expected_versions: await expectedFor([q.id])}, tokens.reviewer);
  expect(r, 409);
  assert.equal(await lifecycleOf(q.id), 'pending_review');
});

test('V664: lưu trữ hàng loạt giữ nguyên lịch sử phiên bản', async () => {
  const q = await makeQuestion();
  const versionsBefore = (await db.query('SELECT id FROM question_versions WHERE question_id=$1', [q.id])).rows.length;
  const r = await req('POST', '/practice/questions/bulk-workflow', {ids: [q.id], action: 'archive', reason: 'Ngừng dùng trong kiểm thử', expected_versions: await expectedFor([q.id])}, tokens.author);
  expect(r, 200);
  assert.equal(await lifecycleOf(q.id), 'archived');
  assert.equal((await db.query('SELECT id FROM question_versions WHERE question_id=$1', [q.id])).rows.length, versionsBefore);
});

test('V664: import giữ ngữ cảnh lô — confirm trả question_ids, mở lại được, lọc được, không BOLA', async () => {
  // Staging rows are seeded directly: this test covers batch continuity, not the file parsers.
  // confirmJob checksums the stored source, so the private-import file has to exist on disk.
  fs.mkdirSync(path.join(uploadsDir, 'private-imports'), {recursive: true});
  fs.writeFileSync(path.join(uploadsDir, 'private-imports', 'v664.xlsx'), 'v664 fixture source');
  const job = (await db.query("INSERT INTO import_jobs(created_by,parser_type,source_name,source_path,status) VALUES($1,'.xlsx','v664-batch.xlsx','private-imports/v664.xlsx','preview') RETURNING *", [users.author])).rows[0];
  const itemIds = [];
  for (let i = 1; i <= 3; i++) {
    const draft = {
      subject_id: subjectId, topic_id: topicId, grade: 9, outcome_id: outcomeId, yccd_id: yccdId,
      type: 'multiple_choice', cognitive_level: 1, stem: 'Câu nhập lô V6.6.4 số ' + i,
      options: ['A', 'B', 'C', 'D'].map(id => ({id, text: 'Phương án ' + id})), answer: {correct: 'A'},
    };
    itemIds.push((await db.query("INSERT INTO import_items(job_id,sequence,draft,validation,duplicate_candidates,decision) VALUES($1,$2,$3,'{\"status\":\"VALID\",\"errors\":[],\"warnings\":[]}','[]','import') RETURNING id", [job.id, i, JSON.stringify(draft)])).rows[0].id);
  }

  const list = await req('GET', '/practice/imports', undefined, tokens.author);
  expect(list, 200);
  const listed = list.data.find(j => j.id === job.id);
  assert(listed, 'Tác giả phải mở lại được lần nhập của mình');
  assert.equal(listed.item_count, 3);

  const foreign = await req('GET', '/practice/imports', undefined, tokens.outsider);
  expect(foreign, 200);
  assert.equal(foreign.data.find(j => j.id === job.id), undefined, 'Người khác không được thấy lô nhập này');
  expect(await req('GET', '/practice/imports/' + job.id, undefined, tokens.outsider), 403);

  const confirmed = await req('POST', `/practice/imports/${job.id}/confirm`, {ids: itemIds, bank_id: bankId}, tokens.author);
  expect(confirmed, 200);
  assert.equal(confirmed.data.imported, 3);
  assert.equal(confirmed.data.job_id, job.id);
  assert.equal(confirmed.data.question_ids.length, 3);

  const filtered = await req('GET', '/practice/questions/queue?import_job_id=' + job.id, undefined, tokens.author);
  expect(filtered, 200);
  assert.equal(filtered.data.total, 3);
  assert.deepEqual(filtered.data.items.map(i => i.id).sort(), confirmed.data.question_ids.slice().sort());

  // Knowing the job id must not bypass content scope.
  const bola = await req('GET', '/practice/questions/queue?import_job_id=' + job.id, undefined, tokens.outsider);
  expect(bola, 200);
  assert.equal(bola.data.total, 0, 'Biết job id không được mở ra câu ngoài phạm vi');

  // The batch is immediately actionable as a unit, which is the point of keeping the context.
  const selection = await req('GET', '/practice/questions/selection-ids?import_job_id=' + job.id, undefined, tokens.author);
  expect(selection, 200);
  assert.equal(selection.data.total, 3);
  const submit = await req('POST', '/practice/questions/bulk-workflow', {ids: confirmed.data.question_ids, action: 'submit', expected_versions: selection.data.expected_versions}, tokens.author);
  expect(submit, 200);
  assert.equal(submit.data.applied, 3);
});
