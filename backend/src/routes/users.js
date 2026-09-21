import {passwordRule} from '../services/passwordPolicy.js';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { auth, requireRole } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const r = Router();
r.use(auth);

r.get('/', requireRole(['admin']), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.role, u.is_active,
              u.last_login, u.created_at,
              d.name AS department_name, s.name AS subject_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN subjects s ON s.id = u.subject_id
       WHERE $1 OR (u.department_id=$2 AND u.role NOT IN ('admin','student'))
       ORDER BY u.id`,[req.user.role==='admin',req.user.department_id||null]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

r.post('/', requireRole(['admin']), async (req, res, next) => {
  try {
    const data = z.object({
      username: z.string().min(3).max(50).regex(/^[a-z0-9_]+$/i),
      password: passwordRule,
      full_name: z.string().min(1),
      email: z.string().email().optional().or(z.literal('')),
      role: z.literal('teacher').default('teacher'),
      department_id: z.number().int().positive().nullable().optional(),
      subject_id: z.number().int().positive().nullable().optional(),
    }).parse(req.body);

    const existing = await pool.query('SELECT 1 FROM users WHERE username = $1', [data.username]);
    if (existing.rows.length) return res.status(409).json({ error: 'Username đã tồn tại' });

    const hash = await bcrypt.hash(data.password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, email, role, department_id, subject_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, username, full_name, role`,
      [data.username, hash, data.full_name, data.email || null, data.role, data.department_id || null, data.subject_id || null]
    );
    await audit(req.user.id, 'CREATE_USER', 'user', rows[0].id, { username: data.username }, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

r.put('/:id', requireRole(['admin']), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = z.object({
      full_name: z.string().min(1).optional(),
      email: z.string().email().optional().or(z.literal('')),
      role: z.literal('teacher').optional(),
      department_id: z.number().int().positive().nullable().optional(),
      subject_id: z.number().int().positive().nullable().optional(),
      is_active: z.boolean().optional(),
    }).parse(req.body);

    // FIX BUG 1: Whitelist cột hợp lệ
    const ALLOWED_COLS = new Set(['full_name', 'email', 'role', 'department_id', 'subject_id', 'is_active']);
    const current=(await pool.query('SELECT role FROM users WHERE id=$1',[id])).rows[0];
    if(!current)return res.status(404).json({error:'Không tìm thấy tài khoản'});
    if(data.role && data.role!==current.role)return res.status(400).json({error:'Vai trò hệ thống không sửa qua hồ sơ; dùng Vị trí & phạm vi'});
    const fields = [];
    const values = [];
    let i = 1;
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && ALLOWED_COLS.has(k)) { fields.push(`${k} = $${i++}`); values.push(v === '' ? null : v); }
    }
    if (!fields.length) return res.json({ ok: true });
    values.push(id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`, values);
    await audit(req.user.id, 'UPDATE_USER', 'user', id, data, req.ip);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

r.post('/:id/reset-password', requireRole(['admin']), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { new_password } = z.object({ new_password: passwordRule }).parse(req.body);
    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = $1,must_change_password=true,token_version=token_version+1 WHERE id = $2', [hash, id]);
    await audit(req.user.id, 'RESET_PASSWORD', 'user', id, {}, req.ip);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default r;
