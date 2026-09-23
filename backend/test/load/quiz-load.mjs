// Đo tải luồng làm bài của học sinh trên máy local (PERF V6.6.7). Không nằm trong npm test.
//
//   node test/load/quiz-load.mjs [nhãn]
//
// Dựng database tạm (bản sao DB local), seed học sinh + câu đã duyệt, khởi động server riêng rồi chạy lần lượt:
// đăng nhập dồn → trang chủ (dashboard, bài giao, catalog) → bắt đầu bài dồn → mở bài → trả lời từng câu
// (lưu nháp + chốt) → nộp dồn → dashboard. Ghi p50/p95/p99 từng API vào artifacts/perf/<nhãn>.json.
//
// Biến môi trường:
//   LOAD_USERS=120            số học sinh đồng thời
//   LOAD_ITEMS=10             số câu mỗi bài
//   LOAD_RELOAD_AFTER_FINAL=1 mô phỏng Player cũ: sau mỗi lần chốt câu tải lại cả lượt làm bài
//   LOAD_THINK_MS=150         nghỉ ngẫu nhiên tối đa giữa hai thao tác của một học sinh
//   LOAD_LOGIN_CONCURRENCY=0  số lượt đăng nhập cùng lúc (0 = tất cả cùng lúc, như cả lớp bấm cùng lúc)
//   LOAD_SERVER_ENV='{"REDIS_URL":"redis://..."}'  biến môi trường thêm cho server được đo
//   KEEP_ARTIFACTS=1          giữ database tạm để điều tra
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import {cleanupIntegration} from '../integration/helpers/cleanup.js';

const label = process.argv[2] || 'run-' + new Date().toISOString().replace(/[:.]/g, '-');
const USERS = Number(process.env.LOAD_USERS || 120);
const ITEMS = Number(process.env.LOAD_ITEMS || 10);
const RELOAD = process.env.LOAD_RELOAD_AFTER_FINAL !== '0';
const THINK = Number(process.env.LOAD_THINK_MS || 150);
const LOGIN_CONCURRENCY = Number(process.env.LOAD_LOGIN_CONCURRENCY || 0);
const port = Number(process.env.LOAD_PORT || 3120), origin = `http://127.0.0.1:${port}`;
const source = process.env.DB_NAME;
if (!source?.startsWith('nganhang_personalized')) throw new Error('Cần DB_NAME local nganhang_personalized*');
const name = 'nganhang_load_test_' + Date.now();
const artifacts = path.resolve('../artifacts'), perfDir = path.join(artifacts, 'perf');
fs.mkdirSync(perfDir, {recursive: true});
const dump = path.join(artifacts, 'load-source.dump'), uploadsDir = path.join(artifacts, 'load-uploads-' + name);
const env = {...process.env, PGHOST: process.env.DB_HOST, PGPORT: process.env.DB_PORT, PGUSER: process.env.DB_USER, PGPASSWORD: process.env.DB_PASSWORD};
const connection = {host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD};
const adminPool = new pg.Pool({...connection, database: source});
const pw = crypto.randomBytes(12).toString('base64url');
let db, server;

