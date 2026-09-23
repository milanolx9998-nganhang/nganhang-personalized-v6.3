import crypto from 'node:crypto';
import {tx,dryRun} from '../../db/pool.js';
import {versionWorkflow,reviewPolicy,checkReasonCodes} from '../questionReview.js';
import {validateCurriculum} from '../curriculum.js';
import {validateQuestion} from './grading.js';
import {transition} from './questions.js';
import {staff} from './authorization.js';
import {fail,log} from './config.js';

export const BULK_ACTIONS = ['submit', 'approve', 'request_changes', 'reject', 'archive', 'activate'];
const NEEDS_REASON = new Set(['request_changes', 'reject']);
export const MAX_BULK_IDS = 500;

// Bulk never reaches SQL directly: every business action lands on the same domain entry point the
// single-question workflow uses, so policy, audit and version immutability cannot be bypassed.
function runAction(client, user, id, action, {reason, reasonCodes, targetBankId}) {
  if (action === 'archive') return transition(client, user, id, 'archived', {reason, targetBankId});
  if (action === 'activate') return transition(client, user, id, 'active', {reason, targetBankId});
  return versionWorkflow(client, user, id, action, {reason, reason_codes: reasonCodes, targetBankId});
}

const reasonCode = e => e.code
  || (e.status === 403 ? 'NO_PERMISSION' : e.status === 404 ? 'NOT_FOUND' : e.status === 409 ? 'STATE_CONFLICT' : 'RULE_VIOLATION');

// §18 — fast approve is for clean items only. These checks call the very functions versionWorkflow
// calls, so a question routed to deep review here would have been refused there too; the point is to
// surface it as "needs a human" instead of a wall of failures.
async function deepReviewSignals(client, user, row, action, expected) {
  const out = [];
  const expectedVersion = expected?.[String(row.id)];
  if (expectedVersion && expectedVersion !== row.current_version_id) {
    out.push({code: 'STALE_VERSION', message: 'Phiên bản đã đổi sau khi chọn; tải lại trước khi duyệt'});
  }
  if (action !== 'approve') return out;
  if (row.quarantined) out.push({code: 'QUARANTINED', message: 'Câu đang bị cách ly khỏi lượt mới'});
  if (['P0', 'P1'].includes(row.open_severity)) {
    out.push({code: 'OPEN_REVIEW_CASE_' + row.open_severity, message: `Còn hồ sơ rà soát ${row.open_severity} chưa đóng`});
  }
  if (row.metadata_status === 'NEEDS_REVIEW') {
    out.push({code: 'CURRICULUM_NEEDS_REVIEW', message: 'Phân loại chương trình đang chờ rà soát'});
  }
  try { await validateCurriculum(client, row, {required: true}); }
  catch (e) { out.push({code: e.code || 'CURRICULUM_INVALID', message: e.message}); }
  const version = (await client.query('SELECT * FROM question_versions WHERE id=$1', [row.current_version_id])).rows[0];
  if (!version) return out;
  const profile = (await client.query('SELECT config FROM subject_profiles WHERE subject_id=$1', [row.subject_id])).rows[0]?.config || {};
  const validation = validateQuestion({...version, content: {...version.content, ...row.normalized_content}}, profile);
  if (validation.errors.length) out.push({code: 'VALIDATION_ERROR', message: validation.errors.join('; ')});
  const policy = await reviewPolicy(client, row.subject_id);
  const self = version.created_by === user.id || version.updated_by === user.id;
  if (self && policy.require_second_reviewer_for_content_change && !policy.allow_author_self_approve
      && !(user.role === 'admin' && policy.allow_admin_self_approve)) {
    out.push({code: 'SECOND_REVIEWER_REQUIRED', message: 'Cần người duyệt khác tác giả'});
  }
  return out;
}

