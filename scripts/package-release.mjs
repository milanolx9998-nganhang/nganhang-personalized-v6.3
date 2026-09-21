import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {auditRelease,configuredSecrets} from './releaseAudit.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(new URL('../backend/package.json',import.meta.url)),archiver=require('archiver');
const security=spawnSync(process.execPath,['scripts/security-gate.mjs'],{cwd:root,stdio:'inherit',windowsHide:true});
if(security.status!==0)throw new Error('Release blocked: security gate failed');
const exclusions=new Set(['node_modules','.git','.agents','uploads','backups','artifacts','releases']);
const files=[];
function walk(dir){for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
 const rel=path.posix.join(dir,entry.name);
 if(exclusions.has(entry.name)||entry.isSymbolicLink())continue;
 if(entry.isDirectory()){walk(rel);continue;}
 if((entry.name.startsWith('.env')&&!entry.name.endsWith('.example'))||/secret|\.dump$|\.log$|\.png$|\.pdf$/i.test(entry.name)&&!rel.startsWith('templates/'))continue;
 files.push(rel);
}}
// Explicit roots prevent accidentally shipping files from the user's Desktop.
for(const name of ['backend','frontend','scripts','docs','deploy','templates'])walk(name);
for(const name of ['package.json','package-lock.json','Dockerfile','compose.yaml','.dockerignore','.env.production.example','README.md'])if(fs.existsSync(path.join(root,name)))files.push(name);
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const gitRoot=spawnSync('git',['rev-parse','--show-toplevel'],{cwd:root,encoding:'utf8',windowsHide:true});
const git=gitRoot.status===0&&path.resolve(gitRoot.stdout.trim())===path.resolve(root)?spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}):{status:1};
const manifest={version,created_at:new Date().toISOString(),git_commit:git.status===0?git.stdout.trim():null,files:Object.fromEntries(files.sort().map(f=>[f,hash(f)])),migration_checksums:Object.fromEntries(files.filter(f=>/backend\/src\/db\/migration.*\.sql$/.test(f)).map(f=>[f,hash(f)])),build_hashes:Object.fromEntries(files.filter(f=>f.startsWith('frontend/dist/')).map(f=>[f,hash(f)])),contains_database:false,contains_uploads:false,contains_secrets:false};
if(!files.includes('frontend/dist/index.html'))throw new Error('Build frontend before packaging');
const outputDir=path.join(root,'releases');fs.mkdirSync(outputDir,{recursive:true});
const name='nganhang-v'+version+'-'+Date.now(),output=fs.createWriteStream(path.join(outputDir,name+'.zip'),{flags:'wx'}),zip=archiver('zip',{zlib:{level:9}});
const done=new Promise((resolve,reject)=>{output.on('close',resolve);output.on('error',reject);zip.on('error',reject);});
zip.pipe(output);for(const file of files)zip.file(path.join(root,file),{name:file});
zip.append(JSON.stringify(manifest,null,2),{name:'RELEASE_MANIFEST.json'});await zip.finalize();await done;
fs.writeFileSync(path.join(outputDir,name+'.manifest.json'),JSON.stringify(manifest,null,2));
const inspection=auditRelease(path.join(outputDir,name+'.zip'),configuredSecrets(root));
fs.writeFileSync(path.join(root,'artifacts/v651-release-secret-scan.json'),JSON.stringify(inspection,null,2));
if(!inspection.passed){fs.renameSync(path.join(outputDir,name+'.zip'),path.join(outputDir,name+'.blocked'));throw Error('Release rejected; see secret scan report (values redacted)');}
console.log(JSON.stringify({file:path.join(outputDir,name+'.zip'),bytes:zip.pointer(),files:files.length,version}));
