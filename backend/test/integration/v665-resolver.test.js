// V6.6.5 — mã câu → Outcome/YCCĐ theo khối → Bài qua liên kết Bài–YCCĐ.
// Chạy trên bản sao dùng một lần của database làm việc; không đụng dữ liệu thật.
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

const name = 'nganhang_v665_test_' + Date.now();
const adminPool = new pg.Pool({host: process.env.DB_HOST, port: process.env.DB_PORT, database: source, user: process.env.DB_USER, password: process.env.DB_PASSWORD});
const artifacts = path.resolve('../artifacts');
fs.mkdirSync(artifacts, {recursive: true});
const dump = path.join(artifacts, 'v665-source.dump');
const env = {...process.env, PGHOST: process.env.DB_HOST, PGPORT: process.env.DB_PORT, PGUSER: process.env.DB_USER, PGPASSWORD: process.env.DB_PASSWORD};

const port = 3104, origin = 'http://127.0.0.1:' + port;
const pw = crypto.randomBytes(12).toString('base64url');
let db, server, uploadsDir;
const tokens = {}, users = {}, lessons = {}, yccds = {};
let subjectId, subjectCode, branchId, bankId, classId, yearId, departmentId;

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

const key = (grade, outcome, yccd) => `${subjectCode}:G${grade}:L:${outcome}` + (yccd ? ':' + yccd : '');

// Dựng đúng các fixture mapping đã được xác nhận trong audit (§19).
async function seedCurriculum(grade, outcomeOrdinal, title, yccdOrdinals) {
  const outcome = (await db.query(
    `INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document,status,
      source_branch_code,source_ordinal,canonical_key,source_text)
     VALUES($1,$2,'L',$3,$4,'V665','Fixture kiểm thử','ACTIVE','L',$5,$6,$4) RETURNING id`,
    [subjectId, grade, `L.${outcomeOrdinal}`, title, outcomeOrdinal, key(grade, outcomeOrdinal)])).rows[0];
  for (const ordinal of yccdOrdinals) {
    const row = (await db.query(
      `INSERT INTO curriculum_yccds(outcome_id,code,text,status,source_ordinal,canonical_key,source_text)
       VALUES($1,$2,$3,'ACTIVE',$4,$5,$3) RETURNING id`,
      [outcome.id, `L.${outcomeOrdinal}.${ordinal}`, `YCCĐ kiểm thử ${grade}/${outcomeOrdinal}/${ordinal}`, ordinal, key(grade, outcomeOrdinal, ordinal)])).rows[0];
    yccds[`${grade}.${outcomeOrdinal}.${ordinal}`] = row.id;
  }
  return outcome.id;
}

async function seedLesson(grade, label, yccdKeys) {
  const topic = (await db.query(
    "INSERT INTO topics(subject_id,grade,name,status,branch_id) VALUES($1,$2,$3,'ACTIVE',$4) RETURNING id",
    [subjectId, grade, label, branchId])).rows[0];
  for (const k of yccdKeys) {
    await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')", [topic.id, yccds[k]]);
  }
  lessons[label] = topic.id;
  return topic.id;
}

