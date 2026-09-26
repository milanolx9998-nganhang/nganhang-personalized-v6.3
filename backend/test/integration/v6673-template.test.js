// V6.6.7.3 — file mẫu chương trình môn học: tải về (kèm dữ liệu) → sửa → kiểm tra (lỗi từng dòng / khác biệt) → bản nháp
// → sửa danh sách Bài trên web → công bố (Bài + liên kết dựng lại, mã câu đọc theo bản mới). Quyền: GV thường không nạp được.
import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import XLSX from 'xlsx';
import {cleanupIntegration} from './helpers/cleanup.js';

const hasSources = fs.existsSync(path.resolve('src/db/seed-data/curriculum/Outcome_YCCD_KHTN_9.xlsx'));
const skip = hasSources ? false : 'Thiếu workbook KHTN 9 trong src/db/seed-data/curriculum';
const source = process.env.DB_NAME;
if (!source?.startsWith('nganhang_personalized')) throw new Error('Integration tests require an isolated personalized database');
const name = 'nganhang_v6673_test_' + Date.now();
const port = 3124, origin = `http://127.0.0.1:${port}`;
const artifacts = path.resolve('../artifacts');
fs.mkdirSync(artifacts, {recursive: true});
const dump = path.join(artifacts, 'v6673-source.dump');
const uploadsDir = path.join(artifacts, 'v6673-uploads-' + name);
const env = {...process.env, PGHOST: process.env.DB_HOST, PGPORT: process.env.DB_PORT, PGUSER: process.env.DB_USER, PGPASSWORD: process.env.DB_PASSWORD};
const connection = {host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD};
const adminPool = new pg.Pool({...connection, database: source});
const pw = crypto.randomBytes(12).toString('base64url');
let db, server, token, teacherToken, subjectId, bankId, original, draftId;

async function call(method, url, body, as = token) {
  const res = await fetch(origin + '/api' + url, {method, headers: {Authorization: 'Bearer ' + as, ...(body !== undefined ? {'Content-Type': 'application/json'} : {})}, body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return {status: res.status, data};
}
async function upload(url, buffer, fields, as = token) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  form.append('file', new Blob([buffer]), 'Mau_chuong_trinh.xlsx');
  const res = await fetch(origin + '/api' + url, {method: 'POST', headers: {Authorization: 'Bearer ' + as}, body: form});
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return {status: res.status, data};
}
const expect = (r, s) => assert.equal(r.status, s, typeof r.data === 'string' ? r.data : JSON.stringify(r.data).slice(0, 2000));
const run = (file, ...args) => spawnSync(process.execPath, [file, ...args], {env: {...process.env, DB_NAME: name, SLOW_QUERY_MS: '600000'}, encoding: 'utf8'});
const scope = () => ({subject_id: subjectId, grade: 9});
const q = () => `subject_id=${subjectId}&grade=9`;
// Đọc / sửa workbook như giáo viên sửa trong Excel.
const sheets = buffer => { const wb = XLSX.read(buffer, {type: 'buffer'}); return Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], {header: 1, defval: ''})])); };
function workbook(data) { const wb = XLSX.utils.book_new(); for (const [n, rows] of Object.entries(data)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n); return XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'}); }

async function login(username) {
  const r = await fetch(origin + '/api/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, password: pw})});
  return (await r.json()).token;
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
  const dep = (await db.query("INSERT INTO departments(code,name) VALUES('V6673_DEP','Tổ mẫu') RETURNING id")).rows[0].id;
  bankId = (await db.query("INSERT INTO banks(name,kind,department_id) VALUES('Kho mẫu','department',$1) RETURNING id", [dep])).rows[0].id;
  const hash = await bcrypt.hash(pw, 10);
  await db.query("INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES('v6673_admin',$1,'v6673_admin','admin',false),('v6673_teacher',$1,'v6673_teacher','teacher',false)", [hash]);
  // Như máy chủ: chương trình KHTN 9 nạp + công bố bằng CLI, Bài seed từ KHDH.
  for (const args of [['scripts/import-khtn-curriculum.mjs', '--grade', '9', '--apply', '--actor', 'v6673_admin', '--publish', '--accept-source-warnings'], ['src/db/seed-khtn-lessons.js', '--grade', '9']]) {
    const x = run(...args);
    assert.equal(x.status, 0, x.stderr + x.stdout);
  }
  fs.mkdirSync(uploadsDir, {recursive: true});
  const log = fs.openSync(path.join(artifacts, 'v6673-server.log'), 'w');
  server = spawn(process.execPath, ['src/server.js'], {env: {...process.env, DB_NAME: name, UPLOAD_DIR: uploadsDir, PORT: String(port), HOST: '127.0.0.1'}, stdio: ['ignore', log, log], windowsHide: true});
  let ready = false;
  for (let i = 0; i < 240; i++) {
    if (server.exitCode !== null) throw new Error('Server exited: ' + fs.readFileSync(path.join(artifacts, 'v6673-server.log'), 'utf8'));
    try { if ((await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1000)})).ok) { ready = true; break; } } catch {}
    await new Promise(res => setTimeout(res, 250));
  }
  assert(ready, 'Server not healthy');
  token = await login('v6673_admin');
  teacherToken = await login('v6673_teacher');
});

