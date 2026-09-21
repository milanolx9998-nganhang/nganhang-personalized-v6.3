import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pool} from '../src/db/pool.js';
if(process.env.DB_NAME!=='nganhang_personalized_v63')throw Error('Sai database V6.3');
const dir=path.resolve('../artifacts'),baseline=path.join(dir,'v643-qa-preservation-before.json');
try{
 const tables={questions:'SELECT id,current_version_id,normalized_content FROM questions ORDER BY id',versions:'SELECT id,question_id,content FROM question_versions ORDER BY id',attempts:'SELECT id,config,status,score,denominator,percentage FROM attempts ORDER BY id',items:'SELECT id,question_version_id,response,grade_result FROM attempt_items ORDER BY id',exams:'SELECT * FROM exam_items ORDER BY id'};
 const hashes={},counts={};
 for(const [name,sql] of Object.entries(tables)){const rows=(await pool.query(sql)).rows;counts[name]=rows.length;hashes[name]=crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');}
 const curriculum=(await pool.query("SELECT (SELECT count(*)::int FROM curriculum_outcomes) outcomes,(SELECT count(*)::int FROM curriculum_yccds) yccds,(SELECT count(*)::int FROM topic_yccd_map WHERE status='ACTIVE') active_mappings,(SELECT count(*)::int FROM topic_yccd_map WHERE status='CANDIDATE') candidate_mappings,(SELECT count(*)::int FROM questions WHERE metadata_status='VERIFIED') verified_questions")).rows[0];
 const report={at:new Date().toISOString(),database:process.env.DB_NAME,counts,hashes,curriculum};
 if(process.argv.includes('--compare')){const before=JSON.parse(fs.readFileSync(baseline,'utf8'));report.source_database_unchanged=JSON.stringify(before.hashes)===JSON.stringify(hashes);fs.writeFileSync(path.join(dir,'v643-qa-preservation-after.json'),JSON.stringify(report,null,2));if(!report.source_database_unchanged)throw Error('Dữ liệu nội dung/lịch sử đã đổi sau QA');}
 else {if(fs.existsSync(baseline))throw Error('Đã có mốc bảo toàn; không ghi đè');fs.writeFileSync(baseline,JSON.stringify(report,null,2));}
 console.log(JSON.stringify(report));
}finally{await pool.end();}
