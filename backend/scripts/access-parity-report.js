import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {pool} from '../src/db/pool.js';
import {getEffectiveAccess,decide,bankDecision,contextFor} from '../src/services/accessResolver.js';
import {active} from '../src/services/access/policy.js';
// Frozen decision semantics of V6.4.3, independent from the new legacy adapter.
function legacy(a,key,raw){
 const u=a.user,c=contextFor(a.org,raw),ps=a.legacy_positions.filter(p=>!p.revoked_at&&active({...p,school_year_id:null},a.org,a.now));
 if(u.role==='admin')return true;if(u.role==='student')return false;
 const subject=a.org.subjects.find(s=>s.id===c.subjectId),own=new Set(u.subject_id?[u.subject_id]:[]),departments=new Set(u.role==='dept_leader'&&u.department_id?[u.department_id]:[]);
 for(const t of a.teaching)own.add(t.subject_id);
 for(const p of ps){if(['subject_teacher','dept_leader','board'].includes(p.position)&&p.subject_id)own.add(p.subject_id);if(['dept_leader','board'].includes(p.position)&&p.department_id)departments.add(p.department_id);}
 for(const s of a.org.subjects)if(departments.has(s.department_id))own.add(s.id);
 if(key==='content.read')return own.has(c.subjectId);
 if(key==='content.write'||key==='matrix.create'||key==='exam.generate')return !!subject&&!['student','viewer'].includes(u.role)&&(['teacher','dept_leader','grade_leader'].includes(u.role)&&(u.subject_id===c.subjectId||a.teaching.some(t=>t.subject_id===c.subjectId)||u.role==='dept_leader'&&u.department_id===subject.department_id)||ps.some(p=>p.position==='subject_teacher'&&p.subject_id===c.subjectId||p.position==='dept_leader'&&p.department_id===subject.department_id));
 if(['content.review','content.approve','matrix.approve'].includes(key))return !!subject&&!['student','viewer'].includes(u.role)&&(u.role==='dept_leader'&&u.department_id===subject.department_id||ps.some(p=>(p.position==='dept_leader'&&p.department_id===subject.department_id||p.position==='board'&&p.can_approve&&(p.subject_id===c.subjectId||p.department_id===subject.department_id))&&(key==='matrix.approve'||!p.grade||p.grade===c.grade)));
 if(['student.manage_basic','student.reset_password'].includes(key))return u.role!=='viewer'&&ps.some(p=>p.position==='homeroom'&&p.class_id===c.classId);
 if(key==='learning.read')return a.teaching.some(t=>t.class_id===c.classId&&t.subject_id===c.subjectId)||ps.some(p=>(p.position!=='subject_teacher'||p.class_id)&&(!p.class_id||p.class_id===c.classId)&&(!p.subject_id||p.subject_id===c.subjectId)&&(!p.department_id||p.department_id===c.departmentId)&&(!p.grade||p.grade===c.grade)&&(!p.school_year_id||p.school_year_id===c.schoolYearId));
 if(key.startsWith('bank.')){const b=a.org.banks.find(b=>b.id===c.bankId),permission=key.split('.')[1],rank={read:1,write:2,review:3};if(!b)return false;if(permission!=='read'&&['viewer','board'].includes(u.role))return false;return b.owner_id===u.id||a.memberships.some(m=>m.bank_id===b.id&&rank[m.permission]>=rank[permission])||b.kind==='department'&&b.department_id===u.department_id&&(permission==='read'||['dept_leader','grade_leader'].includes(u.role))||b.kind==='school'&&permission==='read';}
 return false;
}
try{
 const users=(await pool.query("SELECT id,username,full_name,role FROM users WHERE role<>'student' ORDER BY id")).rows,report={at:new Date().toISOString(),database:process.env.DB_NAME,mode:'READ_ONLY_SHADOW',staff:[],totals:{MATCH:0,EXPECTED_EXPANSION:0,EXPECTED_RESTRICTION:0,NEEDS_ADMIN_REVIEW:0,BUG:0}};
 for(const u of users){const a=await getEffectiveAccess(u.id),diffs=[],counts={MATCH:0,EXPECTED_EXPANSION:0,EXPECTED_RESTRICTION:0,NEEDS_ADMIN_REVIEW:0,BUG:0};
  const checks=[];for(const s of a.org.subjects)for(let grade=1;grade<=12;grade++)for(const key of ['content.read','content.write','content.review','content.approve','matrix.create','matrix.approve','exam.generate'])checks.push([key,{subjectId:s.id,grade}]);
  for(const c of a.org.classes){for(const s of a.org.subjects)checks.push(['learning.read',{classId:c.id,subjectId:s.id}]);for(const key of ['student.manage_basic','student.reset_password'])checks.push([key,{classId:c.id}]);}
  for(const b of a.org.banks)for(const key of ['bank.read','bank.write','bank.review'])checks.push([key,{bankId:b.id}]);
  for(const [capability,context] of checks){const old=legacy(a,capability,context),next=capability.startsWith('bank.')?bankDecision(a,capability.split('.')[1],a.org.banks.find(b=>b.id===context.bankId)):decide(a,capability,context);let classification='MATCH',reason='';
   if(old!==next.allowed){
    if(a.user.access_managed){classification=next.allowed?'EXPECTED_EXPANSION':'EXPECTED_RESTRICTION';reason='Hồ sơ đã được quản trị lưu bằng API chuẩn hóa có audit';}
    else if(next.overrides?.length){classification=next.allowed?'EXPECTED_EXPANSION':'EXPECTED_RESTRICTION';reason='Ngoại lệ được ghi nhận rõ phạm vi';}
    else if(old&&!next.allowed){classification='EXPECTED_RESTRICTION';reason='Phạm vi/ngày/năm học hoặc giới hạn read-only được áp dụng nhất quán';}
    else if(next.sources?.some(s=>s.type==='BANK_OWNER')){classification='EXPECTED_EXPANSION';reason='V6.5 ưu tiên chủ kho trên ACL theo đặc tả; quyền nội dung vẫn kiểm riêng, không cấp quyền sửa/duyệt nội dung cho BGH';}
    else if(next.sources?.some(s=>s.type==='POSITION'||s.position==='BOARD'||s.position==='HOMEROOM'||s.position==='GRADE_LEADER'||s.position==='DEPT_LEADER')){classification='EXPECTED_EXPANSION';reason='Preset V6.5 của vị trí đang có; không suy từ tổ chính';}
    else {classification='NEEDS_ADMIN_REVIEW';reason='Chưa có căn cứ tự phân loại khác biệt';}
    diffs.push({capability,context,legacy:old,current:next.allowed,classification,reason,sources:next.sources?.map(s=>({type:s.type,id:s.id,position:s.position}))});
   }
   counts[classification]++;report.totals[classification]++;
  }
  report.staff.push({...u,counts,differences:diffs});
 }
 const dir=path.resolve('../artifacts');fs.writeFileSync(path.join(dir,'v6_5-access-parity.json'),JSON.stringify(report,null,2));
 const lines=['# Shadow parity V6.5','',`Thời điểm: ${report.at}. Chỉ đọc; không chuẩn hóa hoặc thay quyền tài khoản.`, '', '| Nhân sự | Khớp | Mở rộng theo preset | Thu hẹp có chủ đích | Cần rà soát |','|---|---:|---:|---:|---:|',...report.staff.map(u=>`| ${u.full_name} (${u.username}) | ${u.counts.MATCH} | ${u.counts.EXPECTED_EXPANSION} | ${u.counts.EXPECTED_RESTRICTION} | ${u.counts.NEEDS_ADMIN_REVIEW} |`),'','Mọi context và nguồn quyền: `v6_5-access-parity.json`. Không coi số khớp là thay thế cho kiểm thử API âm.'];
 fs.writeFileSync(path.join(dir,'v6_5-access-parity.md'),lines.join('\n'));console.log(JSON.stringify({staff:users.length,totals:report.totals}));
 if(report.totals.BUG||report.totals.NEEDS_ADMIN_REVIEW)process.exitCode=2;
}finally{await pool.end();}