test.after(() => cleanupIntegration({server, db, adminPool, name, dump, uploadsDir}));

test('V6673 mẫu: tải về có sẵn chương trình + Bài; tải lại nguyên file → hợp lệ, không thay đổi', {skip}, async () => {
  const res = await fetch(origin + `/api/curriculum/template?${q()}`, {headers: {Authorization: 'Bearer ' + token}});
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /Mau_chuong_trinh_KHTN_khoi9\.xlsx/);
  original = Buffer.from(await res.arrayBuffer());
  const s = sheets(original);
  assert.deepEqual(Object.keys(s), ['Hướng dẫn', 'Chương trình', 'Bài học', 'Ví dụ', 'Dùng AI']);
  assert.deepEqual(s['Chương trình'][0], ['Phân môn', 'Số Chủ đề', 'Tên Chủ đề (Outcome)', 'Số YCCĐ', 'Nội dung YCCĐ', 'Trang / nguồn']);
  assert(s['Chương trình'].some(r => r[0] === 'L' && r[1] === 2 && r[3] === 1), 'Có dòng L.2.1');
  const bai2 = s['Bài học'].find(r => r[1] === 2);
  assert(bai2 && String(bai2[4]).split('; ').includes('L.2.1'), 'Bài 2 có mã L.2.1: ' + JSON.stringify(bai2));

  const same = await upload('/curriculum/template/preview', original, scope());
  expect(same, 200);
  assert.equal(same.data.ok, true, JSON.stringify(same.data.errors));
  assert(same.data.counts.yccds >= 190 && same.data.counts.lessons === 51, JSON.stringify(same.data.counts));
  assert(Object.values(same.data.diff.counts).every(n => n === 0), JSON.stringify(same.data.diff.counts));
});

test('V6673 mẫu: file lỗi → báo từng dòng, không tạo gì; GV thường không có quyền', {skip}, async () => {
  const s = sheets(original), cur = s['Chương trình'].map(r => [...r]), les = s['Bài học'].map(r => [...r]);
  cur.push([...cur[1]]);                  // trùng số YCCĐ
  cur.push(['X', 1, 'Chủ đề lạ', 1, 'Nội dung']); // phân môn không có
  les.push(['', 98, 'Bài mã sai', 'L', 'L.99.1']);
  const bad = workbook({...s, 'Chương trình': cur, 'Bài học': les});
  const r = await upload('/curriculum/template/preview', bad, scope());
  expect(r, 200);
  assert.equal(r.data.ok, false);
  const msgs = r.data.errors.map(e => `${e.sheet}|${e.row}|${e.message}`).join('\n');
  assert.match(msgs, /Chương trình\|\d+\|Trùng số YCCĐ/);
  assert.match(msgs, /Chương trình\|\d+\|Phân môn "X" không có trong môn này/);
  assert.match(msgs, /Bài học\|\d+\|Mã YCCĐ không có trong sheet "Chương trình": L\.99\.1/);
  const versions = Number((await db.query('SELECT count(*) FROM curriculum_versions WHERE subject_id=$1 AND grade=9', [subjectId])).rows[0].count);
  expect(await upload('/curriculum/template/import', bad, {...scope(), reason: 'Thử file lỗi'}), 422);
  assert.equal(Number((await db.query('SELECT count(*) FROM curriculum_versions WHERE subject_id=$1 AND grade=9', [subjectId])).rows[0].count), versions, 'File lỗi không tạo phiên bản');

  expect(await upload('/curriculum/template/preview', original, scope(), teacherToken), 403);
  expect(await call('GET', `/curriculum/template/workspace?${q()}`, undefined, teacherToken), 403);
});

