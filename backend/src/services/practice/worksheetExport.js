import fs from 'node:fs';
import {imageLoader} from '../storage/index.js';
import path from 'node:path';
import {createRequire} from 'node:module';
import MarkdownIt from 'markdown-it';
import katex from 'katex';
import sharp from 'sharp';
import {chromium} from 'playwright';
import {Document,Packer,Paragraph,TextRun,ImageRun,Table,TableRow,TableCell,WidthType} from 'docx';
import {normalizeQuestion} from './grading.js';
const require=createRequire(import.meta.url),katexDir=path.dirname(require.resolve('katex'));
const css=fs.readFileSync(path.join(katexDir,'katex.min.css'),'utf8').replace(/url\(([^)]+)\)/g,(_m,name)=>'url(data:font/woff2;base64,'+fs.readFileSync(path.join(katexDir,name.replace(/['"]/g,''))).toString('base64')+')');
const md=new MarkdownIt({html:false,breaks:true});
md.inline.ruler.before('escape','math',(state,silent)=>{
 if(state.src[state.pos]!=='$')return false;
 const double=state.src[state.pos+1]==='$',delimiter=double?'$$':'$',start=state.pos+delimiter.length,end=state.src.indexOf(delimiter,start);
 if(end<0)return false;if(!silent){const token=state.push('math','',0);token.content=state.src.slice(start,end);token.meta={display:double};}state.pos=end+delimiter.length;return true;
});
md.renderer.rules.math=(tokens,index)=>katex.renderToString(tokens[index].content,{displayMode:tokens[index].meta.display,throwOnError:true,trust:false});
const htmlEscape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function localImage(url){
 if(!/^\/uploads\/(?:images|media)\/[a-zA-Z0-9_.-]+\.(png|jpe?g|gif|webp)$/i.test(url))throw new Error('Ảnh xuất cần nằm trong kho ảnh nội bộ: '+url);
 const root=path.resolve(process.env.UPLOAD_DIR||'uploads'),file=path.resolve(root,url.slice('/uploads/'.length));
 if(!file.startsWith(root+path.sep))throw new Error('Đường dẫn ảnh không hợp lệ');return fs.readFileSync(file);
}
function richHTML(text,localImage){return md.render(String(text||'')).replace(/<img src="([^"]+)"/g,(_match,url)=>'<img src="data:image/png;base64,'+localImage(url).toString('base64')+'"');}
export function answerText(q){const a=q.answer||{};return q.type==='multiple_choice'?a.correct:q.type==='short_answer'?String(a.numeric??a.aliases?.join(' / ')??''):q.type==='essay'?a.reference||'Tự đối chiếu theo hướng dẫn':Object.entries(a.values||a.pairs||{}).map(([k,v])=>k+': '+(typeof v==='boolean'?(v?'Đúng':'Sai'):v)).join('; ');}
export function worksheetMarkdown(raw,index,{answers=false}={}){
 const q=normalizeQuestion(raw);let text='**Câu '+(index+1)+'.** '+(q.assigned_score!=null?'('+Number(q.assigned_score).toFixed(2)+' điểm) ':'')+q.stem+(q.image_url?'\n\n![Hình câu hỏi]('+q.image_url+')':'');
 if(q.type==='multiple_choice')text+='\n\n'+q.options.map(o=>o.id+'. '+o.text).join('\n\n');
 if(q.type==='true_false')text+='\n\n'+q.statements.map(o=>o.id+') '+o.text+' ☐ Đúng ☐ Sai').join('\n\n');
 if(q.type==='matching'){const rows=Array.from({length:Math.max(q.left.length,q.right.length)},(_,i)=>'| '+(q.left[i]?q.left[i].id+'. '+q.left[i].text:'')+' | '+(q.right[i]?q.right[i].id+'. '+q.right[i].text:'')+' |');text+='\n\n| Cột A | Cột B |\n| --- | --- |\n'+rows.join('\n')+'\n\nGhép: '+q.left.map(l=>l.id+' → …').join('   ');}
 if(q.type==='short_answer')text+='\n\nTrả lời: …………………………'+(q.answer?.unit?' ('+q.answer.unit+')':'');
 if(q.type==='essay')text+='\n\n*'+(q.assigned_score!=null?'Tự luận — giáo viên chấm theo hướng dẫn.':'Tự luận — tự đối chiếu, không tính điểm tự chấm.')+'*\n\n………………………………………………………………\n\n………………………………………………………………';
 if(answers)text+='\n\n**Đáp án:** '+answerText(q)+'\n\n'+(q.explanation||'');return text;
}
export async function buildWorksheet({title,items,instructions='',answers=false,format='docx'}){
 if(!['docx','pdf'].includes(format))throw new Error('Định dạng xuất không hỗ trợ');
 let browser;const getBrowser=async()=>browser||(browser=await chromium.launch({headless:true}));
 try{
  const sections=items.map((q,i)=>worksheetMarkdown(q,i,{answers})),localImage=await imageLoader([sections,instructions]);
  if(format==='pdf'){
   const page=await(await getBrowser()).newPage();await page.route('**/*',route=>route.abort());
   await page.setContent('<!doctype html><html lang="vi"><meta charset="utf-8"><style>'+css+'body{font:12pt Lexend,Arial,sans-serif;line-height:1.6;color:#172033}h1{text-align:center;font-size:19pt}article{margin:18px 0}img{max-width:100%;max-height:320px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aaa;padding:8px}tr{break-inside:avoid}.katex{font-size:1.1em}p{orphans:3;widows:3}</style><h1>'+htmlEscape(title)+'</h1><p>Họ tên: ……………………………… Lớp: …………</p>'+richHTML(instructions,localImage)+sections.map(s=>'<article>'+richHTML(s,localImage)+'</article>').join('')+'</html>');
   await page.evaluate(()=>document.fonts.ready);return await page.pdf({format:'A4',printBackground:true,margin:{top:'18mm',bottom:'18mm',left:'18mm',right:'18mm'}});
  }
  const mathCache=new Map();
  async function imageRun(data,alt){const converted=await sharp(data).rotate().png().toBuffer(),meta=await sharp(converted).metadata();const ratio=Math.min(1,580/meta.width,350/meta.height);return new ImageRun({data:converted,transformation:{width:Math.round(meta.width*ratio),height:Math.round(meta.height*ratio)},altText:{title:alt,description:alt,name:alt}});}
  async function inline(tokens){const out=[];let bold=false,italics=false;for(const t of tokens||[]){
   if(t.type==='strong_open'){bold=true;continue;}if(t.type==='strong_close'){bold=false;continue;}if(t.type==='em_open'){italics=true;continue;}if(t.type==='em_close'){italics=false;continue;}
   if(t.type==='image'){out.push(await imageRun(localImage(t.attrGet('src')),t.content));continue;}
   if(t.type==='math'){
    let data=mathCache.get(t.content);if(!data){const page=await(await getBrowser()).newPage({deviceScaleFactor:2});await page.route('**/*',route=>route.abort());await page.setContent('<style>'+css+'body{margin:0}#formula{display:inline-block;padding:4px;font-size:18px}</style><span id="formula">'+katex.renderToString(t.content,{throwOnError:true,trust:false})+'</span>');await page.evaluate(()=>document.fonts.ready);data=await page.locator('#formula').screenshot();await page.close();mathCache.set(t.content,data);}const meta=await sharp(data).metadata(),ratio=Math.min(.5,580/meta.width);out.push(new ImageRun({data,transformation:{width:Math.round(meta.width*ratio),height:Math.round(meta.height*ratio)},altText:{title:'Công thức',description:t.content,name:'Công thức'}}));continue;
   }
   if(t.type==='softbreak'||t.type==='hardbreak')out.push(new TextRun({break:1}));else if(t.type==='text'||t.type==='code_inline')out.push(new TextRun({text:t.content,font:'Lexend',size:24,bold,italics}));
  }return out;}
  async function blocks(source){const tokens=md.parse(source,{}),out=[];let rows=null,cells=null,cell=null;for(const token of tokens){
   if(token.type==='table_open'){rows=[];continue;}if(token.type==='tr_open'){cells=[];continue;}if(token.type==='td_open'||token.type==='th_open'){cell=[];continue;}
   if(token.type==='td_close'||token.type==='th_close'){cells.push(new TableCell({children:cell.length?cell:[new Paragraph('')]}));cell=null;continue;}if(token.type==='tr_close'){rows.push(new TableRow({children:cells}));continue;}
   if(token.type==='table_close'){out.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows}));rows=null;continue;}
   if(token.type==='inline'){const p=new Paragraph({children:await inline(token.children),spacing:{after:100}});if(cell)cell.push(p);else out.push(p);}
  }return out;}
  const children=[new Paragraph({alignment:'center',children:[new TextRun({text:title,bold:true,font:'Lexend',size:32})]}),new Paragraph({children:[new TextRun({text:'Họ tên: ……………………………… Lớp: …………',font:'Lexend',size:24})]}),...await blocks(instructions)];
  for(const section of sections)children.push(...await blocks(section));
  return await Packer.toBuffer(new Document({styles:{default:{document:{run:{font:'Lexend',size:24}}}},sections:[{properties:{page:{margin:{top:1020,bottom:1020,left:1020,right:1020}}},children}]}));
 }finally{await browser?.close();}
}
