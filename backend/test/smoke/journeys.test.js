// Smoke 5 hành trình chính trên một database TRẮNG vừa dựng bằng `npm run migrate` (+ `npm run seed`) — chạy trong CI trên
// máy GitHub với Postgres riêng. Khác bộ integration: không sao chép database local, tự tạo mọi dữ liệu cần dùng.
// Chỉ chạy khi tên database kết thúc bằng _ci hoặc _smoke, để không bao giờ ghi nhầm vào database thật.
import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import XLSX from 'xlsx';

if (!/_(ci|smoke)$/.test(process.env.DB_NAME || '')) throw new Error('Smoke test chỉ chạy trên database tên kết thúc bằng _ci hoặc _smoke');
const port = Number(process.env.SMOKE_PORT) || 3190, origin = `http://127.0.0.1:${port}`;
const db = new pg.Pool({host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME});
const pw = crypto.randomBytes(12).toString('base64url'), tag = crypto.randomBytes(3).toString('hex');
const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-uploads-'));
const GRADE = 9;
let server, admin, student, subjectId, classId, lessonId, questionIds = [], outcome, yccd, bankId;

async function req(method, url, body, token = admin) {
  const res = await fetch(origin + '/api' + url, {method, headers: {...(token ? {Authorization: 'Bearer ' + token} : {}), ...(body !== undefined ? {'Content-Type': 'application/json'} : {})}, body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return {status: res.status, data, headers: res.headers};
}
const expect = (r, s) => assert.equal(r.status, s, typeof r.data === 'string' ? r.data.slice(0, 500) : JSON.stringify(r.data).slice(0, 1500));
const login = async username => { const r = await req('POST', '/auth/login', {username, password: pw}, null); expect(r, 200); return r.data.token; };
async function finish(attemptId, answer) {
  const a = await req('GET', '/practice/attempts/' + attemptId, undefined, student);
  expect(a, 200);
  for (const item of a.data.items) expect(await req('PUT', `/practice/attempts/${attemptId}/items/${item.id}`, {response: answer, final: true}, student), 200);
  const done = await req('POST', `/practice/attempts/${attemptId}/submit`, {}, student);
  expect(done, 200);
  return done.data;
}

test.before(async () => {
  const hash = await bcrypt.hash(pw, 10), ids = {};
  for (const [key, role] of [['admin', 'admin'], ['student', 'student']]) {
    ids[key] = (await db.query('INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES($1,$2,$1,$3,false) RETURNING id', [`smoke_${key}_${tag}`, hash, role])).rows[0].id;
  }
  await db.query('INSERT INTO student_profiles(user_id,student_code) VALUES($1,$2)', [ids.student, 'SMOKE-' + tag]);
  const dep = (await db.query('INSERT INTO departments(code,name) VALUES($1,$2) RETURNING id', ['SMK' + tag, 'Tổ smoke ' + tag])).rows[0].id;
  subjectId = (await db.query('INSERT INTO subjects(code,name,department_id,code_letter) VALUES($1,$2,$3,$4) RETURNING id', ['Smoke' + tag, 'Môn smoke ' + tag, dep, 'SM'])).rows[0].id;
  const year = (await db.query("INSERT INTO school_years(name,start_date,end_date) VALUES($1,CURRENT_DATE-30,CURRENT_DATE+330) RETURNING id", ['Smoke ' + tag])).rows[0].id;
  classId = (await db.query('INSERT INTO classes(name,grade,school_year_id) VALUES($1,$2,$3) RETURNING id', ['9-SMOKE-' + tag, GRADE, year])).rows[0].id;
  await db.query('INSERT INTO class_memberships(class_id,student_id) VALUES($1,$2)', [classId, ids.student]);
  outcome = (await db.query("INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document) VALUES($1,$2,'','SMOKE.O','Fixture smoke','TEST','Chỉ trong database smoke') RETURNING id", [subjectId, GRADE])).rows[0].id;
  yccd = (await db.query("INSERT INTO curriculum_yccds(outcome_id,code,text) VALUES($1,'SMOKE.Y','YCCĐ smoke') RETURNING id", [outcome])).rows[0].id;
  lessonId = (await db.query("INSERT INTO topics(subject_id,grade,chapter,name,order_index) VALUES($1,$2,'Chương smoke','Bài 1: Smoke',1) RETURNING id", [subjectId, GRADE])).rows[0].id;
  await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')", [lessonId, yccd]);

  const log = fs.openSync(path.join(uploads, 'server.log'), 'w');
  server = spawn(process.execPath, ['src/server.js'], {env: {...process.env, UPLOAD_DIR: uploads, PORT: String(port), HOST: '127.0.0.1'}, stdio: ['ignore', log, log], windowsHide: true});
  let ready = false;
  for (let i = 0; i < 240 && !ready; i++) {
    if (server.exitCode !== null) throw new Error('Server exited: ' + fs.readFileSync(path.join(uploads, 'server.log'), 'utf8'));
    try { ready = (await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1000)})).ok; } catch {}
    if (!ready) await new Promise(r => setTimeout(r, 250));
  }
  assert(ready, 'Server not healthy');
});

test.after(async () => {
  server?.kill();
  await db.end();
  fs.rmSync(uploads, {recursive: true, force: true});
});

