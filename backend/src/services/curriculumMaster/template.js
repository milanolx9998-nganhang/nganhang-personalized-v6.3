// File mẫu chương trình môn học (V6.6.7.3; V6.6.7.4: chữ viết tắt môn, sheet Ví dụ + Dùng AI, mẫu Word nhập câu theo môn).
// MỘT file Excel dùng chung cho mọi môn:
//   sheet "Chương trình": [Phân môn] · Số Chủ đề · Tên Chủ đề (Outcome) · Số YCCĐ · Nội dung YCCĐ · Trang / nguồn
//   sheet "Bài học":      Chương / Chủ đề SGK · Số bài · Tên bài · [Phân môn] · Mã YCCĐ của bài ("T.2.1; T.2.2")
//   sheet "Hướng dẫn", "Ví dụ", "Dùng AI" chỉ để đọc — hệ thống không nạp.
// Cột Phân môn chỉ có ở môn chia phân môn (KHTN: L/H/S). Môn khác dùng chữ viết tắt của môn (subjects.code_letter,
// Toán = T) làm chữ đầu nhãn và mã câu: YCCĐ T.2.1 ↔ "Câu T. 2. 1. NB. 1. TN".
// Tải về luôn kèm dữ liệu hiện tại (bản nháp nếu có, không thì bản đang dùng) để sửa rồi nạp lại. Nạp lên tạo BẢN NHÁP
// (chương trình đã công bố là bất biến); công bố mới có hiệu lực, lúc đó Bài + liên kết được dựng từ lesson_plan.
import XLSX from 'xlsx';
import {Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType} from 'docx';
import {z} from 'zod';
import {pool, tx} from '../../db/pool.js';
import {fail, log} from '../practice/config.js';
import {can} from '../accessResolver.js';
import {canonicalKey} from '../questionCode.js';
import {effectiveCurriculumVersion} from '../curriculumResolver.js';
import {parseWorkbook, permitted, getVersion} from './service.js';
import {letterOf, lessonTitle, yccdLabelOf, versionContent, currentLessons, versionLabels} from './lessonPlan.js';

export const SHEETS = {guide: 'Hướng dẫn', curriculum: 'Chương trình', lessons: 'Bài học', example: 'Ví dụ', ai: 'Dùng AI'};
const CURRICULUM_COLUMNS = ['Phân môn', 'Số Chủ đề', 'Tên Chủ đề (Outcome)', 'Số YCCĐ', 'Nội dung YCCĐ', 'Trang / nguồn'];
const LESSON_COLUMNS = ['Chương / Chủ đề SGK', 'Số bài', 'Tên bài', 'Phân môn', 'Mã YCCĐ của bài'];
const LIMITS = {outcomes: 300, yccds: 3000, lessons: 400, codes: 100};

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const clean = s => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
const int = v => { const s = String(v ?? '').trim(); if (!/^\d{1,3}(\.0+)?$/.test(s)) return null; const n = Number(s); return n > 0 ? n : null; };
const outcomeLabel = (branch, number) => (branch ? branch + '.' : '') + number;
const asciiOf = code => String(code).normalize('NFD').replace(/[^A-Za-z0-9]/g, '');

// ---------- Chữ đầu mã của môn ----------
const branched = subject => subject.branches.length > 0;
// Chữ đầu nhãn / mã câu dùng được: phân môn (KHTN: L, H, S) hoặc chữ viết tắt của môn (Toán: T). Rỗng: môn chưa có chữ.
export const subjectLetters = subject => branched(subject)
  ? [...new Set(subject.branches.map(b => letterOf(b.code)))]
  : subject.code_letter ? [subject.code_letter] : [];
const letterHint = subject => branched(subject)
  ? [...new Set(subject.branches.map(b => `${letterOf(b.code)} = ${b.name}`))].join(', ')
  : subject.code_letter ? `${subject.code_letter} = ${subject.name}` : '';
// Môn không chia phân môn: file không có cột Phân môn (chữ của môn được điền tự động).
const columnsOf = subject => branched(subject)
  ? {curriculum: CURRICULUM_COLUMNS, lessons: LESSON_COLUMNS}
  : {curriculum: CURRICULUM_COLUMNS.slice(1), lessons: LESSON_COLUMNS.filter(c => c !== 'Phân môn')};
// Mã mẫu cho hướng dẫn / lệnh AI: YCCĐ đầu tiên của chương trình đang dùng, không có thì 1.1.
const sampleOf = (subject, outcomes) => {
  const o = outcomes.find(x => x.yccds.length), letter = subjectLetters(subject)[0] || 'X';
  return o ? {branch: o.branch || letter, outcome: o.number, yccd: o.yccds[0].number} : {branch: letter, outcome: 1, yccd: 1};
};

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

// Phân môn theo bảng branches của môn: chấp nhận mã (VL), tên (Vật lí) hoặc chữ trong mã câu (L).
// Môn không chia phân môn: luôn là chữ viết tắt của môn (để trống, ghi chữ đó hoặc tên môn đều được).
export function branchResolver(subject) {
  const branches = subject.branches || [];
  if (!branches.length) {
    const letter = subject.code_letter || '', accepted = new Set(['', norm(letter), norm(subject.name)]);
    return raw => accepted.has(norm(raw)) ? {value: letter}
      : {error: letter ? `Môn này không chia phân môn: để trống cột Phân môn (mã dùng chữ ${letter})` : 'Môn này không chia phân môn: để trống cột Phân môn'};
  }
  const map = new Map();
  for (const b of branches) for (const alias of [b.code, b.name, letterOf(b.code)]) map.set(norm(alias), letterOf(b.code));
  const hint = letterHint(subject);
  return raw => {
    const k = norm(raw);
    if (!k) return {value: ''};
    const hit = map.get(k) ?? [...map.entries()].find(([alias]) => alias.length > 2 && k.startsWith(alias))?.[1];
    return hit ? {value: hit} : {error: `Phân môn "${clean(raw)}" không có trong môn này (dùng: ${hint})`};
  };
}

