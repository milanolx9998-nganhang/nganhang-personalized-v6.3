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

// Kiểm một lô theo đúng luật của chế độ đã suy ra. Trả cảnh báo, không tự sửa mã (§13, §33).
export function checkNumbering(parsed, mode = inferNumberingMode(parsed)) {
  const rows = parsed.filter(p => p?.ok).map(p => p.value);
  const issues = [];
  const spec = mode === 'CONTENT_UNIT_5_FORMS' ? MODE_A : mode === 'INDEPENDENT_10' ? MODE_B : null;
  if (!spec) return {mode, issues};

  const groups = new Map();
  for (const r of rows) {
    const key = [r.branch_code, r.outcome_number, r.yccd_number].join('.');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  for (const [yccd, items] of groups) {
    const units = new Set(items.map(r => r.content_number));
    if (units.size !== spec.content_units) {
      issues.push({code: 'CONTENT_UNIT_COUNT', message: `YCCĐ ${yccd}: có ${units.size} đơn vị kiến thức, chuẩn của chế độ này là ${spec.content_units}`});
    }
    if (items.length !== spec.total) {
      issues.push({code: 'BATCH_SIZE', message: `YCCĐ ${yccd}: có ${items.length} câu, chuẩn của chế độ này là ${spec.total}`});
    }
    const levels = Object.fromEntries(LEVELS.map(l => [l, items.filter(r => r.declared_level === l).length]));
    for (const level of LEVELS) if (levels[level] !== spec.level_distribution[level]) {
      issues.push({code: 'LEVEL_DISTRIBUTION', message: `YCCĐ ${yccd}: mức ${level} có ${levels[level]} câu, chuẩn là ${spec.level_distribution[level]}`});
    }
    if (mode === 'INDEPENDENT_10' && items.some(r => r.question_form === 'TL')) {
      issues.push({code: 'UNEXPECTED_ESSAY', message: `YCCĐ ${yccd}: bộ 10 câu độc lập mặc định không có dạng Tự luận`});
    }
    const duplicates = new Set();
    const seen = new Set();
    for (const r of items) {
      const key = r.content_number + ':' + r.question_form;
      if (seen.has(key)) duplicates.add(key); else seen.add(key);
    }
    for (const key of duplicates) {
      issues.push({code: 'DUPLICATE_CODE', message: `YCCĐ ${yccd}: trùng mã ở đơn vị ${key.split(':')[0]} dạng ${key.split(':')[1]}`});
    }
  }
  return {mode, issues};
}
