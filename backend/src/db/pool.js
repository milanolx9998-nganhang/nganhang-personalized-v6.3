import pg from 'pg';
import '../config/profile.js';

const { Pool } = pg;

export const pool = new Pool({
  ...(process.env.DATABASE_URL ? {connectionString:process.env.DATABASE_URL} : {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'nganhang_personalized_v63',
  user: process.env.DB_USER || 'nganhang',
  password: process.env.DB_PASSWORD || '',
  }),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

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
