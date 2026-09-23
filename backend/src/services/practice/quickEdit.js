import crypto from 'node:crypto';
import {tx, dryRun} from '../../db/pool.js';
import {resolveLesson} from '../curriculumResolver.js';
import {persistQuestion, questionScope, QUESTION_FROM} from './questions.js';
import {staff} from './authorization.js';
import {fail, log} from './config.js';
import {MAX_BULK_IDS} from './bulkWorkflow.js';

// V6.6.6 — sửa nhanh phân loại (mức, Bài) cho một câu hoặc cả lô ngay trên bàn làm việc.
//
// Mỗi câu đi qua persistQuestion — đúng đường của trình soạn thảo — nên bất biến mã–phân loại, phiên
// bản, nhật ký metadata và quyền không thể bị vòng qua. Mức nằm trong mã câu: đổi mức một câu có mã là
// đổi mã, nên phải có `regenerate_code` tường minh, nếu không câu đó bị chặn kèm mã đề xuất.
//
// Hai dạng thân yêu cầu:
//   {ids:[...], changes:{cognitive_level?, topic_id?}}      — cùng một thay đổi cho cả lô
//   {items:[{id, cognitive_level?, topic_id?}]}               — mỗi câu một giá trị
// Luôn là tất cả hoặc không: còn một câu bị chặn thì không đổi câu nào.
//
// V6.6.6.1 — không còn cờ allow_unlinked do client khai. Hoàn tác đi qua mã thao tác (undo_token) mà máy
// chủ lưu lúc sửa: đúng người làm, trong thời hạn, câu chưa bị sửa tiếp, và trả về đúng trạng thái trước.

const reasonCode = e => e.details?.code || e.code
  || (e.status === 403 ? 'NO_PERMISSION' : e.status === 404 ? 'NOT_FOUND' : e.status === 409 ? 'STATE_CONFLICT' : 'RULE_VIOLATION');

function pickChanges(source) {
  const out = {};
  if (source && Object.hasOwn(source, 'cognitive_level')) {
    const level = Number(source.cognitive_level);
    if (![1, 2, 3, 4].includes(level)) fail('Mức phải là NB, TH, VD hoặc VDC');
    out.cognitive_level = level;
  }
  if (source && Object.hasOwn(source, 'topic_id')) {
    const topic = source.topic_id == null ? null : Number(source.topic_id);
    if (topic !== null && !(Number.isInteger(topic) && topic > 0)) fail('Bài không hợp lệ');
    out.topic_id = topic;
  }
  return out;
}

function normalizeBody(body = {}) {
  let entries;
  if (Array.isArray(body.items)) {
    entries = body.items.map(item => ({id: Number(item?.id), changes: pickChanges(item)}));
  } else {
    const changes = pickChanges(body.changes || {});
    entries = [...new Set((body.ids || []).map(Number))].map(id => ({id, changes}));
  }
  entries = entries.filter(e => Number.isInteger(e.id) && e.id > 0);
  if (!entries.length) fail('Chọn ít nhất một câu hỏi');
  if (entries.length > MAX_BULK_IDS) fail(`Tối đa ${MAX_BULK_IDS} câu mỗi thao tác`);
  if (new Set(entries.map(e => e.id)).size !== entries.length) fail('Mỗi câu chỉ xuất hiện một lần');
  if (entries.every(e => !Object.keys(e.changes).length)) fail('Chưa có thay đổi nào');
  return entries;
}

async function scoped(client, user, ids) {
  const {where, params} = await questionScope(user, {}, 'content.write');
  params.push(ids);
  const rows = (await client.query(
    `SELECT q.id,q.question_code,q.yccd_id,q.topic_id,q.subject_id,q.grade,q.current_version_id,q.normalized_content,q.lesson_status,
            v.content AS version_content,q.cognitive_level::text AS level_col,
            COALESCE(q.normalized_content->>'display_code',q.question_code) AS display_code
     ${QUESTION_FROM} ${where.length ? 'WHERE ' + where.join(' AND ') + ' AND' : 'WHERE'} q.id=ANY($${params.length}::int[])`,
    params)).rows;
  return new Map(rows.map(r => [r.id, r]));
}

export const snapshot = row => ({
  cognitive_level: Number(String(row.level_col || '').replace(/^M/, '')) || null,
  topic_id: row.topic_id ?? null,
  display_code: row.display_code || null,
  lesson_status: row.lesson_status ?? null,
});

