// Độ phủ câu hỏi theo Bài (V6.8): mỗi Bài có bao nhiêu câu đã duyệt mà học sinh tự luyện được, theo 4 mức — để tổ biết Bài
// nào còn thiếu câu trước khi học sinh dùng bản đồ bài học. Chỉ tải khi mở; không có quyền đọc nội dung môn/khối thì ẩn.
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../../api/client.js';

export default function LessonCoverage({subject,grade}){
 const [open,setOpen]=useState(false),[data,setData]=useState(null),[error,setError]=useState(''),[onlyShort,setOnlyShort]=useState(true);
 useEffect(()=>{setData(null);setError('');if(!open||!subject||!grade)return undefined;let live=true;api.get(`/api/practice/lesson-coverage?subject_id=${subject}&grade=${grade}`).then(d=>{if(live)setData(d);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[open,subject,grade]);
 const s=data?.summary;
 return <details className="practice-card" onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary>Câu hỏi theo Bài — học sinh đã luyện được những Bài nào?</summary>
  {error&&<p className="staff-muted">Không xem được số câu của môn/khối này: {error}</p>}
  {open&&!data&&!error&&<p>Đang đếm…</p>}
  {data&&<>
   <p><b>{s.ready}/{s.lessons}</b> Bài đủ câu cho học sinh luyện (mỗi Bài cần từ {data.min_questions} câu đã duyệt ở kho trường) · {s.empty} Bài chưa có câu nào · tổng {s.questions} câu.</p>
   {(s.other>0||s.pending>0||s.unassigned>0)&&<p className="warn-box">{[s.pending&&`${s.pending} câu đang chờ duyệt`,s.other&&`${s.other} câu đã duyệt nằm ở kho tổ / kho cá nhân (học sinh chỉ gặp khi được giao bài)`,s.unassigned&&`${s.unassigned} câu đã duyệt chưa gắn Bài (học sinh chưa luyện được)`].filter(Boolean).join(' · ')}.</p>}
   <div className="practice-actions"><label className="check-label"><input type="checkbox" checked={onlyShort} onChange={e=>setOnlyShort(e.target.checked)}/>Chỉ hiện Bài còn thiếu câu</label><Link className="btn" to="/practice/import">Nhập câu hỏi</Link><Link className="btn" to="/practice/reviews?tab=pending">Duyệt câu</Link></div>
   <div className="table-scroll"><table className="template-lessons"><thead><tr><th>Bài</th><th>NB</th><th>TH</th><th>VD</th><th>VDC</th><th>HS luyện được</th><th>Kho khác</th><th>Chờ duyệt</th><th>Nháp</th><th>Tình trạng</th></tr></thead><tbody>
    {data.chapters.map(ch=>{const rows=ch.lessons.filter(l=>!onlyShort||!l.ready);if(!rows.length)return null;return [<tr key={'c'+ch.name}><th colSpan={10} scope="colgroup">{ch.name}</th></tr>,...rows.map(l=><tr key={l.id}>
     <td>{l.name}</td>{l.levels.map((n,i)=><td key={i}>{n||''}</td>)}<td><b>{l.total}</b></td><td>{l.other||''}</td><td>{l.pending||''}</td><td>{l.draft||''}</td>
     <td>{l.ready?'Đủ':l.total?`Thiếu ${l.missing} câu`:'Chưa có câu'}</td></tr>)];})}
   </tbody></table></div>
   {onlyShort&&s.ready===s.lessons&&<p className="ok-box">Mọi Bài đã đủ câu.</p>}
  </>}
 </details>;
}
