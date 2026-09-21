import 'dotenv/config';import fs from 'node:fs';import path from 'node:path';import {pool} from '../src/db/pool.js';import {fingerprint} from '../../scripts/database-fingerprint.mjs';
if(process.env.DB_NAME!=='nganhang_personalized_v63')throw Error('Unexpected target DB');
const root=path.resolve('..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'backups/v652-h0/2026-09-17T14-31-32-268Z/manifest.json')));
try{
 const current=await fingerprint(pool),checks={};for(const [name,value]of Object.entries(manifest.database_fingerprint))if(name!=='users')checks[name]={unchanged:JSON.stringify(value)===JSON.stringify(current[name]),...current[name]};
 const curriculum=(await pool.query("SELECT (SELECT count(*)::int FROM curriculum_outcomes) outcomes,(SELECT count(*)::int FROM curriculum_yccds) yccds,(SELECT count(*)::int FROM topic_yccd_map WHERE status='ACTIVE') active_maps")).rows[0];
 const report={at:new Date().toISOString(),database:process.env.DB_NAME,checks,all_learning_content_unchanged:Object.values(checks).every(c=>c.unchanged),users_count:current.users.count,users_hash_expected_to_change:'Session token_version was incremented during independent JWT rotation',curriculum};
 fs.writeFileSync(path.join(root,'artifacts/v652-preservation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.all_learning_content_unchanged)process.exitCode=1;
}finally{await pool.end();}
