import {visibleQuestion} from '../services/access/visibility.js';
import { Router } from 'express';
import { z } from 'zod';
import { pool, tx } from '../db/pool.js';
import { auth, requireRole, getSubjectFilterSQL, checkSubjectAccess, isReadOnly } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

import crypto from 'node:crypto';
import {bankFilter,legacyQuestionGuard} from '../middleware/bankScope.js';
const r = Router();
r.use(auth);r.use(legacyQuestionGuard);

// Auto-sinh question_code: MãMôn-Lớp-STT (VD: VatLi-09-0001)
async function genQuestionCode(){return 'Q-'+crypto.randomUUID();}

const QSchema = z.object({
  subject_id: z.number().int().positive(),
  branch_id: z.number().int().positive().nullable().optional(),
  topic_id: z.number().int().positive().nullable().optional(),
  grade: z.number().int().min(6).max(12),
  main_topic: z.string().max(300).nullable().optional(),
  sub_topic: z.string().max(300).nullable().optional(),
  cognitive_level: z.enum(['M1', 'M2', 'M3', 'M4']),
  q_type: z.enum(['mcq4', 'true_false', 'short', 'essay']),
  stem_text: z.string().min(1),
  option_a: z.string().nullable().optional(),
  option_b: z.string().nullable().optional(),
  option_c: z.string().nullable().optional(),
  option_d: z.string().nullable().optional(),
  answer_key: z.string().nullable().optional(),
  explanation: z.string().nullable().optional(),
  score: z.number().default(0.25),
  creator_name: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  family_code: z.string().nullable().optional(),
  image_url: z.string().url().nullable().optional(),
});

// LIST — tìm kiếm + filter + PHÂN QUYỀN THEO MÔN
r.get('/', async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    where.push(bankFilter(req.user,'q',params));
    const { subject_id, branch_id, topic_id, grade, cognitive_level, q_type, status, search, tag_id } = req.query;

    // === PHÂN QUYỀN: auto-filter theo subject scope ===
    const sf = await getSubjectFilterSQL(req.user, 'q', params.length + 1);
    if (sf.clause) {
      where.push(sf.clause);
      params.push(...sf.params);
    }

    if (subject_id) { params.push(subject_id); where.push(`q.subject_id = $${params.length}`); }
    if (branch_id) { params.push(branch_id); where.push(`q.branch_id = $${params.length}`); }
    if (topic_id) { params.push(topic_id); where.push(`q.topic_id = $${params.length}`); }
    if (grade) { params.push(grade); where.push(`q.grade = $${params.length}`); }
    if (cognitive_level) { params.push(cognitive_level); where.push(`q.cognitive_level = $${params.length}`); }
    if (q_type) { params.push(q_type); where.push(`q.q_type = $${params.length}`); }
    if (status) { params.push(status); where.push(`q.status = $${params.length}`); }
    if (search) { params.push(`%${search}%`); where.push(`q.stem_text ILIKE $${params.length}`); }
    if (tag_id) { params.push(tag_id); where.push(`q.id IN (SELECT question_id FROM question_tags WHERE tag_id = $${params.length})`); }

    const limit = Math.min(parseInt(req.query.limit || '50', 10), 500);
    const offset = parseInt(req.query.offset || '0', 10);
    params.push(limit);
    params.push(offset);

    const { rows } = await pool.query(
      `SELECT q.id, q.bank_id, q.question_code, q.subject_id, q.branch_id, q.topic_id, q.grade,
              q.main_topic, q.sub_topic, q.cognitive_level, q.q_type,
              q.stem_text, q.option_a, q.option_b, q.option_c, q.option_d,
              q.answer_key, q.score, q.status, q.creator_name, q.usage_count,
              s.name AS subject_name, b.name AS branch_name, t.name AS topic_name,
              u.full_name AS creator_full_name
       FROM questions q
       LEFT JOIN subjects s ON s.id = q.subject_id
       LEFT JOIN branches b ON b.id = q.branch_id
       LEFT JOIN topics t ON t.id = q.topic_id
       LEFT JOIN users u ON u.id = q.creator_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY q.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const { rows: [{ n }] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM questions q ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`,
      params.slice(0, -2)
    );
    res.json({ items: await Promise.all(rows.map(q=>visibleQuestion(req.user,q))), total: n, limit, offset });
  } catch (err) { next(err); }
});

// DETAIL — kiểm tra subject access
r.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT q.*, s.name AS subject_name, b.name AS branch_name, t.name AS topic_name
       FROM questions q
       LEFT JOIN subjects s ON s.id = q.subject_id
       LEFT JOIN branches b ON b.id = q.branch_id
       LEFT JOIN topics t ON t.id = q.topic_id
       WHERE q.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy câu hỏi' });

    // === PHÂN QUYỀN: kiểm tra subject access ===
    const hasAccess = await checkSubjectAccess(req.user, rows[0].subject_id);
    if (!hasAccess) return res.status(403).json({ error: 'Không có quyền xem câu hỏi môn này' });

    res.json(await visibleQuestion(req.user,rows[0]));
  } catch (err) { next(err); }
});

