// V6.8.1 — khung năng lực CT GDPT 2018 có sẵn (migration v681) và quy tắc mặc định theo mức nhận thức:
// học sinh làm bài KHTN không cần ai gắn năng lực, biểu đồ vẫn có số; mapping riêng vẫn được ưu tiên (xem v68-lesson-map).
import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import {cleanupIntegration} from './helpers/cleanup.js';

const source = process.env.DB_NAME;
if (!source?.startsWith('nganhang_personalized')) throw new Error('Integration tests require an isolated personalized database');
const name = 'nganhang_v681_test_' + Date.now();
const port = 3127, origin = `http://127.0.0.1:${port}`;
const artifacts = path.resolve('../artifacts');
fs.mkdirSync(artifacts, {recursive: true});
const dump = path.join(artifacts, 'v681-source.dump');
const uploadsDir = path.join(artifacts, 'v681-uploads-' + name);
const env = {...process.env, PGHOST: process.env.DB_HOST, PGPORT: process.env.DB_PORT, PGUSER: process.env.DB_USER, PGPASSWORD: process.env.DB_PASSWORD};
const connection = {host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD};
const adminPool = new pg.Pool({...connection, database: source});
const pw = crypto.randomBytes(12).toString('base64url');
const GRADE = 8;
let db, server, admin, student, studentId, khtn, lessonId, yccdId;

