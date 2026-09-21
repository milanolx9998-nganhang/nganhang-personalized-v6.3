import {can,requireCapability,requireAnyCapability} from '../services/accessResolver.js';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { auth, requireRole, getSubjectFilter } from '../middleware/auth.js';
import {contentCapability} from '../services/capabilities.js';
import { audit } from '../utils/audit.js';

const r = Router();
r.use(auth);

// --- departments ---
r.get('/departments', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM departments ORDER BY id');
    res.json(rows);
  } catch (err) { next(err); }
});

// --- subjects --- PHÂN QUYỀN: teacher/grade_leader chỉ thấy môn mình
r.get('/subjects', async (req, res, next) => {
  try {
    const subjectIds = await getSubjectFilter(req.user);
    let filterClause = '';
    let filterParams = [];
    if (subjectIds !== null) {
      const placeholders = subjectIds.map((_, i) => `$${i + 1}`).join(',');
      filterClause = subjectIds.length ? `WHERE s.id IN (${placeholders})` : 'WHERE false';
      filterParams = subjectIds;
    }

    const { rows } = await pool.query(`
      SELECT s.*, d.name AS department_name,
             (SELECT COUNT(*)::int FROM branches b WHERE b.subject_id = s.id) AS branch_count
      FROM subjects s
      LEFT JOIN departments d ON d.id = s.department_id
      ${filterClause}
      ORDER BY s.id
    `, filterParams);
    res.json(rows);
  } catch (err) { next(err); }
});

r.post('/subjects', requireCapability('curriculum.manage'), async (req, res, next) => {
  try {
    const data = z.object({
      code: z.string().min(1).max(30),
      name: z.string().min(1).max(100),
      is_integrated: z.boolean().default(false),
      department_id: z.number().int().positive().nullable().optional(),
    }).parse(req.body);

    const { rows } = await pool.query(
      `INSERT INTO subjects (code, name, is_integrated, department_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [data.code, data.name, data.is_integrated, data.department_id || null]
    );
    await audit(req.user.id, 'CREATE_SUBJECT', 'subject', rows[0].id, data, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// --- branches (chỉ môn is_integrated mới dùng) ---
r.get('/branches', async (req, res, next) => {
  try {
    const sid = req.query.subject_id ? parseInt(req.query.subject_id, 10) : null;
    const { rows } = await pool.query(
      sid ? 'SELECT * FROM branches WHERE subject_id = $1 ORDER BY order_index, id'
          : 'SELECT * FROM branches ORDER BY subject_id, order_index, id',
      sid ? [sid] : []
    );
    res.json(rows);
  } catch (err) { next(err); }
});

r.post('/branches', requireCapability('curriculum.manage'), async (req, res, next) => {
  try {
    const data = z.object({
      subject_id: z.number().int().positive(),
      code: z.string().min(1).max(30),
      name: z.string().min(1).max(100),
      color: z.string().max(20).default('#4f8eff'),
      order_index: z.number().int().default(0),
    }).parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO branches (subject_id, code, name, color, order_index)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [data.subject_id, data.code, data.name, data.color, data.order_index]
    );
    await audit(req.user.id, 'CREATE_BRANCH', 'branch', rows[0].id, data, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// --- topics (bài / chương) ---
r.get('/topics', async (req, res, next) => {
  try {
    const sid = req.query.subject_id ? parseInt(req.query.subject_id, 10) : null;
    const grade = req.query.grade ? parseInt(req.query.grade, 10) : null;
    const bid = req.query.branch_id ? parseInt(req.query.branch_id, 10) : null;

    const where = [];
    const params = [];
    if (sid) { params.push(sid); where.push(`t.subject_id = $${params.length}`); }
    if (grade) { params.push(grade); where.push(`t.grade = $${params.length}`); }
    if (bid) { params.push(bid); where.push(`t.branch_id = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT t.*, b.name AS branch_name, b.color AS branch_color, s.name AS subject_name
       FROM topics t
       LEFT JOIN branches b ON b.id = t.branch_id
       LEFT JOIN subjects s ON s.id = t.subject_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY t.grade, t.branch_id, t.order_index, t.id`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

r.post('/topics', requireAnyCapability('curriculum.manage_lessons'), async (req, res, next) => {
  try {
    const data = z.object({
      subject_id: z.number().int().positive(),
      branch_id: z.number().int().positive().nullable().optional(),
      grade: z.number().int().min(6).max(12),
      chapter: z.string().max(300).optional(),
      name: z.string().min(1).max(300),
      order_index: z.number().int().default(0),
      learning_goal: z.string().optional(),
    }).parse(req.body);
    if(!await can(req.user,'curriculum.manage_lessons',{subjectId:data.subject_id,grade:data.grade}))return res.status(403).json({error:'Môn ngoài phạm vi biên soạn'});
    if(data.branch_id&&!(await pool.query('SELECT 1 FROM branches WHERE id=$1 AND subject_id=$2',[data.branch_id,data.subject_id])).rowCount)return res.status(422).json({error:'Phân môn không thuộc môn đã chọn'});
    const { rows } = await pool.query(
      `INSERT INTO topics (subject_id, branch_id, grade, chapter, name, order_index, learning_goal)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [data.subject_id, data.branch_id || null, data.grade, data.chapter || null, data.name, data.order_index, data.learning_goal || null]
    );
    await audit(req.user.id, 'CREATE_TOPIC', 'topic', rows[0].id, data, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

r.put('/topics/:id', requireAnyCapability('curriculum.manage_lessons'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = z.object({
      chapter: z.string().max(300).nullable().optional(),
      name: z.string().min(1).max(300).optional(),
      order_index: z.number().int().optional(),
      learning_goal: z.string().nullable().optional(),
    }).parse(req.body);

    const topic=(await pool.query('SELECT * FROM topics WHERE id=$1',[id])).rows[0];
    if(!topic)return res.status(404).json({error:'Không tìm thấy bài'});
    if(!await can(req.user,'curriculum.manage_lessons',{subjectId:topic.subject_id,grade:topic.grade}))return res.status(403).json({error:'Môn ngoài phạm vi biên soạn'});
    // Chỉ đổi nhãn; định danh chuẩn và lưu trữ phải qua màn hình xem tác động.
    const ALLOWED_COLS = new Set(['chapter', 'name', 'order_index', 'learning_goal']);
    const fields = [];
    const values = [];
    let i = 1;
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && ALLOWED_COLS.has(k)) { fields.push(`${k} = $${i++}`); values.push(v); }
    }
    if (!fields.length) return res.json({ ok: true });
    values.push(id);
    await pool.query(`UPDATE topics SET ${fields.join(', ')} WHERE id = $${i}`, values);
    await audit(req.user.id, 'UPDATE_TOPIC', 'topic', id, data, req.ip);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

r.delete('/topics/:id', requireAnyCapability('curriculum.publish'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    return res.status(409).json({error:'Dùng Chuẩn đầu ra → Xem tác động → Lưu trữ bài để bảo toàn lịch sử',code:'CURRICULUM_IMPACT_REQUIRED'});
    await audit(req.user.id, 'DELETE_TOPIC', 'topic', id, {}, req.ip);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default r;
