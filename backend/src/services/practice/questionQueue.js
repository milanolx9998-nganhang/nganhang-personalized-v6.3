import {pool} from '../../db/pool.js';
import {questionScope, questionAccessScope, applyQuestionFilters, QUESTION_FROM, CHECK_SQL, ROW_FLAG_SQL, exceptionOverColumns} from './questions.js';
import {MAX_BULK_IDS} from './bulkWorkflow.js';
import {fail} from './config.js';
import {outcomeLabelSql,yccdLabelSql} from '../curriculumLabel.js';

// §14 — a queue row is a scanning aid, never a source of answers. The column list is explicit so a
// column later added to `questions` cannot start leaking through a `q.*`, and the DTO below is a
// second allowlist on top of it. Full content goes through /questions/:id/compare, which enforces
// content.view_answer.
const SUMMARY_COLUMNS = `q.id,q.question_code,q.current_version_id,q.active_version_id,q.subject_id,q.grade,q.branch_id,
 q.topic_id,q.outcome_id,q.yccd_id,q.cognitive_level,q.q_type,q.lifecycle,q.bank_id,q.quarantined,q.metadata_status,
 q.created_at,q.updated_at,q.creator_id,q.lesson_status,q.content_number,q.numbering_mode,
 left(COALESCE(q.stem_text,q.normalized_content->>'stem',''),180) AS stem_excerpt,
 COALESCE(q.normalized_content->>'display_code',q.question_code) AS display_code,
 v.review_status,v.version_number,b.name AS bank_name,s.name AS subject_name,t.name AS topic_name,br.name AS branch_name,
 o.code AS outcome_code,y.code AS yccd_code,u.full_name AS author_name,
 ${outcomeLabelSql('o')} AS outcome_label,(SELECT ${yccdLabelSql('y', 'yo')} FROM curriculum_outcomes yo WHERE yo.id=y.outcome_id) AS yccd_label,
 (SELECT min(c.severity) FROM question_review_cases c WHERE c.question_id=q.id AND c.status IN('OPEN','IN_REVIEW')) AS open_case_severity,
 (SELECT count(*) FROM question_review_cases c WHERE c.question_id=q.id AND c.status IN('OPEN','IN_REVIEW'))::int AS open_cases,
 ${Object.entries(CHECK_SQL).map(([k, sql]) => `${sql} AS chk_${k}`).join(', ')}`;

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
    outcome_label: row.outcome_label,
    yccd_id: row.yccd_id,
    yccd_code: row.yccd_code,
    yccd_label: row.yccd_label,
    cognitive_level: row.cognitive_level,
    q_type: row.q_type,
    content_number: row.content_number,
    numbering_mode: row.numbering_mode,
    lesson_status: row.topic_id ? (row.lesson_status || 'MANUAL') : (row.lesson_status || 'UNMAPPED'),
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
    // Dải kiểm tra máy: đúng/sai cho từng khía cạnh. `code` là null khi câu không dùng mã hiện hành.
    checks: {
      code: row.chk_coded ? row.chk_code : null,
      curriculum: row.chk_curriculum, lesson: row.chk_lesson, level: row.chk_level, form: row.chk_form,
      answer: row.chk_answer, explanation: row.chk_explanation, media: row.chk_media, duplicate: row.chk_duplicate,
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
  // Lấy id của trang và tổng trước (không tính cột nặng), rồi chỉ tính cột tóm tắt + kiểm tra máy cho đúng
  // các câu trong trang. Trước đây cột kiểm tra bị tính cho mọi câu khớp bộ lọc (V6.6.6.1, đo ở 20.000 câu).
  const rows = (await pool.query(
    `WITH page AS (
       SELECT q.id, count(*) OVER()::int AS total ${QUESTION_FROM}
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY q.id DESC LIMIT $${params.length - 1} OFFSET $${params.length})
     SELECT ${SUMMARY_COLUMNS}, page.total
     FROM page JOIN questions q ON q.id=page.id JOIN banks b ON b.id=q.bank_id
     LEFT JOIN question_versions v ON v.id=q.current_version_id ${SUMMARY_JOINS}
     ORDER BY q.id DESC`, params)).rows;
  const withAuthor = seesAuthor(user);
  return {
    total: rows[0]?.total || 0,
    limit,
    offset,
    items: rows.map(r => summaryDto(r, withAuthor)),
  };
}

