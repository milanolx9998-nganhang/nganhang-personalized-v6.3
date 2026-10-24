import test from 'node:test';
import assert from 'node:assert/strict';
import {VOCAB_KINDS,DEFAULT_VOCAB_KINDS,generateVocabQuestions,toneVariants,syllableTone,blankExample,meaningParts,conflicts,languageOf,entryOutcomes} from '../../src/services/vocab/generator.js';
import {mapRow} from '../../src/services/vocab/bank.js';
import {gradeQuestion} from '../../src/services/practice/grading.js';

const seeded=seed=>()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
// Có từ đồng nghĩa (big/large), từ nhiều nghĩa, câu ví dụ và nhóm dễ nhầm để bắt lỗi "hai đáp án đúng".
const en=[
 ['big','to; lớn','They live in a big city.'],
 ['large','rộng; lớn','She bought a large box.'],
 ['small','nhỏ','This is a small room.'],
 ['tiny','bé xíu','A tiny bird flew in.'],
 ['happy','vui vẻ','We are happy today.'],
 ['sad','buồn','He felt sad yesterday.'],
 ['run','chạy','They run every morning.'],
 ['walk','đi bộ','I walk to school.'],
 ['house','ngôi nhà','My house is near the park.'],
 ['home','nhà; tổ ấm','Welcome home everyone.'],
 ['cat','con mèo','The cat sleeps on the sofa.'],
 ['dog','con chó','A dog barked loudly.'],
 ['uniform','đồng phục','Uniform is required on Monday.'],
 ['blue','màu xanh dương',null]
].map(([term,meaning_vi,example],i)=>({id:i+1,set_id:1+(i%2),term,meaning_vi,example,confusable_group:['house','home'].includes(term)?'nha':null}));
const zh=[['你好','nǐ hǎo','xin chào'],['谢谢','xièxie','cảm ơn'],['再见','zàijiàn','tạm biệt'],['老师','lǎoshī','giáo viên'],['学生','xuésheng','học sinh'],['朋友','péngyou','bạn bè'],['妈妈','māma','mẹ'],['马','mǎ','con ngựa'],['水','shuǐ','nước'],['茶','chá','trà'],['书','shū','sách'],['去','qù','đi'],['吗','ma','không (trợ từ)']].map(([term,reading,meaning_vi],i)=>({id:100+i,set_id:9,term,reading,meaning_vi}));
const correctOf=c=>c.type==='matching'?c.answer.pairs:c.type==='short_answer'?c.answer.aliases[0]:c.answer.correct;

