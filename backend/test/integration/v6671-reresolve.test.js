// V6.6.7.1 — câu nhập theo mã TRƯỚC khi có chương trình (yccd_id rỗng) được nhận lại theo mã sau khi nạp
// chương trình: chạy thử không ghi gì; ghi thật chỉ đụng câu nháp, bỏ qua câu lệch mã và câu không còn là nháp.
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
const name = 'nganhang_v6671_test_' + Date.now();
const port = 3122, origin = `http://127.0.0.1:${port}`;
const artifacts = path.resolve('../artifacts');
fs.mkdirSync(artifacts, {recursive: true});
const dump = path.join(artifacts, 'v6671-source.dump');
const uploadsDir = path.join(artifacts, 'v6671-uploads-' + name);
const env = {...process.env, PGHOST: process.env.DB_HOST, PGPORT: process.env.DB_PORT, PGUSER: process.env.DB_USER, PGPASSWORD: process.env.DB_PASSWORD};
const connection = {host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD};
const adminPool = new pg.Pool({...connection, database: source});
const pw = crypto.randomBytes(12).toString('base64url');
const SUBJECT = 'V6671KHTN';
let db, server, token, subjectId, branchId, bankId, lessonId;
const q = {};

async function req(method, url, body) {
  const res = await fetch(origin + '/api' + url, {method,
    headers: {...(token ? {Authorization: 'Bearer ' + token} : {}), ...(body !== undefined ? {'Content-Type': 'application/json'} : {})},
    body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return {status: res.status, data};
}
const expect = (r, status) => assert.equal(r.status, status, JSON.stringify(r.data));

// Chạy script đúng như trên máy chủ: thư mục backend, .env của máy, chỉ đổi DB_NAME sang database tạm.
function script(...args) {
  const r = spawnSync(process.execPath, ['scripts/reresolve-question-codes.mjs', '--json', '--subject', SUBJECT, ...args],
    {env: {...process.env, DB_NAME: name, SLOW_QUERY_MS: '600000'}, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr + r.stdout);
  return JSON.parse(r.stdout);
}
const state = async id => (await db.query(`SELECT q.yccd_id,q.outcome_id,q.topic_id,q.lesson_status,v.review_status,
  (SELECT count(*)::int FROM question_versions x WHERE x.question_id=q.id) AS versions
  FROM questions q JOIN question_versions v ON v.id=q.current_version_id WHERE q.id=$1`, [id])).rows[0];

async function createCoded(key, code, level) {
  const r = await req('POST', '/practice/questions', {subject_id: subjectId, grade: 9, branch_id: branchId, cognitive_level: level, type: 'multiple_choice',
    display_code: code, stem: `Câu V6671 ${key} ${crypto.randomUUID().slice(0, 6)}`, bank_id: bankId,
    options: ['A', 'B', 'C', 'D'].map(id => ({id, text: 'Phương án ' + id})), answer: {correct: 'B'}, explanation: 'Lời giải'});
  expect(r, 201);
  q[key] = r.data.id;
}

test.before(async () => {
  const d = spawnSync('pg_dump', ['-Fc', '-d', source, '-f', dump], {env, encoding: 'utf8'});
  assert.equal(d.status, 0, d.stderr);
  await adminPool.query('CREATE DATABASE ' + name);
  const r = spawnSync('pg_restore', ['--no-owner', '--no-privileges', '-d', name, dump], {env, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  db = new pg.Pool({...connection, database: name});
  const dep = (await db.query("INSERT INTO departments(code,name) VALUES('V6671_DEP','Tổ V6.6.7.1') RETURNING id")).rows[0].id;
  subjectId = (await db.query("INSERT INTO subjects(code,name,department_id,is_integrated) VALUES($1,'KHTN kiểm thử V6.6.7.1',$2,true) RETURNING id", [SUBJECT, dep])).rows[0].id;
  branchId = (await db.query("INSERT INTO branches(subject_id,code,name) VALUES($1,'VL','Vật lí') RETURNING id", [subjectId])).rows[0].id;
  bankId = (await db.query("INSERT INTO banks(name,kind,department_id) VALUES('Kho V6.6.7.1','department',$1) RETURNING id", [dep])).rows[0].id;
  lessonId = (await db.query("INSERT INTO topics(subject_id,grade,name,status,branch_id) VALUES($1,9,'Bài 3. Cơ năng','ACTIVE',$2) RETURNING id", [subjectId, branchId])).rows[0].id;
  await db.query("INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES('v6671_admin',$1,'v6671_admin','admin',false)", [await bcrypt.hash(pw, 10)]);

  fs.mkdirSync(uploadsDir, {recursive: true});
  const log = fs.openSync(path.join(artifacts, 'v6671-server.log'), 'w');
  server = spawn(process.execPath, ['src/server.js'], {env: {...process.env, DB_NAME: name, UPLOAD_DIR: uploadsDir, PORT: String(port), HOST: '127.0.0.1'},
    stdio: ['ignore', log, log], windowsHide: true});
  let ready = false;
  for (let i = 0; i < 240; i++) {
    if (server.exitCode !== null) throw new Error('Server exited: ' + fs.readFileSync(path.join(artifacts, 'v6671-server.log'), 'utf8'));
    try { if ((await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1000)})).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  assert(ready, 'Server not healthy');
  const login = await req('POST', '/auth/login', {username: 'v6671_admin', password: pw});
  expect(login, 200);
  token = login.data.token;

  // Như trên máy chủ: câu được nhập theo mã khi CHƯA có Outcome/YCCĐ → yccd_id rỗng.
  await createCoded('auto', 'Câu L. 2. 1. NB. 1. TN', 1);       // sẽ có YCCĐ + đúng 1 Bài
  await createCoded('unmapped', 'Câu L. 2. 2. NB. 2. TN', 1);   // có YCCĐ nhưng chưa liên kết Bài
  await createCoded('missing', 'Câu L. 2. 9. NB. 3. TN', 1);    // YCCĐ số 9 không có trong chương trình
  await createCoded('conflict', 'Câu L. 2. 1. TH. 4. TN', 1);   // mã nói TH, câu khai NB
  await createCoded('pending', 'Câu L. 2. 1. NB. 5. TN', 1);    // không còn là nháp → không được đụng
  await db.query("UPDATE question_versions SET review_status='PENDING_REVIEW' WHERE id=(SELECT current_version_id FROM questions WHERE id=$1)", [q.pending]);
  for (const id of Object.values(q)) assert.equal((await state(id)).yccd_id, null);

  // Sau đó mới nạp chương trình (Outcome 2, YCCĐ 1–2) và liên kết Bài cho YCCĐ 1.
  const outcome = (await db.query(`INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document,status,source_branch_code,source_ordinal)
    VALUES($1,9,'L','L.2','Cơ năng','V6671','Fixture','ACTIVE','L',2) RETURNING id`, [subjectId])).rows[0].id;
  const yccds = [];
  for (const n of [1, 2]) yccds.push((await db.query(`INSERT INTO curriculum_yccds(outcome_id,code,text,status,source_ordinal) VALUES($1,$2,$3,'ACTIVE',$4) RETURNING id`,
    [outcome, 'L.2.' + n, 'YCCĐ kiểm thử ' + n, n])).rows[0].id);
  await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')", [lessonId, yccds[0]]);
  q.yccds = yccds;
});

test.after(() => cleanupIntegration({server, db, adminPool, name, dump, uploadsDir}));

test('V6671: chạy thử báo đúng từng nhóm và không ghi gì', async () => {
  const before = await state(q.auto);
  const s = script();
  assert.equal(s.mode, 'DRY_RUN');
  assert.equal(s.candidates, 5);
  assert.equal(s.skipped_not_draft, 1);
  assert.equal(s.not_resolved, 1);
  assert.equal(s.conflicts, 1);
  assert.equal(s.resolved, 3);
  assert.equal(s.applied, 2, JSON.stringify(s.examples));
  assert.equal(s.lesson_auto, 1);
  assert.equal(s.lesson_unmapped, 1);
  assert.deepEqual(await state(q.auto), before, 'Chạy thử không được ghi');
});

test('V6671: ghi thật chỉ nhận lại câu nháp khớp mã; chạy lại không đổi thêm', async () => {
  const s = script('--apply', '--actor', 'v6671_admin');
  assert.equal(s.mode, 'APPLY');
  assert.equal(s.applied, 2, JSON.stringify(s.examples));
  const auto = await state(q.auto);
  assert.equal(auto.yccd_id, q.yccds[0]);
  assert.notEqual(auto.outcome_id, null);
  assert.equal(auto.topic_id, lessonId, 'YCCĐ có đúng 1 Bài → tự gắn Bài');
  assert.equal(auto.lesson_status, 'AUTO_MAPPED');
  assert.equal(auto.review_status, 'DRAFT', 'Vẫn là nháp');
  const unmapped = await state(q.unmapped);
  assert.equal(unmapped.yccd_id, q.yccds[1]);
  assert.equal(unmapped.topic_id, null);
  for (const key of ['missing', 'conflict', 'pending']) assert.equal((await state(q[key])).yccd_id, null, key + ' không được đổi');
  assert.equal((await state(q.pending)).review_status, 'PENDING_REVIEW');
  const audit = (await db.query("SELECT details FROM practice_audit WHERE action='QUESTION_CODE_RERESOLVE' ORDER BY id DESC LIMIT 1")).rows[0];
  assert.equal(audit.details.applied, 2);
  const again = script('--apply', '--actor', 'v6671_admin');
  assert.equal(again.candidates, 3);
  assert.equal(again.applied, 0);
});

test('V6671: ghi thật bắt buộc nêu admin thực hiện', async () => {
  const r = spawnSync(process.execPath, ['scripts/reresolve-question-codes.mjs', '--apply'], {env: {...process.env, DB_NAME: name}, encoding: 'utf8'});
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--actor/);
});
