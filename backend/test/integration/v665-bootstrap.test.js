// V6.6.5 — REAL_4_WORKBOOK_BOOTSTRAP.
// Nạp chính bộ 4 workbook Outcome/YCCĐ KHTN 6–9 chính thức qua hồ sơ tin cậy, công bố phiên bản,
// rồi chứng minh mã câu thật resolve đúng YCCĐ của nguồn.
//
// Khẳng định then chốt:  Câu H. 2. 4. NB. 1. TN  +  KHTN khối 8  →  YCCĐ H.2.4
import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const SOURCE_DIR = 'G:/tai lieu  oppa/UP SHARE/outcome khtn';
const workbookPath = grade => `${SOURCE_DIR}/Outcome_YCCD_KHTN_${grade}.xlsx`;
const GRADES = [6, 7, 8, 9];
const hasSources = GRADES.every(g => fs.existsSync(workbookPath(g)));

const source = process.env.DB_NAME;
if (!source?.startsWith('nganhang_personalized')) throw new Error('Integration tests require an isolated personalized database');

const name = 'nganhang_v665boot_' + Date.now();
const adminPool = new pg.Pool({host: process.env.DB_HOST, port: process.env.DB_PORT, database: source, user: process.env.DB_USER, password: process.env.DB_PASSWORD});
const artifacts = path.resolve('../artifacts');
fs.mkdirSync(artifacts, {recursive: true});
const dump = path.join(artifacts, 'v665boot-source.dump');
const env = {...process.env, PGHOST: process.env.DB_HOST, PGPORT: process.env.DB_PORT, PGUSER: process.env.DB_USER, PGPASSWORD: process.env.DB_PASSWORD};

const port = 3105, origin = 'http://127.0.0.1:' + port;
const pw = crypto.randomBytes(12).toString('base64url');
let db, server, uploadsDir, token, adminId, subjectId, bankId;
const SUBJECT_CODE = 'V665BOOT';
const versions = {};

