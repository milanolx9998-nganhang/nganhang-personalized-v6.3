// Bản đồ bài học của học sinh (V6.8): mỗi chương là một "tuyến", mỗi Bài là một "trạm" có vòng tiến độ; "Em đang ở đây",
// tối đa 3 Bài đang vướng, tự tạo đề từ nhiều Bài, huy hiệu. Mọi nút luyện là một chạm: máy chủ tự chọn số câu và tỉ lệ mức.
// Màu tuyến theo phân môn của KHTN (L / H / S); môn khác dùng màu chính.
import {useEffect,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {api} from '../../api/client.js';
import {base,ErrorBox} from './shared.jsx';
import SkillRadar from '../../components/SkillRadar.jsx';

const STATUS={new:'Chưa luyện',practicing:'Đang luyện',done:'Đạt mục tiêu'};
const BADGE_ICONS={first:'🚀',streak3:'🔥',streak7:'💪',hundred:'💯',fix:'🛠️',star3:'⭐',chapter:'📘',challenge:'🧗'};
const Stars=({n})=><span className="lesson-stars" role="img" aria-label={n+' trên 3 sao'}>{'★'.repeat(n)}<span className="off">{'★'.repeat(3-n)}</span></span>;
const pad=n=>n==null?'•':String(n).padStart(2,'0');
// Phân môn chiếm đa số trong chương quyết định màu tuyến.
const toneOf=lessons=>{const count={};for(const l of lessons)if(l.branch)count[l.branch]=(count[l.branch]||0)+1;const top=Object.keys(count).sort((a,b)=>count[b]-count[a])[0];return ['L','H','S'].includes(top)?'tone-'+top:'';};
const Name=({lesson})=><>{lesson.number!=null&&<span className="sr-only">Bài {lesson.number}: </span>}{lesson.title}</>;

// Năng lực của môn theo khung nhà trường đã công bố (CT GDPT 2018): điểm từ câu trả lời đã gắn năng lực và minh chứng giáo viên ghi.
// Chưa công bố khung thì nói rõ, không vẽ số tự đặt.
function SubjectAbility({studentId,subject,grade}){
 const [profile,setProfile]=useState(undefined);
 useEffect(()=>{let live=true;setProfile(undefined);api.get(`${base}/students/${studentId}/competency-profile?subject_id=${subject.id}&grade=${grade}`).then(d=>{if(live)setProfile(d);}).catch(()=>{if(live)setProfile(null);});return()=>{live=false;};},[studentId,subject.id,grade]);
 const has=profile?.framework&&profile.axes.length>0,counted=has?profile.axes.reduce((n,a)=>n+a.evidence_count,0):0;
 return <article className="ability-card"><h3>Năng lực môn {subject.name}</h3>
  {profile===undefined?<p>Đang tải…</p>:!has?<p>Nhà trường chưa công bố khung năng lực môn {subject.name}, nên chưa có biểu đồ này. Khi có, biểu đồ hiện từng thành phần năng lực theo Chương trình GDPT 2018.</p>:<>
   <p>{profile.framework.title} · tính từ {counted} minh chứng (câu đã gắn năng lực, bài thầy cô chấm).</p>
   <SkillRadar label={'Năng lực môn '+subject.name} axes={profile.axes.map(a=>({key:a.axis_id,label:a.name,value:a.evidence_count&&a.performance_score!=null?Math.round(a.performance_score):null,weak:!a.sufficient,detail:a.evidence_count+' minh chứng'}))}/>
   {(profile.axes.some(a=>a.evidence_count&&!a.sufficient)||profile.unmapped_items>0)&&<p className="ability-note">{profile.axes.some(a=>a.evidence_count&&!a.sufficient)?'Chấm rỗng: mới có ít minh chứng nên số còn đổi nhiều. ':''}{profile.unmapped_items>0?`${profile.unmapped_items} câu em làm trước đây chưa gắn năng lực nên không tính.`:''}</p>}
   <Link className="ability-more" to="/practice/portfolio?tab=competency">Xem minh chứng →</Link></>}
 </article>;
}

export default function LessonMap({onLoaded,aside,studentId}){
 const nav=useNavigate(),[subject,setSubject]=useState(''),[data,setData]=useState(null),[error,setError]=useState(''),[starting,setStarting]=useState('');
 const [showLocked,setShowLocked]=useState(false),[picking,setPicking]=useState(false),[picked,setPicked]=useState([]),[count,setCount]=useState(0);
 useEffect(()=>{let live=true;api.get(base+'/lesson-map'+(subject?'?subject_id='+subject:'')).then(d=>{if(!live)return;setData(d);setPicked([]);onLoaded?.(d);}).catch(e=>{if(live){setError(e.message);onLoaded?.(null);}});return()=>{live=false;};},[subject]);
 async function start(key,body){setStarting(key);setError('');try{const a=await api.post(base+'/lessons/start',body);nav('/practice/attempts/'+a.id);}catch(e){setError(e.message);setStarting('');}}
 const blank=text=><div className="home-top single">{text&&<article className="practice-card"><h2>Bản đồ bài học</h2><p>{text}</p></article>}{aside}</div>;
 if(!data)return <>{blank('')}<ErrorBox error={error}/></>;
 if(!data.grade)return blank('Em chưa được xếp vào lớp của năm học này nên chưa có bản đồ bài học. Em vẫn có thể tự chọn bài để luyện.');
 if(!data.chapters.length)return blank(`Khối ${data.grade} chưa có danh sách bài học. Em vẫn có thể tự chọn bài để luyện.`);
 const {rules,summary,motivation:m}=data,lessons=data.chapters.flatMap(c=>c.lessons),byId=id=>lessons.find(l=>l.id===id);
 const current=byId(data.current_lesson_id),perLesson=l=>Math.min(rules.lesson_count,l.questions.total);
 const toggle=id=>setPicked(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
 const pickedTotal=picked.reduce((n,id)=>n+byId(id).questions.total,0),choices=rules.counts.filter(n=>n<=pickedTotal),size=choices.includes(count)?count:choices[0]||Math.min(pickedTotal,rules.lesson_count);
 const earned=m.badges.filter(b=>b.earned).length;
 // Tên chương trong dữ liệu thường lặp lại "KHTN 9 — …": bỏ phần lặp để tiêu đề tuyến gọn.
 const repeated=new RegExp('^'+data.subject.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*'+data.grade+'\\s*[—–-]\\s*','i'),chapterTitle=name=>name.replace(repeated,'')||name;
 return <>
  <div className="home-top">
   {current?<article className="station-hero" style={{'--fill':(current.progress.mastery??0)+'%'}}>
     <div className="hero-ring" aria-hidden="true"><span>{pad(current.number)}</span></div>
     <div className="hero-body">
      <span className="eyebrow">Em đang ở đây</span>
      <h3><Name lesson={current}/></h3>
      <p>{chapterTitle(current.chapter)}</p>
      <p className="hero-meta"><Stars n={current.progress.stars}/><span>{STATUS[current.progress.status]}{current.progress.mastery!=null?` · điểm thành thạo ${current.progress.mastery}/100`:''}</span></p>
      <button type="button" className="btn hero-cta" disabled={!!starting} onClick={()=>start('current',{topic_ids:[current.id]})}>{starting==='current'?'Đang mở…':`Luyện ngay · ${perLesson(current)} câu`}</button>
     </div>
    </article>
    :<article className="station-hero quiet"><div className="hero-body"><span className="eyebrow">Bản đồ bài học</span><h3>{summary.practicable?'Em đã đạt mục tiêu ở mọi bài luyện được':'Các bài chưa đủ câu hỏi để luyện'}</h3><p>{summary.practicable?'Chọn một bài bất kỳ bên dưới để ôn lại, hoặc tự tạo đề từ nhiều bài.':`Mỗi bài cần từ ${rules.min_questions} câu. Thầy cô đang bổ sung.`}</p></div></article>}
   {aside}
  </div>
  <ErrorBox error={error}/>
  {data.focus.length>0&&<section className="stuck" aria-labelledby="stuck-title">
   <header><h3 id="stuck-title">Em đang vướng gì</h3><p>Bài đã luyện từ 2 lượt mà phần nền tảng (nhận biết, thông hiểu) còn dưới {rules.focus_below}. Đạt {rules.focus_below} là bài rời khỏi đây.</p></header>
   <ul>{data.focus.map(f=>{const l=byId(f.lesson_id),basic=f.base_questions>=rules.min_questions;return <li key={f.lesson_id}>
    <div><strong><Name lesson={l}/></strong><span className="stuck-meter" role="img" aria-label={`${f.score} trên 100, cần ${f.target}`}><i style={{width:f.score+'%'}}/><b style={{left:f.target+'%'}}/></span><small>{f.score}/100 sau {f.attempts} lượt · cần {f.target}</small></div>
    <button type="button" className="btn" disabled={!!starting} onClick={()=>start('focus'+f.lesson_id,{topic_ids:[f.lesson_id],...(basic?{focus:'base'}:{})})}>{starting==='focus'+f.lesson_id?'Đang mở…':basic?'Luyện phần nền tảng':`Luyện lại · ${perLesson(l)} câu`}</button></li>;})}</ul>
  </section>}
  <section className="lesson-map" aria-labelledby="lesson-map-title">
   <header className="map-head">
    <div><h2 id="lesson-map-title">Bản đồ bài học · {data.subject.name} {data.grade}</h2>
     <p className="map-sub"><Stars n={1}/> <b>{m.stars.earned}</b>/{m.stars.total} sao · {summary.started}/{summary.practicable} bài đã luyện · {summary.done} bài đạt mục tiêu</p></div>
    <div className="map-tools">
     {data.subjects.length>1&&<label className="inline-field">Môn<select aria-label="Môn của bản đồ" value={data.subject.id} onChange={e=>{setData(null);setSubject(e.target.value);}}>{data.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
     <button type="button" className="btn" aria-pressed={picking} onClick={()=>{setPicking(!picking);setPicked([]);}}>{picking?'Thôi chọn nhiều bài':'Tự tạo đề từ nhiều bài'}</button>
    </div>
   </header>
   {picking&&<div className="pick-bar" role="group" aria-label="Tạo đề từ các bài đã chọn">
    <span><b>{picked.length}</b> bài đã chọn</span>
    <button type="button" className="btn" onClick={()=>setPicked(lessons.filter(l=>l.can_practice&&l.progress.status!=='new').map(l=>l.id))}>Chọn các bài đã luyện</button>
    {choices.length>1&&<label className="inline-field">Số câu<select aria-label="Số câu của đề" value={size} onChange={e=>setCount(Number(e.target.value))}>{choices.map(n=><option key={n} value={n}>{n} câu</option>)}</select></label>}
    <button type="button" className="btn primary" disabled={!!starting||!picked.length||pickedTotal<rules.min_questions} onClick={()=>start('many',{topic_ids:picked,count:size})}>{starting==='many'?'Đang mở…':picked.length?`Làm đề ${size} câu từ ${picked.length} bài`:'Tick các bài muốn ôn'}</button>
   </div>}
   {!summary.practicable&&<p className="warn-box">Các bài của môn này chưa đủ câu hỏi để luyện (mỗi bài cần từ {rules.min_questions} câu). Thầy cô đang bổ sung.</p>}
   {data.chapters.map(ch=>{const open=ch.lessons.filter(l=>l.can_practice),rows=showLocked?ch.lessons:open;if(!rows.length)return null;
    return <article key={ch.name} className={'route '+toneOf(ch.lessons)}>
     <header className="route-head"><h3>{chapterTitle(ch.name)}</h3>
      {picking&&open.length>0&&<button type="button" className="btn link" onClick={()=>{const ids=open.map(l=>l.id),all=ids.every(id=>picked.includes(id));setPicked(p=>all?p.filter(id=>!ids.includes(id)):[...new Set([...p,...ids])]);}}>chọn cả chương</button>}
      <span className="route-bar" aria-hidden="true">{open.map(l=><i key={l.id} className={l.progress.status}/>)}</span>
      <span className="route-count">{open.filter(l=>l.progress.status!=='new').length}/{open.length} bài đã luyện</span></header>
     <ol>{rows.map(l=><li key={l.id} className={'station-row '+(l.can_practice?l.progress.status:'locked')+(l===current?' current':'')}>
      {picking&&l.can_practice&&<input type="checkbox" aria-label={'Chọn '+l.name} checked={picked.includes(l.id)} onChange={()=>toggle(l.id)}/>}
      <span className="station" style={{'--fill':(l.progress.mastery??0)+'%'}} aria-hidden="true">{pad(l.number)}</span>
      <span className="lesson-name"><Name lesson={l}/>{l===current&&<em className="here-tag">Đang ở đây</em>}</span>
      {l.can_practice?<><span className="lesson-state"><Stars n={l.progress.stars}/><span>{l.progress.status==='new'?STATUS.new:<><b>{l.progress.mastery}</b>/100{l.progress.status==='done'?' · đạt mục tiêu':''}{l.progress.low_data?' · ít dữ liệu':''}</>}</span></span>
       {!picking&&<button type="button" className="btn" disabled={!!starting} onClick={()=>start('l'+l.id,{topic_ids:[l.id]})}>{starting==='l'+l.id?'Đang mở…':l.progress.status==='new'?'Luyện ngay':'Luyện tiếp'}</button>}</>
       :<span className="lesson-state">{l.questions.total?`Mới có ${l.questions.total} câu, cần ${rules.min_questions}`:'Chưa có câu hỏi'}</span>}
     </li>)}</ol></article>;})}
   <p className="map-foot">
    {summary.locked>0&&<button type="button" className="btn link" onClick={()=>setShowLocked(!showLocked)}>{showLocked?'Ẩn':'Hiện'} {summary.locked} bài chưa đủ câu hỏi</button>}
    <span>Vòng quanh số bài là điểm thành thạo. ★ đã luyện · ★★ từ {rules.focus_below} điểm · ★★★ từ {rules.threshold} điểm qua ít nhất 2 lượt. “Ít dữ liệu”: em mới làm ít câu nên điểm còn đổi nhiều.</span></p>
  </section>
  <section className="ability" aria-label="Biểu đồ năng lực">
   <article className="ability-card"><h3>Các môn khối {data.grade}</h3><p>Điểm thành thạo trung bình của những bài em đã luyện ở mỗi môn, kèm số bài đã luyện.</p>
    <SkillRadar label={'Các môn khối '+data.grade} axes={data.subjects.map(s=>({key:s.id,label:s.name,value:s.score??null,weak:s.practiced<2,detail:`${s.practiced}/${s.lessons} bài`}))}/>
    {data.subjects.some(s=>s.practiced===1)&&<p className="ability-note">Chấm rỗng: môn mới luyện 1 bài, số còn đổi nhiều.</p>}</article>
   {studentId&&<SubjectAbility studentId={studentId} subject={data.subject} grade={data.grade}/>}
  </section>
  <section className="badge-shelf" aria-labelledby="badge-title">
   <header><h3 id="badge-title">Huy hiệu</h3><span>{earned}/{m.badges.length} đã đạt · chuỗi dài nhất {m.streak.best} ngày</span></header>
   <ul>{m.badges.map(b=><li key={b.id} className={b.earned?'earned':''}><span className="medal" aria-hidden="true">{BADGE_ICONS[b.id]||'★'}</span><strong>{b.name}</strong><small>{b.hint}{!b.earned&&b.progress?' · '+b.progress:''}</small></li>)}</ul>
  </section>
 </>;
}
