export const EVIDENCE_TYPES=['AUTO_GRADED_ITEM','MANUAL_GRADED_ITEM','PRACTICAL_TASK','PROJECT','TEACHER_RUBRIC','PRESENTATION','SELF_ASSESSMENT','PEER_ASSESSMENT'];
export const subjectTemplates={
 KHTN:{title:'Năng lực KHTN — CTGDPT 2018',axes:[['KHTN-C1','Nhận thức khoa học tự nhiên',true],['KHTN-C2','Tìm hiểu tự nhiên',false],['KHTN-C3','Vận dụng kiến thức, kĩ năng đã học',true]]},
 MATH:{title:'Năng lực Toán — CTGDPT 2018',axes:[['MATH-C1','Tư duy và lập luận toán học',true],['MATH-C2','Mô hình hoá toán học',false],['MATH-C3','Giải quyết vấn đề toán học',true],['MATH-C4','Giao tiếp toán học',false],['MATH-C5','Sử dụng công cụ, phương tiện học toán',false]]}
};
const day=86400000;
export function projectAxis(axis,evidence,config,now){
 const clock=new Date(now).getTime();
 const rows=evidence.filter(e=>Number(e.axis_id)===Number(axis.id)&&Number.isFinite(e.performance)&&e.performance>=0&&e.performance<=1&&new Date(e.occurred_at).getTime()<=clock&&(e.allowed_evidence||axis.allowed_evidence).includes(e.evidence_type));
 const allowed=['axis_id','evidence_ref','evidence_type','performance','mapping_weight','occurred_at','yccd_id','attempt_id','question_version_id','mapping_id','activity','notes'];
 const unique=[...new Map(rows.map(e=>[e.evidence_ref,Object.fromEntries(allowed.filter(k=>e[k]!==undefined).map(k=>[k,e[k]]))])).values()];
 let total=0,sum=0;for(const e of unique){const days=(clock-new Date(e.occurred_at).getTime())/day;const weight=Number(e.mapping_weight||1)*(config.reliability[e.evidence_type]||0)*config.recency[days<=30?0:days<=60?1:days<=90?2:3];sum+=e.performance*weight;total+=weight;}
 const recent=unique.filter(e=>clock-new Date(e.occurred_at).getTime()<=30*day).length;
 const diversity=new Set(unique.map(e=>e.evidence_type)).size,coverage=new Set(unique.map(e=>e.yccd_id).filter(Boolean)).size;
 const confidence=unique.length?Math.min(100,Math.round(60*Math.min(1,unique.length/config.target_evidence)+20*Math.min(1,diversity/3)+10*Math.min(1,recent/config.minimum_evidence)+10*Math.min(1,coverage/5))):0;
 return {axis_id:axis.id,code:axis.code,name:axis.name,performance_score:total?Math.round(sum/total*1000)/10:null,confidence_score:confidence,evidence_count:unique.length,recent_evidence_count:recent,mapped_yccd_count:coverage,last_evidence_at:unique.map(e=>e.occurred_at).sort((a,b)=>new Date(b)-new Date(a))[0]||null,sufficient:unique.length>=config.minimum_evidence&&confidence>=config.minimum_confidence,evidence:unique};
}
const localDate=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export function habitMetrics(attempts,config,now,periodDays=30){
 const end=new Date(now).getTime(),start=end-periodDays*day;
 const inPeriod=attempts.filter(a=>new Date(a.started_at).getTime()>=start&&new Date(a.started_at).getTime()<=end);
 const meaningful=inPeriod.filter(a=>a.answered_count>=Math.min(3,a.question_count)&&a.question_count>0&&!['cancelled','technical_error'].includes(a.status));
 const completed=meaningful.filter(a=>a.status==='completed'&&a.completed_at&&new Date(a.completed_at).getTime()<=end),self=completed.filter(a=>a.source==='self_practice');
 const dates=[...new Set(completed.map(a=>localDate(a.completed_at)))].sort();let best=0,streak=0,previous=null;
 for(const date of dates){streak=previous&&new Date(date)-new Date(previous)===day?streak+1:1;best=Math.max(best,streak);previous=date;}
 const today=localDate(now),yesterday=localDate(end-day);if(previous!==today&&previous!==yesterday)streak=0;
 const active7=dates.filter(d=>d>=localDate(end-6*day)).length;
 const review=completed.filter(a=>a.retry_of&&a.corrected_count>0),reviewTargets=new Set(review.map(a=>a.retry_of)).size;
 return {period_days:periodDays,active_days:dates.length,active_days_7:active7,practice_sessions_started:meaningful.length,practice_sessions_completed:completed.length,self_started_sessions:self.length,assigned_sessions:completed.filter(a=>a.source==='teacher_assigned').length,streak_current:streak,streak_best:best,completion_rate:meaningful.length?Math.round(completed.length/meaningful.length*100):null,self_started_ratio:completed.length?Math.round(self.length/completed.length*100):null,review_wrong_count:reviewTargets,indices:{consistency:dates.length?Math.min(100,Math.round(active7/config.target_active_days*100)):null,initiative:completed.length?Math.round(self.length/completed.length*100):null,completion:meaningful.length?Math.round(completed.length/meaningful.length*100):null,review:completed.length?Math.min(100,reviewTargets*20):null},note:'Chỉ mô tả hoạt động học trong ứng dụng, không đánh giá phẩm chất hoặc năng lực chính thức. Không tính đăng nhập, tab mở hay thời gian ngồi học.'};
}
