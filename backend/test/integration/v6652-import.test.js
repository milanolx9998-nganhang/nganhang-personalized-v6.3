// V6.6.5.2 — nhập Word thông minh: chỉ cần Môn + Khối + tệp; mã câu tự nhận Outcome/YCCĐ/Bài; tùy chọn
// thêm chỉ để đối chiếu; lỗi chặn / cần xem / thông báo tách bạch; lý do trả sửa có cấu trúc.
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
import AdmZip from 'adm-zip';
import {seedLessons} from '../../src/services/curriculumMaster/lessonSeed.js';

const source = process.env.DB_NAME;
if (!source?.startsWith('nganhang_personalized')) throw new Error('Integration tests require an isolated personalized database');

const name = 'nganhang_v6652_test_' + Date.now();
const adminPool = new pg.Pool({host: process.env.DB_HOST, port: process.env.DB_PORT, database: source, user: process.env.DB_USER, password: process.env.DB_PASSWORD});
const artifacts = path.resolve('../artifacts');
fs.mkdirSync(artifacts, {recursive: true});
const dump = path.join(artifacts, 'v6652-source.dump');
const env = {...process.env, PGHOST: process.env.DB_HOST, PGPORT: process.env.DB_PORT, PGUSER: process.env.DB_USER, PGPASSWORD: process.env.DB_PASSWORD};

const port = 3107, origin = 'http://127.0.0.1:' + port;
const pw = crypto.randomBytes(12).toString('base64url');
let db, server, uploadsDir;
const tokens = {}, users = {}, lessons = {}, yccds = {}, outcomes = {};
let subjectId, subjectCode, branchId, chemBranchId, bankId, classId, yearId, departmentId;

