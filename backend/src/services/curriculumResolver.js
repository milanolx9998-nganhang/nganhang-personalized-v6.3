import {pool} from '../db/pool.js';
import {parseQuestionCode, canonicalKey, outcomeLabel, yccdLabel, FORMS, buildDisplayCode} from './questionCode.js';

// Mã câu quyết định Outcome/YCCĐ. Nó KHÔNG quyết định Bài.
// Bài chỉ đến từ topic_yccd_map (Bài ↔ YCCĐ), vì "Bài 2" và "Outcome 2" là hai hệ khác nhau.

const BRANCH_ALIASES = {VL: 'L', HH: 'H', SH: 'S'};
export const branchCodeOf = code => BRANCH_ALIASES[code] || code;

// Phiên bản chương trình đang hiệu lực cho một môn + khối.
//
// `status='ACTIVE'` một mình KHÔNG đủ để xác định "bản đang dùng": hệ thống giữ nhiều phiên bản
// lịch sử, và hai phiên bản cùng có hàng ACTIVE sẽ khiến resolver trả về bản cũ. Vì vậy luôn chốt
// vào đúng một phiên bản PUBLISHED mới nhất; nếu môn/khối chưa có phiên bản nào (dữ liệu legacy
// trước khi có versioning) thì chỉ dùng các hàng không gắn phiên bản. Không bao giờ trộn hai nguồn.
export async function effectiveCurriculumVersion(client, subject_id, grade) {
  const row = (await client.query(
    `SELECT id,version_code,published_at FROM curriculum_versions
     WHERE subject_id=$1 AND grade=$2 AND status='PUBLISHED'
     ORDER BY published_at DESC NULLS LAST, id DESC LIMIT 1`, [subject_id, grade])).rows[0];
  return row || null;
}

// Tra Outcome/YCCĐ trong đúng môn + khối + phiên bản hiệu lực. Cùng một mã nghiệp vụ (L.2.1) có thể
// tồn tại ở khối khác hoặc ở phiên bản chương trình khác, nên không bao giờ tra toàn cục bằng chuỗi mã.
export async function resolveCurriculumCode(client, {subject_id, grade, branch_code, outcome_number, yccd_number}) {
  const subject = (await client.query('SELECT id,code,name,code_letter FROM subjects WHERE id=$1', [subject_id])).rows[0];
  if (!subject) return {ok: false, error: 'SUBJECT_UNKNOWN', message: 'Môn không tồn tại'};
  // V6.6.7.4: chữ đầu mã phải là phân môn của môn (KHTN: L/H/S) hoặc chữ viết tắt của môn (Toán: T). Bắt lỗi chọn nhầm môn khi nhập.
  const branchLetters = (await client.query('SELECT code FROM branches WHERE subject_id=$1', [subject_id])).rows.map(r => branchCodeOf(r.code));
  const allowed = branchLetters.length ? [...new Set(branchLetters)] : subject.code_letter ? [subject.code_letter] : [];
  if (allowed.length && !allowed.includes(branch_code)) {
    return {ok: false, error: 'CODE_SUBJECT_MISMATCH', message: `Mã câu dùng chữ "${branch_code}" nhưng môn ${subject.name} dùng ${allowed.join(' / ')}. Kiểm tra lại môn đã chọn hoặc mã câu.`};
  }
  if (!grade) return {ok: false, error: 'GRADE_CONTEXT_MISSING', message: 'Thiếu khối; khối là ngữ cảnh của phiên nhập'};

  const version = await effectiveCurriculumVersion(client, subject_id, grade);
  const versionId = version?.id ?? null;
  const key = canonicalKey({subject_code: subject.code, grade, branch_code, outcome_number});
  const outcome = (await client.query(
    `SELECT * FROM curriculum_outcomes
     WHERE subject_id=$1 AND grade=$2 AND status='ACTIVE'
       AND ($6::int IS NULL AND curriculum_version_id IS NULL OR curriculum_version_id=$6)
       AND (canonical_key=$3 OR (COALESCE(source_branch_code,domain_code)=$4 AND source_ordinal=$5))
     ORDER BY (canonical_key=$3) DESC, id LIMIT 1`,
    [subject_id, grade, key, branch_code, outcome_number, versionId])).rows[0];
  if (!outcome) {
    const retired = await retiredMatch(client, 'outcome', {subject_id, grade, versionId, key, branch_code, outcome_number});
    if (retired) return retired;
    const where = version ? `bản chương trình ${version.version_code}` : 'bản chương trình hiện dùng';
    return {ok: false, error: 'OUTCOME_NOT_FOUND',
      message: `Không tìm thấy Outcome ${outcomeLabel(branch_code, outcome_number)} trong ${subject.name} khối ${grade} (${where})`};
  }

  const yccd = (await client.query(
    `SELECT * FROM curriculum_yccds
     WHERE outcome_id=$1 AND status='ACTIVE'
       AND (canonical_key=$2 OR source_ordinal=$3)
     ORDER BY (canonical_key=$2) DESC, id LIMIT 1`,
    [outcome.id, key + ':' + yccd_number, yccd_number])).rows[0];
  if (!yccd) {
    const retired = await retiredMatch(client, 'yccd', {outcomeId: outcome.id, key: key + ':' + yccd_number, yccd_number, branch_code, outcome_number});
    if (retired) return retired;
    return {ok: false, error: 'YCCD_NOT_FOUND',
      message: `Outcome ${outcomeLabel(branch_code, outcome_number)} không có YCCĐ số ${yccd_number}`};
  }

  // Phân môn của câu hỏi lấy từ branches theo mã nguồn, để khớp với validateCurriculum hiện có.
  const branch = (await client.query(
    `SELECT * FROM branches WHERE subject_id=$1
       AND (CASE code WHEN 'VL' THEN 'L' WHEN 'HH' THEN 'H' WHEN 'SH' THEN 'S' ELSE code END)=$2
     ORDER BY id LIMIT 1`, [subject_id, branch_code])).rows[0];

  return {
    ok: true,
    subject: {id: subject.id, code: subject.code, name: subject.name},
    grade,
    version: version ? {id: version.id, code: version.version_code} : null,
    branch: branch ? {id: branch.id, code: branch.code, name: branch.name} : null,
    outcome: {id: outcome.id, label: outcomeLabel(branch_code, outcome_number), title: outcome.title, code: outcome.code},
    yccd: {id: yccd.id, label: yccdLabel(branch_code, outcome_number, yccd_number), text: yccd.text, code: yccd.code},
  };
}

