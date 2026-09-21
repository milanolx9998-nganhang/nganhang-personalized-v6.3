import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {pool} from './pool.js';
const files=['schema.sql','migration-v45.sql','migration-v46.sql','migration-practice-enums.sql','migration-practice-v1.sql','migration-practice-integrity.sql','migration-practice-taxonomy.sql','migration-student-management.sql','migration-v63.sql','migration-v63-learning-scope.sql','migration-v643-scope.sql','migration-v643-flags.sql','migration-v643-review.sql','migration-v643-usage-guards.sql','migration-v643-active-metadata.sql','migration-v643-review-state.sql','migration-v643-draft-editor.sql'];
files.push('migration-v65-access.sql','migration-v65-compat.sql');
files.push('migration-v652-access.sql');
files.push('migration-v652-answer-release.sql');
files.push('migration-v652-compat-lock.sql');
files.push('migration-v653-delegation.sql');
files.push('migration-v663-curriculum.sql');
files.push('migration-v663-competency.sql');
const client=await pool.connect();
try {
 await client.query('SELECT pg_advisory_lock(9182741)');
 await client.query('CREATE TABLE IF NOT EXISTS app_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz DEFAULT now())');
 for(const name of files){
  const sql=fs.readFileSync(fileURLToPath(new URL(name,import.meta.url)),'utf8');
  const checksum=crypto.createHash('sha256').update(sql).digest('hex');
  const prior=(await client.query('SELECT checksum FROM app_migrations WHERE name=$1',[name])).rows[0];
  if(prior){if(prior.checksum!==checksum)throw new Error('Migration changed after application: '+name);continue;}
  await client.query('BEGIN');
  try {await client.query(sql);await client.query('INSERT INTO app_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);await client.query('COMMIT');console.log('Applied',name);}
  catch(e){await client.query('ROLLBACK');throw e;}
 }
} finally {await client.query('SELECT pg_advisory_unlock(9182741)');client.release();await pool.end();}
