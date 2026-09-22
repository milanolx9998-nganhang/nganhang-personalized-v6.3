import test from 'node:test';
import assert from 'node:assert/strict';
import {parseQuestionCode, buildDisplayCode, canonicalKey, inferNumberingMode, checkNumbering, MODE_A, MODE_B} from '../../src/services/questionCode.js';
import {detectTrustedProfile, assignOrdinals, normalizeBranchCode, gradeFromSheetName} from '../../src/services/curriculumMaster/trustedProfiles.js';

test('V665 mã câu: đọc đúng ba phân môn, mức và hình thức hợp lệ', () => {
  const cases = [
    ['Câu L. 2. 1. NB. 2. ĐS', {branch_code: 'L', outcome_number: 2, yccd_number: 1, declared_level: 'NB', content_number: 2, question_form: 'ĐS'}],
    ['Câu H. 1. 3. VD. 4. GN', {branch_code: 'H', outcome_number: 1, yccd_number: 3, declared_level: 'VD', content_number: 4, question_form: 'GN'}],
    ['Câu S. 4. 2. TH. 7. TLN', {branch_code: 'S', outcome_number: 4, yccd_number: 2, declared_level: 'TH', content_number: 7, question_form: 'TLN'}],
  ];
  for (const [code, expected] of cases) {
    const result = parseQuestionCode(code);
    assert.equal(result.ok, true, code + ': ' + result.message);
    for (const [key, value] of Object.entries(expected)) assert.equal(result.value[key], value, code + ' · ' + key);
    assert.equal(result.value.canonical_code, code);
    assert.equal(result.warnings.length, 0);
  }
});

test('V665 mã câu: từ chối phân môn, mức, hình thức và số thứ tự không hợp lệ', () => {
  for (const bad of [
    'Câu X. 2. 1. NB. 2. ĐS',      // phân môn ngoài L/H/S
    'Câu L. 2. 1. XX. 2. ĐS',      // mức không thuộc NB/TH/VD/VDC
    'Câu L. 2. 1. NB. 2. ZZ',      // hình thức lạ
    'Câu L. 2. 1. NB. ĐS',         // thiếu số câu
    'L. 2. 1. NB. 2. ĐS',          // thiếu tiền tố
    'KHTN8.H.O02.Y04.TH.TN.0012',  // hệ mã mới không được nhận
  ]) {
    assert.equal(parseQuestionCode(bad).ok, false, 'phải từ chối: ' + bad);
  }
  assert.equal(parseQuestionCode('Câu L. 0. 1. NB. 2. ĐS').error, 'CODE_NUMBERING_INVALID');
  assert.equal(parseQuestionCode('').error, 'MISSING_CODE');
});

test('V665 mã câu: dạng viết liền cũ được chuẩn hóa kèm cảnh báo, không âm thầm', () => {
  const result = parseQuestionCode('Câu.L.2.1.NB.2.ĐS');
  assert.equal(result.ok, true);
  assert.equal(result.value.canonical_code, 'Câu L. 2. 1. NB. 2. ĐS');
  assert.equal(result.warnings[0].code, 'LEGACY_CODE_FORMAT');
});

test('V665 mã câu: sinh mã luôn ra đúng định dạng hiện hành', () => {
  assert.equal(buildDisplayCode({branch_code: 'L', outcome_number: 2, yccd_number: 1, declared_level: 'NB', content_number: 2, question_form: 'ĐS'}),
    'Câu L. 2. 1. NB. 2. ĐS');
});

test('V665 khóa máy có khối, nên cùng mã nghiệp vụ ở hai khối không đụng nhau', () => {
  const g7 = canonicalKey({subject_code: 'KHTN', grade: 7, branch_code: 'L', outcome_number: 1, yccd_number: 3});
  const g9 = canonicalKey({subject_code: 'KHTN', grade: 9, branch_code: 'L', outcome_number: 1, yccd_number: 3});
  assert.equal(g7, 'KHTN:G7:L:1:3');
  assert.notEqual(g7, g9);
});

