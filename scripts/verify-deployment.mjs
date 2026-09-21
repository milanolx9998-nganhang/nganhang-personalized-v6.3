import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {auditRelease,configuredSecrets} from './releaseAudit.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const archive=process.env.RELEASE_ZIP,expected=process.env.VERIFIED_RELEASE_SHA256;
if(!archive||!path.isAbsolute(archive)||!/^[a-f0-9]{64}$/i.test(expected||''))throw Error('Thiếu absolute RELEASE_ZIP / VERIFIED_RELEASE_SHA256');
const actual=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
if(actual!==expected.toLowerCase())throw Error('SHA256 không khớp bản phát hành đã duyệt');
const audit=auditRelease(archive,configuredSecrets(root));
if(!audit.passed)throw Error('Release audit không đạt');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'RELEASE_MANIFEST.json'),'utf8'));
for(const [relative,hash] of Object.entries(manifest.files)){
 const target=path.resolve(root,relative);
 if(!target.startsWith(path.resolve(root)+path.sep))throw Error('Manifest path ngoài release');
 if(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')!==hash)throw Error('Release đã thay đổi: '+relative);
}
// Check the deployed manifest itself matches the audited archive.
const {createRequire}=await import('node:module');
const require=createRequire(new URL('../backend/package.json',import.meta.url)),Zip=require('adm-zip');
if(!fs.readFileSync(path.join(root,'RELEASE_MANIFEST.json')).equals(new Zip(archive).readFile('RELEASE_MANIFEST.json')))throw Error('Manifest không thuộc ZIP đã duyệt');
console.log('Release checksum, manifest và source đã xác minh; không bao gồm cấu hình riêng.');
