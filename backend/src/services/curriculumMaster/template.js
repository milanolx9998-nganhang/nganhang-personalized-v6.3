// File mẫu chương trình môn học (V6.6.7.3) — MỘT file Excel dùng chung cho mọi môn:
//   sheet "Chương trình": Phân môn · Số Chủ đề · Tên Chủ đề (Outcome) · Số YCCĐ · Nội dung YCCĐ · Trang / nguồn
//   sheet "Bài học":      Chương / Chủ đề SGK · Số bài · Tên bài · Phân môn · Mã YCCĐ của bài ("L.2.1; L.2.2")
// Tải về luôn kèm dữ liệu hiện tại (bản nháp nếu có, không thì bản đang dùng) để sửa rồi nạp lại. Nạp lên tạo BẢN NHÁP
// (chương trình đã công bố là bất biến); công bố mới có hiệu lực, lúc đó Bài + liên kết được dựng từ lesson_plan.
import XLSX from 'xlsx';
import {z} from 'zod';
import {pool, tx} from '../../db/pool.js';
import {fail, log} from '../practice/config.js';
import {can} from '../accessResolver.js';
import {canonicalKey} from '../questionCode.js';
import {effectiveCurriculumVersion} from '../curriculumResolver.js';
import {parseWorkbook, permitted, getVersion} from './service.js';
import {letterOf, lessonTitle, yccdLabelOf, versionContent, currentLessons, versionLabels} from './lessonPlan.js';

export const SHEETS = {guide: 'Hướng dẫn', curriculum: 'Chương trình', lessons: 'Bài học'};
const CURRICULUM_COLUMNS = ['Phân môn', 'Số Chủ đề', 'Tên Chủ đề (Outcome)', 'Số YCCĐ', 'Nội dung YCCĐ', 'Trang / nguồn'];
const LESSON_COLUMNS = ['Chương / Chủ đề SGK', 'Số bài', 'Tên bài', 'Phân môn', 'Mã YCCĐ của bài'];
const LIMITS = {outcomes: 300, yccds: 3000, lessons: 400, codes: 100};

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const clean = s => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
const int = v => { const s = String(v ?? '').trim(); if (!/^\d{1,3}(\.0+)?$/.test(s)) return null; const n = Number(s); return n > 0 ? n : null; };
const outcomeLabel = (branch, number) => (branch ? branch + '.' : '') + number;

// ---------- Đọc file ----------
const HEADERS = {
  curriculum: {branch: ['phan mon'], topic: ['so chu de'], title: ['ten chu de'], yccd: ['so yccd'], text: ['noi dung yccd', 'yeu cau can dat'], page: ['trang', 'nguon']},
  lessons: {chapter: ['chuong'], number: ['so bai'], name: ['ten bai'], branch: ['phan mon'], codes: ['ma yccd']},
};
function findHeader(rows, spec, required) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = (rows[i] || []).map(norm), cols = {};
    for (const [key, aliases] of Object.entries(spec)) { const j = cells.findIndex(c => c && aliases.some(a => c.startsWith(a))); if (j >= 0) cols[key] = j; }
    if (required.every(k => cols[k] != null)) return {row: i, cols};
  }
  return null;
}

// Phân môn theo bảng branches của môn: chấp nhận mã (VL), tên (Vật lí) hoặc chữ trong mã câu (L). Môn không chia phân môn: để trống.
export function branchResolver(branches) {
  if (!branches.length) return raw => norm(raw) ? {error: 'Môn này không chia phân môn: để trống cột Phân môn'} : {value: ''};
  const map = new Map();
  for (const b of branches) for (const alias of [b.code, b.name, letterOf(b.code)]) map.set(norm(alias), letterOf(b.code));
  const hint = [...new Set(branches.map(b => `${letterOf(b.code)} = ${b.name}`))].join(', ');
  return raw => {
    const k = norm(raw);
    if (!k) return {value: ''};
    const hit = map.get(k) ?? [...map.entries()].find(([alias]) => alias.length > 2 && k.startsWith(alias))?.[1];
    return hit ? {value: hit} : {error: `Phân môn "${clean(raw)}" không có trong môn này (dùng: ${hint})`};
  };
}

