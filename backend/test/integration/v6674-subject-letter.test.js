// V6.6.7.4 — chữ viết tắt của môn trong mã câu (Toán = T): file mẫu không cột Phân môn → bản nháp → công bố →
// mã "Câu T. 1. 2. TH. 1. TN" tự ra Outcome/YCCĐ/Bài; mã chữ của môn khác bị chặn; mẫu Word theo môn nhập được ngay;
// chỉ quản trị đổi chữ, không đổi được khi chương trình đã dùng chữ cũ hoặc môn chia phân môn.
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
import {parseDocx} from '../../src/services/practice/importAdapters.js';

const source = process.env.DB_NAME;
if (!source?.startsWith('nganhang_personalized')) throw new Error('Integration tests require an isolated personalized database');
const name = 'nganhang_v6674_test_' + Date.now();
const port = 3125, origin = `http://127.0.0.1:${port}`;
const artifacts = path.resolve('../artifacts');
fs.mkdirSync(artifacts, {recursive: true});
const dump = path.join(artifacts, 'v6674-source.dump');
const uploadsDir = path.join(artifacts, 'v6674-uploads-' + name);
const env = {...process.env, PGHOST: process.env.DB_HOST, PGPORT: process.env.DB_PORT, PGUSER: process.env.DB_USER, PGPASSWORD: process.env.DB_PASSWORD};
const connection = {host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD};
const adminPool = new pg.Pool({...connection, database: source});
const pw = crypto.randomBytes(12).toString('base64url');
const GRADE = 10;
let db, server, token, teacherToken, toan, yccdIds;

async function call(method, url, body, as = token) {
  const res = await fetch(origin + '/api' + url, {method, headers: {Authorization: 'Bearer ' + as, ...(body !== undefined ? {'Content-Type': 'application/json'} : {})}, body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return {status: res.status, data};
}
async function post(url, fields, file, filename, as = token) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  form.append('file', new Blob([file]), filename);
  const res = await fetch(origin + '/api' + url, {method: 'POST', headers: {Authorization: 'Bearer ' + as}, body: form});
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return {status: res.status, data};
}
const download = async url => { const res = await fetch(origin + '/api' + url, {headers: {Authorization: 'Bearer ' + token}}); assert.equal(res.status, 200, await res.clone().text()); return {res, buffer: Buffer.from(await res.arrayBuffer())}; };
const expect = (r, s) => assert.equal(r.status, s, typeof r.data === 'string' ? r.data : JSON.stringify(r.data).slice(0, 2000));
const q = () => `subject_id=${toan}&grade=${GRADE}`;
const sheets = buffer => { const wb = XLSX.read(buffer, {type: 'buffer'}); return Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], {header: 1, defval: ''})])); };
function workbook(data) { const wb = XLSX.utils.book_new(); for (const [n, rows] of Object.entries(data)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n); return XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'}); }
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
  toan = (await db.query("SELECT id FROM subjects WHERE code='Toan'")).rows[0].id;
  assert.equal((await db.query('SELECT code_letter FROM subjects WHERE id=$1', [toan])).rows[0].code_letter, 'T', 'migration v6674 đặt chữ T cho Toán');
  const hash = await bcrypt.hash(pw, 10);
  await db.query("INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES('v6674_admin',$1,'v6674_admin','admin',false),('v6674_teacher',$1,'v6674_teacher','teacher',false)", [hash]);
  fs.mkdirSync(uploadsDir, {recursive: true});
  const log = fs.openSync(path.join(artifacts, 'v6674-server.log'), 'w');
  server = spawn(process.execPath, ['src/server.js'], {env: {...process.env, DB_NAME: name, UPLOAD_DIR: uploadsDir, PORT: String(port), HOST: '127.0.0.1'}, stdio: ['ignore', log, log], windowsHide: true});
  let ready = false;
  for (let i = 0; i < 240; i++) {
    if (server.exitCode !== null) throw new Error('Server exited: ' + fs.readFileSync(path.join(artifacts, 'v6674-server.log'), 'utf8'));
    try { if ((await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1000)})).ok) { ready = true; break; } } catch {}
    await new Promise(res => setTimeout(res, 250));
  }
  assert(ready, 'Server not healthy');
  token = await login('v6674_admin');
  teacherToken = await login('v6674_teacher');
});

test.after(() => cleanupIntegration({server, db, adminPool, name, dump, uploadsDir}));

