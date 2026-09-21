import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fingerprint} from './database-fingerprint.mjs';
const require=createRequire(new URL('../backend/package.json',import.meta.url));require('dotenv').config({path:new URL('../backend/.env',import.meta.url)});
const {Pool}=require('pg'),root=path.resolve(new URL('../',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const project=process.cwd();
if(path.basename(project)!=='nganhang-personalized-v5')throw new Error('Run from V5 root');
const status=JSON.parse(fs.readFileSync('backups/status.json','utf8')),manifest=JSON.parse(fs.readFileSync(path.join(status.folder,'manifest.json'),'utf8'));
const restoredFile=fs.readdirSync(status.folder).find(f=>f.startsWith('restore-report-')&&f.endsWith('.json'));if(!restoredFile)throw new Error('Restore report missing');
const restored=JSON.parse(fs.readFileSync(path.join(status.folder,restoredFile),'utf8'));
const cfg={host:process.env.DB_HOST,port:process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD},db=new Pool({...cfg,database:process.env.DB_NAME}),source=new Pool({...cfg,database:'nganhang_personalized_v1'});
function mediaFiles(dir){const out={};function walk(folder){for(const d of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,d.name);if(d.isSymbolicLink())throw new Error('Media symlink requires separate operator review');if(d.isDirectory())walk(file);else out[path.relative(dir,file).replaceAll('\\','/')]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}}walk(dir);return Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b)));}
try{
 const current=await fingerprint(db),sourceNow=await fingerprint(source),historical=['attempts','attempt_items','mastery_events','mastery_states','class_memberships','question_versions'];
 const unchanged=historical.every(t=>JSON.stringify(current[t])===JSON.stringify(manifest.database_fingerprint[t]));
 const media=mediaFiles(path.resolve('backend',process.env.UPLOAD_DIR||'uploads')),mediaRestored=mediaFiles(restored.media.directory);
 const mediaEqual=JSON.stringify(media)===JSON.stringify(mediaRestored);
 const sourceHistoryMatches=historical.every(t=>JSON.stringify(sourceNow[t])===JSON.stringify(manifest.database_fingerprint[t]));
 const load=JSON.parse(fs.readFileSync('artifacts/v5-load-test.json','utf8'));
 const resources=load.runs.map(run=>{const rows=load.resourceSamples.filter(s=>s.concurrency===run.concurrency),first=rows[0],last=rows.at(-1),elapsed=(new Date(last?.at)-new Date(first?.at))*1000;return {concurrency:run.concurrency,max_app_rss_mb:Math.max(...rows.map(s=>s.rss_bytes))/1048576,max_db_connections:Math.max(...rows.map(s=>s.connections.total)),sampled_average_app_cpu_percent:elapsed>0?100*((last.cpu_microseconds.user+last.cpu_microseconds.system)-(first.cpu_microseconds.user+first.cpu_microseconds.system))/elapsed:null};});
 const report={at:new Date().toISOString(),history_unchanged:unchanged,v4_source_history_matches:sourceHistoryMatches,media_files:Object.keys(media).length,media_hashes_match:mediaEqual,restore_verified:restored.verified_database_fingerprint,resources,notes:'User last_login may change during browser verification; historical tables do not. No original/V4 writes.'};
 fs.writeFileSync('artifacts/v5-integrity-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 if(!unchanged||!mediaEqual||!sourceHistoryMatches)process.exitCode=1;
}finally{await db.end();await source.end();}