// Mã YCCĐ trong cột "Mã YCCĐ của bài": "L.2.1", "L. 2. 1", "2.1" (thiếu chữ thì lấy phân môn của Bài).
function parseCodes(raw, {resolve, lessonBranch, needsBranch}) {
  const codes = [], errors = [];
  for (const token of String(raw ?? '').split(/[;,\n]+/).map(clean).filter(Boolean)) {
    const m = /^([A-Za-zĐđ]{1,6})?\s*\.?\s*(\d{1,3})\s*\.\s*(\d{1,3})$/u.exec(token);
    if (!m) { errors.push(`Mã "${token}" không đúng dạng (ví dụ L.2.1)`); continue; }
    let branch = lessonBranch || '';
    if (m[1]) { const b = resolve(m[1]); if (b.error) { errors.push(`Mã "${token}": ${b.error}`); continue; } branch = b.value; }
    if (needsBranch && !branch) { errors.push(`Mã "${token}" thiếu phân môn (viết dạng L.2.1)`); continue; }
    const label = yccdLabelOf(branch, Number(m[2]), Number(m[3]));
    if (!codes.some(c => c.label === label)) codes.push({label, branch});
  }
  return {codes, errors};
}

// Chuẩn hoá danh sách Bài (từ file mẫu hoặc từ màn sửa trên web). `labels`: tập nhãn YCCĐ hợp lệ.
export function normalizeLessons(input, {branches, labels}) {
  const resolve = branchResolver(branches), needsBranch = branches.length > 0, errors = [], warnings = [], lessons = [];
  let chapter = '';
  for (const raw of input) {
    const at = raw.at || `Bài ${raw.number ?? '?'}`, err = message => errors.push({sheet: SHEETS.lessons, row: raw.row, at, message});
    const number = int(raw.number);
    if (!number) { err('Số bài phải là số nguyên dương'); continue; }
    const name = lessonTitle(clean(raw.name));
    if (!name) { err('Thiếu Tên bài'); continue; }
    if (name.length > 250) { err('Tên bài quá dài (tối đa 250 ký tự)'); continue; }
    chapter = clean(raw.chapter) || (raw.inheritChapter ? chapter : '');
    if (chapter.length > 300) { err('Tên chương quá dài (tối đa 300 ký tự)'); continue; }
    const b = resolve(raw.branch);
    if (b.error) { err(b.error); continue; }
    const parsed = parseCodes(raw.codes, {resolve, lessonBranch: b.value, needsBranch});
    for (const e of parsed.errors) err(e);
    const unknown = parsed.codes.filter(c => !labels.has(c.label)).map(c => c.label);
    if (unknown.length) err(`Mã YCCĐ không có trong sheet "${SHEETS.curriculum}": ${unknown.join(', ')}`);
    if (parsed.errors.length || unknown.length) continue;
    const codeBranches = [...new Set(parsed.codes.map(c => c.branch).filter(Boolean))];
    if (b.value && codeBranches.some(x => x !== b.value)) { err(`Bài thuộc phân môn ${b.value} nhưng có mã của phân môn khác`); continue; }
    if (lessons.some(l => l.number === number)) { err(`Trùng Số bài ${number}`); continue; }
    if (parsed.codes.length > LIMITS.codes) { err(`Tối đa ${LIMITS.codes} mã YCCĐ mỗi Bài`); continue; }
    if (!parsed.codes.length) warnings.push({sheet: SHEETS.lessons, row: raw.row, at, message: 'Bài chưa có mã YCCĐ nào: câu hỏi của Bài này sẽ không tự gắn được Bài'});
    lessons.push({number, name, chapter, branch: b.value || (codeBranches.length === 1 ? codeBranches[0] : ''), codes: parsed.codes.map(c => c.label)});
  }
  if (lessons.length > LIMITS.lessons) errors.push({sheet: SHEETS.lessons, message: `Tối đa ${LIMITS.lessons} Bài mỗi khối`});
  return {lessons: lessons.sort((a, b) => a.number - b.number), errors, warnings};
}