// Danh sách người biên soạn phải lấy từ toàn bộ tập dữ liệu trong phạm vi, không phải từ các dòng
// tình cờ đang hiển thị — nếu không, bộ lọc sẽ bỏ sót người mà người dùng đang muốn tìm.
export async function authorOptions(user, query) {
  if (user.role === 'student') fail('Không đủ quyền', 403);
  const {where, params} = await questionScope(user, query);
  const clauses = [...where, 'q.creator_id IS NOT NULL'];
  const rows = (await pool.query(
    `SELECT DISTINCT q.creator_id AS id,u.full_name ${QUESTION_FROM} LEFT JOIN users u ON u.id=q.creator_id
     WHERE ${clauses.join(' AND ')} ORDER BY u.full_name LIMIT 200`, params)).rows;
  return rows.filter(r => r.id && r.full_name);
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

// V6.6.6 — "Việc của tôi": các góc nhìn cố định của bàn làm việc, kèm số câu. Mỗi góc nhìn chỉ là một bộ
// tham số lọc của hàng đợi, nên bấm vào là ra đúng danh sách đã đếm, cùng quy tắc phạm vi truy cập.
export function workViews(user) {
  const reviewer = seesAuthor(user);
  const views = [
    {key: 'today', label: 'Tôi nhập hôm nay', query: {created_by: String(user.id), created_after: 'today'}},
    {key: 'drafts', label: 'Bản nháp của tôi', query: {created_by: String(user.id), review_status: 'DRAFT'}},
    {key: 'returned', label: 'Bị trả sửa', query: {created_by: String(user.id), returned: '1'}},
    ...(reviewer ? [{key: 'pending', label: 'Chờ duyệt', query: {review_status: 'PENDING_REVIEW'}}] : []),
    {key: 'nolesson', label: 'Chưa gắn Bài', query: {lesson_status: 'UNASSIGNED'}},
    {key: 'duplicate', label: 'Nghi trùng', query: {exception: 'duplicate'}},
  ];
  return views;
}

// Một lượt quét cho mọi góc nhìn: phạm vi truy cập áp một lần, mỗi góc nhìn là một count(*) FILTER.
// Mệnh đề lọc sinh từ đúng hàm lọc của hàng đợi, nên số đếm luôn bằng tổng khi bấm vào góc nhìn.
export async function viewCounts(user) {
  if (user.role === 'student') fail('Không đủ quyền', 403);
  const views = workViews(user);
  const {where, params} = await questionAccessScope(user);
  const columns = [];
  for (const [i, view] of views.entries()) {
    const clauses = [];
    await applyQuestionFilters(view.query, clauses, params);
    columns.push(`count(*) FILTER (WHERE ${clauses.length ? clauses.join(' AND ') : 'true'})::int AS v${i}`);
  }
  const row = (await pool.query(`SELECT ${columns.join(',')} ${QUESTION_FROM} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`, params)).rows[0];
  return views.map((view, i) => ({...view, query: new URLSearchParams(view.query).toString(), count: row['v' + i]}));
}

// V6.6.6 — số câu của từng bộ lọc ngoại lệ trong cùng bộ lọc hiện tại (một truy vấn), để chip lọc
// hiện "Chưa gắn Bài 7" thay vì bắt người dùng bấm thử từng nút.
export async function exceptionCounts(user, query) {
  if (user.role === 'student') fail('Không đủ quyền', 403);
  const scope = {...query};
  for (const key of ['exception', 'ids', 'limit', 'offset']) delete scope[key];
  const {where, params} = await questionScope(user, scope);
  // Mỗi kiểm tra tính một lần cho mỗi câu trong truy vấn con, rồi đếm các nhóm trên cột đã tính.
  // Trước đây mỗi nhóm tự tính lại mọi kiểm tra (~2,2 giây ở 20.000 câu).
  // Ba cờ về hồ sơ rà soát mở (nghi trùng, ảnh, có hồ sơ bất kỳ) lấy từ MỘT lần gom theo câu thay vì ba
  // truy vấn con mỗi câu; nghĩa y hệt các NOT EXISTS trong CHECK_SQL / ROW_FLAG_SQL.
  const flagSql = {...CHECK_SQL, ...ROW_FLAG_SQL,
    duplicate: '(NOT COALESCE(oc.dup,false))', media: '(NOT COALESCE(oc.media,false))', open_case: '(oc.question_id IS NOT NULL)'};
  const flags = Object.entries(flagSql).map(([key, sql]) => `${sql} AS ${key}`).join(',\n ');
  const groups = exceptionOverColumns('f');
  const columns = ['count(*)::int AS total', ...Object.entries(groups).map(([key, sql]) => `count(*) FILTER (WHERE ${sql})::int AS ${key}`)];
  // MATERIALIZED: không cho PostgreSQL "làm phẳng" truy vấn con rồi thế ngược biểu thức vào từng bộ đếm
  // (khi đó mỗi nhóm lại tính lại mọi kiểm tra).
  return (await pool.query(`WITH oc AS (
      SELECT question_id, bool_or(reason_code='DUPLICATE_SUSPECT') AS dup, bool_or(reason_code='MEDIA_PROBLEM') AS media
      FROM question_review_cases WHERE status IN('OPEN','IN_REVIEW') GROUP BY question_id),
    f AS MATERIALIZED (SELECT ${flags} ${QUESTION_FROM} LEFT JOIN oc ON oc.question_id=q.id ${where.length ? 'WHERE ' + where.join(' AND ') : ''})
    SELECT ${columns.join(',')} FROM f`, params)).rows[0];
}
