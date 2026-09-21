import {requireCapability,contentFilterSQL,can} from '../services/accessResolver.js';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { auth, requireRole, getSubjectFilter, getSubjectFilterSQL } from '../middleware/auth.js';

import {bankFilter} from '../middleware/bankScope.js';
async function questionScope(user){const params=[],sql=await contentFilterSQL(user,'q',params);return {params,sql:sql+' AND '+bankFilter(user,'q',params)};}
const r = Router();
r.use(auth);

// Dashboard tổng quan — PHÂN QUYỀN THEO MÔN
r.get('/dashboard', async (req, res, next) => {
  try {
    const qs=await questionScope(req.user),mp=[],ms=await contentFilterSQL(req.user,'m',mp,'matrix.read'),ep=[],es=await contentFilterSQL(req.user,'m',ep,'exam.read');
    const [q,m,e,u,pending]=await Promise.all([
      pool.query('SELECT status,COUNT(*)::int AS n FROM questions q WHERE '+qs.sql+' GROUP BY status',qs.params),
      pool.query('SELECT count(*)::int AS n FROM matrix_templates m WHERE '+ms,mp),
      pool.query('SELECT count(*)::int AS n FROM exam_runs er JOIN matrix_templates m ON m.id=er.matrix_id WHERE '+es,ep),
      req.user.capabilities?.['staff.read']?pool.query('SELECT count(*)::int AS n FROM users WHERE is_active'):{rows:[{n:null}]},
      pool.query("SELECT count(*)::int AS n FROM questions q WHERE "+qs.sql+" AND status='Mới tạo'",qs.params)
    ]);
    const qByStatus = {};
    for (const row of q.rows) qByStatus[row.status] = row.n;
    res.json({
      questions_by_status: qByStatus,
      questions_total: Object.values(qByStatus).reduce((a, b) => a + b, 0),
      pending_review: pending.rows[0].n,
      matrices_total: m.rows[0].n,
      exams_total: e.rows[0].n,
      active_users: u.rows[0].n,
    });
  } catch (err) { next(err); }
});

// Thống kê câu hỏi theo môn/khối — PHÂN QUYỀN THEO MÔN
r.get('/questions/stats', async (req, res, next) => {
  try {
    const qs=await questionScope(req.user),filterClause='WHERE '+qs.sql,filterParams=qs.params;

    const { rows } = await pool.query(`
      SELECT s.code, s.name, q.grade, q.cognitive_level, q.q_type, COUNT(*)::int AS n
      FROM questions q
      JOIN subjects s ON s.id = q.subject_id
      ${filterClause}
      GROUP BY s.code, s.name, q.grade, q.cognitive_level, q.q_type
      ORDER BY s.code, q.grade, q.cognitive_level
    `, filterParams);
    res.json(rows);
  } catch (err) { next(err); }
});

// Top câu hỏi dùng nhiều — PHÂN QUYỀN THEO MÔN
r.get('/questions/top-used', async (req, res, next) => {
  try {
    const qs=await questionScope(req.user),filterClause='WHERE q.usage_count>0 AND '+qs.sql,filterParams=qs.params;

    const { rows } = await pool.query(`
      SELECT q.id, q.question_code, q.stem_text, q.usage_count, s.name AS subject_name
      FROM questions q
      LEFT JOIN subjects s ON s.id = q.subject_id
      ${filterClause}
      ORDER BY q.usage_count DESC LIMIT 50
    `, filterParams);
    res.json(rows);
  } catch (err) { next(err); }
});

// Sức khỏe kho — PHÂN QUYỀN THEO MÔN
r.get('/health', async (req, res, next) => {
  try {
    const qs=await questionScope(req.user),fClause='AND '+qs.sql,fParams=qs.params;

    // 1. Tổng quan trạng thái
    const { rows: statusRows } = await pool.query(`
      SELECT status, COUNT(*)::int AS n FROM questions q WHERE 1=1 ${fClause} GROUP BY status
    `, fParams);
    const statusMap = {};
    let total = 0;
    for (const r of statusRows) { statusMap[r.status] = r.n; total += r.n; }

    // 2. Coverage matrix: subject × grade × level → count
    const { rows: coverageRows } = await pool.query(`
      SELECT s.name AS subject_name, q.grade, q.cognitive_level,
             q.q_type, COUNT(*)::int AS n
      FROM questions q
      JOIN subjects s ON s.id = q.subject_id
      WHERE 1=1 ${fClause.replace(/q\.subject_id/g, 'q.subject_id')}
      GROUP BY s.name, q.grade, q.cognitive_level, q.q_type
      ORDER BY s.name, q.grade, q.cognitive_level
    `, fParams);

    // 3. Score: tính điểm dựa trên tỉ lệ duyệt + phủ kho
    const approved = (statusMap['Đã duyệt'] || 0) + (statusMap['Đã sử dụng'] || 0);
    const reviewed = statusMap['Đã rà soát'] || 0;
    const draft = statusMap['Mới tạo'] || 0;
    const hidden = statusMap['Tạm ẩn'] || 0;

    // Score = 40% tỉ lệ duyệt + 30% tỉ lệ rà soát + 30% (1 - tỉ lệ ẩn)
    const score = total > 0
      ? Math.round((approved / total) * 40 + ((approved + reviewed) / total) * 30 + ((total - hidden) / total) * 30)
      : 0;

    let grade = 'A';
    if (score < 50) grade = 'D';
    else if (score < 70) grade = 'C';
    else if (score < 85) grade = 'B';

    // 4. Thiếu câu: môn/lớp nào chưa đủ 4 mức độ × 4 dạng
    const { rows: subjectGrades } = await pool.query(`
      SELECT s.name AS subject_name, q.grade,
             COUNT(DISTINCT q.cognitive_level)::int AS level_count,
             COUNT(DISTINCT q.q_type)::int AS type_count,
             COUNT(*)::int AS n
      FROM questions q
      JOIN subjects s ON s.id = q.subject_id
      WHERE 1=1 ${fClause}
      GROUP BY s.name, q.grade
      ORDER BY s.name, q.grade
    `, fParams);

    res.json({
      score, grade, total,
      status: statusMap,
      coverage: coverageRows,
      by_subject_grade: subjectGrades,
    });
  } catch (err) { next(err); }
});

