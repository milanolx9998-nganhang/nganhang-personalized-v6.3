import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
// Only regular files/directories; never follow archived links or overwrite a destination.
export function restoreMedia(archive,destination){
 const root=path.resolve(destination);
 if(fs.existsSync(root))throw new Error('Thư mục khôi phục đã tồn tại; không ghi đè');
 const buffer=gunzipSync(fs.readFileSync(archive),{maxOutputLength:512*1024*1024}),entries=[];
 for(let offset=0;offset+512<=buffer.length;){
  const header=buffer.subarray(offset,offset+512);if(header.every(b=>b===0))break;
  const str=(start,size)=>header.subarray(start,start+size).toString('utf8').replace(/\0.*$/s,'');
  const size=parseInt(str(124,12).trim()||'0',8),type=str(156,1)||'0',prefix=str(345,155);
  let name=(prefix?prefix+'/':'')+str(0,100);name=name.replace(/^\.\//,'');
  const expected=parseInt(str(148,8).trim(),8),actual=header.reduce((sum,b,i)=>sum+(i>=148&&i<156?32:b),0);
  if(expected!==actual||!Number.isSafeInteger(size)||size<0||offset+512+size>buffer.length)throw new Error('Header TAR không hợp lệ');
  if(type==='x'||type==='g'){
   const metadata=buffer.subarray(offset+512,offset+512+size).toString('utf8');
   if(/\d+ (?:path|linkpath|size|GNU\.sparse[^=]*)=/.test(metadata))throw new Error('TAR PAX thay đổi đường dẫn/kích thước; cần quản trị kiểm tra');
   offset+=512+Math.ceil(size/512)*512;continue;
  }
  if(!['0','5'].includes(type))throw new Error('TAR chứa link hoặc định dạng mở rộng không hỗ trợ');
  if(name.includes('\\')||name.includes(':')||name.startsWith('/')||name.split('/').includes('..'))throw new Error('Đường dẫn TAR không an toàn');
  const file=path.resolve(root,name);if(file!==root&&!file.startsWith(root+path.sep))throw new Error('Đường dẫn vượt thư mục đích');
  entries.push({file,type,data:buffer.subarray(offset+512,offset+512+size)});
  offset+=512+Math.ceil(size/512)*512;
 }
 fs.mkdirSync(root);let count=0;
 for(const entry of entries){if(entry.type==='5'){fs.mkdirSync(entry.file,{recursive:true});continue;}fs.mkdirSync(path.dirname(entry.file),{recursive:true});fs.writeFileSync(entry.file,entry.data,{flag:'wx'});count++;}
 return {directory:root,files:count};
}
