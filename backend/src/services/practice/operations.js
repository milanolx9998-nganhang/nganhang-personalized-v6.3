import fs from 'node:fs';
import path from 'node:path';
import {pool} from '../../db/pool.js';
const http={requests:0,client_errors:0,server_errors:0};
export function recordHttp(status){http.requests++;if(status>=500)http.server_errors++;else if(status>=400)http.client_errors++;}
export async function operations(){
 const backupDir=path.resolve(process.env.BACKUP_DIR||'../backups');
 let backup={last_success:null,last_error:null};
 try{const s=JSON.parse(fs.readFileSync(path.join(backupDir,'status.json'),'utf8'));backup={last_success:s.last_success||null,bytes:s.bytes||null,last_error:s.last_error||null,remote_copied_and_hashed:!!s.remote_copied_and_hashed,off_device_verified:false};}catch{}
 let disk=null;try{const s=fs.statfsSync(process.cwd());disk={available_bytes:s.bavail*s.bsize,total_bytes:s.blocks*s.bsize};}catch{}
 const connections=(await pool.query("SELECT count(*)::int total,count(*) FILTER(WHERE state='active')::int active FROM pg_stat_activity WHERE datname=current_database()")).rows[0];
 return {http:{...http},at:new Date().toISOString(),uptime_seconds:process.uptime(),rss_bytes:process.memoryUsage().rss,cpu_microseconds:process.cpuUsage(),disk,connections,backup,backup_age_hours:backup.last_success?(Date.now()-new Date(backup.last_success))/3600000:null};
}
