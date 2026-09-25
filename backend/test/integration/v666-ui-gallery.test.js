// V6.6.6 — bộ sưu tập giao diện: mở các màn chính bằng trình duyệt thật sau khi đồng bộ hệ giao diện
// (font Lexend, bảng màu chung), chụp ảnh vào artifacts/ui-*.png và bắt mọi lỗi runtime.
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
import {cleanupIntegration} from './helpers/cleanup.js';

const source = process.env.DB_NAME;
if (!source?.startsWith('nganhang_personalized')) throw new Error('Integration tests require an isolated personalized database');

const name = 'nganhang_v666ui_test_' + Date.now();
const adminPool = new pg.Pool({host: process.env.DB_HOST, port: process.env.DB_PORT, database: source, user: process.env.DB_USER, password: process.env.DB_PASSWORD});
const artifacts = path.resolve('../artifacts');
fs.mkdirSync(artifacts, {recursive: true});
const dump = path.join(artifacts, 'v666ui-source.dump');
const env = {...process.env, PGHOST: process.env.DB_HOST, PGPORT: process.env.DB_PORT, PGUSER: process.env.DB_USER, PGPASSWORD: process.env.DB_PASSWORD};
const port = 3109, origin = 'http://127.0.0.1:' + port;
const pw = crypto.randomBytes(12).toString('base64url');
let db, server, uploadsDir, subjectId, bankId;
const tokens = {}, users = {}, yccds = {}, lessons = {};

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

  const dep = (await db.query("INSERT INTO departments(code,name) VALUES('UI_DEP','Tổ KHTN') RETURNING id")).rows[0].id;
  subjectId = (await db.query("INSERT INTO subjects(code,name,department_id,is_integrated) VALUES('UIKHTN','KHTN (giao diện)',$1,true) RETURNING id", [dep])).rows[0].id;
  const branchId = (await db.query("INSERT INTO branches(subject_id,code,name) VALUES($1,'VL','Vật lí') RETURNING id", [subjectId])).rows[0].id;
  const year = (await db.query("INSERT INTO school_years(name,start_date,end_date) VALUES('UI',CURRENT_DATE-30,CURRENT_DATE+330) RETURNING id")).rows[0].id;
  const klass = (await db.query("INSERT INTO classes(name,grade,school_year_id) VALUES('7A UI',7,$1) RETURNING id", [year])).rows[0].id;
  bankId = (await db.query("INSERT INTO banks(name,kind,department_id) VALUES('Kho tổ KHTN','department',$1) RETURNING id", [dep])).rows[0].id;
  const outcome = (await db.query(`INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document,status,source_branch_code,source_ordinal,canonical_key,source_text)
    VALUES($1,7,'L','L.1','Tốc độ','UI','Fixture','ACTIVE','L',1,'UIKHTN:G7:L:1','Tốc độ') RETURNING id`, [subjectId])).rows[0].id;
  const texts = ['Nêu được ý nghĩa vật lí của tốc độ', 'Liệt kê được một số đơn vị đo tốc độ thường dùng', 'Mô tả được sơ lược cách đo tốc độ bằng đồng hồ bấm giây và cổng quang điện'];
  for (const n of [1, 2, 3]) yccds[n] = (await db.query(`INSERT INTO curriculum_yccds(outcome_id,code,text,status,source_ordinal,canonical_key,source_text) VALUES($1,$2,$3,'ACTIVE',$4,$5,$3) RETURNING id`,
    [outcome, 'L.1.' + n, texts[n - 1], n, 'UIKHTN:G7:L:1:' + n])).rows[0].id;
  for (const [label, keys] of [['Bài 8. Tốc độ chuyển động', [1, 2]], ['Bài 9. Đo tốc độ', [3]]]) {
    const t = (await db.query("INSERT INTO topics(subject_id,grade,name,status,branch_id) VALUES($1,7,$2,'ACTIVE',$3) RETURNING id", [subjectId, label, branchId])).rows[0].id;
    for (const k of keys) await db.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,status) VALUES($1,$2,'ACTIVE')", [t, yccds[k]]);
    lessons[label.split('.')[0]] = t;
  }
  const hash = await bcrypt.hash(pw, 10);
  for (const [k, username, role, full] of [['admin', 'ui_admin', 'admin', 'Quản trị'], ['author', 'ui_author', 'teacher', 'Nguyễn Thu Hà']]) {
    users[k] = (await db.query('INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES($1,$2,$3,$4,false) RETURNING id', [username, hash, full, role])).rows[0].id;
  }
  uploadsDir = path.join(artifacts, 'v666ui-uploads-' + name);
  fs.cpSync(path.resolve(process.env.UPLOAD_DIR || 'uploads'), uploadsDir, {recursive: true, errorOnExist: true});
  const output = fs.openSync(path.join(artifacts, 'v666ui-server.log'), 'w');
  server = spawn(process.execPath, ['src/server.js'], {env: {...process.env, DB_NAME: name, UPLOAD_DIR: uploadsDir, PORT: String(port), HOST: '127.0.0.1'}, stdio: ['ignore', output, output], windowsHide: true});
  let ready = false;
  for (let i = 0; i < 240 && !ready; i++) {
    try { ready = (await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1000)})).ok; } catch {}
    if (!ready) await new Promise(r => setTimeout(r, 250));
  }
  assert(ready);
  tokens.admin = await login('ui_admin');
  expect(await req('PUT', `/staff/${users.author}/assignments`, {school_year_id: year, positions: [], teaching: [{subject_id: subjectId, class_ids: [klass]}], reason: 'Phân công chụp giao diện'}), 200);
  expect(await req('POST', '/practice/bank-permissions', {bank_id: bankId, user_id: users.author, permission: 'write'}), 200);
  tokens.author = await login('ui_author');

  // Một bộ câu thật như giáo viên soạn: có câu sạch, câu chưa gắn Bài, câu thiếu lời giải, câu không mã.
  const stems = [
    'Tốc độ cho biết điều gì về chuyển động của một vật?', 'Đơn vị nào sau đây là đơn vị đo tốc độ?',
    'Một xe đạp đi được 100 m trong 20 s. Tốc độ của xe là bao nhiêu m/s?', 'Muốn đo tốc độ của một vật, ta cần đo những đại lượng nào?',
    'Vì sao dùng cổng quang điện đo thời gian chính xác hơn bấm giây bằng tay?', 'Đổi 36 km/h sang m/s.',
    'Một người đi bộ 1,2 km trong 15 phút. Tính tốc độ trung bình theo km/h.', 'Kể tên hai dụng cụ đo thời gian thường dùng trong phòng thí nghiệm.',
  ];
  let n = 0;
  for (const [i, stem] of stems.entries()) {
    const yccd = i < 3 ? 1 : i < 6 ? 3 : 2;
    const r = await req('POST', '/practice/questions', {
      subject_id: subjectId, grade: 7, branch_id: branchId, outcome_id: outcome, yccd_id: yccds[yccd],
      topic_id: i === 6 ? null : yccd === 3 ? lessons['Bài 9'] : lessons['Bài 8'], cognitive_level: (i % 4) + 1, type: 'multiple_choice',
      ...(i === 7 ? {} : {content_number: ++n}), stem, bank_id: bankId,
      options: ['A', 'B', 'C', 'D'].map((k, j) => ({id: k, text: ['m/s', 'km/h', 'kg', 'N'][j]})), answer: {correct: 'A'},
      explanation: i === 4 ? '' : 'Theo định nghĩa tốc độ.',
    }, tokens.author);
    expect(r, 201);
    if (i < 4) expect(await req('POST', '/practice/questions/bulk-workflow', {ids: [r.data.id], action: 'submit'}, tokens.author), 200);
  }
});

