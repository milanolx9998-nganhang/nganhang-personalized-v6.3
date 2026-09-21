import 'dotenv/config';
import {profile} from '../src/config/profile.js';
import {pool} from '../src/db/pool.js';
import {storage} from '../src/services/storage/index.js';
if(!profile.test)throw Error('Chỉ chạy trên profile Supabase thử nghiệm');
const c=await pool.connect();
try{
 await c.query('BEGIN');
 // PUBLIC grants are inherited by anon/authenticated. Remove default function
 // execution only for application-owned routines, never Supabase extensions.
 const routines=(await c.query("SELECT p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')")).rows;
 for(const {signature} of routines)await c.query('REVOKE EXECUTE ON ROUTINE '+signature+' FROM PUBLIC');
 await c.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');
 // Block direct PostgREST/anon access to application tables. Express remains the gateway.
 for(const role of ['anon','authenticated'])if((await c.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount){
  await c.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}`);
  await c.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${role}`);
  await c.query(`REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM ${role}`);
  await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${role}`);
  await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${role}`);
  await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM ${role}`);
 }
 await c.query('COMMIT');
 for(const id of ['question-media-private','import-source-private','exports-temporary']){
  try{await storage.privateBucket(id);}catch(e){if(e.code!=='ENOENT')throw e;await storage.request('/bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,name:id,public:false,file_size_limit:20*1024*1024})});}
 }
 await storage.health();console.log('Private buckets và quyền truy cập trực tiếp đã kiểm tra.');
}catch{await c.query('ROLLBACK').catch(()=>{});console.error('Bootstrap riêng tư chưa đạt; không khởi động app. Kiểm tra DB role/bucket qua kênh quản trị.');process.exitCode=1;}finally{c.release();await pool.end();}
