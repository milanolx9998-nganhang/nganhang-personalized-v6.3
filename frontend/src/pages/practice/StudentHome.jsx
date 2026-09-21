import {Link} from 'react-router-dom';
import {useAuth} from '../../hooks/useAuth.js';
import {base,ProgressChart} from './shared.jsx';
import {usePortfolio,LoadState,portfolioUrl,date} from './portfolio/common.jsx';
import {FocusTopics} from './portfolio/PortfolioOverview.jsx';
export default function StudentHome(){
 const {user}=useAuth(),load=usePortfolio(base+'/students/'+user.id+'/portfolio');
 if(!load.data)return <section className="practice-page"><h1>Việc học của em</h1><LoadState load={load}/></section>;
 const d=load.data;
 return <section className="practice-page student-home"><header className="learning-header"><div><span className="eyebrow">Chào {user.full_name}</span><h1>Việc học của em</h1><p>Mỗi lần luyện, hiểu thêm một chút.</p></div></header>
 {d.unfinished.slice(0,1).map(a=><article className="practice-card resume-priority" key={a.id}><span className="eyebrow">Ưu tiên tiếp theo</span><h2>Tiếp tục bài đang làm</h2><p>{a.subject_name} · {a.topics.map(t=>t.name).join(' · ')}</p><p>{a.answered_count}/{a.question_count} câu đã trả lời</p><Link className="btn primary" to={'/practice/attempts/'+a.id}>Tiếp tục</Link></article>)}
 {d.unfinished.length>1&&<details className="practice-card"><summary>Các bài đang dở khác</summary>{d.unfinished.slice(1).map(a=><p key={a.id}><Link to={'/practice/attempts/'+a.id}>{a.subject_name} · {a.answered_count}/{a.question_count} câu →</Link></p>)}</details>}
 <article className="practice-card"><h2>Bài được giao</h2><p>{d.assignment_summary.pending} bài chưa hoàn thành · {d.assignment_summary.due_soon} bài đến hạn trong 7 ngày</p>{d.upcoming_assignments.map(a=><p key={a.id}><strong>{a.title}</strong><br/>{a.closes_at?'Hạn: '+date(a.closes_at):'Không đặt hạn nộp'}</p>)}<Link to="/practice/assignments">Xem bài được giao →</Link></article>
 <section><h2>Nội dung nên củng cố</h2>{d.signals.focus.length?<FocusTopics states={d.signals.focus.slice(0,2)} id={user.id} self/>:<p>{d.signals.low_confidence?'Chưa đủ dữ liệu để xác định nội dung nên củng cố.':'Bắt đầu luyện để theo dõi tiến bộ của em.'}</p>}</section>
 <div className="practice-actions"><Link className={'btn '+(d.unfinished.length?'':'primary')} to="/practice/new">Bắt đầu tự luyện</Link></div>
 <details className="practice-card student-progress"><summary>Tiến bộ gần đây · {d.summary.completed_attempts} lượt hoàn thành</summary><div className="practice-stats">{[[d.summary.completed_attempts,'Lượt hoàn thành'],[d.summary.answered_questions,'Câu đã trả lời'],[d.summary.unique_questions,'Câu khác nhau'],[d.summary.active_days,'Ngày hoạt động']].map(([n,label])=><article key={label}><strong>{n}</strong>{label}</article>)}</div><ProgressChart attempts={d.recent_completed_attempts}/></details>
 <Link className="btn" to={portfolioUrl(user.id,true)}>Xem toàn bộ hồ sơ học tập →</Link></section>;
}
