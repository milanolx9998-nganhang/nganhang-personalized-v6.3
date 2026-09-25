// V6.7 — lỗi quy tắc từ trigger DB trả 409 kèm câu tiếng Việt, không lộ mã thô, không thành "Lỗi server nội bộ".
import test from 'node:test';
import assert from 'node:assert/strict';
import {dbRuleError} from '../../src/middleware/dbRuleErrors.js';
import {errorHandler} from '../../src/middleware/errorHandler.js';

const pgError = message => Object.assign(new Error(message), {code: 'P0001'});

function send(err) {
  const out = {};
  const res = {status(code) { out.status = code; return this; }, json(body) { out.body = body; return this; }};
  const log = console.error;
  console.error = () => {};
  try { errorHandler(err, {requestId: 'req-1'}, res, () => {}); } finally { console.error = log; }
  return out;
}

test('quy tắc cụ thể thắng quy tắc chung; thông báo tiếng Việt, mã giữ để tra cứu', () => {
  assert.deepEqual(dbRuleError(pgError('TOPIC_YCCD_MISMATCH: inactive curriculum')),
    {status: 409, code: 'TOPIC_YCCD_MISMATCH', message: 'Bài hoặc YCCĐ đã ngừng dùng nên không liên kết được.'});
  assert.match(dbRuleError(pgError('TOPIC_YCCD_MISMATCH: mapping outside subject/grade/domain')).message, /không cùng môn, khối hoặc phân môn/);
  assert.equal(dbRuleError(pgError('Question versions cannot be deleted')).message, 'Không xoá được phiên bản câu hỏi. Hãy lưu trữ câu hỏi thay vì xoá.');
  assert.match(dbRuleError(pgError('Question version content is immutable after review or use')).message, /Hãy tạo phiên bản mới/);
  assert.equal(dbRuleError(pgError('Something new')).code, 'DB_RULE');
});

test('chỉ nhận lỗi RAISE EXCEPTION (P0001); lỗi khác đi đường cũ', () => {
  assert.equal(dbRuleError(Object.assign(new Error('duplicate key'), {code: '23505'})), null);
  assert.equal(dbRuleError(new Error('PUBLISHED_CURRICULUM_IMMUTABLE')), null);
  assert.equal(dbRuleError(null), null);
});

test('errorHandler: lỗi quy tắc DB → 409 + câu dễ hiểu, kể cả ở production', () => {
  const env = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const r = send(pgError('PUBLISHED_CURRICULUM_IMMUTABLE'));
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'PUBLISHED_CURRICULUM_IMMUTABLE');
    assert.match(r.body.error, /Chương trình đã công bố/);
    assert.doesNotMatch(r.body.error, /PUBLISHED_CURRICULUM_IMMUTABLE/);
    const other = send(new Error('boom'));
    assert.equal(other.status, 500);
    assert.equal(other.body.error, 'Lỗi server nội bộ');
  } finally { process.env.NODE_ENV = env; }
});
