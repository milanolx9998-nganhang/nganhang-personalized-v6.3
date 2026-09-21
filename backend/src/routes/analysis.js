import {can,requireAnyCapability} from '../services/accessResolver.js';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { auth, requireRole, checkSubjectAccess, getSubjectFilterSQL } from '../middleware/auth.js';
import {bankFilter} from '../middleware/bankScope.js';
import { audit } from '../utils/audit.js';
import { analyzeExamRun } from '../services/itemAnalysis.js';

const r = Router();
r.use(auth);

// Import kết quả trả lời HS cho 1 đợt thi
r.post('/exams/:runId/import-responses', requireAnyCapability('exam.create'), async (req, res, next) => {
  try {
    const runId = parseInt(req.params.runId, 10);

    // Kiểm tra exam_run tồn tại + subject access
    const { rows: runRows } = await pool.query(
      `SELECT er.id, m.subject_id,m.grade FROM exam_runs er
       LEFT JOIN matrix_templates m ON m.id = er.matrix_id
       WHERE er.id = $1`, [runId]
    );
    if (!runRows.length) return res.status(404).json({ error: 'Không tìm thấy đợt thi' });
    if (runRows[0].subject_id) {
      const ok = await can(req.user,'exam.create',{subjectId:runRows[0].subject_id,grade:runRows[0].grade});
      if (!ok) return res.status(403).json({ error: 'Không có quyền' });
    }

    // Body: { responses: [{ student_code, exam_code, question_id, selected_answer }] }
    const { responses } = z.object({
      responses: z.array(z.object({
        student_code: z.string().min(1).max(50),
        exam_code: z.string().min(1).max(20),
        question_id: z.number().int().positive(),
        selected_answer: z.string().max(20),
      })).min(1).max(10000),
    }).parse(req.body);

    // Lấy answer_key cho tất cả câu hỏi liên quan
    const qIds = [...new Set(responses.map(r => r.question_id))];
    const placeholders = qIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows: questions } = await pool.query(
      `SELECT id, answer_key, score FROM questions WHERE id IN (${placeholders}) AND EXISTS(SELECT 1 FROM exam_items ei WHERE ei.run_id=${qIds.length+1} AND ei.question_id=questions.id)`,
      [...qIds,runId]
    );
    const qMap = {};
    for (const q of questions) qMap[q.id] = q;

    // Insert responses
    let inserted = 0;
    for (const resp of responses) {
      const q = qMap[resp.question_id];
      if (!q) continue;

      const isCorrect = q.answer_key && resp.selected_answer.toUpperCase() === q.answer_key.toUpperCase();
      const scoreEarned = isCorrect ? parseFloat(q.score || 0) : 0;

      await pool.query(`
        INSERT INTO exam_responses (run_id, exam_code, student_code, question_id, selected_answer, is_correct, score_earned)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [runId, resp.exam_code, resp.student_code, resp.question_id, resp.selected_answer, isCorrect, scoreEarned]);
      inserted++;
    }

    await audit(req.user.id, 'IMPORT_RESPONSES', 'exam_run', runId, { count: inserted }, req.ip);
    res.json({ ok: true, inserted });
  } catch (err) { next(err); }
});

// Chạy phân tích item analysis cho 1 đợt thi
r.post('/exams/:runId/analyze', requireAnyCapability('exam.create'), async (req, res, next) => {
  try {
    const runId = parseInt(req.params.runId, 10);
    const run=(await pool.query('SELECT m.subject_id,m.grade FROM exam_runs e JOIN matrix_templates m ON m.id=e.matrix_id WHERE e.id=$1',[runId])).rows[0];
    if(!run)return res.status(404).json({error:'Không tìm thấy đợt thi'});
    if(!await can(req.user,'exam.create',{subjectId:run.subject_id,grade:run.grade}))return res.status(403).json({error:'Không có quyền'});
    const result = await analyzeExamRun(runId);
    await audit(req.user.id, 'ANALYZE_EXAM', 'exam_run', runId, { analyzed: result.analyzed }, req.ip);
    res.json(result);
  } catch (err) { next(err); }
});

// Xem phân tích của 1 câu hỏi cụ thể
r.get('/questions/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const params=[id];const bank=bankFilter(req.user,'q',params);const scope=await getSubjectFilterSQL(req.user,'q',params.length+1);params.push(...scope.params);
    const { rows } = await pool.query(`
      SELECT q.id, q.question_code, q.difficulty_index, q.discrimination_index,
             q.point_biserial, q.distractor_analysis, q.times_administered, q.quality_flag,
             s.name AS subject_name
      FROM questions q
      LEFT JOIN subjects s ON s.id = q.subject_id
      WHERE q.id = $1 AND ${bank} ${scope.clause?'AND '+scope.clause:''}
    `, params);
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Tổng hợp chất lượng kho câu hỏi
r.get('/summary', async (req, res, next) => {
  try {
    const params=[];const bank=bankFilter(req.user,'q',params);const scope=await getSubjectFilterSQL(req.user,'q',params.length+1);params.push(...scope.params);const filter=bank+(scope.clause?' AND '+scope.clause:'');
    const { rows: flagRows } = await pool.query(`
      SELECT quality_flag, COUNT(*)::int AS n
      FROM questions q
      WHERE quality_flag IS NOT NULL AND ${filter}
      GROUP BY quality_flag
    `,params);
    const flags = {};
    for (const r of flagRows) flags[r.quality_flag] = r.n;

    const { rows: rangeRows } = await pool.query(`
      SELECT
        COUNT(CASE WHEN difficulty_index < 0.20 THEN 1 END)::int AS very_hard,
        COUNT(CASE WHEN difficulty_index BETWEEN 0.20 AND 0.40 THEN 1 END)::int AS hard,
        COUNT(CASE WHEN difficulty_index BETWEEN 0.40 AND 0.60 THEN 1 END)::int AS medium,
        COUNT(CASE WHEN difficulty_index BETWEEN 0.60 AND 0.80 THEN 1 END)::int AS easy,
        COUNT(CASE WHEN difficulty_index > 0.80 THEN 1 END)::int AS very_easy,
        AVG(difficulty_index)::numeric(4,3) AS avg_p,
        AVG(discrimination_index)::numeric(4,3) AS avg_d,
        COUNT(CASE WHEN times_administered > 0 THEN 1 END)::int AS analyzed_count,
        COUNT(*)::int AS total
      FROM questions q
      WHERE difficulty_index IS NOT NULL AND ${filter}
    `,params);

    const { rows: worstRows } = await pool.query(`
      SELECT q.id, q.question_code, q.stem_text, q.difficulty_index, q.discrimination_index,
             q.quality_flag, s.name AS subject_name
      FROM questions q
      LEFT JOIN subjects s ON s.id = q.subject_id
      WHERE q.quality_flag IN ('poor', 'flag') AND ${filter}
      ORDER BY q.discrimination_index ASC
      LIMIT 20
    `,params);

    res.json({
      quality_flags: flags,
      difficulty_distribution: rangeRows[0],
      worst_items: worstRows,
    });
  } catch (err) { next(err); }
});

export default r;
