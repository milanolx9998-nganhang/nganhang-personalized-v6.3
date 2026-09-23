import pg from 'pg';
import '../config/profile.js';
import {requestContext} from '../utils/requestContext.js';

const { Pool } = pg;
const positive = (name, fallback) => { const n = Number(process.env[name]); return Number.isInteger(n) && n > 0 ? n : fallback; };

// PERF V6.6.7: cỡ pool đọc từ môi trường, mặc định giữ như cũ (20 / 30 s / 5 s). Trước khi tăng DB_POOL_MAX,
// xem pool.waiting và truy vấn chậm ở /api/practice/operations: pool nghẽn thường do truy vấn chậm, không do thiếu kết nối.
// Tổng kết nối = số tiến trình Node × DB_POOL_MAX, phải nằm trong ngân sách Supavisor / max_connections.
export const POOL_CONFIG = {
  max: positive('DB_POOL_MAX', 20),
  idleTimeoutMillis: positive('DB_POOL_IDLE_MS', 30000),
  connectionTimeoutMillis: positive('DB_POOL_CONNECT_MS', 5000),
};
const SLOW_QUERY_MS = positive('SLOW_QUERY_MS', 250);

export const pool = new Pool({
  ...(process.env.DATABASE_URL ? {connectionString:process.env.DATABASE_URL} : {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'nganhang_personalized_v63',
  user: process.env.DB_USER || 'nganhang',
  password: process.env.DB_PASSWORD || '',
  }),
  ...POOL_CONFIG,
});

// ---- Số liệu pool + truy vấn chậm ----
const stats = {queries: 0, slow: 0, acquired: 0, waited: 0, wait_ms_total: 0, wait_ms_max: 0, max_waiting: 0, recent_slow: []};

// Nhãn truy vấn = đầu câu SQL (tham số đi riêng qua $1, $2… nên không chứa dữ liệu người dùng).
const label = text => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120);

function observe(text, started, ctx) {
  stats.queries++;
  const ms = performance.now() - started;
  if (ms < SLOW_QUERY_MS) return;
  stats.slow++;
  const entry = {query: label(text), duration_ms: Math.round(ms), request_id: ctx?.requestId || null, route: ctx?.route || null, at: new Date().toISOString()};
  stats.recent_slow.push(entry);
  if (stats.recent_slow.length > 20) stats.recent_slow.shift();
  console.warn(JSON.stringify({slow_query: entry.query, duration_ms: entry.duration_ms, request_id: entry.request_id, route: entry.route}));
}

// Bọc client.query một lần cho mỗi kết nối vật lý: đo cả pool.query lẫn truy vấn trong transaction.
pool.on('connect', client => {
  const original = client.query.bind(client);
  client.query = (config, values, callback) => {
    if (config && typeof config.submit === 'function') return original(config, values, callback);
    const text = typeof config === 'string' ? config : config?.text;
    const started = performance.now();
    const ctx = requestContext();
    const cb = typeof values === 'function' ? values : callback;
    if (typeof cb === 'function') {
      const done = (err, res) => { observe(text, started, ctx); cb(err, res); };
      return typeof values === 'function' ? original(config, done) : original(config, values, done);
    }
    return original(config, values).then(
      res => { observe(text, started, ctx); return res; },
      err => { observe(text, started, ctx); throw err; });
  };
});

// Đo thời gian chờ lấy kết nối từ pool: chờ lâu = pool nghẽn.
const connect = pool.connect.bind(pool);
pool.connect = callback => {
  const started = performance.now();
  const track = () => {
    const wait = performance.now() - started;
    stats.acquired++; stats.wait_ms_total += wait;
    if (wait > stats.wait_ms_max) stats.wait_ms_max = wait;
    if (wait >= 5) stats.waited++;
  };
  const result = typeof callback === 'function'
    ? connect((err, client, release) => { if (!err) track(); callback(err, client, release); })
    : connect().then(client => { track(); return client; });
  if (pool.waitingCount > stats.max_waiting) stats.max_waiting = pool.waitingCount;
  return result;
};

export function dbStats() {
  return {
    pool: {max: POOL_CONFIG.max, total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, max_waiting_seen: stats.max_waiting,
      acquired: stats.acquired, waited_over_5ms: stats.waited,
      wait_ms_avg: stats.acquired ? Math.round(stats.wait_ms_total / stats.acquired * 10) / 10 : 0, wait_ms_max: Math.round(stats.wait_ms_max)},
    queries: {count: stats.queries, slow: stats.slow, slow_threshold_ms: SLOW_QUERY_MS, recent_slow: [...stats.recent_slow]},
  };
}

export async function testConnection() {
  const client = await pool.connect();
  try { await client.query('SELECT 1'); }
  finally { client.release(); }
}

export async function query(text, params) {
  return pool.query(text, params);
}

export async function tx(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Runs the real mutation path and always rolls back. Used by bulk preflight so the preview is
// produced by the same domain code as execution instead of a re-implemented rule set.
export async function dryRun(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    return await callback(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}
