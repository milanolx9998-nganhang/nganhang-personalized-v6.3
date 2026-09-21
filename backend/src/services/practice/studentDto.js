import {normalizeQuestion} from './grading.js';
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
const choices=rows=>Array.isArray(rows)?rows.map(r=>pick(r,['id','text','image_url'])):undefined;
// Every nested structure is constructed explicitly: never spread authored JSON to students.
export function studentQuestion(version,reveal=false){
 const q=normalizeQuestion(version),out=pick(q,['type','stem','display_code','cognitive_level','topic_id','auto_gradable','image_url']);
 if(q.type==='multiple_choice')out.options=choices(q.options);
 if(q.type==='true_false')out.statements=choices(q.statements);
 if(q.type==='matching'){out.left=choices(q.left);out.right=choices(q.right);}
 if(q.answer?.unit)out.unit=String(q.answer.unit);
 out.blocks=(q.blocks||[]).filter(b=>['paragraph','table'].includes(b.type)).map(b=>b.type==='table'?{type:'table',rows:(b.rows||[]).map(row=>row.map(cell=>String(cell)))}:{type:'paragraph',text:String(b.text||'')});
 if(reveal){out.answer=q.answer;out.explanation=q.explanation;}
 return out;
}
export function studentAssignment(a){return {...pick(a,['id','title','instructions','kind','opens_at','closes_at','max_attempts','status','allow_after_deadline','answer_release_policy','answers_released_at']),config:pick(a.config,['subject_id','grade','count','mode','types'])};}
export function studentAttempt(a){return pick(a,['id','assignment_id','retry_of','source','mode','status','started_at','completed_at','score','denominator','percentage','duration_seconds','config']);}
