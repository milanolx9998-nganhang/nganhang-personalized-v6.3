import AdmZip from 'adm-zip';
import crypto from 'node:crypto';
import MarkdownIt from 'markdown-it';
import {normalizeQuestion} from './practice/grading.js';
import {imageLoader} from './storage/index.js';
import {imageType} from './practice/importAdapters.js';
const md=new MarkdownIt({html:false,breaks:true});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export async function buildQtiZip({title,questions,pointsPerQuestion=1}){
 const localImage=await imageLoader(questions);
 const zip=new AdmZip(),media=new Map(),id='assessment_'+crypto.randomUUID().replaceAll('-','');
 function image(url){if(media.has(url))return media.get(url);const data=localImage(url),type=imageType(data),file='media/'+crypto.createHash('sha256').update(data).digest('hex')+'.'+type.ext;zip.addFile(file,data);media.set(url,file);return file;}
 function html(text){return md.render(String(text||'')).replace(/<img src="([^"]+)"/g,(_m,url)=>'<img src="'+image(url)+'"');}
 const material=text=>'<material><mattext texttype="text/html">'+esc(html(text))+'</mattext></material>';
 const field=(k,v)=>'<qtimetadatafield><fieldlabel>'+k+'</fieldlabel><fieldentry>'+esc(v)+'</fieldentry></qtimetadatafield>';
 function canonical(q){return JSON.stringify(q).replace(/\/uploads\/(?:images|media)\/[a-zA-Z0-9_.-]+\.(?:png|jpe?g|gif|webp)/gi,url=>image(url));}
 function item(q,index,{part=null,parent=null}={}){
  const type={multiple_choice:'multiple_choice_question',true_false:'true_false_question',short_answer:'short_answer_question',matching:'matching_question',essay:'essay_question'}[q.type];
  if(!type)throw new Error('QTI chưa hỗ trợ dạng '+q.type);
  let presentation=material(q.stem+(q.image_url?'\n\n![Ảnh]('+q.image_url+')':'')),conditions='';
  const condition=(rid,answer,score,action='Set')=>'<respcondition continue="'+(action==='Add'?'Yes':'No')+'"><conditionvar><varequal respident="'+esc(rid)+'">'+esc(answer)+'</varequal></conditionvar><setvar action="'+action+'" varname="SCORE">'+score+'</setvar></respcondition>';
  const choices=(rid,options,prompt='')=>'<response_lid ident="'+esc(rid)+'" rcardinality="Single">'+(prompt?material(prompt):'')+'<render_choice>'+options.map(o=>'<response_label ident="'+esc(o.id)+'">'+material(o.text)+'</response_label>').join('')+'</render_choice></response_lid>';
  if(q.type==='multiple_choice'){presentation+=choices('response1',q.options);conditions=condition('response1',q.answer.correct,100);}
  if(q.type==='true_false'){presentation+=choices('response1',[{id:'true',text:'Đúng'},{id:'false',text:'Sai'}]);conditions=condition('response1',String(q.answer.value),100);}
  if(q.type==='matching'){for(const l of q.left){presentation+=choices(l.id,q.right,l.text);conditions+=condition(l.id,q.answer.pairs[l.id],100/q.left.length,'Add');}}
  if(['short_answer','essay'].includes(q.type)){presentation+='<response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1"/></render_fib></response_str>';if(q.type==='short_answer')conditions=(q.answer.aliases||[String(q.answer.numeric)]).map(a=>condition('response1',a,100)).join('');}
  const score=Number(q.assigned_score??q.score??(q.type==='essay'?0:pointsPerQuestion))/(part!==null?4:1);
  let meta=field('question_type',type)+field('points_possible',score)+field('cognitive_level',q.cognitive_level||'')+field('assessment_question_identifierref','ref_'+index);
  if(part===null||part===0)meta+=field('normalized_question',canonical(parent||q));
  if(part!==null)meta+=field('normalized_group_part',part);
  return '<item ident="q_'+index+'" title="'+esc(q.display_code||'Câu '+index)+'"><itemmetadata><qtimetadata>'+meta+'</qtimetadata></itemmetadata><presentation>'+presentation+'</presentation><resprocessing><outcomes><decvar varname="SCORE" vartype="Decimal" minvalue="0" maxvalue="100"/></outcomes>'+conditions+'</resprocessing><itemfeedback ident="general_fb"><flow_mat>'+material(q.explanation)+'</flow_mat></itemfeedback></item>';
 }
 let index=0;const xml=questions.flatMap(raw=>{const q=normalizeQuestion(raw);if(q.type!=='true_false')return [item(q,++index)];if(q.statements.length!==4)throw new Error('ĐS cần đủ 4 nhận định để xuất QTI');return q.statements.map((s,i)=>item({...q,stem:q.stem+'\n\n'+s.id+') '+s.text,answer:{value:q.answer.values[s.id]}},++index,{part:i,parent:q}));}).join('');
 zip.addFile('assessment.xml',Buffer.from('<?xml version="1.0" encoding="UTF-8"?><questestinterop><assessment ident="'+id+'" title="'+esc(title)+'"><section ident="root_section">'+xml+'</section></assessment></questestinterop>'));
 const files=['assessment.xml',...new Set(media.values())];
 zip.addFile('imsmanifest.xml',Buffer.from('<?xml version="1.0" encoding="UTF-8"?><manifest identifier="'+id+'" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"><organizations/><resources><resource identifier="res_'+id+'" type="imsqti_xmlv1p2" href="assessment.xml">'+files.map(file=>'<file href="'+esc(file)+'"/>').join('')+'</resource></resources></manifest>'));
 return zip.toBuffer();
}
