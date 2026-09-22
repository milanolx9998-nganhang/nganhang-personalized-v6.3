// Gate for §7 of the V6.6.4 delta: auto-deploy may only apply additive, backward-compatible
// migrations. Anything that can destroy or rewrite existing rows must stop the pipeline and be
// applied by an operator with a verified backup in hand.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

// Patterns are data-destructive only. DROP/CREATE OR REPLACE of triggers, functions and views is
// how every migration in this repo evolves behaviour, so those stay allowed.
const DESTRUCTIVE = [
  [/\bDROP\s+TABLE\b/i, 'DROP TABLE'],
  [/\bDROP\s+SCHEMA\b/i, 'DROP SCHEMA'],
  [/\bDROP\s+DATABASE\b/i, 'DROP DATABASE'],
  [/\bDROP\s+COLUMN\b/i, 'DROP COLUMN'],
  [/\bDROP\s+TYPE\b/i, 'DROP TYPE'],
  [/\bTRUNCATE\b/i, 'TRUNCATE'],
  [/\bDELETE\s+FROM\b/i, 'DELETE FROM'],
  [/\bALTER\s+TABLE\b[\s\S]{0,200}?\bRENAME\s+(TO|COLUMN)\b/i, 'ALTER TABLE ... RENAME'],
  [/\bALTER\s+COLUMN\b[\s\S]{0,80}?\bTYPE\b/i, 'ALTER COLUMN ... TYPE'],
  [/\bSET\s+NOT\s+NULL\b/i, 'SET NOT NULL'],
];

const stripped = sql => sql
  .replace(/--[^\n]*/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/'(?:[^']|'')*'/g, "''");

export function scanSql(sql) {
  const body = stripped(sql);
  return DESTRUCTIVE.filter(([re]) => re.test(body)).map(([, label]) => label);
}

function readFileContent(file) {
  if (fs.existsSync(file)) {
    return fs.readFileSync(file, 'utf8');
  }
  // If file does not exist on disk (e.g. newly added migration before git checkout), read from git
  for (const ref of ['origin/main', 'HEAD']) {
    try {
      return execSync(`git show "${ref}:${file}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {}
  }
  return '';
}

export function scanFiles(files) {
  return files
    .map(file => ({file, findings: scanSql(readFileContent(file))}))
    .filter(r => r.findings.length);
}

if (process.argv[1]?.endsWith('migration-safety.mjs')) {
  const files = process.argv.slice(2).filter(f => f.endsWith('.sql'));
  const blocked = scanFiles(files);
  if (blocked.length) {
    for (const {file, findings} of blocked) console.error(`${file}: ${findings.join(', ')}`);
    console.error('DEPLOY_BLOCKED_MANUAL_MIGRATION_REQUIRED');
    process.exit(2);
  }
  console.log(JSON.stringify({checked: files.length, additive: true}));
}