test('Hành trình 1 — khởi động: máy chủ sống trên database trắng, đăng nhập được, danh mục đọc được', async () => {
  const health = await req('GET', '/health', undefined, null);
  expect(health, 200);
  admin = await login('smoke_admin_' + tag);
  student = await login('smoke_student_' + tag);
  const me = await req('GET', '/auth/me');
  expect(me, 200);
  assert.equal(me.data.role, 'admin');
  const catalog = await req('GET', '/practice/catalog');
  expect(catalog, 200);
  assert.ok(catalog.data.subjects.some(s => s.id === subjectId));
  expect(await req('GET', '/practice/catalog', undefined, null), 401);
});

test('Hành trình 2 — soạn câu → gửi duyệt → duyệt: câu chỉ tới học sinh sau khi được duyệt', async () => {
  bankId = (await req('GET', '/practice/banks')).data.find(b => b.kind === 'school').id;
  for (let i = 0; i < 10; i++) {
    const q = await req('POST', '/practice/questions', {subject_id: subjectId, topic_id: lessonId, grade: GRADE, outcome_id: outcome, yccd_id: yccd, type: 'multiple_choice', cognitive_level: i < 6 ? 1 : 2,
      stem: `Câu smoke ${tag} số ${i}`, options: ['A', 'B', 'C', 'D'].map(id => ({id, text: id})), answer: {correct: 'B'}, bank_id: bankId});
    expect(q, 201);
    questionIds.push(q.data.id);
  }
  const before = await req('GET', `/practice/lesson-coverage?subject_id=${subjectId}&grade=${GRADE}`);
  expect(before, 200);
  assert.equal(before.data.summary.questions, 0, 'câu nháp chưa tính là học sinh luyện được');
  for (const id of questionIds) for (const status of ['pending_review', 'approved', 'active']) expect(await req('POST', `/practice/questions/${id}/workflow`, {status}), 200);
  const after = await req('GET', `/practice/lesson-coverage?subject_id=${subjectId}&grade=${GRADE}`);
  assert.deepEqual([after.data.summary.questions, after.data.summary.ready], [10, 1]);
});

test('Hành trình 3 — chương trình môn học: tải file mẫu, mẫu Word nhập câu và lệnh AI theo chữ viết tắt của môn', async () => {
  const res = await fetch(origin + `/api/curriculum/template?subject_id=${subjectId}&grade=${GRADE}`, {headers: {Authorization: 'Bearer ' + admin}});
  assert.equal(res.status, 200);
  const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), {type: 'buffer'});
  assert.deepEqual(wb.SheetNames, ['Hướng dẫn', 'Chương trình', 'Bài học', 'Ví dụ', 'Dùng AI']);
  const prompts = await req('GET', `/curriculum/template/prompts?subject_id=${subjectId}&grade=${GRADE}`);
  expect(prompts, 200);
  assert.match(prompts.data.sample_code, /^Câu SM\. \d+\. \d+\. NB\. 1\. TN$/);
  const word = await fetch(origin + `/api/curriculum/template/word?subject_id=${subjectId}&grade=${GRADE}`, {headers: {Authorization: 'Bearer ' + admin}});
  assert.equal(word.status, 200);
  assert.ok((await word.arrayBuffer()).byteLength > 2000);
});

test('Hành trình 4 — giao bài → học sinh làm và nộp → kết quả vào hồ sơ', async () => {
  const config = {subject_id: subjectId, grade: GRADE, topic_ids: [lessonId], count: 10, percent: [60, 40, 0, 0], types: ['multiple_choice'], mode: 'practice'};
  const made = await req('POST', '/practice/assignments', {title: 'Bài smoke ' + tag, kind: 'dynamic', config, class_ids: [classId], max_attempts: 2});
  expect(made, 201);
  const mine = await req('GET', '/practice/assignments', undefined, student);
  expect(mine, 200);
  assert.ok(JSON.stringify(mine.data).includes('Bài smoke ' + tag));
  const attempt = await req('POST', `/practice/assignments/${made.data.id}/start`, {}, student);
  expect(attempt, 201);
  const result = await finish(attempt.data.id, 'B');
  assert.equal(Number(result.percentage), 100);
  const portfolio = await req('GET', `/practice/students/${(await req('GET', '/auth/me', undefined, student)).data.id}/portfolio`, undefined, student);
  expect(portfolio, 200);
  assert.equal(portfolio.data.summary.completed_attempts, 1);
});

test('Hành trình 5 — bản đồ bài học: luyện ngay một chạm, sao và chuỗi ngày cập nhật', async () => {
  const before = await req('GET', '/practice/lesson-map?subject_id=' + subjectId, undefined, student);
  expect(before, 200);
  assert.equal(before.data.summary.practicable, 1);
  const attempt = await req('POST', '/practice/lessons/start', {topic_ids: [lessonId]}, student);
  expect(attempt, 201);
  await finish(attempt.data.id, 'B');
  const after = await req('GET', '/practice/lesson-map?subject_id=' + subjectId, undefined, student);
  const lesson = after.data.chapters[0].lessons[0];
  assert.deepEqual([lesson.progress.status, lesson.progress.stars], ['done', 3], 'hai lượt đúng hết (bài giao + luyện ngay) → 3 sao');
  assert.equal(after.data.motivation.streak.today_done, true);
  assert.ok(after.data.motivation.badges.find(b => b.id === 'first').earned);
});