// Applies the batch for real inside the caller's transaction, one savepoint per item, and reports
// what happened. Preflight runs this in a transaction that always rolls back; execution runs it in a
// real one and aborts everything if a single item is not eligible.
export async function evaluateBulk(client, user, body) {
  const {action, reason = '', target_bank_id = null, expected_versions = null} = body || {};
  const reasonCodes = checkReasonCodes(body?.reason_codes);
  staff(user);
  if (!BULK_ACTIONS.includes(action)) fail('Thao tác hàng loạt không hợp lệ');
  const ids = [...new Set((body?.ids || []).map(Number).filter(Number.isInteger))];
  if (!ids.length) fail('Chọn ít nhất một câu hỏi');
  if (ids.length > MAX_BULK_IDS) fail(`Tối đa ${MAX_BULK_IDS} câu mỗi thao tác`);
  if (NEEDS_REASON.has(action) && !String(reason).trim() && !reasonCodes.length) fail('Cần lý do trả sửa / từ chối');
  if (action === 'approve' && !expected_versions) fail('Thiếu phiên bản đã xem; tải lại danh sách trước khi duyệt', 409);

  const rows = (await client.query(`SELECT q.id,q.question_code,q.subject_id,q.grade,q.branch_id,q.topic_id,q.outcome_id,q.yccd_id,
    q.bank_id,q.quarantined,q.metadata_status,q.current_version_id,q.normalized_content,v.review_status,
    (SELECT min(c.severity) FROM question_review_cases c WHERE c.question_id=q.id AND c.status IN('OPEN','IN_REVIEW')) AS open_severity
    FROM questions q LEFT JOIN question_versions v ON v.id=q.current_version_id WHERE q.id=ANY($1::int[])`, [ids])).rows;
  const found = new Map(rows.map(r => [r.id, r]));

  const eligible = [], blocked = [], requiresDeepReview = [];
  for (const id of ids) {
    const row = found.get(id);
    if (!row) {
      blocked.push({question_id: id, question_code: null, reason_code: 'NOT_FOUND', message: 'Không tìm thấy câu hỏi'});
      continue;
    }
    await client.query('SAVEPOINT bulk_item');
    try {
      const signals = await deepReviewSignals(client, user, row, action, expected_versions);
      if (signals.length) {
        await client.query('ROLLBACK TO SAVEPOINT bulk_item');
        requiresDeepReview.push({
          question_id: id, question_code: row.question_code, reason_code: signals[0].code,
          message: signals.map(s => s.message).join('; '), signals: signals.map(s => s.code),
        });
      } else {
        await runAction(client, user, id, action, {reason, reasonCodes, targetBankId: target_bank_id});
        eligible.push({question_id: id, question_code: row.question_code});
      }
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT bulk_item');
      blocked.push({question_id: id, question_code: row.question_code, reason_code: reasonCode(e), message: e.message});
    }
    await client.query('RELEASE SAVEPOINT bulk_item');
  }
  return {requested: ids.length, eligible, blocked, requires_deep_review: requiresDeepReview};
}

export async function bulkPreflight(user, body) {
  return dryRun(client => evaluateBulk(client, user, body));
}

export async function bulkWorkflow(user, body) {
  return tx(async client => {
    const plan = await evaluateBulk(client, user, body);
    if (plan.blocked.length || plan.requires_deep_review.length) {
      fail('Còn câu chưa đủ điều kiện — không thay đổi câu nào', 409, {...plan, atomic: true});
    }
    const batchId = crypto.randomUUID();
    const questionIds = plan.eligible.map(e => e.question_id);
    await log(client, user, 'QUESTION_BULK_WORKFLOW', batchId, {
      action: body.action, question_ids: questionIds, target_bank_id: body.target_bank_id || null,
      reason: body.reason || '', reason_codes: checkReasonCodes(body.reason_codes), count: questionIds.length, result: 'APPLIED',
    });
    return {ok: true, batch_id: batchId, action: body.action, applied: questionIds.length, question_ids: questionIds};
  });
}