// Đọc lại trạng thái sau khi lưu để trả cho giao diện và ghi vào thao tác hoàn tác.
export async function afterState(client, id) {
  return (await client.query(
    `SELECT q.id,q.topic_id,q.current_version_id,q.lesson_status,q.cognitive_level::text AS level_col,
            COALESCE(q.normalized_content->>'display_code',q.question_code) AS display_code
     FROM questions q WHERE q.id=$1`, [id])).rows[0];
}

// options.entries + options.restore chỉ dùng nội bộ khi hoàn tác: giá trị trả về lấy từ bản lưu của máy
// chủ, nên được phép bỏ qua kiểm tra liên kết Bài↔YCCĐ (đang khôi phục đúng trạng thái đã có).
export async function evaluateQuickEdit(client, user, body = {}, options = {}) {
  staff(user);
  const entries = options.entries || normalizeBody(body);
  const restore = !!options.restore;
  const regenerate = !!body.regenerate_code;
  const expected = body.expected_versions || null;
  const found = await scoped(client, user, entries.map(e => e.id));
  const applied = [], blocked = [], unchanged = [];

  for (const {id, changes} of entries) {
    const row = found.get(id);
    if (!row) { blocked.push({question_id: id, question_code: null, reason_code: 'OUT_OF_SCOPE', message: 'Câu ngoài phạm vi được sửa'}); continue; }
    const code = row.display_code;
    const expectedVersion = expected?.[String(id)];
    if (expectedVersion && String(expectedVersion) !== String(row.current_version_id)) {
      blocked.push({question_id: id, question_code: code, reason_code: 'STALE_VERSION', message: 'Câu vừa được sửa ở nơi khác; tải lại trước khi sửa'});
      continue;
    }
    const before = snapshot(row);
    const content = row.normalized_content || row.version_content || {};
    const next = {...content, question_version_id: row.current_version_id,
      change_reason: String(body.reason || '').trim() || 'Sửa nhanh phân loại từ bàn làm việc'};
    let dirty = false;
    if (Object.hasOwn(changes, 'cognitive_level') && changes.cognitive_level && changes.cognitive_level !== before.cognitive_level) {
      next.cognitive_level = changes.cognitive_level; dirty = true;
    }
    if (Object.hasOwn(changes, 'topic_id') && changes.topic_id !== before.topic_id) {
      // Bài mới phải liên kết với YCCĐ của câu, như khi gán Bài hàng loạt.
      if (!restore && changes.topic_id && row.yccd_id) {
        const lesson = await resolveLesson(client, row.yccd_id, {subject_id: row.subject_id, grade: row.grade});
        if (!lesson.candidates.some(t => t.id === changes.topic_id)) {
          blocked.push({question_id: id, question_code: code, reason_code: 'LESSON_NOT_LINKED', message: 'Bài đã chọn chưa liên kết với YCCĐ của câu'});
          continue;
        }
      }
      next.topic_id = changes.topic_id;
      next.lesson_status = (restore && changes.lesson_status) || (changes.topic_id ? 'MANUAL' : 'UNMAPPED');
      dirty = true;
    }
    if (!dirty) { unchanged.push({question_id: id, question_code: code}); continue; }
    if (regenerate) next.regenerate_code = true;

    await client.query('SAVEPOINT quick_edit_item');
    try {
      await persistQuestion(client, user, next, {id});
      const after = await afterState(client, id);
      applied.push({question_id: id, question_code: after.display_code, current_version_id: after.current_version_id, before, after: snapshot(after)});
      await client.query('RELEASE SAVEPOINT quick_edit_item');
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT quick_edit_item');
      await client.query('RELEASE SAVEPOINT quick_edit_item');
      blocked.push({question_id: id, question_code: code, reason_code: reasonCode(e), message: e.message,
        ...(e.details?.suggested_code ? {current_code: e.details.current_code, suggested_code: e.details.suggested_code} : {})});
    }
  }
  return {requested: entries.length, eligible: applied, blocked, unchanged};
}

export function quickEditPreflight(user, body) {
  return dryRun(client => evaluateQuickEdit(client, user, body));
}

// Hoàn tác có hạn: đủ để sửa nhầm ngay tại chỗ, không đủ để thành đường vòng ghi đè về sau.
export const UNDO_WINDOW_MINUTES = 30;