// Mã YCCĐ trong cột "Mã YCCĐ của bài": "L.2.1", "L. 2. 1", "2.1" (thiếu chữ thì lấy phân môn của Bài / chữ của môn).
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
export function normalizeLessons(input, {subject, labels}) {
  const resolve = branchResolver(subject), needsBranch = subjectLetters(subject).length > 0, errors = [], warnings = [], lessons = [];
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
    // Môn không chia phân môn: Bài không mang phân môn (chữ của môn chỉ nằm trong mã).
    const branch = branched(subject) ? b.value || (codeBranches.length === 1 ? codeBranches[0] : '') : '';
    lessons.push({number, name, chapter, branch, codes: parsed.codes.map(c => c.label)});
  }
  if (lessons.length > LIMITS.lessons) errors.push({sheet: SHEETS.lessons, message: `Tối đa ${LIMITS.lessons} Bài mỗi khối`});
  return {lessons: lessons.sort((a, b) => a.number - b.number), errors, warnings};
}

export function parseTemplate(book, {subject}) {
  const errors = [], warnings = [], sheet = name => book.sheets.find(s => norm(s.name) === norm(name));
  if (!subjectLetters(subject).length) {
    return {outcomes: [], lessons: [], warnings, errors: [{message: `Môn ${subject.name} chưa có chữ viết tắt dùng trong mã câu hỏi (ví dụ Toán = T). Quản trị đặt chữ này ở màn Chương trình môn học rồi tải file lên lại.`}]};
  }
  const cur = sheet(SHEETS.curriculum), les = sheet(SHEETS.lessons);
  if (!cur) errors.push({message: `Không thấy sheet "${SHEETS.curriculum}". Hãy dùng đúng file mẫu tải từ hệ thống.`});
  if (!les) errors.push({message: `Không thấy sheet "${SHEETS.lessons}". Hãy dùng đúng file mẫu tải từ hệ thống.`});
  if (errors.length) return {outcomes: [], lessons: [], errors, warnings};

  // Sheet "Chương trình": ô Phân môn / Số Chủ đề / Tên Chủ đề để trống (ô gộp) thì lấy theo dòng trên.
  const h = findHeader(cur.rows, HEADERS.curriculum, ['topic', 'title', 'yccd', 'text']);
  if (!h) return {outcomes: [], lessons: [], errors: [{sheet: SHEETS.curriculum, message: `Không thấy dòng tiêu đề (${columnsOf(subject).curriculum.join(' · ')})`}], warnings};
  const resolve = branchResolver(subject), outcomes = new Map();
  let prev = null, count = 0;
  for (let i = h.row + 1; i < cur.rows.length; i++) {
    const r = cur.rows[i] || [], cell = k => h.cols[k] == null ? '' : clean(r[h.cols[k]]);
    if (!['branch', 'topic', 'title', 'yccd', 'text'].some(k => cell(k))) continue;
    const row = i + 1, err = message => errors.push({sheet: SHEETS.curriculum, row, message});
    const b = resolve(cell('branch') || (prev?.branchRaw ?? ''));
    if (b.error) { err(b.error); continue; }
    if (!b.value) { err('Thiếu Phân môn'); continue; }
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
  if (!lh) { errors.push({sheet: SHEETS.lessons, message: `Không thấy dòng tiêu đề (${columnsOf(subject).lessons.join(' · ')})`}); return {outcomes: list, lessons: [], errors, warnings}; }
  const rows = [];
  for (let i = lh.row + 1; i < les.rows.length; i++) {
    const r = les.rows[i] || [], cell = k => lh.cols[k] == null ? '' : clean(r[lh.cols[k]]);
    if (!['chapter', 'number', 'name', 'codes'].some(k => cell(k))) continue;
    rows.push({row: i + 1, number: cell('number'), name: cell('name'), chapter: cell('chapter'), branch: cell('branch'), codes: cell('codes'), inheritChapter: true, at: `Bài ${cell('number') || '?'}`});
  }
  const labels = new Set(list.flatMap(o => o.yccds.map(y => yccdLabelOf(o.branch, o.number, y.number))));
  const lessons = normalizeLessons(rows, {subject, labels});
  return {outcomes: list, lessons: lessons.lessons, errors: [...errors, ...lessons.errors], warnings: [...warnings, ...lessons.warnings]};
}

// ---------- Ví dụ + lệnh AI ----------
// Ví dụ chỉ để minh hoạ cách điền (rút gọn), không phải dữ liệu chương trình chính thức. KHTN (có phân môn), Toán,
// còn lại dùng mẫu chung có chỗ [ ] để thay.
function examplesFor(subject) {
  const X = subjectLetters(subject)[0] || 'X', letters = subjectLetters(subject);
  if (branched(subject) && letters.includes('L') && letters.includes('H')) return {
    note: 'Ví dụ rút gọn từ KHTN 9 để minh hoạ cách điền (không phải toàn bộ chương trình).',
    curriculum: [
      ['L', 1, 'Năng lượng cơ học', 1, 'Viết được biểu thức tính động năng của vật.', 'tr. 58'],
      ['', '', '', 2, 'Viết được biểu thức tính thế năng của vật ở gần mặt đất.', ''],
      ['', '', '', 3, 'Nêu được cơ năng là tổng động năng và thế năng của vật.', ''],
      ['H', 1, 'Kim loại', 1, 'Nêu được tính chất vật lí của kim loại.', 'tr. 64'],
      ['', '', '', 2, 'Trình bày được tính chất hoá học cơ bản của kim loại.', ''],
    ],
    lessons: [
      ['Chương I. Năng lượng cơ học', 2, 'Động năng. Thế năng', 'L', 'L.1.1; L.1.2'],
      ['', 3, 'Cơ năng', 'L', 'L.1.3'],
      ['Chương VI. Kim loại', 18, 'Tính chất chung của kim loại', 'H', 'H.1.1; H.1.2'],
      ['', 19, 'Ôn tập chương VI', 'H', ''],
    ],
  };
  if (!branched(subject) && subject.code === 'Toan') return {
    note: 'Ví dụ rút gọn từ Toán 10 để minh hoạ cách điền (không phải toàn bộ chương trình).',
    curriculum: [
      [1, 'Mệnh đề toán học. Tập hợp', 1, 'Thiết lập và phát biểu được các mệnh đề toán học: mệnh đề phủ định, mệnh đề đảo, mệnh đề tương đương, mệnh đề có chứa kí hiệu ∀, ∃.', 'tr. 45'],
      ['', '', 2, 'Nhận biết được các khái niệm cơ bản về tập hợp (tập con, hai tập hợp bằng nhau, tập rỗng) và biết sử dụng các kí hiệu ⊂, ⊃, ∅.', ''],
      ['', '', 3, 'Thực hiện được phép toán trên các tập hợp (hợp, giao, hiệu, phần bù) và dùng biểu đồ Ven để biểu diễn.', ''],
      [2, 'Bất phương trình và hệ bất phương trình bậc nhất hai ẩn', 1, 'Nhận biết được bất phương trình và hệ bất phương trình bậc nhất hai ẩn.', 'tr. 46'],
      ['', '', 2, 'Biểu diễn được miền nghiệm của bất phương trình và hệ bất phương trình bậc nhất hai ẩn trên mặt phẳng toạ độ.', ''],
    ],
    lessons: [
      ['Chương I. Mệnh đề và tập hợp', 1, 'Mệnh đề', `${X}.1.1`],
      ['', 2, 'Tập hợp và các phép toán trên tập hợp', `${X}.1.2; ${X}.1.3`],
      ['Chương II. Bất phương trình và hệ bất phương trình bậc nhất hai ẩn', 3, 'Bất phương trình bậc nhất hai ẩn', `${X}.2.1; ${X}.2.2`],
      ['', 4, 'Hệ bất phương trình bậc nhất hai ẩn', `${X}.2.1; ${X}.2.2`],
    ],
  };
  const b = branched(subject) ? [X] : [], blank = branched(subject) ? [''] : [];
  return {
    note: `Ví dụ minh hoạ cách điền: thay phần trong [ ] bằng nội dung thật của môn ${subject.name}.`,
    curriculum: [
      [...b, 1, '[Tên Chủ đề thứ nhất trong chương trình]', 1, '[Chép nguyên văn YCCĐ thứ nhất của Chủ đề 1]', 'tr. 12'],
      [...blank, '', '', 2, '[YCCĐ thứ hai của Chủ đề 1]', ''],
      [...blank, 2, '[Tên Chủ đề thứ hai]', 1, '[YCCĐ thứ nhất của Chủ đề 2]', 'tr. 15'],
    ],
    lessons: [
      ['[Chương 1 trong SGK]', 1, '[Tên bài 1]', ...b, `${X}.1.1`],
      ['', 2, '[Tên bài 2]', ...b, `${X}.1.1; ${X}.1.2`],
      ['[Chương 2 trong SGK]', 3, '[Tên bài 3]', ...b, `${X}.2.1`],
    ],
  };
}

// Lệnh mẫu để nhờ AI (ChatGPT, Gemini…) lập bảng đúng cột của file mẫu và viết câu hỏi đúng mẫu Word nhập câu.
// Mỗi dòng một ý, không dùng dấu ngoặc kép: sao chép nhiều ô Excel liền nhau vẫn ra đúng văn bản.
export function buildPrompts(subject, grade, sample = sampleOf(subject, [])) {
  const cols = columnsOf(subject), b = branched(subject), hint = letterHint(subject), name = subject.name, X = sample.branch;
  const curriculum = [
    `Bạn là trợ lý nhập liệu chương trình môn học. Tôi gửi kèm văn bản Chương trình môn ${name} (Chương trình GDPT 2018), phần khối ${grade}.`,
    `Hãy lập MỘT BẢNG có đúng ${cols.curriculum.length} cột, theo thứ tự: ${cols.curriculum.join(' | ')}.`,
    'Quy tắc:',
    '- Mỗi dòng là MỘT yêu cầu cần đạt (YCCĐ). Chép nguyên văn nội dung YCCĐ: không tóm tắt, không thêm ý, không bỏ ý.',
    ...(b ? [`- Cột Phân môn chỉ ghi một chữ: ${hint}.`] : []),
    `- Số Chủ đề: 1, 2, 3… theo đúng thứ tự các chủ đề (mạch nội dung) trong văn bản${b ? ', đánh số riêng trong từng phân môn' : ''}.`,
    '- Số YCCĐ: đánh lại từ 1 trong mỗi Chủ đề.',
    '- Ghi Tên Chủ đề ở mọi dòng, không để trống.',
    '- Trang / nguồn: số trang trong văn bản nếu thấy; không thấy thì để trống.',
    `- Chỉ lấy YCCĐ của khối ${grade}; bỏ phần nội dung dạy học, gợi ý phương pháp, đánh giá.`,
    '- Trả về dạng bảng (không phải khối code), không giải thích. Chỗ nào không chắc thì liệt kê sau bảng, mở đầu bằng GHI CHÚ:',
  ];
  const lessons = [
    `Tiếp theo, tôi gửi kèm mục lục sách giáo khoa ${name} ${grade} (bộ sách trường đang dùng). Dựa vào bảng Chương trình vừa lập, hãy lập MỘT BẢNG có đúng ${cols.lessons.length} cột, theo thứ tự: ${cols.lessons.join(' | ')}.`,
    'Quy tắc:',
    '- Mỗi dòng là MỘT bài trong mục lục, theo đúng thứ tự, giữ nguyên tên bài.',
    '- Số bài chỉ ghi số (ví dụ 5), không ghi chữ Bài.',
    '- Chương / Chủ đề SGK: tên chương hoặc chủ đề của sách chứa bài đó.',
    ...(b ? [`- Phân môn: một chữ (${hint}).`] : []),
    `- Mã YCCĐ của bài: các YCCĐ mà bài dạy, viết dạng ${b ? '<Phân môn>' : X}.<Số Chủ đề>.<Số YCCĐ>, cách nhau bằng dấu chấm phẩy. Ví dụ: ${X}.2.1; ${X}.2.3`,
    '- Chỉ dùng mã có trong bảng Chương trình. Bài ôn tập, kiểm tra có thể để trống cột mã.',
    '- Trả về dạng bảng, không giải thích. Chỗ nào không chắc thì liệt kê sau bảng, mở đầu bằng GHI CHÚ:',
  ];
  const questions = [
    `Tôi dạy ${name} khối ${grade}. Hãy viết lại các câu hỏi tôi gửi theo đúng mẫu nhập câu hỏi dưới đây. Giữ nguyên nội dung câu hỏi, phương án và đáp án; chỉ thêm dòng mã và sắp xếp lại cho đúng mẫu.`,
    `Mỗi câu bắt đầu bằng MỘT dòng mã: Câu ${b ? '<Phân môn>' : X}. <Số Chủ đề>. <Số YCCĐ>. <Mức>. <Số thứ tự câu>. <Dạng>`,
    ...(b ? [`- Phân môn: ${hint}.`] : []),
    '- Mức: NB (nhận biết), TH (thông hiểu), VD (vận dụng), VDC (vận dụng cao).',
    '- Dạng: TN (trắc nghiệm 4 phương án), ĐS (đúng/sai 4 ý), TLN (trả lời ngắn), GN (ghép nối), TL (tự luận).',
    '- Số Chủ đề và Số YCCĐ lấy theo bảng chương trình tôi gửi kèm (file Chương trình tải từ hệ thống). Không đoán: chỗ không chắc ghi dấu ? và liệt kê ở cuối.',
    'Sau dòng mã, viết theo dạng:',
    '- TN: nội dung câu; 4 dòng A. B. C. D.; dòng Đáp án: B',
    '- ĐS: nội dung chung; 4 dòng a) b) c) d); dòng Đáp án: a-Đ; b-S; c-Đ; d-S',
    '- TLN và TL: nội dung câu; dòng Đáp án: …',
    '- GN: bảng 2 cột (Cột A ghi A. B. …, Cột B ghi 1. 2. …); dòng Đáp án: A-1; B-2',
    '- Cuối mỗi câu: dòng Lời giải: …',
    'Ví dụ:',
    `Câu ${X}. ${sample.outcome}. ${sample.yccd}. NB. 1. TN`,
    'Nội dung câu hỏi …',
    'A. …', 'B. …', 'C. …', 'D. …',
    'Đáp án: A',
    'Lời giải: …',
    'Trả về văn bản thuần theo đúng mẫu (không bảng, trừ câu GN), không giải thích, để tôi dán vào file Word.',
  ];
  return {curriculum: curriculum.join('\n'), lessons: lessons.join('\n'), questions: questions.join('\n')};
}

// ---------- Ghi file ----------
export function buildWorkbook(data, {subject, grade, source}) {
  const wb = XLSX.utils.book_new(), cols = columnsOf(subject), b = branched(subject), hint = letterHint(subject);
  const sample = sampleOf(subject, data.outcomes), X = sample.branch, code = `${X}.2.1`, prompts = buildPrompts(subject, grade, sample);
  const guide = [
    ['FILE MẪU CHƯƠNG TRÌNH MÔN HỌC'], ['Môn', subject.name], ['Khối', grade], ['Chữ trong mã câu hỏi', hint], ['Dữ liệu trong file', source], [],
    ['CÁCH LÀM — 3 BƯỚC'],
    [`1. Điền sheet "${SHEETS.curriculum}": mỗi dòng là MỘT yêu cầu cần đạt (YCCĐ), chép nguyên văn từ văn bản chương trình.`],
    [`2. Điền sheet "${SHEETS.lessons}": mỗi dòng là MỘT bài trong SGK, kèm mã các YCCĐ bài đó dạy (ví dụ ${X}.2.1; ${X}.2.2).`],
    ['3. Lưu file → màn "Chương trình môn học" → Tải file lên → xem kiểm tra → Tạo bản nháp → BGH / quản trị bấm Công bố.'],
    [`Sheet "${SHEETS.example}" có ví dụ điền sẵn. Sheet "${SHEETS.ai}" có lệnh mẫu để nhờ AI (ChatGPT, Gemini…) điền nhanh.`],
    [],
    ['GIẢI THÍCH TỪNG CỘT', 'Ví dụ'],
    ...(b ? [[`Phân môn — một chữ: ${hint}`, X]] : []),
    [`Số Chủ đề — số thứ tự Chủ đề (Outcome) trong chương trình${b ? ', đánh riêng trong từng phân môn' : ''}`, '2'],
    ['Tên Chủ đề (Outcome) — tên chủ đề / mạch nội dung như trong văn bản chương trình', 'Năng lượng cơ học'],
    ['Số YCCĐ — đánh lại từ 1 trong mỗi Chủ đề', '1'],
    ['Nội dung YCCĐ — chép nguyên văn, không tóm tắt', 'Viết được biểu thức tính động năng của vật.'],
    ['Trang / nguồn — số trang hoặc tên văn bản (không bắt buộc)', 'tr. 58'],
    ['Chương / Chủ đề SGK — tên chương của sách; để trống thì lấy theo dòng trên', 'Chương I. Năng lượng cơ học'],
    ['Số bài — chỉ ghi số, không ghi chữ "Bài"', '5'],
    ['Mã YCCĐ của bài — các YCCĐ bài dạy, cách nhau bằng dấu ;', `${X}.2.1; ${X}.2.2`],
    [],
    ['MÃ YCCĐ VÀ MÃ CÂU HỎI'],
    [`Mã YCCĐ ${code} = ${b ? `phân môn ${X}` : `môn ${subject.name} (chữ ${X})`}, Chủ đề số 2, YCCĐ số 1.`],
    [`Giáo viên viết mã câu hỏi "Câu ${X}. 2. 1. NB. 1. TN" → hệ thống tự gắn Chủ đề ${X}.2, YCCĐ ${code} và Bài có mã ${code}.`],
    ['Mức: NB nhận biết · TH thông hiểu · VD vận dụng · VDC vận dụng cao. Dạng: TN trắc nghiệm · ĐS đúng/sai · TLN trả lời ngắn · GN ghép nối · TL tự luận.'],
    ['Vì vậy khi sửa chương trình, KHÔNG đánh số lại Chủ đề / YCCĐ đã dùng: câu hỏi cũ sẽ trỏ sai chỗ.'],
    [],
    ['LỖI HAY GẶP'],
    ['• Đổi tên sheet hoặc dòng tiêu đề → hệ thống không đọc được. Chỉ sửa từ dòng 2 trở xuống.'],
    ['• Ô Số Chủ đề / Tên Chủ đề để trống (hoặc gộp ô) thì lấy theo dòng trên — không cần ghi lặp lại.'],
    ['• Số YCCĐ không đánh lại từ 1 khi sang Chủ đề mới, hoặc hai YCCĐ trùng số trong một Chủ đề.'],
    [`• Mã ở cột "Mã YCCĐ của bài" không có trong sheet "${SHEETS.curriculum}" (sai số hoặc thiếu dòng).`],
    [`• Viết mã sai dạng (${X} 2 1, ${X}-2-1). Đúng: ${code}; nhiều mã cách nhau bằng dấu ;`],
    ['• Bài không có trong file vẫn được giữ nguyên trên hệ thống (không bị xoá).'],
  ];
  const curRows = [cols.curriculum];
  for (const o of data.outcomes) for (const y of o.yccds) curRows.push([...(b ? [o.branch] : []), o.number, o.title, y.number, y.text, y.page || '']);
  const lesRows = [cols.lessons, ...data.lessons.map(l => [l.chapter || '', l.number, l.name, ...(b ? [l.branch || ''] : []), (l.codes || []).join('; ')])];
  const ex = examplesFor(subject);
  const exampleRows = [
    ['VÍ DỤ CÁCH ĐIỀN — sheet này chỉ để xem, hệ thống KHÔNG nạp'], [ex.note], [],
    [`Sheet "${SHEETS.curriculum}"`], cols.curriculum, ...ex.curriculum,
    ['Dòng trống ở Phân môn / Số Chủ đề / Tên Chủ đề = giống dòng trên.'], [],
    [`Sheet "${SHEETS.lessons}"`], cols.lessons, ...ex.lessons,
    ['Chương để trống = giống dòng trên. Bài ôn tập có thể không có mã YCCĐ.'],
  ];
  const lines = text => text.split('\n').map(line => [line]);
  const aiRows = [
    ['DÙNG AI ĐỂ ĐIỀN NHANH (ChatGPT, Gemini, Copilot, Claude…)'],
    [`Bước 1. Chuẩn bị văn bản chương trình môn ${subject.name} (Chương trình GDPT 2018, phần khối ${grade}) và mục lục SGK bộ sách trường dùng.`],
    ['Bước 2. Mở AI, dán LỆNH 1 bên dưới, gửi kèm văn bản chương trình (đính kèm file PDF / Word hoặc dán chữ).'],
    [`Bước 3. AI trả về một bảng: bôi đen cả bảng → Copy → bấm ô A2 sheet "${SHEETS.curriculum}" → Paste. Nếu dữ liệu dồn vào một cột: Data → Text to Columns.`],
    [`Bước 4. Trong cùng cuộc trò chuyện, dán LỆNH 2 kèm mục lục SGK (ảnh chụp hoặc file) → dán bảng vào ô A2 sheet "${SHEETS.lessons}".`],
    ['Bước 5. KIỂM TRA LẠI: AI có thể chép sai, gộp hoặc tự thêm YCCĐ. Đối chiếu với văn bản gốc, nhất là số Chủ đề và số YCCĐ — đó là số giáo viên viết trong mã câu hỏi.'],
    ['Bước 6. Lưu file, tải lên ở màn "Chương trình môn học". Hệ thống báo lỗi từng dòng trước khi tạo bản nháp.'],
    ['Cách copy lệnh: bôi đen các ô từ dòng đầu đến dòng cuối của lệnh → Ctrl+C → dán vào ô chat của AI. Trên web (màn Chương trình môn học) có nút Sao chép lệnh.'],
    [],
    ['LỆNH 1 — CHƯƠNG TRÌNH'], ...lines(prompts.curriculum), [],
    ['LỆNH 2 — BÀI HỌC'], ...lines(prompts.lessons), [],
    ['LỆNH 3 — CHUYỂN CÂU HỎI SANG MẪU WORD NHẬP CÂU (dùng ở màn Nhập câu hỏi)'], ...lines(prompts.questions),
  ];
  const sheet = (rows, widths) => { const s = XLSX.utils.aoa_to_sheet(rows); s['!cols'] = widths.map(wch => ({wch})); return s; };
  const curWidths = b ? [10, 10, 45, 9, 90, 14] : [10, 45, 9, 90, 14], lesWidths = b ? [34, 8, 50, 10, 40] : [34, 8, 50, 40];
  XLSX.utils.book_append_sheet(wb, sheet(guide, [110, 40]), SHEETS.guide);
  XLSX.utils.book_append_sheet(wb, sheet(curRows, curWidths), SHEETS.curriculum);
  XLSX.utils.book_append_sheet(wb, sheet(lesRows, lesWidths), SHEETS.lessons);
  XLSX.utils.book_append_sheet(wb, sheet(exampleRows, curWidths.map((w, i) => Math.max(w, lesWidths[i] || 0))), SHEETS.example);
  XLSX.utils.book_append_sheet(wb, sheet(aiRows, [160]), SHEETS.ai);
  wb.Props = {Title: `Chương trình ${subject.name} khối ${grade}`};
  return XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'});
}

// Mẫu Word nhập câu hỏi theo môn: chữ đầu mã đúng môn, mã ví dụ lấy từ chương trình đang dùng. Phần trước câu đầu
// tiên là hướng dẫn — bộ nhập bỏ qua (không dòng nào bắt đầu bằng "Câu" hay "Bài:/Môn:/Khối:").
function buildWordTemplate({subject, grade, outcomes, sample}) {
  const X = sample.branch, b = branched(subject);
  const run = (text, opts = {}) => new Paragraph({children: [new TextRun({text, ...opts})], spacing: {after: 80}});
  const code = (level, n, form) => run(`Câu ${X}. ${sample.outcome}. ${sample.yccd}. ${level}. ${n}. ${form}`, {bold: true});
  const cell = text => new TableCell({children: [new Paragraph(text)]});
  const intro = [
    run(`MẪU WORD NHẬP CÂU HỎI — ${subject.name.toUpperCase()} KHỐI ${grade}`, {bold: true, size: 28}),
    run('Phần hướng dẫn này (trước câu hỏi đầu tiên) hệ thống bỏ qua khi nhập. Thay các câu ví dụ bên dưới bằng câu hỏi thật.', {italics: true}),
    run(`Mỗi câu bắt đầu bằng MỘT dòng mã: Câu ${b ? '<Phân môn>' : X}. <Số Chủ đề>. <Số YCCĐ>. <Mức>. <Số thứ tự câu>. <Dạng>`, {bold: true}),
    run(b ? `Phân môn: ${letterHint(subject)}. Khối không ghi trong mã: chọn Môn và Khối khi tải lên.`
      : `${subject.name} dùng chữ ${X} ở đầu mã. Khối không ghi trong mã: chọn Môn và Khối khi tải lên.`),
    run('Mức: NB nhận biết · TH thông hiểu · VD vận dụng · VDC vận dụng cao. Dạng: TN trắc nghiệm · ĐS đúng/sai · TLN trả lời ngắn · GN ghép nối · TL tự luận.'),
    run('Hệ thống đọc mã để tự điền Chủ đề (Outcome), YCCĐ, mức, dạng và tự gắn Bài đã được liên kết YCCĐ ở màn Chương trình môn học.'),
  ];
  if (outcomes.length) {
    intro.push(run(`Các Chủ đề của ${subject.name} khối ${grade} đang dùng (số Chủ đề ghi trong mã):`, {bold: true}));
    for (const o of outcomes.slice(0, 80)) intro.push(run(`${outcomeLabel(o.branch, o.number)} — ${o.title} (${o.yccds.length} YCCĐ)`));
    intro.push(run('Nội dung từng YCCĐ: tải file Chương trình ở màn Chương trình môn học (sheet Chương trình).', {italics: true}));
  } else {
    intro.push(run(`Chưa có chương trình ${subject.name} khối ${grade} trên hệ thống: nhờ tổ trưởng / BGH nạp file Chương trình trước, nếu không mã câu sẽ báo Không tìm thấy Outcome.`, {bold: true, color: 'B00020'}));
  }
  intro.push(run(''));
  const questions = [
    code('NB', 1, 'TN'), run('[Nội dung câu hỏi trắc nghiệm]'), run('A. [Phương án A]'), run('B. [Phương án B]'), run('C. [Phương án C]'), run('D. [Phương án D]'),
    run('Đáp án: A'), run('Lời giải: [Lời giải đã kiểm chứng]'),
    code('TH', 2, 'ĐS'), run('[Bối cảnh chung cho bốn nhận định]'), run('a) [Nhận định a]'), run('b) [Nhận định b]'), run('c) [Nhận định c]'), run('d) [Nhận định d]'),
    run('Đáp án: a-Đ; b-S; c-Đ; d-S'), run('Lời giải: [Giải thích từng ý]'),
    code('VD', 3, 'TLN'), run('[Câu trả lời ngắn. Công thức có thể dùng Equation hoặc $v=\\frac{s}{t}$.]'), run('Đáp án: [Đáp án chấp nhận]'), run('Lời giải: [Lời giải]'),
    code('NB', 4, 'GN'), run('[Yêu cầu ghép nội dung giữa hai cột]'),
    new Table({width: {size: 100, type: WidthType.PERCENTAGE}, rows: [['Cột A', 'Cột B'], ['A. [Ý A]', '1. [Ý 1]'], ['B. [Ý B]', '2. [Ý 2]']].map(r => new TableRow({children: r.map(cell)}))}),
    run('Đáp án: A-1; B-2'), run('Lời giải: [Giải thích cặp ghép]'),
    code('VDC', 5, 'TL'), run('[Câu hỏi tự luận — tự đối chiếu, không tự chấm điểm]'), run('Đáp án: [Đáp án tham khảo]'), run('Lời giải: [Hướng dẫn và tiêu chí tự đối chiếu]'),
  ];
  return new Document({styles: {default: {document: {run: {font: 'Times New Roman', size: 26}}}}, sections: [{children: [...intro, ...questions]}]});
}

// ---------- Trạng thái + khác biệt ----------
const scope = z.object({subject_id: z.coerce.number().int().positive(), grade: z.coerce.number().int().min(1).max(12)});
async function subjectOf(c, id) {
  const s = (await c.query('SELECT id,code,name,code_letter FROM subjects WHERE id=$1', [id])).rows[0];
  if (!s) fail('Không tìm thấy môn', 404);
  s.branches = (await c.query('SELECT id,code,name FROM branches WHERE subject_id=$1 ORDER BY id', [id])).rows;
  return s;
}
const toData = outcomes => outcomes.map(o => ({branch: o.branch, number: o.number, title: o.title, yccds: o.yccds.map(y => ({number: y.number, text: y.text, page: y.page}))}));
const publishedContent = async (c, subject, grade) => {
  const effective = await effectiveCurriculumVersion(c, subject.id, grade);
  return {effective, outcomes: await versionContent(c, {versionId: effective?.id ?? null, subjectId: subject.id, grade})};
};

async function state(c, subject, grade) {
  const {effective, outcomes: published} = await publishedContent(c, subject, grade);
  const draft = (await c.query("SELECT * FROM curriculum_versions WHERE subject_id=$1 AND grade=$2 AND status='DRAFT' ORDER BY id DESC LIMIT 1", [subject.id, grade])).rows[0] || null;
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
// Môn không chia phân môn: chữ của môn chỉ ghi ở source_branch_code (nhãn, canonical_key, bộ tra mã); domain_code để
// rỗng ('' — cột NOT NULL) vì domain_code có giá trị thì câu hỏi bắt buộc chọn phân môn khớp (validateCurriculum).
async function createDraft(c, actor, subject, grade, data, {sourceName, reason}) {
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`curriculum-draft:${subject.id}:${grade}`]);
  const {effective, outcomes: prior} = await publishedContent(c, subject, grade);
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
    const domain = branched(subject) ? o.branch || null : '';
    const row = (await c.query(`INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document,status,curriculum_version_id,order_index,source_branch_code,source_ordinal,canonical_key,source_text,lineage_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,$9,$10,$11,$12,$5,COALESCE($13::uuid,gen_random_uuid())) RETURNING id`,
    [subject.id, grade, domain, outcomeLabel(o.branch, o.number), o.title, v.version_code, sourceName.slice(0, 300), v.id, ++order, o.branch || null, o.number, key, lineage.get('o|' + outcomeLabel(o.branch, o.number)) ?? null])).rows[0];
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
  return {buffer: buildWorkbook(data, {subject, grade: d.grade, source}), filename: `Mau_chuong_trinh_${asciiOf(subject.code)}_khoi${d.grade}.xlsx`};
}

