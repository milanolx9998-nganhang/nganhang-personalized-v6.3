import {fingerprint} from './database-fingerprint.mjs';
import {restoreMedia} from './restore-media.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../backend/package.json',import.meta.url));require('dotenv').config({path:new URL('../backend/.env',import.meta.url)});const {Pool}=require('pg');
const folder=path.resolve(process.argv[2]||''),target=process.argv[3];
if(!/^nganhang_restore_[a-z0-9_]+$/.test(target||''))throw new Error('Use a NEW target named nganhang_restore_<suffix>. Existing databases are never overwritten.');
const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
for(const [name,expected] of Object.entries(manifest.checksums)){if(path.basename(name)!==name)throw new Error('Unsafe manifest path');const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,name))).digest('hex');if(hash!==expected)throw new Error('Backup checksum mismatch: '+name);}
const pool=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
try{
 if((await pool.query('SELECT 1 FROM pg_database WHERE datname=$1',[target])).rowCount)throw new Error('Target already exists; refuse overwrite');
 await pool.query('CREATE DATABASE '+target);
 const env={...process.env,PGHOST:process.env.DB_HOST,PGPORT:process.env.DB_PORT||'5432',PGUSER:process.env.DB_USER,PGPASSWORD:process.env.DB_PASSWORD};
 const r=spawnSync('pg_restore',['--no-owner','--no-privileges','-d',target,path.join(folder,'database.dump')],{env,encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error(r.stderr);
 const restored=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:target});
 try{const restoredFingerprint=await fingerprint(restored);if(manifest.database_fingerprint&&JSON.stringify(restoredFingerprint)!==JSON.stringify(manifest.database_fingerprint))throw new Error('Restored database fingerprint mismatch');const counts=(await restored.query('SELECT (SELECT count(*) FROM questions)::int questions,(SELECT count(*) FROM question_versions)::int versions,(SELECT count(*) FROM attempts)::int attempts')).rows[0];const media=manifest.checksums['uploads.tar.gz']?restoreMedia(path.join(folder,'uploads.tar.gz'),path.join(folder,'restored-media-'+target)):null;const report={verified_database_fingerprint:!!manifest.database_fingerprint,fingerprint:restoredFingerprint,media,restored_database:target,counts,uploads_archive:manifest.checksums['uploads.tar.gz']?path.join(folder,'uploads.tar.gz'):null,next:'Validate then configure a separate instance. Media has been restored into a NEW directory.'};fs.writeFileSync(path.join(folder,'restore-report-'+target+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}finally{await restored.end();}
}finally{await pool.end();}