// ---- Đo ----
const samples = new Map();
function record(key, ms, status) {
  const s = samples.get(key) || {times: [], statuses: {}};
  s.times.push(ms); s.statuses[status] = (s.statuses[status] || 0) + 1;
  samples.set(key, s);
}
async function call(key, method, url, body, token) {
  const started = performance.now();
  let status = 0, data = null;
  try {
    const res = await fetch(origin + '/api' + url, {method,
      headers: {...(token ? {Authorization: 'Bearer ' + token} : {}), ...(body !== undefined ? {'Content-Type': 'application/json'} : {})},
      body: body === undefined ? undefined : JSON.stringify(body)});
    status = res.status;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }
  } catch (e) { status = 'ERR'; data = e.message; }
  record(key, performance.now() - started, status);
  return {status, data};
}
const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p / 100 * sorted.length) - 1)] : null;
function summary() {
  const out = {};
  for (const [key, s] of samples) {
    const t = [...s.times].sort((a, b) => a - b);
    const ok = Object.entries(s.statuses).filter(([k]) => /^2/.test(k)).reduce((n, [, v]) => n + v, 0);
    out[key] = {count: t.length, errors: t.length - ok, statuses: s.statuses,
      p50: Math.round(pct(t, 50)), p95: Math.round(pct(t, 95)), p99: Math.round(pct(t, 99)), max: Math.round(t[t.length - 1])};
  }
  return out;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const think = () => sleep(Math.random() * THINK);
async function phase(title, fn) {
  const started = performance.now();
  await fn();
  const ms = Math.round(performance.now() - started);
  phases.push({phase: title, ms});
  console.log(`  ${title}: ${ms} ms`);
}
const phases = [];

// ---- Dựng môi trường ----
async function setup() {
  const d = spawnSync('pg_dump', ['-Fc', '-d', source, '-f', dump], {env, encoding: 'utf8'});
  if (d.status !== 0) throw new Error(d.stderr);
  await adminPool.query('CREATE DATABASE ' + name);
  const r = spawnSync('pg_restore', ['--no-owner', '--no-privileges', '-d', name, dump], {env, encoding: 'utf8'});
  if (r.status !== 0) throw new Error(r.stderr);
  db = new pg.Pool({...connection, database: name});

  const hash = await bcrypt.hash(pw, 10);
  await db.query("INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES('load_admin',$1,'load_admin','admin',false)", [hash]);
  await db.query(`WITH u AS (INSERT INTO users(username,password_hash,full_name,role,must_change_password)
      SELECT 'load_student_'||g,$1,'Học sinh tải '||g,'student',false FROM generate_series(1,$2) g RETURNING id,username)
    INSERT INTO student_profiles(user_id,student_code) SELECT id,username FROM u`, [hash, USERS]);
  const subjectId = (await db.query('SELECT id FROM subjects ORDER BY id LIMIT 1')).rows[0].id;
  const topicId = (await db.query("INSERT INTO topics(subject_id,grade,name,status) VALUES($1,9,'Chủ đề đo tải','ACTIVE') RETURNING id", [subjectId])).rows[0].id;
  const outcome = (await db.query("INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document) VALUES($1,9,'','LOAD.O','Fixture đo tải','TEST','Chỉ trong database đo tải') RETURNING id", [subjectId])).rows[0].id;
  const yccd = (await db.query("INSERT INTO curriculum_yccds(outcome_id,code,text) VALUES($1,'LOAD.Y','YCCĐ giả lập đo tải') RETURNING id", [outcome])).rows[0].id;
  await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')", [topicId, yccd]);

  fs.mkdirSync(uploadsDir, {recursive: true});
  const log = fs.openSync(path.join(artifacts, 'load-server.log'), 'w');
  const extra = process.env.LOAD_SERVER_ENV ? JSON.parse(process.env.LOAD_SERVER_ENV) : {};
  server = spawn(process.execPath, ['src/server.js'], {env: {...process.env, DB_NAME: name, UPLOAD_DIR: uploadsDir, PORT: String(port), HOST: '127.0.0.1', ...extra},
    stdio: ['ignore', log, log], windowsHide: true});
  for (let i = 0; i < 240; i++) {
    if (server.exitCode !== null) throw new Error('Server dừng: ' + fs.readFileSync(path.join(artifacts, 'load-server.log'), 'utf8'));
    try { if ((await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1000)})).ok) break; } catch {}
    await sleep(250);
  }
  const admin = (await call('seed:login', 'POST', '/auth/login', {username: 'load_admin', password: pw})).data.token;
  const bank = (await call('seed:banks', 'GET', '/practice/banks', undefined, admin)).data.find(b => b.kind === 'school');
  const target = Math.max(ITEMS * 3, 30);
  for (let i = 0; i < target; i++) {
    const q = await call('seed:question', 'POST', '/practice/questions', {subject_id: subjectId, topic_id: topicId, grade: 9, outcome_id: outcome, yccd_id: yccd,
      type: 'multiple_choice', cognitive_level: 1, stem: `Câu đo tải ${i} ${crypto.randomUUID().slice(0, 6)}`,
      options: ['A', 'B', 'C', 'D'].map(id => ({id, text: 'Phương án ' + id})), answer: {correct: 'B'}, explanation: 'Lời giải', bank_id: bank.id}, admin);
    if (q.status !== 201) throw new Error('Tạo câu lỗi: ' + JSON.stringify(q.data));
    for (const status of ['pending_review', 'approved', 'active']) await call('seed:workflow', 'POST', `/practice/questions/${q.data.id}/workflow`, {status}, admin);
  }
  return {subjectId, topicId, admin};
}

