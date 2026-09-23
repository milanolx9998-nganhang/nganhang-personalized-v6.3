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
//   {items:[{id, cognitive_level?, topic_id?}]}               — mỗi câu một giá trị (dùng để hoàn tác)
// Luôn là tất cả hoặc không: còn một câu bị chặn thì không đổi câu nào.

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
    `SELECT q.id,q.question_code,q.yccd_id,q.topic_id,q.subject_id,q.grade,q.current_version_id,q.normalized_content,
            v.content AS version_content,q.cognitive_level::text AS level_col,
            COALESCE(q.normalized_content->>'display_code',q.question_code) AS display_code
     ${QUESTION_FROM} ${where.length ? 'WHERE ' + where.join(' AND ') + ' AND' : 'WHERE'} q.id=ANY($${params.length}::int[])`,
    params)).rows;
  return new Map(rows.map(r => [r.id, r]));
}

const snapshot = row => ({
  cognitive_level: Number(String(row.level_col || '').replace(/^M/, '')) || null,
  topic_id: row.topic_id ?? null,
  display_code: row.display_code || null,
});

export async function evaluateQuickEdit(client, user, body = {}) {
  staff(user);
  const entries = normalizeBody(body);
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
    if (Object.hasOwn(changes, 'cognitive_level') && changes.cognitive_level !== before.cognitive_level) {
      next.cognitive_level = changes.cognitive_level; dirty = true;
    }
    if (Object.hasOwn(changes, 'topic_id') && changes.topic_id !== before.topic_id) {
      // Bài mới phải liên kết với YCCĐ của câu, như khi gán Bài hàng loạt — trừ khi người dùng
      // chủ động cho phép (vd. hoàn tác về đúng Bài cũ).
      if (changes.topic_id && row.yccd_id && !body.allow_unlinked) {
        const lesson = await resolveLesson(client, row.yccd_id, {subject_id: row.subject_id, grade: row.grade});
        if (!lesson.candidates.some(t => t.id === changes.topic_id)) {
          blocked.push({question_id: id, question_code: code, reason_code: 'LESSON_NOT_LINKED', message: 'Bài đã chọn chưa liên kết với YCCĐ của câu'});
          continue;
        }
      }
      next.topic_id = changes.topic_id;
      next.lesson_status = changes.topic_id ? 'MANUAL' : 'UNMAPPED';
      dirty = true;
    }
    if (!dirty) { unchanged.push({question_id: id, question_code: code}); continue; }
    if (regenerate) next.regenerate_code = true;

    await client.query('SAVEPOINT quick_edit_item');
    try {
      await persistQuestion(client, user, next, {id});
      const after = (await client.query(
        `SELECT q.id,q.topic_id,q.current_version_id,q.cognitive_level::text AS level_col,COALESCE(q.normalized_content->>'display_code',q.question_code) AS display_code
         FROM questions q WHERE q.id=$1`, [id])).rows[0];
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

export async function quickEdit(user, body) {
  return tx(async client => {
    const plan = await evaluateQuickEdit(client, user, body);
    if (plan.blocked.length) fail('Còn câu chưa sửa được — không đổi câu nào', 409, {...plan, atomic: true});
    await log(client, user, 'QUESTION_QUICK_EDIT', 'bulk', {
      count: plan.eligible.length, regenerate_code: !!body.regenerate_code, reason: body.reason || '',
      items: plan.eligible.map(e => ({question_id: e.question_id, before: e.before, after: e.after})),
    });
    return {ok: true, applied: plan.eligible.length, items: plan.eligible, unchanged: plan.unchanged};
  });
}
