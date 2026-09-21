import {pool} from '../../db/pool.js';
export const defaults=Object.freeze({metadata_auto_threshold:90,personalized_recommendations:false,auto_personalized_practice:false,essay_ai_grading:false,leaderboard:false,canvas_lti:false,mastery_decay_rate:0.65,mastery_threshold:85,confidence_medium_min_effective_questions:20,confidence_medium_min_attempts:2,confidence_high_min_effective_questions:40,confidence_high_min_attempts:3,repeat_confidence_weight:0.25,repeat_credit_cap:3,practice_min_questions:10,practice_default_questions:20,practice_max_questions:40,trend_window:3,trend_threshold:5,practice_presets:{basic:[50,30,20,0],balanced:[25,25,25,25],advanced:[10,20,40,30]}});
export async function settings(client=pool){const {rows}=await client.query('SELECT key,value FROM system_settings');return {...defaults,...Object.fromEntries(rows.map(r=>[r.key,r.value]))};}
export function fail(message,status=400,details){const e=new Error(message);e.status=status;e.details=details;throw e;}
export async function log(client,user,action,id,details={}){await client.query('INSERT INTO practice_audit(actor_id,action,entity_id,details) VALUES($1,$2,$3,$4)',[user?.id||null,action,String(id),JSON.stringify(details)]);}
export function validateSettings(current,changes){
 const merged={...current,...changes};
 if(merged.metadata_auto_threshold<70||merged.metadata_auto_threshold>100)fail('Ngưỡng tự tick cần từ 70 đến 100');
 for(const [key,value] of Object.entries(changes)){
  if(!(key in defaults))fail('Cấu hình không hợp lệ: '+key);
  if(typeof defaults[key]==='boolean'&&value!==false)fail('Tính năng ngoài V1 phải tắt');
  if(typeof defaults[key]==='number'&&(!Number.isFinite(value)||value<0))fail('Giá trị không hợp lệ: '+key);
 }
 for(const key of ['practice_min_questions','practice_default_questions','practice_max_questions','trend_window','confidence_medium_min_attempts','confidence_high_min_attempts','repeat_credit_cap'])if(!Number.isInteger(merged[key])||merged[key]<1)fail('Cần số nguyên dương: '+key);
 if(!(merged.practice_min_questions<=merged.practice_default_questions&&merged.practice_default_questions<=merged.practice_max_questions&&merged.practice_max_questions<=40))fail('Số câu phải thỏa min ≤ mặc định ≤ max ≤ 40');
 if(merged.mastery_decay_rate<=0||merged.mastery_decay_rate>1||merged.repeat_confidence_weight>1||merged.mastery_threshold>100)fail('Hệ số / ngưỡng Mastery ngoài giới hạn');
 if(merged.confidence_high_min_attempts<merged.confidence_medium_min_attempts||merged.confidence_high_min_effective_questions<merged.confidence_medium_min_effective_questions)fail('Ngưỡng tin cậy cao không được thấp hơn trung bình');
 if(!merged.practice_presets||typeof merged.practice_presets!=='object'||Array.isArray(merged.practice_presets))fail('Preset phải là tập cấu hình');
 for(const weights of Object.values(merged.practice_presets))if(!Array.isArray(weights)||weights.length!==4||weights.some(x=>!Number.isFinite(x)||x<0)||Math.abs(weights.reduce((a,b)=>a+b,0)-100)>1e-6)fail('Preset cần bốn tỷ lệ không âm, tổng 100');
 return merged;
}