// Mode A: 1 YCCĐ = 4 đơn vị × 5 hình thức = 20 câu, mức 6/6/4/4, năm hình thức dùng chung số đơn vị.
function modeABatch() {
  const levels = ['NB', 'NB', 'NB', 'NB', 'NB', 'NB', 'TH', 'TH', 'TH', 'TH', 'TH', 'TH', 'VD', 'VD', 'VD', 'VD', 'VDC', 'VDC', 'VDC', 'VDC'];
  const rows = [];
  let i = 0;
  for (const unit of [1, 2, 3, 4]) for (const form of MODE_A.forms) {
    rows.push(`Câu L. 1. 3. ${levels[i++]}. ${unit}. ${form}`);
  }
  return rows.map(parseQuestionCode);
}

test('V665 Mode A: 20 câu, 4 đơn vị, 5 hình thức dùng chung số đơn vị, phân bố 6/6/4/4', () => {
  const parsed = modeABatch();
  assert.equal(parsed.length, 20);
  assert.equal(parsed.every(p => p.ok), true);
  assert.equal(inferNumberingMode(parsed), 'CONTENT_UNIT_5_FORMS');
  const {issues} = checkNumbering(parsed);
  assert.deepEqual(issues, [], JSON.stringify(issues));
  const unit2 = parsed.filter(p => p.value.content_number === 2);
  assert.equal(unit2.length, 5);
  assert.deepEqual(unit2.map(p => p.value.question_form).sort(), [...MODE_A.forms].sort());
});

test('V665 Mode A: sai phân bố mức bị báo, không tự sửa mã', () => {
  const parsed = modeABatch();
  parsed[0] = parseQuestionCode('Câu L. 1. 3. VDC. 1. TN');
  const {issues} = checkNumbering(parsed);
  assert.equal(issues.some(i => i.code === 'LEVEL_DISTRIBUTION'), true);
  assert.equal(parsed[0].value.canonical_code, 'Câu L. 1. 3. VDC. 1. TN');
});

// Mode B: 10 câu độc lập, số 1→10, mức 3/3/2/2, mặc định không có Tự luận.
function modeBBatch() {
  const levels = ['NB', 'NB', 'NB', 'TH', 'TH', 'TH', 'VD', 'VD', 'VDC', 'VDC'];
  const forms = ['TN', 'TN', 'TN', 'TN', 'ĐS', 'ĐS', 'ĐS', 'TLN', 'GN', 'GN'];
  return levels.map((level, i) => parseQuestionCode(`Câu H. 2. 1. ${level}. ${i + 1}. ${forms[i]}`));
}

