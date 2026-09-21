import {defaults} from './config.js';
export function replay(events,config=defaults){
 const states=new Map();
 for(const event of events){
  const key=`${event.topic_id}:${event.cognitive_level}`;const prior=states.get(key);const exposures={...(prior?.exposures||{})};
  for(const id of event.question_ids)exposures[id]=(exposures[id]||0)+1;
  const unique=Object.keys(exposures).length,eligible=Object.values(exposures).reduce((s,n)=>s+Math.min(config.repeat_credit_cap,n-1),0);
  const effective=unique+config.repeat_confidence_weight*eligible,attempts=(prior?.completed_attempt_count||0)+1;
  const score=prior?config.mastery_decay_rate*Number(event.score)+(1-config.mastery_decay_rate)*prior.mastery_score:Number(event.score);
  const confidence=effective>=config.confidence_high_min_effective_questions&&attempts>=config.confidence_high_min_attempts?'HIGH':effective>=config.confidence_medium_min_effective_questions&&attempts>=config.confidence_medium_min_attempts?'MEDIUM':'LOW';
  const history=[...(prior?.history||[]),{score:Number(event.score),mastery:score,at:event.occurred_at,attempt_id:event.attempt_id}];
  const recent=history.slice(-config.trend_window);const delta=recent.length>=2?recent.at(-1).mastery-recent[0].mastery:null;
  const trend=delta===null?'INSUFFICIENT':delta>=config.trend_threshold?'UP':delta<=-config.trend_threshold?'DOWN':'STABLE';
  states.set(key,{topic_id:event.topic_id,cognitive_level:event.cognitive_level,mastery_score:score,confidence,trend,effective_question_count:effective,unique_question_count:unique,completed_attempt_count:attempts,exposures,history,algorithm:'decay-v1'});
 }
 return [...states.values()];
}
export function aggregate(states){
 const topics=new Map();for(const state of states){const list=topics.get(state.topic_id)||[];list.push(state);topics.set(state.topic_id,list);}
 return [...topics.entries()].map(([topic_id,levels])=>({topic_id,levels,provisional:levels.length<4,mastery_score:levels.reduce((sum,s)=>sum+s.mastery_score*s.effective_question_count,0)/levels.reduce((sum,s)=>sum+s.effective_question_count,0)}));
}
export async function recalculate(client,studentId,config){
 const {rows}=await client.query('SELECT * FROM mastery_events WHERE student_id=$1 ORDER BY occurred_at,id',[studentId]);
 const states=replay(rows,config);
 await client.query('DELETE FROM mastery_states WHERE student_id=$1',[studentId]);
 for(const state of states)await client.query('INSERT INTO mastery_states(student_id,topic_id,cognitive_level,mastery_score,state) VALUES($1,$2,$3,$4,$5)',[studentId,state.topic_id,state.cognitive_level,state.mastery_score,JSON.stringify(state)]);
 return states;
}