// items: [{question_id, before, after, current_version_id}] — đúng trạng thái trước/sau của từng câu.
export async function recordEditOperation(client, user, kind, items) {
  if (!items.length) return null;
  const id = crypto.randomUUID();
  const rows = (await client.query(
    `INSERT INTO question_edit_operations(id,actor_id,kind,items,expires_at)
     VALUES($1,$2,$3,$4,now()+make_interval(mins => $5)) RETURNING expires_at`,
    [id, user.id, kind, JSON.stringify(items.map(i => ({question_id: i.question_id, before: i.before, after: i.after, after_version_id: i.current_version_id}))), UNDO_WINDOW_MINUTES])).rows;
  return {undo_token: id, undo_expires_at: rows[0].expires_at};
}

export async function quickEdit(user, body) {
  return tx(async client => {
    const plan = await evaluateQuickEdit(client, user, body);
    if (plan.blocked.length) fail('Còn câu chưa sửa được — không đổi câu nào', 409, {...plan, atomic: true});
    await log(client, user, 'QUESTION_QUICK_EDIT', 'bulk', {
      count: plan.eligible.length, regenerate_code: !!body.regenerate_code, reason: body.reason || '',
      items: plan.eligible.map(e => ({question_id: e.question_id, before: e.before, after: e.after})),
    });
    const undo = await recordEditOperation(client, user, 'QUICK_EDIT', plan.eligible);
    return {ok: true, applied: plan.eligible.length, items: plan.eligible, unchanged: plan.unchanged, ...(undo || {})};
  });
}

// Hoàn tác một thao tác sửa nhanh / gán Bài. Chỉ người đã làm, chưa quá hạn, chưa hoàn tác, và mọi câu
// phải còn đúng phiên bản ngay sau thao tác — nếu đã có ai sửa tiếp thì dừng thay vì ghi đè.
export async function undoEditOperation(user, id) {
  staff(user);
  return tx(async client => {
    const op = (await client.query('SELECT * FROM question_edit_operations WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!op || op.actor_id !== user.id) fail('Không tìm thấy thao tác để hoàn tác', 404);
    if (op.undone_at) fail('Thao tác này đã được hoàn tác', 409, {code: 'ALREADY_UNDONE'});
    if (new Date(op.expires_at) <= new Date()) fail('Đã quá thời hạn hoàn tác thao tác này', 409, {code: 'UNDO_EXPIRED'});
    const items = op.items || [];
    // Đổi Bài/mức không phải lúc nào cũng sinh phiên bản mới, nên so cả phiên bản lẫn trạng thái phân loại
    // hiện tại với trạng thái ngay sau thao tác.
    const current = new Map((await client.query(
      `SELECT q.id,q.topic_id,q.current_version_id,q.lesson_status,q.cognitive_level::text AS level_col,
              COALESCE(q.normalized_content->>'display_code',q.question_code) AS display_code
       FROM questions q WHERE q.id=ANY($1::int[])`, [items.map(i => i.question_id)])).rows.map(r => [r.id, r]));
    const FIELDS = ['cognitive_level', 'topic_id', 'display_code', 'lesson_status'];
    const stale = items.filter(i => {
      const row = current.get(i.question_id);
      if (!row || String(row.current_version_id) !== String(i.after_version_id)) return true;
      const now = snapshot(row);
      return FIELDS.some(f => (now[f] ?? null) !== (i.after?.[f] ?? null));
    });
    if (stale.length) {
      fail('Có câu đã được sửa tiếp sau thao tác này — không hoàn tác để tránh ghi đè', 409,
        {code: 'UNDO_STALE', question_ids: stale.map(i => i.question_id)});
    }
    const entries = items.map(i => ({id: i.question_id, changes: {
      ...(i.before.cognitive_level ? {cognitive_level: i.before.cognitive_level} : {}),
      topic_id: i.before.topic_id ?? null, lesson_status: i.before.lesson_status ?? null,
    }}));
    const regenerate = items.some(i => i.before.display_code !== i.after?.display_code);
    const plan = await evaluateQuickEdit(client, user, {regenerate_code: regenerate, reason: 'Hoàn tác thao tác ' + op.kind}, {entries, restore: true});
    if (plan.blocked.length) fail('Không hoàn tác được — không đổi câu nào', 409, {...plan, atomic: true});
    await client.query('UPDATE question_edit_operations SET undone_at=now() WHERE id=$1', [id]);
    await log(client, user, 'QUESTION_EDIT_UNDO', id, {kind: op.kind, count: plan.eligible.length});
    return {ok: true, restored: plan.eligible.length, items: plan.eligible};
  });
}