export async function templateWorkspace(actor, query) {
  const d = scope.parse(query), subject = await subjectOf(pool, d.subject_id);
  await allow(actor, ['curriculum.read'], subject, d.grade);
  const s = await state(pool, subject, d.grade), ctx = {subjectId: subject.id, grade: d.grade};
  const count = outcomes => ({outcomes: outcomes.length, yccds: outcomes.reduce((n, o) => n + o.yccds.length, 0)});
  return {
    subject: {id: subject.id, name: subject.name, branches: branched(subject) ? subjectLetters(subject) : [], code_letter: subject.code_letter, letters: subjectLetters(subject), letter_hint: letterHint(subject)}, grade: d.grade,
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
      set_letter: actor.role === 'admin' && !branched(subject),
    },
  };
}

async function readUpload(actor, raw, file, capabilities) {
  const d = scope.parse(raw), subject = await subjectOf(pool, d.subject_id);
  await allow(actor, capabilities, subject, d.grade);
  if (!file) fail('Chọn file mẫu (.xlsx)');
  if (!/\.xlsx$/i.test(file.originalname)) fail('Dùng file mẫu .xlsx tải từ hệ thống');
  return {d, subject, parsed: parseTemplate(await parseWorkbook(file), {subject})};
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
    const subject = await subjectOf(c, v.subject_id);
    const labels = new Set((await versionLabels(c, v.id)).keys());
    const result = normalizeLessons(d.lessons.map((l, i) => ({...l, codes: Array.isArray(l.codes) ? l.codes.join(';') : l.codes, row: i + 1, at: `Bài ${l.number}`})), {subject, labels});
    if (result.errors.length) fail(`Danh sách Bài còn ${result.errors.length} lỗi`, 422, {errors: result.errors});
    await c.query('UPDATE curriculum_versions SET lesson_plan=$2 WHERE id=$1', [v.id, JSON.stringify({lessons: result.lessons})]);
    await audit(c, actor, v, 'LESSON_PLAN_SAVED', {lessons: v.lesson_plan?.lessons?.length ?? 0}, {lessons: result.lessons.length}, d.reason);
    return {ok: true, lessons: result.lessons, warnings: result.warnings};
  });
}