export function parseTemplate(book, {branches}) {
  const errors = [], warnings = [], sheet = name => book.sheets.find(s => norm(s.name) === norm(name));
  const cur = sheet(SHEETS.curriculum), les = sheet(SHEETS.lessons);
  if (!cur) errors.push({message: `Không thấy sheet "${SHEETS.curriculum}". Hãy dùng đúng file mẫu tải từ hệ thống.`});
  if (!les) errors.push({message: `Không thấy sheet "${SHEETS.lessons}". Hãy dùng đúng file mẫu tải từ hệ thống.`});
  if (errors.length) return {outcomes: [], lessons: [], errors, warnings};

  // Sheet "Chương trình": ô Phân môn / Số Chủ đề / Tên Chủ đề để trống (ô gộp) thì lấy theo dòng trên.
  const h = findHeader(cur.rows, HEADERS.curriculum, ['topic', 'title', 'yccd', 'text']);
  if (!h) return {outcomes: [], lessons: [], errors: [{sheet: SHEETS.curriculum, message: `Không thấy dòng tiêu đề (${CURRICULUM_COLUMNS.join(' · ')})`}], warnings};
  const resolve = branchResolver(branches), needsBranch = branches.length > 0, outcomes = new Map();
  let prev = null, count = 0;
  for (let i = h.row + 1; i < cur.rows.length; i++) {
    const r = cur.rows[i] || [], cell = k => h.cols[k] == null ? '' : clean(r[h.cols[k]]);
    if (!['branch', 'topic', 'title', 'yccd', 'text'].some(k => cell(k))) continue;
    const row = i + 1, err = message => errors.push({sheet: SHEETS.curriculum, row, message});
    const b = resolve(cell('branch') || (prev?.branchRaw ?? ''));
    if (b.error) { err(b.error); continue; }
    if (needsBranch && !b.value) { err('Thiếu Phân môn'); continue; }
    const topic = cell('topic') ? int(cell('topic')) : prev?.topic;
    if (!topic) { err('Số Chủ đề phải là số nguyên dương'); continue; }
    const sameTopic = prev && prev.topic === topic && prev.branch === b.value;
    const title = cell('title') || (sameTopic ? prev.title : '');
    if (!title) { err('Thiếu Tên Chủ đề'); continue; }
    const number = int(cell('yccd')), text = cell('text');
    if (!number) { err('Số YCCĐ phải là số nguyên dương'); continue; }
    if (!text) { err('Thiếu Nội dung YCCĐ'); continue; }
    const key = b.value + '|' + topic;
    let o = outcomes.get(key);
    if (!o) outcomes.set(key, o = {branch: b.value, number: topic, title, yccds: []});
    else if (o.title !== title) { err(`Chủ đề ${outcomeLabel(b.value, topic)} đã có tên khác ở dòng trên ("${o.title}")`); continue; }
    if (o.yccds.some(y => y.number === number)) { err(`Trùng số YCCĐ ${yccdLabelOf(b.value, topic, number)}`); continue; }
    o.yccds.push({number, text, page: cell('page').slice(0, 300), row});
    count++;
    prev = {branchRaw: cell('branch') || prev?.branchRaw || '', branch: b.value, topic, title};
  }
  const list = [...outcomes.values()];
  if (!list.length && !errors.length) errors.push({sheet: SHEETS.curriculum, message: 'Chưa có dòng YCCĐ nào'});
  if (list.length > LIMITS.outcomes || count > LIMITS.yccds) errors.push({sheet: SHEETS.curriculum, message: `Tối đa ${LIMITS.outcomes} Chủ đề và ${LIMITS.yccds} YCCĐ mỗi khối`});
  for (const o of list) {
    const nums = o.yccds.map(y => y.number).sort((a, b) => a - b);
    if (nums[0] !== 1 || nums.some((n, i) => n !== i + 1)) warnings.push({sheet: SHEETS.curriculum, message: `Chủ đề ${outcomeLabel(o.branch, o.number)}: số YCCĐ không liên tục từ 1 (${nums.join(', ')}) — kiểm tra lại nếu không cố ý`});
  }

  // Sheet "Bài học"
  const lh = findHeader(les.rows, HEADERS.lessons, ['number', 'name', 'codes']);
  if (!lh) { errors.push({sheet: SHEETS.lessons, message: `Không thấy dòng tiêu đề (${LESSON_COLUMNS.join(' · ')})`}); return {outcomes: list, lessons: [], errors, warnings}; }
  const rows = [];
  for (let i = lh.row + 1; i < les.rows.length; i++) {
    const r = les.rows[i] || [], cell = k => lh.cols[k] == null ? '' : clean(r[lh.cols[k]]);
    if (!['chapter', 'number', 'name', 'codes'].some(k => cell(k))) continue;
    rows.push({row: i + 1, number: cell('number'), name: cell('name'), chapter: cell('chapter'), branch: cell('branch'), codes: cell('codes'), inheritChapter: true, at: `Bài ${cell('number') || '?'}`});
  }
  const labels = new Set(list.flatMap(o => o.yccds.map(y => yccdLabelOf(o.branch, o.number, y.number))));
  const lessons = normalizeLessons(rows, {branches, labels});
  return {outcomes: list, lessons: lessons.lessons, errors: [...errors, ...lessons.errors], warnings: [...warnings, ...lessons.warnings]};
}