test('V6674 Toán: file mẫu không cột Phân môn, có Ví dụ + Dùng AI; nạp → bản nháp → công bố với nhãn T.1.1', async () => {
  const {res, buffer} = await download(`/curriculum/template?${q()}`);
  assert.match(res.headers.get('content-disposition'), /Mau_chuong_trinh_Toan_khoi10\.xlsx/);
  const s = sheets(buffer);
  assert.deepEqual(Object.keys(s), ['Hướng dẫn', 'Chương trình', 'Bài học', 'Ví dụ', 'Dùng AI']);
  assert.deepEqual(s['Chương trình'][0], ['Số Chủ đề', 'Tên Chủ đề (Outcome)', 'Số YCCĐ', 'Nội dung YCCĐ', 'Trang / nguồn']);
  assert.deepEqual(s['Bài học'][0], ['Chương / Chủ đề SGK', 'Số bài', 'Tên bài', 'Mã YCCĐ của bài']);
  assert(s['Ví dụ'].flat().includes('T.1.2; T.1.3'), 'Ví dụ Toán dùng chữ T');
  assert.match(s['Dùng AI'].flat().join('\n'), /Câu T\. 1\. 1\. NB\. 1\. TN/);

  // Giáo viên điền Chương trình và thêm mã vào các Bài đang có (thiếu chữ thì hệ thống tự thêm T).
  const cur = [s['Chương trình'][0], [1, 'Mệnh đề và tập hợp', 1, 'Phát biểu được mệnh đề toán học.', 'tr. 1'], ['', '', 2, 'Nhận biết được tập con, tập rỗng.', ''],
    [2, 'Bất phương trình bậc nhất hai ẩn', 1, 'Nhận biết được bất phương trình bậc nhất hai ẩn.', '']];
  const les = s['Bài học'].map(r => [...r]);
  const setCodes = (title, codes, number) => { const row = les.find(r => String(r[2]).trim() === title); if (row) row[3] = codes; else les.push(['Chương kiểm thử', number, title, codes]); };
  setCodes('Mệnh đề', 'T.1.1', 1); setCodes('Tập hợp', '1.2', 2); setCodes('Bất phương trình bậc nhất hai ẩn', 'T.2.1', 4);
  const file = workbook({...s, 'Chương trình': cur, 'Bài học': les});
  const preview = await post('/curriculum/template/preview', {subject_id: toan, grade: GRADE}, file, 'Mau.xlsx');
  expect(preview, 200);
  assert.equal(preview.data.ok, true, JSON.stringify(preview.data.errors));
  assert.deepEqual({...preview.data.counts, lessons: undefined}, {outcomes: 2, yccds: 3, lessons: undefined, links: 3});

  // Mã chữ của môn khác bị chặn ngay ở bước kiểm tra, không tạo gì.
  const wrong = await post('/curriculum/template/preview', {subject_id: toan, grade: GRADE}, workbook({...s, 'Chương trình': cur, 'Bài học': [s['Bài học'][0], ['', 1, 'Mệnh đề', 'L.1.1']]}), 'Mau.xlsx');
  expect(wrong, 200);
  assert.equal(wrong.data.ok, false);
  assert.match(wrong.data.errors.map(e => e.message).join('\n'), /không chia phân môn.*chữ T/);

  const created = await post('/curriculum/template/import', {subject_id: toan, grade: GRADE, reason: 'Nạp chương trình Toán kiểm thử'}, file, 'Mau.xlsx');
  expect(created, 201);
  const draftId = created.data.version.id;
  // Chữ của môn chỉ nằm ở source_branch_code / canonical_key; domain_code trống để câu hỏi không phải chọn phân môn.
  const rows = (await db.query('SELECT code,domain_code,source_branch_code,canonical_key FROM curriculum_outcomes WHERE curriculum_version_id=$1 ORDER BY order_index', [draftId])).rows;
  assert.deepEqual(rows, [{code: 'T.1', domain_code: '', source_branch_code: 'T', canonical_key: `Toan:G${GRADE}:T:1`}, {code: 'T.2', domain_code: '', source_branch_code: 'T', canonical_key: `Toan:G${GRADE}:T:2`}]);
  const ws = await call('GET', `/curriculum/template/workspace?${q()}`);
  expect(ws, 200);
  assert.deepEqual(ws.data.subject.letters, ['T']);
  assert.deepEqual(ws.data.subject.branches, []);
  assert.equal(ws.data.can.set_letter, true);
  assert.deepEqual(ws.data.draft.outcomes.flatMap(o => o.yccds.map(y => y.label)), ['T.1.1', 'T.1.2', 'T.2.1']);
  assert.equal(ws.data.draft.diff.counts.lessons_kept_not_in_file, 0);

  const pub = await call('POST', `/curriculum/versions/${draftId}/publish`, {revision: ws.data.draft.revision, confirmed: true, reason: 'Công bố Toán kiểm thử'});
  expect(pub, 200);
  assert.equal(pub.data.lessons.links_created, 3, JSON.stringify(pub.data.lessons));
  assert.deepEqual(pub.data.lessons.skipped, []);
  yccdIds = Object.fromEntries((await db.query('SELECT code,id FROM curriculum_yccds WHERE curriculum_version_id=$1', [draftId])).rows.map(r => [r.code, r.id]));
});

