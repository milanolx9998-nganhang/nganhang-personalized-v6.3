import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMatrixNumbers,balanceReport} from '../../src/services/matrixValidation.js';
import {allocateExact,examQuestion} from '../../src/services/examGenerator.js';
import {autoDistribute,totalScoreOf} from '../../src/services/matrixBalancer.js';
const matrix={total_score:10,ratio_m1:30,ratio_m2:30,ratio_m3:20,ratio_m4:20};
test('Tổng sai trả 422 MATRIX_SCORE_MISMATCH',()=>{assert.throws(()=>validateMatrixNumbers({...matrix,cells:[{q_type:'mcq4',cognitive_level:'M1',question_count:1,score_per_question:.25}]}),e=>e.code==='MATRIX_SCORE_MISMATCH'&&e.status===422);});
test('Draft cấu hình rỗng không bị coi là đề đủ câu',()=>assert.equal(validateMatrixNumbers({...matrix,cells:[]}).balanced,false));
test('Sai tỷ lệ cần xác nhận và lý do, tổng đúng không đủ',()=>{
 const m={...matrix,cells:[{q_type:'mcq4',cognitive_level:'M1',question_count:40,score_per_question:.25}]};
 assert.throws(()=>validateMatrixNumbers(m),e=>e.code==='MATRIX_RATIO_DEVIATION');
 assert.throws(()=>validateMatrixNumbers({...m,deviation_accepted:true}),e=>e.code==='MATRIX_DEVIATION_REASON');
 assert.equal(validateMatrixNumbers({...m,deviation_accepted:true,deviation_reason:'Phân bố riêng cho đề ôn tập'}).balanced,false);
});
test('Cấu hình 1 điểm 30/30/20/20 có chênh lệch rõ ràng',()=>{
 const cells=autoDistribute({totalScore:1,ratios:[30,30,20,20],branchConfigs:[{score:1,tn:4}]});
 assert.equal(balanceReport(cells,1,[30,30,20,20]).requires_deviation_acceptance,true);
});
test('Ghép nối tham gia phân bổ và giữ đúng số câu/điểm',()=>{
 const cells=autoDistribute({totalScore:10,ratios:[30,30,20,20],branchConfigs:[{score:10,tn:20,gn:10}]});
 assert.equal(totalScoreOf(cells),10);assert.equal(cells.filter(c=>c.q_type==='matching').reduce((s,c)=>s+c.question_count,0),10);assert(balanceReport(cells,10,[30,30,20,20]).balanced);
});
test('Ô hẹp không bị ô rộng lấy hết câu; thiếu hợp toàn cục bị chặn',()=>{
 const cells=[{question_count:1},{question_count:1}],pools=[[{id:1},{id:2}],[{id:1}]];
 const picked=allocateExact(cells,pools);assert.equal(picked[1][0].id,1);assert.equal(picked[0][0].id,2);
 assert.equal(allocateExact(cells,[[{id:1}],[{id:1}]]),null);
});
test('Snapshot dùng điểm ô và trộn đúng phương án/đáp án',()=>{
 const q=examQuestion({id:7,cognitive_level:2,current_version_id:'v1',content:{type:'multiple_choice',stem:'Bản cũ',score:99,options:['A','B','C','D'].map(id=>({id,text:id+' gốc'})),answer:{correct:'B'}}},['D','B','A','C'],.5);
 assert.equal(q.score,.5);assert.equal(q.answer.correct,'B');assert.equal(q.options[0].text,'D gốc');assert.equal(q.question_version_id,'v1');
});
test('V63 Excel nâng cao giữ ghép nối và ID phiên bản',async()=>{
 const {questionWorkbook}=await import('../../src/services/questionWorkbook.js'),{parseExcel}=await import('../../src/services/practice/importAdapters.js');
 const rows=[{id:101,current_version_id:'old-version',subject_id:1,grade:7,topic_id:2,outcome_id:3,yccd_id:4,content:{stem:'Ghép đơn vị',type:'matching',left:[{id:'A',text:'Tốc độ'}],right:[{id:'1',text:'m/s'}],answer:{pairs:{A:'1'}}}}];
 const q=parseExcel(questionWorkbook(rows)).items[0];assert.equal(q.record_action,'UPDATE');assert.equal(q.question_id,101);assert.equal(q.question_version_id,'old-version');assert.deepEqual(q.left,rows[0].content.left);assert.deepEqual(q.answer,rows[0].content.answer);
});
test('V63 tệp có hai sheet dữ liệu phải chọn rõ sheet',async()=>{
 const XLSX=(await import('xlsx')).default,{parseExcel}=await import('../../src/services/practice/importAdapters.js');
 const wb=XLSX.utils.book_new();for(const name of ['04_QUESTION_UPLOAD_SIMPLE','05_QUESTION_UPLOAD_ADV'])XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{question_text:name,answer:'1'}]),name);
 const b=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});assert.throws(()=>parseExcel(b),/chọn sheet/);assert.equal(parseExcel(b,[],'04_QUESTION_UPLOAD_SIMPLE').items.length,1);
});
