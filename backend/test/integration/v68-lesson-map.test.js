// V6.8 — bản đồ bài học: độ phủ câu hỏi theo Bài (giáo viên); bản đồ, "Luyện ngay" một chạm, tự tạo đề từ nhiều Bài,
// sao / chuỗi ngày / huy hiệu / "Em đang vướng gì" tính từ bài làm thật (học sinh).
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
const name = 'nganhang_v68_test_' + Date.now();
const port = 3126, origin = `http://127.0.0.1:${port}`;
const artifacts = path.resolve('../artifacts');
fs.mkdirSync(artifacts, {recursive: true});
const dump = path.join(artifacts, 'v68-source.dump');
const uploadsDir = path.join(artifacts, 'v68-uploads-' + name);
const env = {...process.env, PGHOST: process.env.DB_HOST, PGPORT: process.env.DB_PORT, PGUSER: process.env.DB_USER, PGPASSWORD: process.env.DB_PASSWORD};
const connection = {host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD};
const adminPool = new pg.Pool({...connection, database: source});
const pw = crypto.randomBytes(12).toString('base64url');
const GRADE = 9;
let db, server, admin, student, loner, teacher, subjectId, otherTopic, studentId, axisIds;
const lessons = {};   // tên ngắn → topic id

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
const map = async (token = student) => { const r = await req('GET', '/practice/lesson-map?subject_id=' + subjectId, undefined, token); expect(r, 200); return r.data; };
const lessonOf = (data, id) => data.chapters.flatMap(c => c.lessons).find(l => l.id === id);
// Làm hết một lượt với cùng một đáp án (đáp án đúng của mọi câu kiểm thử là B) rồi nộp.
async function finish(attemptId, answer) {
  const a = await req('GET', '/practice/attempts/' + attemptId, undefined, student);
  expect(a, 200);
  for (const item of a.data.items) expect(await req('PUT', `/practice/attempts/${attemptId}/items/${item.id}`, {response: answer, final: true}, student), 200);
  expect(await req('POST', `/practice/attempts/${attemptId}/submit`, {}, student), 200);
}

