import 'dotenv/config';
import fs from 'node:fs';
import {pool} from '../src/db/pool.js';
const baseline=JSON.parse(fs.readFileSync('../backups/v663-baseline/2026-09-21T03-50-33-508Z/manifest.json','utf8'));
const results={};
try{
 for(const [table,expected] of Object.entries(baseline.database_fingerprint)){
  const columns=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[table])).rows.map(r=>r.column_name).filter(c=>!(table==='attempt_items'&&c==='competency_snapshot'));
  const projection=columns.map(c=>'"'+c.replaceAll('"','""')+'"').join(',');
  const actual=(await pool.query(`SELECT count(*)::int count,md5(COALESCE(string_agg(row_text,chr(10) ORDER BY row_text),'')) hash FROM (SELECT row_to_json(t)::text row_text FROM (SELECT ${projection} FROM "${table}") t) rows`)).rows[0];
  results[table]={expected,actual,unchanged:actual.count===expected.count&&actual.hash===expected.hash};
 }
 const report={at:new Date().toISOString(),baseline:baseline.created_at,comparison:'Original columns, excluding only new nullable competency_snapshot column',results,passed:Object.values(results).every(r=>r.unchanged)};
 fs.writeFileSync('../artifacts/v663-preservation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
}finally{await pool.end();}
