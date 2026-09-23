// Kiểm cấu hình kết nối DB / Supavisor / Redis mà app đang dùng (PERF V6.6.7). Chỉ đọc, không in mật khẩu.
//
//   node scripts/perf-db-check.mjs            (trong thư mục backend, hoặc: docker compose ... exec app node scripts/perf-db-check.mjs)
//   node scripts/perf-db-check.mjs --json
import 'dotenv/config';
import pg from 'pg';

const asJson = process.argv.includes('--json');
const out = {app: {}, connection: {}, postgres: {}, top_queries: null, notes: []};

// ---- App đang cấu hình gì ----
out.app = {
  db_pool_max: Number(process.env.DB_POOL_MAX || 20),
  db_pool_idle_ms: Number(process.env.DB_POOL_IDLE_MS || 30000),
  db_pool_connect_ms: Number(process.env.DB_POOL_CONNECT_MS || 5000),
  slow_query_ms: Number(process.env.SLOW_QUERY_MS || 250),
  trust_proxy: process.env.TRUST_PROXY || null,
  rate_limit: {login_ip: Number(process.env.RATE_LIMIT_LOGIN_IP || 50), api_ip: Number(process.env.RATE_LIMIT_API_IP || 3000), api_user: Number(process.env.RATE_LIMIT_API_USER || 300)},
  redis: (() => {
    if (!process.env.REDIS_URL) return 'không dùng (REDIS_URL trống)';
    try { const u = new URL(process.env.REDIS_URL); return `${u.hostname}:${u.port || 6379}${u.password ? ' (có mật khẩu)' : ''}`; } catch { return 'REDIS_URL không hợp lệ'; }
  })(),
};

// ---- App nối vào đâu: Supavisor (session / transaction) hay thẳng PostgreSQL ----
let config;
if (process.env.DATABASE_URL) {
  const u = new URL(process.env.DATABASE_URL);
  const user = decodeURIComponent(u.username || '');
  const port = Number(u.port || 5432);
  // Supavisor self-host nhận user dạng <role>.<tenant_id>; cổng 6543 là transaction mode, 5432 là session mode.
  const viaSupavisor = user.includes('.');
  out.connection = {host: u.hostname, port, database: u.pathname.replace(/^\//, ''), user_role: user.split('.')[0],
    tenant: viaSupavisor ? user.split('.').slice(1).join('.') : null,
    route: viaSupavisor ? (port === 6543 ? 'Supavisor — transaction mode' : 'Supavisor — session mode') : 'PostgreSQL trực tiếp (không qua Supavisor)'};
  config = {connectionString: process.env.DATABASE_URL};
} else {
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT || 5432);
  const user = process.env.DB_USER || '';
  // Self-host Supavisor cũng có thể được cấu hình qua DB_HOST/DB_PORT thay vì DATABASE_URL.
  // Username tenant dạng postgres.<tenant-id> là tín hiệu chắc chắn hơn hostname localhost.
  const viaSupavisor = user.includes('.');
  out.connection = {host, port, database: process.env.DB_NAME, user_role: user.split('.')[0],
    tenant: viaSupavisor ? user.split('.').slice(1).join('.') : null,
    route: viaSupavisor ? (port === 6543 ? 'Supavisor — transaction mode' : 'Supavisor — session mode') : 'PostgreSQL trực tiếp (DB_HOST/DB_PORT)'};
  config = {host, port, database: process.env.DB_NAME, user, password: process.env.DB_PASSWORD};
}
if (out.connection.route.includes('transaction')) out.notes.push('App Node chạy lâu dài: nên dùng session mode (cổng 5432 của Supavisor) — xem docs/PERF_V6_6_7_REDIS_SUPAVISOR.md.');
if (out.connection.route.includes('trực tiếp')) out.notes.push('Production nên nối qua Supavisor; ghi lại quyết định nếu cố ý nối thẳng.');

const client = new pg.Client({...config, connectionTimeoutMillis: 5000});
try {
  await client.connect();
  const one = async sql => { try { return (await client.query(sql)).rows; } catch (e) { return {error: e.message}; } };
  const setting = async name => (await one(`SELECT setting FROM pg_settings WHERE name='${name}'`))?.[0]?.setting ?? null;
  out.postgres.version = (await one('SHOW server_version'))?.[0]?.server_version ?? null;
  out.postgres.max_connections = Number(await setting('max_connections'));
  out.postgres.superuser_reserved = Number(await setting('superuser_reserved_connections'));
  out.postgres.connections = await one(`SELECT COALESCE(usename,'(hệ thống)') AS role, COALESCE(NULLIF(application_name,''),'-') AS app, state, count(*)::int AS n
    FROM pg_stat_activity GROUP BY 1,2,3 ORDER BY n DESC LIMIT 20`);
  const ext = await one("SELECT extname FROM pg_extension WHERE extname='pg_stat_statements'");
  if (Array.isArray(ext) && ext.length) {
    // pg_stat_statements lưu câu đã chuẩn hóa ($1, $2…) — không chứa giá trị tham số.
    out.top_queries = await one(`SELECT calls, round(total_exec_time)::bigint AS total_ms, round(mean_exec_time::numeric,1) AS mean_ms, rows,
      left(regexp_replace(query,'\\s+',' ','g'),140) AS query FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 15`);
  } else out.notes.push('pg_stat_statements chưa bật: không có bảng truy vấn tốn thời gian nhất.');
  const budget = out.postgres.max_connections - out.postgres.superuser_reserved;
  out.notes.push(`Ngân sách kết nối Postgres ≈ ${budget}; mỗi tiến trình Node giữ tối đa ${out.app.db_pool_max} — cộng cả Auth/Storage/PostgREST của Supabase trước khi tăng.`);
} catch (e) {
  out.postgres.error = e.message;
} finally {
  await client.end().catch(() => {});
}

if (asJson) console.log(JSON.stringify(out, null, 2));
else {
  console.log('== App ==');
  console.log(out.app);
  console.log('== Kết nối ==');
  console.log(out.connection);
  console.log('== PostgreSQL ==');
  console.log({...out.postgres, connections: undefined});
  if (Array.isArray(out.postgres.connections)) console.table(out.postgres.connections);
  if (Array.isArray(out.top_queries)) { console.log('== Truy vấn tốn thời gian nhất (pg_stat_statements) =='); console.table(out.top_queries); }
  console.log('== Ghi chú ==');
  for (const n of out.notes) console.log('- ' + n);
  console.log('\nSupavisor: đọc thêm POOLER_DEFAULT_POOL_SIZE / POOLER_MAX_CLIENT_CONN / POOLER_TENANT_ID trong .env của Supabase (không in secret).');
}
