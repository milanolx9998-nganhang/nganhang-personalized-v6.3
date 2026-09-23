// Redis là phụ thuộc TÙY CHỌN (PERF V6.6.7): chỉ dùng làm cache và bộ đếm rate limit dùng chung.
// Không có REDIS_URL, hoặc Redis sập / chậm → mọi chỗ gọi tự quay về PostgreSQL / bộ nhớ tiến trình;
// học sinh vẫn làm bài bình thường. Không bao giờ lưu đáp án, bài làm, điểm, mật khẩu hay khóa bí mật ở đây.
import {createClient} from 'redis';

let client = null;
let ready = false;
let lastError = null;
const readyHooks = [];

const flag = (name, fallback = true) => {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase());
};

export function redisConfig() {
  return {
    url: process.env.REDIS_URL || '',
    // Tiền tố tách môi trường (home / school / test) khi dùng chung một Redis.
    prefix: String(process.env.REDIS_PREFIX || 'ngh:' + (process.env.APP_PROFILE || 'local')).replace(/:+$/, ''),
    cache: flag('REDIS_CACHE_ENABLED'),
    rateLimit: flag('REDIS_RATE_LIMIT_ENABLED'),
    // Redis cùng máy trả lời dưới 1 ms; quá ngưỡng này coi như lỗi để quay về DB, không bắt học sinh chờ.
    timeoutMs: Number(process.env.REDIS_COMMAND_TIMEOUT_MS) > 0 ? Number(process.env.REDIS_COMMAND_TIMEOUT_MS) : 300,
  };
}

// Việc cần làm mỗi lần (tái) kết nối — vd. đổi "thế hệ" cache vì trong lúc mất kết nối có thể đã bỏ lỡ lệnh xóa.
export function onRedisReady(fn) { readyHooks.push(fn); }

export function initRedis({url = redisConfig().url, factory = createClient} = {}) {
  if (!url || client) return;
  client = factory({url, disableOfflineQueue: true,
    socket: {connectTimeout: 2000, reconnectStrategy: retries => Math.min(500 * (retries + 1), 10000)}});
  client.on('ready', () => {
    ready = true; lastError = null;
    for (const fn of readyHooks) Promise.resolve().then(fn).catch(() => {});
  });
  client.on('end', () => { ready = false; });
  client.on('error', e => {
    // Chỉ log khi trạng thái đổi, tránh ngập log trong lúc Redis đang khởi động lại.
    if (ready || lastError !== e.message) console.warn('Redis degraded:', e.message);
    ready = false; lastError = e.message;
  });
  // Không chờ kết nối: server lên ngay, Redis sẵn sàng lúc nào dùng lúc đó.
  client.connect().catch(e => { ready = false; lastError = e.message; });
}

export const redisReady = () => ready;

export function redisStatus() {
  if (!redisConfig().url) return 'disabled';
  return ready ? 'ok' : 'degraded';
}

export async function command(args) {
  if (!client || !ready) throw new Error('REDIS_UNAVAILABLE');
  let timer;
  try {
    return await Promise.race([
      client.sendCommand(args.map(String)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('REDIS_TIMEOUT')), redisConfig().timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

// INFO rút gọn cho trang vận hành: bộ nhớ, số khóa bị đẩy ra, tỉ lệ trúng phía Redis.
export async function redisInfo() {
  if (!ready) return {status: redisStatus(), last_error: lastError};
  try {
    const text = String(await command(['INFO']));
    const pick = k => text.match(new RegExp('^' + k + ':(.*)$', 'm'))?.[1]?.trim() ?? null;
    return {status: 'ok', used_memory: Number(pick('used_memory')), maxmemory: Number(pick('maxmemory')),
      maxmemory_policy: pick('maxmemory_policy'), evicted_keys: Number(pick('evicted_keys')),
      keyspace_hits: Number(pick('keyspace_hits')), keyspace_misses: Number(pick('keyspace_misses'))};
  } catch (e) { return {status: 'degraded', last_error: e.message}; }
}

export async function closeRedis() {
  const c = client; client = null; ready = false;
  if (c) await c.quit().catch(() => c.disconnect?.());
}

// Chỉ dùng trong test: gắn một client giả có sendCommand(args).
export function setRedisClientForTest(fake) {
  client = fake; ready = !!fake;
  if (fake) for (const fn of readyHooks) Promise.resolve().then(fn).catch(() => {});
}
