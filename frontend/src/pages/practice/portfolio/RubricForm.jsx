import {useState} from 'react';
import {api} from '../../../api/client.js';
import {useAuth,hasCapability} from '../../../hooks/useAuth.js';

const types={TEACHER_RUBRIC:'Rubric giáo viên',PRACTICAL_TASK:'Thực hành cá nhân',PROJECT:'Sản phẩm dự án cá nhân',PRESENTATION:'Trình bày cá nhân',MANUAL_GRADED_ITEM:'Câu giáo viên chấm'};
export default function RubricForm({id,subject,grade,axes,onSaved}){
 const {user}=useAuth(),[axis,setAxis]=useState(''),[type,setType]=useState('TEACHER_RUBRIC'),[activity,setActivity]=useState(''),[score,setScore]=useState(''),[notes,setNotes]=useState(''),[reason,setReason]=useState(''),[occurred,setOccurred]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!hasCapability(user,'competency.enter_rubric'))return null;
 async function submit(e){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   await api.post('/api/competency/rubrics',{student_id:Number(id),subject_id:Number(subject),grade:Number(grade),axis_id:Number(axis),evidence_type:type,activity,performance:Number(score)/100,notes,reason,occurred_at:new Date(occurred).toISOString()});
   setConfirmed(false);setActivity('');setScore('');onSaved();
  }catch(err){setError(err.message);}finally{setBusy(false);}
 }
 return <details className="practice-card"><summary>Nhập minh chứng rubric giáo viên</summary>
 <p>Ghi nhận sản phẩm và đóng góp cá nhân, không dùng điểm nhóm thay cho năng lực học sinh. Bản ghi được giữ trong lịch sử.</p>
 {error&&<p role="alert">{error}</p>}
 <form onSubmit={submit}><fieldset disabled={busy}>
 <label>Trục minh chứng<select aria-label="Trục minh chứng" required value={axis} onChange={e=>setAxis(e.target.value)}><option value="">Chọn trục</option>{axes.map(a=><option key={a.axis_id} value={a.axis_id}>{a.code} · {a.name}</option>)}</select></label>
 <label>Loại minh chứng<select value={type} onChange={e=>setType(e.target.value)}>{Object.entries(types).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
 <label>Hoạt động / sản phẩm<textarea required maxLength={1000} value={activity} onChange={e=>setActivity(e.target.value)}/></label>
 <label>Mức đạt quan sát (%)<input required type="number" min="0" max="100" step="0.1" value={score} onChange={e=>setScore(e.target.value)}/></label>
 <label>Thời điểm quan sát<input required type="datetime-local" value={occurred} onChange={e=>setOccurred(e.target.value)}/></label>
 <label>Nhận xét<textarea maxLength={3000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
 <label>Căn cứ / lý do<input required maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
 <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Tôi xác nhận minh chứng cá nhân và mức đạt đã được kiểm tra</label>
 <button className="btn" disabled={!confirmed||!axis||score===''}>Ghi minh chứng</button>
 </fieldset></form></details>;
}