// Lỗ hổng (Coverage Gaps)
r.get('/gaps', async (req, res, next) => {
  try {
    const subjectIds = await getSubjectFilter(req.user);
    let fClause = '';
    let fParams = [];
    if (subjectIds !== null) {
      fClause = 'WHERE s.id=ANY($1::int[])';
      fParams = [subjectIds];
    }

    // Lấy tất cả môn × lớp mà user có quyền
    const { rows: subjects } = await pool.query(`
      SELECT s.id, s.code, s.name FROM subjects s ${fClause} ORDER BY s.id
    `, fParams);

    const LEVELS = ['M1', 'M2', 'M3', 'M4'];
    const TYPES  = ['mcq4', 'true_false', 'short', 'essay'];
    const MIN_PER_CELL = 3; // Tối thiểu 3 câu/ô mới "đủ"
    const gaps = [];

    for (const sub of subjects) {
      // Tìm grades có dữ liệu hoặc có topic
      const { rows: gradeRows } = await pool.query(`
        SELECT DISTINCT grade FROM (
          SELECT grade FROM questions WHERE subject_id = $1
          UNION
          SELECT grade FROM topics WHERE subject_id = $1
        ) t ORDER BY grade
      `, [sub.id]);

      for (const gr of gradeRows) {
        if(!await can(req.user,'content.read',{subjectId:sub.id,grade:gr.grade}))continue;
        const cp=[sub.id,gr.grade],cs=await contentFilterSQL(req.user,'q',cp),cb=bankFilter(req.user,'q',cp);
        const { rows: counts } = await pool.query(`
          SELECT cognitive_level, q_type, COUNT(*)::int AS n
          FROM questions q
          WHERE subject_id = $1 AND grade = $2 AND ${cs} AND ${cb}
          GROUP BY cognitive_level, q_type
        `, cp);

        const countMap = {};
        for (const c of counts) countMap[`${c.cognitive_level}_${c.q_type}`] = c.n;

        for (const lv of LEVELS) {
          for (const tp of TYPES) {
            const n = countMap[`${lv}_${tp}`] || 0;
            if (n < MIN_PER_CELL) {
              gaps.push({
                subject_name: sub.name,
                subject_code: sub.code,
                grade: gr.grade,
                cognitive_level: lv,
                q_type: tp,
                current: n,
                needed: MIN_PER_CELL,
                deficit: MIN_PER_CELL - n,
              });
            }
          }
        }
      }
    }

    // Sắp xếp: thiếu nhiều nhất lên đầu
    gaps.sort((a, b) => b.deficit - a.deficit || a.subject_name.localeCompare(b.subject_name));

    res.json({
      total_gaps: gaps.length,
      min_per_cell: MIN_PER_CELL,
      gaps: gaps.slice(0, 200),
    });
  } catch (err) { next(err); }
});

// Trùng lặp (Duplicate Detection)
r.get('/duplicates', async (req, res, next) => {
  try {
    const qs=await questionScope(req.user),sf={params:qs.params};
    const subjectWhere='WHERE '+qs.sql;

    // Tìm câu hỏi trùng: so sánh stem + options + đáp án (toàn bộ nội dung)
    const { rows } = await pool.query(`
      SELECT TRIM(LOWER(
               COALESCE(q.stem_text,'') || '||' ||
               COALESCE(q.option_a,'') || '||' ||
               COALESCE(q.option_b,'') || '||' ||
               COALESCE(q.option_c,'') || '||' ||
               COALESCE(q.option_d,'') || '||' ||
               COALESCE(q.answer_key,'')
             )) AS norm_full,
             TRIM(LOWER(q.stem_text)) AS norm_stem,
             COUNT(*)::int AS dup_count,
             ARRAY_AGG(q.id ORDER BY q.id) AS ids,
             ARRAY_AGG(q.question_code ORDER BY q.id) AS codes,
             MIN(s.name) AS subject_name,
             MIN(q.grade)::int AS grade
      FROM questions q
      LEFT JOIN subjects s ON s.id = q.subject_id
      ${subjectWhere}
      GROUP BY norm_full, norm_stem
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 100
    `, sf.params);

    res.json({
      total_groups: rows.length,
      total_duplicates: rows.reduce((acc, r) => acc + r.dup_count - 1, 0),
      groups: rows.map(r => ({
        stem_preview: r.norm_stem.slice(0, 120),
        count: r.dup_count,
        ids: r.ids,
        codes: r.codes,
        subject_name: r.subject_name,
        grade: r.grade,
      })),
    });
  } catch (err) { next(err); }
});

// Audit log
r.get('/audit', requireCapability('audit.read'), async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const { rows } = await pool.query(
      `SELECT a.*, u.username, u.full_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

export default r;
