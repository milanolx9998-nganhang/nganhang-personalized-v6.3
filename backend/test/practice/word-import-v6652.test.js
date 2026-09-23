// V6.6.5.2 — tệp Word là đường nhập mặc định. Kiểm trình đọc Word trên một tệp đủ 5 dạng câu, có ảnh,
// bảng và công thức; mã viết sai phải được giữ lại để chặn, không bị nuốt vào nội dung câu.
import test from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import {parseDocx, parseKhtnCode} from '../../src/services/practice/importAdapters.js';
import {isCodeAttempt} from '../../src/services/questionCode.js';
import {splitMetadata, batchNumbering, issueSeverity} from '../../src/services/practice/imports.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');
const p = text => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const image = `<w:p><w:r><w:drawing><a:blip r:embed="rImg"/></w:drawing></w:r></w:p>`;
const equation = `<w:p><w:r><w:t xml:space="preserve">Công thức: </w:t></w:r><m:oMath><m:r><m:t>v=s/t</m:t></m:r></m:oMath></w:p>`;
const table = rows => `<w:tbl>${rows.map(r => `<w:tr>${r.map(c => `<w:tc>${p(c)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;

function docx(body) {
  const zip = new AdmZip();
  zip.addFile('word/media/image1.png', PNG);
  zip.addFile('word/_rels/document.xml.rels', Buffer.from('<Relationships><Relationship Id="rImg" Target="media/image1.png"/></Relationships>'));
  zip.addFile('word/document.xml', Buffer.from(`<w:document xmlns:w="w" xmlns:m="m" xmlns:a="a" xmlns:r="r"><w:body>${body}</w:body></w:document>`));
  return zip.toBuffer();
}

const FULL = docx([
  p('Bài: Bài 8. Tốc độ chuyển động'), p('Khối: 7'),
  p('Câu L. 1. 1. NB. 1. TN'), p('Tốc độ cho biết điều gì?'), image,
  p('A. Mức độ nhanh chậm'), p('B. Khối lượng'), p('C. Nhiệt độ'), p('D. Thể tích'), p('Đáp án: A'), p('Lời giải: Theo định nghĩa.'),
  p('Câu L. 1. 1. NB. 1. ĐS'), p('Xét các phát biểu:'),
  p('a) Tốc độ có đơn vị m/s'), p('b) Tốc độ luôn âm'), p('c) km/h là đơn vị tốc độ'), p('d) Tốc độ đo bằng cân'), p('Đáp án: a-Đ; b-S; c-Đ; d-S'),
  p('Câu L. 1. 1. TH. 1. TLN'), equation, p('Xe đi 100 m trong 20 s. Tốc độ bằng bao nhiêu m/s?'), p('Đáp án: 5'),
  p('Câu L. 1. 1. VD. 1. GN'), p('Ghép đại lượng với đơn vị:'), table([['Cột A', 'Cột B'], ['A. Tốc độ', '1. m/s'], ['B. Quãng đường', '2. m']]), p('Đáp án: A-1; B-2'),
  p('Câu L. 1. 1. VDC. 1. TL'), p('Giải thích vì sao cần đo tốc độ trên đường.'), table([['Xe', 'Tốc độ'], ['A', '40'], ['B', '60']]), p('Đáp án: Để đảm bảo an toàn.'),
].join(''));

test('V6652 Word: đủ 5 dạng câu, ảnh, bảng, công thức; mã được chuẩn hóa', () => {
  const parsed = parseDocx(FULL);
  assert.equal(parsed.items.length, 5);
  assert.deepEqual(parsed.items.map(i => i.type), ['multiple_choice', 'true_false', 'short_answer', 'matching', 'essay']);
  assert.deepEqual(parsed.items.map(i => i.display_code), [
    'Câu L. 1. 1. NB. 1. TN', 'Câu L. 1. 1. NB. 1. ĐS', 'Câu L. 1. 1. TH. 1. TLN', 'Câu L. 1. 1. VD. 1. GN', 'Câu L. 1. 1. VDC. 1. TL']);
  const [tn, ds, tln, gn, tl] = parsed.items;
  assert.equal(tn.answer.correct, 'A');
  assert.match(tn.stem, /\/uploads\/media\/|!\[Ảnh\]/, 'Ảnh phải nằm trong nội dung câu');
  assert.equal(tn.explanation.includes('Theo định nghĩa'), true);
  assert.deepEqual(ds.answer.values, {a: true, b: false, c: true, d: false});
  assert.match(tln.stem, /\$.*v=s\/t.*\$/, 'Công thức giữ ở dạng $…$');
  assert.deepEqual(tln.answer.aliases, ['5']);
  assert.equal(gn.left.length, 2);
  assert.equal(gn.right.length, 2);
  assert.match(tl.stem, /\| Xe \| Tốc độ \|/, 'Bảng trong câu tự luận giữ dạng bảng');
  assert.equal(parsed.media.length, 1);
  // Dòng trước câu đầu tiên là thông tin đầu tệp, không phải câu hỏi.
  assert.deepEqual(parsed.metadata, ['Bài: Bài 8. Tốc độ chuyển động', 'Khối: 7']);
});

test('V6652 Word: mã viết sai được giữ nguyên để chặn, không bị lẫn vào nội dung câu', () => {
  const parsed = parseDocx(docx([p('Câu L. 2. X. NB. 1. TN'), p('Nội dung'), p('A. 1'), p('B. 2'), p('C. 3'), p('D. 4'), p('Đáp án: A')].join('')));
  const [item] = parsed.items;
  assert.equal(item.display_code, '');
  assert.equal(item.code_raw, 'Câu L. 2. X. NB. 1. TN');
  assert.equal(item.stem.includes('Câu L.'), false);
  assert.equal(isCodeAttempt(item.code_raw), true);
});

test('V6652 Word: mã viết liền kiểu cũ đọc được và được đánh dấu', () => {
  const code = parseKhtnCode('Câu.L.2.2.TH.3.TN');
  assert.equal(code.display_code, 'Câu L. 2. 2. TH. 3. TN');
  assert.equal(code.code_legacy, true);
  assert.equal(parseKhtnCode('Câu L. 2. 2. TH. 3. TN').code_legacy, false);
});

test('V6652: "Câu 1." và mã cũ KHTN.M1.12 không phải mã hiện hành viết sai', () => {
  assert.equal(isCodeAttempt('Câu 1. Tính tốc độ'), false);
  assert.equal(isCodeAttempt('KHTN.M1.12'), false);
  assert.equal(isCodeAttempt('Câu H. 3. 1. NB. 1. TN'), true);
  assert.equal(isCodeAttempt('Câu Z. 1'), true, 'Viết theo khuôn mã nhưng sai phân môn vẫn là mã sai cần chặn');
});

test('V6652: Môn + Khối là ngữ cảnh; tùy chọn thêm chỉ là kỳ vọng hợp lệ', () => {
  const ctx = splitMetadata({subject_id: '3', grade: '7', bank_id: 5, expectations: {topic_id: '12', branch_code: 'L', cognitive_level: 9, type: 'hack'}});
  assert.equal(ctx.subject_id, 3);
  assert.equal(ctx.grade, 7);
  assert.equal(ctx.bank_id, 5);
  assert.deepEqual(ctx.expectations, {topic_id: 12, branch_code: 'L'}, 'Giá trị không hợp lệ bị bỏ, không được ghi đè');
});

test('V6652: mức nghiêm trọng của từng loại vấn đề', () => {
  for (const code of ['INVALID_CODE', 'UNKNOWN_OUTCOME', 'UNKNOWN_YCCD', 'CODE_METADATA_CONFLICT']) assert.equal(issueSeverity(code), 'blocking', code);
  for (const code of ['LESSON_UNMAPPED', 'LESSON_AMBIGUOUS', 'OPTIONAL_LESSON_MISMATCH', 'OPTIONAL_BRANCH_MISMATCH', 'DUPLICATE_SUSPECT']) assert.equal(issueSeverity(code), 'review', code);
  assert.equal(issueSeverity('LEGACY_CODE_FORMAT'), 'info');
});

test('V6652: lô có câu không mã thì chế độ đánh số chỉ áp cho câu có mã', () => {
  const coded = n => ({draft: {display_code: `Câu L. 1. 1. NB. ${n}. TN`}});
  const numbering = batchNumbering([coded(1), coded(2), {draft: {display_code: ''}}]);
  assert.equal(numbering.coded, 2);
  assert.equal(numbering.total, 3);
  assert.equal(numbering.mode, 'CUSTOM', 'Không suy chế độ cho cả lô khi có câu không mã');
  assert.equal(numbering.issues.some(i => i.code === 'PARTIAL_CODE_COVERAGE'), true);
  assert.equal(batchNumbering([{draft: {}}]).coded_mode, null);
});
