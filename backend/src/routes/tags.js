import {requireCapability} from '../services/accessResolver.js';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { auth, requireRole } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const r = Router();
r.use(auth);

// LIST tags
r.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*, 
             (SELECT COUNT(*)::int FROM question_tags qt WHERE qt.tag_id = t.id) AS question_count
      FROM tags t
      WHERE t.is_active = TRUE
      ORDER BY t.tier, t.category NULLS LAST, t.name
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// CREATE tag
r.post('/', requireCapability('system.config'), async (req, res, next) => {
  try {
    const data = z.object({
      name: z.string().min(1).max(200),
      tier: z.enum(['core', 'academic', 'ops', 'custom']).default('custom'),
      category: z.string().max(100).nullable().optional(),
    }).parse(req.body);

    const { rows } = await pool.query(
      `INSERT INTO tags (name, tier, category) VALUES ($1, $2, $3) RETURNING *`,
      [data.name, data.tier, data.category || null]
    );
    await audit(req.user.id, 'CREATE_TAG', 'tag', rows[0].id, data, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// UPDATE tag
r.put('/:id', requireCapability('system.config'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = z.object({
      name: z.string().min(1).max(200).optional(),
      tier: z.enum(['core', 'academic', 'ops', 'custom']).optional(),
      category: z.string().max(100).nullable().optional(),
      is_active: z.boolean().optional(),
    }).parse(req.body);

    // FIX BUG 1: Whitelist cột hợp lệ
    const ALLOWED_COLS = new Set(['name', 'tier', 'category', 'is_active']);
    const fields = [];
    const values = [];
    let i = 1;
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && ALLOWED_COLS.has(k)) { fields.push(`${k} = $${i++}`); values.push(v); }
    }
    if (!fields.length) return res.json({ ok: true });
    values.push(id);
    await pool.query(`UPDATE tags SET ${fields.join(', ')} WHERE id = $${i}`, values);
    await audit(req.user.id, 'UPDATE_TAG', 'tag', id, data, req.ip);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE tag
r.delete('/:id', requireCapability('system.config'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await pool.query('DELETE FROM tags WHERE id = $1', [id]);
    await audit(req.user.id, 'DELETE_TAG', 'tag', id, {}, req.ip);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Gắn tag cho câu hỏi
r.post('/assign', async (req, res, next) => {
  try {
    const { question_id, tag_id } = z.object({
      question_id: z.number().int().positive(),
      tag_id: z.number().int().positive(),
    }).parse(req.body);

    await pool.query(
      'INSERT INTO question_tags (question_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [question_id, tag_id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Gỡ tag khỏi câu hỏi
r.post('/unassign', async (req, res, next) => {
  try {
    const { question_id, tag_id } = z.object({
      question_id: z.number().int().positive(),
      tag_id: z.number().int().positive(),
    }).parse(req.body);

    await pool.query(
      'DELETE FROM question_tags WHERE question_id = $1 AND tag_id = $2',
      [question_id, tag_id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Lấy tags của 1 câu hỏi
r.get('/question/:questionId', async (req, res, next) => {
  try {
    const qid = parseInt(req.params.questionId, 10);
    const { rows } = await pool.query(`
      SELECT t.* FROM tags t
      JOIN question_tags qt ON qt.tag_id = t.id
      WHERE qt.question_id = $1
      ORDER BY t.name
    `, [qid]);
    res.json(rows);
  } catch (err) { next(err); }
});

// FIX BUG 4: Batch lấy tags nhiều câu hỏi cùng lúc (tránh N+1 query)
r.get('/questions/batch', async (req, res, next) => {
  try {
    const idsRaw = req.query.ids || '';
    const ids = idsRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
    if (!ids.length) return res.json({});

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(`
      SELECT qt.question_id, t.id, t.name, t.tier, t.category
      FROM question_tags qt
      JOIN tags t ON t.id = qt.tag_id
      WHERE qt.question_id IN (${placeholders})
      ORDER BY t.name
    `, ids);

    // Group by question_id
    const result = {};
    for (const id of ids) result[id] = [];
    for (const row of rows) {
      if (!result[row.question_id]) result[row.question_id] = [];
      result[row.question_id].push({ id: row.id, name: row.name, tier: row.tier, category: row.category });
    }
    res.json(result);
  } catch (err) { next(err); }
});

export default r;
