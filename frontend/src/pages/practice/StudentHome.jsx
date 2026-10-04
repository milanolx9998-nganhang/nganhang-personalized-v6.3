import {useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {api} from '../../api/client.js';
import {useAuth} from '../../hooks/useAuth.js';
import {base,ProgressChart,ErrorBox} from './shared.jsx';
import {usePortfolio,LoadState,portfolioUrl,date} from './portfolio/common.jsx';
import {FocusTopics} from './portfolio/PortfolioOverview.jsx';
import LessonMap from './LessonMap.jsx';
const URGENT_MS=48*3600e3;
const WEEKDAYS=['CN','T2','T3','T4','T5','T6','T7'];
// "Còn 6 giờ" / "Còn 25 phút" / "Còn 3 ngày" — cho bài giao có hạn.
const timeLeft=closes=>{const ms=new Date(closes).getTime()-Date.now();if(ms<=0)return 'Đã hết hạn';return 'Còn '+(ms<3600e3?Math.max(1,Math.round(ms/60e3))+' phút':ms<URGENT_MS?Math.round(ms/3600e3)+' giờ':Math.round(ms/86400e3)+' ngày');};
// Nhịp học 7 ngày gần nhất: ô đậm là ngày có luyện, ô viền vàng là hôm nay.
function WeekStrip({motivation}){
 const {streak,week}=motivation;
 return <div className="week-strip" role="img" aria-label={`Nhịp học 7 ngày gần nhất: ${week.filter(d=>d.done).length} ngày có luyện, ${streak.current} ngày liên tiếp`}>
  <ol>{week.map(d=><li key={d.date} className={(d.done?'done':'')+(d.today?' today':'')}><span>{WEEKDAYS[d.weekday]}</span><i/></li>)}</ol>
  <p>{streak.current>0?<><strong>{streak.current}</strong> ngày liên tiếp{streak.today_done?'':' · luyện hôm nay để giữ chuỗi'}</>:'Luyện hôm nay để bắt đầu chuỗi ngày học'}</p>
 </div>;
}
export default function StudentHome(){
 const {user}=useAuth(),load=usePortfolio(base+'/students/'+user.id+'/portfolio'),nav=useNavigate(),[error,setError]=useState(''),[starting,setStarting]=useState(null),[map,setMap]=useState(undefined);
 async function start(a){setStarting(a.id);setError('');try{const attempt=await api.post(`${base}/assignments/${a.id}/start`,{});nav('/practice/attempts/'+attempt.id);}catch(e){setError(e.message);setStarting(null);}}
 if(!load.data)return <section className="practice-page"><h1>Việc học của em</h1><LoadState load={load}/></section>;
 const d=load.data,hasMap=map===undefined?null:!!map?.chapters.length;
 // Thứ tự ưu tiên: bài đang dở → bài giao sắp hết hạn (< 48 giờ) → bài giao khác → bản đồ bài học (V6.8) → tự chọn bài luyện.
 // Bản đồ có mục "Em đang vướng gì" riêng; mục "Nội dung nên củng cố" cũ chỉ còn hiện khi chưa có bản đồ (chưa xếp lớp / chưa có Bài).
 const urgent=d.upcoming_assignments.find(a=>a.closes_at&&new Date(a.closes_at).getTime()-Date.now()>0&&new Date(a.closes_at).getTime()-Date.now()<URGENT_MS);
 const others=d.upcoming_assignments.filter(a=>a!==urgent),resume=d.unfinished[0];
 const todo=<aside className="todo-card" aria-label="Việc cần làm">
  {resume&&<div className="todo-item resume"><span className="eyebrow">Đang làm dở</span><strong>Tiếp tục bài đang làm</strong><small>{resume.subject_name} · {resume.topics.map(t=>t.name).join(' · ')} · {resume.answered_count}/{resume.question_count} câu</small><Link className="btn primary" to={'/practice/attempts/'+resume.id}>Tiếp tục</Link></div>}
  {urgent&&<div className="todo-item urgent"><span className="eyebrow">Sắp hết hạn · {timeLeft(urgent.closes_at)}</span><strong>{urgent.title}</strong><small>Hạn nộp: {date(urgent.closes_at)}</small><button type="button" className={'btn '+(resume?'':'primary')} disabled={starting===urgent.id} onClick={()=>start(urgent)}>{starting===urgent.id?'Đang mở…':'Làm bài'}</button></div>}
  <h2>Bài được giao</h2>
  <p className="todo-summary">{d.assignment_summary.pending?`${d.assignment_summary.pending} bài chưa hoàn thành · ${d.assignment_summary.due_soon} bài đến hạn trong 7 ngày`:'Em đã làm hết bài thầy cô giao.'}</p>
  {others.map(a=><div className="todo-item" key={a.id}><strong>{a.title}</strong><small>{a.closes_at?'Hạn: '+date(a.closes_at)+' · '+timeLeft(a.closes_at):'Không đặt hạn nộp'}</small><button type="button" className="btn" disabled={starting===a.id} onClick={()=>start(a)}>{starting===a.id?'Đang mở…':'Làm bài'}</button></div>)}
  {d.unfinished.length>1&&<details><summary>Các bài đang dở khác</summary>{d.unfinished.slice(1).map(a=><p key={a.id}><Link to={'/practice/attempts/'+a.id}>{a.subject_name} · {a.answered_count}/{a.question_count} câu →</Link></p>)}</details>}
  <Link className="todo-more" to="/practice/assignments">Xem bài được giao →</Link>
 </aside>;
 return <section className="practice-page student-home"><header className="learning-header"><div><span className="eyebrow">Chào {user.full_name}</span><h1>Việc học của em</h1><p>Mỗi lần luyện, hiểu thêm một chút.</p></div>{map?.motivation?.week&&<WeekStrip motivation={map.motivation}/>}</header>
 <ErrorBox error={error}/>
 <LessonMap onLoaded={setMap} aside={todo}/>
 {hasMap===false&&<section><h2>Nội dung nên củng cố</h2>{d.signals.focus.length?<FocusTopics states={d.signals.focus.slice(0,2)} id={user.id} self/>:<p>{d.signals.low_confidence?'Chưa đủ dữ liệu để xác định nội dung nên củng cố.':'Bắt đầu luyện để theo dõi tiến bộ của em.'}</p>}</section>}
 <div className="practice-actions home-foot"><Link className={'btn '+(d.unfinished.length||hasMap?'':'primary')} to="/practice/new">{hasMap?'Tự chọn bài luyện':'Bắt đầu tự luyện'}</Link><Link className="btn" to={portfolioUrl(user.id,true)}>Xem toàn bộ hồ sơ học tập →</Link></div>
 <details className="practice-card student-progress"><summary>Tiến bộ gần đây · {d.summary.completed_attempts} lượt hoàn thành</summary><div className="practice-stats">{[[d.summary.completed_attempts,'Lượt hoàn thành'],[d.summary.answered_questions,'Câu đã trả lời'],[d.summary.unique_questions,'Câu khác nhau'],[d.summary.active_days,'Ngày hoạt động']].map(([n,label])=><article key={label}><strong>{n}</strong>{label}</article>)}</div><ProgressChart attempts={d.recent_completed_attempts}/></details></section>;
}