async function req(method, url, body, token = admin) {
  const res = await fetch(origin + '/api' + url, {method, headers: {Authorization: 'Bearer ' + token, ...(body !== undefined ? {'Content-Type': 'application/json'} : {})}, body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return {status: res.status, data};
}
const expect = (r, s) => assert.equal(r.status, s, typeof r.data === 'string' ? r.data : JSON.stringify(r.data).slice(0, 1500));
async function login(username) {
  const r = await fetch(origin + '/api/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, password: pw})});
  return (await r.json()).token;
}

test.before(async () => {
  const d = spawnSync('pg_dump', ['-Fc', '-d', source, '-f', dump], {env, encoding: 'utf8'});
  assert.equal(d.status, 0, d.stderr);
  await adminPool.query('CREATE DATABASE ' + name);
  const r = spawnSync('pg_restore', ['--no-owner', '--no-privileges', '-d', name, dump], {env, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  db = new pg.Pool({...connection, database: name});
  const hash = await bcrypt.hash(pw, 10);
  await db.query("INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES('v681_admin',$1,'v681_admin','admin',false)", [hash]);
  studentId = (await db.query("INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES('v681_student',$1,'v681_student','student',false) RETURNING id", [hash])).rows[0].id;
  await db.query('INSERT INTO student_profiles(user_id,student_code) VALUES($1,$2)', [studentId, 'V681-01']);
  khtn = (await db.query("SELECT id FROM subjects WHERE code='KHTN'")).rows[0].id;
  const year = (await db.query("INSERT INTO school_years(name,start_date,end_date) VALUES('V681',CURRENT_DATE-30,CURRENT_DATE+330) RETURNING id")).rows[0].id;
  const cls = (await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('8-V681',$1,$2) RETURNING id", [GRADE, year])).rows[0].id;
  await db.query('INSERT INTO class_memberships(class_id,student_id) VALUES($1,$2)', [cls, studentId]);
  const outcome = (await db.query("INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document) VALUES($1,$2,'','V681.O','Fixture kỹ thuật','TEST','Chỉ trong database kiểm thử') RETURNING id", [khtn, GRADE])).rows[0].id;
  const yccd = (await db.query("INSERT INTO curriculum_yccds(outcome_id,code,text) VALUES($1,'V681.Y','YCCĐ giả lập') RETURNING id", [outcome])).rows[0].id;
  lessonId = (await db.query("INSERT INTO topics(subject_id,grade,chapter,name,order_index) VALUES($1,$2,'Chương V681','Bài 901: Kiểm thử năng lực',901) RETURNING id", [khtn, GRADE])).rows[0].id;
  await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')", [lessonId, yccd]);
  yccdId = yccd;

  fs.mkdirSync(uploadsDir, {recursive: true});
  const log = fs.openSync(path.join(artifacts, 'v681-server.log'), 'w');
  server = spawn(process.execPath, ['src/server.js'], {env: {...process.env, DB_NAME: name, UPLOAD_DIR: uploadsDir, PORT: String(port), HOST: '127.0.0.1'}, stdio: ['ignore', log, log], windowsHide: true});
  let ready = false;
  for (let i = 0; i < 240; i++) {
    if (server.exitCode !== null) throw new Error('Server exited: ' + fs.readFileSync(path.join(artifacts, 'v681-server.log'), 'utf8'));
    try { if ((await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1000)})).ok) { ready = true; break; } } catch {}
    await new Promise(res => setTimeout(res, 250));
  }
  assert(ready, 'Server not healthy');
  admin = await login('v681_admin'); student = await login('v681_student');
  // 6 câu nhận biết + 4 câu vận dụng, đã duyệt ở kho trường; KHÔNG gắn năng lực cho câu / YCCĐ nào.
  const bank = (await req('GET', '/practice/banks')).data.find(b => b.kind === 'school');
  for (const [level, n] of [[1, 6], [3, 4]]) for (let i = 0; i < n; i++) {
    const q = await req('POST', '/practice/questions', {subject_id: khtn, topic_id: lessonId, grade: GRADE, outcome_id: outcome, yccd_id: yccd, type: 'multiple_choice', cognitive_level: level,
      stem: `Câu V681 mức ${level} số ${i}`, options: ['A', 'B', 'C', 'D'].map(id => ({id, text: id})), answer: {correct: 'B'}, bank_id: bank.id});
    expect(q, 201);
    for (const status of ['pending_review', 'approved', 'active']) expect(await req('POST', '/practice/questions/' + q.data.id + '/workflow', {status}), 200);
  }
});

test.after(() => cleanupIntegration({server, db, adminPool, name, dump, uploadsDir}));

test('V681: khung năng lực CT GDPT 2018 của các môn có sẵn và đã công bố; môn khoa học / toán có quy tắc theo mức', async () => {
  const rows = (await db.query("SELECT s.code,f.status,f.level_rule IS NOT NULL AS rule,(SELECT array_agg(a.name ORDER BY a.order_index) FROM competency_axes a WHERE a.framework_id=f.id) AS axes FROM competency_frameworks f JOIN subjects s ON s.id=f.subject_id WHERE f.code LIKE 'GDPT2018-%'")).rows;
  const by = Object.fromEntries(rows.map(r => [r.code, r]));
  for (const code of ['KHTN', 'Toan', 'VatLi', 'HoaHoc', 'SinhHoc', 'LichSu', 'DiaLi', 'NguVan', 'TiengAnh', 'TinHoc', 'CongNghe', 'GDCD', 'GDKTPL']) assert.equal(by[code]?.status, 'PUBLISHED', code);
  assert.deepEqual(by.KHTN.axes, ['Nhận thức khoa học tự nhiên', 'Tìm hiểu tự nhiên', 'Vận dụng kiến thức, kĩ năng đã học']);
  assert.equal(by.Toan.axes.length, 5);
  assert.deepEqual([by.KHTN.rule, by.Toan.rule, by.NguVan.rule, by.TiengAnh.rule], [true, true, false, false]);
});

test('V681: làm bài KHTN không cần ai gắn năng lực — biểu đồ có số theo mức của câu; chưa làm thì để trống, không coi là 0', async () => {
  const url = `/practice/students/${studentId}/competency-profile?subject_id=${khtn}&grade=${GRADE}`;
  const empty = await req('GET', url, undefined, student);
  expect(empty, 200);
  assert.equal(empty.data.framework.code, 'GDPT2018-KHTN');
  assert.deepEqual(empty.data.axes.map(a => [a.performance_score, a.evidence_count]), [[null, 0], [null, 0], [null, 0]]);

  const attempt = await req('POST', '/practice/lessons/start', {topic_ids: [lessonId]}, student);
  expect(attempt, 201);
  const view = await req('GET', '/practice/attempts/' + attempt.data.id, undefined, student);
  assert.equal(view.data.items.length, 10);
  // Trả lời đúng mọi câu nhận biết, sai mọi câu vận dụng.
  const levels = Object.fromEntries((await db.query('SELECT i.id,v.cognitive_level AS l FROM attempt_items i JOIN question_versions v ON v.id=i.question_version_id WHERE i.attempt_id=$1', [attempt.data.id])).rows.map(r => [r.id, r.l]));
  for (const item of view.data.items) expect(await req('PUT', `/practice/attempts/${attempt.data.id}/items/${item.id}`, {response: levels[item.id] === 1 ? 'B' : 'A', final: true}, student), 200);
  expect(await req('POST', `/practice/attempts/${attempt.data.id}/submit`, {}, student), 200);

  const p = await req('GET', url, undefined, student);
  expect(p, 200);
  assert.deepEqual([p.data.estimated_items, p.data.unmapped_items], [10, 0]);
  const [c1, c2, c3] = p.data.axes;
  assert.deepEqual([c1.performance_score, c1.evidence_count], [100, 6], 'câu nhận biết → Nhận thức KHTN');
  assert.deepEqual([c2.performance_score, c2.evidence_count], [0, 4], 'câu vận dụng → một phần Tìm hiểu tự nhiên');
  assert.deepEqual([c3.performance_score, c3.evidence_count], [0, 4], 'câu vận dụng → Vận dụng kiến thức, kĩ năng');
});

test('V682: YCCĐ được gắn năng lực (như cột Năng lực của file mẫu) thì thắng quy tắc theo mức, kể cả với bài đã làm trước đó', async () => {
  const axes = (await req('GET', '/competency/frameworks')).data.frameworks.find(f => f.code === 'GDPT2018-KHTN').axes;
  const c2 = axes.find(a => a.code === 'C2');
  expect(await req('PUT', '/competency/mappings/yccd/' + yccdId, {entries: [{axis_id: c2.id, weight: 1}], normalize: true, confirmed: true, reason: 'Gắn theo YCCĐ'}), 200);
  const p = await req('GET', `/practice/students/${studentId}/competency-profile?subject_id=${khtn}&grade=${GRADE}`, undefined, student);
  expect(p, 200);
  assert.deepEqual([p.data.estimated_items, p.data.unmapped_items], [0, 0]);
  assert.deepEqual(p.data.axes.map(a => a.evidence_count), [0, 10, 0], 'cả 10 câu tính cho Tìm hiểu tự nhiên');
  assert.equal(p.data.axes[1].performance_score, 60, '6 câu đúng trên 10');
});
