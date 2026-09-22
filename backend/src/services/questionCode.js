// Mã câu hiện hành của nhà trường:  Câu L. 2. 1. NB. 2. ĐS
//   L  = phân môn (L/H/S)          2 = Outcome số mấy trong phân môn
//   1  = YCCĐ số mấy trong Outcome  NB = mức độ khai báo
//   2  = số đơn vị kiến thức        ĐS = hình thức câu
// Khối KHÔNG nằm trong mã: khối là ngữ cảnh của phiên nhập (Môn + Khối chọn một lần khi upload).

export const BRANCH_CODES = {L: 'Vật lí', H: 'Hóa học', S: 'Sinh học'};
export const LEVELS = ['NB', 'TH', 'VD', 'VDC'];
export const FORMS = {TN: 'multiple_choice', 'ĐS': 'true_false', TLN: 'short_answer', GN: 'matching', TL: 'essay'};
export const FORM_LABELS = {TN: 'Trắc nghiệm', 'ĐS': 'Đúng / Sai', TLN: 'Trả lời ngắn', GN: 'Ghép nối', TL: 'Tự luận'};
export const LEVEL_LABELS = {NB: 'Nhận biết', TH: 'Thông hiểu', VD: 'Vận dụng', VDC: 'Vận dụng cao'};
export const NUMBERING_MODES = ['CONTENT_UNIT_5_FORMS', 'INDEPENDENT_10', 'CUSTOM'];

const CANONICAL = /^Câu\s+([LHS])\.\s+(\d+)\.\s+(\d+)\.\s+(NB|TH|VD|VDC)\.\s+(\d+)\.\s+(TN|ĐS|TLN|GN|TL)$/u;
// Dạng gõ liền của dữ liệu cũ: chấp nhận để chuyển đổi, nhưng luôn chuẩn hóa lại khi lưu/hiển thị.
const LEGACY = /^Câu[.\s]*([LHS])[.\s]*(\d+)[.\s]*(\d+)[.\s]*(NB|TH|VD|VDC)[.\s]*(\d+)[.\s]*(TN|ĐS|TLN|GN|TL)$/u;

const clean = value => String(value ?? '').replace(/ /g, ' ').trim().replace(/\s+/g, ' ');

export function buildDisplayCode({branch_code, outcome_number, yccd_number, declared_level, content_number, question_form}) {
  return `Câu ${branch_code}. ${outcome_number}. ${yccd_number}. ${declared_level}. ${content_number}. ${question_form}`;
}

// Trả về {ok, value, warnings, error}. Không ném lỗi: caller quyết định chặn hay đưa vào "cần xem".
export function parseQuestionCode(raw) {
  const text = clean(raw);
  if (!text) return {ok: false, error: 'MISSING_CODE', message: 'Câu chưa có mã hiển thị'};

  const warnings = [];
  let match = CANONICAL.exec(text);
  if (!match) {
    match = LEGACY.exec(text);
    if (match) warnings.push({code: 'LEGACY_CODE_FORMAT', message: 'Mã viết liền kiểu cũ; đã chuẩn hóa lại khoảng trắng'});
  }
  if (!match) return {ok: false, error: 'CODE_UNPARSEABLE', message: 'Mã câu không đúng cấu trúc "Câu L. 2. 1. NB. 2. ĐS"'};

  const [, branch_code, outcome, yccd, declared_level, content, question_form] = match;
  const outcome_number = Number(outcome), yccd_number = Number(yccd), content_number = Number(content);
  if (outcome_number < 1 || yccd_number < 1 || content_number < 1) {
    return {ok: false, error: 'CODE_NUMBERING_INVALID', message: 'Số Outcome, YCCĐ và số câu phải bắt đầu từ 1'};
  }

  const value = {branch_code, outcome_number, yccd_number, declared_level, content_number, question_form};
  const canonical_code = buildDisplayCode(value);
  if (canonical_code !== text && !warnings.length) {
    warnings.push({code: 'LEGACY_CODE_FORMAT', message: 'Khoảng trắng trong mã đã được chuẩn hóa'});
  }
  return {ok: true, value: {...value, canonical_code, question_type: FORMS[question_form]}, warnings};
}

// Khóa máy để tra cứu/idempotency. Không hiển thị thường trực cho giáo viên (§11).
export function canonicalKey({subject_code, grade, branch_code, outcome_number, yccd_number = null}) {
  const base = `${subject_code}:G${grade}:${branch_code}:${outcome_number}`;
  return yccd_number == null ? base : `${base}:${yccd_number}`;
}

// Nhãn nghiệp vụ hiển thị: L.2 và L.2.1 (§12).
export const outcomeLabel = (branch_code, outcome_number) => `${branch_code}.${outcome_number}`;
export const yccdLabel = (branch_code, outcome_number, yccd_number) => `${branch_code}.${outcome_number}.${yccd_number}`;

// Mode A: 1 YCCĐ = 4 đơn vị kiến thức × 5 hình thức = 20 câu, phân bố mức 6/6/4/4.
// Mode B: 10 câu độc lập, số 1→10, phân bố mức 3/3/2/2.
export const MODE_A = Object.freeze({
  mode: 'CONTENT_UNIT_5_FORMS', content_units: 4, forms: ['TN', 'ĐS', 'TLN', 'GN', 'TL'],
  total: 20, level_distribution: {NB: 6, TH: 6, VD: 4, VDC: 4},
});
export const MODE_B = Object.freeze({
  mode: 'INDEPENDENT_10', content_units: 10, forms: ['TN', 'ĐS', 'TLN', 'GN'],
  total: 10, level_distribution: {NB: 3, TH: 3, VD: 2, VDC: 2},
  default_form_distribution: {TN: 4, 'ĐS': 3, TLN: 1, GN: 2},
  alternative_form_distribution: {TN: 4, 'ĐS': 4, TLN: 1, GN: 1},
});

