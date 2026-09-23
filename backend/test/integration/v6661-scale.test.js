// V6.6.6.1 — đo tải bàn làm việc ở kho lớn: 20.000 câu, đo thời gian thật của hàng đợi, "Việc của tôi"
// (view-counts) và chip ngoại lệ (exception-counts) qua HTTP, cho cả quản trị lẫn giáo viên có phạm vi.
// Chạy trên bản sao dùng một lần của database làm việc; dọn sạch sau khi chạy. Kết quả ghi artifacts/v6661-scale.json.
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

const SIZE = Number(process.env.SCALE_QUESTIONS) || 20000;
// Ngưỡng rộng rãi cho máy trường; mục tiêu là bắt truy vấn thoái hóa (giây, không phải mili giây).
const BUDGET_MS = Number(process.env.SCALE_BUDGET_MS) || 1500;
const name = 'nganhang_v6661scale_test_' + Date.now();
const adminPool = new pg.Pool({host: process.env.DB_HOST, port: process.env.DB_PORT, database: source, user: process.env.DB_USER, password: process.env.DB_PASSWORD});
const artifacts = path.resolve('../artifacts');
fs.mkdirSync(artifacts, {recursive: true});
const dump = path.join(artifacts, 'v6661scale-source.dump');
const env = {...process.env, PGHOST: process.env.DB_HOST, PGPORT: process.env.DB_PORT, PGUSER: process.env.DB_USER, PGPASSWORD: process.env.DB_PASSWORD};
const port = 3110, origin = 'http://127.0.0.1:' + port;
const pw = crypto.randomBytes(12).toString('base64url');
let db, server, uploadsDir, subjectId;
const tokens = {}, users = {};

async function req(method, url, body, token = tokens.admin) {
  const res = await fetch(origin + '/api' + url, {method,
    headers: {...(token ? {Authorization: 'Bearer ' + token} : {}), ...(body !== undefined ? {'Content-Type': 'application/json'} : {})},
    body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return {status: res.status, data};
}
const expect = (r, s) => assert.equal(r.status, s, typeof r.data === 'string' ? r.data : JSON.stringify(r.data));
const login = async username => { const r = await req('POST', '/auth/login', {username, password: pw}, null); expect(r, 200); return r.data.token; };

test.before(async () => {
  assert.equal(spawnSync('pg_dump', ['-Fc', '-d', source, '-f', dump], {env, encoding: 'utf8'}).status, 0);
  await adminPool.query('CREATE DATABASE ' + name);
  assert.equal(spawnSync('pg_restore', ['--no-owner', '--no-privileges', '-d', name, dump], {env, encoding: 'utf8'}).status, 0);
  db = new pg.Pool({host: process.env.DB_HOST, port: process.env.DB_PORT, database: name, user: process.env.DB_USER, password: process.env.DB_PASSWORD});

  const dep = (await db.query("INSERT INTO departments(code,name) VALUES('SCALE_DEP','Tổ đo tải') RETURNING id")).rows[0].id;
  subjectId = (await db.query("INSERT INTO subjects(code,name,department_id,is_integrated) VALUES('SCALEKHTN','KHTN đo tải',$1,true) RETURNING id", [dep])).rows[0].id;
  const branchId = (await db.query("INSERT INTO branches(subject_id,code,name) VALUES($1,'VL','Vật lí') RETURNING id", [subjectId])).rows[0].id;
  const year = (await db.query("INSERT INTO school_years(name,start_date,end_date) VALUES('Đo tải',CURRENT_DATE-30,CURRENT_DATE+330) RETURNING id")).rows[0].id;
  const klass = (await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('7A đo tải',7,$1) RETURNING id", [year])).rows[0].id;
  const bank = (await db.query("INSERT INTO banks(name,kind,department_id) VALUES('Kho đo tải','department',$1) RETURNING id", [dep])).rows[0].id;
  const outcome = (await db.query(`INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document,status,source_branch_code,source_ordinal,canonical_key,source_text)
    VALUES($1,7,'L','L.1','Tốc độ','SCALE','Fixture','ACTIVE','L',1,'SCALEKHTN:G7:L:1','Tốc độ') RETURNING id`, [subjectId])).rows[0].id;
  const yccd = (await db.query(`INSERT INTO curriculum_yccds(outcome_id,code,text,status,source_ordinal,canonical_key,source_text) VALUES($1,'L.1.1','YCCĐ đo tải','ACTIVE',1,'SCALEKHTN:G7:L:1:1','YCCĐ đo tải') RETURNING id`, [outcome])).rows[0].id;
  const topic = (await db.query("INSERT INTO topics(subject_id,grade,name,status,branch_id) VALUES($1,7,'Bài 8. Tốc độ chuyển động','ACTIVE',$2) RETURNING id", [subjectId, branchId])).rows[0].id;
  await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')", [topic, yccd]);
  const hash = await bcrypt.hash(pw, 10);
  for (const [k, username, role] of [['admin', 'scale_admin', 'admin'], ['author', 'scale_author', 'teacher']]) {
    users[k] = (await db.query('INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES($1,$2,$3,$4,false) RETURNING id', [username, hash, username, role])).rows[0].id;
  }

  uploadsDir = path.join(artifacts, 'v6661scale-uploads-' + name);
  fs.cpSync(path.resolve(process.env.UPLOAD_DIR || 'uploads'), uploadsDir, {recursive: true, errorOnExist: true});
  const output = fs.openSync(path.join(artifacts, 'v6661scale-server.log'), 'w');
  server = spawn(process.execPath, ['src/server.js'], {env: {...process.env, DB_NAME: name, UPLOAD_DIR: uploadsDir, PORT: String(port), HOST: '127.0.0.1'}, stdio: ['ignore', output, output], windowsHide: true});
  let ready = false;
  for (let i = 0; i < 240 && !ready; i++) {
    try { ready = (await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1000)})).ok; } catch {}
    if (!ready) await new Promise(r => setTimeout(r, 250));
  }
  assert(ready);
  tokens.admin = await login('scale_admin');
  expect(await req('PUT', `/staff/${users.author}/assignments`, {school_year_id: year, positions: [], teaching: [{subject_id: subjectId, class_ids: [klass]}], reason: 'Phân công đo tải kho lớn'}), 200);
  expect(await req('POST', '/practice/bank-permissions', {bank_id: bank, user_id: users.author, permission: 'write'}), 200);
  tokens.author = await login('scale_author');

  // Một câu mẫu tạo qua đúng API (có phiên bản, có mã chuẩn), rồi nhân bản bằng SQL cho nhanh.
  const template = await req('POST', '/practice/questions', {
    subject_id: subjectId, grade: 7, branch_id: branchId, outcome_id: outcome, yccd_id: yccd, topic_id: topic,
    cognitive_level: 1, type: 'multiple_choice', content_number: 1, stem: 'Câu mẫu đo tải', bank_id: bank,
    options: ['A', 'B', 'C', 'D'].map(k => ({id: k, text: 'PA ' + k})), answer: {correct: 'A'}, explanation: 'Lời giải',
  }, tokens.author);
  expect(template, 201);
  const skip = new Set(['id', 'question_code', 'current_version_id', 'active_version_id', 'created_at', 'updated_at', 'topic_id', 'cognitive_level', 'creator_id', 'stem_text', 'lesson_status']);
  const cols = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='questions' AND is_generated='NEVER' ORDER BY ordinal_position")).rows
    .map(r => r.column_name).filter(c => !skip.has(c));
  const started = Date.now();
  await db.query(`INSERT INTO questions(${cols.join(',')},question_code,topic_id,cognitive_level,creator_id,stem_text,lesson_status,created_at)
    SELECT ${cols.map(c => 't.' + c).join(',')}, 'SCALE-' || g,
           CASE WHEN g % 10 = 0 THEN NULL ELSE t.topic_id END,
           ('M' || (1 + g % 4))::text::cognitive_level,
           CASE WHEN g % 2 = 0 THEN $2::int ELSE $3::int END,
           'Câu đo tải số ' || g,
           CASE WHEN g % 10 = 0 THEN 'UNMAPPED' ELSE t.lesson_status END,
           now() - (g % 30) * interval '1 day'
    FROM generate_series(1, $4::int) g, questions t WHERE t.id=$1`, [template.data.id, users.author, users.admin, SIZE]);
  // 2% câu có hồ sơ rà soát nghi trùng mở — để các EXISTS trong truy vấn đếm có việc thật để làm.
  await db.query(`INSERT INTO question_review_cases(question_id,question_version_id,source,reason_code,severity,opened_by,evidence_snapshot)
    SELECT id,current_version_id,'TEACHER','DUPLICATE_SUSPECT','P2',$1,'[]'::jsonb FROM questions WHERE question_code LIKE 'SCALE-%' AND id % 50 = 0`, [users.admin]);
  await db.query('ANALYZE');
  console.log(`SCALE_SEED ${SIZE} câu trong ${Date.now() - started} ms`);
});