test.before(async () => {
  const d = spawnSync('pg_dump', ['-Fc', '-d', source, '-f', dump], {env, encoding: 'utf8'});
  assert.equal(d.status, 0, d.stderr);
  await adminPool.query('CREATE DATABASE ' + name);
  const r = spawnSync('pg_restore', ['--no-owner', '--no-privileges', '-d', name, dump], {env, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  db = new pg.Pool({...connection, database: name});
  const hash = await bcrypt.hash(pw, 10), ids = {};
  for (const [username, role] of [['v68_admin', 'admin'], ['v68_student', 'student'], ['v68_loner', 'student'], ['v68_teacher', 'teacher']]) {
    ids[username] = (await db.query('INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES($1,$2,$1,$3,false) RETURNING id', [username, hash, role])).rows[0].id;
  }
  studentId = ids.v68_student;
  await db.query('INSERT INTO student_profiles(user_id,student_code) VALUES($1,$2),($3,$4)', [ids.v68_student, 'V68-01', ids.v68_loner, 'V68-02']);
  const dep = (await db.query("INSERT INTO departments(code,name) VALUES('V68_DEP','Tổ bản đồ') RETURNING id")).rows[0].id;
  subjectId = (await db.query("INSERT INTO subjects(code,name,department_id) VALUES('V68MAP','Môn bản đồ',$1) RETURNING id", [dep])).rows[0].id;
  const year = (await db.query("INSERT INTO school_years(name,start_date,end_date) VALUES('V68',CURRENT_DATE-30,CURRENT_DATE+330) RETURNING id")).rows[0].id;
  const cls = (await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('9-V68',$1,$2) RETURNING id", [GRADE, year])).rows[0].id;
  await db.query('INSERT INTO class_memberships(class_id,student_id) VALUES($1,$2)', [cls, ids.v68_student]);
  const outcome = (await db.query("INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document) VALUES($1,$2,'','V68.O','Fixture kỹ thuật','TEST','Chỉ trong database kiểm thử') RETURNING id", [subjectId, GRADE])).rows[0].id;
  const yccd = (await db.query("INSERT INTO curriculum_yccds(outcome_id,code,text) VALUES($1,'V68.Y','YCCĐ giả lập') RETURNING id", [outcome])).rows[0].id;
  for (const [key, chapter, title, order] of [['b1', 'Chương I', 'Bài 1: Nhiều câu', 1], ['b2', 'Chương I', 'Bài 2: Sáu câu', 2], ['b3', 'Chương II', 'Bài 3: Ba câu', 3], ['b4', 'Chương II', 'Bài 4: Chưa có câu', 4]]) {
    lessons[key] = (await db.query('INSERT INTO topics(subject_id,grade,chapter,name,order_index) VALUES($1,$2,$3,$4,$5) RETURNING id', [subjectId, GRADE, chapter, title, order])).rows[0].id;
    await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')", [lessons[key], yccd]);
  }
  otherTopic = (await db.query('SELECT id FROM topics WHERE subject_id<>$1 AND status=$2 LIMIT 1', [subjectId, 'ACTIVE'])).rows[0].id;

  fs.mkdirSync(uploadsDir, {recursive: true});
  const log = fs.openSync(path.join(artifacts, 'v68-server.log'), 'w');
  server = spawn(process.execPath, ['src/server.js'], {env: {...process.env, DB_NAME: name, UPLOAD_DIR: uploadsDir, PORT: String(port), HOST: '127.0.0.1'}, stdio: ['ignore', log, log], windowsHide: true});
  let ready = false;
  for (let i = 0; i < 240; i++) {
    if (server.exitCode !== null) throw new Error('Server exited: ' + fs.readFileSync(path.join(artifacts, 'v68-server.log'), 'utf8'));
    try { if ((await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1000)})).ok) { ready = true; break; } } catch {}
    await new Promise(res => setTimeout(res, 250));
  }
  assert(ready, 'Server not healthy');
  admin = await login('v68_admin'); student = await login('v68_student'); loner = await login('v68_loner'); teacher = await login('v68_teacher');

  // Câu đã duyệt ở kho trường: Bài 1 có 12 câu (6 NB, 4 TH, 2 VD), Bài 2 có 6 câu NB, Bài 3 có 3 câu NB, Bài 4 không có.
  const bank = (await req('GET', '/practice/banks')).data.find(b => b.kind === 'school');
  const add = async (key, level, n) => {
    for (let i = 0; i < n; i++) {
      const q = await req('POST', '/practice/questions', {subject_id: subjectId, topic_id: lessons[key], grade: GRADE, outcome_id: outcome, yccd_id: yccd, type: 'multiple_choice', cognitive_level: level,
        stem: `Câu V68 ${key} mức ${level} số ${i}`, options: ['A', 'B', 'C', 'D'].map(id => ({id, text: id})), answer: {correct: 'B'}, bank_id: bank.id});
      expect(q, 201);
      for (const status of ['pending_review', 'approved', 'active']) expect(await req('POST', '/practice/questions/' + q.data.id + '/workflow', {status}), 200);
    }
  };
  await add('b1', 1, 6); await add('b1', 2, 4); await add('b1', 3, 2); await add('b2', 1, 6); await add('b3', 1, 3);

  // Khung năng lực (mẫu KHTN: 3 thành phần) công bố và gắn YCCĐ trước khi học sinh làm bài: câu trả lời từ đây mang minh chứng năng lực.
  const frame = await req('POST', '/competency/frameworks', {subject_id: subjectId, grade_from: GRADE, grade_to: GRADE, code: 'V68-NL', title: 'Khung năng lực kiểm thử', source: 'Chỉ trong database kiểm thử', version: 'test-1', template: 'KHTN'});
  expect(frame, 201);
  expect(await req('POST', `/competency/frameworks/${frame.data.id}/publish`, {revision: frame.data.revision, confirmed: true, reason: 'Fixture V68'}), 200);
  const axes = (await req('GET', '/competency/frameworks')).data.frameworks.find(f => f.id === frame.data.id).axes;
  axisIds = axes.map(a => a.id);
  expect(await req('PUT', '/competency/mappings/yccd/' + yccd, {entries: [{axis_id: axes[0].id, weight: .6}, {axis_id: axes[2].id, weight: .4}], normalize: true, confirmed: true, reason: 'Fixture V68'}), 200);
});

test.after(() => cleanupIntegration({server, db, adminPool, name, dump, uploadsDir}));

