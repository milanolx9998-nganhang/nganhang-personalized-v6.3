import {parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs';
import {parseImport} from './importAdapters.js';
try{parentPort.postMessage({result:parseImport(fs.readFileSync(workerData.path),workerData.filename,{sheetName:workerData.sheetName})});}catch(e){parentPort.postMessage({error:e.message});}
