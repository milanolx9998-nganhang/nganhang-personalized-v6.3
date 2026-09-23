import {tx, pool} from '../../db/pool.js';
import {resolveLesson} from '../curriculumResolver.js';
import {persistQuestion, questionScope, QUESTION_FROM} from './questions.js';
import {staff} from './authorization.js';
import {fail, log} from './config.js';
import {MAX_BULK_IDS} from './bulkWorkflow.js';

// Gán Bài là thay đổi phân loại, không phải chuyển trạng thái. Vì vậy nó đi qua persistQuestion —
// đúng đường mà trình soạn thảo dùng — để giữ phân loại thay đổi, nhật ký metadata và hồ sơ rà soát.

async function scopedQuestions(client, user, ids) {
  const {where, params} = await questionScope(user, {}, 'content.write');
  params.push(ids);
  const rows = (await client.query(
    `SELECT q.id,q.question_code,q.yccd_id,q.topic_id,q.subject_id,q.grade,q.current_version_id,q.normalized_content,
            COALESCE(q.normalized_content->>'display_code',q.question_code) AS display_code
     ${QUESTION_FROM} ${where.length ? 'WHERE ' + where.join(' AND ') + ' AND' : 'WHERE'} q.id=ANY($${params.length}::int[])`,
    params)).rows;
  return new Map(rows.map(r => [r.id, r]));
}

// Nhóm lựa chọn theo YCCĐ và trả danh sách Bài ứng viên cho từng nhóm. Không gộp các YCCĐ khác nhau
// vào một đề xuất chung: một Bài hợp lệ cho YCCĐ này không có nghĩa nó hợp lệ cho YCCĐ kia.
export async function lessonOptions(user, ids) {
  staff(user);
  const unique = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
  if (!unique.length) fail('Chọn ít nhất một câu hỏi');
  if (unique.length > MAX_BULK_IDS) fail(`Tối đa ${MAX_BULK_IDS} câu mỗi thao tác`);
  const found = await scopedQuestions(pool, user, unique);

  const groups = new Map();
  for (const id of unique) {
    const row = found.get(id);
    if (!row) continue;
    const key = row.yccd_id ?? 'none';
    if (!groups.has(key)) groups.set(key, {yccd_id: row.yccd_id, yccd_label: null, yccd_text: null, question_ids: [], candidates: [], status: 'UNMAPPED'});
    groups.get(key).question_ids.push(id);
  }
  for (const group of groups.values()) {
    if (!group.yccd_id) { group.status = 'NO_YCCD'; continue; }
    const row = found.get(group.question_ids[0]);
    // Giao diện phải gọi YCCĐ bằng mã nghiệp vụ (L.2.1), không phải ID trong cơ sở dữ liệu.
    const label = (await pool.query('SELECT code,text FROM curriculum_yccds WHERE id=$1', [group.yccd_id])).rows[0];
    group.yccd_label = label?.code || null;
    group.yccd_text = label?.text || null;
    const lesson = await resolveLesson(pool, group.yccd_id, {subject_id: row.subject_id, grade: row.grade});
    group.status = lesson.status;
    group.candidates = lesson.candidates.map(t => ({id: t.id, name: t.name, chapter: t.chapter}));
  }
  return {
    requested: unique.length,
    out_of_scope: unique.filter(id => !found.has(id)),
    groups: [...groups.values()],
  };
}

// assignments: [{question_ids:[...], topic_id}] — người dùng đã xác nhận từng nhóm YCCĐ.
// Bài được gán phải thực sự liên kết với YCCĐ của câu, trừ khi người dùng ghi đè tường minh.
export async function bulkAssignLesson(user, {assignments = [], reason = '', allow_unlinked = false}) {
  staff(user);
  const pairs = [];
  for (const group of assignments) {
    const topicId = Number(group?.topic_id);
    if (!Number.isInteger(topicId)) fail('Mỗi nhóm cần chọn một Bài');
    for (const id of group.question_ids || []) if (Number.isInteger(Number(id))) pairs.push({id: Number(id), topicId});
  }
  if (!pairs.length) fail('Chọn ít nhất một câu hỏi');
  if (pairs.length > MAX_BULK_IDS) fail(`Tối đa ${MAX_BULK_IDS} câu mỗi thao tác`);

  return tx(async client => {
    const found = await scopedQuestions(client, user, pairs.map(p => p.id));
    const applied = [], blocked = [];
    for (const {id, topicId} of pairs) {
      const row = found.get(id);
      if (!row) { blocked.push({question_id: id, question_code: null, reason_code: 'OUT_OF_SCOPE', message: 'Câu ngoài phạm vi được phân quyền'}); continue; }
      if (row.topic_id === topicId) { continue; }
      if (!allow_unlinked && row.yccd_id) {
        const lesson = await resolveLesson(client, row.yccd_id, {subject_id: row.subject_id, grade: row.grade});
        if (!lesson.candidates.some(t => t.id === topicId)) {
          blocked.push({question_id: id, question_code: row.display_code, reason_code: 'LESSON_NOT_LINKED', message: 'Bài đã chọn chưa liên kết với YCCĐ của câu'});
          continue;
        }
      }
      await client.query('SAVEPOINT lesson_item');
      try {
        const content = row.normalized_content || {};
        await persistQuestion(client, user, {
          ...content, topic_id: topicId, lesson_status: 'MANUAL',
          question_version_id: row.current_version_id,
          change_reason: reason || 'Gán Bài cho câu hỏi theo YCCĐ',
        }, {id});
        const version = (await client.query('SELECT current_version_id FROM questions WHERE id=$1', [id])).rows[0]?.current_version_id;
        applied.push({question_id: id, question_code: row.display_code, topic_id: topicId, before_topic_id: row.topic_id ?? null, current_version_id: version});
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT lesson_item');
        blocked.push({question_id: id, question_code: row.display_code, reason_code: e.code || 'RULE_VIOLATION', message: e.message});
      }
      await client.query('RELEASE SAVEPOINT lesson_item');
    }
    if (blocked.length) fail('Còn câu chưa gán được Bài — không đổi câu nào', 409, {applied, blocked, atomic: true});
    await log(client, user, 'QUESTION_BULK_LESSON', 'bulk', {count: applied.length, reason, question_ids: applied.map(a => a.question_id)});
    return {ok: true, assigned: applied.length, items: applied};
  });
}
