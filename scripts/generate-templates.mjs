import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../backend/package.json',import.meta.url));
const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType}=require('docx'),XLSX=require('xlsx'),AdmZip=require('adm-zip');
const root=fileURLToPath(new URL('../templates/',import.meta.url));fs.mkdirSync(root,{recursive:true});
const p=text=>new Paragraph({children:[new TextRun({text,font:'Lexend',size:24})],spacing:{after:120}});
const paragraphs=[
 'MẪU CẤU TRÚC NHẬP — THAY BẰNG CÂU HỎI ĐÃ ĐƯỢC NHÀ TRƯỜNG DUYỆT',
 'Mã Outcome/YCCĐ bên dưới là ví dụ cấu trúc, không phải dữ liệu chương trình chính thức.',
 'Chọn đúng môn, khối, chuyên đề trong bước xem trước. Không tự điền mức độ khi chưa xác định.',
 'Câu L. 1. 1. NB. 1. TN',
 '[Nội dung phần dẫn câu trắc nghiệm]',
 'A. [Nội dung phương án A]','B. [Nội dung phương án B]','C. [Nội dung phương án C]','D. [Nội dung phương án D]',
 'Đáp án: A','Lời giải: [Bổ sung lời giải đã kiểm chứng]',
 'Câu L. 1. 1. TH. 2. ĐS',
 '[Bối cảnh chung cho bốn nhận định]',
 'a) [Nhận định a]','b) [Nhận định b]','c) [Nhận định c]','d) [Nhận định d]',
 'Đáp án: a-Đ; b-S; c-Đ; d-S','Lời giải: [Giải thích từng ý]',
 'Câu L. 1. 1. VD. 3. TLN','[Câu trả lời ngắn. Công thức có thể dùng Equation hoặc $v=\\frac{s}{t}$.]',
 'Đáp án: [Đáp án chấp nhận]','Lời giải: [Lời giải]',
 'Câu L. 1. 1. NB. 4. GN','[Yêu cầu ghép nội dung giữa hai cột]'
];
const children=paragraphs.map(p);
children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[['Cột A','Cột B'],['A. [Ý A]','1. [Ý 1]'],['B. [Ý B]','2. [Ý 2]']].map(row=>new TableRow({children:row.map(t=>new TableCell({children:[p(t)]}))}))}));
children.push(...['Đáp án: A-1; B-2','Lời giải: [Giải thích cặp ghép]','Câu L. 1. 1. VDC. 5. TL','[Câu hỏi tự luận — tự đối chiếu, không tính điểm tự chấm]','Đáp án: [Đáp án tham khảo]','Lời giải: [Hướng dẫn và tiêu chí tự đối chiếu]'].map(p));
fs.writeFileSync(path.join(root,'question-import-khtn.docx'),await Packer.toBuffer(new Document({styles:{default:{document:{run:{font:'Lexend',size:24}}}},sections:[{children}]})));
const headers=['display_code','subject_id','grade','topic_id','cognitive_level','type','stem','options','statements','left','right','answer','explanation','outcome','yccd','stem_image','option_a_image','option_b_image','option_c_image','option_d_image','explanation_image'];
const rows=[
 {type:'multiple_choice',stem:'[Thay bằng câu đã duyệt]',options:JSON.stringify(['A','B','C','D'].map(id=>({id,text:'[Phương án '+id+']'}))),answer:JSON.stringify({correct:'A'})},
 {type:'true_false',stem:'[Bối cảnh bốn nhận định]',statements:JSON.stringify(['a','b','c','d'].map(id=>({id,text:'[Nhận định '+id+']'}))),answer:JSON.stringify({values:{a:true,b:false,c:true,d:false}})},
 {type:'short_answer',stem:'[Thay bằng câu trả lời ngắn]',answer:JSON.stringify({aliases:['[Đáp án chấp nhận]'],case_sensitive:false})},
 {type:'matching',stem:'[Yêu cầu ghép nối]',left:JSON.stringify([{id:'A',text:'[Ý A]'}]),right:JSON.stringify([{id:'1',text:'[Ý 1]'}]),answer:JSON.stringify({pairs:{A:'1'}})},
 {type:'essay',stem:'[Tự luận tự đối chiếu]',answer:JSON.stringify({reference:'[Hướng dẫn chấm]'})}
];
const wb=XLSX.utils.book_new(),sheet=XLSX.utils.json_to_sheet(rows,{header:headers});sheet['!cols']=headers.map(k=>({wch:['stem','options','answer','statements'].includes(k)?50:20}));XLSX.utils.book_append_sheet(wb,sheet,'Questions');
XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['HƯỚNG DẪN'],['Mỗi dòng một câu. Mẫu là cấu trúc trống, không phải câu nguồn chính thức.'],['Điền mức 1–4, môn, khối, chuyên đề hoặc gán tại Preview.'],['Các cột options/statements/left/right/answer là JSON. Có thể sửa từng trường bằng giao diện.'],['Ảnh: ghi đường dẫn media/ten-anh.png. Đóng gói XLSX và thư mục media vào một ZIP.'],['Ảnh thiếu/trùng tên có cảnh báo; kiểm tra đúng vị trí trước xác nhận.'],['Không dùng macro, SVG hay liên kết ảnh từ máy chủ nội bộ khác.']]),'Huong_dan');
const buffer=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});fs.writeFileSync(path.join(root,'question-import.xlsx'),buffer);
const roster=XLSX.utils.book_new();XLSX.utils.book_append_sheet(roster,XLSX.utils.aoa_to_sheet([['student_code','full_name','class_name','grade','school_year']]),'Students');fs.writeFileSync(path.join(root,'student-roster.xlsx'),XLSX.write(roster,{type:'buffer',bookType:'xlsx'}));
const zip=new AdmZip();zip.addFile('questions.xlsx',buffer);zip.addFile('media/HUONG-DAN.txt',Buffer.from('Đặt ảnh PNG/JPEG/GIF/WebP vào thư mục này và ghi tên trong cột *_image.','utf8'));fs.writeFileSync(path.join(root,'question-import-images.zip'),zip.toBuffer());
console.log('Đã tạo 4 mẫu tại '+root);