test('V68 độ phủ: đếm câu đã duyệt theo Bài và mức; Bài dưới 5 câu chưa luyện được; giáo viên ngoài phạm vi và học sinh bị chặn', async () => {
  const r = await req('GET', `/practice/lesson-coverage?subject_id=${subjectId}&grade=${GRADE}`);
  expect(r, 200);
  assert.equal(r.data.min_questions, 5);
  assert.deepEqual({...r.data.summary, pending: undefined}, {lessons: 4, ready: 2, empty: 1, questions: 21, other: 0, pending: undefined, unassigned: 0});
  assert.deepEqual(r.data.chapters.map(c => [c.name, c.lessons.length]), [['Chương I', 2], ['Chương II', 2]]);
  const rows = Object.fromEntries(r.data.chapters.flatMap(c => c.lessons).map(l => [l.id, l]));
  assert.deepEqual(rows[lessons.b1].levels, [6, 4, 2, 0]);
  assert.deepEqual([rows[lessons.b3].total, rows[lessons.b3].ready, rows[lessons.b3].missing], [3, false, 2]);
  assert.equal(rows[lessons.b4].total, 0);
  expect(await req('GET', `/practice/lesson-coverage?subject_id=${subjectId}&grade=${GRADE}`, undefined, teacher), 403);
  expect(await req('GET', `/practice/lesson-coverage?subject_id=${subjectId}&grade=${GRADE}`, undefined, student), 403);
});

test('V68 bản đồ: theo khối của lớp, Bài chưa đủ câu bị khoá, "em đang ở đây" là Bài luyện được đầu tiên; chưa xếp lớp thì không có bản đồ', async () => {
  const m = await map();
  assert.equal(m.grade, GRADE);
  assert.equal(m.subject.id, subjectId);
  assert.deepEqual(m.summary, {lessons: 4, practicable: 2, started: 0, done: 0, locked: 2});
  assert.equal(m.current_lesson_id, lessons.b1);
  assert.deepEqual(m.focus, []);
  assert.deepEqual([m.rules.min_questions, m.rules.lesson_count], [5, 10]);
  assert.deepEqual(m.motivation.streak, {current: 0, best: 0, today_done: false});
  assert.deepEqual(m.motivation.stars, {earned: 0, total: 6});
  assert.equal(m.motivation.badges.filter(b => b.earned).length, 0);
  assert.deepEqual([lessonOf(m, lessons.b3).can_practice, lessonOf(m, lessons.b3).missing, lessonOf(m, lessons.b1).progress.status], [false, 2, 'new']);
  assert.ok(!JSON.stringify(m).includes('"answer"'), 'bản đồ không chứa đáp án');
  const none = await req('GET', '/practice/lesson-map', undefined, loner);
  expect(none, 200);
  assert.equal(none.data.grade, null);
  expect(await req('GET', '/practice/lesson-map', undefined, admin), 403);
});

test('V68 Luyện ngay: một chạm, tự chọn số câu và tỉ lệ mức theo số câu đang có; chặn Bài thiếu câu, khác môn, sai vai', async () => {
  const levels = async id => (await db.query('SELECT v.cognitive_level AS l,v.topic_id AS t FROM attempt_items i JOIN question_versions v ON v.id=i.question_version_id WHERE i.attempt_id=$1', [id])).rows;
  const one = await req('POST', '/practice/lessons/start', {topic_ids: [lessons.b1]}, student);
  expect(one, 201);
  const l1 = await levels(one.data.id);
  assert.equal(l1.length, 10);
  assert.deepEqual([1, 2, 3, 4].map(n => l1.filter(x => x.l === n).length), [4, 4, 2, 0], 'thiếu mức 4 thì dồn sang mức gần nhất còn câu');
  assert.ok(l1.every(x => x.t === lessons.b1));
  const base = await req('POST', '/practice/lessons/start', {topic_ids: [lessons.b1], focus: 'base'}, student);
  expect(base, 201);
  assert.ok((await levels(base.data.id)).every(x => x.l <= 2), 'luyện phần nền tảng chỉ lấy NB, TH');
  const many = await req('POST', '/practice/lessons/start', {topic_ids: [lessons.b1, lessons.b2], count: 15}, student);
  expect(many, 201);
  assert.equal((await levels(many.data.id)).length, 15);
  const few = await req('POST', '/practice/lessons/start', {topic_ids: [lessons.b3]}, student);
  expect(few, 409);
  assert.match(few.data.error, /mới có 3 câu/);
  expect(await req('POST', '/practice/lessons/start', {topic_ids: [lessons.b1, otherTopic]}, student), 422);
  expect(await req('POST', '/practice/lessons/start', {topic_ids: [lessons.b1]}, teacher), 403);
  expect(await req('POST', '/practice/lessons/start', {topic_ids: []}, student), 400);
  // Tự chọn bài luyện (màn cũ) vẫn giữ sàn 10 câu của cấu hình hệ thống.
  expect(await req('POST', '/practice/attempts', {subject_id: subjectId, grade: GRADE, topic_ids: [lessons.b2], count: 6, percent: [100, 0, 0, 0], types: ['multiple_choice'], mode: 'practice'}, student), 400);
});

