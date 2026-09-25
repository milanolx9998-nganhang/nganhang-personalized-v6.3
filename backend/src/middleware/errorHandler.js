import {dbRuleError} from './dbRuleErrors.js';

export function errorHandler(err, _req, res, _next) {
  const rule = dbRuleError(err);
  // Log giữ mã/thông báo gốc của quy tắc DB (không chứa dữ liệu người dùng) để còn tra nguyên nhân.
  console.error(JSON.stringify({request_id:_req.requestId,status:rule?.status||err.status||500,code:rule?.code||err.code||err.name,message:rule?err.message:err.status?err.message:'Request failed'}));
  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: err.errors });
  }
  if (rule) return res.status(rule.status).json({ error: rule.message, code: rule.code, request_id: _req.requestId });
  const status = err.status || 500;
  // Production: ẩn chi tiết lỗi server (tránh leak tên bảng/cột DB)
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Lỗi server nội bộ'
    : (err.message || 'Lỗi server');
  res.status(status).json({ error: message,code:err.code,details:err.details,request_id:_req.requestId });
}
