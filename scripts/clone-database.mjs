// One-time, additive clone. Never modifies the source database.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const source = path.resolve(process.argv[2] || '');
const destination = path.resolve(process.argv[3] || '');
if (!source || !destination || source === destination) throw new Error('Supply distinct source and destination');
const require = createRequire(path.join(source, 'backend/package.json'));
const dotenv = require('dotenv');
const { Pool } = require('pg');
const env = dotenv.parse(fs.readFileSync(path.join(source, 'backend/.env')));
const dbName = 'nganhang_personalized_v5';
const pool = new Pool({ host: env.DB_HOST, port: Number(env.DB_PORT || 5432), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD });
const backupDir = path.join(destination, 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, 'v4-before-upgrade.dump');
const pgEnv = { ...process.env, PGHOST: env.DB_HOST, PGPORT: env.DB_PORT || '5432', PGUSER: env.DB_USER, PGPASSWORD: env.DB_PASSWORD };
try {
  const identity = (await pool.query('SELECT current_database() AS name, rolcreatedb FROM pg_roles WHERE rolname=current_user')).rows[0];
  console.log(JSON.stringify({source: identity.name, canCreateDatabase: identity.rolcreatedb}));
  if (!fs.existsSync(backup)) {
    const dump = spawnSync('pg_dump', ['-Fc', '-d', env.DB_NAME, '-f', backup], {env: pgEnv, encoding:'utf8'});
    if (dump.status !== 0) throw new Error(dump.stderr || 'pg_dump failed');
  }
  console.log('Backup verified:', fs.statSync(backup).size, 'bytes');
  const exists = await pool.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName]);
  if (exists.rowCount) throw new Error('Destination database already exists; refusing overwrite');
  await pool.query('CREATE DATABASE ' + dbName);
  const restore = spawnSync('pg_restore', ['--no-owner','--no-privileges','-d', dbName, backup], {env: pgEnv, encoding:'utf8'});
  if (restore.status !== 0) throw new Error(restore.stderr || 'Restore failed');
  const output = {...env, DB_NAME:dbName, PORT:'3002', HOST:'127.0.0.1', CORS_ORIGIN:'http://localhost:3002,http://localhost:5173', JWT_SECRET:crypto.randomBytes(48).toString('hex'), NODE_ENV:'development'};
  fs.writeFileSync(path.join(destination,'backend/.env'), Object.entries(output).map(([k,v])=>`${k}=${JSON.stringify(String(v))}`).join('\n')+'\n');
  const clone = new Pool({host:env.DB_HOST, port:Number(env.DB_PORT||5432),database:dbName,user:env.DB_USER,password:env.DB_PASSWORD});
  const counts = {};
  for (const table of ['questions','users','topics','exam_runs','exam_items']) {
    const original=(await pool.query('SELECT count(*)::int AS n FROM '+table)).rows[0].n;
    const copied=(await clone.query('SELECT count(*)::int AS n FROM '+table)).rows[0].n;
    if(original!==copied) throw new Error('Count mismatch '+table);
    counts[table]={original,copied};
  }
  await clone.end();
  fs.writeFileSync(path.join(backupDir,'clone-verification.json'), JSON.stringify({source:env.DB_NAME,destination:dbName,sha256:crypto.createHash('sha256').update(fs.readFileSync(backup)).digest('hex'),counts},null,2));
  console.log(JSON.stringify({destination:dbName,counts}));
} finally { await pool.end(); }
