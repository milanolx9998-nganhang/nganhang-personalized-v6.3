// Sinh câu Đấu từ vựng từ các dòng kho từ vựng. Hàm thuần: random tiêm vào được để test tái lập.
// Câu ra đúng hình dạng nội dung của ngân hàng (multiple_choice / short_answer / matching) nên engine, chấm và DTO dùng lại nguyên.
export const VOCAB_KINDS=Object.freeze({en:['EN1','EN2','EN3','EN4','EN5'],zh:['ZH1','ZH2','ZH3','ZH4','ZH5','ZH6']});
export const DEFAULT_VOCAB_KINDS=Object.freeze({en:['EN1','EN2','EN5'],zh:['ZH1','ZH2','ZH3','ZH4','ZH6']});
export const ALL_VOCAB_KINDS=[...VOCAB_KINDS.en,...VOCAB_KINDS.zh];
const MATCHING=new Set(['EN5','ZH6']),BASE_SECONDS={choice:10,matching:25,EN3:12,EN4:20,ZH5:8};
const TONES={a:'āáǎà',e:'ēéěè',i:'īíǐì',o:'ōóǒò',u:'ūúǔù',ü:'ǖǘǚǜ'};
const MARKED=Object.fromEntries(Object.entries(TONES).flatMap(([base,marks])=>[...marks].map((m,i)=>[m,[base,i]])));
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export const clean=v=>v==null?'':String(v).normalize('NFC').replace(/\s+/g,' ').trim();
export const fold=v=>clean(v).toLowerCase();
export const isHan=v=>/\p{Script=Han}/u.test(String(v||''));
// Các nghĩa tách bằng ; , / — hai từ chung một nghĩa thì không được làm nhiễu cho nhau.
export const meaningParts=v=>fold(v).replace(/\([^)]*\)/g,' ').split(/[;,/]|\s+hoặc\s+/).map(s=>s.replace(/[.!?…"“”']/g,'').trim()).filter(Boolean);
const sameMeaning=(a,b)=>{const pa=new Set(meaningParts(a.meaning_vi));return meaningParts(b.meaning_vi).some(p=>pa.has(p))||fold(a.meaning_vi)===fold(b.meaning_vi);};
const toneless=v=>[...clean(v)].map(c=>MARKED[c]?.[0]??c).join('').toLowerCase();
export function hasToneMarks(v){return [...String(v||'')].some(c=>MARKED[c]);}
// Biến thể thanh điệu: đổi thanh của từng âm tiết có dấu sang ba thanh còn lại.
export function toneVariants(reading){
 const chars=[...clean(reading)],out=[];
 chars.forEach((c,i)=>{const hit=MARKED[c];if(!hit)return;const [base,tone]=hit;for(let t=0;t<4;t++)if(t!==tone)out.push(chars.map((x,j)=>j===i?TONES[base][t]:x).join(''));});
 return [...new Set(out)];
}
// Tách thanh điệu (1..4) và 4 biến thể thanh của một âm tiết pinyin đơn; thanh 5/khinh thanh hoặc nhiều âm tiết trả null.
export function syllableTone(reading){
 const s=clean(reading);if(!s||/\s/.test(s))return null;
 const chars=[...s],hits=[];
 chars.forEach((c,i)=>{const hit=MARKED[c.toLowerCase()];if(hit)hits.push({index:i,base:hit[0],tone:hit[1]+1});});
 if(hits.length!==1)return null;
 const {index,base,tone}=hits[0];
 return {tone,forms:[0,1,2,3].map(t=>chars.map((c,i)=>i===index?TONES[base][t]:c).join(''))};
}
// Đục đúng từ đích trong câu ví dụ thành ____ (không phân biệt hoa thường); không khớp hoặc còn lộ từ đích thì trả null.
export function blankExample(example,term){
 const ex=clean(example),w=clean(term);if(!ex||!w)return null;
 const rx=new RegExp(`(?<![\\p{L}\\p{N}])${esc(w)}(?![\\p{L}\\p{N}])`,'giu');
 if(!rx.test(ex))return null;
 const out=ex.replace(rx,'____');
 return out.includes('____')&&!fold(out).includes(fold(w))?out:null;
}
export const languageOf=entries=>entries.filter(e=>isHan(e.term)).length*2>entries.length?'zh':'en';

function shuffle(list,random){const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
// Hai dòng xung đột: cùng từ, trùng nghĩa, hoặc cùng nhóm dễ nhầm.
export function conflicts(a,b){
 if(a.id===b.id||fold(a.term)===fold(b.term)||sameMeaning(a,b))return true;
 return Boolean(a.confusable_group&&fold(a.confusable_group)===fold(b.confusable_group));
}
// Nhiễu ưu tiên cùng bộ + cùng loại từ, rồi cùng bộ, rồi phần còn lại; giá trị hiển thị không được trùng nhau.
function distractors(target,pool,show,random,need=3,extra=()=>true){
 const tiers=[e=>e.set_id===target.set_id&&target.pos&&fold(e.pos)===fold(target.pos),e=>e.set_id===target.set_id,()=>true];
 const picked=[],seen=new Set([fold(show(target))]);
 for(const tier of tiers){
  for(const e of shuffle(pool.filter(tier),random)){
   if(picked.length>=need)break;
   const value=fold(show(e));if(!value||seen.has(value)||picked.includes(e)||conflicts(target,e)||!extra(e)||picked.some(p=>conflicts(p,e)))continue;
   seen.add(value);picked.push(e);
  }
 }
 return picked.length>=need?picked:null;
}
const label=e=>e.reading?(isHan(e.term)?`${e.term} (${e.reading})`:`${e.term} /${e.reading.replace(/^\/|\/$/g,'')}/`):e.term;
const explain=list=>list.map(e=>`${label(e)} — ${clean(e.meaning_vi)}${e.example?`. Ví dụ: ${clean(e.example)}${e.example_vi?` (${clean(e.example_vi)})`:''}`:''}`).join('\n');
const snapshotOf=e=>({entry_id:e.id,term:clean(e.term),reading:clean(e.reading)||null,han_viet:clean(e.han_viet)||null,meaning_vi:clean(e.meaning_vi),example:clean(e.example)||null,set_id:e.set_id,set_name:e.set_name||null});

function choice(kind,target,pool,random){
 const zh=kind.startsWith('ZH'),ids=['A','B','C','D'];
 if(kind==='EN3'){
  if(isHan(target.term))return null;
  const blanked=blankExample(target.example,target.term);if(!blanked)return null;
  const show=e=>clean(e.term),sameSet=pool.filter(e=>e.set_id===target.set_id&&!isHan(e.term)&&show(e));
  const picked=distractors(target,sameSet.length>=4?sameSet:pool.filter(e=>!isHan(e.term)&&show(e)),show,random,3);
  if(!picked)return null;
  const items=shuffle([{value:show(target),right:true},...picked.map(e=>({value:show(e),entry:e}))],random);
  return {content:{type:'multiple_choice',stem:`Điền từ vào chỗ trống: "${blanked}"`,options:items.map((x,i)=>({id:ids[i],text:x.value})),answer:{correct:ids[items.findIndex(x=>x.right)]},explanation:explain([target])},entries:[target],seconds:BASE_SECONDS.EN3};
 }
 if(kind==='EN4'){
  const term=clean(target.term);
  if(isHan(term)||term.length<3||term.length>14||!/^[A-Za-z]+(?:[ -][A-Za-z]+)*$/.test(term))return null;
  return {content:{type:'short_answer',stem:`Gõ từ tiếng Anh có nghĩa “${clean(target.meaning_vi)}”`,answer:{aliases:[term],case_sensitive:false},explanation:explain([target])},entries:[target],seconds:BASE_SECONDS.EN4};
 }
 if(kind==='ZH5'){
  const term=clean(target.term),info=[...term].length===1&&isHan(term)?syllableTone(target.reading):null;
  if(!info)return null;
  const options=info.forms.map((f,i)=>({id:ids[i],text:`Thanh ${i+1} (${f})`}));
  return {content:{type:'multiple_choice',stem:`Chữ Hán "${term}" (${clean(target.meaning_vi)}) mang thanh điệu nào?`,options,answer:{correct:ids[info.tone-1]},explanation:explain([target])},entries:[target],seconds:BASE_SECONDS.ZH5};
 }
 const spec={
  EN1:{stem:`"${clean(target.term)}" nghĩa là gì?`,show:e=>clean(e.meaning_vi)},
  ZH1:{stem:`"${clean(target.term)}" nghĩa là gì?`,show:e=>clean(e.meaning_vi)},
  EN2:{stem:`Từ tiếng Anh nào có nghĩa "${clean(target.meaning_vi)}"?`,show:e=>clean(e.term)},
  ZH2:{stem:`Chữ Hán nào có nghĩa "${clean(target.meaning_vi)}"?`,show:e=>clean(e.term)},
  ZH3:{stem:`Phiên âm đúng của "${clean(target.term)}" là?`,show:e=>clean(e.reading)},
  ZH4:{stem:`Chữ Hán nào đọc là "${clean(target.reading)}"?`,show:e=>clean(e.term)}
 }[kind];
 if(!spec||(zh&&!isHan(target.term))||(['ZH3','ZH4'].includes(kind)&&!clean(target.reading)))return null;
 let wrong;
 if(kind==='ZH3'){
  // Nhiễu ưu tiên cùng âm khác thanh; thiếu thì lấy phiên âm của từ khác (không trùng phiên âm đích).
  const values=shuffle(toneVariants(target.reading),random).slice(0,3).map(v=>({value:v}));
  const others=distractors(target,pool.filter(e=>clean(e.reading)&&toneless(e.reading)!==toneless(target.reading)),spec.show,random,3-values.length);
  if(values.length<3&&!others)return null;
  wrong=[...values,...(others||[]).map(e=>({value:spec.show(e),entry:e}))].slice(0,3);
 }else{
  // Chữ đọc giống hệt (đồng âm cùng thanh) không được làm nhiễu cho câu nghe/đọc phiên âm.
  const extra=kind==='ZH4'?e=>fold(e.reading)!==fold(target.reading):()=>true;
  const picked=distractors(target,pool.filter(e=>spec.show(e)&&(!zh||isHan(e.term))),spec.show,random,3,extra);
  if(!picked)return null;
  wrong=picked.map(e=>({value:spec.show(e),entry:e}));
 }
 const items=shuffle([{value:spec.show(target),right:true},...wrong],random);
 return {content:{type:'multiple_choice',stem:spec.stem,options:items.map((x,i)=>({id:ids[i],text:x.value})),answer:{correct:ids[items.findIndex(x=>x.right)]},explanation:explain([target])},entries:[target],seconds:BASE_SECONDS.choice};
}

function matching(kind,target,pool,random){
 const zh=kind==='ZH6',group=[target];
 for(const e of shuffle(pool.filter(e=>e.set_id===target.set_id),random).concat(shuffle(pool.filter(e=>e.set_id!==target.set_id),random))){
  if(group.length===4)break;if((zh&&!isHan(e.term))||group.some(g=>conflicts(g,e)||fold(g.meaning_vi)===fold(e.meaning_vi)))continue;group.push(e);
 }
 if(group.length<4)return null;
 const left=group.map((e,i)=>({id:'abcd'[i],text:clean(e.term)})),order=shuffle(group.map((_,i)=>i),random),right=order.map((i,k)=>({id:String(k+1),text:clean(group[i].meaning_vi)}));
 const pairs=Object.fromEntries(group.map((_,i)=>[left[i].id,String(order.indexOf(i)+1)]));
 return {content:{type:'matching',stem:zh?'Ghép chữ Hán với nghĩa đúng.':'Ghép từ với nghĩa đúng.',left,right,answer:{pairs},explanation:explain(group)},entries:group,seconds:BASE_SECONDS.matching};
}

// Đúng/sai theo từng từ của một câu: trắc nghiệm / trả lời ngắn = một từ; câu ghép chấm theo từng cặp (đúng 3/4 cặp thì chỉ 1 từ bị tính sai).
// Không có đáp án (hết giờ / bỏ qua) thì mọi từ của câu tính là chưa đúng.
export function entryOutcomes(content,entryIds,response,score){
 if(content?.type==='matching'&&response&&typeof response==='object'){
  const lefts=(content.left||[]).map(l=>String(l.id));
  return Object.fromEntries(entryIds.map((id,i)=>[id,String(response[lefts[i]])===String(content.answer?.pairs?.[lefts[i]])]));
 }
 return Object.fromEntries(entryIds.map(id=>[id,Number(score)===1]));
}

// entries: [{id,set_id,set_name,term,reading,han_viet,pos,meaning_vi,example,example_vi,confusable_group}]
// Mặc định (không chọn dạng) chỉ trộn các dạng trắc nghiệm/ghép cũ; EN3, EN4, ZH5 chỉ vào khi chọn rõ.
export function generateVocabQuestions(entries,{count,kinds=null,random=Math.random,secondsScale=1}={}){
 const pool=entries.filter(e=>clean(e.term)&&clean(e.meaning_vi)),lang=languageOf(pool);
 const allowed=(kinds?.length?kinds:DEFAULT_VOCAB_KINDS[lang]).filter(k=>VOCAB_KINDS[lang].includes(k));if(!allowed.length)return [];
 // Câu ghép tốn 4 từ: tối đa một câu ghép mỗi 5 câu.
 const maxMatching=Math.floor(count/5),out=[],used=new Set(),asked=new Set();let matchingCount=0;
 const push=(kind,q)=>{for(const e of q.entries){used.add(e.id);asked.add(e.id+':'+kind);}if(MATCHING.has(kind))matchingCount++;
  out.push({kind,content:q.content,vocab_entry_ids:q.entries.map(e=>e.id),vocab:q.entries.map(snapshotOf),seconds:Math.max(5,Math.round(q.seconds*secondsScale))});};
 for(const target of shuffle(pool,random)){
  if(out.length>=count)break;if(used.has(target.id))continue;
  const order=shuffle(allowed,random).sort((a,b)=>Number(MATCHING.has(a))-Number(MATCHING.has(b))||0);
  // Câu ghép chỉ ra khi số từ chưa dùng vẫn đủ cho các câu còn lại.
  const spare=pool.length-used.size-4>=count-out.length-1,preferMatching=matchingCount<maxMatching&&spare&&random()<.35;
  for(const kind of preferMatching?[...order].reverse():order){
   if(MATCHING.has(kind)&&(matchingCount>=maxMatching||!spare))continue;
   const q=MATCHING.has(kind)?matching(kind,target,pool.filter(e=>!used.has(e.id)),random):choice(kind,target,pool,random);if(!q)continue;
   push(kind,q);break;
  }
 }
 // Bộ nhỏ: hỏi lại từ đã ra nhưng bằng dạng câu khác (không lặp nguyên câu).
 for(const target of shuffle(pool,random)){
  if(out.length>=count)break;
  for(const kind of shuffle(allowed.filter(k=>!MATCHING.has(k)&&!asked.has(target.id+':'+k)),random)){const q=choice(kind,target,pool,random);if(q){push(kind,q);break;}}
 }
 return shuffle(out,random);
}