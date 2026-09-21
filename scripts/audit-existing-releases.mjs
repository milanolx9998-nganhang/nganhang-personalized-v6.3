import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {auditRelease,configuredSecrets} from './releaseAudit.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),folder=path.join(root,'releases'),secrets=configuredSecrets(root);
const reports=fs.readdirSync(folder).filter(n=>n.endsWith('.zip')).map(n=>auditRelease(path.join(folder,n),secrets));
fs.writeFileSync(path.join(root,'artifacts/v652-existing-release-audit.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports.map(r=>({file:r.file,passed:r.passed,issues:r.issues}))));
