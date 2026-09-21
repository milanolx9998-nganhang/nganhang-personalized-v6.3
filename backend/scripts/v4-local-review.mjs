import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
const origin='http://127.0.0.1:3002',artifacts=path.resolve('../artifacts');
const browser=await chromium.launch({headless:true}),results=[];
async function session(username,password){
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>{throw e;});
 await page.goto(origin+'/login');await page.getByPlaceholder('admin').fill(username);await page.locator('input[type=password]').fill(password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL(username==='hs_demo'?origin+'/practice':origin+'/');return page;
}
async function capture(page,name){await page.evaluate(()=>document.fonts.ready);await page.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});await page.screenshot({path:path.join(artifacts,name+'.png'),fullPage:true});results.push({name,url:page.url(),width:page.viewportSize().width});}
try{
 const staff=await session('pilot_admin','admin');
 await staff.getByRole('heading',{level:1}).waitFor();await capture(staff,'v4-staff-sidebar');
 await staff.goto(origin+'/practice/students');await staff.getByRole('link',{name:'Xem hồ sơ',exact:true}).first().waitFor();await capture(staff,'v4-student-management');
 await staff.getByRole('link',{name:'Xem hồ sơ',exact:true}).first().click();await staff.getByRole('heading',{name:'Điểm nổi bật',exact:true}).waitFor();const profile=staff.url();await capture(staff,'v4-student-portfolio-overview');
 await staff.emulateMedia({media:'print'});await staff.pdf({path:path.join(artifacts,'v4-student-portfolio-print.pdf'),format:'A4',printBackground:true});await staff.emulateMedia({media:'screen'});
 await staff.getByRole('link',{name:'Lịch sử làm bài',exact:true}).click();await staff.getByText(/lượt phù hợp/).waitFor();await capture(staff,'v4-student-portfolio-history');
 await staff.getByRole('link',{name:/Xem chi tiết/}).first().click();await staff.getByRole('heading',{name:'Chi tiết lượt luyện',exact:true}).waitFor();await staff.locator('.review-question summary').first().click();await capture(staff,'v4-student-attempt-review');
 await staff.goto(profile+'?tab=mastery');await staff.getByRole('heading',{name:'Thành thạo theo nội dung',exact:true}).waitFor();await capture(staff,'v4-student-portfolio-mastery');
 await staff.goto(origin+'/practice');await staff.getByLabel('Năm học · Lớp').selectOption({label:'2026-2027 · 9-DEMO'});await staff.getByRole('link',{name:/hs_demo/}).waitFor();await capture(staff,'v4-teacher-class');
 await staff.setViewportSize({width:390,height:844});await staff.getByRole('button',{name:'Mở menu',exact:true}).click();await capture(staff,'v4-staff-sidebar-mobile');await staff.keyboard.press('Escape');
 await staff.setViewportSize({width:1440,height:900});await staff.goto(origin+'/practice/admin');await staff.getByLabel('Giáo viên / người theo dõi',{exact:true}).waitFor();await staff.getByLabel('Giáo viên / người theo dõi',{exact:true}).locator('option').nth(1).waitFor({state:'attached'});await capture(staff,'v4-admin-permissions');
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{student_code:'hs_demo',full_name:'Học sinh Demo',class_name:'9-DEMO',grade:9,school_year:'2026-2027'}]),'Students');
 await staff.getByLabel('Danh sách học sinh Excel',{exact:true}).setInputFiles({name:'kiem-tra-xem-truoc.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(wb,{type:'buffer',bookType:'xlsx'})});await staff.getByRole('button',{name:'Phân tích và xem trước',exact:true}).click();await staff.getByRole('button',{name:'Xác nhận nhập danh sách',exact:true}).waitFor();await capture(staff,'v4-roster-preview');
 const student=await session('hs_demo','Demo12345');await student.getByRole('link',{name:'Xem toàn bộ hồ sơ học tập →',exact:true}).waitFor();await capture(student,'v4-student-home');await student.setViewportSize({width:390,height:844});
 await student.getByRole('link',{name:'Tiếp tục',exact:true}).first().click();await student.getByRole('heading',{name:'Bài luyện của em',exact:true}).waitFor();await capture(student,'v4-player-mobile');
 await student.goto(origin+'/practice/portfolio');await student.getByRole('heading',{name:'Điểm nổi bật',exact:true}).waitFor();await capture(student,'v4-local-portfolio-mobile');
 fs.writeFileSync(path.join(artifacts,'v4-local-browser.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));console.log('Đã kiểm tra và chụp '+results.length+' màn hình local, không nộp/sửa bài demo.');
}finally{await browser.close();}
