import {Link} from 'react-router-dom';
import {usePortfolio,LoadState} from './common.jsx';
import {base} from '../shared.jsx';
export default function OutcomeMap({id,self}){
 const load=usePortfolio(base+'/learning-map/'+id);if(!load.data)return <LoadState load={load}/>;
 return <article className="practice-card"><h2>Bản đồ theo Outcome / YCCĐ</h2><p>{load.data.note}</p>{!load.data.rows.length?<p>Chưa có lượt làm gắn YCCĐ chuẩn. Lịch sử cũ và bản đồ theo bài vẫn được giữ nguyên.</p>:load.data.rows.map(y=><section key={y.yccd_id}><h3 title={y.code}>{y.yccd_label||y.outcome_code+' · '+y.code}</h3><p>{y.text}</p><p>{y.evidence_count} bằng chứng · {y.unique_questions} câu khác nhau · {y.attempts} lượt · {y.confidence==='LOW'?'Độ tin cậy thấp':'Độ tin cậy trung bình'}</p><strong>{y.interpretation}</strong><p>{y.confidence==='LOW'?'Chưa dùng điểm trung bình để kết luận mạnh/yếu.':'Điểm quan sát: '+Number(y.observed_score).toFixed(0)+'%'}</p><Link className="btn" to={self?'/practice/new?subject_id='+y.subject_id+'&grade='+y.grade+'&yccd_id='+y.yccd_id:'/practice/assignments?student='+id+'&subject_id='+y.subject_id+'&grade='+y.grade+'&yccd_id='+y.yccd_id}>{self?'Luyện thêm theo YCCĐ':'Giao bài củng cố'}</Link></section>)}</article>;
}
