import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import AdmZip from 'adm-zip';
import XLSX from 'xlsx';
import {buildQtiZip} from '../../src/services/qtiExport.js';
import {parseQti,parseDocx,parseExcel} from '../../src/services/practice/importAdapters.js';
import {normalizeQuestion,gradeQuestion,validateQuestion} from '../../src/services/practice/grading.js';
import {validateSettings,defaults} from '../../src/services/practice/config.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=','base64');
test('QTI roundtrip giữ năm dạng, bốn ý ĐS, ảnh, mức và đáp án',async()=>{
 fs.mkdirSync('uploads/media',{recursive:true});fs.writeFileSync('uploads/media/qti-fixture.png',png);
 const common={subject_id:1,topic_id:2,grade:9,cognitive_level:3,stem:'Mẫu kỹ thuật $x^2$ ![Hình](/uploads/media/qti-fixture.png)',explanation:'Giải thích'};
 const questions=[{type:'multiple_choice',options:['A','B','C','D'].map(id=>({id,text:id})),answer:{correct:'C'}},{type:'true_false',statements:['a','b','c','d'].map(id=>({id,text:id})),answer:{values:{a:true,b:false,c:true,d:false}}},{type:'short_answer',answer:{numeric:0,tolerance:0.1}},{type:'matching',left:[{id:'A',text:'a'},{id:'B',text:'b'}],right:[{id:'1',text:'một'},{id:'2',text:'hai'}],answer:{pairs:{A:'2',B:'1'}}},{type:'essay',answer:{reference:'GV chấm'}}].map(q=>({...common,...q}));
 const buffer=await buildQtiZip({title:'Kiểm thử QTI',questions});const zip=new AdmZip(buffer);assert(zip.getEntry('imsmanifest.xml'));assert.equal(zip.getEntries().filter(e=>e.entryName.startsWith('media/')).length,1);
 const result=parseQti(buffer);assert.equal(result.items.length,5);assert.equal(result.media.length,1);
 for(let i=0;i<5;i++){assert.equal(result.items[i].type,questions[i].type);assert.equal(result.items[i].cognitive_level,3);assert.deepEqual(result.items[i].answer,questions[i].answer);assert.match(result.items[i].stem,/\/uploads\/media\/[a-f0-9]{64}\.png/);}
});
test('DOCX mã KHTN có nội dung cùng dòng không mất phần dẫn',()=>{
 const zip=new AdmZip(),lines=['Câu L. 1. 2. NB. 3. TLN: Tính 2 − 2','Đáp án: 0'];zip.addFile('word/document.xml',Buffer.from('<w:document xmlns:w="w"><w:body>'+lines.map(s=>'<w:p><w:r><w:t>'+s+'</w:t></w:r></w:p>').join('')+'</w:body></w:document>'));
 const q=parseDocx(zip.toBuffer()).items[0];assert.equal(q.stem,'Tính 2 − 2');assert.equal(q.type,'short_answer');assert.equal(gradeQuestion(q,'0').score,1);
});
test('Excel chuẩn giữ ảnh ở phương án JSON',()=>{
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{stem:'Câu mẫu',type:'multiple_choice',cognitive_level:1,options:JSON.stringify(['A','B','C','D'].map(id=>({id,text:id}))),answer:JSON.stringify({correct:'A'}),option_a_image:'a.png'}]),'Questions');
 const q=parseExcel(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),[{filename:'a.png',path:'media/a.png',url:'/uploads/media/a.png'}]).items[0];assert.match(q.options[0].text,/!\[Ảnh\]/);
});
test('ĐS legacy tách bốn nhận định khỏi phần dẫn và chặn ID trùng',()=>{
 const q=normalizeQuestion({q_type:'true_false',stem_text:'Phần dẫn\na) Một\nb) Hai\nc) Ba\nd) Bốn',answer_key:'a-Đ; b-S; c-Đ; d-S'});assert.equal(q.stem,'Phần dẫn');assert.equal(q.statements.length,4);assert.equal(gradeQuestion(q,{a:true,b:false,c:true,d:false}).score,1);
 q.statements[1].id='a';assert(validateQuestion(q).errors.some(e=>e.includes('trùng')));
});
test('Cấu hình chặn min/max đảo ngược, preset sai và tính năng ngoài V1',()=>{
 assert.throws(()=>validateSettings(defaults,{practice_min_questions:50}));assert.throws(()=>validateSettings(defaults,{practice_presets:{basic:[25,25,25,24]}}));assert.throws(()=>validateSettings(defaults,{leaderboard:true}));assert.doesNotThrow(()=>validateSettings(defaults,{mastery_threshold:80}));
});
