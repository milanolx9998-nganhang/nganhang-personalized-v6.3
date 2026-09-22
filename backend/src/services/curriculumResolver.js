import {pool} from '../db/pool.js';
import {parseQuestionCode, canonicalKey, outcomeLabel, yccdLabel, FORMS} from './questionCode.js';

// Mã câu quyết định Outcome/YCCĐ. Nó KHÔNG quyết định Bài.
// Bài chỉ đến từ topic_yccd_map (Bài ↔ YCCĐ), vì "Bài 2" và "Outcome 2" là hai hệ khác nhau.

const BRANCH_ALIASES = {VL: 'L', HH: 'H', SH: 'S'};
export const branchCodeOf = code => BRANCH_ALIASES[code] || code;

// Tra Outcome/YCCĐ trong đúng môn + khối. Cùng một mã nghiệp vụ (L.2.1) có thể tồn tại ở khối khác,
// nên không bao giờ tra toàn cục chỉ bằng chuỗi mã.
export async function resolveCurriculumCode(client, {subject_id, grade, branch_code, outcome_number, yccd_number}) {
  const subject = (await client.query('SELECT id,code,name FROM subjects WHERE id=$1', [subject_id])).rows[0];
  if (!subject) return {ok: false, error: 'SUBJECT_UNKNOWN', message: 'Môn không tồn tại'};
  if (!grade) return {ok: false, error: 'GRADE_CONTEXT_MISSING', message: 'Thiếu khối; khối là ngữ cảnh của phiên nhập'};

  const key = canonicalKey({subject_code: subject.code, grade, branch_code, outcome_number});
  const outcome = (await client.query(
    `SELECT * FROM curriculum_outcomes
     WHERE subject_id=$1 AND grade=$2 AND status='ACTIVE'
       AND (canonical_key=$3 OR (COALESCE(source_branch_code,domain_code)=$4 AND source_ordinal=$5))
     ORDER BY (canonical_key=$3) DESC, id LIMIT 1`,
    [subject_id, grade, key, branch_code, outcome_number])).rows[0];
  if (!outcome) {
    return {ok: false, error: 'OUTCOME_NOT_FOUND',
      message: `Không tìm thấy Outcome ${outcomeLabel(branch_code, outcome_number)} trong ${subject.name} khối ${grade}`};
  }

  const yccd = (await client.query(
    `SELECT * FROM curriculum_yccds
     WHERE outcome_id=$1 AND status='ACTIVE'
       AND (canonical_key=$2 OR source_ordinal=$3)
     ORDER BY (canonical_key=$2) DESC, id LIMIT 1`,
    [outcome.id, key + ':' + yccd_number, yccd_number])).rows[0];
  if (!yccd) {
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
    branch: branch ? {id: branch.id, code: branch.code, name: branch.name} : null,
    outcome: {id: outcome.id, label: outcomeLabel(branch_code, outcome_number), title: outcome.title, code: outcome.code},
    yccd: {id: yccd.id, label: yccdLabel(branch_code, outcome_number, yccd_number), text: yccd.text, code: yccd.code},
  };
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
    return {ok: false, stage: 'CURRICULUM', error: curriculum.error, message: curriculum.message, code, warnings: parsed.warnings};
  }

  const lesson = await resolveLesson(client, curriculum.yccd.id, {subject_id, grade});
  return {ok: true, code, curriculum, lesson, warnings: parsed.warnings};
}

// Ghép kết quả resolve vào bản nháp câu hỏi. Metadata do người dùng khai vẫn được giữ để so sánh —
// mã và metadata lệch nhau thì tầng import báo "cần xem", không tự chọn bên nào (§32).
const LEVEL_ORDER = ['NB', 'TH', 'VD', 'VDC'];

export function applyResolution(draft, resolution) {
  const {code, curriculum, lesson} = resolution;
  const conflicts = [];
  for (const [field, resolved] of [['outcome_id', curriculum.outcome.id], ['yccd_id', curriculum.yccd.id]]) {
    const declared = draft[field];
    if (declared && Number(declared) !== Number(resolved)) {
      conflicts.push({code: 'CODE_METADATA_CONFLICT', field, by_code: resolved, by_metadata: Number(declared)});
    }
  }
  // Hình thức và mức độ cũng nằm trong mã. Lệch nhau là việc người dùng phải quyết, không phải việc
  // hệ thống chọn hộ — nên chỉ báo, không ghi đè giá trị đã khai.
  const codeType = FORMS[code.question_form];
  if (draft.type && draft.type !== codeType) {
    conflicts.push({code: 'CODE_METADATA_CONFLICT', field: 'type', by_code: codeType, by_metadata: draft.type});
  }
  const codeLevel = LEVEL_ORDER.indexOf(code.declared_level) + 1;
  if (draft.cognitive_level && Number(draft.cognitive_level) !== codeLevel) {
    conflicts.push({code: 'CODE_METADATA_CONFLICT', field: 'cognitive_level', by_code: code.declared_level, by_metadata: LEVEL_ORDER[Number(draft.cognitive_level) - 1] || draft.cognitive_level});
  }
  const next = {
    ...draft,
    subject_id: curriculum.subject.id,
    grade: curriculum.grade,
    branch_id: curriculum.branch?.id ?? draft.branch_id ?? null,
    outcome_id: curriculum.outcome.id,
    yccd_id: curriculum.yccd.id,
    display_code: code.canonical_code,
    type: draft.type || FORMS[code.question_form],
    cognitive_level: draft.cognitive_level || ['NB', 'TH', 'VD', 'VDC'].indexOf(code.declared_level) + 1,
    content_number: code.content_number,
    lesson_status: lesson.status,
    topic_id: lesson.status === 'AUTO_MAPPED' ? lesson.topic_id : draft.topic_id ?? null,
  };
  return {draft: next, conflicts};
}
