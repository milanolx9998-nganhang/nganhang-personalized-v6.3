// V6.6.7.1 — quy trình sửa dữ liệu máy chủ, chạy trọn trên bản sao DB local:
//   câu có mã được nhập khi CHƯA có chương trình → nạp workbook chính thức qua hồ sơ tin cậy + công bố →
//   seed Bài ↔ YCCĐ theo KHDH (dùng lại Bài sẵn có theo số Bài) → nhận lại YCCĐ theo mã → câu có YCCĐ + đúng Bài.
// Cần 4 workbook chính thức trên máy (G:), không có thì bỏ qua kèm lý do.
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

const SOURCE_DIR = process.env.OUTCOME_DIR || 'G:/NSHM/26 27/outcome/New folder';
const workbookPath = grade => `${SOURCE_DIR}/Outcome_YCCD_KHTN_${grade}.xlsx`;
const GRADES = [6, 9];
const hasSources = GRADES.every(g => fs.existsSync(workbookPath(g)));
const skip = hasSources ? false : 'Không tìm thấy workbook chính thức trên máy này';

const source = process.env.DB_NAME;
if (!source?.startsWith('nganhang_personalized')) throw new Error('Integration tests require an isolated personalized database');
const name = 'nganhang_v6671seed_test_' + Date.now();
const port = 3123, origin = `http://127.0.0.1:${port}`;
const artifacts = path.resolve('../artifacts');
fs.mkdirSync(artifacts, {recursive: true});
const dump = path.join(artifacts, 'v6671seed-source.dump');
const uploadsDir = path.join(artifacts, 'v6671seed-uploads-' + name);
const env = {...process.env, PGHOST: process.env.DB_HOST, PGPORT: process.env.DB_PORT, PGUSER: process.env.DB_USER, PGPASSWORD: process.env.DB_PASSWORD};
const connection = {host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD};
const adminPool = new pg.Pool({...connection, database: source});
const pw = crypto.randomBytes(12).toString('base64url');
let db, server, token, subjectId, bankId, questionId, lesson2Id;

