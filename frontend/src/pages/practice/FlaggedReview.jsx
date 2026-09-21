import {useState} from 'react';
import {Link} from 'react-router-dom';
import {base,useLoad,ErrorBox,Pending} from './shared.jsx';
import {Rich} from './Rich.jsx';
export default function FlaggedReview(){
 const [offset,setOffset]=useState(0),load=useLoad(base+'/flagged-items?offset='+offset);
 return <section className="practice-page"><h1>★ Câu cần xem lại</h1><p>Các câu em tự đánh dấu, giữ đúng phiên bản đã gặp. Dấu sao không đổi điểm hay mức thành thạo.</p><ErrorBox error={load.error}/><Pending data={load.data} error={load.error}/>{load.data?.length===0&&<article className="practice-card"><h2>Chưa có câu được đánh dấu</h2><p>Khi làm bài, chạm ☆ để lưu một câu cần xem lại ở đây.</p><Link className="btn" to="/practice/new">Chọn bài luyện</Link></article>}{load.data?.map(i=><article className="practice-card" key={i.id}><small>{i.curriculum_snapshot?.topic_name||'Bài làm trước đây'} · Câu {i.sequence} · {new Date(i.started_at).toLocaleDateString('vi-VN')}</small><Rich text={i.preview||'Mở bài làm để xem câu hỏi'}/><Link className="btn" to={'/practice/attempts/'+i.attempt_id+'?item='+i.id}>Mở đúng câu đã đánh dấu →</Link></article>)}<div className="practice-actions"><button className="btn" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-30))}>Trang trước</button><button className="btn" disabled={offset+30>=(load.data?.[0]?.total||0)} onClick={()=>setOffset(offset+30)}>Trang sau</button></div></section>;
}