test.after(() => cleanupIntegration({server, db, adminPool, name, dump, uploadsDir}));

async function timed(url, token) {
  const runs = [];
  for (let i = 0; i < 4; i++) {
    const t = performance.now();
    const r = await req('GET', url, undefined, token);
    runs.push(performance.now() - t);
    expect(r, 200);
  }
  runs.shift(); // lần đầu là khởi động (kết nối, cache kế hoạch truy vấn)
  return Math.round(runs.sort((a, b) => a - b)[1]);
}

test(`V6661 tải: bàn làm việc với ${SIZE} câu — hàng đợi, Việc của tôi, chip ngoại lệ trong ngân sách`, {timeout: 600000}, async () => {
  const report = {size: SIZE, budget_ms: BUDGET_MS, results: {}};
  for (const [who, token] of [['admin', tokens.admin], ['teacher', tokens.author]]) {
    report.results[who] = {
      queue: await timed(`/practice/questions/queue?subject_id=${subjectId}&limit=30`, token),
      queue_exception_lesson: await timed(`/practice/questions/queue?subject_id=${subjectId}&exception=lesson&limit=30`, token),
      view_counts: await timed('/practice/questions/view-counts', token),
      exception_counts: await timed(`/practice/questions/exception-counts?subject_id=${subjectId}`, token),
    };
  }
  const counts = await req('GET', `/practice/questions/exception-counts?subject_id=${subjectId}`);
  report.counts = counts.data;
  fs.writeFileSync(path.join(artifacts, 'v6661-scale.json'), JSON.stringify(report, null, 2));
  console.log('SCALE_REPORT ' + JSON.stringify(report));
  assert.equal(counts.data.total >= SIZE, true);
  assert.equal(counts.data.duplicate >= Math.floor(SIZE / 50), true);
  for (const [who, result] of Object.entries(report.results)) {
    for (const [endpoint, ms] of Object.entries(result)) assert(ms <= BUDGET_MS, `${who} ${endpoint}: ${ms} ms > ${BUDGET_MS} ms`);
  }
});