test('V68 tiến độ: sao, chuỗi ngày, huy hiệu và "Em đang vướng gì" tính từ bài làm thật', async () => {
  // Bài 2 (6 câu NB): lượt 1 đúng hết → 2 sao (chưa đủ 2 lượt); lượt 2 đúng hết → 3 sao, đạt mục tiêu.
  const first = await req('POST', '/practice/lessons/start', {topic_ids: [lessons.b2]}, student);
  expect(first, 201);
  await finish(first.data.id, 'B');
  let m = await map(), b2 = lessonOf(m, lessons.b2);
  assert.deepEqual([b2.progress.status, b2.progress.stars, b2.progress.mastery, b2.progress.attempts, b2.progress.low_data], ['practicing', 2, 100, 1, true]);
  assert.deepEqual(m.motivation.streak, {current: 1, best: 1, today_done: true});
  assert.ok(m.motivation.badges.find(b => b.id === 'first').earned);
  assert.equal(m.current_lesson_id, lessons.b2, 'Bài vừa luyện mà chưa đạt là chỗ em đang ở');
  const second = await req('POST', '/practice/lessons/start', {topic_ids: [lessons.b2]}, student);
  await finish(second.data.id, 'B');
  m = await map(); b2 = lessonOf(m, lessons.b2);
  assert.deepEqual([b2.progress.status, b2.progress.stars], ['done', 3]);
  assert.ok(m.motivation.badges.find(b => b.id === 'star3').earned);
  assert.equal(m.current_lesson_id, lessons.b1, 'Bài 2 đã đạt → quay về Bài luyện được còn lại');
  assert.deepEqual([m.summary.started, m.summary.done], [1, 1]);

  // Bài 1: hai lượt phần nền tảng sai hết → vào danh sách đang vướng, có nút luyện phần nền tảng.
  for (let i = 0; i < 2; i++) {
    const a = await req('POST', '/practice/lessons/start', {topic_ids: [lessons.b1], focus: 'base'}, student);
    expect(a, 201);
    await finish(a.data.id, 'A');
  }
  m = await map();
  assert.deepEqual(m.focus, [{lesson_id: lessons.b1, name: 'Bài 1: Nhiều câu', score: 0, attempts: 2, target: 70, base_questions: 10}]);
  assert.equal(lessonOf(m, lessons.b1).progress.stars, 1);
  assert.equal(m.current_lesson_id, lessons.b1);
  assert.equal(m.motivation.stars.earned, 4);

  // Biểu đồ các môn: môn đã luyện có điểm và số bài; môn chưa luyện để trống (null), không phải 0.
  const mine = m.subjects.find(s => s.id === subjectId), rest = m.subjects.filter(s => s.id !== subjectId);
  assert.equal(mine.practiced, 2);
  assert.ok(mine.score > 0 && mine.score < 100, 'điểm môn là trung bình các Bài đã luyện: ' + mine.score);
  assert.ok(rest.length > 0 && rest.every(s => s.score === null && s.practiced === 0));
  // Biểu đồ năng lực của môn: thành phần có câu tự chấm thì có điểm, thành phần chỉ nhận minh chứng thầy cô ghi thì để trống.
  const p = await req('GET', `/practice/students/${studentId}/competency-profile?subject_id=${subjectId}&grade=${GRADE}`, undefined, student);
  expect(p, 200);
  assert.deepEqual(p.data.axes.map(a => a.evidence_count > 0), [true, false, true]);
  assert.equal(p.data.axes[1].performance_score, null);
});

