import AdmZip from 'adm-zip';
import {XMLParser} from 'fast-xml-parser';
import XLSX from 'xlsx';
import path from 'node:path';
import crypto from 'node:crypto';
import he from 'he';
import {normalizeQuestion,levelNumber} from './grading.js';
export function safeZip(buffer){
 const zip=new AdmZip(buffer),entries=zip.getEntries();let total=0;
 if(entries.length>3000)throw new Error('ZIP vượt 3000 mục');
 for(const e of entries){const name=e.entryName.replace(/\\/g,'/');if(name.startsWith('/')||name.split('/').includes('..')||/^[a-z]:/i.test(name)||name.includes('\0'))throw new Error('ZIP chứa đường dẫn không an toàn');total+=e.header.size;if(e.header.size>32*1024*1024||total>128*1024*1024||e.header.size/Math.max(1,e.header.compressedSize)>200)throw new Error('ZIP vượt giới hạn giải nén');}
 return zip;
}
export function imageType(b){if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {mime:'image/png',ext:'png'};if(b[0]===255&&b[1]===216&&b[2]===255)return {mime:'image/jpeg',ext:'jpg'};if(b.subarray(0,6).toString().match(/^GIF8[79]a$/))return {mime:'image/gif',ext:'gif'};if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return {mime:'image/webp',ext:'webp'};throw new Error('Ảnh không đúng MIME PNG/JPEG/GIF/WebP');}
function mediaOf(zip){return zip.getEntries().filter(e=>!e.isDirectory&&/\.(png|jpe?g|gif|webp)$/i.test(e.entryName)).map(e=>{const data=e.getData(),type=imageType(data),hash=crypto.createHash('sha256').update(data).digest('hex');return {path:e.entryName,filename:path.posix.basename(e.entryName),...type,checksum:hash,data:data.toString('base64'),url:`/uploads/media/${hash}.${type.ext}`};});}
const arr=v=>v==null?[]:Array.isArray(v)?v:[v];
const xml=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false});
const safeXML=s=>{if(/<!DOCTYPE|<!ENTITY/i.test(s))throw new Error('XML entity/DOCTYPE không được phép');return s;};
function textOf(value){if(value==null)return '';if(typeof value!=='object')return String(value);return Object.entries(value).filter(([k])=>!k.startsWith('@_')).map(([,v])=>arr(v).map(textOf).join('')).join('');}
function htmlText(s,media=[]){return he.decode(String(s||'')).replace(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi,(_,src)=>{const clean=decodeURIComponent(src).replace(/\$IMS-CC-FILEBASE\$\/?/,'');const exact=media.filter(m=>m.path===clean||m.filename===path.posix.basename(clean));return exact.length===1?`![Ảnh](${exact[0].url})`:'[Ảnh chưa xác định: '+clean+']';}).replace(/<\/?(?:p|div|br|tr)[^>]*>/gi,'\n').replace(/<[^>]+>/g,'').trim();}
// Nhận cả dạng chuẩn "Câu L. 2. 1. NB. 2. ĐS" lẫn dạng viết liền cũ "Câu.L.2.1.NB.2.ĐS"; mã luôn được
// chuẩn hóa về dạng chính thức. Dòng trông như mã hiện hành nhưng đọc không được thì giữ nguyên
// văn ở `code_raw` để tầng kiểm tra báo lỗi — không được lặng lẽ coi là câu không có mã.
// V6.6.7.4: chữ đầu mã là phân môn (KHTN L/H/S) hoặc chữ của môn (Toán T, Lịch sử LS…), 1–3 chữ.
const KHTN_CODE=/^Câu[\s.]+([A-ZĐ]{1,3})\s*\.\s*(\d+)\s*\.\s*(\d+)\s*\.\s*(NB|TH|VD|VDC)\s*\.\s*(\d+)\s*\.\s*(TN|ĐS|TLN|GN|TL)/iu;
const CODE_ATTEMPT=/^Câu[\s.]+[A-Za-zĐđ]{1,3}\s*\./u;
export function parseKhtnCode(line){
 const m=line.match(KHTN_CODE);
 if(!m)return CODE_ATTEMPT.test(line)?{code_raw:line.split(/\s{2,}|:\s/)[0].trim()}:{};
 const canonical=`Câu ${m[1].toUpperCase()}. ${m[2]}. ${m[3]}. ${m[4].toUpperCase()}. ${m[5]}. ${m[6].toUpperCase()}`;
 return {display_code:canonical,outcome:m[2],yccd:m[3],branch_code:m[1].toUpperCase(),cognitive_level:levelNumber(m[4].toUpperCase()),q_type:m[6].toUpperCase(),
  code_legacy:m[0].replace(/\s+/g,' ').trim()!==canonical,header_tail:line.slice(m[0].length).replace(/^[\s:.)–—-]+/,'')};
}
export function omml(node,warnings=[]){
 if(Array.isArray(node))return node.map(n=>omml(n,warnings)).join('');if(!node||typeof node!=='object')return String(node||'');
 return Object.entries(node).filter(([key])=>key!==':@').map(([key,children])=>{
  const k=key.replace(/^.*:/,'');const list=arr(children);const part=name=>omml(list.filter(n=>Object.keys(n).some(k=>k.split(':').at(-1)===name)),warnings);
  if(k==='#text')return String(children);
  if(k.endsWith('Pr'))return '';
  if(k==='f')return `\\frac{${part('num')}}{${part('den')}}`;
  if(k==='sSup')return `{${part('e')}}^{${part('sup')}}`;
  if(k==='sSub')return `{${part('e')}}_{${part('sub')}}`;
  if(k==='sSubSup')return `{${part('e')}}_{${part('sub')}}^{${part('sup')}}`;
  if(k==='rad')return `\\sqrt${part('deg')?'['+part('deg')+']':''}{${part('e')}}`;
  if(k==='d')return `(${part('e')})`;
  if(['nary','m','eqArr','limLow','limUpp','acc'].includes(k))warnings.push('Công thức phức tạp được bảo toàn dạng tuyến tính; cần kiểm tra lại trước xác nhận');
  return omml(list,warnings);
 }).join('');
}
export function parseDocx(buffer){
 const zip=safeZip(buffer),media=mediaOf(zip),warnings=[];
 const relEntry=zip.getEntry('word/_rels/document.xml.rels');const rels=relEntry?arr(xml.parse(safeXML(relEntry.getData().toString())).Relationships?.Relationship):[];
 const relMap=new Map(rels.filter(r=>r['@_TargetMode']!=='External').map(r=>[r['@_Id'],path.posix.normalize('word/'+r['@_Target'])]));
 const entry=zip.getEntry('word/document.xml');if(!entry)throw new Error('Không phải DOCX hợp lệ');
 const ordered=new XMLParser({ignoreAttributes:false,preserveOrder:true,parseTagValue:false});const doc=ordered.parse(safeXML(entry.getData().toString('utf8')));
 const find=(nodes,name)=>arr(nodes).flatMap(n=>Object.entries(n).filter(([k])=>k!==':@').flatMap(([k,v])=>k===name?arr(v):typeof v==='object'?find(v,name):[]));
 function inline(nodes){return arr(nodes).map(n=>Object.entries(n).filter(([k])=>k!==':@').map(([k,v])=>{
  if(k==='#text')return String(v);if(k==='m:oMath'||k==='m:oMathPara')return '$'+omml(v,warnings)+'$';if(k==='w:tab')return ' ';if(k==='w:br')return '\n';if(k.endsWith('Pr'))return '';
  if(k==='a:blip'){const id=n[':@']?.['@_r:embed'];const img=media.find(m=>m.path===relMap.get(id));if(!img){warnings.push('Ảnh không xác định được vị trí');return '[Ảnh cần kiểm tra]';}return `![Ảnh](${img.url})`;}
  return typeof v==='object'?inline(v):String(v||'');
 }).join('')).join('');}
 const blocks=[];for(const block of find(doc,'w:body')){if(block['w:p'])blocks.push({type:'paragraph',text:inline(block['w:p'])});if(block['w:tbl']){const rows=arr(block['w:tbl']).filter(n=>n['w:tr']).map(n=>arr(n['w:tr']).filter(c=>c['w:tc']).map(c=>inline(c['w:tc'])));blocks.push({type:'table',rows,text:rows.map(row=>'| '+row.join(' | ')+' |').join('\n')});}}
 const items=[];let q=null,section='stem';const metadata=[];
 for(const block of blocks){const line=block.text.trim();if(/^Câu(?:\s+\d+|[\s.]+[A-Za-zĐđ]{1,3}\s*\.)/iu.test(line)){
   q={...parseKhtnCode(line),stem:'',options:[],statements:[],blocks:[],parser_warnings:[],source_locator:'Câu '+(items.length+1)};items.push(q);section='stem';
   const plain=line.replace(/^Câu\s+\d+\s*[.:)]\s*/i,'');if(q.display_code)q.stem=q.header_tail||'';else if(plain!==line&&!q.code_raw)q.stem=plain;delete q.header_tail;continue;
  }
  if(!q){metadata.push(line);continue;}
  if(/^Đáp án\s*:/i.test(line)){q.answer_key=line.replace(/^Đáp án\s*:\s*/i,'');section='answer';continue;}
  if(/^(Lời giải|Hướng dẫn giải|Giải thích)\s*:/i.test(line)){q.explanation=line.replace(/^[^:]+:\s*/,'');section='explanation';continue;}
  const option=line.match(/^([A-Da-d])[.)]\s*(.*)$/s);
  if(option&&section!=='explanation'){const id=option[1];if(id===id.toLowerCase()){q.statements.push({id,text:option[2]});q.q_type||='true_false';}else {q.options.push({id,text:option[2]});q.q_type||='mcq4';}section='option';continue;}
  if(block.type==='table'&&q.q_type==='GN'){
   const rows=block.rows.filter(r=>!r.some(t=>/^Cột\s+[AB]/i.test(t.trim())));q.left=rows.filter(r=>r[0]).map((r,i)=>({id:r[0].match(/^([A-Z])[.)]/)?.[1]||String.fromCharCode(65+i),text:r[0].replace(/^[A-Z][.)]\s*/, '')}));q.right=rows.filter(r=>r[1]).map((r,i)=>({id:r[1].match(/^(\d+)[.)]/)?.[1]||String(i+1),text:r[1].replace(/^\d+[.)]\s*/,'')}));continue;
  }
  let content=line;if(block.type==='table'&&block.rows.length){content='\n'+[block.rows[0],block.rows[0].map(()=> '---'),...block.rows.slice(1)].map(r=>'| '+r.join(' | ')+' |').join('\n')+'\n';}
  if(section==='explanation')q.explanation=(q.explanation||'')+'\n'+content;
  else if(section==='option'){const opts=q.statements.length?q.statements:q.options;if(opts.length)opts.at(-1).text+='\n'+content;}
  else if(section==='stem'){q.stem+='\n'+content;q.blocks.push(block);}
 }
 for(const q of items){q.q_type||=q.answer_key?'short':'essay';q.stem=q.stem.trim();if(!q.options.length)delete q.options;if(!q.statements.length)delete q.statements;q.parser_warnings=warnings;}
 return {items:items.map(normalizeQuestion),media,metadata,warnings};
}
export function parseExcel(buffer,media=[],sheetName=''){
 safeZip(buffer);
 const workbook=XLSX.read(buffer,{type:'buffer'});
 const simpleNames=workbook.SheetNames.filter(name=>['04_QUESTION_UPLOAD_SIMPLE','05_QUESTION_UPLOAD_ADV'].includes(name));
 if(simpleNames.length){
  const filled=simpleNames.map(name=>({name,rows:XLSX.utils.sheet_to_json(workbook.Sheets[name],{defval:''}).filter(row=>String(row.question_text||'').trim())}));
  if(!sheetName&&filled.filter(s=>s.rows.length).length>1)throw new Error('Cả SIMPLE và ADV đều có dữ liệu. Hãy chọn sheet nhập; không nhập các dòng minh họa.');
  if(sheetName&&!simpleNames.includes(sheetName))throw new Error('Không tìm thấy sheet đã chọn');
  const selected=sheetName?filled.find(s=>s.name===sheetName):filled.find(s=>s.rows.length);
  if(!selected)return {items:[],media,warnings:['Chưa có câu hỏi trong sheet nhập liệu']};
  const items=selected.rows.map((row,i)=>{
   for(const key of ['options','statements','left','right','subitem_levels','media'])if(row[key]){try{row[key]=JSON.parse(row[key]);}catch{throw new Error('Cột '+key+' tại dòng '+(i+2)+' cần JSON hợp lệ');}}
   for(const key of ['question_id','subject_id','topic_id','outcome_id','yccd_id','branch_id'])if(row[key])row[key]=Number(row[key]);
   let answerKey=row.answer;try{if(typeof answerKey==='string'&&answerKey.trim().startsWith('{'))answerKey=JSON.parse(answerKey);}catch{}
   return normalizeQuestion({...row,type:row.question_type||undefined,answer:typeof answerKey==='object'?answerKey:undefined,answer_key:typeof answerKey==='string'?answerKey:'',stem:row.question_text,grade:Number(row.grade_code||row.grade_hint)||null,subject_text:row.subject_code||row.subject_hint||'',source_locator:selected.name+'!'+(i+2),record_action:row.record_action||'NEW',parser_warnings:simpleNames.length>1?['Đã đọc sheet '+selected.name+'; không nhập sheet master hoặc minh họa khác']:[]});
  });
  return {items,media,warnings:[]};
 }
 const sheet=workbook.Sheets[workbook.SheetNames.includes('Nhap_lieu')?'Nhap_lieu':workbook.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});const modern=rows[0]?.includes('stem');
 const types={'Trắc nghiệm nhiều lựa chọn':'mcq4','Đúng - Sai':'true_false','Đúng-Sai':'true_false','Trả lời ngắn':'short','Tự luận':'essay','Ghép nối':'matching'};
 const legacyHeader=rows.findIndex(r=>r.includes('Mã câu hỏi')&&r.includes('Nội dung câu hỏi (Phần dẫn)'));
 const start=legacyHeader>=0?legacyHeader+1:1;
 const items=rows.slice(start).map((r,index)=>({r,row:index+start+1})).filter(({r})=>r.some(Boolean)).map(({r,row})=>{
  let q=modern?Object.fromEntries(rows[0].map((k,i)=>[k,r[i]])):{display_code:r[0],grade:Number(r[1]),subject_text:r[2],main_topic:r[3],sub_topic:r[4],cognitive_level:levelNumber(r[5]),q_type:types[r[6]]||r[6],stem:r[7],option_a:r[8],option_b:r[9],option_c:r[10],option_d:r[11],answer_key:r[12],explanation:r[13]};
  if(!modern&&r[8]&&types[r[7]])q={display_code:r[0],grade:Number(r[1]),subject_text:r[2],main_topic:r[3],sub_topic:r[4],cognitive_level:levelNumber(r[6]),q_type:types[r[7]],stem:r[8],option_a:r[9],option_b:r[10],option_c:r[11],option_d:r[12],answer_key:r[13],explanation:r[14]};
  if(legacyHeader>=0)q={display_code:r[1],subject_text:r[2],grade:Number(r[3]),main_topic:r[4],sub_topic:r[5],cognitive_level:levelNumber(r[6]),q_type:types[r[7]]||r[7],stem:r[8],option_a:r[9],option_b:r[10],option_c:r[11],option_d:r[12],answer_key:r[13],explanation:r[14],stem_image:r[17],notes:r[19]};
  if(q.q_type==='true_false'&&!q.option_a&&q.stem){
   const pieces=String(q.stem).split(/(?:^|\n)\s*([a-d])[.)]\s*/);
   if(pieces.length===9){q.stem=pieces[0].trim();q.statements=[1,3,5,7].map(i=>({id:pieces[i],text:pieces[i+1].trim()}));}
  }
  for(const key of ['subject_id','grade','topic_id'])if(q[key])q[key]=Number(q[key]);
  for(const key of ['answer','left','right','options','statements'])if(typeof q[key]==='string'&&q[key]){try{q[key]=JSON.parse(q[key]);}catch{q.parser_warnings=['Cột '+key+' chưa đúng JSON'];}}
  q.parser_warnings=q.parser_warnings||[];
  for(const loc of ['stem','option_a','option_b','option_c','option_d','explanation'])if(q[loc+'_image']){const matches=media.filter(m=>m.path===q[loc+'_image']||m.filename===q[loc+'_image']);if(matches.length===1)q[loc]=(q[loc]||'')+`\n![Ảnh](${matches[0].url})`;else q.parser_warnings.push(matches.length?'Ảnh trùng tên: '+q[loc+'_image']:'Thiếu ảnh: '+q[loc+'_image']);}
  for(const [i,key] of ['option_a','option_b','option_c','option_d'].entries())if(q[key+'_image']&&q[key]?.includes('![Ảnh]')){
   if(q.options?.[i])q.options[i].text+='\n'+q[key];
   if(q.statements?.[i])q.statements[i].text+='\n'+q[key];
  }
  q.source_locator='Dòng '+row;return normalizeQuestion(q);
 });return {items,media,warnings:[]};
}
function walk(value,key){if(!value||typeof value!=='object')return [];return Object.entries(value).flatMap(([k,v])=>k===key?arr(v):arr(v).flatMap(x=>walk(x,key)));}
export function parseQti(buffer){
 const zip=safeZip(buffer),media=mediaOf(zip),items=[],warnings=[];
 for(const entry of zip.getEntries().filter(e=>e.entryName.endsWith('.xml')&&!e.isDirectory)){
  const tree=xml.parse(safeXML(entry.getData().toString('utf8')));
  for(const item of walk(tree,'item')){
   const fields=walk(item,'qtimetadatafield'),meta=Object.fromEntries(fields.map(f=>[textOf(f.fieldlabel),textOf(f.fieldentry)]));
   if(meta.normalized_group_part&&Number(meta.normalized_group_part)>0)continue;
   if(meta.normalized_question){
    let preserved=meta.normalized_question;for(const m of media)preserved=preserved.split(m.path).join(m.url);
    try{const q=normalizeQuestion(JSON.parse(preserved));q.source_locator=entry.entryName+'#'+item['@_ident'];items.push(q);continue;}catch{warnings.push('Metadata mở rộng lỗi; đọc phần QTI chuẩn');}
   }
   const labels=walk(item.presentation,'response_label').filter(l=>l.material);
   const correct=walk(item.resprocessing,'respcondition').filter(c=>Number(textOf(c.setvar))>0).flatMap(c=>walk(c.conditionvar,'varequal'));
   const options=labels.map((l,i)=>({id:String.fromCharCode(65+i),ident:l['@_ident'],text:htmlText(textOf(l.material),media)}));
   const rawType=meta.question_type||'multiple_choice_question';let q={display_code:item['@_title']||'',stem:htmlText(textOf(item.presentation?.material),media),cognitive_level:levelNumber(meta.cognitive_level),explanation:htmlText(walk(item,'itemfeedback').map(textOf).join('\n'),media),source_locator:entry.entryName+'#'+item['@_ident'],parser_warnings:[]};
   if(rawType==='essay_question')q={...q,type:'essay',answer:{reference:q.explanation}};
   else if(rawType==='short_answer_question'||rawType==='numerical_question')q={...q,type:'short_answer',answer:{aliases:correct.map(textOf)}};
   else if(rawType==='matching_question'){
    const lids=arr(item.presentation?.response_lid);q={...q,type:'matching',left:lids.map(l=>({id:l['@_ident'],text:htmlText(textOf(l.material),media)})),right:options.filter((o,i,a)=>a.findIndex(x=>x.ident===o.ident)===i).map(o=>({id:o.ident,text:o.text})),answer:{pairs:Object.fromEntries(correct.map(c=>[c['@_respident'],textOf(c)]))}};
   }else if(rawType==='true_false_question'){q={...q,type:'true_false',statements:[{id:'a',text:q.stem}],answer:{values:{a:/^(true|đúng)$/i.test(options.find(o=>o.ident===textOf(correct[0]))?.text||'')}}};q.parser_warnings.push('QTI ĐS có một nhận định; bổ sung bốn ý hoặc đổi dạng trước Active');}
   else q={...q,type:'multiple_choice',options:options.map(({id,text})=>({id,text})),answer:{correct:options.find(o=>o.ident===textOf(correct[0]))?.id||''}};
   if(!q.cognitive_level)q.parser_warnings.push('Chưa có mức độ; cần gán ở Preview');items.push(normalizeQuestion(q));
  }
 }
 if(!items.length)throw new Error('Không có item QTI tương thích trong ZIP');return {items,media,warnings};
}
export function parseImport(buffer,filename,{sheetName=''}={}){
 const ext=path.extname(filename).toLowerCase();if(ext==='.docx')return parseDocx(buffer);if(ext==='.xlsx'){safeZip(buffer);return parseExcel(buffer,[],sheetName);}
 if(ext==='.zip'){const zip=safeZip(buffer);const sheets=zip.getEntries().filter(e=>/\.xlsx$/i.test(e.entryName));if(sheets.length>1)throw new Error('ZIP chỉ chứa một bảng câu hỏi');if(sheets.length)safeZip(sheets[0].getData());return sheets.length?parseExcel(sheets[0].getData(),mediaOf(zip),sheetName):parseQti(buffer);}
 throw new Error('Chỉ hỗ trợ DOCX, XLSX hoặc ZIP');
}
