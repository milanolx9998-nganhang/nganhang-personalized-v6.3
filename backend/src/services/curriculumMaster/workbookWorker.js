import {parentPort,workerData} from 'node:worker_threads';
import XLSX from 'xlsx';
import * as cptable from 'xlsx/dist/cpexcel.full.mjs';
import AdmZip from 'adm-zip';
try{
 XLSX.set_cptable(cptable);
 const bytes=Buffer.from(workerData.bytes);
 if(bytes[0]===0x50&&bytes[1]===0x4b){
  const entries=new AdmZip(bytes).getEntries();let total=0;
  if(entries.length>4000)throw Error('Tệp có quá nhiều thành phần');
  for(const e of entries){total+=e.header.size;if(e.entryName.includes('..')||e.header.size>24*1024*1024||total>48*1024*1024)throw Error('Tệp nén vượt giới hạn');}
 }
 const book=XLSX.read(bytes,{type:'buffer',codepage:65001,cellFormula:false,cellHTML:false,cellText:true,sheetRows:5002});
 if(book.SheetNames.length>20)throw Error('Tối đa 20 sheet');
 const sheets=book.SheetNames.map(name=>{
  const sheet=book.Sheets[name],ref=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');
  if(ref.e.r>5000||ref.e.c>49)throw Error('Tối đa 5000 dòng và 50 cột mỗi sheet');
  return {name,rows:XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:'',blankrows:true})};
 });
 parentPort.postMessage({sheets});
}catch(e){parentPort.postMessage({error:e.message});}
