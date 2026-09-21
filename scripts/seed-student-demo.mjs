import {createRequire} from 'node:module';
const require=createRequire(new URL('../backend/package.json',import.meta.url));
require('dotenv').config({path:new URL('../backend/.env',import.meta.url)});
if(process.env.DB_NAME!=='nganhang_personalized_v5'||process.env.NODE_ENV==='production')throw new Error('Chỉ tạo demo trong database V5 local');
const {pool}=await import('../backend/src/db/pool.js');
const {createStudent}=await import('../backend/src/services/practice/students.js');
const {saveAssignment}=await import('../backend/src/services/practice/assignments.js');
try{
 const admin=(await pool.query("SELECT * FROM users WHERE username='pilot_admin' AND role='admin'")).rows[0];if(!admin)throw new Error('Cần pilot_admin');
 const year=(await pool.query("INSERT INTO school_years(name) VALUES('2026-2027') ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id")).rows[0];
 const cls=(await pool.query("INSERT INTO classes(name,grade,school_year_id) VALUES('9-DEMO',9,$1) ON CONFLICT(name,school_year_id) DO UPDATE SET name=EXCLUDED.name RETURNING id",[year.id])).rows[0];
 let student=(await pool.query("SELECT id,role,full_name FROM users WHERE username='hs_demo'")).rows[0];
 if(student&&(student.role!=='student'||student.full_name!=='Học sinh Demo'))throw new Error('Mã hs_demo đang được dùng; không ghi đè');
 if(!student){student=await createStudent(admin,{student_code:'hs_demo',full_name:'Học sinh Demo',class_id:cls.id,password:'Demo12345'});await pool.query('UPDATE users SET must_change_password=false WHERE id=$1',[student.id]);}
 // Dùng câu hiện hữu đã được duyệt; không tạo kiến thức hoặc số liệu học sinh giả.
 const topicNames=['Bài 3: Cơ năng','Bài 4: Công và công suất'];
 const topics=(await pool.query('SELECT id,subject_id FROM topics WHERE grade=9 AND name=ANY($1::text[]) ORDER BY id',[topicNames])).rows;
 if(topics.length!==2||topics[0].subject_id!==topics[1].subject_id)throw new Error('Thiếu đúng chuyên đề nguồn cho bài demo');
 const title='Khởi động KHTN 9 · Cơ năng, công và công suất';
 let assignment=(await pool.query('SELECT id FROM assignments WHERE created_by=$1 AND title=$2',[admin.id,title])).rows[0];
 if(!assignment)assignment=await saveAssignment(admin,{title,instructions:'Bài trải nghiệm lấy từ kho câu hỏi hiện có. Đọc từng câu, chọn đáp án rồi chốt để xem phản hồi. Em có thể quay lại các câu cần củng cố.',kind:'fixed',class_ids:[cls.id],config:{subject_id:topics[0].subject_id,grade:9,topic_ids:topics.map(t=>t.id),count:10,percent:[40,60,0,0],types:['multiple_choice'],mode:'practice'}});
 console.log(JSON.stringify({student:'hs_demo',class:'9-DEMO',assignment_id:assignment.id,created_or_verified:true}));
}finally{await pool.end();}
