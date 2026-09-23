// V6.6.6 — bàn làm việc hợp nhất: sửa nhanh mức/Bài cho một câu hoặc cả lô (tất cả hoặc không),
// hoàn tác, góc nhìn "Việc của tôi", và luồng giao diện (phím tắt, bảng lệnh) trên trình duyệt thật.
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

const name = 'nganhang_v666_test_' + Date.now();
const adminPool = new pg.Pool({host: process.env.DB_HOST, port: process.env.DB_PORT, database: source, user: process.env.DB_USER, password: process.env.DB_PASSWORD});
const artifacts = path.resolve('../artifacts');
fs.mkdirSync(artifacts, {recursive: true});
const dump = path.join(artifacts, 'v666-source.dump');
const env = {...process.env, PGHOST: process.env.DB_HOST, PGPORT: process.env.DB_PORT, PGUSER: process.env.DB_USER, PGPASSWORD: process.env.DB_PASSWORD};

const port = 3108, origin = 'http://127.0.0.1:' + port;
const pw = crypto.randomBytes(12).toString('base64url');
let db, server, uploadsDir;
const tokens = {}, users = {}, lessons = {}, yccds = {};
let subjectId, subjectCode, branchId, bankId, classId, yearId, departmentId, outcomeId;

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
const login = async username => { const r = await req('POST', '/auth/login', {username, password: pw}, null); expect(r, 200); return r.data.token; };

// Câu tạo tay qua đúng API của trình soạn thảo. Có YCCĐ + số thì máy chủ tự sinh mã chuẩn.
let counter = 0;
async function createQuestion({yccd = 1, level = 1, topic = null, coded = true, token = tokens.author} = {}) {
  counter++;
  const r = await req('POST', '/practice/questions', {
    subject_id: subjectId, grade: 7, branch_id: branchId, outcome_id: outcomeId, yccd_id: yccds[yccd],
    topic_id: topic, cognitive_level: level, type: 'multiple_choice', ...(coded ? {content_number: counter} : {}),
    stem: `Câu kiểm thử bàn làm việc ${counter} ${crypto.randomUUID().slice(0, 6)}`, bank_id: bankId,
    options: ['A', 'B', 'C', 'D'].map(k => ({id: k, text: 'Phương án ' + k})), answer: {correct: 'B'}, explanation: 'Lời giải kiểm thử',
  }, token);
  expect(r, 201);
  return (await db.query("SELECT id,current_version_id,topic_id,cognitive_level::text AS level,normalized_content->>'display_code' AS code,lesson_status FROM questions WHERE id=$1", [r.data.id])).rows[0];
}
const state = async id => (await db.query("SELECT id,current_version_id,topic_id,cognitive_level::text AS level,normalized_content->>'display_code' AS code,lesson_status FROM questions WHERE id=$1", [id])).rows[0];

