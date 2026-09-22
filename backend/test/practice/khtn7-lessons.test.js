// Bảo vệ dữ liệu Bài ↔ YCCĐ khối 7 đã commit. Dữ liệu này đi theo mã nguồn để máy chủ nạp được sau
// khi deploy, nên nó phải được kiểm như mã: sai một số thứ tự là sai chuẩn chương trình.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const data = JSON.parse(fs.readFileSync(
  fileURLToPath(new URL('../../src/db/seed-data/khtn7-vatli-lessons.json', import.meta.url)), 'utf8'));

test('KHTN7 Vật lí: đủ 13 bài và 31 YCCĐ theo nguồn', () => {
  assert.equal(data.subject_code, 'KHTN');
  assert.equal(data.grade, 7);
  assert.equal(data.branch_code, 'L');
  assert.equal(data.lessons.length, 13);
  assert.equal(data.lessons.reduce((n, l) => n + l.yccd.length, 0), 31);
});

test('KHTN7: mỗi YCCĐ có nguyên văn và chỉ thuộc đúng một bài', () => {
  const seen = new Map();
  for (const lesson of data.lessons) {
    for (const item of lesson.yccd) {
      assert.equal(Number.isInteger(item.stt), true, 'STT phải là số nguyên');
      assert.equal(typeof item.text === 'string' && item.text.length > 10, true, `STT ${item.stt} thiếu nguyên văn`);
      assert.equal(seen.has(item.stt), false, `STT ${item.stt} bị gán cho hai bài`);
      seen.set(item.stt, lesson.lesson_no);
    }
  }
  // Phần Vật lí khối 7 là STT 19–49 của bảng YCCĐ chương trình 2018.
  const stt = [...seen.keys()].sort((a, b) => a - b);
  assert.equal(stt[0], 19);
  assert.equal(stt.at(-1), 49);
  assert.equal(stt.length, 31);
});

test('KHTN7: bài được đánh số 8–20 và có chương', () => {
  const numbers = data.lessons.map(l => l.lesson_no).sort((a, b) => a - b);
  assert.deepEqual(numbers, [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.equal(data.lessons.every(l => l.chapter && l.name), true);
});

test('KHTN7: giữ đúng ca STT không liền mạch của Bài 19 và Bài 20', () => {
  // Nguồn ghi "Từ trường → 43–47, 49" và "Nam châm điện → 48". Đếm dồn theo thứ tự sẽ sai chỗ này.
  const b19 = data.lessons.find(l => l.lesson_no === 19).yccd.map(y => y.stt).sort((a, b) => a - b);
  const b20 = data.lessons.find(l => l.lesson_no === 20).yccd.map(y => y.stt);
  assert.deepEqual(b19, [43, 44, 45, 46, 47, 49]);
  assert.deepEqual(b20, [48]);
});

test('KHTN7: fixture mapping đã xác nhận trong audit vẫn đúng', () => {
  const lessonOf = stt => data.lessons.find(l => l.yccd.some(y => y.stt === stt))?.lesson_no;
  assert.equal(lessonOf(19), 8);
  assert.equal(lessonOf(20), 8);
  assert.equal(lessonOf(21), 9);
});

test('KHTN7: dữ liệu ghi rõ nguồn và cách đối chiếu, không dùng số để ghép', () => {
  assert.match(data.source, /Outcome_YCCD_KHTN_7|ThongKe_YCCD_theo_Bai/);
  assert.match(data.curriculum, /GDPT 2018|32\/2018/);
  assert.match(data.note, /nguyên văn/);
});