// ---------- Ghi file ----------
export function buildWorkbook(data, {subject, grade, source}) {
  const wb = XLSX.utils.book_new(), branchHint = subject.branches.length
    ? [...new Set(subject.branches.map(b => `${letterOf(b.code)} = ${b.name}`))].join(', ')
    : 'môn này không chia phân môn: để trống';
  const guide = [
    ['FILE MẪU CHƯƠNG TRÌNH MÔN HỌC'], ['Môn', subject.name], ['Khối', grade], ['Dữ liệu trong file', source], [],
    ['Cách dùng'],
    ['1. Sửa trực tiếp trong 2 sheet "Chương trình" và "Bài học" (không đổi tên sheet, không đổi dòng tiêu đề).'],
    ['2. Sheet "Chương trình": mỗi dòng là MỘT YCCĐ. Chủ đề (Outcome) đánh số trong từng phân môn; YCCĐ đánh số từ 1 trong từng Chủ đề.'],
    ['   Ô Phân môn / Số Chủ đề / Tên Chủ đề để trống (hoặc gộp ô) thì lấy theo dòng trên.'],
    ['3. Sheet "Bài học": mỗi dòng là MỘT Bài. Cột "Mã YCCĐ của bài" ghi các YCCĐ Bài dạy, cách nhau bằng dấu ;'],
    ['   Ví dụ: L.2.1; L.2.2 (Phân môn . Số Chủ đề . Số YCCĐ). Môn không chia phân môn ghi 2.1; 2.2'],
    ['4. Mã YCCĐ chính là số giáo viên viết trong mã câu hỏi: "Câu L. 2. 1. NB. 1. TN".'],
    ['5. Tải file lên ở màn "Chương trình môn học": hệ thống kiểm lỗi từng dòng và cho xem thay đổi trước khi tạo bản nháp.'],
    ['   Bản nháp chỉ có hiệu lực sau khi BGH / quản trị bấm Công bố. Bài không có trong file được giữ nguyên.'],
    [], ['Phân môn dùng được', branchHint],
  ];
  const curRows = [CURRICULUM_COLUMNS];
  for (const o of data.outcomes) for (const y of o.yccds) curRows.push([o.branch, o.number, o.title, y.number, y.text, y.page || '']);
  const lesRows = [LESSON_COLUMNS, ...data.lessons.map(l => [l.chapter || '', l.number, l.name, l.branch || '', (l.codes || []).join('; ')])];
  const sheet = (rows, widths) => { const s = XLSX.utils.aoa_to_sheet(rows); s['!cols'] = widths.map(wch => ({wch})); return s; };
  XLSX.utils.book_append_sheet(wb, sheet(guide, [110, 40]), SHEETS.guide);
  XLSX.utils.book_append_sheet(wb, sheet(curRows, [10, 10, 45, 9, 90, 14]), SHEETS.curriculum);
  XLSX.utils.book_append_sheet(wb, sheet(lesRows, [34, 8, 50, 10, 40]), SHEETS.lessons);
  wb.Props = {Title: `Chương trình ${subject.name} khối ${grade}`};
  return XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'});
}

