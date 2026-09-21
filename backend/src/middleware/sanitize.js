/**
 * Sanitize middleware — loại bỏ HTML/script tags nguy hiểm khỏi string fields.
 * Cho phép ký tự đặc biệt toán/khoa học (≥, ², Δ, v.v.) nhưng chặn XSS.
 */

const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,     // onclick=, onerror=, etc.
  /<iframe\b[^>]*>/gi,
  /<embed\b[^>]*>/gi,
  /<object\b[^>]*>/gi,
  /javascript\s*:/gi,
  /data\s*:\s*text\/html/gi,
];

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  let clean = str;
  for (const p of DANGEROUS_PATTERNS) {
    clean = clean.replace(p, '');
  }
  return clean;
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') result[k] = sanitizeString(v);
    else if (typeof v === 'object' && v !== null) result[k] = sanitizeObject(v);
    else result[k] = v;
  }
  return result;
}

/**
 * Express middleware: sanitize req.body trước khi route handler xử lý.
 * Chỉ apply cho POST/PUT/PATCH (có body).
 */
export function sanitizeBody(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}
