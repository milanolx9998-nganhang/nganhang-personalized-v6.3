// Dọn database tạm và thư mục uploads/dump do test tích hợp để lại (V6.6.6.1).
//
//   node scripts/cleanup-test-databases.mjs            → chỉ liệt kê (không xóa gì)
//   node scripts/cleanup-test-databases.mjs --apply    → xóa thật
//
// Chỉ đụng tới database có tên đúng mẫu test (nganhang_<nhãn>[_test]_<dấu thời gian>) và KHÔNG BAO GIỜ đụng
// tới database đang cấu hình trong backend/.env (DB_NAME). Thư mục/tệp chỉ xóa trong artifacts/ và chỉ
// đúng mẫu *-uploads-nganhang_*, *-source.dump hoặc nganhang_*_test_<số>.dump / -uploads.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'backend', 'package.json'));
require('dotenv').config({path: path.join(root, 'backend', '.env')});
const pg = require('pg');

const apply = process.argv.includes('--apply');
const TEMP_DB = /^nganhang_[a-z0-9]+(?:_test)?_\d{10,}$/;
const current = process.env.DB_NAME;
const pool = new pg.Pool({host: process.env.DB_HOST, port: process.env.DB_PORT, database: current, user: process.env.DB_USER, password: process.env.DB_PASSWORD});

try {
  const rows = (await pool.query("SELECT datname, pg_database_size(datname) AS bytes FROM pg_database WHERE datname LIKE 'nganhang_%' ORDER BY datname")).rows;
  const targets = rows.filter(r => TEMP_DB.test(r.datname) && r.datname !== current);
  const mb = bytes => (Number(bytes) / 1024 / 1024).toFixed(1) + ' MB';
  console.log(`Database tạm của test: ${targets.length} · ${mb(targets.reduce((n, r) => n + Number(r.bytes), 0))}`);
  for (const r of targets.slice(0, 10)) console.log('  ' + r.datname + ' · ' + mb(r.bytes));
  if (targets.length > 10) console.log(`  … và ${targets.length - 10} database nữa`);

  const artifacts = path.join(root, 'artifacts');
  const leftovers = fs.existsSync(artifacts)
    ? fs.readdirSync(artifacts).filter(n => /-uploads-nganhang_[a-z0-9_]+$/.test(n) || /-source\.dump$/.test(n) || /^nganhang_[a-z0-9]+_test_\d{10,}(?:\.dump|-uploads)$/.test(n)).map(n => path.join(artifacts, n))
    : [];
  console.log(`Thư mục uploads / tệp dump tạm trong artifacts/: ${leftovers.length}`);

  if (!apply) {
    console.log('\nChưa xóa gì. Chạy lại với --apply để xóa các mục trên.');
  } else {
    for (const r of targets) {
      await pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid() AND usename=current_user', [r.datname]);
      for (let attempt = 1; ; attempt++) {
        try { await pool.query('DROP DATABASE IF EXISTS ' + r.datname); break; }
        catch (e) {
          if (attempt >= 10 || !/being accessed/i.test(e.message)) { console.error(`Bỏ qua ${r.datname}: ${e.message}`); break; }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    for (const p of leftovers) fs.rmSync(p, {recursive: true, force: true});
    console.log(`\nĐã xóa ${targets.length} database tạm và ${leftovers.length} thư mục/tệp tạm.`);
  }
} finally {
  await pool.end();
}