async function req(method, url, body, token = tokens.admin) {
  const multipart = body instanceof FormData;
  const res = await fetch(origin + '/api' + url, {
    method,
    headers: {...(token ? {Authorization: 'Bearer ' + token} : {}), ...(body !== undefined && !multipart ? {'Content-Type': 'application/json'} : {})},
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return {status: res.status, data};
}
const expect = (r, s) => assert.equal(r.status, s, typeof r.data === 'string' ? r.data : JSON.stringify(r.data));
const login = async username => { const r = await req('POST', '/auth/login', {username, password: pw}, null); expect(r, 200); return r.data.token; };

const key = (grade, branch, outcome, yccd) => `${subjectCode}:G${grade}:${branch}:${outcome}` + (yccd ? ':' + yccd : '');
async function seedCurriculum(grade, outcomeOrdinal, title, yccdOrdinals, branch = 'L') {
  const outcome = (await db.query(
    `INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document,status,
      source_branch_code,source_ordinal,canonical_key,source_text)
     VALUES($1,$2,$7,$3,$4,'V6652','Fixture kiểm thử','ACTIVE',$7,$5,$6,$4) RETURNING id`,
    [subjectId, grade, `${branch}.${outcomeOrdinal}`, title, outcomeOrdinal, key(grade, branch, outcomeOrdinal), branch])).rows[0];
  outcomes[`${grade}.${branch}.${outcomeOrdinal}`] = outcome.id;
  for (const ordinal of yccdOrdinals) {
    const row = (await db.query(
      `INSERT INTO curriculum_yccds(outcome_id,code,text,status,source_ordinal,canonical_key,source_text)
       VALUES($1,$2,$3,'ACTIVE',$4,$5,$3) RETURNING id`,
      [outcome.id, `${branch}.${outcomeOrdinal}.${ordinal}`, `YCCĐ kiểm thử ${grade}/${branch}${outcomeOrdinal}/${ordinal}`, ordinal, key(grade, branch, outcomeOrdinal, ordinal)])).rows[0];
    yccds[`${grade}.${branch}.${outcomeOrdinal}.${ordinal}`] = row.id;
  }
}
async function seedLesson(grade, label, yccdKeys) {
  const topic = (await db.query("INSERT INTO topics(subject_id,grade,name,status,branch_id) VALUES($1,$2,$3,'ACTIVE',$4) RETURNING id", [subjectId, grade, label, branchId])).rows[0];
  for (const k of yccdKeys) await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')", [topic.id, yccds[k]]);
  lessons[label] = topic.id;
}

// Tệp Word tối giản nhưng đúng cấu trúc: mỗi câu = dòng mã + nội dung + 4 phương án + đáp án + lời giải.
const para = text => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
function wordFile(questions, header = []) {
  const lines = [...header];
  for (const q of questions) {
    const [code, extra = {}] = Array.isArray(q) ? q : [q];
    lines.push(code, extra.stem || 'Nội dung kiểm thử ' + crypto.randomUUID().slice(0, 8), 'A. Một', 'B. Hai', 'C. Ba', 'D. Bốn', 'Đáp án: B', 'Lời giải: Giải thích kỹ thuật cho kiểm thử.');
  }
  const zip = new AdmZip();
  zip.addFile('word/document.xml', Buffer.from(`<w:document xmlns:w="w"><w:body>${lines.map(para).join('')}</w:body></w:document>`));
  return zip.toBuffer();
}
async function uploadWord(questions, metadata, {header = [], token = tokens.author} = {}) {
  const form = new FormData();
  form.append('file', new Blob([wordFile(questions, header)]), 'v6652-' + crypto.randomUUID().slice(0, 6) + '.docx');
  form.append('metadata', JSON.stringify(metadata));
  const r = await req('POST', '/practice/imports', form, token);
  expect(r, 201);
  const job = await req('GET', '/practice/imports/' + r.data.id, undefined, token);
  expect(job, 200);
  return job.data;
}
const codes = item => item.validation.issues.map(i => i.code);

test.before(async () => {
  const d = spawnSync('pg_dump', ['-Fc', '-d', source, '-f', dump], {env, encoding: 'utf8'});
  assert.equal(d.status, 0, d.stderr);
  await adminPool.query('CREATE DATABASE ' + name);
  const restored = spawnSync('pg_restore', ['--no-owner', '--no-privileges', '-d', name, dump], {env, encoding: 'utf8'});
  assert.equal(restored.status, 0, restored.stderr);
  db = new pg.Pool({host: process.env.DB_HOST, port: process.env.DB_PORT, database: name, user: process.env.DB_USER, password: process.env.DB_PASSWORD});

  departmentId = (await db.query("INSERT INTO departments(code,name) VALUES('V6652_DEP','Tổ kiểm thử V6.6.5.2') RETURNING id")).rows[0].id;
  subjectCode = 'V6652KHTN';
  subjectId = (await db.query("INSERT INTO subjects(code,name,department_id,is_integrated) VALUES($1,'KHTN kiểm thử V6.6.5.2',$2,true) RETURNING id", [subjectCode, departmentId])).rows[0].id;
  branchId = (await db.query("INSERT INTO branches(subject_id,code,name) VALUES($1,'VL','Vật lí') RETURNING id", [subjectId])).rows[0].id;
  chemBranchId = (await db.query("INSERT INTO branches(subject_id,code,name) VALUES($1,'HH','Hóa học') RETURNING id", [subjectId])).rows[0].id;
  yearId = (await db.query("INSERT INTO school_years(name,start_date,end_date) VALUES('V6652 kiểm thử',CURRENT_DATE-30,CURRENT_DATE+330) RETURNING id")).rows[0].id;
  classId = (await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('7A V6652',7,$1) RETURNING id", [yearId])).rows[0].id;
  const class9 = (await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('9A V6652',9,$1) RETURNING id", [yearId])).rows[0].id;
  bankId = (await db.query("INSERT INTO banks(name,kind,department_id) VALUES('Kho tổ V6.6.5.2','department',$1) RETURNING id", [departmentId])).rows[0].id;

  // Khối 7: L.1 Tốc độ (Bài 8: YCCĐ 1–2, Bài 9: YCCĐ 3). Khối 9: L.2 có 4 YCCĐ; Hóa (H) chưa có Bài nào.
  await seedCurriculum(7, 1, 'Tốc độ', [1, 2, 3]);
  await seedCurriculum(9, 2, 'Cơ năng', [1, 2, 3, 4]);
  await seedCurriculum(9, 1, 'Nguyên tử', [1], 'H');
  await seedLesson(7, 'Bài 8. Tốc độ chuyển động', ['7.L.1.1', '7.L.1.2']);
  await seedLesson(7, 'Bài 9. Đo tốc độ', ['7.L.1.3']);
  await seedLesson(9, 'Bài 3. Cơ năng', ['9.L.2.1', '9.L.2.2', '9.L.2.3', '9.L.2.4']);

  const hash = await bcrypt.hash(pw, 10);
  for (const [k, username, role] of [['admin', 'v6652_admin', 'admin'], ['author', 'v6652_author', 'teacher']]) {
    users[k] = (await db.query('INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES($1,$2,$3,$4,false) RETURNING id', [username, hash, username, role])).rows[0].id;
  }

  uploadsDir = path.join(artifacts, 'v6652-uploads-' + name);
  fs.cpSync(path.resolve(process.env.UPLOAD_DIR || 'uploads'), uploadsDir, {recursive: true, errorOnExist: true});
  const output = fs.openSync(path.join(artifacts, 'v6652-server.log'), 'w');
  server = spawn(process.execPath, ['src/server.js'], {
    env: {...process.env, DB_NAME: name, UPLOAD_DIR: uploadsDir, PORT: String(port), HOST: '127.0.0.1'},
    stdio: ['ignore', output, output], windowsHide: true,
  });
  let ready = false;
  for (let i = 0; i < 240; i++) {
    if (server.exitCode !== null) throw new Error('Server exited: ' + fs.readFileSync(path.join(artifacts, 'v6652-server.log'), 'utf8'));
    try { const r = await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1000)}); if (r.ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  assert(ready, 'Server not healthy');

  tokens.admin = await login('v6652_admin');
  expect(await req('PUT', `/staff/${users.author}/assignments`, {
    school_year_id: yearId, positions: [],
    teaching: [{subject_id: subjectId, class_ids: [classId, class9]}],
    reason: 'Phân công kiểm thử V6.6.5.2',
  }), 200);
  expect(await req('POST', '/practice/bank-permissions', {bank_id: bankId, user_id: users.author, permission: 'write'}), 200);
  tokens.author = await login('v6652_author');
});

test.after(async () => {
  server?.kill();
  await db?.end();
  await adminPool.end();
});

test('V6652: chỉ Môn + Khối + tệp Word — mã tự ra Outcome/YCCĐ và tự gắn Bài', async () => {
  const job = await uploadWord(['Câu L. 1. 3. NB. 1. TN'], {subject_id: subjectId, grade: 7});
  const [item] = job.items;
  assert.equal(item.validation.category, 'AUTO_RESOLVED', JSON.stringify(item.validation));
  assert.equal(item.validation.status, 'VALID');
  assert.equal(item.draft.yccd_id, yccds['7.L.1.3']);
  assert.equal(item.draft.topic_id, lessons['Bài 9. Đo tốc độ']);
  assert.equal(item.validation.resolution.lesson.name, 'Bài 9. Đo tốc độ');
  // Ngữ cảnh phiên được lưu để mở lại đúng như lúc nhập.
  assert.equal(job.context.subject_id, subjectId);
  assert.equal(job.context.grade, 7);
  const list = await req('GET', '/practice/imports', undefined, tokens.author);
  expect(list, 200);
  const row = list.data.find(j => j.id === job.id);
  assert.equal(row.grade, 7);
  assert.equal(row.subject_name, 'KHTN kiểm thử V6.6.5.2');
});

test('V6652: tùy chọn thêm lệch với mã chỉ cảnh báo, không ghi đè; bỏ tùy chọn thì hết cảnh báo', async () => {
  const job = await uploadWord(['Câu L. 1. 3. NB. 1. TN'], {
    subject_id: subjectId, grade: 7, expectations: {topic_id: lessons['Bài 8. Tốc độ chuyển động'], branch_code: 'H', cognitive_level: 3},
  });
  const [item] = job.items;
  assert.deepEqual(['OPTIONAL_LESSON_MISMATCH', 'OPTIONAL_BRANCH_MISMATCH', 'OPTIONAL_LEVEL_MISMATCH'].filter(c => codes(item).includes(c)).length, 3, JSON.stringify(item.validation.issues));
  assert.equal(item.validation.status, 'NEEDS_REVIEW');
  assert.equal(item.draft.topic_id, lessons['Bài 9. Đo tốc độ'], 'Bài theo mã giữ nguyên, không bị Bài đã chọn đè lên');
  assert.equal(item.draft.cognitive_level, 1, 'Mức theo mã giữ nguyên');

  // "Giữ theo mã" cho riêng câu này: cảnh báo cần-xem được xác nhận.
  expect(await req('PUT', '/practice/imports/' + job.id, {items: [{id: item.id, draft: {ack_codes: ['OPTIONAL_LESSON_MISMATCH']}}]}, tokens.author), 200);
  let again = (await req('GET', '/practice/imports/' + job.id, undefined, tokens.author)).data.items[0];
  assert.equal(codes(again).includes('OPTIONAL_LESSON_MISMATCH'), false);
  assert.equal(codes(again).includes('OPTIONAL_BRANCH_MISMATCH'), true);

  // "Hủy chọn tùy chọn": kiểm lại cả lô với kỳ vọng trống.
  expect(await req('PUT', '/practice/imports/' + job.id, {expectations: {}}, tokens.author), 200);
  const cleared = (await req('GET', '/practice/imports/' + job.id, undefined, tokens.author)).data;
  assert.deepEqual(cleared.context.expectations, {});
  assert.equal(cleared.items[0].validation.status, 'VALID', JSON.stringify(cleared.items[0].validation.issues));
});

test('V6652: câu không có mã dùng tùy chọn thêm làm giá trị dự phòng, không bị gọi là "tự nhận diện"', async () => {
  const job = await uploadWord(['Câu 1. Tính tốc độ'], {subject_id: subjectId, grade: 7, expectations: {topic_id: lessons['Bài 8. Tốc độ chuyển động'], cognitive_level: 2}});
  const [item] = job.items;
  assert.equal(item.draft.topic_id, lessons['Bài 8. Tốc độ chuyển động']);
  assert.equal(item.draft.cognitive_level, 2);
  assert.notEqual(item.validation.category, 'AUTO_RESOLVED');
  assert.equal(codes(item).includes('INVALID_CODE'), false, '"Câu 1." là đánh số thường, không phải mã sai');
});

test('V6652: mã hiện hành viết sai bị chặn và không xác nhận được', async () => {
  const job = await uploadWord(['Câu L. 1. X. NB. 1. TN'], {subject_id: subjectId, grade: 7});
  const [item] = job.items;
  assert.equal(item.validation.status, 'ERROR');
  assert.equal(codes(item).includes('INVALID_CODE'), true);
  assert.equal(item.validation.issues.find(i => i.code === 'INVALID_CODE').severity, 'blocking');
  const confirmed = await req('POST', `/practice/imports/${job.id}/confirm`, {ids: [item.id], bank_id: bankId}, tokens.author);
  assert.equal(confirmed.status, 400, JSON.stringify(confirmed.data));
});

test('V6652: xung đột mã–phân loại là lỗi chặn; "Theo mã" gỡ được', async () => {
  const job = await uploadWord(['Câu L. 1. 1. NB. 1. TN'], {subject_id: subjectId, grade: 7});
  const [item] = job.items;
  expect(await req('PUT', '/practice/imports/' + job.id, {items: [{id: item.id, draft: {cognitive_level: 3}}]}, tokens.author), 200);
  let current = (await req('GET', '/practice/imports/' + job.id, undefined, tokens.author)).data.items[0];
  assert.equal(current.validation.status, 'ERROR');
  const conflict = current.validation.issues.find(i => i.code === 'CODE_METADATA_CONFLICT');
  assert.equal(conflict.field, 'cognitive_level');
  assert.match(conflict.message, /NB/);
  assert.match(conflict.message, /VD/);
  // Theo mã: áp bộ giá trị theo mã mà máy chủ trả về.
  expect(await req('PUT', '/practice/imports/' + job.id, {items: [{id: item.id, draft: current.validation.resolution.code_values}]}, tokens.author), 200);
  current = (await req('GET', '/practice/imports/' + job.id, undefined, tokens.author)).data.items[0];
  assert.equal(current.validation.status, 'VALID', JSON.stringify(current.validation.issues));
  assert.equal(current.draft.cognitive_level, 1);
});

test('V6652: YCCĐ đã ngừng dùng chỉ báo chuẩn thay thế đã khai, không tự chuyển', async () => {
  const retired = (await db.query(
    `INSERT INTO curriculum_yccds(outcome_id,code,text,status,source_ordinal,canonical_key,source_text,superseded_by)
     VALUES($1,'L.2.5','YCCĐ cũ đã thay','RETIRED',5,$2,'YCCĐ cũ đã thay',$3) RETURNING id`,
    [outcomes['9.L.2'], key(9, 'L', 2, 5), yccds['9.L.2.4']])).rows[0];
  assert(retired.id);
  const job = await uploadWord(['Câu L. 2. 5. NB. 1. TN'], {subject_id: subjectId, grade: 9});
  const [item] = job.items;
  assert.equal(item.validation.status, 'ERROR');
  const issue = item.validation.issues.find(i => i.code === 'CURRICULUM_RETIRED');
  assert(issue, JSON.stringify(item.validation.issues));
  assert.equal(issue.replacement.label, 'L.2.4');
  assert.equal(item.draft.yccd_id ?? null, null, 'Không tự chuyển sang chuẩn thay thế');
});

test('V6652: phân môn chưa có dữ liệu Bài báo đúng là thiếu dữ liệu nền', async () => {
  const job = await uploadWord(['Câu H. 1. 1. NB. 1. TN'], {subject_id: subjectId, grade: 9});
  const [item] = job.items;
  assert.equal(item.validation.status, 'NEEDS_REVIEW');
  const issue = item.validation.issues.find(i => i.code === 'LESSON_UNMAPPED');
  assert.match(issue.message, /chưa có dữ liệu Bài/);
  assert.equal(item.validation.resolution.master_data_missing, true);
});

test('V6652: lô có câu không mã — chế độ đánh số chỉ gắn cho câu có mã', async () => {
  const job = await uploadWord(['Câu L. 1. 1. NB. 1. TN', 'Câu L. 1. 1. NB. 2. TN', 'Câu 3. Câu không mã'],
    {subject_id: subjectId, grade: 7, expectations: {cognitive_level: 1}});
  assert.equal(job.numbering.coded, 2);
  assert.equal(job.numbering.issues.some(i => i.code === 'PARTIAL_CODE_COVERAGE'), true);
  assert.equal(job.warnings.some(w => w.code === 'PARTIAL_CODE_COVERAGE'), true);
  const ids = job.items.filter(i => i.validation.status !== 'ERROR').map(i => i.id);
  const confirmed = await req('POST', `/practice/imports/${job.id}/confirm`, {ids}, tokens.author);
  expect(confirmed, 200);
  const rows = (await db.query("SELECT normalized_content->>'display_code' dc,numbering_mode,bank_id FROM questions WHERE id=ANY($1::int[]) ORDER BY id", [confirmed.data.question_ids])).rows;
  const uncoded = rows.find(r => !/^Câu L\./.test(r.dc || ''));
  assert(uncoded, JSON.stringify(rows));
  assert.equal(uncoded.numbering_mode, null, 'Câu không mã không nhận chế độ đánh số của câu khác');
  assert.equal(rows.filter(r => /^Câu L\./.test(r.dc)).every(r => r.numbering_mode), true);
});

test('V6652: kho đích chọn trong tùy chọn thêm được dùng khi xác nhận', async () => {
  const job = await uploadWord(['Câu L. 1. 2. NB. 7. TN'], {subject_id: subjectId, grade: 7, bank_id: bankId});
  const confirmed = await req('POST', `/practice/imports/${job.id}/confirm`, {ids: job.items.map(i => i.id)}, tokens.author);
  expect(confirmed, 200);
  assert.equal((await db.query('SELECT bank_id FROM questions WHERE id=$1', [confirmed.data.question_ids[0]])).rows[0].bank_id, bankId);
});

// Giới hạn tải tệp là 10 lần/phút cho mỗi người dùng (bảo vệ thật, không nới cho kiểm thử), nên các
// ca sau tải bằng tài khoản quản trị.
test('V6652: hàng đợi có dải kiểm tra máy và bộ lọc ngoại lệ, không lộ đáp án', async () => {
  const job = await uploadWord(['Câu L. 2. 1. NB. 1. TN', 'Câu H. 1. 1. NB. 2. TN'], {subject_id: subjectId, grade: 9, bank_id: bankId}, {token: tokens.admin});
  const confirmed = await req('POST', `/practice/imports/${job.id}/confirm`, {ids: job.items.map(i => i.id)}, tokens.admin);
  expect(confirmed, 200);
  const queue = await req('GET', `/practice/questions/queue?import_job_id=${job.id}`, undefined, tokens.admin);
  expect(queue, 200);
  for (const row of queue.data.items) {
    assert.equal(typeof row.checks.lesson, 'boolean');
    assert.equal(row.checks.code, true, 'Mã khớp phân loại');
    assert.equal(row.checks.answer, true);
    assert.equal('answer' in row || 'answer_key' in row, false, 'Hàng đợi không bao giờ chứa đáp án');
  }
  const noLesson = await req('GET', `/practice/questions/queue?import_job_id=${job.id}&exception=lesson`, undefined, tokens.admin);
  expect(noLesson, 200);
  assert.equal(noLesson.data.total, 1);
  const clean = await req('GET', `/practice/questions/queue?import_job_id=${job.id}&exception=clean`, undefined, tokens.admin);
  assert.equal(clean.data.total, 1);
  const subset = await req('GET', `/practice/questions/queue?ids=${confirmed.data.question_ids[0]}`, undefined, tokens.admin);
  assert.equal(subset.data.total, 1);
  expect(await req('GET', '/practice/questions/queue?exception=bogus', undefined, tokens.author), 400);
});

test('V6652: lưu câu — mã lệch phân loại thì 409 kèm mã đề xuất; tạo tay thì sinh mã chuẩn', async () => {
  const job = await uploadWord(['Câu L. 2. 3. NB. 1. TN'], {subject_id: subjectId, grade: 9, bank_id: bankId}, {token: tokens.admin});
  const confirmed = await req('POST', `/practice/imports/${job.id}/confirm`, {ids: job.items.map(i => i.id)}, tokens.admin);
  expect(confirmed, 200);
  const id = confirmed.data.question_ids[0];
  const content = (await db.query('SELECT normalized_content FROM questions WHERE id=$1', [id])).rows[0].normalized_content;
  const conflict = await req('PUT', '/practice/questions/' + id, {...content, cognitive_level: 3}, tokens.admin);
  expect(conflict, 409);
  assert.equal(conflict.data.details.code, 'CODE_METADATA_CONFLICT');
  assert.equal(conflict.data.details.suggested_code, 'Câu L. 2. 3. VD. 1. TN');
  const regenerated = await req('PUT', '/practice/questions/' + id, {...content, cognitive_level: 3, regenerate_code: true}, tokens.admin);
  expect(regenerated, 200);
  const saved = (await db.query('SELECT normalized_content FROM questions WHERE id=$1', [id])).rows[0].normalized_content;
  assert.equal(saved.display_code, 'Câu L. 2. 3. VD. 1. TN');
  assert.equal('regenerate_code' in saved, false);

  const created = await req('POST', '/practice/questions', {
    subject_id: subjectId, grade: 9, branch_id: branchId, outcome_id: outcomes['9.L.2'], yccd_id: yccds['9.L.2.2'], topic_id: lessons['Bài 3. Cơ năng'],
    cognitive_level: 2, type: 'multiple_choice', content_number: 3, stem: 'Câu tạo tay', bank_id: bankId,
    options: ['A', 'B', 'C', 'D'].map(k => ({id: k, text: 'PA ' + k})), answer: {correct: 'C'}, explanation: 'Lời giải tạo tay',
  }, tokens.admin);
  expect(created, 201);
  const manual = (await db.query('SELECT normalized_content,content_number FROM questions WHERE id=$1', [created.data.id])).rows[0];
  assert.equal(manual.normalized_content.display_code, 'Câu L. 2. 2. TH. 3. TN');
  assert.equal(manual.content_number, 3);
});

test('V6652: trả sửa với mã lý do có cấu trúc được kiểm và ghi vào nhật ký', async () => {
  const job = await uploadWord(['Câu L. 2. 4. NB. 1. TN'], {subject_id: subjectId, grade: 9, bank_id: bankId}, {token: tokens.admin});
  const confirmed = await req('POST', `/practice/imports/${job.id}/confirm`, {ids: job.items.map(i => i.id)}, tokens.admin);
  expect(confirmed, 200);
  const id = confirmed.data.question_ids[0];
  expect(await req('POST', '/practice/questions/bulk-workflow', {ids: [id], action: 'submit'}, tokens.author), 200);
  const bad = await req('POST', '/practice/questions/bulk-workflow', {ids: [id], action: 'request_changes', reason_codes: ['NOT_A_REASON']});
  assert.equal(bad.status, 400, JSON.stringify(bad.data));
  const ok = await req('POST', '/practice/questions/bulk-workflow', {ids: [id], action: 'request_changes', reason_codes: ['LEVEL_MISMATCH', 'WEAK_DISTRACTORS']});
  expect(ok, 200);
  const audit = (await db.query("SELECT details FROM practice_audit WHERE action='QUESTION_VERSION_REQUEST_CHANGES' AND entity_id=$1 ORDER BY id DESC LIMIT 1", [String(id)])).rows[0];
  assert.deepEqual(audit.details.reason_codes, ['LEVEL_MISMATCH', 'WEAK_DISTRACTORS']);
  const batch = (await db.query("SELECT details FROM practice_audit WHERE action='QUESTION_BULK_WORKFLOW' ORDER BY id DESC LIMIT 1")).rows[0];
  assert.deepEqual(batch.details.reason_codes, ['LEVEL_MISMATCH', 'WEAK_DISTRACTORS']);
});

test('V6652: sức khỏe dữ liệu nền chỉ ra phân môn chưa có Bài và thiếu bản PUBLISHED', async () => {
  const r = await req('GET', '/curriculum/health?subject_id=' + subjectId);
  expect(r, 200);
  const g9 = r.data.items.find(i => i.grade === 9);
  assert.equal(g9.issues.some(i => i.code === 'NO_PUBLISHED_VERSION'), true);
  assert.equal(g9.issues.some(i => i.code === 'NO_LESSON_LINKS' && i.branch === 'H'), true);
  assert.equal(g9.branches.find(b => b.branch === 'L').yccd_unmapped, 0);
});

test('V6652 seed: chỉ liên kết vào bản PUBLISHED mới nhất; nguyên văn trùng thì dừng', async () => {
  const code = 'V6652SEED';
  const sid = (await db.query("INSERT INTO subjects(code,name,department_id,is_integrated) VALUES($1,'Môn seed V6652',$2,true) RETURNING id", [code, departmentId])).rows[0].id;
  const bid = (await db.query("INSERT INTO branches(subject_id,code,name) VALUES($1,'VL','Vật lí') RETURNING id", [sid])).rows[0].id;
  const TEXT = 'Nêu được ý nghĩa vật lí của tốc độ';
  const data = {subject_code: code, grade: 7, branch_code: 'L', source: 'kiểm thử', curriculum: 'kiểm thử',
    lessons: [{name: 'Bài 1. Seed', chapter: 'Chương 1', lesson_no: 1, yccd: [{stt: 1, text: TEXT}]}]};
  const run = (opts = {}) => (async () => {
    const client = await db.connect();
    try { await client.query('BEGIN'); const out = await seedLessons(client, data, opts); await client.query('COMMIT'); return out; }
    catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  })();

  // Chỉ có dữ liệu cũ chưa gắn phiên bản: mặc định dừng; cho phép tường minh thì chạy.
  const legacy = (await db.query(`INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document,status,source_branch_code,source_ordinal)
    VALUES($1,7,'L','L.1','Legacy','LEGACY','Fixture','ACTIVE','L',1) RETURNING id`, [sid])).rows[0].id;
  const legacyYccd = (await db.query("INSERT INTO curriculum_yccds(outcome_id,code,text,status,source_ordinal) VALUES($1,'L.1.1',$2,'ACTIVE',1) RETURNING id", [legacy, TEXT])).rows[0].id;
  await assert.rejects(run(), e => e.code === 'NO_PUBLISHED_VERSION');
  const legacyRun = await run({allowLegacy: true});
  assert.equal(legacyRun.curriculum_version, 'LEGACY');
  assert.equal((await db.query('SELECT count(*)::int n FROM topic_yccd_map WHERE yccd_id=$1', [legacyYccd])).rows[0].n, 1);

  // V1, V2 PUBLISHED và V3 DRAFT: phải chốt vào V2. Chuẩn chỉ thêm được vào bản DRAFT (trigger CSDL),
  // nên dựng ở DRAFT rồi mới công bố.
  const ids = {};
  const buildVersion = async (label, yccdCodes) => {
    const v = (await db.query("INSERT INTO curriculum_versions(subject_id,grade,version_code,title,status) VALUES($1,7,$2,$2,'DRAFT') RETURNING id", [sid, 'SEED-' + label])).rows[0].id;
    const o = (await db.query(`INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document,status,source_branch_code,source_ordinal,curriculum_version_id)
      VALUES($1,7,'L','L.1',$2,$2,'Fixture','ACTIVE','L',1,$3) RETURNING id`, [sid, 'SEED-' + label, v])).rows[0].id;
    for (const [i, c] of yccdCodes.entries()) {
      const y = (await db.query("INSERT INTO curriculum_yccds(outcome_id,code,text,status,source_ordinal,curriculum_version_id) VALUES($1,$2,$3,'ACTIVE',$4,$5) RETURNING id", [o, c, TEXT, i + 1, v])).rows[0].id;
      if (!i) ids[label] = y;
    }
    return v;
  };
  const publish = (v, days) => db.query(`UPDATE curriculum_versions SET status='PUBLISHED',published_at=now()-interval '${days} days' WHERE id=$1`, [v]);
  await publish(await buildVersion('V1', ['L.1.1']), 3);
  await publish(await buildVersion('V2', ['L.1.1']), 1);
  await buildVersion('V3', ['L.1.1']);
  const pinned = await run();
  assert.equal(pinned.curriculum_version.code, 'SEED-V2');
  const topic = (await db.query("SELECT id FROM topics WHERE subject_id=$1 AND name='Bài 1. Seed'", [sid])).rows;
  assert.equal(topic.length, 1, 'Bài được dùng lại theo môn + khối + phân môn + tên');
  const linked = (await db.query('SELECT yccd_id FROM topic_yccd_map WHERE topic_id=$1 ORDER BY yccd_id', [topic[0].id])).rows.map(r => r.yccd_id);
  assert.equal(linked.includes(ids.V2), true);
  assert.equal(linked.includes(ids.V1) || linked.includes(ids.V3), false);

  // Bản mới nhất có hai YCCĐ cùng nguyên văn: không chọn đại hàng đầu tiên.
  await publish(await buildVersion('V4', ['L.1.1', 'L.1.2']), 0);
  await assert.rejects(run(), e => e.code === 'AMBIGUOUS_YCCD_TEXT');
  assert.equal(bid > 0, true);
});