// ---------- Trạng thái + khác biệt ----------
const scope = z.object({subject_id: z.coerce.number().int().positive(), grade: z.coerce.number().int().min(1).max(12)});
async function subjectOf(c, id) {
  const s = (await c.query('SELECT id,code,name FROM subjects WHERE id=$1', [id])).rows[0];
  if (!s) fail('Không tìm thấy môn', 404);
  s.branches = (await c.query('SELECT id,code,name FROM branches WHERE subject_id=$1 ORDER BY id', [id])).rows;
  return s;
}
const toData = outcomes => outcomes.map(o => ({branch: o.branch, number: o.number, title: o.title, yccds: o.yccds.map(y => ({number: y.number, text: y.text, page: y.page}))}));

async function state(c, subject, grade) {
  const effective = await effectiveCurriculumVersion(c, subject.id, grade);
  const draft = (await c.query("SELECT * FROM curriculum_versions WHERE subject_id=$1 AND grade=$2 AND status='DRAFT' ORDER BY id DESC LIMIT 1", [subject.id, grade])).rows[0] || null;
  const published = await versionContent(c, {versionId: effective?.id ?? null, subjectId: subject.id, grade});
  const lessons = await currentLessons(c, subject.id, grade, published);
  const draftContent = draft ? await versionContent(c, {versionId: draft.id}) : null;
  return {effective, draft, published, lessons, draftContent};
}

export function diffData(before, after) {
  const index = data => { const o = new Map(), y = new Map(); for (const x of data.outcomes) { o.set(outcomeLabel(x.branch, x.number), x); for (const q of x.yccds) y.set(yccdLabelOf(x.branch, x.number, q.number), q); } return {o, y}; };
  const a = index(before), b = index(after), same = (p, q) => clean(p) === clean(q), cap = list => list.slice(0, 100);
  const outcomes = {added: [], removed: [], renamed: []}, yccds = {added: [], removed: [], changed: []}, lessons = {added: [], removed: [], changed: []};
  for (const [k, x] of b.o) { const p = a.o.get(k); if (!p) outcomes.added.push({label: k, title: x.title}); else if (!same(p.title, x.title)) outcomes.renamed.push({label: k, before: p.title, after: x.title}); }
  for (const [k, p] of a.o) if (!b.o.has(k)) outcomes.removed.push({label: k, title: p.title});
  for (const [k, x] of b.y) { const p = a.y.get(k); if (!p) yccds.added.push({label: k, text: x.text}); else if (!same(p.text, x.text)) yccds.changed.push({label: k, before: p.text, after: x.text}); }
  for (const [k, p] of a.y) if (!b.y.has(k)) yccds.removed.push({label: k, text: p.text});
  const la = new Map(before.lessons.map(l => [l.number, l])), lb = new Map(after.lessons.map(l => [l.number, l]));
  for (const [n, l] of lb) {
    const p = la.get(n);
    if (!p) { lessons.added.push({number: n, name: l.name, codes: l.codes}); continue; }
    const addedCodes = l.codes.filter(x => !p.codes.includes(x)), removedCodes = p.codes.filter(x => !l.codes.includes(x));
    const fields = [!same(p.name, l.name) && 'tên', !same(p.chapter, l.chapter) && 'chương', (p.branch || '') !== (l.branch || '') && 'phân môn'].filter(Boolean);
    if (fields.length || addedCodes.length || removedCodes.length) lessons.changed.push({number: n, name: l.name, before_name: p.name, fields, added_codes: addedCodes, removed_codes: removedCodes});
  }
  for (const [n, p] of la) if (!lb.has(n)) lessons.removed.push({number: n, name: p.name});
  const counts = {outcomes_added: outcomes.added.length, outcomes_removed: outcomes.removed.length, outcomes_renamed: outcomes.renamed.length,
    yccds_added: yccds.added.length, yccds_removed: yccds.removed.length, yccds_changed: yccds.changed.length,
    lessons_added: lessons.added.length, lessons_kept_not_in_file: lessons.removed.length, lessons_changed: lessons.changed.length};
  return {counts, outcomes: {added: cap(outcomes.added), removed: cap(outcomes.removed), renamed: cap(outcomes.renamed)},
    yccds: {added: cap(yccds.added), removed: cap(yccds.removed), changed: cap(yccds.changed)},
    lessons: {added: cap(lessons.added), removed: cap(lessons.removed), changed: cap(lessons.changed)}};
}