test.before(async () => {
  const d = spawnSync('pg_dump', ['-Fc', '-d', source, '-f', dump], {env, encoding: 'utf8'});
  assert.equal(d.status, 0, d.stderr);
  await adminPool.query('CREATE DATABASE ' + name);
  const restored = spawnSync('pg_restore', ['--no-owner', '--no-privileges', '-d', name, dump], {env, encoding: 'utf8'});
  assert.equal(restored.status, 0, restored.stderr);
  db = new pg.Pool({host: process.env.DB_HOST, port: process.env.DB_PORT, database: name, user: process.env.DB_USER, password: process.env.DB_PASSWORD});

  departmentId = (await db.query("INSERT INTO departments(code,name) VALUES('V666_DEP','Tổ kiểm thử V6.6.6') RETURNING id")).rows[0].id;
  subjectCode = 'V666KHTN';
  subjectId = (await db.query("INSERT INTO subjects(code,name,department_id,is_integrated) VALUES($1,'KHTN kiểm thử V6.6.6',$2,true) RETURNING id", [subjectCode, departmentId])).rows[0].id;
  branchId = (await db.query("INSERT INTO branches(subject_id,code,name) VALUES($1,'VL','Vật lí') RETURNING id", [subjectId])).rows[0].id;
  yearId = (await db.query("INSERT INTO school_years(name,start_date,end_date) VALUES('V666 kiểm thử',CURRENT_DATE-30,CURRENT_DATE+330) RETURNING id")).rows[0].id;
  classId = (await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('7A V666',7,$1) RETURNING id", [yearId])).rows[0].id;
  bankId = (await db.query("INSERT INTO banks(name,kind,department_id) VALUES('Kho tổ V6.6.6','department',$1) RETURNING id", [departmentId])).rows[0].id;

  outcomeId = (await db.query(
    `INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document,status,source_branch_code,source_ordinal,canonical_key,source_text)
     VALUES($1,7,'L','L.1','Tốc độ','V666','Fixture','ACTIVE','L',1,$2,'Tốc độ') RETURNING id`, [subjectId, `${subjectCode}:G7:L:1`])).rows[0].id;
  for (const n of [1, 2, 3]) {
    yccds[n] = (await db.query(
      `INSERT INTO curriculum_yccds(outcome_id,code,text,status,source_ordinal,canonical_key,source_text) VALUES($1,$2,$3,'ACTIVE',$4,$5,$3) RETURNING id`,
      [outcomeId, 'L.1.' + n, 'YCCĐ kiểm thử ' + n, n, `${subjectCode}:G7:L:1:${n}`])).rows[0].id;
  }
  for (const [label, keys] of [['Bài 8. Tốc độ chuyển động', [1, 2]], ['Bài 9. Đo tốc độ', [3]], ['Bài 10. Không liên kết', []]]) {
    const topic = (await db.query("INSERT INTO topics(subject_id,grade,name,status,branch_id) VALUES($1,7,$2,'ACTIVE',$3) RETURNING id", [subjectId, label, branchId])).rows[0];
    for (const k of keys) await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')", [topic.id, yccds[k]]);
    lessons[label.split('.')[0]] = topic.id;
  }

  const hash = await bcrypt.hash(pw, 10);
  for (const [k, username, role] of [['admin', 'v666_admin', 'admin'], ['author', 'v666_author', 'teacher'], ['outsider', 'v666_outsider', 'teacher']]) {
    users[k] = (await db.query('INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES($1,$2,$3,$4,false) RETURNING id', [username, hash, username, role])).rows[0].id;
  }

  uploadsDir = path.join(artifacts, 'v666-uploads-' + name);
  fs.cpSync(path.resolve(process.env.UPLOAD_DIR || 'uploads'), uploadsDir, {recursive: true, errorOnExist: true});
  const output = fs.openSync(path.join(artifacts, 'v666-server.log'), 'w');
  server = spawn(process.execPath, ['src/server.js'], {
    env: {...process.env, DB_NAME: name, UPLOAD_DIR: uploadsDir, PORT: String(port), HOST: '127.0.0.1'},
    stdio: ['ignore', output, output], windowsHide: true,
  });
  let ready = false;
  for (let i = 0; i < 240; i++) {
    if (server.exitCode !== null) throw new Error('Server exited: ' + fs.readFileSync(path.join(artifacts, 'v666-server.log'), 'utf8'));
    try { const r = await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1000)}); if (r.ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  assert(ready, 'Server not healthy');

  tokens.admin = await login('v666_admin');
  expect(await req('PUT', `/staff/${users.author}/assignments`, {
    school_year_id: yearId, positions: [], teaching: [{subject_id: subjectId, class_ids: [classId]}], reason: 'Phân công kiểm thử V6.6.6',
  }), 200);
  expect(await req('POST', '/practice/bank-permissions', {bank_id: bankId, user_id: users.author, permission: 'write'}), 200);
  tokens.author = await login('v666_author');
  tokens.outsider = await login('v666_outsider');
});

test.after(async () => {
  server?.kill();
  await db?.end();
  await adminPool.end();
});

test('V666: tạo tay có YCCĐ + số thì có mã chuẩn', async () => {
  const q = await createQuestion({yccd: 3, level: 1, topic: lessons['Bài 9']});
  assert.match(q.code, /^Câu L\. 1\. 3\. NB\. \d+\. TN$/);
});

test('V666: đổi mức câu có mã phải tạo lại mã; hoàn tác trả đúng mức, mã và Bài', async () => {
  const q = await createQuestion({yccd: 3, level: 1, topic: lessons['Bài 9']});
  const body = {ids: [q.id], changes: {cognitive_level: 3}, expected_versions: {[q.id]: q.current_version_id}};

  const preview = await req('POST', '/practice/questions/quick-edit/preflight', body, tokens.author);
  expect(preview, 200);
  assert.equal(preview.data.blocked[0].reason_code, 'CODE_METADATA_CONFLICT');
  assert.match(preview.data.blocked[0].suggested_code, /^Câu L\. 1\. 3\. VD\./);
  const refused = await req('POST', '/practice/questions/quick-edit', body, tokens.author);
  expect(refused, 409);
  assert.equal((await state(q.id)).level, 'M1', 'Bị chặn thì không đổi gì');

  const done = await req('POST', '/practice/questions/quick-edit', {...body, regenerate_code: true}, tokens.author);
  expect(done, 200);
  const item = done.data.items[0];
  assert.equal(item.before.cognitive_level, 1);
  assert.equal(item.after.cognitive_level, 3);
  assert.match(item.after.display_code, /\. VD\. /);
  assert.match(item.current_version_id, /^[0-9a-f-]{36}$/);
  const after = await state(q.id);
  assert.equal(after.level, 'M3');
  assert.equal(after.code, item.after.display_code);

  // Hoàn tác đúng dạng giao diện gửi (items + regenerate + allow_unlinked).
  const undo = await req('POST', '/practice/questions/quick-edit', {
    items: [{id: q.id, cognitive_level: item.before.cognitive_level}], regenerate_code: true, allow_unlinked: true, reason: 'Hoàn tác',
  }, tokens.author);
  expect(undo, 200);
  const back = await state(q.id);
  assert.equal(back.level, 'M1');
  assert.equal(back.code, q.code);
  assert.equal(back.topic_id, lessons['Bài 9']);
});

test('V666: cả lô — câu không mã đổi ngay, câu có mã tách riêng; tất cả hoặc không', async () => {
  const coded = await createQuestion({yccd: 1, level: 1, topic: lessons['Bài 8']});
  const plain = await createQuestion({yccd: 1, level: 1, topic: lessons['Bài 8'], coded: false});
  assert.doesNotMatch(plain.code || '', /^Câu L\./);
  const ids = [coded.id, plain.id];
  const preview = await req('POST', '/practice/questions/quick-edit/preflight', {ids, changes: {cognitive_level: 2}}, tokens.author);
  expect(preview, 200);
  assert.deepEqual(preview.data.eligible.map(e => e.question_id), [plain.id]);
  assert.deepEqual(preview.data.blocked.map(b => b.question_id), [coded.id]);
  assert.equal((await state(plain.id)).level, 'M1', 'Preflight không ghi gì');

  const atomic = await req('POST', '/practice/questions/quick-edit', {ids, changes: {cognitive_level: 2}}, tokens.author);
  expect(atomic, 409);
  assert.equal(atomic.data.details.atomic, true);
  assert.equal((await state(plain.id)).level, 'M1', 'Một câu bị chặn thì không đổi câu nào');

  expect(await req('POST', '/practice/questions/quick-edit', {ids: [plain.id], changes: {cognitive_level: 2}}, tokens.author), 200);
  assert.equal((await state(plain.id)).level, 'M2');
  const both = await req('POST', '/practice/questions/quick-edit', {ids, changes: {cognitive_level: 4}, regenerate_code: true}, tokens.author);
  expect(both, 200);
  assert.match((await state(coded.id)).code, /\. VDC\. /);
});

test('V666: Bài — chỉ Bài liên kết YCCĐ; bỏ Bài về “chưa gắn”; hoàn tác gán Bài hàng loạt', async () => {
  const q = await createQuestion({yccd: 1, level: 1, topic: lessons['Bài 8']});
  const unlinked = await req('POST', '/practice/questions/quick-edit', {ids: [q.id], changes: {topic_id: lessons['Bài 10']}}, tokens.author);
  expect(unlinked, 409);
  assert.equal(unlinked.data.details.blocked[0].reason_code, 'LESSON_NOT_LINKED');

  expect(await req('POST', '/practice/questions/quick-edit', {ids: [q.id], changes: {topic_id: null}}, tokens.author), 200);
  let s = await state(q.id);
  assert.equal(s.topic_id, null);
  assert.equal(s.lesson_status, 'UNMAPPED');

  const assigned = await req('POST', '/practice/questions/assign-lesson', {assignments: [{question_ids: [q.id], topic_id: lessons['Bài 8']}]}, tokens.author);
  expect(assigned, 200);
  assert.equal(assigned.data.items[0].before_topic_id, null);
  assert.match(assigned.data.items[0].current_version_id, /^[0-9a-f-]{36}$/);
  expect(await req('POST', '/practice/questions/quick-edit', {items: [{id: q.id, topic_id: null}], allow_unlinked: true}, tokens.author), 200);
  s = await state(q.id);
  assert.equal(s.topic_id, null, 'Hoàn tác gán Bài trả về đúng trạng thái trước');
});

test('V666: phiên bản cũ, câu đang chờ duyệt và câu ngoài phạm vi đều bị chặn', async () => {
  const q = await createQuestion({yccd: 2, level: 1, topic: lessons['Bài 8'], coded: false});
  const stale = await req('POST', '/practice/questions/quick-edit', {ids: [q.id], changes: {cognitive_level: 2}, expected_versions: {[q.id]: crypto.randomUUID()}}, tokens.author);
  expect(stale, 409);
  assert.equal(stale.data.details.blocked[0].reason_code, 'STALE_VERSION');

  expect(await req('POST', '/practice/questions/bulk-workflow', {ids: [q.id], action: 'submit'}, tokens.author), 200);
  const pending = await req('POST', '/practice/questions/quick-edit', {ids: [q.id], changes: {cognitive_level: 2}}, tokens.author);
  expect(pending, 409);
  assert.match(pending.data.details.blocked[0].message, /chờ duyệt/i);

  const outside = await req('POST', '/practice/questions/quick-edit', {ids: [q.id], changes: {cognitive_level: 2}}, tokens.outsider);
  assert.notEqual(outside.status, 200);
  assert.equal((await state(q.id)).level, 'M1');

  expect(await req('POST', '/practice/questions/quick-edit', {ids: [q.id], items: [{id: q.id, cognitive_level: 2}]}, tokens.author), 400);
});

test('V666: “Việc của tôi” đếm đúng bằng hàng đợi cùng bộ lọc', async () => {
  const r = await req('GET', '/practice/questions/view-counts', undefined, tokens.author);
  expect(r, 200);
  const keys = r.data.map(v => v.key);
  for (const k of ['today', 'drafts', 'returned', 'nolesson', 'duplicate']) assert.equal(keys.includes(k), true, k);
  assert.equal(keys.includes('pending'), false, 'Giáo viên chỉ biên soạn không có góc nhìn Chờ duyệt');
  for (const view of r.data) {
    const queue = await req('GET', '/practice/questions/queue?' + view.query + '&limit=1', undefined, tokens.author);
    expect(queue, 200);
    assert.equal(queue.data.total, view.count, view.key);
  }
  assert.equal(r.data.find(v => v.key === 'today').count > 0, true);
  const admin = await req('GET', '/practice/questions/view-counts');
  assert.equal(admin.data.some(v => v.key === 'pending'), true);
});

test('V666 UI: bàn làm việc — phím 3 đổi mức, tạo lại mã, Ctrl+Z hoàn tác, Ctrl+K lọc', {timeout: 90000}, async () => {
  const q = await createQuestion({yccd: 3, level: 1, topic: lessons['Bài 9']});
  const {chromium} = await import('playwright');
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}}), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/login');
    await page.getByPlaceholder('admin').fill('v666_author');
    await page.locator('input[type=password]').fill(pw);
    await page.getByRole('button', {name: 'Đăng nhập', exact: true}).click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'));
    await page.goto(origin + '/practice/banks?search=' + encodeURIComponent(q.code));
    await page.getByRole('navigation', {name: 'Góc nhìn'}).getByText('Tôi nhập hôm nay').waitFor();
    await page.locator('.queue-table tbody tr').first().click();
    await page.getByRole('group', {name: 'Mức nhận thức'}).waitFor();

    await page.keyboard.press('3');
    await page.getByRole('button', {name: 'Tạo lại mã theo mức mới'}).click();
    await page.locator('.undo-toast').getByText(/tạo lại mã/).waitFor();
    assert.match((await state(q.id)).code, /\. VD\. /);

    await page.keyboard.press('Control+z');
    await page.locator('.undo-toast').getByText('Đã hoàn tác.').waitFor();
    const back = await state(q.id);
    assert.equal(back.level, 'M1');
    assert.equal(back.code, q.code);

    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', {name: 'Bảng lệnh'});
    await palette.waitFor();
    await palette.getByRole('combobox').fill('loc chua gan');
    await palette.getByRole('option', {name: /Lọc: Chưa gắn Bài/}).waitFor();
    await page.keyboard.press('Enter');
    await page.waitForURL(/exception=lesson/);
    await page.getByRole('group', {name: 'Lọc theo kiểm tra máy'}).getByRole('button', {name: 'Chưa gắn Bài', pressed: true}).waitFor();
    await page.getByText('Không có câu hỏi trong bộ lọc này.').waitFor();
    await page.screenshot({path: path.join(artifacts, 'v666-workbench.png'), fullPage: true});
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
