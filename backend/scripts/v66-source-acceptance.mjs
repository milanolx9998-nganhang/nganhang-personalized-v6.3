import 'dotenv/config';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {parseWorkbook} from '../src/services/curriculumMaster/service.js';
import {mapRows,validateRows} from '../src/services/curriculumMaster/importRules.js';
import {pool} from '../src/db/pool.js';
const root=process.env.CURRICULUM_SOURCE_DIR||'G:/tai lieu  oppa/UP SHARE/outcome khtn';
const results=[];
try{
 for(const grade of [6,7,8,9]){
  const name='Outcome_YCCD_KHTN_'+grade+'.xlsx',buffer=fs.readFileSync(path.join(root,name));
  const workbook=await parseWorkbook({originalname:name,buffer}),sheet=workbook.sheets[0];
  const rows=sheet.rows.slice(5).filter(r=>String(r[2]||'').trim()),mapped=mapRows(rows,{domain:0,group:1,text:2,page:3},false),checked=validateRows(mapped);
  if(mapped.some((r,i)=>r.text!==String(rows[i][2])||r.domain!==String(rows[i][0])||r.group!==String(rows[i][1])||r.page!==String(rows[i][3])||r.outcome_title!==''))throw Error('Source preservation failed');
  results.push({grade,name,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),sheet:sheet.name,header_row:5,declared_count:Number(String(sheet.rows[2][0]).match(/YCCĐ:\s*(\d+)/)?.[1]),actual_count:rows.length,source_preserved:true,outcomes_inferred:false,blocked_without_explicit_outcome:checked.every(r=>['BLOCKED','DUPLICATE'].includes(r.row_status))});
 }
 const report={at:new Date().toISOString(),source_directory:root,mode:'read-only parser acceptance; no database import/publish',results};
 fs.writeFileSync(path.resolve('../artifacts/v66-source-acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await pool.end();}
