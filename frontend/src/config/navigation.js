import {hasAnyCapability} from '../hooks/useAuth.js';
export const staffGroups=[
 {id:'learning',label:'Học sinh & Học tập',description:'Theo dõi lớp và hành trình học tập trong phạm vi được giao.',children:[{to:'/practice',label:'Tiến độ lớp',end:true,capabilities:['learning.read']},{to:'/practice/students',label:'Học sinh & hồ sơ',capabilities:['student.read']}]},
 // Một lối vào chính: giáo viên nghĩ "ngân hàng câu hỏi", không nghĩ theo từng màn hình rời rạc.
 // Các route sâu vẫn dùng được và vẫn nằm trong nhóm này để ai quen đường cũ không bị mất lối.
 {id:'content',label:'Ngân hàng & Nội dung',description:'Biên soạn, nhập và duyệt câu hỏi theo môn.',children:[{to:'/practice/banks',label:'Ngân hàng câu hỏi',capabilities:['content.read']},{to:'/practice/curriculum',label:'Chuẩn đầu ra · Bài–YCCĐ',capabilities:['curriculum.read']},{to:'/taxonomy',label:'Môn học · Chương · Bài',capabilities:['curriculum.manage','curriculum.manage_lessons']},{to:'/tags',label:'Nhãn',capabilities:['content.write']}]},
 {id:'assign',label:'Tạo & Giao bài',description:'Giao bài luyện, tạo đề và xuất phiếu học tập.',children:[{to:'/practice/assignments',label:'Giao bài · Xuất phiếu',capabilities:['assignment.read']},{to:'/matrix',label:'Ma trận đề',capabilities:['matrix.read']},{to:'/exams',label:'Đề thi',capabilities:['exam.read']}]},
 {id:'reports',label:'Báo cáo & Phân tích',description:'Đọc kết quả và nhận diện nội dung cần củng cố.',children:[{to:'/reports',label:'Báo cáo',capabilities:['analytics.read']},{to:'/analysis',label:'Phân tích',capabilities:['analytics.read']},{to:'/dashboard',label:'Thống kê ngân hàng',capabilities:['content.read']}]},
 {id:'admin',label:'Quản trị nhà trường',description:'Nhân sự, tổ chức, chương trình và vận hành.',children:[{to:'/admin/staff',label:'Nhân sự & phân công',capabilities:['staff.manage']},{to:'/admin/school',label:'Năm học · Lớp · Danh sách HS',capabilities:['class.manage']},{to:'/admin/curriculum',label:'Môn học & cấu hình nội dung',capabilities:['curriculum.manage','curriculum.read','competency.read']},{to:'/admin/banks',label:'Kho & chính sách',capabilities:['bank.manage']},{to:'/admin/settings',label:'Cấu hình hệ thống',capabilities:['system.config']},{to:'/admin/operations',adminOnly:true,label:'Vận hành & nhật ký',capabilities:['system.config']}]}
];
export const studentLinks=[{to:'/practice',label:'Trang học tập',end:true},{to:'/practice/new',label:'Tự luyện'},{to:'/practice/assignments',label:'Bài được giao'},{to:'/practice/flagged',label:'★ Câu cần xem lại'},{to:'/practice/portfolio',label:'Hồ sơ học tập'},{to:'/practice/password',label:'Tài khoản'}];
export function groupsFor(user){return staffGroups.map(g=>({...g,children:g.children.filter(c=>(!c.adminOnly||user.role==='admin')&&hasAnyCapability(user,c.capabilities))})).filter(g=>g.children.length);}
export function activeGroup(path,groups){if(path.includes('/portfolio')||/^\/practice\/students\//.test(path))return 'learning';
 // Kho / Nhập / Duyệt là ba tab của cùng một mục điều hướng.
 if(/^\/practice\/(banks|import|reviews)/.test(path))return 'content';
 return groups.find(g=>g.children.some(c=>c.end?path===c.to:path===c.to||path.startsWith(c.to+'/')))?.id;}

