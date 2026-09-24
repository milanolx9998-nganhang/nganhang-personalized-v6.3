// Nhận lại Outcome / YCCĐ / Bài THEO MÃ cho câu đã nhập TRƯỚC khi máy chủ có dữ liệu chương trình (V6.6.7.1).
//
// Tình huống: câu được nhập với mã "Câu L. 2. 1. NB. 3. TN" khi database chưa có Outcome/YCCĐ, nên câu có mã
// nhưng yccd_id rỗng. Sau khi nạp chương trình (giao diện Chuẩn đầu ra), chạy script này để đọc lại mã y như
// lúc nhập Word: cùng resolver, cùng applyResolution, lưu qua persistQuestion (giữ phiên bản + nhật ký).
//
//   cd backend
//   node scripts/reresolve-question-codes.mjs [--subject KHTN] [--grade 9] [--json]              # CHẠY THỬ (mặc định)
//   node scripts/reresolve-question-codes.mjs --apply --actor <tên đăng nhập admin> [...]          # ghi thật
//
// An toàn:
// - Chỉ xét câu có mã đúng cấu trúc, yccd_id rỗng, chưa lưu trữ, và bản hiện hành đang DRAFT. Câu đã duyệt /
//   chờ duyệt không bao giờ bị đụng (sửa chúng sẽ đưa câu về nháp) — chỉ được đếm vào skipped_not_draft.
// - Mã lệch với mức / dạng đã khai → bỏ qua (CODE_METADATA_CONFLICT) để người xem, không ghi đè.
// - Chạy thử = làm thật trong transaction rồi ROLLBACK, nên lỗi lưu nào cũng lộ ra trước khi ghi.
// - Ghi thật: mỗi câu một savepoint; câu lỗi được hoàn lại, câu khác vẫn ghi; có dòng practice_audit tổng kết.
// - Không in nội dung câu hỏi / đáp án; chỉ in id, mã và lý do.
import 'dotenv/config';
import {pool, dryRun, tx} from '../src/db/pool.js';
import {resolveQuestionFromCode, applyResolution} from '../src/services/curriculumResolver.js';
import {persistQuestion, CHECK_SQL} from '../src/services/practice/questions.js';
import {getEffectiveAccess, attachAccess} from '../src/services/accessResolver.js';
import {capabilitySummary} from '../src/services/capabilities.js';
import {log} from '../src/services/practice/config.js';

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const apply = flag('--apply');
const asJson = flag('--json');
const actorName = value('--actor');
const subjectFilter = value('--subject');
const gradeFilter = value('--grade') ? Number(value('--grade')) : null;

async function loadActor(client, username) {
  const row = (await client.query('SELECT id,username,full_name,role,subject_id,department_id,token_version,must_change_password FROM users WHERE username=$1 AND is_active=true', [username])).rows[0];
  if (!row) throw new Error('Không tìm thấy tài khoản đang hoạt động: ' + username);
  if (row.role !== 'admin') throw new Error('Tài khoản thực hiện phải là admin');
  return attachAccess({...row, ...await capabilitySummary(row)}, await getEffectiveAccess(row));
}

