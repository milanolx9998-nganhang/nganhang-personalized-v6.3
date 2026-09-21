import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),source=path.resolve(root,'../nganhang-personalized-v5');
if(path.basename(root)!=='nganhang-personalized-v6.3')throw Error('Sai bản sao');
const require=createRequire(new URL('../backend/package.json',import.meta.url)),{Pool}=require('pg'),cfg=require('dotenv').parse(fs.readFileSync(path.join(root,'backend/.env')));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'backups/v5-baseline/manifest.json')));
const sourceDb=new Pool({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'nganhang_personalized_v5'}),targetDb=new Pool({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:cfg.DB_NAME});
const report={generated_at:new Date().toISOString(),target:root,source_database_unchanged:true,source_table_changes:[],changed_files:[],added_files:[],encoding_errors:[]};
try{
 for(const [table,expected] of Object.entries(manifest.tables)){if(!/^[a-z_]+$/.test(table))throw Error('Invalid table');const actual=(await sourceDb.query("SELECT count(*)::int count,md5(COALESCE(string_agg(to_jsonb(t)::text,'|' ORDER BY to_jsonb(t)::text),'')) hash FROM "+table+' t')).rows[0];if(JSON.stringify(actual)!==JSON.stringify(expected)){report.source_database_unchanged=false;report.source_table_changes.push(table);}}
 report.master_counts=(await targetDb.query('SELECT (SELECT count(*)::int FROM curriculum_outcomes) outcomes,(SELECT count(*)::int FROM curriculum_yccds) yccds,(SELECT count(*)::int FROM curriculum_yccds WHERE source_locator IS NULL OR source_locator=\'\') missing_locators')).rows[0];
 report.data_counts=(await targetDb.query('SELECT (SELECT count(*)::int FROM users) users,(SELECT count(*)::int FROM questions) questions,(SELECT count(*)::int FROM question_versions) versions,(SELECT count(*)::int FROM attempts) attempts')).rows[0];
 const excluded=new Set(['node_modules','dist','artifacts','backups','releases','uploads','.git']);
 const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(excluded.has(ent.name)||ent.name.startsWith('.env')||ent.name.includes('secret'))continue;const p=path.join(dir,ent.name);if(ent.isDirectory()){walk(p);continue;}const rel=path.relative(root,p),old=path.join(source,rel);if(!fs.existsSync(old))report.added_files.push(rel);else if(hash(p)!==hash(old))report.changed_files.push(rel);if(/\.(js|jsx|mjs|md|sql|css)$/.test(p)&&fs.readFileSync(p,'utf8').includes('\uFFFD'))report.encoding_errors.push(rel);}}
 walk(root);
 fs.writeFileSync(path.join(root,'artifacts/v63-verification.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({source_database_unchanged:report.source_database_unchanged,source_table_changes:report.source_table_changes,master_counts:report.master_counts,data_counts:report.data_counts,changed:report.changed_files.length,added:report.added_files.length,encoding_errors:report.encoding_errors}));
 if(report.encoding_errors.length)process.exitCode=1;
}finally{await sourceDb.end();await targetDb.end();}
