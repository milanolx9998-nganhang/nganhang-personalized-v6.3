// PERF V6.6.7 — Redis tùy chọn (sập vẫn chạy), rate limit đăng nhập chỉ đếm thất bại, insert bài theo lô,
// lưu bài trả is_final, số liệu pool / truy vấn chậm, header Cache-Control.
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
const name = 'nganhang_v667_test_' + Date.now();
const port = 3121, origin = `http://127.0.0.1:${port}`;
const artifacts = path.resolve('../artifacts');
fs.mkdirSync(artifacts, {recursive: true});
const dump = path.join(artifacts, 'v667-source.dump');
const uploadsDir = path.join(artifacts, 'v667-uploads-' + name);
const env = {...process.env, PGHOST: process.env.DB_HOST, PGPORT: process.env.DB_PORT, PGUSER: process.env.DB_USER, PGPASSWORD: process.env.DB_PASSWORD};
const connection = {host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD};
const adminPool = new pg.Pool({...connection, database: source});
const pw = crypto.randomBytes(12).toString('base64url');
const STUDENTS = 60;
let db, server, admin, subjectId, topicId, outcomeId, yccdId;

async function req(method, url, body, token) {
  const res = await fetch(origin + '/api' + url, {method,
    headers: {...(token ? {Authorization: 'Bearer ' + token} : {}), ...(body !== undefined ? {'Content-Type': 'application/json'} : {})},
    body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return {status: res.status, data, headers: res.headers};
}
const expect = (r, status) => assert.equal(r.status, status, JSON.stringify(r.data));
const login = async username => { const r = await req('POST', '/auth/login', {username, password: pw}); expect(r, 200); return r.data.token; };

test.before(async () => {
  const d = spawnSync('pg_dump', ['-Fc', '-d', source, '-f', dump], {env, encoding: 'utf8'});
  assert.equal(d.status, 0, d.stderr);
  await adminPool.query('CREATE DATABASE ' + name);
  const r = spawnSync('pg_restore', ['--no-owner', '--no-privileges', '-d', name, dump], {env, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  db = new pg.Pool({...connection, database: name});
  const hash = await bcrypt.hash(pw, 10);
  await db.query("INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES('v667_admin',$1,'v667_admin','admin',false)", [hash]);
  await db.query(`WITH u AS (INSERT INTO users(username,password_hash,full_name,role,must_change_password)
      SELECT 'v667_student_'||g,$1,'Học sinh '||g,'student',false FROM generate_series(1,$2) g RETURNING id,username)
    INSERT INTO student_profiles(user_id,student_code) SELECT id,username FROM u`, [hash, STUDENTS]);
  subjectId = (await db.query('SELECT id FROM subjects ORDER BY id LIMIT 1')).rows[0].id;
  topicId = (await db.query("INSERT INTO topics(subject_id,grade,name,status) VALUES($1,9,'Chủ đề V6.6.7','ACTIVE') RETURNING id", [subjectId])).rows[0].id;
  outcomeId = (await db.query("INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document) VALUES($1,9,'','V667.O','Fixture V6.6.7','TEST','Chỉ trong database kiểm thử') RETURNING id", [subjectId])).rows[0].id;
  yccdId = (await db.query("INSERT INTO curriculum_yccds(outcome_id,code,text) VALUES($1,'V667.Y','YCCĐ giả lập V6.6.7') RETURNING id", [outcomeId])).rows[0].id;
  await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')", [topicId, yccdId]);

  fs.mkdirSync(uploadsDir, {recursive: true});
  const log = fs.openSync(path.join(artifacts, 'v667-server.log'), 'w');
  server = spawn(process.execPath, ['src/server.js'], {
    // Redis trỏ vào cổng không có ai nghe: app phải chạy bình thường, cache báo "degraded".
    env: {...process.env, DB_NAME: name, UPLOAD_DIR: uploadsDir, PORT: String(port), HOST: '127.0.0.1',
      REDIS_URL: 'redis://127.0.0.1:6399', DB_POOL_MAX: '7', SLOW_QUERY_MS: '1'},
    stdio: ['ignore', log, log], windowsHide: true});
  let ready = false;
  for (let i = 0; i < 240; i++) {
    if (server.exitCode !== null) throw new Error('Server exited: ' + fs.readFileSync(path.join(artifacts, 'v667-server.log'), 'utf8'));
    try { if ((await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1000)})).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  assert(ready, 'Server not healthy');
  admin = await login('v667_admin');
  const bank = (await req('GET', '/practice/banks', undefined, admin)).data.find(b => b.kind === 'school');
  for (let i = 0; i < 12; i++) {
    const q = await req('POST', '/practice/questions', {subject_id: subjectId, topic_id: topicId, grade: 9, outcome_id: outcomeId, yccd_id: yccdId, type: 'multiple_choice', cognitive_level: 1,
      stem: `Câu V6.6.7 số ${i} ${crypto.randomUUID().slice(0, 6)}`, options: ['A', 'B', 'C', 'D'].map(id => ({id, text: 'Phương án ' + id})),
      answer: {correct: 'B'}, explanation: 'Lời giải', bank_id: bank.id}, admin);
    expect(q, 201);
    for (const status of ['pending_review', 'approved', 'active']) expect(await req('POST', `/practice/questions/${q.data.id}/workflow`, {status}, admin), 200);
  }
});

test.after(() => cleanupIntegration({server, db, adminPool, name, dump, uploadsDir}));

test('V667: Redis không kết nối được — app vẫn khỏe, cache báo degraded, API không cho lưu cache trình duyệt', async () => {
  const health = await req('GET', '/health');
  expect(health, 200);
  assert.equal(health.data.status, 'ok');
  assert.equal(health.data.database, 'ok');
  assert.equal(health.data.cache, 'degraded');
  const catalog = await req('GET', '/practice/catalog', undefined, admin);
  expect(catalog, 200);
  assert(catalog.data.topics.some(t => t.id === topicId), 'Catalog đọc thẳng DB khi không có cache');
  assert.equal(catalog.headers.get('cache-control'), 'private, no-store');
});

test('V667: cả lớp đăng nhập đúng cùng lúc từ một IP không bị chặn; sai quá trần theo IP vẫn bị chặn', async () => {
  const results = await Promise.all(Array.from({length: STUDENTS}, (_, i) =>
    req('POST', '/auth/login', {username: 'v667_student_' + (i + 1), password: pw})));
  assert.deepEqual([...new Set(results.map(r => r.status))], [200], 'Không lượt đăng nhập đúng nào bị 429');
});

test('V667: bài 10 câu tạo bằng một INSERT theo lô — đúng thứ tự, đúng câu; lưu chốt trả is_final', async () => {
  const token = await login('v667_student_1');
  const created = await req('POST', '/practice/attempts', {subject_id: subjectId, topic_ids: [topicId], grade: 9, count: 10,
    percent: [100, 0, 0, 0], types: ['multiple_choice'], mode: 'practice'}, token);
  expect(created, 201);
  const rows = (await db.query(`SELECT i.sequence,i.question_id,v.question_id AS version_question,i.curriculum_snapshot
    FROM attempt_items i JOIN question_versions v ON v.id=i.question_version_id WHERE i.attempt_id=$1 ORDER BY i.sequence`, [created.data.id])).rows;
  assert.deepEqual(rows.map(r => r.sequence), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert(rows.every(r => r.question_id === r.version_question), 'question_id khớp phiên bản câu');
  assert.equal(new Set(rows.map(r => r.question_id)).size, 10, 'Không trùng câu');

  const attempt = await req('GET', '/practice/attempts/' + created.data.id, undefined, token);
  expect(attempt, 200);
  const item = attempt.data.items[0];
  const draft = await req('PUT', `/practice/attempts/${created.data.id}/items/${item.id}`, {response: 'A', final: false}, token);
  expect(draft, 200);
  assert.equal(draft.data.is_final, false);
  const final = await req('PUT', `/practice/attempts/${created.data.id}/items/${item.id}`, {response: 'B', final: true}, token);
  expect(final, 200);
  assert.equal(final.data.is_final, true);
  assert.equal(final.data.result.score, 1, 'Chế độ luyện tập: chốt thì có kết quả ngay, không cần tải lại cả lượt');
  const dashboard = await req('GET', '/practice/dashboard', undefined, token);
  expect(dashboard, 200);
  assert(dashboard.data.attempts.some(a => a.id === created.data.id));
});

test('V667: số liệu vận hành có pool (cỡ theo DB_POOL_MAX), truy vấn chậm kèm route, rate limit, cache, worker mật khẩu', async () => {
  const ops = await req('GET', '/practice/operations', undefined, admin);
  expect(ops, 200);
  assert.equal(ops.data.db.pool.max, 7);
  assert(ops.data.db.queries.count > 0);
  assert(ops.data.db.queries.slow > 0, 'SLOW_QUERY_MS=1 thì phải ghi nhận truy vấn chậm');
  const slow = ops.data.db.queries.recent_slow.at(-1);
  assert(slow.query && slow.duration_ms >= 1);
  assert(ops.data.db.queries.recent_slow.some(s => /^(GET|POST|PUT) \/api\//.test(s.route || '')), 'Truy vấn chậm gắn route của request');
  assert(!JSON.stringify(ops.data.db.queries.recent_slow).includes(pw), 'Không ghi tham số (mật khẩu) vào log');
  assert.equal(ops.data.cache.status, 'degraded');
  assert(ops.data.rate_limit.fallback > 0, 'Redis sập: rate limit đếm trong bộ nhớ');
  assert(ops.data.password_workers.max >= 1);
  const ip = await req('GET', '/practice/operations/client-ip', undefined, admin);
  expect(ip, 200);
  assert.match(ip.data.ip, /127\.0\.0\.1|::1/);
  const student = await login('v667_student_2');
  expect(await req('GET', '/practice/operations', undefined, student), 403);
});

test('V667: sai mật khẩu quá trần theo IP thì bị chặn, kể cả lượt đúng sau đó', async () => {
  const failures = await Promise.all(Array.from({length: 50}, (_, i) =>
    req('POST', '/auth/login', {username: 'khong_ton_tai_' + i, password: 'sai-mat-khau'})));
  assert(failures.every(r => r.status === 401), JSON.stringify([...new Set(failures.map(r => r.status))]));
  await new Promise(r => setTimeout(r, 200));
  const blocked = await req('POST', '/auth/login', {username: 'v667_student_3', password: pw});
  expect(blocked, 429);
  assert(Number(blocked.headers.get('retry-after')) > 0);
});
