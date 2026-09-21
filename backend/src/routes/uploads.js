import {Router} from 'express';
import {storage} from '../services/storage/index.js';
import multer from 'multer';
import XLSX from 'xlsx';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {pool} from '../db/pool.js';
import {auth} from '../middleware/auth.js';
import {parseJob} from '../services/practice/imports.js';
import {imageType} from '../services/practice/importAdapters.js';
import {staff} from '../services/practice/authorization.js';
const r=Router();r.use(auth);
const author=(req,res,next)=>req.user.capabilities?.['content.write']?next():res.status(403).json({error:'Không có quyền tải nội dung'});
const root=path.resolve(process.env.UPLOAD_DIR||'uploads');
const temp=path.join(root,'private-imports');fs.mkdirSync(temp,{recursive:true});
const upload=multer({storage:multer.diskStorage({destination:temp,filename:(_r,f,cb)=>cb(null,crypto.randomUUID()+path.extname(f.originalname))}),limits:{fileSize:20*1024*1024,files:1}});
const importing=async(req,res,next)=>{try{res.status(201).json(await parseJob(req.user,req.file,req.body.metadata?JSON.parse(req.body.metadata):req.body));}catch(e){next(e);}};
r.post(['/questions-excel/preview','/questions-excel','/questions-qti'],author,upload.single('file'),importing);
// Download template Excel
r.get('/questions-excel/template', (_req, res, next) => {
  try {
    const wb = XLSX.utils.book_new();

    // Sheet Nhap_lieu — 20 cột chuẩn V4.5
    const header1 = ['TỰ SINH', '', 'PHÂN LOẠI (bắt buộc)', '', '', '', '', '',
                     'NỘI DUNG CÂU HỎI', '', '', '', '', '', '',
                     'ĐIỂM', 'VẬN HÀNH', '', '', ''];
    const header2 = ['STT', 'Mã câu hỏi', 'Môn', 'Lớp', 'Chủ đề lớn', 'Chủ đề con',
                     'Mức độ', 'Dạng thức', 'Nội dung câu hỏi (Phần dẫn)',
                     'Phương án A', 'Phương án B', 'Phương án C', 'Phương án D',
                     'Đáp án đúng', 'Lời giải / HDC',
                     'Điểm', 'Người biên soạn', 'Hình ảnh (URL/Tên file)', 'Trạng thái', 'Ghi chú'];
    const example1 = ['', '', 'Toán', 9, 'Phương trình bậc hai', 'Công thức nghiệm',
                      'M1 (NB)', 'Trắc nghiệm nhiều lựa chọn',
                      'Phương trình x^2 - 5x + 6 = 0 có hai nghiệm là:',
                      'x = 1 và x = 6', 'x = 2 và x = 3', 'x = -2 và x = -3', 'x = -1 và x = -6',
                      'B', 'Δ = 25-24 = 1 → x = (5±1)/2 → x=2, x=3',
                      0.25, 'Nguyễn Văn A', '', 'Mới tạo', ''];
    const example2 = ['', '', 'KHTN', 9, 'KHTN 9 - Vật lí (Bài 1-15)', 'Bài 3: Cơ năng',
                      'M2 (TH)', 'Đúng - Sai',
                      'Xét các phát biểu về cơ năng:\na) Cơ năng là tổng động năng + thế năng.\nb) Khi vật rơi tự do, cơ năng không đổi.\nc) Thế năng chỉ phụ thuộc vào khối lượng.\nd) Động năng tỉ lệ với bình phương vận tốc.',
                      '', '', '', '',
                      'a-Đ; b-Đ; c-S; d-Đ', 'c sai vì thế năng phụ thuộc cả độ cao',
                      1, 'Trần Thị B', 'https://example.com/image.png', 'Mới tạo', ''];

    const sheet1 = XLSX.utils.aoa_to_sheet([header1, header2, [], example1, example2]);
    XLSX.utils.book_append_sheet(wb, sheet1, 'Nhap_lieu');

    // Sheet Huong_dan
    const huong_dan = [
      ['QUY CHUẨN NHẬP LIỆU NGÂN HÀNG CÂU HỎI V4.3', ''],
      ['', ''],
      ['NGUYÊN TẮC CHUNG', ''],
      ['1.', 'Mỗi dòng = 1 câu hỏi. Cột A (STT) và B (Mã) để trống, hệ thống tự sinh.'],
      ['2.', 'Cột I (Nội dung) CHỈ ghi phần dẫn, KHÔNG viết A. B. C. D. vào đây.'],
      ['3.', 'Tự luận / Trả lời ngắn: để trống cột J-M.'],
      ['4.', 'Mã môn phải khớp danh sách: Toan, VatLi, HoaHoc, SinhHoc, KHTN, NguVan, TiengAnh, LichSu, DiaLi, GDCD, GDKTPL, TinHoc, CongNghe, IELTS.'],
      ['', ''],
      ['QUY TẮC ĐÁP ÁN & HÌNH ẢNH', ''],
      ['Trắc nghiệm 4 lựa chọn:', 'Cột N ghi A / B / C / D.'],
      ['Đúng - Sai:', 'Cột N ghi chuỗi "a-Đ; b-S; c-Đ; d-S".'],
      ['Trả lời ngắn:', 'Cột N ghi trực tiếp đáp án (số hoặc cụm từ).'],
      ['Tự luận:', 'Cột N để trống, cột O ghi rubric chấm.'],
      ['Hình ảnh:', 'Cột R ghi URL hoặc Link hình ảnh (http://...). Nếu dùng tính năng Tải ảnh lên trên web, copy URL dán vào đây.'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(huong_dan), 'Huong_dan');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Template_Ngan_Hang_V4.xlsx"');
    res.send(buf);
  } catch (err) { next(err); }
});


r.post('/image',author,multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1}}).single('image'),async(req,res,next)=>{
 try{staff(req.user);if(!req.user.capabilities?.['content.write'])return res.status(403).json({error:'Không có quyền tải ảnh nội dung'});if(!req.file)return res.status(400).json({error:'Không có file'});
 const type=imageType(req.file.buffer),filename=crypto.randomUUID()+'.'+type.ext,dir=path.join(root,'images');
 if(!['.png','.jpg','.jpeg','.gif','.webp'].includes(path.extname(req.file.originalname).toLowerCase()))return res.status(400).json({error:'Chỉ nhận ảnh PNG/JPEG/GIF/WebP'});
 const metadata=await sharp(req.file.buffer,{limitInputPixels:40000000}).metadata();if(!metadata.width||!metadata.height)throw Error('Ảnh không hợp lệ');
 await storage.put('images/'+filename,req.file.buffer,type.mime);
 await pool.query('INSERT INTO media_assets(storage_key,original_filename,mime,size_bytes,checksum,created_by) VALUES($1,$2,$3,$4,$5,$6)',[filename,req.file.originalname,type.mime,req.file.buffer.length,crypto.createHash('sha256').update(filename).update(req.file.buffer).digest('hex'),req.user.id]);
 res.json({url:'/uploads/images/'+filename,filename});}catch(e){next(e);}
});
export default r;