async function req(method, url, body) {
  const res = await fetch(origin + '/api' + url, {method,
    headers: {Authorization: 'Bearer ' + token, ...(body !== undefined ? {'Content-Type': 'application/json'} : {})},
    body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return {status: res.status, data};
}
const expect = (r, s) => assert.equal(r.status, s, typeof r.data === 'string' ? r.data : JSON.stringify(r.data));
const run = (file, ...args) => {
  const r = spawnSync(process.execPath, [file, ...args], {env: {...process.env, DB_NAME: name, SLOW_QUERY_MS: '600000'}, encoding: 'utf8'});
  return {status: r.status, out: r.stdout, err: r.stderr};
};
const json = r => { assert.equal(r.status, 0, r.err + r.out); return JSON.parse(r.out); };

// Nạp + công bố một khối qua đúng luồng giao diện dùng (hồ sơ tin cậy, sửa trùng số trong staging nếu có).
async function loadGrade(grade) {
  const created = await req('POST', '/curriculum/versions', {subject_id: subjectId, grade, version_code: `GDPT2018-K${grade}-T`, title: `KHTN khối ${grade}`,
    source_name: `Outcome_YCCD_KHTN_${grade}.xlsx`, source_ref: 'Chương trình GDPT 2018'});
  expect(created, 201);
  const form = new FormData();
  form.append('version_id', String(created.data.id));
  form.append('file', new Blob([fs.readFileSync(workbookPath(grade))]), `Outcome_YCCD_KHTN_${grade}.xlsx`);
  const up = await fetch(origin + '/api/curriculum/import', {method: 'POST', headers: {Authorization: 'Bearer ' + token}, body: form});
  const job = await up.json();
  assert.equal(up.status, 201, JSON.stringify(job));
  const preview = await req('GET', '/curriculum/import/' + job.id + '/preview');
  const sheet = preview.data.trusted.sheets.find(s => s.grade === grade);
  expect(await req('PUT', '/curriculum/import/' + job.id + '/map', {sheet: sheet.sheet, header_row: sheet.header_row, columns: sheet.columns,
    topic_as_outcome: true, source_profile: preview.data.trusted.profile, revision: job.revision}), 200);
  const staged = await req('GET', '/curriculum/import/' + job.id + '/preview');
  assert.equal(staged.data.rows.some(r => (r.mapped_payload.source_flags || []).includes('SOURCE_ORDINAL_DUPLICATE')), false, `Khối ${grade} có trùng số — test này chỉ dùng khối không trùng`);
  expect(await req('POST', '/curriculum/import/' + job.id + '/commit', {revision: staged.data.job.revision, confirmed: true, reason: 'Nạp nguồn chính thức', accept_source_warnings: true}), 200);
  const detail = await req('GET', '/curriculum/versions/' + created.data.id);
  expect(await req('POST', `/curriculum/versions/${created.data.id}/publish`, {revision: detail.data.version.revision, confirmed: true, reason: 'Công bố'}), 200);
}

test.before(async () => {
  if (!hasSources) return;
  const d = spawnSync('pg_dump', ['-Fc', '-d', source, '-f', dump], {env, encoding: 'utf8'});
  assert.equal(d.status, 0, d.stderr);
  await adminPool.query('CREATE DATABASE ' + name);
  const r = spawnSync('pg_restore', ['--no-owner', '--no-privileges', '-d', name, dump], {env, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  db = new pg.Pool({...connection, database: name});
  subjectId = (await db.query("SELECT id FROM subjects WHERE code='KHTN'")).rows[0].id;
  lesson2Id = (await db.query("SELECT id FROM topics WHERE subject_id=$1 AND grade=9 AND name ~ '^Bài 2[:.]'", [subjectId])).rows[0].id;
  const dep = (await db.query("INSERT INTO departments(code,name) VALUES('V6671S_DEP','Tổ seed') RETURNING id")).rows[0].id;
  bankId = (await db.query("INSERT INTO banks(name,kind,department_id) VALUES('Kho seed','department',$1) RETURNING id", [dep])).rows[0].id;
  await db.query("INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES('v6671s_admin',$1,'v6671s_admin','admin',false)", [await bcrypt.hash(pw, 10)]);

  fs.mkdirSync(uploadsDir, {recursive: true});
  const log = fs.openSync(path.join(artifacts, 'v6671seed-server.log'), 'w');
  server = spawn(process.execPath, ['src/server.js'], {env: {...process.env, DB_NAME: name, UPLOAD_DIR: uploadsDir, PORT: String(port), HOST: '127.0.0.1'},
    stdio: ['ignore', log, log], windowsHide: true});
  let ready = false;
  for (let i = 0; i < 240; i++) {
    if (server.exitCode !== null) throw new Error('Server exited: ' + fs.readFileSync(path.join(artifacts, 'v6671seed-server.log'), 'utf8'));
    try { if ((await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1000)})).ok) { ready = true; break; } } catch {}
    await new Promise(res => setTimeout(res, 250));
  }
  assert(ready, 'Server not healthy');
  const login = await fetch(origin + '/api/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: 'v6671s_admin', password: pw})});
  token = (await login.json()).token;
});

test.after(() => cleanupIntegration({server, db, adminPool, name, dump, uploadsDir}));

test('V6671 seed: trước khi có chương trình — seed dừng NO_PUBLISHED_VERSION, câu có mã chưa có YCCĐ', {skip}, async () => {
  // Như máy chủ: câu KHTN 9 nhập theo mã khi chưa có chương trình.
  const q = await req('POST', '/practice/questions', {subject_id: subjectId, grade: 9, cognitive_level: 1, type: 'multiple_choice', display_code: 'Câu L. 2. 1. NB. 7. TN',
    stem: 'Câu kiểm thử seed ' + crypto.randomUUID().slice(0, 6), bank_id: bankId,
    options: ['A', 'B', 'C', 'D'].map(id => ({id, text: 'Phương án ' + id})), answer: {correct: 'B'}, explanation: 'Lời giải'});
  expect(q, 201);
  questionId = q.data.id;
  assert.equal((await db.query('SELECT yccd_id FROM questions WHERE id=$1', [questionId])).rows[0].yccd_id, null);
  const refused = run('src/db/seed-khtn-lessons.js', '--grade', '9', '--dry-run');
  assert.equal(refused.status, 1);
  assert.match(refused.err, /NO_PUBLISHED_VERSION/);
});

test('V6671 seed: nạp + công bố KHTN 6 và 9 rồi seed — dùng lại 51 Bài sẵn có của khối 9, tạo Bài khối 6; chạy lại không đổi', {skip}, async () => {
  for (const grade of GRADES) await loadGrade(grade);
  const topicsBefore = Number((await db.query('SELECT count(*) FROM topics WHERE subject_id=$1 AND grade=9', [subjectId])).rows[0].count);

  const dry = json(run('src/db/seed-khtn-lessons.js', '--grade', '9', '--dry-run'));
  assert.equal(dry.dry_run, true);
  assert.equal(dry.topics_created, 0, 'Khối 9 đã có đủ Bài → không tạo Bài mới');
  assert.equal(dry.topics_reused, 51);
  assert(dry.links_created >= 180, JSON.stringify(dry));
  assert.equal(Number((await db.query("SELECT count(*) FROM topic_yccd_map m JOIN topics t ON t.id=m.topic_id WHERE t.subject_id=$1 AND t.grade=9", [subjectId])).rows[0].count), 0, 'Chạy thử không ghi');

  const applied = json(run('src/db/seed-khtn-lessons.js', '--grade', '9'));
  assert.equal(applied.links_created, dry.links_created);
  assert.equal(Number((await db.query('SELECT count(*) FROM topics WHERE subject_id=$1 AND grade=9', [subjectId])).rows[0].count), topicsBefore);
  const again = json(run('src/db/seed-khtn-lessons.js', '--grade', '9'));
  assert.equal(again.links_created, 0);
  assert.equal(again.links_already_present, applied.links_created);

  const six = json(run('src/db/seed-khtn-lessons.js', '--grade', '6'));
  assert(six.topics_created > 30, JSON.stringify(six));
  assert(six.links_created > 50, JSON.stringify(six));
  // Bài 2 khối 9 ("Động năng. Thế năng") được liên kết với L.2.1 (biểu thức động năng).
  const link = (await db.query(`SELECT 1 FROM topic_yccd_map m JOIN curriculum_yccds y ON y.id=m.yccd_id JOIN curriculum_outcomes o ON o.id=y.outcome_id
    WHERE m.topic_id=$1 AND o.source_branch_code='L' AND o.source_ordinal=2 AND y.source_ordinal=1 AND o.grade=9`, [lesson2Id])).rows;
  assert.equal(link.length, 1);
});

test('V6671 seed: nhận lại theo mã sau khi có chương trình + liên kết Bài → câu có YCCĐ và tự gắn đúng Bài', {skip}, async () => {
  const s = json(run('scripts/reresolve-question-codes.mjs', '--json', '--subject', 'KHTN', '--grade', '9', '--apply', '--actor', 'v6671s_admin'));
  assert(s.applied >= 1, JSON.stringify(s));
  const row = (await db.query('SELECT yccd_id,topic_id,lesson_status FROM questions WHERE id=$1', [questionId])).rows[0];
  assert.notEqual(row.yccd_id, null);
  assert.equal(row.topic_id, lesson2Id);
  assert.equal(row.lesson_status, 'AUTO_MAPPED');
  const code = (await req('GET', `/practice/questions/queue?ids=${questionId}`)).data.items[0].checks;
  assert.equal(code.code, true, 'Kiểm tra mã đạt sau khi nhận lại');
  assert.equal(code.lesson, true, 'Có Bài');
});
