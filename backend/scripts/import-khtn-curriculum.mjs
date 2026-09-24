// Nạp chương trình Outcome/YCCĐ KHTN từ workbook chính thức NẰM TRONG REPO — cho máy chủ không có file nguồn
// (máy chủ và máy soạn chỉ dùng chung GitHub). Đi qua đúng các hàm mà giao diện "Môn học & Chương trình" dùng:
// tạo bản nháp → tải workbook → hồ sơ tin cậy tự nhận → map → ghi → (tuỳ chọn) công bố. Không SQL tay.
//
//   cd backend
//   node scripts/import-khtn-curriculum.mjs --grade 9                                   # KIỂM TRA (mặc định, không ghi)
//   node scripts/import-khtn-curriculum.mjs --grade 9 --apply --actor <admin> [--publish]
//     [--accept-source-warnings]   khối có ô chứa nhiều YCCĐ / số viết sai (khối 7) — người phụ trách đã xem
//     [--renumber-duplicates]      nguồn trùng số YCCĐ: giữ dòng đầu, dòng trùng sau nhận số kế tiếp sau số lớn nhất
//                                  của Chủ đề đó — chỉ dùng khi người phụ trách đồng ý (workbook khối 8 trong repo đã
//                                  đánh lại số, không cần cờ này)
//     [--file <đường dẫn>]         mặc định src/db/seed-data/curriculum/Outcome_YCCD_KHTN_<khối>.xlsx
//     [--new-version]              cho phép tạo thêm bản khi khối đã có bản PUBLISHED
//
// Kiểm tra trước khi ghi: có cờ nguồn mà chưa được phép → dừng TRƯỚC khi tạo bất cứ thứ gì trong database.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pool} from '../src/db/pool.js';
import {createVersion, upload, preview, mapImport, editRows, commitImport, publishVersion, detail, parseWorkbook} from '../src/services/curriculumMaster/service.js';
import {detectTrustedProfile, normalizeSourceRows, BLOCKING_SOURCE_FLAGS} from '../src/services/curriculumMaster/trustedProfiles.js';
import {getEffectiveAccess, attachAccess} from '../src/services/accessResolver.js';
import {capabilitySummary} from '../src/services/capabilities.js';

const args = process.argv.slice(2);
const has = f => args.includes(f);
const val = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const grade = Number(val('--grade'));
const apply = has('--apply');
const file = val('--file') || fileURLToPath(new URL(`../src/db/seed-data/curriculum/Outcome_YCCD_KHTN_${grade}.xlsx`, import.meta.url));
// stop(): chỉ dùng TRƯỚC khi ghi → mã thoát 3 nghĩa là "chưa ghi gì". Lỗi khác (kể cả lỗi Postgres có e.code) thoát 1.
const stop = (code, message, extra) => { const e = new Error(message); e.code = code; e.extra = extra; e.stop = true; throw e; };

async function actorFor(username) {
  const row = (await pool.query('SELECT id,username,full_name,role,subject_id,department_id,token_version,must_change_password FROM users WHERE username=$1 AND is_active=true', [username])).rows[0];
  if (!row) stop('ACTOR_NOT_FOUND', 'Không tìm thấy tài khoản đang hoạt động: ' + username);
  if (row.role !== 'admin') stop('ACTOR_NOT_ADMIN', 'Tài khoản thực hiện phải là admin');
  return attachAccess({...row, ...await capabilitySummary(row)}, await getEffectiveAccess(row));
}

// Kiểm tra cục bộ bằng đúng bộ đọc + hồ sơ tin cậy của máy chủ, không ghi gì.
async function inspect(buffer) {
  const workbook = await parseWorkbook({originalname: path.basename(file), buffer});
  const trusted = detectTrustedProfile(workbook);
  const sheet = trusted?.sheets.find(s => s.grade === grade);
  if (!sheet) stop('NOT_TRUSTED', `Workbook không được nhận là nguồn chính thức khối ${grade} (tên sheet phải ghi khối, có cột Môn / Chủ đề / Yêu cầu cần đạt).`);
  const rows = workbook.sheets.find(s => s.name === sheet.sheet).rows.slice(sheet.header_row)
    .map(r => ({domain: r[sheet.columns.domain], group: r[sheet.columns.group], text: r[sheet.columns.text], page: sheet.columns.page != null ? r[sheet.columns.page] : null}))
    .filter(r => String(r.text ?? '').trim());
  const out = normalizeSourceRows(rows);
  const flags = {};
  for (const r of out) for (const f of r.source_flags) flags[f] = (flags[f] || 0) + 1;
  const duplicates = out.filter(r => r.source_flags.includes('SOURCE_ORDINAL_DUPLICATE')).map(r => ({key: `${r.branch_code}.${r.outcome_ordinal}.${r.yccd_ordinal}`, text: r.text.slice(0, 100)}));
  const risky = out.filter(r => r.source_flags.some(f => BLOCKING_SOURCE_FLAGS.has(f) && f !== 'SOURCE_ORDINAL_DUPLICATE'))
    .map(r => ({key: `${r.branch_code}.${r.outcome_ordinal}.${r.yccd_ordinal}`, flags: r.source_flags, text: r.text.slice(0, 100)}));
  return {sheet: sheet.sheet, yccd: out.length, outcomes: new Set(out.map(r => r.branch_code + '.' + r.outcome_ordinal)).size, flags, duplicates,
    risky_rows: risky.length, risky};
}

