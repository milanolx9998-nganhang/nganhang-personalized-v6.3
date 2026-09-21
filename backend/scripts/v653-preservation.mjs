import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {pool} from '../src/db/pool.js';
import {fingerprint} from '../../scripts/database-fingerprint.mjs';
if(process.env.DB_NAME!=='nganhang_personalized_v63')throw Error('Unexpected target DB');
const root=path.resolve('..'),baseline='backups/v653-baseline/2026-09-20T18-03-14-407Z/manifest.json';
try{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,baseline),'utf8'));
 const current=await fingerprint(pool),checks=Object.fromEntries(Object.entries(manifest.database_fingerprint).map(([name,value])=>[name,{unchanged:JSON.stringify(value)===JSON.stringify(current[name]),...current[name]}]));
 const report={at:new Date().toISOString(),baseline,checks,passed:Object.values(checks).every(c=>c.unchanged)};
 fs.writeFileSync(path.join(root,'artifacts/v653-preservation.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
}finally{await pool.end();}
