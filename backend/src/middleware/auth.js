import {contentSubjects,capabilitySummary} from '../services/capabilities.js';
import {getEffectiveAccess,attachAccess,contentFilterSQL} from '../services/accessResolver.js';
import jwt from 'jsonwebtoken';
import {cookies,SESSION_COOKIE} from './session.js';
import { pool } from '../db/pool.js';

// WARN 2 FIX: Không dùng default secret — bắt buộc cấu hình
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET chưa đặt trong .env! Không thể khởi động an toàn.');
  if (process.env.NODE_ENV === 'production') process.exit(1);
}
const EFFECTIVE_SECRET = JWT_SECRET;

export async function auth(req, res, next) {
  if(req.user)return next(); // Already authenticated in this request.
  const h = req.headers.authorization || '';
  const token = cookies(req)[SESSION_COOKIE] || (h.startsWith('Bearer ') ? h.slice(7) : null);
  if (!token) return res.status(401).json({ error: 'Thiếu token xác thực' });
  try {
    const claims = jwt.verify(token, EFFECTIVE_SECRET);
    const current = (await pool.query('SELECT id,username,full_name,role,subject_id,department_id,token_version,must_change_password FROM users WHERE id=$1 AND is_active=true',[claims.id])).rows[0];
    if(!current || (claims.token_version||0)!==current.token_version) return res.status(401).json({error:'Phiên đăng nhập đã hết hiệu lực'});
    const access=await getEffectiveAccess(current);
    req.user = attachAccess({...current,...await capabilitySummary(current)},access);
    req.access=access;
    next();
  } catch {
    res.status(401).json({ error: 'Token không hợp lệ' });
  }
}

// role có thể là string hoặc array; 'admin' luôn qua hết
export function requireRole(roles) {
  const list = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Chưa xác thực' });
    if (req.user.role === 'admin' || list.includes(req.user.role)) return next();
    res.status(403).json({ error: 'Không đủ quyền' });
  };
}

// ----------------------------------------------------------------
// PHÂN QUYỀN THEO MÔN (subject-level RBAC)
// ----------------------------------------------------------------

/**
 * Trả về danh sách subject_id mà user được phép truy cập.
 * - admin / board → null (không filter, xem tất cả)
 * - dept_leader   → tất cả subject thuộc cùng department_id
 * - grade_leader / teacher → chỉ [user.subject_id]
 */
export async function getSubjectFilter(user) {
 const ids=await contentSubjects(user);return ids===null?null:ids.length?ids:[0];
}

/**
 * Tạo SQL WHERE clause fragment cho subject filter.
 * Trả về { clause, params, nextIdx }
 *   clause = '' nếu null (no filter) hoặc 'alias.subject_id IN ($x, $y, ...)'
 */
export async function getSubjectFilterSQL(user,alias,startIdx,capability='content.read'){
 if(user.role==='admin')return {clause:'',params:[],nextIdx:startIdx};
 const params=Array(startIdx-1).fill(null),clause=await contentFilterSQL(user,alias,params,capability);
 return {clause,params:params.slice(startIdx-1),nextIdx:params.length+1};
}

/**
 * Kiểm tra user có quyền truy cập subject_id cụ thể không.
 */
export async function checkSubjectAccess(user, subjectId) {
  const allowed = await getSubjectFilter(user);
  if (allowed === null) return true; // admin/board
  return allowed.includes(Number(subjectId));
}

/**
 * Kiểm tra user có phải read-only (teacher) không.
 */
export function isReadOnly(user) {
  return !user?.capabilities?.['content.write'];
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name, subject_id: user.subject_id, department_id: user.department_id, token_version:user.token_version||0 },
    EFFECTIVE_SECRET,
    { expiresIn: '8h' }
  );
}
