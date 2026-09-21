import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  const args = process.argv.slice(2);
  const isReset = args.includes('--reset') || args.includes('-r');

  try {
    if (isReset) {
      console.log('⚠ RESET MODE — Đang xoá toàn bộ bảng cũ...');
      // Drop tất cả tables trong schema public (không cần quyền owner schema)
      await pool.query(`
        DO $$
        DECLARE
          r RECORD;
        BEGIN
          -- Drop views
          FOR r IN SELECT viewname FROM pg_views WHERE schemaname = 'public' LOOP
            EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.viewname) || ' CASCADE';
          END LOOP;
          -- Drop tables
          FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
            EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
          END LOOP;
          -- Drop enums
          FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' AND t.typtype = 'e' LOOP
            EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
          END LOOP;
          -- Drop functions
          FOR r IN SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.oid NOT IN (SELECT objid FROM pg_depend WHERE deptype = 'e') LOOP
            EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.args || ') CASCADE';
          END LOOP;
        END $$;
      `);
      console.log('✓ Đã xoá sạch schema cũ');
    }

    console.log('Đang chạy migration...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    await pool.query(schemaSql);
    console.log('✓ Migration thành công');
  } catch (err) {
    console.error('Migration lỗi:', err.message);
    if (err.message.includes('cannot be implemented') || err.message.includes('already exists')) {
      console.error('');
      console.error('💡 Có vẻ database đã có bảng cũ với schema khác.');
      console.error('   Chạy lại với cờ --reset để xoá sạch và tạo mới:');
      console.error('     node src/db/migrate.js --reset');
      console.error('   LƯU Ý: Cờ --reset sẽ XOÁ TOÀN BỘ dữ liệu hiện có!');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