// CREATE — teacher chỉ tạo câu cho môn mình
r.post('/', async (req, res, next) => {
  try {
    const data = QSchema.parse(req.body);

    // === PHÂN QUYỀN: kiểm tra subject access ===
    const hasAccess = await checkSubjectAccess(req.user, data.subject_id);
    if (!hasAccess) return res.status(403).json({ error: 'Không có quyền thêm câu hỏi cho môn này' });

    const result = await tx(async (client) => {
      const code = await genQuestionCode(client, data.subject_id, data.grade);
      const { rows } = await client.query(
        `INSERT INTO questions
         (question_code, subject_id, branch_id, topic_id, grade,
          main_topic, sub_topic, cognitive_level, q_type,
          stem_text, option_a, option_b, option_c, option_d,
          answer_key, explanation, score, creator_name, notes, family_code, image_url, creator_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         RETURNING *`,
        [code, data.subject_id, data.branch_id || null, data.topic_id || null, data.grade,
         data.main_topic || null, data.sub_topic || null, data.cognitive_level, data.q_type,
         data.stem_text, data.option_a || null, data.option_b || null, data.option_c || null, data.option_d || null,
         data.answer_key || null, data.explanation || null, data.score,
         data.creator_name || req.user.full_name, data.notes || null, data.family_code || null, data.image_url || null, req.user.id]
      );
      return rows[0];
    });
    await audit(req.user.id, 'CREATE_QUESTION', 'question', result.id, { code: result.question_code }, req.ip);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// UPDATE — kiểm tra subject access
r.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);

    // === PHÂN QUYỀN: teacher không sửa câu ===
    if (isReadOnly(req.user)) return res.status(403).json({ error: 'Giáo viên không có quyền sửa câu hỏi' });

    // Kiểm tra subject access và lấy dữ liệu cũ
    let oldData;
    const { rows: existing } = await pool.query('SELECT * FROM questions WHERE id = $1', [id]);
    if (existing.length) {
      oldData = existing[0];
      const hasAccess = await checkSubjectAccess(req.user, oldData.subject_id);
      if (!hasAccess) return res.status(403).json({ error: 'Không có quyền sửa câu hỏi môn này' });
    } else {
      return res.status(404).json({ error: 'Không tìm thấy câu hỏi' });
    }

    const data = QSchema.partial().parse(req.body);

    const ALLOWED_COLS = new Set([
      'subject_id', 'branch_id', 'topic_id', 'grade', 'main_topic', 'sub_topic',
      'cognitive_level', 'q_type', 'stem_text', 'option_a', 'option_b', 'option_c', 'option_d',
      'answer_key', 'explanation', 'score', 'creator_name', 'notes', 'family_code', 'image_url',
    ]);
    const fields = [];
    const values = [];
    let i = 1;

    // So sánh dữ liệu cũ và mới để tính Changes Object
    const changes = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && ALLOWED_COLS.has(k)) {
        fields.push(`${k} = $${i++}`); 
        values.push(v);
        
        // Nếu giá trị (convert string nếu cần) thực sự khác nhau -> Ghi nhận log
        const oldVal = oldData[k] == null ? null : (typeof oldData[k] === 'object' ? String(oldData[k]) : oldData[k]);
        const newVal = v == null ? null : v;
        if (oldVal !== newVal && String(oldVal) !== String(newVal)) {
           changes[k] = { old: oldVal, new: newVal };
        }
      }
    }

    if (!fields.length) return res.json({ ok: true });
    
    // Gộp lệnh Update và Insert History vào 1 transaction
    await tx(async (client) => {
       values.push(id);
       await client.query(`UPDATE questions SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i}`, values);
       
       if (Object.keys(changes).length > 0) {
          await client.query(
             `INSERT INTO question_revisions (question_id, user_id, action, changes) VALUES ($1, $2, $3, $4)`,
             [id, req.user.id, 'update', JSON.stringify(changes)]
          );
       }
    });

    await audit(req.user.id, 'UPDATE_QUESTION', 'question', id, data, req.ip);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET HISTORY
r.get('/:id/history', async (req, res, next) => {
  try {
     const id = parseInt(req.params.id, 10);
     
     // Phân quyền
     const { rows: existing } = await pool.query('SELECT subject_id FROM questions WHERE id = $1', [id]);
     if (existing.length) {
       const hasAccess = await checkSubjectAccess(req.user, existing[0].subject_id);
       if (!hasAccess) return res.status(403).json({ error: 'Không có quyền xem môn này' });
     } else {
       return res.status(404).json({ error: 'Không tìm thấy câu hỏi' });
     }

     const sql = `
        SELECT r.id, r.action, r.changes, r.created_at, u.full_name as user_name
        FROM question_revisions r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.question_id = $1
        ORDER BY r.created_at DESC
     `;
     const { rows } = await pool.query(sql, [id]);
     res.json(rows);
  } catch (e) { next(e); }
});

// Legacy state changes are handled atomically by legacyQuestionGuard above.
// Do not retain a second status update or physical-delete path behind that adapter.
r.all(['/:id/review','/bulk-review','/bulk-delete'],(_req,res)=>res.status(400).json({error:'Mã câu hỏi hoặc danh sách không hợp lệ'}));
r.delete('/:id',(_req,res)=>res.status(400).json({error:'Mã câu hỏi không hợp lệ'}));
export default r;