// ---------- Tạo bản nháp ----------
async function audit(c, actor, v, action, before, after, reason) {
  await c.query('INSERT INTO curriculum_change_log(version_id,actor_id,action,before_data,after_data,reason) VALUES($1,$2,$3,$4,$5,$6)', [v.id, actor.id, action, before, after, reason]);
  await c.query('UPDATE curriculum_versions SET revision=revision+1 WHERE id=$1', [v.id]);
  await log(c, actor, 'CURRICULUM_' + action, v.id, {before, after, reason});
}

// Một môn + khối chỉ có MỘT bản nháp đang mở: bản nháp cũ được lưu trữ (ARCHIVED, còn trong lịch sử), không xoá.
async function createDraft(c, actor, subject, grade, data, {sourceName, reason}) {
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`curriculum-draft:${subject.id}:${grade}`]);
  const effective = await effectiveCurriculumVersion(c, subject.id, grade);
  const prior = await versionContent(c, {versionId: effective?.id ?? null, subjectId: subject.id, grade});
  // Giữ lineage theo nhãn nguồn để so phiên bản / xem tác động vẫn nối được Chủ đề/YCCĐ cũ và mới.
  const lineage = new Map();
  for (const o of prior) { lineage.set('o|' + outcomeLabel(o.branch, o.number), o.lineage_id); for (const y of o.yccds) lineage.set('y|' + yccdLabelOf(o.branch, o.number, y.number), y.lineage_id); }
  const archived = (await c.query("UPDATE curriculum_versions SET status='ARCHIVED' WHERE subject_id=$1 AND grade=$2 AND status='DRAFT' RETURNING id,version_code", [subject.id, grade])).rows;
  const seq = (await c.query('SELECT count(*)::int AS n FROM curriculum_versions WHERE subject_id=$1 AND grade=$2', [subject.id, grade])).rows[0].n + 1;
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const v = (await c.query('INSERT INTO curriculum_versions(subject_id,grade,version_code,title,source_name,source_ref,based_on,created_by,lesson_plan) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [subject.id, grade, `${subject.code}${grade}-${stamp}-${seq}`, `Chương trình ${subject.name} khối ${grade}`, sourceName.slice(0, 300), 'File mẫu chương trình', effective?.id ?? null, actor.id, JSON.stringify({lessons: data.lessons})])).rows[0];
  let order = 0, yccdCount = 0;
  for (const o of data.outcomes) {
    const key = o.branch ? canonicalKey({subject_code: subject.code, grade, branch_code: o.branch, outcome_number: o.number}) : null;
    const row = (await c.query(`INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document,status,curriculum_version_id,order_index,source_branch_code,source_ordinal,canonical_key,source_text,lineage_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,$9,$10,$11,$12,$5,COALESCE($13::uuid,gen_random_uuid())) RETURNING id`,
    [subject.id, grade, o.branch || null, outcomeLabel(o.branch, o.number), o.title, v.version_code, sourceName.slice(0, 300), v.id, ++order, o.branch || null, o.number, key, lineage.get('o|' + outcomeLabel(o.branch, o.number)) ?? null])).rows[0];
    let yOrder = 0;
    for (const y of o.yccds) {
      const label = yccdLabelOf(o.branch, o.number, y.number);
      await c.query(`INSERT INTO curriculum_yccds(outcome_id,code,text,source_locator,order_index,status,curriculum_version_id,source_ordinal,canonical_key,source_text,source_page,lineage_id)
        VALUES($1,$2,$3,$4,$5,'DRAFT',$6,$7,$8,$3,$4,COALESCE($9::uuid,gen_random_uuid()))`,
      [row.id, label, y.text, y.page || null, ++yOrder, v.id, y.number, key ? key + ':' + y.number : null, lineage.get('y|' + label) ?? null]);
      yccdCount++;
    }
  }
  const counts = {outcomes: data.outcomes.length, yccds: yccdCount, lessons: data.lessons.length, links: data.lessons.reduce((n, l) => n + l.codes.length, 0)};
  await audit(c, actor, v, 'TEMPLATE_DRAFT_CREATED', archived.length ? {archived_drafts: archived} : null, counts, reason);
  return {version: {id: v.id, version_code: v.version_code, status: 'DRAFT'}, archived_drafts: archived, counts};
}

// ---------- API ----------
async function allow(actor, capabilities, subject, grade, c = pool) {
  for (const cap of capabilities) await permitted(actor, cap, {subject_id: subject.id, grade}, c);
}

export async function templateFile(actor, query) {
  const d = scope.parse(query), subject = await subjectOf(pool, d.subject_id);
  await allow(actor, ['curriculum.read'], subject, d.grade);
  const s = await state(pool, subject, d.grade);
  const fromDraft = !!s.draft, data = fromDraft
    ? {outcomes: toData(s.draftContent), lessons: s.draft.lesson_plan?.lessons || []}
    : {outcomes: toData(s.published), lessons: s.lessons};
  const source = fromDraft ? `Bản nháp ${s.draft.version_code}` : s.effective ? `Bản đang dùng ${s.effective.version_code}` : data.outcomes.length ? 'Dữ liệu cũ chưa gắn phiên bản' : 'Chưa có dữ liệu — điền mới';
  const ascii = String(subject.code).normalize('NFD').replace(/[^A-Za-z0-9]/g, '');
  return {buffer: buildWorkbook(data, {subject, grade: d.grade, source}), filename: `Mau_chuong_trinh_${ascii}_khoi${d.grade}.xlsx`};
}

export async function templateWorkspace(actor, query) {
  const d = scope.parse(query), subject = await subjectOf(pool, d.subject_id);
  await allow(actor, ['curriculum.read'], subject, d.grade);
  const s = await state(pool, subject, d.grade), ctx = {subjectId: subject.id, grade: d.grade};
  const count = outcomes => ({outcomes: outcomes.length, yccds: outcomes.reduce((n, o) => n + o.yccds.length, 0)});
  return {
    subject: {id: subject.id, name: subject.name, branches: [...new Set(subject.branches.map(b => letterOf(b.code)))]}, grade: d.grade,
    published: {version: s.effective && {id: s.effective.id, version_code: s.effective.version_code, published_at: s.effective.published_at},
      legacy: !s.effective && s.published.length > 0, ...count(s.published), lessons: s.lessons.length},
    draft: s.draft && {id: s.draft.id, version_code: s.draft.version_code, revision: s.draft.revision, created_at: s.draft.created_at, source_name: s.draft.source_name,
      outcomes: s.draftContent.map(o => ({id: o.id, label: outcomeLabel(o.branch, o.number), branch: o.branch, number: o.number, title: o.title, code: o.row.code, domain_code: o.row.domain_code || '', order_index: o.row.order_index || 0,
        yccds: o.yccds.map(y => ({id: y.id, label: yccdLabelOf(o.branch, o.number, y.number), number: y.number, text: y.text, code: y.row.code, page: y.page || '', order_index: y.row.order_index || 0}))})),
      lessons: s.draft.lesson_plan?.lessons || [], has_lesson_plan: !!s.draft.lesson_plan,
      diff: diffData({outcomes: toData(s.published), lessons: s.lessons}, {outcomes: toData(s.draftContent), lessons: s.draft.lesson_plan?.lessons || s.lessons})},
    can: {
      import: await can(actor, 'curriculum.import', ctx) && await can(actor, 'curriculum.edit_draft', ctx),
      publish: await can(actor, 'curriculum.publish', ctx) && await can(actor, 'curriculum.manage_lessons', ctx),
    },
  };
}

async function readUpload(actor, raw, file, capabilities) {
  const d = scope.parse(raw), subject = await subjectOf(pool, d.subject_id);
  await allow(actor, capabilities, subject, d.grade);
  if (!file) fail('Chọn file mẫu (.xlsx)');
  if (!/\.xlsx$/i.test(file.originalname)) fail('Dùng file mẫu .xlsx tải từ hệ thống');
  return {d, subject, parsed: parseTemplate(await parseWorkbook(file), {branches: subject.branches})};
}

export async function previewTemplate(actor, raw, file) {
  const {d, subject, parsed} = await readUpload(actor, raw, file, ['curriculum.import']);
  if (parsed.errors.length) return {ok: false, errors: parsed.errors.slice(0, 300), error_count: parsed.errors.length, warnings: parsed.warnings.slice(0, 100)};
  const s = await state(pool, subject, d.grade);
  return {ok: true, warnings: parsed.warnings.slice(0, 100), replaces_draft: s.draft ? s.draft.version_code : null,
    counts: {outcomes: parsed.outcomes.length, yccds: parsed.outcomes.reduce((n, o) => n + o.yccds.length, 0), lessons: parsed.lessons.length, links: parsed.lessons.reduce((n, l) => n + l.codes.length, 0)},
    diff: diffData({outcomes: toData(s.published), lessons: s.lessons}, parsed)};
}

export async function importTemplate(actor, raw, file) {
  const reason = z.string().trim().min(3, 'Ghi lý do / căn cứ (ít nhất 3 ký tự)').max(1000).parse(raw?.reason ?? '');
  const {d, subject, parsed} = await readUpload(actor, raw, file, ['curriculum.import', 'curriculum.edit_draft']);
  if (parsed.errors.length) fail(`File còn ${parsed.errors.length} lỗi; kiểm tra lại trước khi tạo bản nháp`, 422, {errors: parsed.errors.slice(0, 300)});
  return tx(c => createDraft(c, actor, subject, d.grade, parsed, {sourceName: file.originalname, reason}));
}

// "Sửa trên web": mở bản nháp từ bản đang dùng (kèm danh sách Bài + liên kết hiện tại). Đã có bản nháp thì dùng bản đó.
export async function startDraft(actor, raw) {
  const d = scope.extend({reason: z.string().trim().min(3).max(1000).default('Mở bản nháp để sửa trên web')}).parse(raw);
  const subject = await subjectOf(pool, d.subject_id);
  await allow(actor, ['curriculum.edit_draft'], subject, d.grade);
  return tx(async c => {
    const s = await state(c, subject, d.grade);
    if (s.draft) return {version: {id: s.draft.id, version_code: s.draft.version_code, status: 'DRAFT'}, existing: true};
    return createDraft(c, actor, subject, d.grade, {outcomes: toData(s.published), lessons: s.lessons}, {sourceName: 'Sửa trên web', reason: d.reason});
  });
}

const lessonInput = z.object({number: z.union([z.number(), z.string()]), name: z.string().max(400), chapter: z.string().max(400).default(''), branch: z.string().max(40).default(''),
  codes: z.union([z.array(z.string().max(40)).max(200), z.string().max(4000)])}).strict();
export async function saveLessonPlan(actor, versionId, raw) {
  const d = z.object({revision: z.number().int().positive(), reason: z.string().trim().min(3).max(1000), lessons: z.array(lessonInput).max(LIMITS.lessons)}).strict().parse(raw);
  return tx(async c => {
    const v = await getVersion(c, versionId, true);
    await permitted(actor, 'curriculum.edit_draft', v, c);
    if (v.status !== 'DRAFT') fail('Chỉ sửa danh sách Bài của bản nháp', 409);
    if (v.revision !== d.revision) fail('Bản nháp đã thay đổi; tải lại trước khi lưu', 409);
    const branches = (await c.query('SELECT id,code,name FROM branches WHERE subject_id=$1 ORDER BY id', [v.subject_id])).rows;
    const labels = new Set((await versionLabels(c, v.id)).keys());
    const result = normalizeLessons(d.lessons.map((l, i) => ({...l, codes: Array.isArray(l.codes) ? l.codes.join(';') : l.codes, row: i + 1, at: `Bài ${l.number}`})), {branches, labels});
    if (result.errors.length) fail(`Danh sách Bài còn ${result.errors.length} lỗi`, 422, {errors: result.errors});
    await c.query('UPDATE curriculum_versions SET lesson_plan=$2 WHERE id=$1', [v.id, JSON.stringify({lessons: result.lessons})]);
    await audit(c, actor, v, 'LESSON_PLAN_SAVED', {lessons: v.lesson_plan?.lessons?.length ?? 0}, {lessons: result.lessons.length}, d.reason);
    return {ok: true, lessons: result.lessons, warnings: result.warnings};
  });
}
