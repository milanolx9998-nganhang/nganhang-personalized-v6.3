import {passwordRule} from '../services/passwordPolicy.js';
import {capabilitySummary} from '../services/capabilities.js';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { auth, signToken } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import {sensitiveLimiter} from '../middleware/rateLimiter.js';

import {browserRequest,issueCsrf,setSession,clearSession} from '../middleware/session.js';
const r = Router();
const dummyHash=bcrypt.hash('Unusable-login-timing-comparison',12);
r.get('/csrf',(req,res)=>res.json({csrf_token:issueCsrf(req,res)}));

r.post('/login', async (req, res, next) => {
  try {
    const { username, password } = z.object({
      username: z.string().min(1).max(50),
      password: z.string().min(1).max(128),
    }).parse(req.body);

    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND is_active = TRUE',
      [username]
    );
    if (!rows.length) {await bcrypt.compare(password,await dummyHash);await audit(null,'LOGIN_FAILURE','security',null,{},req.ip);return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });}
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {await audit(user.id,'LOGIN_FAILURE','security',null,{},req.ip);return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });}

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    await audit(user.id, 'LOGIN', 'user', user.id, {}, req.ip);

    const token = signToken(user);
    const browser=browserRequest(req),csrf_token=setSession(req,res,token);
    res.json({
      ...(browser?{}:{token}),csrf_token,
      user: {
        id: user.id, username: user.username, full_name: user.full_name,
        ...await capabilitySummary(user),role: user.role, subject_id: user.subject_id, department_id: user.department_id, must_change_password:user.must_change_password,
      },
    });
  } catch (err) { next(err); }
});

r.get('/me', auth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.role, u.email, u.must_change_password,
              u.department_id, d.name AS department_name,
              u.subject_id, s.name AS subject_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN subjects s ON s.id = u.subject_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy user' });
    res.json({...rows[0],...await capabilitySummary(req.user)});
  } catch (err) { next(err); }
});

r.post('/change-password', auth, sensitiveLimiter, async (req, res, next) => {
  try {
    const { old_password, new_password } = z.object({
      old_password: z.string().min(1),
      new_password: passwordRule,
    }).parse(req.body);

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy user' });
    const ok = await bcrypt.compare(old_password, rows[0].password_hash);
    if (!ok) return res.status(400).json({ error: 'Mật khẩu cũ không đúng' });

    const newHash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = $1,must_change_password=false,token_version=token_version+1 WHERE id = $2', [newHash, req.user.id]);
    await audit(req.user.id, 'CHANGE_PASSWORD', 'user', req.user.id, {}, req.ip);
    clearSession(req,res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

r.post('/logout',auth,async(req,res,next)=>{try{await pool.query('UPDATE users SET token_version=token_version+1 WHERE id=$1',[req.user.id]);clearSession(req,res);await audit(req.user.id,'SESSION_REVOKED','user',req.user.id,{reason:'logout'},req.ip);res.json({ok:true});}catch(e){next(e);}});
export default r;