test('V695 sinh câu: 1.000 lần không có câu hai đáp án đúng, đáp án luôn chấm đúng (cả mặc định và đủ dạng mới)',()=>{
 const random=seeded(7);
 for(let run=0;run<1000;run++){
  const isZhPool=run%2===1,pool=isZhPool?zh:en;
  const kinds=run%4<2?null:(isZhPool?VOCAB_KINDS.zh:VOCAB_KINDS.en);
  const qs=generateVocabQuestions(pool,{count:7,kinds,random});assert.equal(qs.length,7);
  for(const q of qs){
   if(!kinds)assert.ok(DEFAULT_VOCAB_KINDS[isZhPool?'zh':'en'].includes(q.kind),'Mặc định chỉ trộn dạng cũ');
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

test('V695 EN3 điền từ vào câu ví dụ: đục ____ không phân biệt hoa thường, không lộ đáp án trong stem, từ thiếu example thì bỏ qua',()=>{
 assert.equal(blankExample('Uniform is required on Monday.','uniform'),'____ is required on Monday.');
 assert.equal(blankExample('We wear uniforms on Monday.','uniform'),null,'Không đục một phần từ khác');
 assert.equal(blankExample(null,'blue'),null);
 const qs=generateVocabQuestions(en,{count:10,kinds:['EN3'],random:seeded(13)});
 assert.ok(qs.length>=8);
 for(const q of qs){
  assert.equal(q.kind,'EN3');assert.equal(q.seconds,12);assert.equal(q.content.type,'multiple_choice');
  const target=en.find(e=>e.id===q.vocab_entry_ids[0]);
  assert.ok(target.example,'Từ không có example không được sinh EN3');
  assert.ok(q.content.stem.includes('____'),'Stem phải có chỗ trống ____');
  assert.equal(q.content.stem.toLowerCase().includes(target.term.toLowerCase()),false,'EN3 không lộ đáp án trong stem');
  assert.equal(gradeQuestion({content:q.content},q.content.answer.correct).score,1);
 }
});

test('V695 EN4 gõ chính tả theo nghĩa: short_answer 20s, chấm đúng với "Uniform ", "UNIFORM", lọc độ dài/ký tự',()=>{
 const uniformEntry=en.find(e=>e.term==='uniform');
 const shortInvalid=[
  {id:201,set_id:1,term:'go',meaning_vi:'đi'},
  {id:202,set_id:1,term:'accomplishment',meaning_vi:'thành tựu (14 ký tự)'},
  {id:203,set_id:1,term:'internationalization',meaning_vi:'quốc tế hoá (quá 14 ký tự)'},
  {id:204,set_id:1,term:"o'clock",meaning_vi:'giờ đúng (có dấu nháy)'},
  uniformEntry
 ];
 const qs=generateVocabQuestions(shortInvalid,{count:5,kinds:['EN4'],random:seeded(17)});
 const terms=qs.map(q=>q.vocab[0].term);
 assert.ok(terms.includes('uniform'));assert.ok(terms.includes('accomplishment'));
 assert.ok(!terms.includes('go'));assert.ok(!terms.includes('internationalization'));assert.ok(!terms.includes("o'clock"));
 const uq=qs.find(q=>q.vocab[0].term==='uniform');
 assert.equal(uq.kind,'EN4');assert.equal(uq.seconds,20);assert.equal(uq.content.type,'short_answer');
 assert.equal(uq.content.stem,'Gõ từ tiếng Anh có nghĩa “đồng phục”');
 assert.equal(gradeQuestion({content:uq.content},'uniform').score,1);
 assert.equal(gradeQuestion({content:uq.content},'Uniform ').score,1);
 assert.equal(gradeQuestion({content:uq.content},'UNIFORM').score,1);
 assert.equal(gradeQuestion({content:uq.content},'  uNiFoRm  ').score,1);
 assert.equal(gradeQuestion({content:uq.content},'pencil').score,0);
});

test('V695 tiếng Trung: biến thể thanh điệu, ZH3 nhiễu cùng âm khác thanh, ZH5 chọn thanh điệu đúng thanh',()=>{
 assert.deepEqual(toneVariants('mǎ'),['mā','má','mà']);assert.equal(toneVariants('nǐ hǎo').length,6);
 assert.equal(languageOf(zh),'zh');assert.equal(languageOf(en),'en');
 const q=generateVocabQuestions(zh,{count:10,kinds:['ZH3'],random:seeded(11)})[0];
 const target=zh.find(e=>e.id===q.vocab_entry_ids[0]),answer=q.content.options.find(o=>o.id===q.content.answer.correct).text;
 assert.equal(answer,target.reading);assert.ok(q.content.options.filter(o=>o.text!==answer).every(o=>o.text!==target.reading));
 // ZH5: chỉ từ 1 chữ Hán có dấu thanh 1..4; bỏ qua từ 2 chữ và khinh thanh.
 assert.deepEqual(syllableTone('mǎ'),{tone:3,forms:['mā','má','mǎ','mà']});
 assert.equal(syllableTone('ma'),null);assert.equal(syllableTone('nǐ hǎo'),null);
 const zh5=generateVocabQuestions(zh,{count:10,kinds:['ZH5'],random:seeded(19)});
 assert.ok(zh5.length>=5);
 const expectedTone={'马':3,'水':3,'茶':2,'书':1,'去':4};
 for(const item of zh5){
  assert.equal(item.kind,'ZH5');assert.equal(item.seconds,8);
  const w=item.vocab[0].term;assert.equal([...w].length,1,'ZH5 chỉ cho từ một chữ Hán');assert.notEqual(w,'吗','Bỏ qua khinh thanh');
  const rightOpt=item.content.options.find(o=>o.id===item.content.answer.correct);
  assert.ok(rightOpt.text.startsWith('Thanh '+expectedTone[w]),`${w} phải là Thanh ${expectedTone[w]}, nhận: ${rightOpt.text}`);
  assert.equal(gradeQuestion({content:item.content},item.content.answer.correct).score,1);
 }
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
 const oneWrong={...pairs,[lefts[2]]:'999'};
 assert.deepEqual(entryOutcomes(match.content,ids,oneWrong,0.75),{[ids[0]]:true,[ids[1]]:true,[ids[2]]:false,[ids[3]]:true});
 assert.deepEqual(Object.values(entryOutcomes(match.content,ids,null,0)),[false,false,false,false]);
});