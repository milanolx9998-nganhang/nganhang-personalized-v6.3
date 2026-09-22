import {pool} from '../../db/pool.js';
import {questionScope, QUESTION_FROM} from './questions.js';
import {MAX_BULK_IDS} from './bulkWorkflow.js';
import {fail} from './config.js';

// §14 — a queue row is a scanning aid, never a source of answers. The column list is explicit so a
// column later added to `questions` cannot start leaking through a `q.*`, and the DTO below is a
// second allowlist on top of it. Full content goes through /questions/:id/compare, which enforces
// content.view_answer.
const SUMMARY_COLUMNS = `q.id,q.question_code,q.current_version_id,q.active_version_id,q.subject_id,q.grade,q.branch_id,
 q.topic_id,q.outcome_id,q.yccd_id,q.cognitive_level,q.q_type,q.lifecycle,q.bank_id,q.quarantined,q.metadata_status,
 q.created_at,q.updated_at,q.creator_id,
 left(COALESCE(q.stem_text,q.normalized_content->>'stem',''),180) AS stem_excerpt,
 COALESCE(q.normalized_content->>'display_code',q.question_code) AS display_code,
 v.review_status,v.version_number,b.name AS bank_name,s.name AS subject_name,t.name AS topic_name,br.name AS branch_name,
 o.code AS outcome_code,y.code AS yccd_code,u.full_name AS author_name,
 (SELECT min(c.severity) FROM question_review_cases c WHERE c.question_id=q.id AND c.status IN('OPEN','IN_REVIEW')) AS open_case_severity,
 (SELECT count(*) FROM question_review_cases c WHERE c.question_id=q.id AND c.status IN('OPEN','IN_REVIEW'))::int AS open_cases`;

const SUMMARY_JOINS = `LEFT JOIN subjects s ON s.id=q.subject_id LEFT JOIN topics t ON t.id=q.topic_id
 LEFT JOIN branches br ON br.id=q.branch_id LEFT JOIN curriculum_outcomes o ON o.id=q.outcome_id
 LEFT JOIN curriculum_yccds y ON y.id=q.yccd_id LEFT JOIN users u ON u.id=q.creator_id`;

const seesAuthor = user => user.role === 'admin'
  || !!(user.capabilities?.['content.review'] || user.capabilities?.['content.approve']);

function summaryDto(row, withAuthor) {
  return {
    id: row.id,
    question_code: row.question_code,
    display_code: row.display_code,
    current_version_id: row.current_version_id,
    active_version_id: row.active_version_id,
    version_number: row.version_number,
    stem_excerpt: row.stem_excerpt,
    subject_id: row.subject_id,
    subject_name: row.subject_name,
    grade: row.grade,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    topic_id: row.topic_id,
    topic_name: row.topic_name,
    outcome_id: row.outcome_id,
    outcome_code: row.outcome_code,
    yccd_id: row.yccd_id,
    yccd_code: row.yccd_code,
    cognitive_level: row.cognitive_level,
    q_type: row.q_type,
    lifecycle: row.lifecycle,
    review_status: row.review_status,
    bank_id: row.bank_id,
    bank_name: row.bank_name,
    metadata_status: row.metadata_status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...(withAuthor ? {creator_id: row.creator_id, author_name: row.author_name} : {}),
    risk: {
      quarantined: row.quarantined,
      open_cases: row.open_cases,
      open_case_severity: row.open_case_severity,
      needs_curriculum_review: row.metadata_status === 'NEEDS_REVIEW',
    },
    answer_hidden: true,
  };
}

export async function questionQueue(user, query) {
  if (user.role === 'student') fail('Không đủ quyền', 403);
  const {where, params} = await questionScope(user, query);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 30));
  const offset = Math.max(0, Number(query.offset) || 0);
  params.push(limit, offset);
  const rows = (await pool.query(
    `SELECT ${SUMMARY_COLUMNS},count(*) OVER()::int AS total ${QUESTION_FROM} ${SUMMARY_JOINS}
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY q.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params)).rows;
  const withAuthor = seesAuthor(user);
  return {
    total: rows[0]?.total || 0,
    limit,
    offset,
    items: rows.map(r => summaryDto(r, withAuthor)),
  };
}

// §23 — "select all matching the filter" must mean the filter, resolved by the server under the same
// access rules, not the rows that happen to be rendered. Capped so a bulk call can never exceed what
// bulk execution accepts.
export async function selectionIds(user, query) {
  if (user.role === 'student') fail('Không đủ quyền', 403);
  const {where, params} = await questionScope(user, query);
  params.push(MAX_BULK_IDS);
  const rows = (await pool.query(
    `SELECT q.id,q.current_version_id,count(*) OVER()::int AS total ${QUESTION_FROM}
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY q.id DESC LIMIT $${params.length}`, params)).rows;
  const total = rows[0]?.total || 0;
  return {
    total,
    limit: MAX_BULK_IDS,
    truncated: total > MAX_BULK_IDS,
    items: rows.map(r => ({question_id: r.id, current_version_id: r.current_version_id})),
    expected_versions: Object.fromEntries(rows.map(r => [String(r.id), r.current_version_id])),
  };
}