test.before(async () => {
  const d = spawnSync('pg_dump', ['-Fc', '-d', source, '-f', dump], {env, encoding: 'utf8'});
  assert.equal(d.status, 0, d.stderr);
  await adminPool.query('CREATE DATABASE ' + name);
  const restored = spawnSync('pg_restore', ['--no-owner', '--no-privileges', '-d', name, dump], {env, encoding: 'utf8'});
  assert.equal(restored.status, 0, restored.stderr);
  db = new pg.Pool({host: process.env.DB_HOST, port: process.env.DB_PORT, database: name, user: process.env.DB_USER, password: process.env.DB_PASSWORD});

  departmentId = (await db.query("INSERT INTO departments(code,name) VALUES('V665_DEP','Tổ kiểm thử V6.6.5') RETURNING id")).rows[0].id;
  subjectCode = 'V665KHTN';
  subjectId = (await db.query("INSERT INTO subjects(code,name,department_id,is_integrated) VALUES($1,'KHTN kiểm thử V6.6.5',$2,true) RETURNING id", [subjectCode, departmentId])).rows[0].id;
  // Mã phân môn nguồn là VL; hệ thống quy về L như quy ước hiện hành.
  branchId = (await db.query("INSERT INTO branches(subject_id,code,name) VALUES($1,'VL','Vật lí') RETURNING id", [subjectId])).rows[0].id;
  yearId = (await db.query("INSERT INTO school_years(name,start_date,end_date) VALUES('V665 kiểm thử',CURRENT_DATE-30,CURRENT_DATE+330) RETURNING id")).rows[0].id;
  classId = (await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('9A V665',9,$1) RETURNING id", [yearId])).rows[0].id;
  const class7 = (await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('7A V665',7,$1) RETURNING id", [yearId])).rows[0].id;
  bankId = (await db.query("INSERT INTO banks(name,kind,department_id) VALUES('Kho tổ V6.6.5','department',$1) RETURNING id", [departmentId])).rows[0].id;

  await seedCurriculum(7, 1, 'Tốc độ', [1, 2, 3]);
  await seedCurriculum(9, 1, 'Tốc độ khối 9 — trùng mã nghiệp vụ', [3]);
  await seedCurriculum(9, 2, 'Cơ năng, công và công suất', [1, 2, 3, 4]);
  await seedLesson(7, 'Bài 8. Tốc độ chuyển động', ['7.1.1', '7.1.2']);
  await seedLesson(7, 'Bài 9. Đo tốc độ', ['7.1.3']);
  await seedLesson(9, 'Bài 2. Động năng. Thế năng', ['9.2.1', '9.2.2']);
  await seedLesson(9, 'Bài 3. Cơ năng', ['9.2.3', '9.2.4']);

  const hash = await bcrypt.hash(pw, 10);
  for (const [key, username, role] of [['admin', 'v665_admin', 'admin'], ['author', 'v665_author', 'teacher']]) {
    users[key] = (await db.query('INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES($1,$2,$3,$4,false) RETURNING id', [username, hash, username, role])).rows[0].id;
  }

  uploadsDir = path.join(artifacts, 'v665-uploads-' + name);
  fs.cpSync(path.resolve(process.env.UPLOAD_DIR || 'uploads'), uploadsDir, {recursive: true, errorOnExist: true});
  const output = fs.openSync(path.join(artifacts, 'v665-server.log'), 'w');
  server = spawn(process.execPath, ['src/server.js'], {
    env: {...process.env, DB_NAME: name, UPLOAD_DIR: uploadsDir, PORT: String(port), HOST: '127.0.0.1'},
    stdio: ['ignore', output, output], windowsHide: true,
  });
  let ready = false;
  for (let i = 0; i < 240; i++) {
    if (server.exitCode !== null) throw new Error('Server exited: ' + fs.readFileSync(path.join(artifacts, 'v665-server.log'), 'utf8'));
    try { const r = await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1000)}); if (r.ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  assert(ready, 'Server not healthy: ' + fs.readFileSync(path.join(artifacts, 'v665-server.log'), 'utf8'));

  tokens.admin = await login('v665_admin');
  expect(await req('PUT', `/staff/${users.author}/assignments`, {
    school_year_id: yearId, positions: [],
    teaching: [{subject_id: subjectId, class_ids: [classId, class7]}],
    reason: 'Phân công kiểm thử V6.6.5',
  }), 200);
  expect(await req('POST', '/practice/bank-permissions', {bank_id: bankId, user_id: users.author, permission: 'write'}), 200);
  tokens.author = await login('v665_author');
});

test.after(async () => {
  server?.kill();
  await db?.end();
  await adminPool.end();
});

// Tạo một lần nhập staging với các mã câu cho trước, dùng đúng đường enrich của backend.
async function stageImport(codes, {grade, token = tokens.author, actor = users.author}) {
  fs.mkdirSync(path.join(uploadsDir, 'private-imports'), {recursive: true});
  const fileName = 'v665-' + crypto.randomUUID().slice(0, 8) + '.xlsx';
  fs.writeFileSync(path.join(uploadsDir, 'private-imports', fileName), 'v665 fixture');
  const job = (await db.query(
    "INSERT INTO import_jobs(created_by,parser_type,source_name,source_path,status) VALUES($1,'.xlsx',$2,$3,'preview') RETURNING *",
    [actor, fileName, 'private-imports/' + fileName])).rows[0];
  for (let i = 0; i < codes.length; i++) {
    const entry = typeof codes[i] === 'string' ? {code: codes[i]} : codes[i];
    // Nội dung dựng theo đúng hình thức ghi trong mã, trừ khi ca kiểm thử cố tình khai lệch.
    const form = /\.\s*(TN|ĐS|TLN|GN|TL)$/u.exec(entry.code)?.[1] || 'TN';
    const body = form === 'ĐS'
      ? {statements: ['a', 'b', 'c', 'd'].map(id => ({id, text: 'Nhận định ' + id})), answer: {values: {a: true, b: false, c: true, d: false}}}
      : form === 'TLN' ? {answer: {aliases: ['12']}}
      : form === 'GN' ? {left: [{id: 'A', text: 'Trái A'}], right: [{id: '1', text: 'Phải 1'}], answer: {pairs: {A: '1'}}}
      : form === 'TL' ? {answer: {reference: 'Gợi ý chấm'}}
      : {options: ['A', 'B', 'C', 'D'].map(id => ({id, text: 'Phương án ' + id})), answer: {correct: 'B'}};
    const draft = {
      display_code: entry.code, subject_id: subjectId, grade,
      stem: 'Nội dung kiểm thử ' + entry.code,
      explanation: 'Lời giải kỹ thuật cho kiểm thử hồi quy',
      ...body, ...(entry.override || {}),
    };
    await db.query("INSERT INTO import_items(job_id,sequence,draft,validation,duplicate_candidates,decision) VALUES($1,$2,$3,'{\"status\":\"VALID\",\"errors\":[],\"warnings\":[]}','[]','import')",
      [job.id, i + 1, JSON.stringify(draft)]);
  }
  // PUT chạy lại enrich cho toàn bộ dòng, nên đây chính là đường resolve thật.
  const saved = await req('PUT', `/practice/imports/${job.id}`, {items: [], bulk: {}, bulk_ids: []}, token);
  expect(saved, 200);
  const detail = await req('GET', `/practice/imports/${job.id}`, undefined, token);
  expect(detail, 200);
  return detail.data;
}

test('V665: cùng mã nghiệp vụ L.1.3 ở khối 7 và khối 9 resolve ra hai YCCĐ khác nhau', async () => {
  const g7 = await stageImport(['Câu L. 1. 3. NB. 1. TN'], {grade: 7});
  const g9 = await stageImport(['Câu L. 1. 3. NB. 1. TN'], {grade: 9});
  const y7 = g7.items[0].draft.yccd_id, y9 = g9.items[0].draft.yccd_id;
  assert.equal(y7, yccds['7.1.3']);
  assert.equal(y9, yccds['9.1.3']);
  assert.notEqual(y7, y9, 'Khối phải là một phần của khóa tra cứu');
});

test('V665: mã câu tự điền Outcome/YCCĐ và tự gắn Bài khi liên kết là duy nhất', async () => {
  const job = await stageImport(['Câu L. 2. 1. NB. 2. ĐS'], {grade: 9});
  const item = job.items[0];
  const r = item.validation.resolution;
  assert.equal(r.state, 'RESOLVED', JSON.stringify(item.validation));
  assert.equal(r.outcome, 'L.2');
  assert.equal(r.yccd, 'L.2.1');
  assert.equal(r.level, 'NB');
  assert.equal(r.form, 'ĐS');
  assert.equal(r.content_number, 2);
  assert.equal(r.lesson_status, 'AUTO_MAPPED');
  assert.equal(r.lesson.id, lessons['Bài 2. Động năng. Thế năng']);
  // Không cần người dùng chọn lại: bản nháp đã mang sẵn phân loại và Bài.
  assert.equal(item.draft.outcome_id > 0, true);
  assert.equal(item.draft.yccd_id, yccds['9.2.1']);
  assert.equal(item.draft.topic_id, lessons['Bài 2. Động năng. Thế năng']);
  assert.equal(item.draft.type, 'true_false');
  assert.equal(item.draft.cognitive_level, 1);
  assert.equal(item.validation.status, 'VALID');
});

test('V665: fixture mapping Bài–YCCĐ đã xác nhận vẫn đúng, và số Bài không quyết định Outcome', async () => {
  const cases = [
    ['Câu L. 1. 1. NB. 1. TN', 7, 'Bài 8. Tốc độ chuyển động'],
    ['Câu L. 1. 2. NB. 1. TN', 7, 'Bài 8. Tốc độ chuyển động'],
    ['Câu L. 1. 3. NB. 1. TN', 7, 'Bài 9. Đo tốc độ'],
    ['Câu L. 2. 2. NB. 1. TN', 9, 'Bài 2. Động năng. Thế năng'],
    ['Câu L. 2. 3. NB. 1. TN', 9, 'Bài 3. Cơ năng'],
    ['Câu L. 2. 4. NB. 1. TN', 9, 'Bài 3. Cơ năng'],
  ];
  for (const [code, grade, lesson] of cases) {
    const job = await stageImport([code], {grade});
    assert.equal(job.items[0].validation.resolution.lesson?.name, lesson, code);
  }
  // Outcome 2 nằm ở cả Bài 2 lẫn Bài 3 — "Bài N = Outcome N" là sai.
  assert.notEqual(lessons['Bài 2. Động năng. Thế năng'], lessons['Bài 3. Cơ năng']);
});

test('V665: YCCĐ chưa gắn Bài không chặn nhập; YCCĐ nhiều Bài thì không tự chọn', async () => {
  const unmappedYccd = yccds['9.1.3'];
  const solo = await stageImport(['Câu L. 1. 3. NB. 1. TN'], {grade: 9});
  const first = solo.items[0];
  assert.equal(first.draft.yccd_id, unmappedYccd);
  assert.equal(first.validation.resolution.lesson_status, 'UNMAPPED');
  assert.equal(first.validation.status !== 'ERROR', true, 'Chưa gắn Bài không được chặn nhập');
  assert.equal(first.draft.topic_id ?? null, null);

  // Gắn cùng YCCĐ vào bài thứ hai ⇒ trở thành mơ hồ, hệ thống không được đoán.
  await seedLesson(9, 'Bài 1. Tốc độ khối 9', ['9.1.3']);
  await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')",
    [lessons['Bài 2. Động năng. Thế năng'], unmappedYccd]);
  const many = await stageImport(['Câu L. 1. 3. NB. 1. TN'], {grade: 9});
  const item = many.items[0];
  assert.equal(item.validation.resolution.lesson_status, 'AMBIGUOUS');
  assert.equal(item.draft.topic_id ?? null, null, 'Nhiều Bài thì không được tự chọn');
  assert.equal(item.validation.resolution.lesson_candidates.length, 2);
  assert.equal(item.validation.status, 'NEEDS_REVIEW');
});

test('V665: mã đúng cú pháp nhưng chuẩn không tồn tại thì bị chặn, không tự tạo chương trình', async () => {
  const before = (await db.query('SELECT count(*)::int n FROM curriculum_outcomes WHERE subject_id=$1', [subjectId])).rows[0].n;
  const job = await stageImport(['Câu L. 9. 9. NB. 1. TN'], {grade: 9});
  const item = job.items[0];
  assert.equal(item.validation.status, 'ERROR');
  assert.equal(item.validation.resolution.state, 'BLOCKED');
  assert.equal(item.validation.resolution.error, 'OUTCOME_NOT_FOUND');
  assert.equal((await db.query('SELECT count(*)::int n FROM curriculum_outcomes WHERE subject_id=$1', [subjectId])).rows[0].n, before);
});

test('V665: mã và metadata lệch nhau thì báo cho người dùng chọn, không tự ghi đè', async () => {
  // Mã ghi ĐS nhưng người nhập khai là trắc nghiệm, và mã ghi NB nhưng metadata ghi VD.
  const job = await stageImport([{code: 'Câu L. 2. 1. NB. 9. ĐS', override: {type: 'multiple_choice', cognitive_level: 3, options: ['A', 'B', 'C', 'D'].map(id => ({id, text: id})), answer: {correct: 'A'}}}], {grade: 9});
  const item = job.items[0];
  const fields = item.validation.resolution.conflicts.map(c => c.field);
  assert.equal(fields.includes('type'), true, JSON.stringify(item.validation.resolution.conflicts));
  assert.equal(fields.includes('cognitive_level'), true);
  // V6.6.5.2 §50 — xung đột mã–phân loại chưa xử lý là lỗi chặn; người dùng chọn "Theo mã" hoặc sửa mã.
  assert.equal(item.validation.status, 'ERROR');
  assert.equal(item.validation.issues.some(i => i.code === 'CODE_METADATA_CONFLICT' && i.severity === 'blocking'), true);
  // Thông báo cho người đọc: nhãn nghiệp vụ, không lộ id nội bộ.
  assert.equal(item.validation.errors.some(e => /#\d+/.test(e)), false, JSON.stringify(item.validation.errors));
  // Giá trị người dùng khai vẫn giữ nguyên: hệ thống không chọn hộ bên nào.
  assert.equal(item.draft.type, 'multiple_choice');
  assert.equal(item.draft.cognitive_level, 3);
});

test('V665: mã viết liền kiểu cũ vẫn đọc được, được chuẩn hóa và có cảnh báo', async () => {
  const job = await stageImport(['Câu.L.2.2.TH.3.TN'], {grade: 9});
  const item = job.items[0];
  assert.equal(item.draft.display_code, 'Câu L. 2. 2. TH. 3. TN');
  assert.equal(item.validation.warnings.some(w => /chuẩn hóa|viết liền/i.test(w)), true, JSON.stringify(item.validation.warnings));
  assert.equal(item.draft.yccd_id, yccds['9.2.2']);
});

test('V665: nhập kho giữ số đơn vị kiến thức và trạng thái gắn Bài, rồi gán Bài hàng loạt được', async () => {
  const job = await stageImport(['Câu L. 2. 1. NB. 4. TN', 'Câu L. 1. 3. NB. 5. TN'], {grade: 9});
  const ids = job.items.map(i => i.id);
  const confirmed = await req('POST', `/practice/imports/${job.id}/confirm`, {ids, bank_id: bankId}, tokens.author);
  expect(confirmed, 200);
  assert.equal(confirmed.data.imported, 2);

  const rows = (await db.query('SELECT id,content_number,lesson_status,topic_id FROM questions WHERE id=ANY($1::int[]) ORDER BY content_number', [confirmed.data.question_ids])).rows;
  assert.deepEqual(rows.map(r => r.content_number), [4, 5]);
  assert.equal(rows[0].lesson_status, 'AUTO_MAPPED');
  assert.equal(rows[0].topic_id, lessons['Bài 2. Động năng. Thế năng']);
  assert.equal(rows[1].topic_id ?? null, null);

  // Lọc "chưa gắn Bài" phải tìm đúng câu còn thiếu.
  const queue = await req('GET', `/practice/questions/queue?import_job_id=${job.id}&lesson_status=UNASSIGNED`, undefined, tokens.author);
  expect(queue, 200);
  assert.equal(queue.data.total, 1);
  assert.equal(queue.data.items[0].id, rows[1].id);

  const options = await req('POST', '/practice/questions/lesson-options', {ids: [rows[1].id]}, tokens.author);
  expect(options, 200);
  assert.equal(options.data.groups[0].status, 'AMBIGUOUS');
  const target = options.data.groups[0].candidates[0].id;
  const assigned = await req('POST', '/practice/questions/assign-lesson', {
    assignments: [{question_ids: [rows[1].id], topic_id: target}], reason: 'Gán Bài trong kiểm thử',
  }, tokens.author);
  expect(assigned, 200);
  assert.equal((await db.query('SELECT topic_id,lesson_status FROM questions WHERE id=$1', [rows[1].id])).rows[0].topic_id, target);
});

test('V665: không gán được Bài chưa liên kết với YCCĐ của câu', async () => {
  const job = await stageImport(['Câu L. 2. 4. NB. 6. TN'], {grade: 9});
  const confirmed = await req('POST', `/practice/imports/${job.id}/confirm`, {ids: job.items.map(i => i.id), bank_id: bankId}, tokens.author);
  expect(confirmed, 200);
  const id = confirmed.data.question_ids[0];
  const before = (await db.query('SELECT topic_id FROM questions WHERE id=$1', [id])).rows[0].topic_id;
  const r = await req('POST', '/practice/questions/assign-lesson', {
    assignments: [{question_ids: [id], topic_id: lessons['Bài 8. Tốc độ chuyển động']}], reason: 'Thử gán sai bài',
  }, tokens.author);
  expect(r, 409);
  assert.equal(r.data.details.blocked[0].reason_code, 'LESSON_NOT_LINKED');
  assert.equal((await db.query('SELECT topic_id FROM questions WHERE id=$1', [id])).rows[0].topic_id, before);
});

test('V665: danh sách người biên soạn lấy theo phạm vi, không theo trang đang xem', async () => {
  const r = await req('GET', `/practice/questions/author-options?subject_id=${subjectId}`, undefined, tokens.author);
  expect(r, 200);
  assert.equal(Array.isArray(r.data), true);
  assert.equal(r.data.some(a => a.id === users.author), true, 'Tác giả đã nhập câu phải xuất hiện');
});
