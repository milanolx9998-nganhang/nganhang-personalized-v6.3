import {useLoad,base,ErrorBox} from './shared.jsx';
export default function QuestionQuality({query=''}){
 const load=useLoad(base+'/question-quality?'+query);
 return <details className="practice-card"><summary>Chất lượng và mức sử dụng câu hỏi · dữ liệu thực</summary><ErrorBox error={load.error}/>{load.data?.uncollected.map(x=><p key={x}>{x}</p>)}<div className="table-scroll"><table><thead><tr><th>Câu</th><th>Ánh xạ</th><th>Lượt làm</th><th>HS</th><th>Đúng / một phần</th><th>Bỏ / phân vân</th><th>GV sử dụng</th></tr></thead><tbody>{load.data?.questions.map(q=><tr key={q.id}><td title={q.stem_text}>{q.question_code}</td><td>{q.yccd_id?'Đã gán YCCĐ':'Chưa chuẩn hóa'}</td><td>{q.answered_items}</td><td>{q.unique_students}</td><td>{q.correct} / {q.partial}</td><td>{q.skipped} / {q.uncertain}</td><td>{q.teacher_reuse}</td></tr>)}</tbody></table></div></details>;
}
