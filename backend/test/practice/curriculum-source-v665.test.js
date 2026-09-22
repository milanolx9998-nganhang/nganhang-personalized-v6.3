import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseOutcomeOrdinal, parseYccdSegments, normalizeSourceRows, detectTrustedProfile} from '../../src/services/curriculumMaster/trustedProfiles.js';

// Các mẫu dưới đây sao nguyên văn hình dạng gặp trong bộ 4 workbook KHTN chính thức.

test('V665 nguồn: số thứ tự Chủ đề đọc từ nguồn, không tự đếm lại', () => {
  assert.deepEqual(parseOutcomeOrdinal('2.Phản ứng hóa học'), {ordinal: 2, title: 'Phản ứng hóa học', flags: []});
  assert.deepEqual(parseOutcomeOrdinal('8.Cảm ứng ở sinh vật'), {ordinal: 8, title: 'Cảm ứng ở sinh vật', flags: []});
  assert.deepEqual(parseOutcomeOrdinal('3. Hô hấp tế bào'), {ordinal: 3, title: 'Hô hấp tế bào', flags: []});
  const none = parseOutcomeOrdinal('Quang hợp ở thực vật');
  assert.equal(none.ordinal, null);
  assert.deepEqual(none.flags, ['SOURCE_OUTCOME_NUMBER_MISSING']);
});

test('V665 nguồn: YCCĐ giữ nguyên số của nguồn kể cả khi đánh liên tục theo phân môn', () => {
  // Lớp 8: Outcome 2 bắt đầu từ YCCĐ số 4, không phải số 1.
  const segments = parseYccdSegments('4. Nêu được khái niệm sự biến đổi vật lí, biến đổi hoá học.');
  assert.equal(segments.length, 1);
  assert.equal(segments[0].ordinal, 4);
  assert.deepEqual(segments[0].flags, []);
});

test('V665 nguồn: một ô chứa nhiều YCCĐ được tách theo số, không tách theo dấu +', () => {
  const many = parseYccdSegments('1.  Nêu được khái niệm.\n2. Viết được phương trình.\n3. Vẽ được sơ đồ.');
  assert.deepEqual(many.map(s => s.ordinal), [1, 2, 3]);
  assert.equal(many.every(s => s.flags.includes('SOURCE_ROW_SPLIT')), true);

  // "+" là gạch đầu dòng nối tiếp bên trong cùng một yêu cầu — không được tách.
  const bullets = parseYccdSegments('1. Tiến hành thí nghiệm để nêu được:\n+ Tác dụng của nam châm;\n+ Sự định hướng của thanh nam châm.');
  assert.equal(bullets.length, 1);
  assert.equal(bullets[0].ordinal, 1);
  assert.equal(bullets[0].text.includes('+ Tác dụng'), true);
  assert.equal(bullets[0].flags.includes('SOURCE_ROW_SPLIT'), false);
});

test('V665 nguồn: câu dẫn không đánh số được giữ lại và gắn cờ, không bị vứt đi', () => {
  const segments = parseYccdSegments('. Mô tả được một cách tổng quát quá trình hô hấp ở tế bào:\n1. Nêu được khái niệm\n2. Viết được phương trình.');
  assert.deepEqual(segments.map(s => s.ordinal), [1, 2]);
  assert.equal(segments[0].text.startsWith('. Mô tả được') || segments[0].text.includes('Mô tả được'), true);
  assert.equal(segments[0].flags.includes('SOURCE_LEADIN_TEXT'), true);
});

test('V665 nguồn: số dính vào chữ được đọc tạm nhưng luôn gắn cờ cần xác nhận', () => {
  const segments = parseYccdSegments('. 5Nêu được vai trò của tập tính đối với động vật.');
  assert.equal(segments.length, 1);
  assert.equal(segments[0].ordinal, 5);
  assert.equal(segments[0].text, 'Nêu được vai trò của tập tính đối với động vật.');
  assert.equal(segments[0].flags.includes('SOURCE_NUMBER_MALFORMED'), true);
});

test('V665 nguồn: chuẩn hóa giữ đúng H.2.4 thay vì đánh số lại thành H.2.1', () => {
  const rows = [
    {domain: 'H', outcome_title: '1.Sử dụng hóa chất', text: '1. Nhận biết được dụng cụ.'},
    {domain: 'H', outcome_title: '1.Sử dụng hóa chất', text: '2. Nêu được quy tắc an toàn.'},
    {domain: 'H', outcome_title: '1.Sử dụng hóa chất', text: '3. Nhận biết thiết bị điện.'},
    {domain: 'H', outcome_title: '2.Phản ứng hóa học', text: '4. Nêu được khái niệm biến đổi.'},
    {domain: 'H', outcome_title: '2.Phản ứng hóa học', text: '5. Phân biệt được biến đổi.'},
  ];
  const normalized = normalizeSourceRows(rows);
  const h24 = normalized.find(r => r.branch_code === 'H' && r.outcome_ordinal === 2 && r.yccd_ordinal === 4);
  assert(h24, 'H.2.4 phải tồn tại đúng như nguồn');
  assert.equal(h24.text, 'Nêu được khái niệm biến đổi.');
  assert.equal(normalized.some(r => r.outcome_ordinal === 2 && r.yccd_ordinal === 1), false,
    'Không được đánh số lại YCCĐ của Outcome 2 về 1');
  assert.equal(normalized.every(r => !r.source_flags.length), true);
});