// Dừng server, đóng pool, xóa database tạm + dump + uploads tạm; ảnh chụp giữ lại (tên cố định).
test.after(() => cleanupIntegration({server, db, adminPool, name, dump, uploadsDir}));

test('V666 UI: bộ sưu tập các màn chính sau khi đồng bộ giao diện', {timeout: 180000}, async () => {
  const {chromium} = await import('playwright');
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}}), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const shot = name => page.screenshot({path: path.join(artifacts, `ui-${name}.png`)});

    await page.goto(origin + '/login');
    await page.getByPlaceholder('admin').waitFor();
    await shot('login');
    // Font chung đã được áp.
    assert.match(await page.evaluate(() => getComputedStyle(document.body).fontFamily), /Lexend/);

    await page.getByPlaceholder('admin').fill('ui_author');
    await page.locator('input[type=password]').fill(pw);
    await page.getByRole('button', {name: 'Đăng nhập', exact: true}).click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'));
    await page.waitForTimeout(800);
    await shot('dashboard');

    await page.goto(origin + '/practice/banks?subject_id=' + subjectId);
    await page.locator('.queue-table tbody tr').first().waitFor();
    const rows = page.locator('.queue-table tbody tr');
    for (const i of [0, 1, 2]) await rows.nth(i).locator('input[type=checkbox]').check();
    await rows.nth(1).click();
    await page.getByRole('group', {name: 'Mức nhận thức'}).waitFor();
    await page.waitForTimeout(400);
    await shot('banks');

    await page.keyboard.press('Control+k');
    await page.getByRole('dialog', {name: 'Bảng lệnh'}).getByRole('combobox').fill('gan bai');
    await page.waitForTimeout(200);
    await shot('palette');
    await page.keyboard.press('Escape');

    await page.goto(origin + '/practice/import');
    await page.getByLabel('Môn', {exact: true}).selectOption(String(subjectId));
    await page.getByLabel('Khối', {exact: true}).selectOption('7');
    await shot('import-start');
    await page.locator('input[type=file]').setInputFiles(path.resolve('../templates/question-import-khtn.docx'));
    await page.getByRole('button', {name: 'Đọc tệp và kiểm tra', exact: true}).click();
    await page.getByRole('heading', {name: /Tìm thấy/}).waitFor();
    await page.waitForTimeout(400);
    await shot('import-staging');

    await page.goto(origin + '/practice/reviews?tab=author');
    await page.locator('.queue-table').waitFor();
    await page.waitForTimeout(400);
    await shot('review-author');

    // Người duyệt: quản trị.
    await page.context().clearCookies();
    await page.goto(origin + '/login');
    await page.getByPlaceholder('admin').fill('ui_admin');
    await page.locator('input[type=password]').fill(pw);
    await page.getByRole('button', {name: 'Đăng nhập', exact: true}).click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'));
    await page.goto(origin + '/practice/reviews?tab=pending&subject_id=' + subjectId);
    await page.locator('.queue-table tbody tr').first().click();
    await page.getByRole('group', {name: 'Lý do trả sửa'}).waitFor();
    // V6.7 — mặc định chế độ đơn giản: không dòng phím tắt / bảng lệnh; bật "công cụ duyệt nhanh" mới hiện.
    assert.equal(await page.locator('.queue-hint').count(), 0);
    await page.getByRole('button', {name: 'Mở công cụ duyệt nhanh', exact: true}).click();
    await page.locator('.queue-hint').waitFor();
    await page.getByRole('button', {name: /Tìm lệnh/}).waitFor();
    await page.getByRole('button', {name: 'Ẩn công cụ duyệt nhanh', exact: true}).click();
    assert.equal(await page.locator('.queue-hint').count(), 0);
    await page.waitForTimeout(400);
    await shot('review-pending');

    for (const [url, key] of [['/admin/school', 'admin-school'], ['/practice/curriculum', 'curriculum'], ['/staff', 'staff']]) {
      await page.goto(origin + url);
      await page.waitForTimeout(900);
      await shot(key);
    }
    // V6.6.6.1 — các cỡ màn thường gặp ở trường: nút chính phải nằm trong màn hình và không bị phần tử
    // khác che (điểm giữa nút là chính nút đó). Đây là kiểm tra che/lệch cơ bản, không thay UAT bằng mắt.
    const unobstructed = async locator => {
      const box = await locator.boundingBox();
      if (!box) return false;
      const viewport = page.viewportSize();
      if (box.x < 0 || box.x + box.width > viewport.width + 1) return false;
      return locator.evaluate(el => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && (hit === el || el.contains(hit));
      });
    };
    for (const [width, height] of [[1366, 768], [1920, 1080], [768, 1024]]) {
      await page.setViewportSize({width, height});
      await page.goto(origin + '/practice/banks?subject_id=' + subjectId);
      await page.locator('.queue-table tbody tr').first().waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({path: path.join(artifacts, `ui-banks-${width}.png`)});
      for (const locator of [
        page.getByRole('button', {name: /Thêm câu hỏi/}),
        page.getByRole('button', {name: /Tìm lệnh/}),
        page.locator('.queue-table tbody tr').first().locator('input[type=checkbox]'),
        page.getByRole('group', {name: 'Lọc theo kiểm tra máy'}).getByRole('button', {name: /Tất cả/}),
      ]) {
        await locator.scrollIntoViewIfNeeded();
        assert(await unobstructed(locator), `${width}px: nút/ô bị che hoặc tràn khỏi màn hình`);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${width}px: tràn ngang`);
    }

    await page.setViewportSize({width: 390, height: 844});
    await page.goto(origin + '/practice/banks?subject_id=' + subjectId);
    await page.locator('.queue-table tbody tr').first().waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({path: path.join(artifacts, 'ui-banks-mobile.png'), fullPage: true});
    // Chặn lỗi cũ: luật cột của màn rộng từng lọt xuống điện thoại, bóp danh sách câu còn 2px.
    const widths = await page.evaluate(() => ({vw: innerWidth, table: document.querySelector('.queue-table-wrap').getBoundingClientRect().width}));
    assert(widths.table >= widths.vw - 60, 'Danh sách câu phải gần full chiều ngang điện thoại: ' + JSON.stringify(widths));

    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'Không tràn ngang trên điện thoại');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
