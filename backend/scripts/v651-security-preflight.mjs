import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
const root=path.resolve('..'),current=dotenv.parse(fs.readFileSync('.env'));
const client=new pg.Client({host:current.DB_HOST,port:Number(current.DB_PORT),database:current.DB_NAME,user:current.DB_USER,password:current.DB_PASSWORD});
await client.connect();
try{
 const role=(await client.query('SELECT rolname,rolsuper,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user')).rows[0];
 const owners=(await client.query('SELECT datname FROM pg_database WHERE datdba=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND NOT datistemplate')).rows.map(r=>r.datname);
 const shared=[];for(const name of ['nganhang-personalized-v1','nganhang-personalized-v5']){const file=path.join(root,'..',name,'backend','.env');if(!fs.existsSync(file))continue;const old=dotenv.parse(fs.readFileSync(file));shared.push({project:name,same_db_server:old.DB_HOST===current.DB_HOST&&old.DB_PORT===current.DB_PORT,same_db_role:old.DB_USER===current.DB_USER,same_db_password:old.DB_PASSWORD===current.DB_PASSWORD,same_jwt_secret:old.JWT_SECRET===current.JWT_SECRET});}
 const report={at:new Date().toISOString(),target_database:current.DB_NAME,role,owned_database_count:owners.length,shared_configuration:shared,secret_values_logged:false};
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts','v651-secret-preflight.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await client.end();}