test('V665 nguồn: chỉ đếm tuần tự khi nguồn thật sự không có số, và luôn báo', () => {
  const normalized = normalizeSourceRows([
    {domain: 'S', outcome_title: 'Quang hợp', text: 'Nêu được khái niệm quang hợp.'},
    {domain: 'S', outcome_title: 'Quang hợp', text: 'Viết được phương trình.'},
  ]);
  assert.deepEqual(normalized.map(r => [r.outcome_ordinal, r.yccd_ordinal]), [[1, 1], [1, 2]]);
  assert.equal(normalized.every(r => r.source_flags.includes('SOURCE_ORDINAL_FALLBACK')), true);
});

test('V665 nguồn: importer tổng quát không được tự coi "Chủ đề" là Outcome', () => {
  // Hồ sơ tin cậy chỉ nhận diện khi có đủ ba cột Môn / Chủ đề / Yêu cầu cần đạt.
  const generic = {sheets: [{name: 'YCCĐ lớp 7', rows: [['Chủ đề', 'Ghi chú'], ['Quang hợp', 'x']]}]};
  assert.equal(detectTrustedProfile(generic), null);
});

// ---- Kiểm chứng trên chính 4 workbook thật, nếu máy có nguồn -------------------------------------
const SOURCE_DIR = 'G:/tai lieu  oppa/UP SHARE/outcome khtn';
const workbook = grade => `${SOURCE_DIR}/Outcome_YCCD_KHTN_${grade}.xlsx`;
const hasSources = [6, 7, 8, 9].every(g => fs.existsSync(workbook(g)));

test('V665 nguồn thật: 4 workbook KHTN giữ đúng số thứ tự chương trình', {skip: hasSources ? false : 'Không tìm thấy bộ 4 workbook chính thức trên máy này'}, async () => {
  const XLSX = (await import('xlsx')).default;
  const read = grade => {
    const wb = XLSX.read(fs.readFileSync(workbook(grade)), {type: 'buffer'});
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: ''});
    const headerRow = grid.findIndex(r => String(r[0]).trim() === 'Môn');
    assert(headerRow >= 0, 'Khối ' + grade + ': không tìm thấy dòng tiêu đề');
    const rows = grid.slice(headerRow + 1).filter(r => String(r[2] || '').trim())
      .map(r => ({domain: r[0], outcome_title: r[1], text: r[2], page: r[3]}));
    return normalizeSourceRows(rows);
  };

  // Khối 8: YCCĐ đánh liên tục trong phân môn, nên H.2 chạy tới 11 và H.2.4 phải là yêu cầu số 4.
  const g8 = read(8);
  const h24 = g8.find(r => r.branch_code === 'H' && r.outcome_ordinal === 2 && r.yccd_ordinal === 4);
  assert(h24, 'KHTN8 phải có H.2.4');
  assert.equal(h24.text.startsWith('Nêu được khái niệm sự biến đổi'), true, h24.text.slice(0, 60));
  assert.equal(Math.max(...g8.filter(r => r.branch_code === 'H' && r.outcome_ordinal === 2).map(r => r.yccd_ordinal)), 11);

  // Khối 9: L.2 có đúng các YCCĐ 1..7 theo nguồn.
  const g9 = read(9);
  const l2 = g9.filter(r => r.branch_code === 'L' && r.outcome_ordinal === 2).map(r => r.yccd_ordinal).sort((a, b) => a - b);
  assert.deepEqual(l2, [1, 2, 3, 4, 5, 6, 7]);

  // Khối 7: có ô chứa nhiều YCCĐ nên số dòng sau chuẩn hóa phải lớn hơn số dòng nguồn.
  const g7 = read(7);
  assert.equal(g7.some(r => r.source_flags.includes('SOURCE_ROW_SPLIT')), true, 'KHTN7 phải có ô bị tách');
  assert.equal(g7.some(r => r.source_flags.includes('SOURCE_NUMBER_MALFORMED')), true, 'KHTN7 phải có dòng số hỏng được gắn cờ');

  // Khối 6: nguồn sạch, không dòng nào phải gắn cờ.
  assert.equal(read(6).every(r => !r.source_flags.length), true);

  // Mọi khối: không có YCCĐ nào bị mất số.
  for (const grade of [6, 7, 8, 9]) {
    assert.equal(read(grade).every(r => Number.isInteger(r.yccd_ordinal) && r.yccd_ordinal > 0), true, 'Khối ' + grade);
  }
});
