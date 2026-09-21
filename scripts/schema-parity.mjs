// Read-only comparison. Supply connections via environment, never CLI arguments/logs.
import {createRequire} from 'node:module';import fs from 'node:fs';
const require=createRequire(new URL('../backend/package.json',import.meta.url)),{Client}=require('pg');
const sql={
 tables:"SELECT c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v') ORDER BY 1",
 columns:"SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
 indexes:"SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname",
 constraints:"SELECT c.conname,t.relname,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,c.conname",
 triggers:"SELECT event_object_table,trigger_name,event_manipulation,action_statement,action_timing FROM information_schema.triggers WHERE trigger_schema='public' ORDER BY event_object_table,trigger_name,event_manipulation",
 functions:"SELECT p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.classid='pg_proc'::regclass AND d.deptype='e') ORDER BY p.proname,args"
};
if(!process.env.PARITY_LOCAL_DATABASE_URL||!process.env.PARITY_TEST_DATABASE_URL)throw Error('Cần hai URL DB riêng qua PARITY_LOCAL_DATABASE_URL và PARITY_TEST_DATABASE_URL');
const identity=value=>{const u=new URL(value);return [u.hostname,u.port||'5432',u.pathname].join(':');};
if(identity(process.env.PARITY_LOCAL_DATABASE_URL)===identity(process.env.PARITY_TEST_DATABASE_URL))throw Error('Không được so cùng một DB');
const clients=[process.env.PARITY_LOCAL_DATABASE_URL,process.env.PARITY_TEST_DATABASE_URL].map(connectionString=>new Client({connectionString,connectionTimeoutMillis:5000}));
try{
 const snapshots=[];for(const c of clients){await c.connect();await c.query('BEGIN READ ONLY');const snapshot={};for(const[k,q]of Object.entries(sql))snapshot[k]=(await c.query(q)).rows;await c.query('COMMIT');snapshots.push(snapshot);}
 const differences=Object.keys(sql).filter(k=>JSON.stringify(snapshots[0][k])!==JSON.stringify(snapshots[1][k]));
 const report={at:new Date().toISOString(),passed:!differences.length,compared_schema:'public',excluded_schemas:['auth','storage','realtime','extensions'],differences,counts:snapshots.map(s=>Object.fromEntries(Object.entries(s).map(([k,v])=>[k,v.length])))};
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/v653-schema-parity.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(differences.length)process.exitCode=1;
}catch{console.error('Schema parity không hoàn tất; kiểm tra kết nối/quyền DB. Không in credential.');process.exitCode=1;}finally{await Promise.all(clients.map(c=>c.end().catch(()=>{})));}
