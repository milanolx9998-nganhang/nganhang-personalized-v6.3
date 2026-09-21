import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(new URL('../backend/package.json',import.meta.url)),AdmZip=require('adm-zip'),dotenv=require('dotenv');
export function configuredSecrets(root){
 const configs=[path.join(root,'backend/.env'),path.join(root,'deploy/.env.home'),path.join(root,'deploy/.env.supabase-lan'),path.join(root,'deploy/.env.supabase-cloud-test'),...['nganhang-personalized-v1','nganhang-personalized-v5'].map(n=>path.join(root,'..',n,'backend/.env'))],secrets=[];
 for(const file of configs)if(fs.existsSync(file)){const env=dotenv.parse(fs.readFileSync(file));for(const key of ['DB_PASSWORD','JWT_SECRET','SESSION_SECRET','DATABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'])if(env[key]?.length>=8)secrets.push({key,value:env[key]});}
 return secrets;
}
export function auditRelease(file,secrets=[]){
 const zip=new AdmZip(file),entries=zip.getEntries(),manifest=JSON.parse(zip.readAsText('RELEASE_MANIFEST.json')),seen=new Set(),issues=[];
 for(const e of entries){const n=e.entryName,parts=n.split('/'),base=parts.at(-1);
  if(seen.has(n))issues.push({file:n,reason:'duplicate'});seen.add(n);
  if(n.startsWith('/')||n.includes('\\')||parts.includes('..')||parts.some(p=>['node_modules','uploads','backups','artifacts','.git'].includes(p))||(base.startsWith('.env')&&!base.endsWith('.example'))||/secret|\.dump$|\.dpapi$/i.test(base))issues.push({file:n,reason:'sensitive_path'});
  if(e.isDirectory)continue;
  const bytes=e.getData();if(n!=='RELEASE_MANIFEST.json'&&(!manifest.files[n]||crypto.createHash('sha256').update(bytes).digest('hex')!==manifest.files[n]))issues.push({file:n,reason:'manifest_mismatch'});
  const content=bytes.toString('utf8');for(const {key,value} of secrets)if(content.includes(value))issues.push({file:n,reason:'configured_'+key});
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content))issues.push({file:n,reason:'private_key'});
 }
 for(const name of Object.keys(manifest.files))if(!seen.has(name))issues.push({file:name,reason:'missing_file'});
 return {file,version:manifest.version,files:Object.keys(manifest.files).length,passed:issues.length===0,issues,content_scanned:true,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
}