// ---- Kịch bản ----
async function run({subjectId, topicId, admin}) {
  const users = Array.from({length: USERS}, (_, i) => ({username: 'load_student_' + (i + 1)}));
  const config = {subject_id: subjectId, topic_ids: [topicId], grade: 9, count: ITEMS, percent: [100, 0, 0, 0], types: ['multiple_choice'], mode: 'practice'};
  const login = async u => { u.token = (await call('POST /auth/login', 'POST', '/auth/login', {username: u.username, password: pw})).data?.token; };
  await phase('login dồn', async () => {
    if (!LOGIN_CONCURRENCY) return Promise.all(users.map(login));
    const queue = [...users];
    await Promise.all(Array.from({length: LOGIN_CONCURRENCY}, async () => { while (queue.length) await login(queue.shift()); }));
  });
  await phase('trang chủ', () => Promise.all(users.map(async u => {
    await call('GET /practice/dashboard', 'GET', '/practice/dashboard', undefined, u.token);
    await call('GET /practice/assignments', 'GET', '/practice/assignments', undefined, u.token);
    await call('GET /practice/catalog', 'GET', '/practice/catalog', undefined, u.token);
  })));
  await phase('bắt đầu dồn', () => Promise.all(users.map(async u => {
    const a = await call('POST /practice/attempts', 'POST', '/practice/attempts', config, u.token);
    u.attempt = a.status === 201 ? a.data.id : null;
  })));
  await phase('làm bài', () => Promise.all(users.map(async u => {
    if (!u.attempt) return;
    const a = await call('GET /practice/attempts/:id', 'GET', '/practice/attempts/' + u.attempt, undefined, u.token);
    for (const item of a.data?.items || []) {
      await think();
      const answer = ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
      await call('PUT save (nháp)', 'PUT', `/practice/attempts/${u.attempt}/items/${item.id}`, {response: answer, uncertain: false, skipped: false, final: false}, u.token);
      await call('PUT save (chốt)', 'PUT', `/practice/attempts/${u.attempt}/items/${item.id}`, {response: answer, uncertain: false, skipped: false, final: true}, u.token);
      if (RELOAD) await call('GET attempt sau chốt', 'GET', '/practice/attempts/' + u.attempt, undefined, u.token);
    }
  })));
  await phase('nộp dồn', () => Promise.all(users.map(async u => {
    if (u.attempt) await call('POST submit', 'POST', `/practice/attempts/${u.attempt}/submit`, {}, u.token);
  })));
  await phase('xem kết quả', () => Promise.all(users.map(async u => {
    if (u.attempt) await call('GET /practice/attempts/:id (kết quả)', 'GET', '/practice/attempts/' + u.attempt, undefined, u.token);
    await call('GET /practice/dashboard', 'GET', '/practice/dashboard', undefined, u.token);
  })));
  const ops = await call('ops', 'GET', '/practice/operations', undefined, admin);
  return ops.status === 200 ? ops.data : null;
}

try {
  console.log(`Đo tải "${label}": ${USERS} học sinh × ${ITEMS} câu, reload sau chốt=${RELOAD}, login cùng lúc=${LOGIN_CONCURRENCY || 'tất cả'}`);
  const ctx = await setup();
  samples.clear();
  const started = performance.now();
  const ops = await run(ctx);
  const result = {label, at: new Date().toISOString(), users: USERS, items: ITEMS, reload_after_final: RELOAD, think_ms: THINK, login_concurrency: LOGIN_CONCURRENCY,
    total_ms: Math.round(performance.now() - started), phases, endpoints: summary(), operations: ops};
  const file = path.join(perfDir, label + '.json');
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  console.log('\nAPI                                  n    lỗi   p50   p95   p99   max');
  for (const [key, s] of Object.entries(result.endpoints)) {
    if (key.startsWith('seed:') || key === 'ops') continue;
    console.log(`${key.padEnd(36)} ${String(s.count).padStart(5)} ${String(s.errors).padStart(5)} ${String(s.p50).padStart(5)} ${String(s.p95).padStart(5)} ${String(s.p99).padStart(5)} ${String(s.max).padStart(5)}`
      + (s.errors ? '  ' + JSON.stringify(s.statuses) : ''));
  }
  console.log('\nKết quả: ' + file);
} finally {
  await cleanupIntegration({server, db, adminPool, name, dump, uploadsDir});
}
