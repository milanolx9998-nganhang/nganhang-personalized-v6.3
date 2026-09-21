import {normalizeQuestion} from './grading.js';
const text=v=>String(v??'').normalize('NFKC').toLocaleLowerCase('vi').replace(/\s+/g,' ').trim();
const stable=v=>JSON.stringify(v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,val])=>[k,stable(val)])):v);
export function duplicateSignals(left,right){
 const a=normalizeQuestion(left),b=normalizeQuestion(right);
 const images=q=>[...JSON.stringify(q).matchAll(/\/uploads\/media\/([a-f0-9]{64})/g)].map(m=>m[1]);
 const ai=images(a),bi=images(b);
 return {stem:text(a.stem)===text(b.stem),options:stable(a.type==='true_false'?a.statements:a.options)===stable(b.type==='true_false'?b.statements:b.options),answer:stable(a.answer)===stable(b.answer),image_checksum:ai.length>0&&ai.some(x=>bi.includes(x)),taxonomy:a.subject_id===b.subject_id&&a.topic_id===b.topic_id&&a.cognitive_level===b.cognitive_level,source_id:!!a.display_code&&a.display_code===b.display_code};
}
