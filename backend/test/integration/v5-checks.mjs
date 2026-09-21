import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
export function registerV5(test,context){
 test('V5: quyền lớp+môn tường minh, board/viewer chỉ đọc và workspace không lộ phạm vi',async()=>{
  const {db,req,login,pw,studentId,classId,subjectId,teacherToken,studentToken}=context();
  const board=(await db.query("INSERT INTO users(username,password_hash,full_name,role) VALUES('v5_board',$1,'Theo dõi V5','board') RETURNING id",[await bcrypt.hash(pw,10)])).rows[0];
  const boardToken=await login('v5_board'),viewerToken=await login('pilot_test_viewer');
  const root='/practice/students/'+studentId;
  assert.equal((await req('GET',root+'/portfolio',undefined,boardToken)).status,403);
  assert.equal((await req('GET',root+'/portfolio',undefined,viewerToken)).status,403);
  await db.query('INSERT INTO teacher_class_assignments(teacher_id,class_id,subject_id) VALUES($1,$2,$3)',[board.id,classId,subjectId]);
  assert.equal((await req('GET',root+'/portfolio',undefined,boardToken)).status,200);
  assert.equal((await req('GET',root+'/portfolio',undefined,studentToken)).status,200);
  assert.equal((await req('GET',root+'/portfolio',undefined,teacherToken)).status,200);
  const otherSubject=(await db.query('SELECT id FROM subjects WHERE id<>$1 LIMIT 1',[subjectId])).rows[0].id;
  assert.equal((await req('GET','/practice/classes/'+classId+'/dashboard?subject_id='+otherSubject,undefined,teacherToken)).status,403);
  const otherClass=(await db.query('SELECT id FROM classes WHERE id<>$1 AND id NOT IN(SELECT class_id FROM teacher_class_assignments WHERE teacher_id=(SELECT id FROM users WHERE username=\'pilot_test_teacher\')) LIMIT 1',[classId])).rows[0];
  assert(otherClass);assert.equal((await req('GET','/practice/classes/'+otherClass.id+'/dashboard',undefined,teacherToken)).status,403);
  assert.equal((await req('PUT',root+'/profile',{full_name:'Không được sửa'},boardToken)).status,403);
  assert.equal((await req('GET','/practice/operations',undefined,boardToken)).status,403);
  assert.equal((await req('GET','/practice/workspace',undefined,studentToken)).status,403);
  for(const token of [teacherToken,boardToken,viewerToken]){
   const w=await req('GET','/practice/workspace',undefined,token);assert.equal(w.status,200,JSON.stringify(w.data));
   assert(w.data.recent.every(a=>a.student_id!==-1));assert.equal(w.data.scope,'explicit_class_subject');
   if(token===viewerToken){assert.equal(w.data.summary.students,0);assert.deepEqual(w.data.recent,[]);assert.deepEqual(w.data.due,[]);}
  }
 });
 test('V5: đếm câu đã trả lời không tính khoảng trắng; LOW không phân loại mạnh/yếu',async()=>{
  const {db,req,studentId,studentToken}=context();
  const {answered}=await import('../../src/services/practice/portfolio.js');
  for(const [response,want] of [[null,false],['   ',false],[{},false],[{value:'   ',unit:'m'},false],[{unit:'m'},false],[0,true],[false,true],[{value:0},true],[{a:false},true]]){
   const row=(await db.query('SELECT '+answered+' value FROM (SELECT $1::jsonb response) i',[JSON.stringify(response)])).rows[0];assert.equal(row.value,want,JSON.stringify(response));
  }
  const {learningSignals}=await import('../../src/services/practice/portfolioRules.js');
  const signals=learningSignals([{mastery_score:100,confidence:'LOW',trend:'UP'},{mastery_score:0,confidence:'LOW',trend:'DOWN'}]);
  assert.equal(signals.focus.length,0);assert.equal(signals.strong.length,0);
  const page=await req('GET','/practice/students/'+studentId+'/attempts?limit=10&offset=10',undefined,studentToken);
  assert.equal(page.status,200);assert.equal(page.data.limit,10);assert.equal(page.data.offset,10);assert.equal(page.data.items.length,10);
  const ops=await req('GET','/practice/operations');assert.equal(ops.status,200);assert(ops.data.connections.total>0);assert(!JSON.stringify(ops.data).includes('password'));
 });
}
