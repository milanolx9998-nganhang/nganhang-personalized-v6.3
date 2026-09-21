import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import {pool,tx} from '../src/db/pool.js';
const source=path.resolve('../templates/TEMPLATE_CHUAN_TOAN_TRUONG_OUTCOME_YCCD_QUESTION_METADATA_V1_1.xlsx');
const wb=XLSX.read(fs.readFileSync(source),{type:'buffer'});
const rows=XLSX.utils.sheet_to_json(wb.Sheets['02_KHTN7_REFERENCE'],{defval:null});
if(rows.length!==97||new Set(rows.map(r=>r.outcome_code)).size!==30)throw Error('Reference khác 97 YCCĐ/30 Outcome; cần đối chiếu');
try{
 const report=await tx(async c=>{
  const subject=(await c.query("SELECT id FROM subjects WHERE code='KHTN'")).rows[0];
  if(!subject)throw Error('Chưa có môn KHTN');
  for(const row of rows){
   if(row.subject_code!=='KHTN'||Number(row.grade_code)!==7||!row.yccd_text)throw Error('Sai phạm vi reference');
   const vals=[subject.id,7,row.domain_code,row.outcome_code,row.outcome_title,row.curriculum_version,row.source_document,row.outcome_order];
   const outcome=(await c.query('INSERT INTO curriculum_outcomes(subject_id,grade,domain_code,code,title,curriculum_version,source_document,order_index) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(subject_id,grade,domain_code,curriculum_version,code) DO NOTHING RETURNING *',vals)).rows[0]||(await c.query('SELECT * FROM curriculum_outcomes WHERE subject_id=$1 AND grade=$2 AND domain_code=$3 AND code=$4 AND curriculum_version=$5',[subject.id,7,row.domain_code,row.outcome_code,row.curriculum_version])).rows[0];
   if(outcome.title!==row.outcome_title)throw Error('Outcome đã thay đổi; không ghi đè');
   const old=(await c.query('SELECT * FROM curriculum_yccds WHERE outcome_id=$1 AND code=$2',[outcome.id,row.yccd_code])).rows[0];
   if(old&&old.text!==row.yccd_text)throw Error('YCCĐ đã thay đổi; không ghi đè');
   await c.query('INSERT INTO curriculum_yccds(outcome_id,code,text,source_locator,source_row,order_index) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(outcome_id,code) DO NOTHING',[outcome.id,row.yccd_code,row.yccd_text,row.source_locator,row.source_row,row.yccd_order]);
  }
  await c.query(`UPDATE subject_profiles SET config=config||'{"domain_required":true,"domain_label":"Phân môn","curriculum_version":"GDPT2018","official_required_fields":["subject_id","grade","outcome_id","yccd_id","cognitive_level","type"]}'::jsonb WHERE subject_id=$1`,[subject.id]);
  return {source,reference_sheet:'02_KHTN7_REFERENCE',outcomes:30,yccds:97,missing_locators:rows.filter(r=>!r.source_locator).map(r=>r.yccd_code),illustrative_rows_ignored:true};
 });
 fs.mkdirSync('../artifacts',{recursive:true});fs.writeFileSync('../artifacts/v63-master-import.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await pool.end();}
