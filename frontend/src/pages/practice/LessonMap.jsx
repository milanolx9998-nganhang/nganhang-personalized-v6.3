// Bản đồ bài học của học sinh (V6.8): Chương → Bài, sao theo Bài, "Em đang ở đây", tối đa 3 Bài đang vướng, tự tạo đề từ
// nhiều Bài, chuỗi ngày học và huy hiệu. Mọi nút luyện là một chạm: máy chủ tự chọn số câu và tỉ lệ mức theo số câu đang có.
import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {api} from '../../api/client.js';
import {base,ErrorBox} from './shared.jsx';

const STATUS={new:'Chưa luyện',practicing:'Đang luyện',done:'Đạt mục tiêu'};
const Stars=({n})=><span className="lesson-stars" role="img" aria-label={n+' trên 3 sao'}>{'★'.repeat(n)}<span className="off">{'★'.repeat(3-n)}</span></span>;

export default function LessonMap({onLoaded}){
 const nav=useNavigate(),[subject,setSubject]=useState(''),[data,setData]=useState(null),[error,setError]=useState(''),[starting,setStarting]=useState('');
 const [showLocked,setShowLocked]=useState(false),[picking,setPicking]=useState(false),[picked,setPicked]=useState([]),[count,setCount]=useState(0);
 useEffect(()=>{let live=true;api.get(base+'/lesson-map'+(subject?'?subject_id='+subject:'')).then(d=>{if(!live)return;setData(d);setPicked([]);onLoaded?.(d.chapters.length>0);}).catch(e=>{if(live){setError(e.message);onLoaded?.(false);}});return()=>{live=false;};},[subject]);
 async function start(key,body){setStarting(key);setError('');try{const a=await api.post(base+'/lessons/start',body);nav('/practice/attempts/'+a.id);}catch(e){setError(e.message);setStarting('');}}
 if(!data)return error?<ErrorBox error={error}/>:null;
 if(!data.grade)return <article className="practice-card"><h2>Bản đồ bài học</h2><p>Em chưa được xếp vào lớp của năm học này nên chưa có bản đồ bài học. Em vẫn có thể tự chọn bài để luyện.</p></article>;
 if(!data.chapters.length)return <article className="practice-card"><h2>Bản đồ bài học</h2><p>Khối {data.grade} chưa có danh sách bài học. Em vẫn có thể tự chọn bài để luyện.</p></article>;
 const {rules,summary,motivation:m}=data,lessons=data.chapters.flatMap(c=>c.lessons),byId=id=>lessons.find(l=>l.id===id);
 const current=byId(data.current_lesson_id),perLesson=l=>Math.min(rules.lesson_count,l.questions.total);
 const toggle=id=>setPicked(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
 const pickedTotal=picked.reduce((n,id)=>n+byId(id).questions.total,0),choices=rules.counts.filter(n=>n<=pickedTotal),size=choices.includes(count)?count:choices[0]||Math.min(pickedTotal,rules.lesson_count);
 const earned=m.badges.filter(b=>b.earned).length;
 return <section className="lesson-map" aria-labelledby="lesson-map-title">
  <header className="section-heading"><h2 id="lesson-map-title">Bản đồ bài học · {data.subject.name} {data.grade}</h2>
   {data.subjects.length>1&&<label className="inline-field">Môn<select aria-label="Môn của bản đồ" value={data.subject.id} onChange={e=>{setData(null);setSubject(e.target.value);}}>{data.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
  </header>
  <p className="lesson-map-summary"><span className="map-chip"><strong>{m.streak.current}</strong> ngày liên tiếp{m.streak.current>0&&!m.streak.today_done?' · hôm nay chưa luyện':''}</span><span className="map-chip"><Stars n={1}/> <strong>{m.stars.earned}</strong>/{m.stars.total} sao</span><span>{summary.started}/{summary.practicable} bài đã luyện · {summary.done} bài đạt mục tiêu</span></p>
  <ErrorBox error={error}/>
  {current&&<article className="practice-card resume-priority lesson-current"><span className="eyebrow">Em đang ở đây</span><h3>{current.name}</h3><p>{current.chapter} · {STATUS[current.progress.status]}{current.progress.mastery!=null?' · điểm thành thạo '+current.progress.mastery+'/100':''}</p><button type="button" className="btn primary" disabled={!!starting} onClick={()=>start('current',{topic_ids:[current.id]})}>{starting==='current'?'Đang mở…':`Luyện ngay · ${perLesson(current)} câu`}</button></article>}
  {!summary.practicable&&<p className="warn-box">Các bài của môn này chưa đủ câu hỏi để luyện (mỗi bài cần từ {rules.min_questions} câu). Thầy cô đang bổ sung.</p>}
  {data.focus.length>0&&<section className="practice-card lesson-focus"><h3>Em đang vướng gì</h3><p className="muted">Tối đa 3 bài, lấy từ những bài em đã luyện từ 2 lượt mà điểm phần nền tảng (nhận biết, thông hiểu) còn dưới {rules.focus_below}. Bài rời danh sách khi đạt từ {rules.focus_below}.</p>
   <ul className="lesson-list">{data.focus.map(f=>{const l=byId(f.lesson_id),basic=f.base_questions>=rules.min_questions;return <li key={f.lesson_id} className="lesson-row">
    <span className="lesson-name">{f.name}</span><span className="lesson-state">{f.score}/100 sau {f.attempts} lượt</span>
    <button type="button" className="btn" disabled={!!starting} onClick={()=>start('focus'+f.lesson_id,{topic_ids:[f.lesson_id],...(basic?{focus:'base'}:{})})}>{starting==='focus'+f.lesson_id?'Đang mở…':basic?'Luyện phần nền tảng':`Luyện lại · ${perLesson(l)} câu`}</button></li>;})}</ul></section>}
  <div className="practice-actions lesson-tools">
   <button type="button" className="btn" aria-pressed={picking} onClick={()=>{setPicking(!picking);setPicked([]);}}>{picking?'Thôi chọn nhiều bài':'Tự tạo đề từ nhiều bài'}</button>
   {picking&&<><button type="button" className="btn" onClick={()=>setPicked(lessons.filter(l=>l.can_practice&&l.progress.status!=='new').map(l=>l.id))}>Chọn các bài đã luyện</button>
    {choices.length>1&&<label className="inline-field">Số câu<select aria-label="Số câu của đề" value={size} onChange={e=>setCount(Number(e.target.value))}>{choices.map(n=><option key={n} value={n}>{n} câu</option>)}</select></label>}
    <button type="button" className="btn primary" disabled={!!starting||!picked.length||pickedTotal<rules.min_questions} onClick={()=>start('many',{topic_ids:picked,count:size})}>{starting==='many'?'Đang mở…':picked.length?`Làm đề ${size} câu từ ${picked.length} bài`:'Tick các bài muốn ôn'}</button></>}
   {summary.locked>0&&<button type="button" className="btn link" onClick={()=>setShowLocked(!showLocked)}>{showLocked?'Ẩn':'Hiện'} {summary.locked} bài chưa đủ câu hỏi</button>}
  </div>
  {data.chapters.map((ch,i)=>{const open=ch.lessons.filter(l=>l.can_practice),rows=showLocked?ch.lessons:open;if(!rows.length)return null;
   return <details key={ch.name} className="practice-card lesson-chapter" open={current?ch.lessons.includes(current):i===0}>
    <summary><strong>{ch.name}</strong> · {open.filter(l=>l.progress.status!=='new').length}/{open.length} bài đã luyện
     {picking&&open.length>0&&<button type="button" className="btn link" onClick={e=>{e.preventDefault();const ids=open.map(l=>l.id),all=ids.every(id=>picked.includes(id));setPicked(p=>all?p.filter(id=>!ids.includes(id)):[...new Set([...p,...ids])]);}}>chọn cả chương</button>}</summary>
    <ul className="lesson-list">{rows.map(l=><li key={l.id} className={'lesson-row '+(l.can_practice?l.progress.status:'locked')+(l===current?' current':'')}>
     {picking&&l.can_practice&&<input type="checkbox" aria-label={'Chọn '+l.name} checked={picked.includes(l.id)} onChange={()=>toggle(l.id)}/>}
     <span className="lesson-name">{l.name}{l.branch&&<small> · {l.branch}</small>}</span>
     {l.can_practice?<><span className="lesson-state"><Stars n={l.progress.stars}/> {STATUS[l.progress.status]}{l.progress.mastery!=null?' · '+l.progress.mastery+'/100':''}{l.progress.status!=='new'&&l.progress.low_data?' · ít dữ liệu':''}</span>
      {!picking&&<button type="button" className="btn" disabled={!!starting} onClick={()=>start('l'+l.id,{topic_ids:[l.id]})}>{starting==='l'+l.id?'Đang mở…':l.progress.status==='new'?'Luyện ngay':'Luyện tiếp'}</button>}</>
      :<span className="lesson-state">{l.questions.total?`Mới có ${l.questions.total} câu, cần ${rules.min_questions}`:'Chưa có câu hỏi'}</span>}
    </li>)}</ul></details>;})}
  <details className="practice-card lesson-badges"><summary><strong>Huy hiệu</strong> · {earned}/{m.badges.length} · chuỗi dài nhất {m.streak.best} ngày</summary>
   <ul className="badge-grid">{m.badges.map(b=><li key={b.id} className={b.earned?'earned':''}><strong>{b.earned?'★ ':''}{b.name}</strong><span>{b.hint}{!b.earned&&b.progress?' · '+b.progress:''}</span></li>)}</ul></details>
  <p className="muted">Sao của một bài: ★ đã luyện · ★★ điểm thành thạo từ {rules.focus_below} · ★★★ từ {rules.threshold} qua ít nhất 2 lượt. “Ít dữ liệu”: em mới làm ít câu của bài này nên điểm còn có thể đổi nhiều.</p>
 </section>;
}
