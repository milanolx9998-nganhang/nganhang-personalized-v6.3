// Cache-aside cho dữ liệu đọc chung (PERF V6.6.7). Nguồn dữ liệu thật luôn là PostgreSQL.
//
// Quy tắc:
// - Chỉ cache dữ liệu không chứa đáp án / lời giải / bài làm (xem docs/PERF_V6_6_7_REDIS_SUPAVISOR.md).
// - Khóa dữ liệu chung gắn "thế hệ nội dung": mọi thao tác ghi thành công của giáo viên / quản trị tăng thế hệ,
//   nên cache cũ tự hết hiệu lực mà không phải liệt kê từng khóa phải xóa. Học sinh ghi (lưu bài, nộp) không
//   đổi thế hệ.
// - Redis lỗi / chậm → gọi thẳng loader. Không có REDIS_URL → không cache.
// - Giá trị trả về có thể được nhiều request dùng chung: không sửa trực tiếp.
import crypto from 'node:crypto';
import {command, redisConfig, redisReady, onRedisReady} from './redis.js';

export const cacheMetrics = {hit: 0, miss: 0, error: 0, bypass: 0, lock_wait: 0, skipped_large: 0, invalidations: 0};
const inflight = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const cacheKey = (...parts) => [redisConfig().prefix, ...parts].join(':');
export const hashOf = value => crypto.createHash('sha1').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16);
const maxBytes = () => Number(process.env.REDIS_CACHE_MAX_BYTES) > 0 ? Number(process.env.REDIS_CACHE_MAX_BYTES) : 2_000_000;
const usable = () => redisConfig().cache && redisReady();

// ---- Thế hệ nội dung ----
export async function generation(name = 'content') {
  if (!usable()) return null;
  try { return String((await command(['GET', cacheKey('gen', name)])) ?? '0'); }
  catch { cacheMetrics.error++; return null; }
}

export async function bumpGeneration(name = 'content') {
  if (!redisConfig().url) return;
  try { await command(['INCR', cacheKey('gen', name)]); cacheMetrics.invalidations++; }
  catch { cacheMetrics.error++; }
}

// Mỗi lần (tái) kết nối: đổi thế hệ, vì lúc mất kết nối có thể đã bỏ lỡ lệnh đổi thế hệ.
onRedisReady(() => bumpGeneration('content'));

export async function invalidate(...keys) {
  if (!redisConfig().url || !keys.length) return;
  try { await command(['DEL', ...keys]); cacheMetrics.invalidations++; }
  catch { cacheMetrics.error++; }
}

// ---- Cache-aside ----
// raw: loader trả sẵn chuỗi JSON và nhận lại đúng chuỗi đó — dữ liệu lớn (catalog ~400 KB) khỏi phải
// parse rồi tuần tự hóa lại mỗi request.
async function read(key, raw) {
  const hit = await command(['GET', key]);
  return hit == null ? undefined : raw ? String(hit) : JSON.parse(hit);
}

async function load(key, ttlSeconds, loader, jitter, raw) {
  try {
    const hit = await read(key, raw);
    if (hit !== undefined) { cacheMetrics.hit++; return hit; }
  } catch { cacheMetrics.error++; return loader(); }
  cacheMetrics.miss++;
  // Chống dồn tải giữa nhiều tiến trình: một bên giữ khóa nạp dữ liệu, bên khác chờ ngắn rồi đọc lại.
  const lockKey = key + ':lock';
  let locked = false;
  try { locked = (await command(['SET', lockKey, '1', 'PX', '5000', 'NX'])) === 'OK'; } catch { cacheMetrics.error++; }
  if (!locked) {
    for (let i = 0; i < 6; i++) {
      await sleep(40);
      try { const hit = await read(key, raw); if (hit !== undefined) { cacheMetrics.lock_wait++; return hit; } } catch { break; }
    }
  }
  try {
    const value = await loader();
    try {
      const text = raw ? value : JSON.stringify(value);
      if (text === undefined) return value;
      if (Buffer.byteLength(text) > maxBytes()) cacheMetrics.skipped_large++;
      else await command(['SET', key, text, 'EX', ttlSeconds + Math.floor(Math.random() * (jitter + 1))]);
    } catch { cacheMetrics.error++; }
    return value;
  } finally {
    if (locked) command(['DEL', lockKey]).catch(() => {});
  }
}

export async function cached(key, ttlSeconds, loader, {jitter = Math.ceil(ttlSeconds * 0.1), raw = false} = {}) {
  if (!usable()) { cacheMetrics.bypass++; return loader(); }
  // Cùng tiến trình: các request trùng khóa đang chờ dùng chung một lần nạp.
  const pending = inflight.get(key);
  if (pending) return pending;
  const run = load(key, ttlSeconds, loader, jitter, raw);
  inflight.set(key, run);
  try { return await run; }
  finally { inflight.delete(key); }
}

// Dữ liệu chung theo thế hệ nội dung: khóa = <tên>:g<thế hệ>:<phần còn lại>.
export async function cachedShared(parts, ttlSeconds, loader, options) {
  const gen = await generation('content');
  if (gen === null) { cacheMetrics.bypass++; return loader(); }
  return cached(cacheKey(...[parts].flat().slice(0, 1), 'g' + gen, ...[parts].flat().slice(1)), ttlSeconds, loader, options);
}
