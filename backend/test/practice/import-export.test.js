import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {parseExcel} from '../../src/services/practice/importAdapters.js';
import {levelNumber} from '../../src/services/practice/grading.js';
import {buildWorksheet} from '../../src/services/practice/worksheetExport.js';
test('Legacy Excel 20 cột: đúng cột dữ liệu, dòng nguồn, bốn ý ĐS',()=>{
 const wb=XLSX.utils.book_new(),header=['STT','Mã câu hỏi','Môn','Lớp','Chủ đề lớn','Chủ đề con','Mức độ','Dạng thức','Nội dung câu hỏi (Phần dẫn)','Phương án A','Phương án B','Phương án C','Phương án D','Đáp án đúng','Lời giải / HDC','Điểm','Người biên soạn','Hình ảnh (URL/Tên file)','Trạng thái','Ghi chú'];
 const row=[1,'L.1','KHTN',7,'Tốc độ','Tốc độ chuyển động','M2 (TH)','Đúng - Sai','Chọn đúng sai:\na) Một\nb) Hai\nc) Ba\nd) Bốn','','','','','a-Đ; b-S; c-Đ; d-S','Lời giải',1,'GV','','Mới tạo',''];
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['NHÓM CỘT'],header,[],row]),'Nhap_lieu');
 const result=parseExcel(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));assert.equal(result.items.length,1);
 const q=result.items[0];assert.equal(q.grade,7);assert.equal(q.subject_text,'KHTN');assert.equal(q.cognitive_level,2);assert.equal(q.source_locator,'Dòng 4');assert.equal(q.statements.length,4);assert.equal(q.statements[1].text,'Hai');assert.equal(q.answer.values.b,false);
});
test('Không nhận sai mức 14 hoặc chuỗi có chữ số',()=>{for(const value of ['14','M10','abc2','0','M5'])assert.equal(levelNumber(value),null);assert.equal(levelNumber('M4 (VDC)'),4);});
test('Word/PDF: năm dạng, công thức, ảnh, bảng và đáp án 0',{timeout:60000},async()=>{
 const artifacts=path.resolve('../artifacts');fs.mkdirSync(artifacts,{recursive:true});fs.mkdirSync('uploads/media',{recursive:true});
 const png=await sharp({create:{width:100,height:60,channels:3,background:'#2563eb'}}).png().toBuffer();fs.writeFileSync('uploads/media/export-fixture.png',png);
 const items=[
 {type:'multiple_choice',stem:'[Mẫu kiểm thử] Tốc độ $v=\\frac{s}{t}$.\n\n![Hình](/uploads/media/export-fixture.png)\n\n| s (m) | t (s) |\n| --- | --- |\n| 10 | 2 |',options:['A','B','C','D'].map(id=>({id,text:'Lựa chọn '+id})),answer:{correct:'B'}},
 {type:'true_false',stem:'[Mẫu kiểm thử] Các nhận định',statements:['a','b','c','d'].map(id=>({id,text:'Nhận định '+id})),answer:{values:{a:true,b:false,c:true,d:false}}},
 {type:'short_answer',stem:'[Mẫu kiểm thử] Tính 2 − 2',answer:{numeric:0}},
 {type:'matching',stem:'[Mẫu kiểm thử] Ghép đại lượng và đơn vị',left:[{id:'A',text:'Quãng đường'},{id:'B',text:'Thời gian'}],right:[{id:'1',text:'Mét'},{id:'2',text:'Giây'}],answer:{pairs:{A:'1',B:'2'}}},
 {type:'essay',stem:'[Mẫu kiểm thử] Trình bày cách đo tốc độ.',answer:{reference:'Đo quãng đường và thời gian.'}}
 ];
 const docx=await buildWorksheet({title:'PHIẾU KIỂM THỬ KỸ THUẬT — KHÔNG PHÁT CHO HỌC SINH',items,answers:true});
 fs.writeFileSync(path.join(artifacts,'worksheet-verified.docx'),docx);
 const zip=new AdmZip(docx),xml=zip.readAsText('word/document.xml');assert(xml.includes('Lexend'));assert(xml.includes('Ghép đại lượng'));assert(xml.includes('Công thức'));assert(zip.getEntries().filter(e=>e.entryName.startsWith('word/media/')).length>=2);
 const pdf=await buildWorksheet({title:'PHIẾU KIỂM THỬ KỸ THUẬT',items,answers:true,format:'pdf'});assert.equal(pdf.subarray(0,4).toString(),'%PDF');fs.writeFileSync(path.join(artifacts,'worksheet-verified.pdf'),pdf);
});
