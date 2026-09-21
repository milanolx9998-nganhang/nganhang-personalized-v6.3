import {fail} from './config.js';
export function allocate(count,percent){
 if(!Number.isInteger(count)||count<1||percent.length!==4||percent.some(x=>!Number.isFinite(x)||x<0)||Math.abs(percent.reduce((a,b)=>a+b,0)-100)>0.00001)fail('Số câu và tổng tỉ lệ 100% phải hợp lệ');
 const raw=percent.map(x=>count*x/100),out=raw.map(Math.floor);
 const ranked=raw.map((v,i)=>({i,f:v-out[i]})).sort((a,b)=>b.f-a.f||a.i-b.i);
 const missing=count-out.reduce((a,b)=>a+b,0);for(let j=0;j<missing;j++)out[ranked[j].i]++;
 return out;
}
export function seeded(seed){let h=2166136261;for(const c of String(seed))h=Math.imul(h^c.charCodeAt(0),16777619);return()=>{h+=0x6D2B79F5;let t=Math.imul(h^h>>>15,1|h);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};}
export function selectQuestions(candidates,config,seed){
 const counts=allocate(config.count,config.percent),random=seeded(seed),seen=new Set();
 const filtered=candidates.filter(q=>!seen.has(q.question_id)&&seen.add(q.question_id)).filter(q=>config.types.includes(q.question_type));
 const availability=counts.map((required,i)=>({level:i+1,required,available:filtered.filter(q=>q.cognitive_level===i+1).length}));
 const shortages=availability.filter(x=>x.available<x.required);
 if(shortages.length) return {items:[],availability,shortages};
 const items=[];
 for(let level=1;level<=4;level++){
  const ranked=filtered.filter(q=>q.cognitive_level===level).map(q=>({...q,tie:random()})).sort((a,b)=>(a.last_seen?1:0)-(b.last_seen?1:0)||(a.last_seen?new Date(a.last_seen)-new Date(b.last_seen):0)||a.tie-b.tie);
  items.push(...ranked.slice(0,counts[level-1]).map(q=>({...q,selection_reason:!q.last_seen?'unseen':Date.now()-new Date(q.last_seen)>30*864e5?'old':'repeat'})));
 }
 return {items,availability,shortages};
}