// Mã trỏ vào chuẩn đã ngừng dùng: chỉ đi theo quan hệ thay thế đã được khai báo tường minh
// (superseded_by hoặc curriculum_replacements), không bao giờ tìm "chuẩn gần giống" (§53).
// Luôn trả lỗi để người dùng xác nhận — ý nghĩa chuẩn có thể đã đổi.
async function retiredMatch(client, type, {subject_id, grade, versionId, key, branch_code, outcome_number, outcomeId, yccd_number}) {
  const table = type === 'outcome' ? 'curriculum_outcomes' : 'curriculum_yccds';
  const row = type === 'outcome'
    ? (await client.query(
      `SELECT * FROM curriculum_outcomes WHERE subject_id=$1 AND grade=$2 AND status='RETIRED'
         AND ($6::int IS NULL AND curriculum_version_id IS NULL OR curriculum_version_id=$6)
         AND (canonical_key=$3 OR (COALESCE(source_branch_code,domain_code)=$4 AND source_ordinal=$5))
       ORDER BY id DESC LIMIT 1`, [subject_id, grade, key, branch_code, outcome_number, versionId])).rows[0]
    : (await client.query(
      `SELECT * FROM curriculum_yccds WHERE outcome_id=$1 AND status='RETIRED' AND (canonical_key=$2 OR source_ordinal=$3)
       ORDER BY id DESC LIMIT 1`, [outcomeId, key, yccd_number])).rows[0];
  if (!row) return null;

  let replacementId = row.superseded_by || null;
  if (!replacementId) {
    replacementId = (await client.query(
      'SELECT replacement_id FROM curriculum_replacements WHERE entity_type=$1 AND original_id=$2 ORDER BY id DESC LIMIT 1',
      [type, row.id])).rows[0]?.replacement_id || null;
  }
  let replacement = null;
  if (replacementId) {
    const r = type === 'outcome'
      ? (await client.query(`SELECT id,title AS text,COALESCE(source_branch_code,domain_code) b,source_ordinal o,NULL::int y FROM ${table} WHERE id=$1 AND status='ACTIVE'`, [replacementId])).rows[0]
      : (await client.query(`SELECT y.id,y.text,COALESCE(o.source_branch_code,o.domain_code) b,o.source_ordinal o,y.source_ordinal y
                              FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id WHERE y.id=$1 AND y.status='ACTIVE'`, [replacementId])).rows[0];
    if (r) replacement = {id: r.id, label: r.y == null ? outcomeLabel(r.b, r.o) : yccdLabel(r.b, r.o, r.y), text: r.text};
  }
  const label = type === 'outcome' ? outcomeLabel(branch_code, outcome_number) : yccdLabel(branch_code, outcome_number, yccd_number);
  return {
    ok: false,
    error: type === 'outcome' ? 'OUTCOME_RETIRED' : 'YCCD_RETIRED',
    replacement,
    message: replacement
      ? `${type === 'outcome' ? 'Outcome' : 'YCCĐ'} ${label} đã ngừng dùng; chương trình khai báo thay thế bằng ${replacement.label}. Cần sửa mã câu sau khi xác nhận nội dung vẫn đúng.`
      : `${type === 'outcome' ? 'Outcome' : 'YCCĐ'} ${label} đã ngừng dùng và không có chuẩn thay thế được khai báo.`,
  };
}