// Lệnh AI cho màn Chương trình môn học và màn Nhập câu hỏi (cùng nội dung với sheet "Dùng AI").
export async function templatePrompts(actor, query) {
  const d = scope.parse(query), subject = await subjectOf(pool, d.subject_id);
  await allow(actor, ['curriculum.read'], subject, d.grade);
  const {outcomes} = await publishedContent(pool, subject, d.grade), sample = sampleOf(subject, outcomes);
  return {subject: {id: subject.id, name: subject.name, letters: subjectLetters(subject), letter_hint: letterHint(subject)}, grade: d.grade,
    has_curriculum: outcomes.length > 0, sample_code: `Câu ${sample.branch}. ${sample.outcome}. ${sample.yccd}. NB. 1. TN`, prompts: buildPrompts(subject, d.grade, sample)};
}

export async function questionWordTemplate(actor, query) {
  const d = scope.parse(query), subject = await subjectOf(pool, d.subject_id);
  await allow(actor, ['curriculum.read'], subject, d.grade);
  if (!subjectLetters(subject).length) fail(`Môn ${subject.name} chưa có chữ viết tắt dùng trong mã câu hỏi; nhờ quản trị đặt ở màn Chương trình môn học`, 409);
  const {outcomes} = await publishedContent(pool, subject, d.grade);
  const buffer = await Packer.toBuffer(buildWordTemplate({subject, grade: d.grade, outcomes, sample: sampleOf(subject, outcomes)}));
  return {buffer, filename: `Mau_Word_nhap_cau_${asciiOf(subject.code)}_khoi${d.grade}.docx`};
}

