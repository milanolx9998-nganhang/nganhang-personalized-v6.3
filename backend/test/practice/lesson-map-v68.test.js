// V6.8 — bản đồ bài học: chia lại mức theo số câu đang có, sao theo Bài, chuỗi ngày học, huy hiệu (các hàm thuần).
import test from 'node:test';
import assert from 'node:assert/strict';
import {allocate, fitPercent} from '../../src/services/practice/selection.js';
import {lessonProgress, streakOf, weekOf, badgesOf} from '../../src/services/practice/lessonMap.js';
import {pool} from '../../src/db/pool.js';

test.after(() => pool.end());

test('V68 fitPercent: giữ số câu, dồn phần thiếu sang mức gần nhất; tỉ lệ luôn cộng đủ 100 và allocate ra đúng phân bổ', () => {
  for (const [count, percent, avail, want] of [
    [10, [25, 25, 25, 25], [6, 4, 2, 0], [4, 4, 2, 0]],
    [10, [25, 25, 25, 25], [10, 0, 0, 0], [10, 0, 0, 0]],
    [7, [25, 25, 25, 25], [1, 2, 2, 2], [1, 2, 2, 2]],      // tỉ lệ nguyên phải cộng thêm 2 đơn vị: 14/29/29/28
    [10, [50, 50, 0, 0], [6, 4, 9, 9], [6, 4, 0, 0]],
    [6, [25, 25, 25, 25], [6, 0, 0, 0], [6, 0, 0, 0]],
  ]) {
    const p = fitPercent(count, percent, avail);
    assert.ok(p, JSON.stringify(avail));
    assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 100) < 1e-5, 'tổng 100: ' + JSON.stringify(p));
    assert.deepEqual(allocate(count, p), want);
  }
  assert.equal(fitPercent(10, [25, 25, 25, 25], [2, 2, 2, 2]), null, 'không đủ câu thì trả null');
});

const state = (level, mastery, {effective = 5, attempts = ['a1'], confidence = 'LOW', at = '2026-10-01T03:00:00Z'} = {}) =>
  ({topic_id: 1, cognitive_level: level, mastery_score: mastery, effective_question_count: effective, unique_question_count: effective, confidence, history: attempts.map(id => ({attempt_id: id, at}))});

test('V68 sao theo Bài: 1 = đã luyện, 2 = từ 70, 3 = từ ngưỡng qua ít nhất 2 lượt; nền tảng và thử thách tính riêng', () => {
  assert.deepEqual(lessonProgress([], 85), {status: 'new', stars: 0, mastery: null, base: null, challenge: null, attempts: 0, seen: 0, last_at: null, low_data: false, stuck: false});
  const once = lessonProgress([state(1, 100)], 85);
  assert.equal(once.stars, 2, 'một lượt điểm cao chưa đủ 3 sao');
  assert.equal(once.status, 'practicing');
  assert.equal(once.low_data, true);
  const twice = lessonProgress([state(1, 90, {attempts: ['a1', 'a2']}), state(2, 90, {attempts: ['a1', 'a2']})], 85);
  assert.deepEqual([twice.stars, twice.status, twice.attempts, twice.seen], [3, 'done', 2, 10]);
  // Nền tảng tốt, câu vận dụng sai nhiều: không bị coi là "đang vướng".
  const hard = lessonProgress([state(1, 90, {attempts: ['a1', 'a2']}), state(3, 20, {attempts: ['a1', 'a2']})], 85);
  assert.deepEqual([hard.base, hard.challenge, hard.mastery, hard.stuck, hard.stars], [90, 20, 55, false, 1]);
  // Nền tảng dưới 70 sau 2 lượt: đang vướng. Mới 1 lượt thì chưa kết luận.
  assert.equal(lessonProgress([state(1, 40, {attempts: ['a1', 'a2']})], 85).stuck, true);
  assert.equal(lessonProgress([state(1, 40)], 85).stuck, false);
});

test('V68 chuỗi ngày học: tính tới hôm nay, hôm nay chưa học thì tính tới hôm qua; chuỗi dài nhất giữ riêng', () => {
  assert.deepEqual(streakOf([], '2026-10-03'), {current: 0, best: 0, today_done: false});
  assert.deepEqual(streakOf(['2026-10-01', '2026-10-02', '2026-10-03'], '2026-10-03'), {current: 3, best: 3, today_done: true});
  assert.deepEqual(streakOf(['2026-10-01', '2026-10-02'], '2026-10-03'), {current: 2, best: 2, today_done: false});
  assert.deepEqual(streakOf(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-10-01'], '2026-10-03'), {current: 0, best: 4, today_done: false});
  assert.deepEqual(streakOf(['2026-09-30', '2026-10-01'], '2026-10-01'), {current: 2, best: 2, today_done: true}, 'qua ranh giới tháng');
  // Dải 7 ngày gần nhất: 04/10/2026 là Chủ nhật.
  const week = weekOf(['2026-09-28', '2026-10-02', '2026-10-04'], '2026-10-04');
  assert.deepEqual(week.map(d => d.date), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  assert.deepEqual(week.map(d => d.weekday), [1, 2, 3, 4, 5, 6, 0]);
  assert.deepEqual(week.map(d => d.done), [true, false, false, false, true, false, true]);
  assert.deepEqual(week.map(d => d.today), [false, false, false, false, false, false, true]);
});

test('V68 huy hiệu: tính từ số liệu thật, có tiến độ cho huy hiệu đếm được', () => {
  const lesson = (stars, challenge = null, can = true) => ({can_practice: can, progress: {stars, challenge}});
  const none = badgesOf({completed: 0, answered: 0, retries: 0, streak: {best: 0}, chapters: [{lessons: [lesson(0)]}]});
  assert.equal(none.filter(b => b.earned).length, 0);
  const some = badgesOf({completed: 4, answered: 42, retries: 1, streak: {best: 3}, chapters: [{lessons: [lesson(3, 75), lesson(2), lesson(0, null, false)]}, {lessons: [lesson(1)]}]});
  assert.deepEqual(some.filter(b => b.earned).map(b => b.id), ['first', 'streak3', 'fix', 'star3', 'chapter', 'challenge']);
  assert.equal(some.find(b => b.id === 'hundred').progress, '42/100');
  assert.equal(some.find(b => b.id === 'streak7').progress, '3/7');
});
