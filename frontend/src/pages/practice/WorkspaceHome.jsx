import {Link} from 'react-router-dom';
import {useAuth} from '../../hooks/useAuth.js';
import {base} from './shared.jsx';
import {usePortfolio,LoadState,date} from './portfolio/common.jsx';
export default function WorkspaceHome(){
 const {user}=useAuth(),write=user.capabilities?.['assignment.create'],load=usePortfolio(base+'/workspace');
 return <section className="practice-page workspace-page"><header className="learning-header"><div><span className="eyebrow">Không gian làm việc</span><h1>Chào {user.full_name}</h1><p>Việc cần chú ý trong phạm vi lớp và môn được cấp.</p></div></header>
 {!load.data?<LoadState load={load}/>:<><h2>Hôm nay cần chú ý</h2><div className="portfolio-stats decision-stats">{[[load.data.summary.inactive_7d,'Học sinh chưa luyện 7 ngày','/practice?status=inactive'],[load.data.summary.declining,'Học sinh có xu hướng giảm','/practice?status=down'],[load.data.summary.assignments_due,'Bài giao đến hạn trong 7 ngày','/practice?status=pending'],[load.data.summary.questions_pending,'Câu đang chờ duyệt','/practice/reviews?tab=pending']].map(([n,label,to])=><article key={label}><strong>{n}</strong><Link to={to}>{label} →</Link></article>)}</div>{!load.data.summary.students&&<p className="scope-empty">Chưa có học sinh trong phạm vi được cấp. Liên hệ quản trị để phân công lớp và môn.</p>}
 <div className="practice-actions">{write&&<><Link className="btn primary" to="/practice/assignments">Tạo bài giao</Link>{user.capabilities?.['student.manage_basic']&&<Link className="btn" to="/practice/students?new=1">+ Thêm học sinh</Link>}<Link className="btn" to="/practice/import">Nhập câu hỏi</Link></>}<Link className="btn" to="/practice">Theo dõi lớp</Link></div>
 <div className="workspace-grid"><section className="practice-card"><h2>Bài giao sắp đến hạn</h2>{load.data.due.length?load.data.due.map(a=><p key={a.id}><strong>{a.title}</strong><br/>Hạn: {date(a.closes_at)}</p>):<p>Không có bài đang chờ hoàn thành đến hạn trong 7 ngày.</p>}</section><section className="practice-card"><h2>Lượt học gần đây</h2>{load.data.recent.length?load.data.recent.map(a=><p key={a.id}><Link to={'/practice/students/'+a.student_id+'/portfolio'}>{a.full_name}</Link> · {a.subject_name}<br/>{date(a.completed_at)} · {a.percentage==null?'Tự đối chiếu':Math.round(a.percentage)+'%'}</p>):<p>Chưa có lượt hoàn thành trong phạm vi được xem.</p>}</section></div></>}
 </section>;
}