// Chữ viết tắt của môn (chữ đầu mã câu). Chỉ quản trị; không đổi khi chương trình đã dùng chữ cũ (mã câu, nhãn cũ sẽ
// không còn khớp) và không đặt cho môn chia phân môn (chữ lấy theo phân môn).
export async function setSubjectLetter(actor, subjectId, raw) {
  if (actor.role !== 'admin') fail('Chỉ quản trị đổi được chữ viết tắt của môn', 403);
  const d = z.object({
    code_letter: z.string().trim().transform(s => s.toLocaleUpperCase('vi')).pipe(z.string().regex(/^[A-ZĐ]{1,3}$/u, 'Chữ viết tắt gồm 1–3 chữ cái in hoa (A–Z, Đ)')),
    reason: z.string().trim().min(3, 'Ghi lý do (ít nhất 3 ký tự)').max(500),
  }).strict().parse(raw);
  return tx(async c => {
    const s = await subjectOf(c, subjectId);
    if (branched(s)) fail(`Môn ${s.name} chia phân môn: chữ đầu mã lấy theo phân môn (${letterHint(s)})`, 409);
    if (s.code_letter && s.code_letter !== d.code_letter) {
      const used = (await c.query('SELECT count(*)::int AS n FROM curriculum_outcomes WHERE subject_id=$1 AND source_branch_code=$2', [s.id, s.code_letter])).rows[0].n;
      if (used) fail(`Chương trình môn ${s.name} đã dùng chữ ${s.code_letter} (${used} Chủ đề); đổi chữ sẽ làm mã câu và nhãn cũ không còn khớp`, 409);
    }
    if (s.code_letter !== d.code_letter) {
      await c.query('UPDATE subjects SET code_letter=$2 WHERE id=$1', [s.id, d.code_letter]);
      await log(c, actor, 'SUBJECT_CODE_LETTER_SET', s.id, {before: s.code_letter, after: d.code_letter, reason: d.reason});
    }
    return {ok: true, subject: {id: s.id, name: s.name, code_letter: d.code_letter}};
  });
}