test('V68 trình duyệt: trang chủ học sinh có bản đồ, bấm "Luyện tiếp" vào thẳng bài làm; giáo viên xem độ phủ ở trang Chương trình', {timeout: 90000}, async () => {
  const {chromium} = await import('playwright');
  const browser = await chromium.launch({headless: true});
  const signIn = async (page, username) => {
    await page.goto(origin + '/login');
    await page.getByPlaceholder('admin').fill(username);
    await page.locator('input[type=password]').fill(pw);
    await page.getByRole('button', {name: 'Đăng nhập', exact: true}).click();
    await page.waitForURL(origin + '/');
  };
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 1100}}), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await signIn(page, 'v68_student');
    await page.getByRole('heading', {name: 'Bản đồ bài học · Môn bản đồ 9', exact: true}).waitFor();
    await page.getByRole('heading', {name: 'Em đang vướng gì', exact: true}).waitFor();
    await page.getByText('Em đang ở đây', {exact: true}).waitFor();
    assert.equal(await page.getByRole('heading', {name: 'Nội dung nên củng cố'}).count(), 0, 'mục củng cố cũ nhường chỗ cho bản đồ');
    await page.getByRole('heading', {name: 'Huy hiệu', exact: true}).waitFor();
    assert.equal(await page.locator('.week-strip li.today.done').count(), 1, 'dải 7 ngày đánh dấu hôm nay đã luyện');
    assert.equal(await page.locator('.badge-shelf li.earned').count(), 2);
    // Biểu đồ năng lực: một biểu đồ chung các môn, một biểu đồ theo thành phần năng lực của môn đang xem.
    await page.getByRole('heading', {name: 'Các môn khối 9', exact: true}).waitFor();
    const ability = page.locator('.ability-card', {hasText: 'Năng lực môn Môn bản đồ'});
    await ability.locator('.skill-radar').waitFor();
    assert.equal(await ability.locator('.radar-label').count(), 3);
    assert.equal(await ability.locator('.radar-label', {hasText: 'chưa có dữ liệu'}).count(), 1, 'thành phần chưa có minh chứng để trống, không vẽ thành 0');
    assert.equal(await ability.locator('.skill-radar .area').count(), 0, 'thiếu một trục thì không tô vùng');
    await page.locator('.ability').screenshot({path: path.join(artifacts, 'v68-ability.png')});
    // Thầy cô ghi một minh chứng thực hành cho "Tìm hiểu tự nhiên": đủ ba trục thì tô vùng; trục mới có 1 minh chứng dùng chấm rỗng.
    expect(await req('POST', '/competency/rubrics', {student_id: studentId, subject_id: subjectId, grade: GRADE, axis_id: axisIds[1], evidence_type: 'PRACTICAL_TASK', activity: 'Thực hành đo và ghi số liệu', performance: .8, notes: 'Fixture V68', occurred_at: new Date(Date.now() - 1000).toISOString(), reason: 'Fixture V68'}), 201);
    await page.reload();
    await ability.locator('.skill-radar .area').waitFor();
    assert.equal(await ability.locator('.radar-label', {hasText: 'chưa có dữ liệu'}).count(), 0);
    assert.equal(await ability.locator('.skill-radar .dot.weak').count(), 1);
    await page.locator('.ability').screenshot({path: path.join(artifacts, 'v68-ability-full.png')});
    await page.screenshot({path: path.join(artifacts, 'v68-student-map.png'), fullPage: true});
    await page.setViewportSize({width: 390, height: 844});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'không tràn ngang trên điện thoại');
    await page.waitForTimeout(400);   // thanh điều hướng thu lại có hiệu ứng chuyển
    await page.locator('.ability').screenshot({path: path.join(artifacts, 'v68-ability-mobile.png')});
    await page.screenshot({path: path.join(artifacts, 'v68-student-map-mobile.png'), fullPage: true});
    await page.setViewportSize({width: 1280, height: 1100});
    await page.locator('.route .station-row', {hasText: 'Bài 2: Sáu câu'}).getByRole('button', {name: 'Luyện tiếp', exact: true}).click();
    await page.waitForURL(/\/practice\/attempts\//);
    assert.deepEqual(errors, []);

    const staff = await browser.newPage({viewport: {width: 1280, height: 1000}});
    await signIn(staff, 'v68_admin');
    await staff.goto(origin + '/curriculum');
    await staff.getByRole('heading', {name: 'Chương trình môn học', exact: true}).waitFor();
    await staff.locator('.curriculum-template select').nth(0).selectOption(String(subjectId));
    await staff.locator('.curriculum-template select').nth(1).selectOption(String(GRADE));
    await staff.getByText('Câu hỏi theo Bài — học sinh đã luyện được những Bài nào?', {exact: true}).click();
    await staff.getByText('Thiếu 2 câu', {exact: true}).waitFor();
    await staff.getByText('Chưa có câu', {exact: true}).waitFor();
    await staff.screenshot({path: path.join(artifacts, 'v68-coverage.png'), fullPage: true});
  } finally { await browser.close(); }
});
