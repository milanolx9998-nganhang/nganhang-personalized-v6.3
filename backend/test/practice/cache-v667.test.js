// PERF V6.6.7 — cache-aside, thế hệ nội dung, store rate limit và fallback khi Redis lỗi, dùng Redis giả trong bộ nhớ.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.REDIS_URL = 'redis://fake:6379';
process.env.REDIS_PREFIX = 'ngh:unit';
const {setRedisClientForTest, redisStatus} = await import('../../src/services/cache/redis.js');
const {cached, cachedShared, bumpGeneration, invalidate, cacheKey, cacheMetrics} = await import('../../src/services/cache/cache.js');
const {FallbackRedisStore, rateLimitMetrics} = await import('../../src/middleware/rateLimitStore.js');
const {verifyPassword, hashPassword} = await import('../../src/services/passwordHasher.js');

// Redis giả: đủ các lệnh mà cache và rate limit dùng; có thể bật "sập" để thử đường dự phòng.
function fakeRedis() {
  const data = new Map();
  const state = {down: false, calls: []};
  const alive = k => { const e = data.get(k); if (e && e.exp && e.exp <= Date.now()) { data.delete(k); return undefined; } return e; };
  return {state, data, async sendCommand([cmd, ...a]) {
    state.calls.push(cmd);
    if (state.down) throw new Error('ECONNREFUSED');
    switch (cmd) {
      case 'GET': return alive(a[0])?.v ?? null;
      case 'SET': {
        const [k, v, ...opt] = a; const nx = opt.includes('NX');
        if (nx && alive(k)) return null;
        const ex = opt.indexOf('EX'), px = opt.indexOf('PX');
        data.set(k, {v, exp: ex >= 0 ? Date.now() + Number(opt[ex + 1]) * 1000 : px >= 0 ? Date.now() + Number(opt[px + 1]) : 0});
        return 'OK';
      }
      case 'DEL': { let n = 0; for (const k of a) if (data.delete(k)) n++; return n; }
      case 'INCR': case 'DECR': {
        const e = alive(a[0]) || {v: '0', exp: 0};
        e.v = String(Number(e.v) + (cmd === 'INCR' ? 1 : -1)); data.set(a[0], e); return Number(e.v);
      }
      case 'PTTL': { const e = alive(a[0]); return !e ? -2 : e.exp ? e.exp - Date.now() : -1; }
      case 'PEXPIRE': { const e = alive(a[0]); if (!e) return 0; e.exp = Date.now() + Number(a[1]); return 1; }
      case 'EVAL': {
        const key = a[2], token = a[3], e = alive(key);
        if (e?.v === token) { data.delete(key); return 1; }
        return 0;
      }
      default: throw new Error('lệnh chưa hỗ trợ: ' + cmd);
    }
  }};
}

test('cache-aside: lần đầu nạp từ loader, lần sau lấy từ Redis; TTL có jitter trong giới hạn', async () => {
  const redis = fakeRedis(); setRedisClientForTest(redis);
  let loads = 0;
  const key = cacheKey('unit', 'a');
  assert.deepEqual(await cached(key, 60, async () => { loads++; return {n: 1}; }), {n: 1});
  assert.deepEqual(await cached(key, 60, async () => { loads++; return {n: 2}; }), {n: 1});
  assert.equal(loads, 1);
  const ttl = redis.data.get(key).exp - Date.now();
  assert(ttl > 59_000 && ttl <= 66_000, 'TTL 60 s + jitter ≤ 10%: ' + ttl);
  assert.equal(redisStatus(), 'ok');
});

test('nhiều request cùng khóa khi chưa có cache chỉ nạp DB một lần', async () => {
  setRedisClientForTest(fakeRedis());
  let loads = 0;
  const loader = async () => { loads++; await new Promise(r => setTimeout(r, 30)); return {rows: [1, 2, 3]}; };
  const results = await Promise.all(Array.from({length: 50}, () => cached(cacheKey('unit', 'burst'), 30, loader)));
  assert.equal(loads, 1);
  assert(results.every(r => r.rows.length === 3));
});

test('distributed lock chỉ owner mới được release', async () => {
  const redis = fakeRedis(); setRedisClientForTest(redis);
  let loads = 0;
  const key = cacheKey('unit', 'owner-lock');
  const first = cached(key, 30, async () => { loads++; await new Promise(r => setTimeout(r, 30)); return {owner: 'first'}; });
  await new Promise(r => setTimeout(r, 5));
  const second = cached(key, 30, async () => { loads++; return {owner: 'second'}; });
  assert.deepEqual(await first, {owner: 'first'});
  assert.deepEqual(await second, {owner: 'first'});
  assert.equal(loads, 1);
});

