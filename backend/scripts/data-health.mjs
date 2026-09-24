// Báo cáo sức khỏe dữ liệu sau deploy (V6.6.7.1). CHỈ ĐỌC — không ghi, không sửa gì trong database.
//
//   cd backend && node scripts/data-health.mjs            (bản đọc cho người)
//   cd backend && node scripts/data-health.mjs --json     (bản máy đọc)
//
// Mã thoát: 0 = không có lỗi chặn; 3 = migration chưa chạy hoặc đã bị sửa sau khi chạy (phải xử lý trước);
// 2 = không kết nối được database. Các mục "cần người xem" (câu lệch mã, chưa gắn Bài…) không làm thoát lỗi.
// Không in mật khẩu, token, nội dung câu hỏi hay đáp án — chỉ số đếm và mã.
import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {pool} from '../src/db/pool.js';
import {CHECK_SQL, EXCEPTION_SQL, QUESTION_FROM} from '../src/services/practice/questions.js';

const asJson = process.argv.includes('--json');
const report = {version: null, migrations: {}, schema: {}, questions: {}, lessons: {}, curriculum: [], review_cases: [], edit_operations: {}, temp_databases: 0, blocking: [], attention: []};
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

try {
  report.version = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

  // ---- Migration: so danh sách trong upgrade.js với app_migrations (tên + checksum) ----
  const upgrade = fs.readFileSync(new URL('../src/db/upgrade.js', import.meta.url), 'utf8');
  const listed = [...(upgrade.match(/const files=\[([^\]]*)\]/)?.[1].matchAll(/'([^']+\.sql)'/g) || [])].map(m => m[1]);
  for (const m of upgrade.matchAll(/files\.push\('([^']+\.sql)'\)/g)) listed.push(m[1]);
  const applied = new Map((await q("SELECT name,checksum FROM app_migrations")).map(r => [r.name, r.checksum]));
  const pending = [], changed = [];
  for (const name of listed) {
    const sum = crypto.createHash('sha256').update(fs.readFileSync(new URL('../src/db/' + name, import.meta.url), 'utf8')).digest('hex');
    if (!applied.has(name)) pending.push(name);
    else if (applied.get(name) !== sum) changed.push(name);
  }
  report.migrations = {expected: listed.length, applied: applied.size, pending, changed_after_apply: changed};
  if (pending.length) report.blocking.push(`Migration chưa chạy: ${pending.join(', ')} → chạy "npm run migrate" (sau khi backup).`);
  if (changed.length) report.blocking.push(`Migration đã bị sửa sau khi chạy: ${changed.join(', ')} → DỪNG, không tự sửa; báo người phụ trách.`);

  // ---- Bảng / index các bản V6.6.x cần ----
  const exists = async (kind, name) => (await q(kind === 'table' ? 'SELECT to_regclass($1) IS NOT NULL AS ok' : 'SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE indexname=$1) AS ok', [name]))[0].ok;
  report.schema = {
    question_edit_operations: await exists('table', 'public.question_edit_operations'),
    questions_creator_created_idx: await exists('index', 'questions_creator_created_idx'),
    import_items_job_result_idx: await exists('index', 'import_items_job_result_idx'),
  };
  for (const [k, ok] of Object.entries(report.schema)) if (!ok) report.blocking.push(`Thiếu ${k} → "npm run migrate".`);

  // ---- Câu hỏi: trạng thái + kiểm tra máy (cùng công thức với màn Duyệt) ----
  report.questions.by_lifecycle = await q(`SELECT q.lifecycle, count(*)::int AS n FROM questions q GROUP BY 1 ORDER BY 2 DESC`);
  report.questions.by_review_status = await q(`SELECT COALESCE(v.review_status,'(không có phiên bản)') AS status, count(*)::int AS n ${QUESTION_FROM} GROUP BY 1 ORDER BY 2 DESC`);
  const groups = Object.entries(EXCEPTION_SQL).map(([k, sql]) => `count(*) FILTER (WHERE ${sql})::int AS ${k}`).join(',');
  report.questions.exception_groups = (await q(`SELECT count(*)::int AS total, ${groups} ${QUESTION_FROM}`))[0];
  report.questions.code_check_failed = (await q(`SELECT count(*)::int AS n ${QUESTION_FROM} WHERE NOT ${CHECK_SQL.code}`))[0].n;
  if (report.questions.code_check_failed) report.attention.push(`${report.questions.code_check_failed} câu có mã lệch phân loại (gồm lệch phân môn L/H/S) → màn Duyệt, nhóm "Lỗi metadata". Không tự sửa mã.`);

  // ---- Gắn Bài: câu có YCCĐ nhưng chưa có Bài; bao nhiêu câu có đúng MỘT Bài hợp lệ ----
  report.lessons = (await q(`WITH c AS (
      SELECT q.id, (SELECT count(*) FROM topic_yccd_map m JOIN topics t ON t.id=m.topic_id
                    WHERE m.yccd_id=q.yccd_id AND m.status='ACTIVE' AND t.status='ACTIVE' AND t.subject_id=q.subject_id AND t.grade=q.grade) AS options
      FROM questions q WHERE q.yccd_id IS NOT NULL AND q.topic_id IS NULL AND q.lifecycle<>'archived')
    SELECT count(*)::int AS missing, count(*) FILTER (WHERE options=1)::int AS one_lesson, count(*) FILTER (WHERE options>1)::int AS several,
           count(*) FILTER (WHERE options=0)::int AS no_lesson FROM c`))[0];
  if (report.lessons.missing) report.attention.push(`${report.lessons.missing} câu có YCCĐ nhưng chưa gắn Bài (${report.lessons.one_lesson} câu chỉ có 1 Bài hợp lệ, ${report.lessons.several} câu nhiều Bài, ${report.lessons.no_lesson} câu chưa có Bài nào) → giáo viên dùng "Chưa gắn Bài" + "Gán Bài hàng loạt". Không gán bằng SQL: sửa câu đã duyệt sẽ đưa câu về nháp.`);

  // ---- Chương trình: môn/khối có YCCĐ nhưng chưa có liên kết Bài ----
  report.curriculum = await q(`SELECT s.code AS subject, o.grade, count(DISTINCT y.id)::int AS yccd,
      count(DISTINCT m.yccd_id) FILTER (WHERE m.status='ACTIVE')::int AS yccd_linked,
      (SELECT count(*)::int FROM topics t WHERE t.subject_id=s.id AND t.grade=o.grade AND t.status='ACTIVE') AS lessons
    FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id JOIN subjects s ON s.id=o.subject_id
    LEFT JOIN topic_yccd_map m ON m.yccd_id=y.id
    WHERE y.status='ACTIVE' AND o.status='ACTIVE' GROUP BY s.id, s.code, o.grade ORDER BY s.code, o.grade`);
  for (const r of report.curriculum) if (r.yccd && !r.yccd_linked) report.attention.push(`${r.subject} khối ${r.grade}: ${r.yccd} YCCĐ nhưng chưa có liên kết Bài nào → câu theo mã không tự gắn Bài được (KHTN 7: chạy seed:khtn7-lessons).`);

  // ---- Hồ sơ rà soát đang mở ----
  report.review_cases = await q(`SELECT reason_code, severity, count(*)::int AS n FROM question_review_cases WHERE status IN('OPEN','IN_REVIEW') GROUP BY 1,2 ORDER BY 3 DESC`);

  // ---- Thao tác hoàn tác: app tự dọn bản hết hạn > 30 ngày khi khởi động / mỗi ngày ----
  if (report.schema.question_edit_operations) {
    report.edit_operations = (await q(`SELECT count(*)::int AS total, count(*) FILTER (WHERE expires_at < now() - interval '30 days')::int AS prunable FROM question_edit_operations`))[0];
    if (report.edit_operations.prunable) report.attention.push(`${report.edit_operations.prunable} thao tác hoàn tác quá hạn chưa được dọn → kiểm log khởi động ("Không dọn được thao tác hoàn tác cũ").`);
  }

  // ---- Database tạm của test còn sót trên cụm Postgres ----
  report.temp_databases = (await q(`SELECT count(*)::int AS n FROM pg_database WHERE datname ~ '^nganhang_[a-z0-9]+(_test)?_[0-9]{10,}$'`))[0].n;
  if (report.temp_databases) report.attention.push(`${report.temp_databases} database tạm của test còn sót → "node ../scripts/cleanup-test-databases.mjs" (xem trước), --apply chỉ khi người phụ trách đồng ý.`);
} catch (e) {
  console.error('Không đọc được database:', e.message);
  await pool.end().catch(() => {});
  process.exit(2);
}
await pool.end();

if (asJson) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`== Sức khỏe dữ liệu · mã ${report.version} ==`);
  console.log('Migration:', {expected: report.migrations.expected, applied: report.migrations.applied, pending: report.migrations.pending.length, changed: report.migrations.changed_after_apply.length});
  console.log('Schema V6.6.x:', report.schema);
  console.log('Nhóm ngoại lệ (toàn kho):', report.questions.exception_groups);
  console.log('Gắn Bài:', report.lessons);
  console.table(report.curriculum);
  if (report.review_cases.length) console.table(report.review_cases);
  console.log('Thao tác hoàn tác:', report.edit_operations, '· DB tạm của test:', report.temp_databases);
  console.log('\n== CHẶN (phải xử lý) ==');
  for (const b of report.blocking) console.log('- ' + b);
  if (!report.blocking.length) console.log('- (không có)');
  console.log('== CẦN NGƯỜI XEM ==');
  for (const a of report.attention) console.log('- ' + a);
  if (!report.attention.length) console.log('- (không có)');
}
process.exit(report.blocking.length ? 3 : 0);