async function run(client) {
  // Chạy thử không cần nêu --actor: mượn admin đầu tiên chỉ để mô phỏng quyền, rồi ROLLBACK.
  let username = actorName;
  if (!username) {
    username = (await client.query("SELECT username FROM users WHERE role='admin' AND is_active=true ORDER BY id LIMIT 1")).rows[0]?.username;
    if (!username) throw new Error('Không có tài khoản admin để chạy thử');
  }
  const actor = await loadActor(client, username);
  const params = [];
  const filters = [];
  if (subjectFilter) { params.push(subjectFilter); filters.push(`s.code=$${params.length}`); }
  if (gradeFilter) { params.push(gradeFilter); filters.push(`q.grade=$${params.length}`); }
  const rows = (await client.query(`SELECT q.id, q.subject_id, q.grade, q.topic_id, q.current_version_id, q.normalized_content, v.content AS version_content,
      v.review_status, COALESCE(q.normalized_content->>'display_code','') AS display_code
    FROM questions q JOIN subjects s ON s.id=q.subject_id LEFT JOIN question_versions v ON v.id=q.current_version_id
    WHERE ${CHECK_SQL.coded} AND q.yccd_id IS NULL AND q.lifecycle<>'archived' ${filters.length ? 'AND ' + filters.join(' AND ') : ''}
    ORDER BY q.id`, params)).rows;

  const summary = {mode: apply ? 'APPLY' : 'DRY_RUN', actor: actor.username, candidates: rows.length, resolved: 0, applied: 0,
    lesson_auto: 0, lesson_unmapped: 0, lesson_ambiguous: 0, skipped_not_draft: 0, conflicts: 0, not_resolved: 0, save_failed: 0,
    by_error: {}, examples: []};
  const example = (id, code, reason) => { if (summary.examples.length < 30) summary.examples.push({question_id: id, code, reason}); };

  for (const row of rows) {
    if (row.review_status !== 'DRAFT') { summary.skipped_not_draft++; example(row.id, row.display_code, 'NOT_DRAFT:' + (row.review_status || 'NO_VERSION')); continue; }
    const resolution = await resolveQuestionFromCode(client, row.display_code, {subject_id: row.subject_id, grade: row.grade});
    if (!resolution.ok) {
      summary.not_resolved++;
      const key = resolution.error || resolution.stage || 'UNKNOWN';
      summary.by_error[key] = (summary.by_error[key] || 0) + 1;
      example(row.id, row.display_code, key);
      continue;
    }
    summary.resolved++;
    const content = row.normalized_content || row.version_content || {};
    const {draft, conflicts, lessonStatus} = applyResolution({...content, subject_id: row.subject_id, grade: row.grade, topic_id: row.topic_id ?? content.topic_id ?? null}, resolution);
    if (conflicts.length) {
      summary.conflicts++;
      example(row.id, row.display_code, 'CODE_METADATA_CONFLICT:' + conflicts.map(c => c.field).join(','));
      continue;
    }
    if (lessonStatus === 'AUTO_MAPPED') summary.lesson_auto++;
    else if (lessonStatus === 'AMBIGUOUS') summary.lesson_ambiguous++;
    else summary.lesson_unmapped++;
    await client.query('SAVEPOINT reresolve_item');
    try {
      await persistQuestion(client, actor, {...draft, question_version_id: row.current_version_id,
        change_reason: 'Nhận lại Outcome/YCCĐ/Bài theo mã câu sau khi nạp chương trình'}, {id: row.id});
      await client.query('RELEASE SAVEPOINT reresolve_item');
      summary.applied++;
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT reresolve_item');
      await client.query('RELEASE SAVEPOINT reresolve_item');
      summary.save_failed++;
      summary.by_error[e.details?.code || 'SAVE_FAILED'] = (summary.by_error[e.details?.code || 'SAVE_FAILED'] || 0) + 1;
      example(row.id, row.display_code, 'SAVE_FAILED:' + String(e.message).slice(0, 160));
    }
  }
  if (apply && summary.applied) await log(client, actor, 'QUESTION_CODE_RERESOLVE', 'bulk', {...summary, examples: undefined});
  return summary;
}

let summary;
try {
  if (apply && !actorName) throw new Error('--apply cần --actor <tên đăng nhập admin>');
  summary = apply ? await tx(run) : await dryRun(run);
} catch (e) {
  console.error('Dừng:', e.message);
  await pool.end().catch(() => {});
  process.exit(2);
}
await pool.end();

if (asJson) console.log(JSON.stringify(summary, null, 2));
else {
  console.log(`== Nhận lại theo mã · ${summary.mode === 'APPLY' ? 'ĐÃ GHI' : 'CHẠY THỬ (không ghi gì)'} · người thực hiện: ${summary.actor} ==`);
  console.log({...summary, examples: undefined, by_error: undefined});
  if (Object.keys(summary.by_error).length) console.log('Lý do chưa nhận được:', summary.by_error);
  if (summary.examples.length) console.table(summary.examples);
  if (summary.mode === 'DRY_RUN') console.log('\nChạy thật: node scripts/reresolve-question-codes.mjs --apply --actor <admin> (cùng bộ lọc).');
}