test('Redis lỗi giữa chừng: trả thẳng dữ liệu từ loader, không ném lỗi', async () => {
  const redis = fakeRedis(); setRedisClientForTest(redis);
  redis.state.down = true;
  const before = cacheMetrics.error;
  assert.deepEqual(await cached(cacheKey('unit', 'down'), 30, async () => ({ok: true})), {ok: true});
  assert(cacheMetrics.error > before);
});

test('giá trị quá lớn không được ghi vào Redis', async () => {
  const redis = fakeRedis(); setRedisClientForTest(redis);
  process.env.REDIS_CACHE_MAX_BYTES = '100';
  try {
    await cached(cacheKey('unit', 'big'), 30, async () => ({text: 'x'.repeat(500)}));
    assert.equal(redis.data.has(cacheKey('unit', 'big')), false);
  } finally { delete process.env.REDIS_CACHE_MAX_BYTES; }
});

test('thế hệ nội dung: tăng thế hệ thì dữ liệu chung được nạp lại; invalidate xóa khóa cụ thể', async () => {
  setRedisClientForTest(fakeRedis());
  await new Promise(resolve => setImmediate(resolve)); // chờ việc "đổi thế hệ khi kết nối" chạy xong
  let version = 1;
  const read = () => cachedShared(['catalog', 'v1'], 600, async () => ({version}));
  assert.equal((await read()).version, 1);
  version = 2;
  assert.equal((await read()).version, 1, 'Chưa đổi thế hệ: vẫn là bản cache');
  await bumpGeneration('content');
  assert.equal((await read()).version, 2, 'Đổi thế hệ: nạp lại');

  let n = 0;
  const key = cacheKey('dashboard', 'student', 7);
  await cached(key, 15, async () => ({n: ++n}));
  await invalidate(key);
  assert.equal((await cached(key, 15, async () => ({n: ++n}))).n, 2);
});

test('raw: giữ và trả đúng chuỗi JSON, không parse lại', async () => {
  const redis = fakeRedis(); setRedisClientForTest(redis);
  await new Promise(resolve => setImmediate(resolve));
  const text = JSON.stringify({topics: [1, 2, 3]});
  let loads = 0;
  const read = () => cachedShared(['catalog', 'v2'], 600, async () => { loads++; return text; }, {raw: true});
  assert.equal(await read(), text);
  assert.equal(await read(), text);
  assert.equal(typeof (await read()), 'string');
  assert.equal(loads, 1);
});

test('không có Redis: cache bị bỏ qua, luôn gọi loader', async () => {
  setRedisClientForTest(null);
  let loads = 0;
  for (let i = 0; i < 3; i++) await cached(cacheKey('unit', 'none'), 30, async () => ++loads);
  assert.equal(loads, 3);
  assert.equal(redisStatus(), 'degraded');
});

test('rate limit: đếm trong Redis có hạn cửa sổ; Redis sập thì đếm trong bộ nhớ, không lỗi', async () => {
  const redis = fakeRedis(); setRedisClientForTest(redis);
  const store = new FallbackRedisStore('unit');
  store.init({windowMs: 60_000});
  for (let i = 1; i <= 3; i++) assert.equal((await store.increment('user:1')).totalHits, i);
  const k = [...redis.data.keys()].find(x => x.includes(':rl:unit:user:1'));
  assert(k, 'Khóa rate limit nằm trong Redis với tiền tố môi trường');
  assert(redis.data.get(k).exp > Date.now(), 'Khóa có hạn');
  assert.equal((await store.get('user:1')).totalHits, 3);
  await store.decrement('user:1');
  assert.equal((await store.get('user:1')).totalHits, 2);

  redis.state.down = true;
  const before = rateLimitMetrics.fallback;
  assert.equal((await store.increment('user:1')).totalHits, 1, 'Bộ nhớ đếm lại từ đầu');
  assert.equal(rateLimitMetrics.fallback, before + 1);
  store.shutdown();
});

test('mật khẩu kiểm trong worker thread cho kết quả như bcrypt', async () => {
  const hash = await hashPassword('Mat-khau-kiem-thu-1', 4);
  assert.equal(await verifyPassword('Mat-khau-kiem-thu-1', hash), true);
  assert.equal(await verifyPassword('sai', hash), false);
  const many = await Promise.all(Array.from({length: 12}, (_, i) => verifyPassword(i % 2 ? 'sai' : 'Mat-khau-kiem-thu-1', hash)));
  assert.deepEqual(many, Array.from({length: 12}, (_, i) => i % 2 === 0));
});