test('V6673 mẫu: sửa trong file → bản nháp → sửa Bài trên web → công bố: Bài + liên kết dựng lại, mã câu đọc bản mới', {skip}, async () => {
  const before = (await db.query("SELECT id FROM curriculum_versions WHERE subject_id=$1 AND grade=9 AND status='PUBLISHED' ORDER BY id DESC LIMIT 1", [subjectId])).rows[0].id;
  const s = sheets(original), cur = s['Chương trình'].map(r => [...r]), les = s['Bài học'].map(r => [...r]);
  const row = cur.find(r => r[0] === 'L' && r[1] === 2 && r[3] === 1);
  row[4] = row[4] + ' (bản sửa V6673)';
  const bai2 = les.find(r => r[1] === 2);
  bai2[2] = 'Động năng và thế năng (đổi tên)';
  les.push(['Chủ đề kiểm thử', 99, 'Bài kiểm thử mẫu', '', 'L.2.1; L.2.2']);
  const edited = workbook({...s, 'Chương trình': cur, 'Bài học': les});

  const p = await upload('/curriculum/template/preview', edited, scope());
  expect(p, 200);
  assert.equal(p.data.ok, true, JSON.stringify(p.data.errors));
  assert.equal(p.data.diff.counts.yccds_changed, 1);
  assert.equal(p.data.diff.counts.lessons_added, 1);
  assert.equal(p.data.diff.counts.lessons_changed, 1);
  assert.equal(p.data.diff.yccds.changed[0].label, 'L.2.1');

  const imported = await upload('/curriculum/template/import', edited, {...scope(), reason: 'Kiểm thử file mẫu'});
  expect(imported, 201);
  draftId = imported.data.version.id;
  assert.equal(imported.data.counts.lessons, 52);
  const ws = await call('GET', `/curriculum/template/workspace?${q()}`);
  expect(ws, 200);
  assert.equal(ws.data.draft.id, draftId);
  assert.equal(ws.data.published.version.id, before, 'Chưa công bố thì bản đang dùng không đổi');
  assert.equal(ws.data.draft.diff.counts.yccds_changed, 1);

  // Sửa Bài trên web: đổi tên Bài 99; mã sai bị chặn.
  const lessons = ws.data.draft.lessons.map(l => ({...l, number: String(l.number)}));
  const wrong = await call('PUT', `/curriculum/versions/${draftId}/lesson-plan`, {revision: ws.data.draft.revision, reason: 'Sửa trên web', lessons: [...lessons, {number: '100', name: 'Bài sai', chapter: '', branch: '', codes: 'L.77.1'}]});
  expect(wrong, 422);
  assert.match(JSON.stringify(wrong.data.details || wrong.data), /L\.77\.1/);
  const renamed = lessons.map(l => l.number === '99' ? {...l, name: 'Bài kiểm thử mẫu (sửa trên web)'} : l);
  expect(await call('PUT', `/curriculum/versions/${draftId}/lesson-plan`, {revision: ws.data.draft.revision, reason: 'Sửa trên web', lessons: renamed}), 200);

  const fresh = await call('GET', `/curriculum/template/workspace?${q()}`);
  const pub = await call('POST', `/curriculum/versions/${draftId}/publish`, {revision: fresh.data.draft.revision, confirmed: true, reason: 'Công bố kiểm thử'});
  expect(pub, 200);
  assert.equal(pub.data.lessons.topics_created, 1);
  assert(pub.data.lessons.links_created >= 190, JSON.stringify(pub.data.lessons));
  assert.deepEqual(pub.data.lessons.skipped, []);

  const topic = (await db.query("SELECT id,name FROM topics WHERE subject_id=$1 AND grade=9 AND name LIKE 'Bài 99:%'", [subjectId])).rows[0];
  assert.equal(topic.name, 'Bài 99: Bài kiểm thử mẫu (sửa trên web)');
  assert.equal((await db.query("SELECT name FROM topics WHERE subject_id=$1 AND grade=9 AND name LIKE 'Bài 2:%'", [subjectId])).rows[0].name, 'Bài 2: Động năng và thế năng (đổi tên)');
  const links = (await db.query("SELECT y.code FROM topic_yccd_map m JOIN curriculum_yccds y ON y.id=m.yccd_id WHERE m.topic_id=$1 AND m.status='ACTIVE' AND y.curriculum_version_id=$2 ORDER BY 1", [topic.id, draftId])).rows.map(r => r.code);
  assert.deepEqual(links, ['L.2.1', 'L.2.2']);

  // Mã câu (như lúc nhập Word) đọc YCCĐ của bản vừa công bố, đúng nội dung đã sửa; L.2.2 chỉ thuộc Bài 2 và Bài 99 mới.
  const {resolveQuestionFromCode} = await import('../../src/services/curriculumResolver.js');
  const resolved = await resolveQuestionFromCode(db, 'Câu L. 2. 1. NB. 9. TN', {subject_id: subjectId, grade: 9});
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  const y = (await db.query('SELECT text,curriculum_version_id FROM curriculum_yccds WHERE id=$1', [resolved.curriculum.yccd.id])).rows[0];
  assert.equal(y.curriculum_version_id, draftId);
  assert.match(y.text, /bản sửa V6673/);
});

test('V6673 mẫu: mở bản nháp để sửa trên web mang theo Bài + liên kết hiện tại; gọi lại dùng đúng bản nháp đó', {skip}, async () => {
  const first = await call('POST', '/curriculum/template/draft', scope());
  expect(first, 201);
  const again = await call('POST', '/curriculum/template/draft', scope());
  expect(again, 201);
  assert.equal(again.data.version.id, first.data.version.id);
  assert.equal(again.data.existing, true);
  const ws = await call('GET', `/curriculum/template/workspace?${q()}`);
  assert.equal(ws.data.draft.lessons.find(l => l.number === 99)?.codes.join('; '), 'L.2.1; L.2.2');
  assert(Object.values(ws.data.draft.diff.counts).every(n => n === 0), JSON.stringify(ws.data.draft.diff.counts));
});