test('V6674 Toán: mã Câu T… tự ra Outcome/YCCĐ/Bài; chữ của môn khác bị báo; mẫu Word theo môn nhập được ngay', async () => {
  const {resolveQuestionFromCode} = await import('../../src/services/curriculumResolver.js');
  const ok = await resolveQuestionFromCode(db, 'Câu T. 1. 2. TH. 1. TN', {subject_id: toan, grade: GRADE});
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.curriculum.yccd.label, 'T.1.2');
  assert.equal(ok.curriculum.yccd.id, yccdIds['T.1.2']);
  assert.equal(ok.lesson.status, 'AUTO_MAPPED');
  assert.match(ok.lesson.topic.name, /^Bài \d+: Tập hợp$/);
  const wrong = await resolveQuestionFromCode(db, 'Câu L. 1. 1. NB. 1. TN', {subject_id: toan, grade: GRADE});
  assert.equal(wrong.error, 'CODE_SUBJECT_MISMATCH');
  assert.match(wrong.message, /Toán dùng T/);

  // Mẫu Word tải theo môn: chữ T, mã ví dụ là YCCĐ đầu tiên; phần hướng dẫn đầu tệp không bị đọc thành câu.
  const {res, buffer} = await download(`/curriculum/template/word?${q()}`);
  assert.match(res.headers.get('content-disposition'), /Mau_Word_nhap_cau_Toan_khoi10\.docx/);
  assert.deepEqual(parseDocx(buffer).items.map(i => i.display_code),
    ['Câu T. 1. 1. NB. 1. TN', 'Câu T. 1. 1. TH. 2. ĐS', 'Câu T. 1. 1. VD. 3. TLN', 'Câu T. 1. 1. NB. 4. GN', 'Câu T. 1. 1. VDC. 5. TL']);
  const job = await post('/practice/imports', {metadata: JSON.stringify({subject_id: toan, grade: GRADE})}, buffer, 'mau-word.docx');
  expect(job, 201);
  const items = (await call('GET', '/practice/imports/' + job.data.id)).data.items;
  assert.equal(items.length, 5);
  const first = items[0];
  assert.equal(first.validation.category, 'AUTO_RESOLVED', JSON.stringify(first.validation));
  assert.equal(first.draft.yccd_id, yccdIds['T.1.1']);
  assert.match(first.validation.resolution.lesson.name, /^Bài \d+: Mệnh đề$/);

  // Lệnh AI trên web dùng cùng mã mẫu với file.
  const prompts = await call('GET', `/curriculum/template/prompts?${q()}`);
  expect(prompts, 200);
  assert.equal(prompts.data.sample_code, 'Câu T. 1. 1. NB. 1. TN');
  assert.equal(prompts.data.has_curriculum, true);
  assert.match(prompts.data.prompts.questions, /Câu T\. 1\. 1\. NB\. 1\. TN/);
  assert.doesNotMatch(prompts.data.prompts.curriculum, /Phân môn/);
});

test('V6674 chữ viết tắt: chỉ quản trị đổi; chương trình đã dùng chữ cũ hoặc môn chia phân môn thì không đổi', async () => {
  const [tin, khtn] = await Promise.all(['TinHoc', 'KHTN'].map(async code => (await db.query('SELECT id FROM subjects WHERE code=$1', [code])).rows[0].id));
  const body = code_letter => ({code_letter, reason: 'Đặt chữ kiểm thử'});
  expect(await call('PUT', `/curriculum/subjects/${tin}/code-letter`, body('th'), teacherToken), 403);
  expect(await call('PUT', `/curriculum/subjects/${tin}/code-letter`, body('T1')), 400);
  const set = await call('PUT', `/curriculum/subjects/${tin}/code-letter`, body('th'));
  expect(set, 200);
  assert.equal(set.data.subject.code_letter, 'TH');
  assert.equal((await db.query('SELECT code_letter FROM subjects WHERE id=$1', [tin])).rows[0].code_letter, 'TH');
  const used = await call('PUT', `/curriculum/subjects/${toan}/code-letter`, body('TO'));
  expect(used, 409);
  assert.match(used.data.error, /đã dùng chữ T/);
  expect(await call('PUT', `/curriculum/subjects/${khtn}/code-letter`, body('K')), 409);
});
