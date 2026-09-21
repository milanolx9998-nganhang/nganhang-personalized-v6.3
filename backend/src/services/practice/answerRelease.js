export const ANSWER_POLICIES=['AFTER_EACH_RESPONSE','AFTER_SUBMIT','AFTER_DEADLINE','MANUAL_RELEASE','NEVER'];
export function canRevealAnswer(attempt,item={},assignment=null,now=Date.now()){
 const policy=attempt.assignment_id?(assignment?.answer_release_policy||'NEVER'):(attempt.mode==='practice'?'AFTER_EACH_RESPONSE':'AFTER_SUBMIT');
 if(policy==='NEVER')return false;
 if(policy==='AFTER_EACH_RESPONSE')return !attempt.assignment_id&&(attempt.status==='completed'||item.is_final===true);
 if(attempt.status!=='completed')return false;
 if(policy==='AFTER_SUBMIT')return true;
 if(policy==='AFTER_DEADLINE')return !!assignment?.closes_at&&Number.isFinite(new Date(assignment.closes_at).getTime())&&now>=new Date(assignment.closes_at).getTime();
 if(policy==='MANUAL_RELEASE')return !!assignment?.answers_released_at&&now>=new Date(assignment.answers_released_at).getTime();
 return false;
}
export async function releaseContext(client,attempt){return attempt.assignment_id?(await client.query('SELECT answer_release_policy,closes_at,answers_released_at FROM assignments WHERE id=$1',[attempt.assignment_id])).rows[0]:null;}
