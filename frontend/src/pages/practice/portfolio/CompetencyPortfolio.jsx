import {useState} from 'react';
import {Link} from 'react-router-dom';
import {RadarChart,Radar,PolarGrid,PolarAngleAxis,PolarRadiusAxis,ResponsiveContainer} from 'recharts';
import {base} from '../shared.jsx';
import {usePortfolio,LoadState,date} from './common.jsx';

const percent=value=>value==null?'Chưa có dữ liệu':`${value}%`;
const types={AUTO_GRADED_ITEM:'Câu tự chấm',MANUAL_GRADED_ITEM:'Câu giáo viên chấm',PRACTICAL_TASK:'Thực hành',PROJECT:'Sản phẩm dự án',TEACHER_RUBRIC:'Rubric giáo viên',PRESENTATION:'Trình bày',SELF_ASSESSMENT:'Tự đánh giá',PEER_ASSESSMENT:'Đánh giá đồng đẳng'};
export default function CompetencyPortfolio({id,memberships,mode,self}){
 const catalog=usePortfolio(base+'/catalog'),[subject,setSubject]=useState(''),[grade,setGrade]=useState(String(memberships[0]?.grade||''));
 if(!catalog.data)return <LoadState load={catalog}/>;
 const selected=subject||String(catalog.data.subjects[0]?.id||'');
 return <section><h2>{{competency:'Năng lực theo minh chứng',knowledge:'Bản đồ kiến thức',habits:'Thói quen học tập'}[mode]}</h2>
  <div className="portfolio-filters"><label>Môn học<select aria-label="Môn học" value={selected} onChange={e=>setSubject(e.target.value)}>{catalog.data.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Khối học<select aria-label="Khối học" value={grade} onChange={e=>setGrade(e.target.value)}>{[...new Set(memberships.map(m=>m.grade))].map(g=><option key={g} value={g}>Khối {g}</option>)}</select></label></div>
  {!selected||!grade?<p>Chưa có môn hoặc lớp để hiển thị hồ sơ.</p>:<ProfileContent key={`${id}:${selected}:${grade}:${mode}`} id={id} subject={selected} grade={grade} mode={mode} self={self}/>}
 </section>;
}
function ProfileContent({id,subject,grade,mode,self}){
 const endpoint={competency:'competency-profile',knowledge:'knowledge-map',habits:'learning-habits'}[mode],load=usePortfolio(`${base}/students/${id}/${endpoint}?subject_id=${subject}&grade=${grade}`);
 if(!load.data)return <LoadState load={load}/>;
 const d=load.data;
 if(mode==='habits')return <><p>{d.note}</p><div className="portfolio-heatmap">{[['Ngày học trong 30 ngày',d.active_days],['Ngày học trong 7 ngày',d.active_days_7],['Lượt hoàn thành',d.practice_sessions_completed],['Lượt tự luyện hoàn thành',d.self_started_sessions],['Chuỗi ngày hiện tại',d.streak_current],['Lần luyện lại có sửa sai',d.review_wrong_count]].map(([label,value])=><article className="practice-card" key={label}><h3>{label}</h3><strong>{value}</strong></article>)}</div><p>Tỉ lệ hoàn thành: {percent(d.completion_rate)} · Tỉ lệ chủ động tự luyện: {percent(d.self_started_ratio)}</p><p>Chỉ tính hoạt động có trả lời thực chất. Đây không phải đánh giá chăm chỉ, phẩm chất hay năng lực môn học.</p></>;
 if(mode==='knowledge')return <>{!d.items.length&&<p>Chưa có chương trình được công bố cho môn/khối này.</p>}{d.items.map(y=><article className="practice-card" key={y.yccd_id}><h3>{y.outcome_code} · {y.title}</h3><p><strong>{y.code}</strong> · {y.text}</p><p>{y.note}</p>{!y.linked_topic_mastery.length?<p>Chưa có minh chứng bài học liên kết.</p>:y.linked_topic_mastery.map((m,i)=><p key={i}>{m.topic_name} · M{m.level}: {percent(m.score)} · Độ tin cậy: {m.confidence}</p>)}</article>)}</>;
 const chartReady=d.axes.length>=3&&d.axes.every(a=>a.sufficient&&a.performance_score!=null);
 return <><p>{d.semantics}</p>{!d.framework?<article className="practice-card"><h3>Chưa có khung năng lực được công bố</h3><p>Không tự tạo điểm hoặc gán năng lực từ số lượt học.</p></article>:<>
  <h3>{d.framework.title} · {d.framework.version}</h3>
  {chartReady?<div style={{width:'100%',height:320}} role="img" aria-label="Biểu đồ năng lực; số liệu chi tiết ở bảng bên dưới"><ResponsiveContainer><RadarChart data={d.axes}><PolarGrid/><PolarAngleAxis dataKey="code"/><PolarRadiusAxis domain={[0,100]}/><Radar dataKey="performance_score" stroke="#087e79" fill="#087e79" fillOpacity={0.2}/></RadarChart></ResponsiveContainer></div>:<p role="status">Chưa đủ dữ liệu để vẽ radar đầy đủ. Không thay dữ liệu thiếu bằng điểm 0.</p>}
  <div style={{overflowX:'auto'}}><table className="table"><caption>Điểm quan sát và độ tin cậy là hai chỉ số riêng</caption><thead><tr><th scope="col">Trục năng lực</th><th scope="col">Điểm quan sát</th><th scope="col">Độ tin cậy</th><th scope="col">Minh chứng</th></tr></thead><tbody>{d.axes.map(a=><tr key={a.axis_id}><th scope="row">{a.name}</th><td>{a.sufficient?percent(a.performance_score):'Chưa đủ dữ liệu'}</td><td>{a.confidence_score}%</td><td>{a.evidence_count}</td></tr>)}</tbody></table></div>
  {d.axes.map(a=><details className="practice-card" key={a.axis_id}><summary>{a.name} — xem minh chứng</summary><p>Gần nhất: {date(a.last_evidence_at)} · {a.recent_evidence_count} minh chứng trong 30 ngày · {a.mapped_yccd_count} YCCĐ.</p>{!a.evidence.length?<p>Chưa có minh chứng phù hợp.</p>:a.evidence.map(e=><article key={e.evidence_ref}><p>{types[e.evidence_type]||e.evidence_type} · {date(e.occurred_at)} · {Math.round(e.performance*100)}%</p>{e.activity&&<p>{e.activity}</p>}{e.notes&&<p>{e.notes}</p>}{e.attempt_id&&<Link to={self?`/practice/review/${e.attempt_id}`:`/practice/students/${id}/attempts/${e.attempt_id}`}>Xem lượt làm</Link>}</article>)}</details>)}
 </>}<p>{d.unmapped_items} câu lịch sử chưa có ánh xạ năng lực; không suy ngược sang khung mới.</p><Recommendations id={id} subject={subject} grade={grade} self={self}/></>;
}
function Recommendations({id,subject,grade,self}){
 const load=usePortfolio(`${base}/students/${id}/competency-recommendations?subject_id=${subject}&grade=${grade}`);
 if(!load.data)return <LoadState load={load}/>;
 return <article className="practice-card"><h3>Gợi ý củng cố</h3><p>{load.data.note}</p>{!load.data.recommendations.length?<p>Chưa có gợi ý đủ điều kiện từ kho câu hỏi hiện tại.</p>:load.data.recommendations.map(r=><p key={r.yccd_id}><Link className="btn" to={`${self?'/practice/new':'/practice/assignments'}?${self?'':`student=${id}&`}subject_id=${subject}&grade=${grade}&yccd_id=${r.yccd_id}`}>YCCĐ #{r.yccd_id} · {r.eligible_questions} câu phù hợp → {self?'Chọn bài luyện':'Giao bài'}</Link></p>)}</article>;
}
