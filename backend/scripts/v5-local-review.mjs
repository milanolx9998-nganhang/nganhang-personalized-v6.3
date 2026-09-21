import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
const origin='http://127.0.0.1:3002',artifacts=path.resolve('../artifacts');
const browser=await chromium.launch({headless:true}),results=[],errors=[];
async function session(username,password,viewport){
 const page=await browser.newPage({viewport});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/login');await page.getByLabel('Mã học sinh / Tên đăng nhập',{exact:true}).fill(username);await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Hiện mật khẩu',exact:true}).click();assert.equal(await page.locator('#login-password').getAttribute('type'),'text');await page.getByRole('button',{name:'Ẩn mật khẩu',exact:true}).click();
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL(username==='hs_demo'?origin+'/practice':origin+'/');return page;
}
async function ready(p){await p.locator('[role=status]').filter({hasText:'Đang'}).waitFor({state:'hidden'}).catch(()=>{});await p.evaluate(()=>document.fonts.ready);}
async function capture(p,name){await ready(p);await p.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Horizontal overflow: '+name);await p.screenshot({path:path.join(artifacts,name+'.png'),fullPage:true});results.push({name,url:p.url(),viewport:p.viewportSize()});}
try{
 const staff=await session('pilot_admin','admin',{width:1440,height:900});await staff.getByRole('heading',{name:'Hôm nay cần chú ý',exact:true}).waitFor();await capture(staff,'v5-workspace-home-desktop');
 await staff.goto(origin+'/practice');await staff.getByLabel('Năm học · Lớp').selectOption({label:'2026-2027 · 9-DEMO'});await staff.getByRole('link',{name:/hs_demo/}).waitFor();await capture(staff,'v5-teacher-class');
 await staff.setViewportSize({width:390,height:844});await capture(staff,'v5-teacher-class-mobile');await staff.getByRole('button',{name:'Mở menu',exact:true}).click();await capture(staff,'v5-sidebar-mobile');await staff.keyboard.press('Escape');
 const student=await session('hs_demo','Demo12345',{width:390,height:844});await student.getByRole('link',{name:'Xem toàn bộ hồ sơ học tập →',exact:true}).waitFor();
 await capture(student,'v5-student-home-mobile');
 const initialJs=await student.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name).filter(n=>/\/assets\/.*\.js$/.test(n)));
 assert(!initialJs.some(n=>/\/(Teacher|Admin|Questions|Matrix|Exams|Analysis|Reports|Rich|katex)/.test(n)),JSON.stringify(initialJs));
 const chunks=initialJs.map(url=>{const file=path.resolve('../frontend/dist/assets',url.split('/').at(-1)),buf=fs.readFileSync(file);return {file:path.basename(file),bytes:buf.length,gzip_bytes:gzipSync(buf).length};});
 fs.writeFileSync(path.join(artifacts,'v5-bundle-report.json'),JSON.stringify({before:{initial_js_bytes:839920,gzip_bytes:246810,source:'v5-baseline-build.log'},after:{initial_student_chunks:chunks,total_bytes:chunks.reduce((n,c)=>n+c.bytes,0),total_gzip_bytes:chunks.reduce((n,c)=>n+c.gzip_bytes,0)},staff_only_modules_loaded:false,observed_browser_network:true},null,2));
 await student.getByRole('link',{name:'Tiếp tục',exact:true}).click();await student.getByRole('heading',{name:'Bài luyện của em',exact:true}).waitFor();await capture(student,'v5-player-mobile');
 for(const [width,height] of [[390,844],[430,932],[768,1024],[1366,768],[1440,900]]){
  await student.setViewportSize({width,height});await student.goto(origin+'/practice/portfolio');await student.getByRole('heading',{name:'Điểm nổi bật',exact:true}).waitFor();await capture(student,width===390?'v5-portfolio-overview-mobile':'v5-portfolio-'+width);
  if(width<480)await student.getByLabel('Phần hồ sơ',{exact:true}).selectOption('history');else await student.getByRole('link',{name:'Lịch sử làm bài',exact:true}).click();
  await student.getByText(/lượt phù hợp/).waitFor();await capture(student,width===390?'v5-history-mobile':'v5-history-'+width);
 }
 await student.setViewportSize({width:390,height:844});await student.goto(origin+'/practice/portfolio?tab=mastery');await student.getByRole('heading',{name:'Thành thạo theo nội dung',exact:true}).waitFor();assert(await student.getByText('Chưa đủ dữ liệu',{exact:false}).count()>0);await capture(student,'v5-portfolio-low-confidence');
 const low=student.locator('.portfolio-level.provisional summary');for(const text of await low.allTextContents()){assert(text.includes('Chưa đủ dữ liệu'));assert(!text.includes('%'));}
 await student.setViewportSize({width:1440,height:900});await student.goto(origin+'/practice/portfolio');await student.getByRole('heading',{name:'Điểm nổi bật',exact:true}).waitFor();
 await student.locator('.portfolio-overview details').evaluateAll(ds=>ds.forEach(d=>d.open=true));await student.emulateMedia({media:'print'});await student.pdf({path:path.join(artifacts,'v5-portfolio-print.pdf'),format:'A4',printBackground:true});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(artifacts,'v5-local-browser.json'),JSON.stringify({at:new Date().toISOString(),results,errors,no_attempt_writes:true},null,2));console.log('V5 browser: '+results.length+' ảnh, 5 viewport, không ghi/nộp bài demo.');
}finally{await browser.close();}
