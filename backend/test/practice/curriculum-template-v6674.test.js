// V6.6.7.4 — file mẫu chương trình cho môn không chia phân môn (chữ viết tắt của môn), sheet Ví dụ / Dùng AI, lệnh AI.
import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {buildWorkbook, parseTemplate, buildPrompts, SHEETS} from '../../src/services/curriculumMaster/template.js';
import {parseWorkbook} from '../../src/services/curriculumMaster/service.js';
import {pool} from '../../src/db/pool.js';

const toan = {id: 1, code: 'Toan', name: 'Toán', code_letter: 'T', branches: []};
const khtn = {id: 3, code: 'KHTN', name: 'KHTN', code_letter: null, branches: [{id: 1, code: 'VL', name: 'Vật lí'}, {id: 2, code: 'HH', name: 'Hóa học'}, {id: 3, code: 'SH', name: 'Sinh học'}]};
const noLetter = {id: 99, code: 'Moi', name: 'Môn mới', code_letter: null, branches: []};
const book = (curriculum, lessons) => ({sheets: [{name: SHEETS.curriculum, rows: curriculum}, {name: SHEETS.lessons, rows: lessons}]});
const CUR_HEAD = ['Số Chủ đề', 'Tên Chủ đề (Outcome)', 'Số YCCĐ', 'Nội dung YCCĐ', 'Trang / nguồn'];

test.after(() => pool.end());

test('V6674 mẫu: môn không chia phân môn — không cột Phân môn, nhãn và mã dùng chữ của môn, Bài không mang phân môn', () => {
  const parsed = parseTemplate(book(
    [CUR_HEAD, [1, 'Mệnh đề', 1, 'YCCĐ một', ''], ['', '', 2, 'YCCĐ hai', ''], [2, 'Bất phương trình', 1, 'YCCĐ ba', 'tr. 3']],
    [['Chương / Chủ đề SGK', 'Số bài', 'Tên bài', 'Mã YCCĐ của bài'], ['Chương I', 1, 'Mệnh đề', 'T.1.1; 1.2'], ['', 2, 'Bất phương trình bậc nhất hai ẩn', 't.2.1']]), {subject: toan});
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.outcomes.map(o => [o.branch, o.number, o.yccds.length]), [['T', 1, 2], ['T', 2, 1]]);
  assert.deepEqual(parsed.lessons.map(l => [l.number, l.branch, l.chapter, l.codes]), [[1, '', 'Chương I', ['T.1.1', 'T.1.2']], [2, '', 'Chương I', ['T.2.1']]]);
});

test('V6674 mẫu: mã chữ của môn khác, hoặc môn chưa có chữ viết tắt, bị báo rõ', () => {
  const cur = [CUR_HEAD, [1, 'Mệnh đề', 1, 'YCCĐ một', '']];
  const wrong = parseTemplate(book(cur, [['Số bài', 'Tên bài', 'Mã YCCĐ của bài'], [1, 'Mệnh đề', 'L.1.1']]), {subject: toan});
  assert.match(wrong.errors.map(e => e.message).join('\n'), /không chia phân môn.*chữ T/);
  const missing = parseTemplate(book(cur, []), {subject: noLetter});
  assert.match(missing.errors[0].message, /chưa có chữ viết tắt/);
});

test('V6674 mẫu: tải về rồi nạp lại nguyên file cho đúng dữ liệu; sheet Ví dụ + Dùng AI chỉ để đọc', async () => {
  const data = {outcomes: [{branch: 'T', number: 1, title: 'Mệnh đề', yccds: [{number: 1, text: 'YCCĐ một', page: 'tr. 1'}, {number: 2, text: 'YCCĐ hai', page: ''}]}],
    lessons: [{number: 1, name: 'Mệnh đề', chapter: 'Chương I', branch: '', codes: ['T.1.1', 'T.1.2']}]};
  const buffer = buildWorkbook(data, {subject: toan, grade: 10, source: 'thử'});
  const wb = XLSX.read(buffer), rows = name => XLSX.utils.sheet_to_json(wb.Sheets[name], {header: 1, defval: ''});
  assert.deepEqual(wb.SheetNames, [SHEETS.guide, SHEETS.curriculum, SHEETS.lessons, SHEETS.example, SHEETS.ai]);
  assert.deepEqual(rows(SHEETS.curriculum)[0], CUR_HEAD);
  assert.ok(rows(SHEETS.example).flat().includes('T.1.2; T.1.3'), 'ví dụ Toán dùng chữ T');
  const ai = rows(SHEETS.ai).flat().join('\n');
  assert.match(ai, /LỆNH 1 — CHƯƠNG TRÌNH/);
  assert.match(ai, /Câu T\. 1\. 1\. NB\. 1\. TN/);
  const parsed = parseTemplate(await parseWorkbook({originalname: 'mau.xlsx', buffer}), {subject: toan});
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.outcomes.map(o => ({branch: o.branch, number: o.number, title: o.title, yccds: o.yccds.map(y => ({number: y.number, text: y.text, page: y.page}))})), data.outcomes);
  assert.deepEqual(parsed.lessons, data.lessons);
});