// Sinh mã câu hiện hành từ phân loại đã lưu (§24, §67–68). Chỉ áp dụng cho phân môn L/H/S có số thứ tự
// nguồn; môn khác giữ cách đánh mã riêng. Trả null nếu không đủ dữ liệu — không bịa mã.
export async function codeForMetadata(client, {yccd_id, cognitive_level, type, content_number}) {
  if (!yccd_id || !cognitive_level || !type || !content_number) return null;
  const row = (await client.query(
    `SELECT COALESCE(o.source_branch_code,o.domain_code) AS branch, o.source_ordinal AS outcome_number, y.source_ordinal AS yccd_number
     FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id WHERE y.id=$1`, [yccd_id])).rows[0];
  if (!row || !['L', 'H', 'S'].includes(row.branch) || !row.outcome_number || !row.yccd_number) return null;
  const form = Object.entries(FORMS).find(([, t]) => t === type)?.[0];
  const level = ['NB', 'TH', 'VD', 'VDC'][Number(cognitive_level) - 1];
  if (!form || !level) return null;
  return buildDisplayCode({branch_code: row.branch, outcome_number: row.outcome_number, yccd_number: row.yccd_number,
    declared_level: level, content_number: Number(content_number), question_form: form});
}

// YCCĐ → Bài qua topic_yccd_map. Ba kết quả, không bao giờ đoán khi có nhiều Bài.
export async function resolveLesson(client, yccd_id, {subject_id, grade} = {}) {
  const rows = (await client.query(
    `SELECT t.id,t.name,t.chapter,t.grade FROM topic_yccd_map m
     JOIN topics t ON t.id=m.topic_id
     WHERE m.yccd_id=$1 AND m.status='ACTIVE' AND t.status='ACTIVE'
       AND (m.valid_from IS NULL OR m.valid_from<=CURRENT_DATE)
       AND (m.valid_to IS NULL OR m.valid_to>=CURRENT_DATE)
       AND ($2::int IS NULL OR t.subject_id=$2) AND ($3::int IS NULL OR t.grade=$3)
     ORDER BY t.order_index,t.id`,
    [yccd_id, subject_id ?? null, grade ?? null])).rows;

  if (!rows.length) return {status: 'UNMAPPED', topic_id: null, candidates: []};
  if (rows.length === 1) return {status: 'AUTO_MAPPED', topic_id: rows[0].id, topic: rows[0], candidates: rows};
  return {status: 'AMBIGUOUS', topic_id: null, candidates: rows};
}

