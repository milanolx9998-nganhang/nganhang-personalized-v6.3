export const LEVELS=['M1','M2','M3','M4'];
export const units=n=>Math.round(Number(n)*100);
export function matrixError(code,message,details){return Object.assign(new Error(message),{status:422,code,details});}
export function balanceReport(cells,total,ratios){
 const actual=LEVELS.map(l=>cells.filter(c=>c.cognitive_level===l).reduce((s,c)=>s+units(c.score_per_question)*Number(c.question_count),0));
 const target=ratios.map(r=>Number(total)*r);
 const totalActual=actual.reduce((a,b)=>a+b,0);
 return {total_actual:totalActual/100,total_expected:Number(total),balanced:totalActual===units(total)&&actual.every((v,i)=>Math.abs(v-target[i])<.00001),
  levels:LEVELS.map((level,i)=>({level,target:target[i]/100,actual:actual[i]/100,delta:(actual[i]-target[i])/100})),requires_deviation_acceptance:actual.some((v,i)=>Math.abs(v-target[i])>.00001)};
}
export function validateMatrixNumbers(data){
 const ratios=LEVELS.map((_,i)=>Number(data['ratio_m'+(i+1)]));
 if(ratios.some(r=>!Number.isFinite(r)||r<0||r>100)||ratios.reduce((a,b)=>a+b,0)!==100)throw matrixError('MATRIX_RATIO_INVALID','Tổng tỷ lệ phải bằng 100%, mỗi mức từ 0 đến 100');
 if(!Number.isFinite(Number(data.total_score))||Number(data.total_score)<=0)throw matrixError('MATRIX_SCORE_INVALID','Tổng điểm phải dương');
 const cells=data.cells||[];
 for(const c of cells){
  if(!Number.isInteger(c.question_count)||c.question_count<1||c.question_count>500||!Number.isFinite(Number(c.score_per_question))||Number(c.score_per_question)<=0||Math.abs(Number(c.score_per_question)*100-units(c.score_per_question))>1e-7||!LEVELS.includes(c.cognitive_level)||!['mcq4','true_false','short','essay','matching'].includes(c.q_type))throw matrixError('MATRIX_CELL_INVALID','Ô ma trận cần số câu nguyên dương, điểm dương tối đa 2 chữ số thập phân, mức và dạng hợp lệ');
 }
 const report=balanceReport(cells,data.total_score,ratios);
 if(!cells.length)return report;
 if(units(report.total_actual)!==units(data.total_score))throw matrixError('MATRIX_SCORE_MISMATCH','Tổng điểm các ô không bằng tổng điểm ma trận',report);
 for(const br of data.branch_config||[]){
  const actual=cells.filter(c=>br.branch_id!=null?c.branch_id===br.branch_id:!c.branch_id).reduce((s,c)=>s+units(c.score_per_question)*c.question_count,0);
  if(actual!==units(br.score))throw matrixError('MATRIX_BRANCH_SCORE_MISMATCH','Tổng điểm phân môn không khớp',{branch_id:br.branch_id,expected:Number(br.score),actual:actual/100});
  for(const [key,type] of Object.entries({tn:'mcq4',ds:'true_false',tln:'short',gn:'matching',tl:'essay'}))if(br[key]!=null){
   const count=cells.filter(c=>(br.branch_id!=null?c.branch_id===br.branch_id:!c.branch_id)&&c.q_type===type).reduce((s,c)=>s+c.question_count,0);
   if(!Number.isInteger(br[key])||br[key]<0||count!==br[key])throw matrixError('MATRIX_TYPE_COUNT_MISMATCH','Số câu từng dạng không khớp cấu hình',{branch_id:br.branch_id,type,expected:br[key],actual:count});
  }
 }
 if(!report.balanced&&!data.deviation_accepted)throw matrixError('MATRIX_RATIO_DEVIATION','Tỷ lệ thực tế chưa khớp. Điều chỉnh cấu hình hoặc xác nhận sai lệch rõ ràng.',report);
 if(!report.balanced&&String(data.deviation_reason||'').trim().length<5)throw matrixError('MATRIX_DEVIATION_REASON','Cần ghi lý do chấp nhận sai lệch tỷ lệ');
 return report;
}
