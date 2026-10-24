import test from 'node:test';
import assert from 'node:assert/strict';
import {generateVocabQuestions,toneVariants,meaningParts,conflicts,languageOf,entryOutcomes} from '../../src/services/vocab/generator.js';
import {mapRow} from '../../src/services/vocab/bank.js';
import {gradeQuestion} from '../../src/services/practice/grading.js';

const seeded=seed=>()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
// Có từ đồng nghĩa (big/large), từ nhiều nghĩa và nhóm dễ nhầm để bắt lỗi "hai đáp án đúng".
const en=[['big','to; lớn'],['large','rộng; lớn'],['small','nhỏ'],['tiny','bé xíu'],['happy','vui vẻ'],['sad','buồn'],['run','chạy'],['walk','đi bộ'],['house','ngôi nhà'],['home','nhà; tổ ấm'],['cat','con mèo'],['dog','con chó'],['red','màu đỏ'],['blue','màu xanh dương']].map(([term,meaning_vi],i)=>({id:i+1,set_id:1+(i%2),term,meaning_vi,confusable_group:['house','home'].includes(term)?'nha':null}));
const zh=[['你好','nǐ hǎo','xin chào'],['谢谢','xièxie','cảm ơn'],['再见','zàijiàn','tạm biệt'],['老师','lǎoshī','giáo viên'],['学生','xuésheng','học sinh'],['朋友','péngyou','bạn bè'],['妈妈','māma','mẹ'],['马','mǎ','con ngựa'],['水','shuǐ','nước'],['茶','chá','trà']].map(([term,reading,meaning_vi],i)=>({id:100+i,set_id:9,term,reading,meaning_vi}));
const correctOf=c=>c.type==='matching'?c.answer.pairs:c.answer.correct;

test('V695 sinh câu: 1.000 lần không có câu hai đáp án đúng, đáp án luôn chấm đúng',()=>{
 const random=seeded(7);
 for(let run=0;run<1000;run++){
  const pool=run%2?en:zh,qs=generateVocabQuestions(pool,{count:7,random});assert.equal(qs.length,7);
  for(const q of qs){
   const c=q.content;assert.equal(gradeQuestion({content:c},correctOf(c)).score,1);
   if(c.type!=='multiple_choice')continue;
   assert.equal(new Set(c.options.map(o=>o.text.toLowerCase())).size,4,'Phương án không trùng');
   const target=pool.find(e=>e.id===q.vocab_entry_ids[0]);
   for(const o of c.options.filter(o=>o.id!==c.answer.correct)){
    // Phương án sai không được là nghĩa / từ / phiên âm của một từ trùng nghĩa với đích.
    const owner=pool.find(e=>[e.meaning_vi,e.term,e.reading].includes(o.text));
    if(owner)assert.equal(conflicts(target,owner),false,`${q.kind}: "${o.text}" cũng đúng cho ${target.term}`);
   }
  }
 }
});

test('V695 sinh câu: dạng giáo viên chọn, bộ nhỏ vẫn đủ câu, câu ghép 4 cặp',()=>{
 const only=generateVocabQuestions(en,{count:10,kinds:['EN1'],random:seeded(3)});assert.ok(only.every(q=>q.kind==='EN1'));
 assert.equal(generateVocabQuestions(en.slice(0,8),{count:15,random:seeded(5)}).length,15);
 const match=generateVocabQuestions(en,{count:10,kinds:['EN5'],random:seeded(9)}).find(q=>q.kind==='EN5');
 assert.ok(match);assert.equal(match.content.left.length,4);assert.equal(match.vocab.length,4);
 const group=match.vocab_entry_ids.map(id=>en.find(e=>e.id===id));assert.ok(!group.some(a=>group.some(b=>a!==b&&conflicts(a,b))),'Bốn cặp ghép phải khác nghĩa nhau');
 assert.deepEqual(generateVocabQuestions(en,{count:5,kinds:['ZH1']}),[],'Dạng tiếng Trung không áp cho bộ tiếng Anh');
});

test('V695 tiếng Trung: biến thể thanh điệu, ZH3 nhiễu cùng âm khác thanh, nhận ngôn ngữ',()=>{
 assert.deepEqual(toneVariants('mǎ'),['mā','má','mà']);assert.equal(toneVariants('nǐ hǎo').length,6);
 assert.equal(languageOf(zh),'zh');assert.equal(languageOf(en),'en');
 const q=generateVocabQuestions(zh,{count:10,kinds:['ZH3'],random:seeded(11)})[0];
 const target=zh.find(e=>e.id===q.vocab_entry_ids[0]),answer=q.content.options.find(o=>o.id===q.content.answer.correct).text;
 assert.equal(answer,target.reading);assert.ok(q.content.options.filter(o=>o.text!==answer).every(o=>o.text!==target.reading));
});

test('V695 nhập: ánh xạ cột Bufopia / HSK, tách nghĩa',()=>{
 assert.deepEqual(mapRow({id:'daily-0',word:' routine ',meaning_vi:'thói quen',topic:'daily',topic_name:'daily'}).set,'Daily life');
 const row=mapRow({Hanzi:'你好',Pinyin:'nǐ hǎo','Nghĩa':'xin chào',HSK:'HSK1'});
 assert.equal(row.term,'你好');assert.equal(row.reading,'nǐ hǎo');assert.equal(row.meaning_vi,'xin chào');assert.equal(row.level,1);assert.equal(row.set,'');
 assert.deepEqual(meaningParts('to; lớn (kích thước)'),['to','lớn']);
});

test('V695 chấm theo từng từ: ghép đúng 3/4 cặp chỉ tính sai một từ; hết giờ tính chưa đúng',()=>{
 const match=generateVocabQuestions(en,{count:10,kinds:['EN5'],random:seeded(9)}).find(q=>q.kind==='EN5');
 const ids=match.vocab_entry_ids,pairs=match.content.answer.pairs,lefts=match.content.left.map(l=>l.id);
 assert.deepEqual(Object.values(entryOutcomes(match.content,ids,pairs,1)),[true,true,true,true]);
 const wrong={...pairs,[lefts[2]]:pairs[lefts[3]],[lefts[3]]:pairs[lefts[2]]};
 const partial=entryOutcomes(match.content,ids,wrong,0.5);
 assert.deepEqual(ids.map(id=>partial[id]),[true,true,false,false]);
 assert.deepEqual(Object.values(entryOutcomes(match.content,ids,undefined,0)),[false,false,false,false]);
 const mcq=generateVocabQuestions(en,{count:3,kinds:['EN1'],random:seeded(2)})[0];
 assert.deepEqual(entryOutcomes(mcq.content,mcq.vocab_entry_ids,mcq.content.answer.correct,1),{[mcq.vocab_entry_ids[0]]:true});
 assert.equal(languageOf([...en.slice(0,10),{id:99,term:'你',meaning_vi:'bạn',set_id:1}]),'en','một chữ Hán lẫn vào bộ Anh không đổi ngôn ngữ cả bộ');
});
