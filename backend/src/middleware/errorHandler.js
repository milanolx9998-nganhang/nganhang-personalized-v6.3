export function errorHandler(err, _req, res, _next) {
  console.error(JSON.stringify({request_id:_req.requestId,status:err.status||500,code:err.code||err.name,message:err.status?err.message:'Request failed'}));
  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: err.errors });
  }
  const status = err.status || 500;
  // Production: ẩn chi tiết lỗi server (tránh leak tên bảng/cột DB)
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Lỗi server nội bộ'
    : (err.message || 'Lỗi server');
  res.status(status).json({ error: message,code:err.code,details:err.details,request_id:_req.requestId });
}
