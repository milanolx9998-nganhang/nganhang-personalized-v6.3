import {can} from '../accessResolver.js';
import {studentQuestion} from '../practice/studentDto.js';
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
const metadata=['id','question_id','question_version_id','version_number','question_code','subject_id','branch_id','topic_id','grade','outcome_id','yccd_id','cognitive_level','q_type','main_topic','sub_topic','score','creator_name','creator_id','status','review_status','is_locked','usage_count','last_used_at','family_code','created_at','updated_at','reviewed_by','approved_by','bank_id','lifecycle','current_version_id','active_version_id','metadata_revision','quarantined','subject_name','subject_code','topic_name','branch_name','outcome_code','yccd_code','bank_name','assigned_score','sequence','exam_code','question_order','original_question_id','legacy_unverifiable','answer_hidden'];
const curriculum=['subject_id','grade','branch_id','branch_name','topic_id','topic_name','outcome_id','outcome_code','outcome_text','yccd_id','yccd_code','yccd_text','cognitive_level','revision','historical_labels_unavailable'];
export function staffQuestionDto(question,answers=false){
 const out=pick(question,metadata);
 Object.assign(out,pick(question,['stem_text','option_a','option_b','option_c','option_d','image_url']));
 Object.assign(out,pick(studentQuestion(question,answers),['type','stem','options','statements','left','right','blocks','unit','answer','explanation']),pick(question,['order_index','part_name','option_order','run_id','matrix_cell_id']));
 for(const key of ['active_metadata','curriculum_snapshot'])if(question[key])out[key]=pick(question[key],curriculum);
 const content=question.content||question.normalized_content;
 if(content){const q=studentQuestion(content,answers);Object.assign(q,pick(content,['subject_id','grade','topic_id','branch_id','outcome_id','yccd_id','taxonomy_node_id','outcome','yccd','branch_code','display_code']));if(question.content)out.content=q;if(question.normalized_content)out.normalized_content=q;}
 if(answers)Object.assign(out,pick(question,['answer','answer_key','explanation','original_answer','q_answer_key']));
 else out.answer_hidden=true;
 return out;
}
export async function visibleQuestion(user,question,client){
 const allowed=await can(user,'content.view_answer',{subjectId:question.subject_id,grade:question.grade,bankId:question.bank_id},client);
 return staffQuestionDto(question,allowed);
}