// Suy chế độ đánh số của một lô: Mode A lặp content_number qua nhiều hình thức, Mode B thì không.
export function inferNumberingMode(parsed) {
  const rows = parsed.filter(p => p?.ok).map(p => p.value);
  if (!rows.length) return 'CUSTOM';
  if (rows.some(r => r.question_form === 'TL')) {
    const repeated = rows.some(r => rows.filter(x => x.yccd_number === r.yccd_number && x.outcome_number === r.outcome_number
      && x.branch_code === r.branch_code && x.content_number === r.content_number).length > 1);
    if (repeated) return 'CONTENT_UNIT_5_FORMS';
  }
  const byUnit = new Map();
  for (const r of rows) {
    const key = [r.branch_code, r.outcome_number, r.yccd_number, r.content_number].join(':');
    byUnit.set(key, (byUnit.get(key) || 0) + 1);
  }
  if ([...byUnit.values()].some(n => n > 1)) return 'CONTENT_UNIT_5_FORMS';
  const numbers = rows.map(r => r.content_number);
  if (rows.length === 10 && new Set(numbers).size === 10 && Math.max(...numbers) === 10) return 'INDEPENDENT_10';
  return 'CUSTOM';
}

const duplicateCodes = (items, label, issues) => {
  const seen = new Set(), duplicates = new Set();
  for (const r of items) {
    const key = [r.branch_code, r.outcome_number, r.yccd_number, r.content_number, r.question_form].join(':');
    if (seen.has(key)) duplicates.add(key); else seen.add(key);
  }
  for (const key of duplicates) {
    const parts = key.split(':');
    issues.push({code: 'DUPLICATE_CODE', message: `${label}: trùng mã ở đơn vị ${parts[3]} dạng ${parts[4]}`});
  }
};

// Kiểm một lô theo đúng luật của chế độ đã suy ra. Trả cảnh báo, không tự sửa mã (§13, §33).
//
// Mode A kiểm theo TỪNG YCCĐ: một YCCĐ phải đủ 20 câu, 4 đơn vị × 5 hình thức.
// Mode B kiểm theo CẢ LÔ: bộ 10 câu có thể trải trên nhiều YCCĐ (5+5, hoặc chia đều cho 3 YCCĐ trở
// lên), nên đòi mỗi YCCĐ phải có đủ 10 câu là sai luật hiện hành.
export function checkNumbering(parsed, mode = inferNumberingMode(parsed)) {
  const rows = parsed.filter(p => p?.ok).map(p => p.value);
  const issues = [];
  if (mode === 'CONTENT_UNIT_5_FORMS') {
    const groups = new Map();
    for (const r of rows) {
      const key = [r.branch_code, r.outcome_number, r.yccd_number].join('.');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    for (const [yccd, items] of groups) {
      const units = new Set(items.map(r => r.content_number));
      if (units.size !== MODE_A.content_units) {
        issues.push({code: 'CONTENT_UNIT_COUNT', message: `YCCĐ ${yccd}: có ${units.size} đơn vị kiến thức, chuẩn của chế độ này là ${MODE_A.content_units}`});
      }
      if (items.length !== MODE_A.total) {
        issues.push({code: 'BATCH_SIZE', message: `YCCĐ ${yccd}: có ${items.length} câu, chuẩn của chế độ này là ${MODE_A.total}`});
      }
      const levels = Object.fromEntries(LEVELS.map(l => [l, items.filter(r => r.declared_level === l).length]));
      for (const level of LEVELS) if (levels[level] !== MODE_A.level_distribution[level]) {
        issues.push({code: 'LEVEL_DISTRIBUTION', message: `YCCĐ ${yccd}: mức ${level} có ${levels[level]} câu, chuẩn là ${MODE_A.level_distribution[level]}`});
      }
      duplicateCodes(items, `YCCĐ ${yccd}`, issues);
    }
    return {mode, issues, scope: 'PER_YCCD'};
  }

  if (mode === 'INDEPENDENT_10') {
    if (rows.length !== MODE_B.total) {
      issues.push({code: 'BATCH_SIZE', message: `Bộ câu có ${rows.length} câu, chuẩn của chế độ này là ${MODE_B.total}`});
    }
    const numbers = rows.map(r => r.content_number).sort((a, b) => a - b);
    const expected = Array.from({length: MODE_B.total}, (_, i) => i + 1);
    if (numbers.length !== expected.length || numbers.some((n, i) => n !== expected[i])) {
      issues.push({code: 'CONTENT_NUMBER_SEQUENCE', message: `Bộ 10 câu phải đánh số 1→10 không lặp; hiện là ${numbers.join(', ')}`});
    }
    const levels = Object.fromEntries(LEVELS.map(l => [l, rows.filter(r => r.declared_level === l).length]));
    for (const level of LEVELS) if (levels[level] !== MODE_B.level_distribution[level]) {
      issues.push({code: 'LEVEL_DISTRIBUTION', message: `Cả bộ: mức ${level} có ${levels[level]} câu, chuẩn là ${MODE_B.level_distribution[level]}`});
    }
    if (rows.some(r => r.question_form === 'TL')) {
      issues.push({code: 'UNEXPECTED_ESSAY', message: 'Bộ 10 câu độc lập mặc định không có dạng Tự luận'});
    }
    duplicateCodes(rows, 'Bộ câu', issues);
    return {mode, issues, scope: 'PER_BATCH', yccd_count: new Set(rows.map(r => [r.branch_code, r.outcome_number, r.yccd_number].join('.'))).size};
  }

  return {mode, issues, scope: 'NONE'};
}