// Đường đi đầy đủ cho một câu trong phiên nhập: mã câu + ngữ cảnh Môn/Khối → Outcome/YCCĐ → Bài.
// Chỉ trả dữ liệu; quyết định chặn hay cho qua thuộc về tầng import.
export async function resolveQuestionFromCode(client, rawCode, {subject_id, grade}) {
  const parsed = parseQuestionCode(rawCode);
  if (!parsed.ok) return {ok: false, stage: 'CODE', error: parsed.error, message: parsed.message, warnings: []};

  const code = parsed.value;
  const curriculum = await resolveCurriculumCode(client, {
    subject_id, grade, branch_code: code.branch_code,
    outcome_number: code.outcome_number, yccd_number: code.yccd_number,
  });
  if (!curriculum.ok) {
    return {ok: false, stage: 'CURRICULUM', error: curriculum.error, message: curriculum.message, replacement: curriculum.replacement || null, code, warnings: parsed.warnings};
  }

  const lesson = await resolveLesson(client, curriculum.yccd.id, {subject_id, grade});
  // Chưa có Bài nào được liên kết cho cả phân môn/khối này thì đó là thiếu dữ liệu nền, không phải lỗi
  // của người nhập (§66). Phân biệt để thông báo đúng người cần xử lý.
  if (lesson.status === 'UNMAPPED') {
    const linked = (await client.query(
      `SELECT count(*)::int n FROM topic_yccd_map m JOIN topics t ON t.id=m.topic_id
       JOIN curriculum_yccds y ON y.id=m.yccd_id JOIN curriculum_outcomes o ON o.id=y.outcome_id
       WHERE m.status='ACTIVE' AND t.subject_id=$1 AND t.grade=$2 AND COALESCE(o.source_branch_code,o.domain_code)=$3`,
      [subject_id, grade, code.branch_code])).rows[0].n;
    lesson.master_data_missing = linked === 0;
  }
  return {ok: true, code, curriculum, lesson, warnings: parsed.warnings};
}

const LEVEL_ORDER = ['NB', 'TH', 'VD', 'VDC'];

// Ghép kết quả resolve vào bản nháp câu hỏi.
//
// Trường còn trống thì điền theo mã. Trường người dùng đã khai mà khác mã thì GIỮ NGUYÊN giá trị đã
// khai và báo xung đột — hệ thống không chọn hộ bên nào; người dùng bấm "Theo mã" hoặc sửa mã (§32,
// §69). `code_values` là bộ giá trị theo mã để giao diện áp dụng khi người dùng chọn "Theo mã".
export function applyResolution(draft, resolution) {
  const {code, curriculum, lesson} = resolution;
  const codeValues = {
    outcome_id: curriculum.outcome.id,
    yccd_id: curriculum.yccd.id,
    type: FORMS[code.question_form],
    cognitive_level: LEVEL_ORDER.indexOf(code.declared_level) + 1,
  };
  const labels = {
    outcome_id: [curriculum.outcome.label, null],
    yccd_id: [curriculum.yccd.label, null],
    type: [code.question_form, null],
    cognitive_level: [code.declared_level, LEVEL_ORDER[Number(draft.cognitive_level) - 1] || null],
  };
  const conflicts = [];
  const next = {...draft};
  for (const [field, byCode] of Object.entries(codeValues)) {
    const declared = draft[field];
    const same = field === 'type' ? declared === byCode : Number(declared) === Number(byCode);
    if (declared != null && declared !== '' && !same) {
      conflicts.push({code: 'CODE_METADATA_CONFLICT', field, by_code: byCode, by_metadata: declared,
        by_code_label: labels[field][0], by_metadata_label: labels[field][1] ?? String(declared)});
    } else {
      next[field] = byCode;
    }
  }

  // Bài: một Bài thì tự gắn. Nhiều Bài thì chỉ giữ lựa chọn tay nếu nó thuộc danh sách ứng viên.
  // Chưa có Bài thì giữ lựa chọn tay (nếu có) nhưng vẫn báo là chưa liên kết trong dữ liệu nền.
  let topicId = null, lessonStatus = lesson.status;
  const manual = draft.topic_id ? Number(draft.topic_id) : null;
  if (lesson.status === 'AUTO_MAPPED') {
    topicId = lesson.topic_id;
  } else if (lesson.status === 'AMBIGUOUS') {
    if (manual && lesson.candidates.some(t => t.id === manual)) { topicId = manual; lessonStatus = 'MANUAL'; }
  } else if (manual) {
    topicId = manual; lessonStatus = 'MANUAL_UNLINKED';
  }

  Object.assign(next, {
    subject_id: curriculum.subject.id,
    grade: curriculum.grade,
    branch_id: curriculum.branch?.id ?? draft.branch_id ?? null,
    display_code: code.canonical_code,
    content_number: code.content_number,
    lesson_status: lessonStatus === 'MANUAL_UNLINKED' ? 'MANUAL' : lessonStatus,
    topic_id: topicId,
  });
  return {draft: next, conflicts, codeValues, lessonStatus};
}