test('V6674 lệnh AI: KHTN có cột Phân môn và chữ L/H/S; Toán không có cột Phân môn, mã dùng T; không dấu ngoặc kép', () => {
  const k = buildPrompts(khtn, 9), t = buildPrompts(toan, 10);
  assert.match(k.curriculum, /Phân môn \| Số Chủ đề/);
  assert.match(k.curriculum, /L = Vật lí/);
  assert.match(k.questions, /Câu <Phân môn>\./);
  assert.doesNotMatch(t.curriculum, /Phân môn/);
  assert.match(t.lessons, /T\.2\.1; T\.2\.3/);
  assert.match(t.questions, /Câu T\. 1\. 1\. NB\. 1\. TN/);
  assert.doesNotMatch(Object.values(k).join('\n') + Object.values(t).join('\n'), /"/);
});

// V6.8.2 — cột "Năng lực" của sheet Chương trình: gắn YCCĐ vào thành phần năng lực của môn ngay trong file mẫu.
const van = {id: 7, code: 'NguVan', name: 'Ngữ Văn', code_letter: 'V', branches: [], auto_abilities: false,
  axes: [{id: 1, code: 'C1', name: 'Đọc'}, {id: 2, code: 'C2', name: 'Viết'}, {id: 3, code: 'C3', name: 'Nói và nghe'}]};
const HEAD_ABLE = ['Số Chủ đề', 'Tên Chủ đề (Outcome)', 'Số YCCĐ', 'Nội dung YCCĐ', 'Năng lực', 'Trang / nguồn'];

test('V682 cột Năng lực: nhận mã hoặc tên thành phần, nhiều mã cách nhau bằng dấu ;, tên có dấu phẩy không bị tách sai', () => {
  const khoa = {...toan, axes: [{id: 1, code: 'C1', name: 'Nhận thức'}, {id: 3, code: 'C3', name: 'Vận dụng kiến thức, kĩ năng đã học'}], auto_abilities: true};
  const parsed = parseTemplate(book([HEAD_ABLE, [1, 'Chủ đề', 1, 'Một', 'c1; C3', ''], ['', '', 2, 'Hai', 'Vận dụng kiến thức, kĩ năng đã học', ''], ['', '', 3, 'Ba', 'C1, C3', ''], ['', '', 4, 'Bốn', '', '']],
    [['Số bài', 'Tên bài', 'Mã YCCĐ của bài']]), {subject: khoa});
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.outcomes[0].yccds.map(y => y.abilities), [['C1', 'C3'], ['C3'], ['C1', 'C3'], []]);
  assert.deepEqual(parsed.warnings, [], 'môn có quy tắc tự động thì để trống không bị nhắc');
});

test('V682 cột Năng lực: mã lạ báo lỗi kèm danh sách dùng được; môn tính theo kĩ năng nhắc số YCCĐ còn trống', () => {
  const rows = [HEAD_ABLE, [1, 'Đọc hiểu văn bản', 1, 'Một', 'Đọc', ''], ['', '', 2, 'Hai', '', ''], ['', '', 3, 'Ba', '', '']];
  const ok = parseTemplate(book(rows, [['Số bài', 'Tên bài', 'Mã YCCĐ của bài']]), {subject: van});
  assert.deepEqual(ok.errors, []);
  assert.match(ok.warnings.map(w => w.message).join('\n'), /2 YCCĐ chưa ghi cột Năng lực/);
  const bad = parseTemplate(book([HEAD_ABLE, [1, 'Chủ đề', 1, 'Một', 'C9', '']], [['Số bài', 'Tên bài', 'Mã YCCĐ của bài']]), {subject: van});
  assert.match(bad.errors[0].message, /Năng lực "C9" không có trong khung của môn \(dùng: C1 = Đọc; C2 = Viết; C3 = Nói và nghe\)/);
});

test('V682 file mẫu: có cột Năng lực, hướng dẫn liệt kê thành phần của môn, lệnh AI biết điền cột này; tải về nạp lại giữ nguyên', async () => {
  const data = {outcomes: [{branch: 'V', number: 1, title: 'Đọc hiểu', yccds: [{number: 1, text: 'YCCĐ một', page: '', abilities: ['C1']}, {number: 2, text: 'YCCĐ hai', page: '', abilities: []}]}], lessons: []};
  const buffer = buildWorkbook(data, {subject: van, grade: 10, source: 'thử'});
  const wb = XLSX.read(buffer), rows = name => XLSX.utils.sheet_to_json(wb.Sheets[name], {header: 1, defval: ''});
  assert.deepEqual(rows(SHEETS.curriculum)[0], HEAD_ABLE);
  assert.deepEqual(rows(SHEETS.curriculum).slice(1).map(r => r[4]), ['C1', '']);
  const guide = rows(SHEETS.guide).flat().join('\n');
  assert.match(guide, /C1 = Đọc; C2 = Viết; C3 = Nói và nghe/);
  assert.match(guide, /KHÔNG tự ước tính được/);
  assert.match(buildPrompts(van, 10).curriculum, /Cột Năng lực: ghi MÃ thành phần năng lực.*C1 = Đọc/);
  const parsed = parseTemplate(await parseWorkbook({originalname: 'mau.xlsx', buffer}), {subject: van});
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.outcomes[0].yccds.map(y => y.abilities), [['C1'], []]);
});