let report = {grade, file: path.relative(process.cwd(), file), mode: apply ? 'APPLY' : 'CHECK'};
try {
  if (![6, 7, 8, 9].includes(grade)) stop('BAD_ARGS', 'Cần --grade 6|7|8|9');
  if (!fs.existsSync(file)) stop('FILE_NOT_FOUND', 'Không thấy workbook: ' + file);
  const buffer = fs.readFileSync(file);
  const subject = (await pool.query("SELECT id,name FROM subjects WHERE code='KHTN'")).rows[0];
  if (!subject) stop('SUBJECT_NOT_FOUND', 'Máy chủ chưa có môn KHTN');
  const versions = (await pool.query('SELECT id,version_code,status FROM curriculum_versions WHERE subject_id=$1 AND grade=$2 ORDER BY id', [subject.id, grade])).rows;
  report = {...report, ...await inspect(buffer), existing_versions: versions};

  if (apply) {
    if (!val('--actor')) stop('BAD_ARGS', '--apply cần --actor <tên đăng nhập admin>');
    if (versions.some(v => v.status === 'PUBLISHED') && !has('--new-version')) stop('ALREADY_PUBLISHED', `KHTN khối ${grade} đã có bản PUBLISHED; không nạp lại (thêm --new-version nếu thật sự cần bản mới).`);
    if (report.duplicates.length && !has('--renumber-duplicates')) stop('SOURCE_ORDINAL_DUPLICATE', 'Nguồn có YCCĐ trùng số; cần người phụ trách quyết định cách đánh số (xem duplicates). Chưa ghi gì.', report.duplicates);
    if (report.risky_rows && !has('--accept-source-warnings')) stop('SOURCE_WARNINGS', `${report.risky_rows} dòng có cờ nguồn (ô nhiều YCCĐ / số viết sai); người phụ trách xem rồi chạy lại với --accept-source-warnings. Chưa ghi gì.`, report.flags);
    const actor = await actorFor(val('--actor'));
    const stamp = new Date().toISOString().slice(0, 10);
    const version = await createVersion(actor, {subject_id: subject.id, grade, version_code: `GDPT2018-KHTN${grade}-${stamp}${versions.length ? '-' + (versions.length + 1) : ''}`,
      title: `KHTN khối ${grade} — CT GDPT 2018`, source_name: path.basename(file), source_ref: 'Chương trình GDPT 2018, TT 32/2018/TT-BGDĐT'});
    const job = await upload(actor, version.id, {originalname: path.basename(file), buffer, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: buffer.length});
    const first = await preview(actor, job.id);
    const sheet = first.trusted.sheets.find(s => s.grade === grade);
    await mapImport(actor, job.id, {sheet: sheet.sheet, header_row: sheet.header_row, columns: sheet.columns, topic_as_outcome: true, source_profile: first.trusted.profile, revision: job.revision});
    let staged = await preview(actor, job.id);
    const renumbered = [];
    const dupRows = staged.rows.filter(r => (r.mapped_payload.source_flags || []).includes('SOURCE_ORDINAL_DUPLICATE'));
    if (dupRows.length) {
      // Giữ dòng đầu của mỗi số trùng; các dòng sau nhận số kế tiếp sau số lớn nhất trong cùng phân môn + Chủ đề.
      const groups = new Map();
      for (const r of dupRows) { const p = r.mapped_payload, k = `${p.branch_code}:${p.outcome_ordinal}:${p.yccd_ordinal}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
      const fixes = [];
      for (const rows of groups.values()) {
        const p0 = rows[0].mapped_payload;
        let next = Math.max(...staged.rows.filter(r => r.mapped_payload.branch_code === p0.branch_code && r.mapped_payload.outcome_ordinal === p0.outcome_ordinal)
          .map(r => Number(r.mapped_payload.yccd_ordinal)).filter(Number.isInteger));
        for (const row of rows.slice(1)) {
          const p = row.mapped_payload;
          next++;
          renumbered.push({from: `${p.branch_code}.${p.outcome_ordinal}.${p.yccd_ordinal}`, to: `${p.branch_code}.${p.outcome_ordinal}.${next}`, text: String(p.text).slice(0, 100)});
          fixes.push({id: Number(row.id), values: {domain: p.domain ?? '', outcome_code: p.outcome_code ?? '', outcome_title: p.outcome_title ?? '', code: p.code ?? '', text: p.text ?? '',
            group: p.group ?? '', page: String(p.page ?? ''), order: Number(p.order) || 0, notes: p.notes ?? '', ignored: !!p.ignored, yccd_ordinal: next}});
        }
      }
      await editRows(actor, job.id, {revision: staged.job.revision, rows: fixes});
      staged = await preview(actor, job.id);
    }
    const committed = await commitImport(actor, job.id, {revision: staged.job.revision, confirmed: true, reason: `Nạp chương trình chính thức KHTN ${grade} từ repo`, accept_source_warnings: has('--accept-source-warnings')});
    let published = false;
    if (has('--publish')) {
      const current = await detail(actor, version.id);
      await publishVersion(actor, version.id, {revision: current.version.revision, confirmed: true, reason: `Công bố chương trình KHTN ${grade}`});
      published = true;
    }
    report = {...report, version_id: version.id, version_code: version.version_code, imported: committed.count ?? committed.imported, renumbered, published};
  }
  console.log(JSON.stringify(report, null, 1));
} catch (e) {
  console.error(`[${e.code || e.details?.code || 'ERROR'}] ${e.message}`);
  if (e.extra) console.error(JSON.stringify(e.extra, null, 1));
  if (e.details) console.error(JSON.stringify(e.details, null, 1).slice(0, 2000));
  process.exitCode = e.stop ? 3 : 1;
} finally {
  await pool.end();
}