async function req(method, url, body) {
  const res = await fetch(origin + '/api' + url, {
    method,
    headers: {Authorization: 'Bearer ' + token, ...(body !== undefined ? {'Content-Type': 'application/json'} : {})},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return {status: res.status, data};
}
const expect = (r, s) => assert.equal(r.status, s, typeof r.data === 'string' ? r.data : JSON.stringify(r.data));

async function uploadWorkbook(grade, versionId) {
  const form = new FormData();
  form.append('version_id', String(versionId));
  form.append('file', new Blob([fs.readFileSync(workbookPath(grade))]), `Outcome_YCCD_KHTN_${grade}.xlsx`);
  const res = await fetch(origin + '/api/curriculum/import', {method: 'POST', headers: {Authorization: 'Bearer ' + token}, body: form});
  const data = await res.json();
  assert.equal(res.status, 201, JSON.stringify(data));
  return data;
}

test.before(async () => {
  if (!hasSources) return;
  const d = spawnSync('pg_dump', ['-Fc', '-d', source, '-f', dump], {env, encoding: 'utf8'});
  assert.equal(d.status, 0, d.stderr);
  await adminPool.query('CREATE DATABASE ' + name);
  const restored = spawnSync('pg_restore', ['--no-owner', '--no-privileges', '-d', name, dump], {env, encoding: 'utf8'});
  assert.equal(restored.status, 0, restored.stderr);
  db = new pg.Pool({host: process.env.DB_HOST, port: process.env.DB_PORT, database: name, user: process.env.DB_USER, password: process.env.DB_PASSWORD});

  const department = (await db.query("INSERT INTO departments(code,name) VALUES('V665BOOT_DEP','Tổ bootstrap') RETURNING id")).rows[0].id;
  subjectId = (await db.query("INSERT INTO subjects(code,name,department_id,is_integrated) VALUES($1,'KHTN bootstrap',$2,true) RETURNING id", [SUBJECT_CODE, department])).rows[0].id;
  for (const [code, label] of [['VL', 'Vật lí'], ['HH', 'Hóa học'], ['SH', 'Sinh học']]) {
    await db.query('INSERT INTO branches(subject_id,code,name) VALUES($1,$2,$3)', [subjectId, code, label]);
  }
  bankId = (await db.query("INSERT INTO banks(name,kind,department_id) VALUES('Kho bootstrap','department',$1) RETURNING id", [department])).rows[0].id;
  const hash = await bcrypt.hash(pw, 10);
  adminId = (await db.query("INSERT INTO users(username,password_hash,full_name,role,must_change_password) VALUES('v665boot_admin',$1,'Quản trị bootstrap','admin',false) RETURNING id", [hash])).rows[0].id;

  uploadsDir = path.join(artifacts, 'v665boot-uploads-' + name);
  fs.cpSync(path.resolve(process.env.UPLOAD_DIR || 'uploads'), uploadsDir, {recursive: true, errorOnExist: true});
  const output = fs.openSync(path.join(artifacts, 'v665boot-server.log'), 'w');
  server = spawn(process.execPath, ['src/server.js'], {
    env: {...process.env, DB_NAME: name, UPLOAD_DIR: uploadsDir, PORT: String(port), HOST: '127.0.0.1'},
    stdio: ['ignore', output, output], windowsHide: true,
  });
  let ready = false;
  for (let i = 0; i < 240; i++) {
    if (server.exitCode !== null) throw new Error('Server exited: ' + fs.readFileSync(path.join(artifacts, 'v665boot-server.log'), 'utf8'));
    try { const r = await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1000)}); if (r.ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  assert(ready, 'Server not healthy');
  const login = await fetch(origin + '/api/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: 'v665boot_admin', password: pw})});
  token = (await login.json()).token;
  assert(token);
});

test.after(async () => {
  server?.kill();
  await db?.end();
  await adminPool.end();
});

const skip = hasSources ? false : 'Không tìm thấy bộ 4 workbook chính thức trên máy này';

test('V665 bootstrap: nạp thật 4 workbook KHTN qua hồ sơ tin cậy và công bố', {skip}, async () => {
  for (const grade of GRADES) {
    const created = await req('POST', '/curriculum/versions', {
      subject_id: subjectId, grade, version_code: `GDPT2018-K${grade}`, title: `KHTN khối ${grade}`,
      source_name: `Outcome_YCCD_KHTN_${grade}.xlsx`, source_ref: 'Chương trình GDPT 2018',
    });
    expect(created, 201);
    versions[grade] = created.data;

    const job = await uploadWorkbook(grade, created.data.id);
    const preview = await req('GET', '/curriculum/import/' + job.id + '/preview');
    expect(preview, 200);

    // Hồ sơ tin cậy phải được nhận diện, và khối phải lấy từ tên sheet.
    assert(preview.data.trusted, `Khối ${grade}: không nhận diện được hồ sơ chính thức`);
    assert.equal(preview.data.trusted.profile, 'KHTN_OUTCOME_YCCD_OFFICIAL_V1');
    const sheet = preview.data.trusted.sheets.find(s => s.grade === grade);
    assert(sheet, `Khối ${grade}: sheet không khai đúng khối`);
    assert.equal(sheet.grade_matches_version, true);

    const mapped = await req('PUT', '/curriculum/import/' + job.id + '/map', {
      sheet: sheet.sheet, header_row: sheet.header_row, columns: sheet.columns,
      topic_as_outcome: true, source_profile: preview.data.trusted.profile, revision: job.revision,
    });
    expect(mapped, 200);

    let staged = await req('GET', '/curriculum/import/' + job.id + '/preview');
    expect(staged, 200);
    const risky = staged.data.rows.filter(r => (r.mapped_payload.source_flags || []).length);

    // Khối 7 có ô chứa nhiều YCCĐ và số viết sai: phải bị chặn cho tới khi người dùng xác nhận.
    if (grade === 7) {
      assert(risky.length > 0, 'Khối 7 phải có dòng được gắn cờ nguồn');
      const refused = await req('POST', '/curriculum/import/' + job.id + '/commit', {
        revision: staged.data.job.revision, confirmed: true, reason: 'Nạp nguồn chính thức',
      });
      expect(refused, 409);
    }

    // Nguồn chính thức có chỗ đánh trùng số. Hệ thống phải chặn hẳn, và người phụ trách chương
    // trình sửa số trong staging — hệ thống không được tự đánh lại số.
    const duplicates = staged.data.rows.filter(r => (r.mapped_payload.source_flags || []).includes('SOURCE_ORDINAL_DUPLICATE'));
    if (duplicates.length) {
      assert.equal(duplicates.every(r => r.row_status === 'BLOCKED'), true, 'Trùng số phải chặn hẳn, không cho xác nhận cho qua');
      const byKey = new Map();
      for (const row of duplicates) {
        const p = row.mapped_payload;
        const key = [p.branch_code, p.outcome_ordinal].join(':');
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(row);
      }
      const fixes = [];
      for (const [key, rows] of byKey) {
        const [branch, outcome] = key.split(':');
        const used = staged.data.rows
          .filter(r => r.mapped_payload.branch_code === branch && String(r.mapped_payload.outcome_ordinal) === outcome)
          .map(r => Number(r.mapped_payload.yccd_ordinal)).filter(Number.isInteger);
        let next = Math.max(...used);
        // Giữ nguyên dòng đầu, đánh số tiếp cho các dòng trùng phía sau.
        for (const row of rows.slice(1)) {
          const p = row.mapped_payload;
          fixes.push({id: Number(row.id), values: {
            domain: p.domain ?? '', outcome_code: p.outcome_code ?? '', outcome_title: p.outcome_title ?? '',
            code: p.code ?? '', text: p.text ?? '', group: p.group ?? '', page: p.page ?? '',
            order: Number(p.order) || 0, notes: p.notes ?? '', ignored: !!p.ignored,
            yccd_ordinal: ++next,
          }});
        }
      }
      expect(await req('PUT', '/curriculum/import/' + job.id + '/rows', {revision: staged.data.job.revision, rows: fixes}), 200);
      staged = await req('GET', '/curriculum/import/' + job.id + '/preview');
      expect(staged, 200);
      assert.equal(staged.data.rows.some(r => (r.mapped_payload.source_flags || []).includes('SOURCE_ORDINAL_DUPLICATE')), false,
        'Sửa số xong thì cờ trùng phải tự mất');
    }

    const committed = await req('POST', '/curriculum/import/' + job.id + '/commit', {
      revision: staged.data.job.revision, confirmed: true, reason: 'Nạp nguồn chính thức',
      accept_source_warnings: true,
    });
    expect(committed, 200);

    const detail = await req('GET', '/curriculum/versions/' + created.data.id);
    expect(detail, 200);
    const published = await req('POST', `/curriculum/versions/${created.data.id}/publish`, {
      revision: detail.data.version.revision, confirmed: true, reason: 'Công bố chương trình chính thức',
    });
    expect(published, 200);
  }

  for (const grade of GRADES) {
    const row = (await db.query("SELECT status FROM curriculum_versions WHERE id=$1", [versions[grade].id])).rows[0];
    assert.equal(row.status, 'PUBLISHED', 'Khối ' + grade);
  }
});

test('V665 bootstrap: số thứ tự của nguồn được giữ nguyên trong cơ sở dữ liệu', {skip}, async () => {
  const h2 = (await db.query(
    `SELECT y.source_ordinal,y.text FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id
     WHERE o.curriculum_version_id=$1 AND o.source_branch_code='H' AND o.source_ordinal=2
     ORDER BY y.source_ordinal`, [versions[8].id])).rows;
  assert(h2.length > 0, 'Khối 8 phải có Outcome H.2');
  // Nguồn đánh YCCĐ liên tục theo phân môn: H.2 bắt đầu từ 4 và chạy tới 11.
  assert.equal(h2[0].source_ordinal, 4, 'H.2 phải bắt đầu từ YCCĐ số 4, không phải số 1');
  assert.equal(h2.at(-1).source_ordinal, 11);
  assert.equal(h2[0].text.startsWith('Nêu được khái niệm sự biến đổi'), true, h2[0].text.slice(0, 60));

  const l2 = (await db.query(
    `SELECT y.source_ordinal FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id
     WHERE o.curriculum_version_id=$1 AND o.source_branch_code='L' AND o.source_ordinal=2
     ORDER BY y.source_ordinal`, [versions[9].id])).rows;
  assert.deepEqual(l2.map(r => r.source_ordinal), [1, 2, 3, 4, 5, 6, 7]);

  // Khối 7: ô nhiều YCCĐ đã được tách nên số YCCĐ nhiều hơn số dòng nguồn.
  const g7 = (await db.query(
    `SELECT count(*)::int n FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id
     WHERE o.curriculum_version_id=$1`, [versions[7].id])).rows[0].n;
  assert(g7 > 97, 'Khối 7 phải có nhiều YCCĐ hơn số dòng nguồn sau khi tách, hiện ' + g7);
});

test('V665 bootstrap: mã câu thật resolve đúng YCCĐ của nguồn', {skip}, async () => {
  const {resolveCurriculumCode} = await import('../../src/services/curriculumResolver.js');
  const client = db;

  // KHẲNG ĐỊNH THEN CHỐT: Câu H. 2. 4 + KHTN khối 8 → đúng YCCĐ số 4 của Outcome H.2.
  const h24 = await resolveCurriculumCode(client, {subject_id: subjectId, grade: 8, branch_code: 'H', outcome_number: 2, yccd_number: 4});
  assert.equal(h24.ok, true, JSON.stringify(h24));
  assert.equal(h24.yccd.label, 'H.2.4');
  assert.equal(h24.yccd.text.startsWith('Nêu được khái niệm sự biến đổi'), true, h24.yccd.text.slice(0, 60));
  assert.equal(h24.version.id, versions[8].id, 'Phải resolve trong đúng phiên bản đang hiệu lực');

  const l21 = await resolveCurriculumCode(client, {subject_id: subjectId, grade: 9, branch_code: 'L', outcome_number: 2, yccd_number: 1});
  assert.equal(l21.ok, true, JSON.stringify(l21));
  assert.equal(l21.yccd.label, 'L.2.1');

  // Cùng mã nghiệp vụ ở hai khối phải ra hai YCCĐ khác nhau.
  const g6 = await resolveCurriculumCode(client, {subject_id: subjectId, grade: 6, branch_code: 'H', outcome_number: 1, yccd_number: 1});
  const g8 = await resolveCurriculumCode(client, {subject_id: subjectId, grade: 8, branch_code: 'H', outcome_number: 1, yccd_number: 1});
  if (g6.ok && g8.ok) assert.notEqual(g6.yccd.id, g8.yccd.id);
});

test('V665 bootstrap: resolver bám phiên bản đang hiệu lực, không trả bản cũ', {skip}, async () => {
  const {resolveCurriculumCode, effectiveCurriculumVersion} = await import('../../src/services/curriculumResolver.js');
  const before = await effectiveCurriculumVersion(db, subjectId, 8);
  assert.equal(before.id, versions[8].id);

  // Sao chép thành bản nháp mới, sửa nội dung H.2.4 rồi công bố: resolver phải theo bản mới.
  const copied = await req('POST', `/curriculum/versions/${versions[8].id}/copy`, {version_code: 'GDPT2018-K8-R2', title: 'KHTN khối 8 — bản 2'});
  expect(copied, 201);
  await db.query(
    `UPDATE curriculum_yccds SET text='Bản sửa đổi khối 8 dùng cho kiểm thử' WHERE id=(
       SELECT y.id FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id
       WHERE o.curriculum_version_id=$1 AND o.source_branch_code='H' AND o.source_ordinal=2 AND y.source_ordinal=4)`,
    [copied.data.id]);
  const detail = await req('GET', '/curriculum/versions/' + copied.data.id);
  expect(await req('POST', `/curriculum/versions/${copied.data.id}/publish`, {
    revision: detail.data.version.revision, confirmed: true, reason: 'Công bố bản sửa đổi',
  }), 200);

  const now = await effectiveCurriculumVersion(db, subjectId, 8);
  assert.equal(now.id, copied.data.id, 'Phiên bản hiệu lực phải là bản công bố mới nhất');
  const resolved = await resolveCurriculumCode(db, {subject_id: subjectId, grade: 8, branch_code: 'H', outcome_number: 2, yccd_number: 4});
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  assert.equal(resolved.yccd.text, 'Bản sửa đổi khối 8 dùng cho kiểm thử',
    'Resolver không được trả bản chương trình cũ khi đã có bản công bố mới');
});

test('V665 bootstrap: máy chủ tự kiểm hồ sơ nguồn, không tin client', {skip}, async () => {
  // Phiên bản khối 8 nhưng nạp workbook khối 7: phải bị chặn ở máy chủ, dù client khai đúng hồ sơ.
  const version = await req('POST', '/curriculum/versions', {
    subject_id: subjectId, grade: 8, version_code: 'GDPT2018-K8-SAI', title: 'Kiểm thử lệch khối',
    source_name: 'Outcome_YCCD_KHTN_7.xlsx', source_ref: 'Chương trình GDPT 2018',
  });
  expect(version, 201);
  const job = await uploadWorkbook(7, version.data.id);
  const preview = await req('GET', '/curriculum/import/' + job.id + '/preview');
  expect(preview, 200);
  const sheet7 = preview.data.trusted.sheets.find(s => s.grade === 7);
  assert.equal(sheet7.grade_matches_version, false, 'Khối sheet phải khác khối phiên bản');

  const mismatched = await req('PUT', '/curriculum/import/' + job.id + '/map', {
    sheet: sheet7.sheet, header_row: sheet7.header_row, columns: sheet7.columns,
    topic_as_outcome: true, source_profile: 'KHTN_OUTCOME_YCCD_OFFICIAL_V1', revision: job.revision,
  });
  expect(mismatched, 409);
  assert.equal(mismatched.data.details.code, 'TRUSTED_SOURCE_GRADE_MISMATCH');
  assert.equal(mismatched.data.details.sheet_grade, 7);
  assert.equal(mismatched.data.details.version_grade, 8);
  assert.equal((await db.query('SELECT count(*)::int n FROM curriculum_import_rows WHERE import_job_id=$1', [job.id])).rows[0].n, 0,
    'Bị chặn thì không được dàn dựng dòng nào');

  // Client khai sheet không có trong hồ sơ nguồn cũng bị từ chối.
  const unknown = await req('PUT', '/curriculum/import/' + job.id + '/map', {
    sheet: sheet7.sheet, header_row: 1, columns: sheet7.columns,
    topic_as_outcome: true, source_profile: 'KHTN_OUTCOME_YCCD_OFFICIAL_V1', revision: job.revision,
  });
  expect(unknown, 409);
  assert.equal(unknown.data.details.code, 'TRUSTED_SOURCE_GRADE_MISMATCH');

  // V6.6.5.2 §62 — bỏ source_profile (null hoặc không gửi) cũng không vòng qua được kiểm tra khối:
  // máy chủ tự nhận ra sheet thuộc bộ nguồn chính thức.
  for (const source_profile of [null, undefined]) {
    const bypass = await req('PUT', '/curriculum/import/' + job.id + '/map', {
      sheet: sheet7.sheet, header_row: sheet7.header_row, columns: sheet7.columns,
      topic_as_outcome: true, ...(source_profile === null ? {source_profile: null} : {}), revision: job.revision,
    });
    expect(bypass, 409);
    assert.equal(bypass.data.details.code, 'TRUSTED_SOURCE_GRADE_MISMATCH');
  }
  assert.equal((await db.query('SELECT count(*)::int n FROM curriculum_import_rows WHERE import_job_id=$1', [job.id])).rows[0].n, 0);
});

test('V665 bootstrap: máy chủ dùng ánh xạ tự suy ra, bỏ qua header/cột sai do client gửi', {skip}, async () => {
  const version = await req('POST', '/curriculum/versions', {
    subject_id: subjectId, grade: 9, version_code: 'GDPT2018-K9-SERVERMAP', title: 'Kiểm thử ánh xạ máy chủ',
    source_name: 'Outcome_YCCD_KHTN_9.xlsx', source_ref: 'Chương trình GDPT 2018',
  });
  expect(version, 201);
  const job = await uploadWorkbook(9, version.data.id);
  const preview = await req('GET', '/curriculum/import/' + job.id + '/preview');
  const sheet = preview.data.trusted.sheets.find(s => s.grade === 9);

  // Client gửi dòng tiêu đề và cột sai hoàn toàn; máy chủ phải tự nhận diện lại và dùng bản đúng.
  const mapped = await req('PUT', '/curriculum/import/' + job.id + '/map', {
    sheet: sheet.sheet, header_row: 1, columns: {text: 0, group: 1, outcome_title: 1, domain: 2},
    topic_as_outcome: false, source_profile: 'KHTN_OUTCOME_YCCD_OFFICIAL_V1', revision: job.revision,
  });
  expect(mapped, 200);
  assert.equal(mapped.data.mapping.header_row, sheet.header_row, 'Phải dùng dòng tiêu đề do máy chủ suy ra');
  assert.deepEqual(mapped.data.mapping.columns, sheet.columns, 'Phải dùng ánh xạ cột do máy chủ suy ra');
  assert.equal(mapped.data.mapping.topic_as_outcome, true);

  const staged = await req('GET', '/curriculum/import/' + job.id + '/preview');
  const sample = staged.data.rows.find(r => r.mapped_payload.branch_code === 'L');
  assert(sample, 'Phải nhận ra phân môn từ cột Môn thật');
  assert.equal(Number.isInteger(sample.mapped_payload.yccd_ordinal), true);
});

test('V665 bootstrap: nạp lại cùng bộ nguồn là idempotent', {skip}, async () => {
  const created = await req('POST', '/curriculum/versions', {
    subject_id: subjectId, grade: 6, version_code: 'GDPT2018-K6-LAI', title: 'KHTN khối 6 — nạp lại',
    source_name: 'Outcome_YCCD_KHTN_6.xlsx', source_ref: 'Chương trình GDPT 2018',
  });
  expect(created, 201);
  const job = await uploadWorkbook(6, created.data.id);
  const preview = await req('GET', '/curriculum/import/' + job.id + '/preview');
  const sheet = preview.data.trusted.sheets.find(s => s.grade === 6);
  expect(await req('PUT', '/curriculum/import/' + job.id + '/map', {
    sheet: sheet.sheet, header_row: sheet.header_row, columns: sheet.columns,
    topic_as_outcome: true, source_profile: preview.data.trusted.profile, revision: job.revision,
  }), 200);
  const staged = await req('GET', '/curriculum/import/' + job.id + '/preview');
  const first = await req('POST', '/curriculum/import/' + job.id + '/commit', {
    revision: staged.data.job.revision, confirmed: true, reason: 'Nạp lần đầu', accept_source_warnings: true,
  });
  expect(first, 200);
  assert.equal(first.data.unchanged, 0);
  assert(first.data.imported > 0);

  // Nạp đúng bộ đó lần nữa vào cùng phiên bản: không sinh bản trùng.
  const again = await uploadWorkbook(6, created.data.id);
  const preview2 = await req('GET', '/curriculum/import/' + again.id + '/preview');
  const sheet2 = preview2.data.trusted.sheets.find(s => s.grade === 6);
  expect(await req('PUT', '/curriculum/import/' + again.id + '/map', {
    sheet: sheet2.sheet, header_row: sheet2.header_row, columns: sheet2.columns,
    topic_as_outcome: true, source_profile: preview2.data.trusted.profile, revision: again.revision,
  }), 200);
  const staged2 = await req('GET', '/curriculum/import/' + again.id + '/preview');
  const second = await req('POST', '/curriculum/import/' + again.id + '/commit', {
    revision: staged2.data.job.revision, confirmed: true, reason: 'Nạp lại', accept_source_warnings: true,
  });
  expect(second, 200);
  assert.equal(second.data.imported, 0, 'Nạp lại cùng nguồn không được tạo thêm YCCĐ');
  assert.equal(second.data.unchanged, first.data.imported);
});
