// Bộ đếm rate limit dùng chung qua Redis (PERF V6.6.7), tự quay về bộ nhớ tiến trình khi Redis không có / lỗi.
// Nhờ Redis: khởi động lại Node không xóa bộ đếm, và nhiều tiến trình Node dùng chung một giới hạn.
import {MemoryStore} from 'express-rate-limit';
import {command, redisConfig, redisReady} from '../services/cache/redis.js';

export const rateLimitMetrics = {redis: 0, memory: 0, fallback: 0, blocked: 0, blocked_by: {}};

export function countBlocked(name) {
  rateLimitMetrics.blocked++;
  rateLimitMetrics.blocked_by[name] = (rateLimitMetrics.blocked_by[name] || 0) + 1;
}

// Store theo giao diện express-rate-limit v8 (init / get / increment / decrement / resetKey).
// Mỗi limiter một store riêng (tên riêng) vì cùng khóa "user:5" được nhiều limiter dùng.
export class FallbackRedisStore {
  constructor(name) {
    this.name = name;
    this.memory = new MemoryStore();
    this.localKeys = false;
    this.prefix = name + ':';
  }

  init(options) {
    this.windowMs = options.windowMs;
    this.memory.init(options);
  }

  redisKey(key) { return [redisConfig().prefix, 'rl', this.name, key].join(':'); }

  wantsRedis() { return !!redisConfig().url && redisConfig().rateLimit; }

  async get(key) {
    if (this.wantsRedis() && redisReady()) {
      try {
        const k = this.redisKey(key);
        const hits = await command(['GET', k]);
        if (hits == null) return undefined;
        const ttl = Number(await command(['PTTL', k]));
        return {totalHits: Number(hits), resetTime: new Date(Date.now() + Math.max(ttl, 0))};
      } catch { /* rơi xuống bộ nhớ */ }
    }
    return this.memory.get(key);
  }

  async increment(key) {
    if (this.wantsRedis() && redisReady()) {
      try {
        const k = this.redisKey(key);
        // SET NX PX tạo khóa kèm hạn trong một lệnh; INCR giữ nguyên hạn. Không còn khóa "mất hạn".
        await command(['SET', k, '0', 'PX', this.windowMs, 'NX']);
        const totalHits = Number(await command(['INCR', k]));
        let ttl = Number(await command(['PTTL', k]));
        if (ttl < 0) { await command(['PEXPIRE', k, this.windowMs]); ttl = this.windowMs; }
        rateLimitMetrics.redis++;
        return {totalHits, resetTime: new Date(Date.now() + ttl)};
      } catch { /* rơi xuống bộ nhớ */ }
    }
    if (this.wantsRedis()) rateLimitMetrics.fallback++; else rateLimitMetrics.memory++;
    return this.memory.increment(key);
  }

  async decrement(key) {
    if (this.wantsRedis() && redisReady()) {
      try { await command(['DECR', this.redisKey(key)]); return; } catch { /* rơi xuống bộ nhớ */ }
    }
    return this.memory.decrement(key);
  }

  async resetKey(key) {
    if (this.wantsRedis() && redisReady()) await command(['DEL', this.redisKey(key)]).catch(() => {});
    return this.memory.resetKey(key);
  }

  shutdown() { this.memory.shutdown?.(); }
}