test('V665 Mode B: 10 câu, số 1→10 không lặp, phân bố 3/3/2/2, hình thức mặc định 4/3/1/2', () => {
  const parsed = modeBBatch();
  assert.equal(inferNumberingMode(parsed), 'INDEPENDENT_10');
  const {issues} = checkNumbering(parsed);
  assert.deepEqual(issues, [], JSON.stringify(issues));
  const numbers = parsed.map(p => p.value.content_number);
  assert.deepEqual([...new Set(numbers)].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const forms = parsed.map(p => p.value.question_form);
  for (const [form, expected] of Object.entries(MODE_B.default_form_distribution)) {
    assert.equal(forms.filter(f => f === form).length, expected, 'hình thức ' + form);
  }
  assert.equal(forms.includes('TL'), false);
});

test('V665 Mode B: bộ 10 câu trải trên nhiều YCCĐ vẫn hợp lệ — kiểm ở mức cả lô', () => {
  // Luật hiện hành cho phép 2 YCCĐ chia 5+5. Validator không được đòi mỗi YCCĐ phải đủ 10 câu.
  const levels = ['NB', 'NB', 'NB', 'TH', 'TH', 'TH', 'VD', 'VD', 'VDC', 'VDC'];
  const forms = ['TN', 'TN', 'TN', 'TN', 'ĐS', 'ĐS', 'ĐS', 'TLN', 'GN', 'GN'];
  const parsed = levels.map((level, i) =>
    parseQuestionCode(`Câu L. 3. ${i < 5 ? 1 : 2}. ${level}. ${i + 1}. ${forms[i]}`));
  const result = checkNumbering(parsed, 'INDEPENDENT_10');
  assert.equal(result.scope, 'PER_BATCH');
  assert.equal(result.yccd_count, 2);
  assert.deepEqual(result.issues, [], JSON.stringify(result.issues));
});

test('V665 Mode B: thiếu câu hoặc lặp số vẫn bị báo ở mức cả lô', () => {
  const short = modeBBatch().slice(0, 9);
  const issues = checkNumbering(short, 'INDEPENDENT_10').issues.map(i => i.code);
  assert.equal(issues.includes('BATCH_SIZE'), true);
  assert.equal(issues.includes('CONTENT_NUMBER_SEQUENCE'), true);
});

test('V665 Mode A vẫn kiểm theo từng YCCĐ, không đổi sang mức lô', () => {
  assert.equal(checkNumbering(modeABatch()).scope, 'PER_YCCD');
});

test('V665 Mode B: có Tự luận thì bị báo vì mặc định bộ 10 câu không dùng dạng này', () => {
  const parsed = modeBBatch();
  parsed[9] = parseQuestionCode('Câu H. 2. 1. VDC. 10. TL');
  assert.equal(checkNumbering(parsed, 'INDEPENDENT_10').issues.some(i => i.code === 'UNEXPECTED_ESSAY'), true);
});

test('V665 hồ sơ tin cậy: nhận diện 4 sheet và lấy khối từ tên sheet, không từ tên tệp', () => {
  const header = ['Môn', 'Chủ đề', 'Yêu cầu cần đạt', 'Trang nguồn'];
  const workbook = {sheets: [6, 7, 8, 9].map(g => ({name: `YCCĐ lớp ${g}`, rows: [header, ['Vật lí', 'Cơ năng', 'Nêu được...', '12']]}))};
  const detected = detectTrustedProfile(workbook);
  assert.equal(detected.profile, 'KHTN_OUTCOME_YCCD_OFFICIAL_V1');
  assert.deepEqual(detected.sheets.map(s => s.grade), [6, 7, 8, 9]);
  for (const sheet of detected.sheets) {
    assert.equal(sheet.topic_as_outcome, true);
    assert.equal(sheet.columns.text, 2);
    assert.equal(sheet.columns.outcome_title, 1);
    assert.equal(sheet.columns.page, 3);
  }
  assert.equal(gradeFromSheetName('KHTN9_outcome.xlsx'), null);
});

test('V665 hồ sơ tin cậy: bảng không có cột chuẩn thì không được nhận là chương trình', () => {
  const workbook = {sheets: [{name: 'YCCĐ lớp 7', rows: [['Chủ đề', 'Ghi chú'], ['Cơ năng', 'x']]}]};
  assert.equal(detectTrustedProfile(workbook), null);
});

test('V665 mã phân môn L/H/S giữ nguyên qua mọi cách viết trong nguồn', () => {
  for (const [value, expected] of [['Vật lí', 'L'], ['vật lý', 'L'], ['VL', 'L'], ['L', 'L'],
    ['Hóa học', 'H'], ['HH', 'H'], ['Sinh học', 'S'], ['SH', 'S']]) {
    assert.equal(normalizeBranchCode(value), expected, value);
  }
  assert.equal(normalizeBranchCode('Toán'), null);
});

test('V665 chống tái phát: không được đánh số lại khi nguồn đã có số', () => {
  // Trước đây hệ thống tự đếm 1,2,3... trong từng Outcome, biến H.2.4 của nguồn thành H.2.1.
  const rows = assignOrdinals([
    {domain: 'Hóa học', outcome_title: '2.Phản ứng hóa học', text: '4. Nêu được khái niệm biến đổi.'},
    {domain: 'Hóa học', outcome_title: '2.Phản ứng hóa học', text: '5. Phân biệt được biến đổi.'},
    {domain: 'Vật lí', outcome_title: '1.Tốc độ', text: '1. Nêu được khái niệm tốc độ.'},
  ]);
  assert.deepEqual(rows.map(r => [r.branch_code, r.outcome_ordinal, r.yccd_ordinal]),
    [['H', 2, 4], ['H', 2, 5], ['L', 1, 1]]);
  assert.equal(rows.every(r => !r.source_flags.includes('SOURCE_ORDINAL_FALLBACK')), true);
});

test('V665 số bài không được dùng để suy Outcome: hai hệ đánh số độc lập', () => {
  // Cùng một YCCĐ L.1.3 có thể nằm ở Bài 8 hoặc Bài 9; mã câu không mang số bài.
  const parsed = parseQuestionCode('Câu L. 1. 3. NB. 2. TN');
  assert.equal(parsed.ok, true);
  assert.equal('lesson' in parsed.value, false);
  assert.equal('topic_id' in parsed.value, false);
});
