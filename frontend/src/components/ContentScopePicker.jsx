import {useEffect,useRef,useState} from 'react';
import {api} from '../api/client.js';
function Tick({checked,mixed=false,children,onChange,...props}){
 const ref=useRef(null);useEffect(()=>{if(ref.current)ref.current.indeterminate=mixed;},[mixed]);
 return <label className="scope-v2-tick"><input ref={ref} type="checkbox" checked={checked} aria-checked={mixed?'mixed':checked} onChange={onChange} {...props}/><span>{children}</span></label>;
}
export function scopeFromConfig(v){
 if(v.content_scope_v2?.subject_id===Number(v.subject_id)&&v.content_scope_v2?.grade===Number(v.grade))return v.content_scope_v2;
 const clauses=v.selection_mode==='yccd'?(v.yccd_keys||[]).flatMap(k=>{try{const a=JSON.parse(k);return a[0]==='master'?[{topic_id:null,mode:'yccds',yccd_ids:[Number(a[1])]}]:[];}catch{return [];}}):(v.topic_ids||[]).map(id=>({topic_id:id,mode:'all'}));
 return {version:2,subject_id:Number(v.subject_id),grade:Number(v.grade),clauses};
}
export default function ContentScopePicker({value,onChange,student=false,types=[],showCounts=true}){
 const [catalog,setCatalog]=useState({topics:[],yccds:[],maps:[]}),[loading,setLoading]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[tab,setTab]=useState('lessons'),[counts,setCounts]=useState(null);
 const subject_id=Number(value.subject_id),grade=Number(value.grade),clauses=value.clauses||[];
 useEffect(()=>{let live=true;setCatalog({topics:[],yccds:[],maps:[]});setError('');if(!subject_id||!grade)return;setLoading(true);
  api.get('/api/practice/content-scope/catalog?'+new URLSearchParams({subject_id,grade})).then(data=>{if(live)setCatalog(data);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};
 },[subject_id,grade]);
 useEffect(()=>{let live=true;setCounts(null);if(!showCounts||!clauses.length||!subject_id)return;
  const timer=setTimeout(()=>api.post('/api/practice/content-scope/counts',{subject_id,grade,content_scope_v2:value,types}).then(r=>{if(live)setCounts(r);}).catch(e=>{if(live)setCounts({error:e.message});}),350);
  return()=>{live=false;clearTimeout(timer);};
 },[JSON.stringify(value),JSON.stringify(types),showCounts]);
 function setTopic(topic_id,next){onChange({version:2,subject_id,grade,clauses:[...clauses.filter(c=>c.topic_id!==topic_id),...(next?[{topic_id,...next}]:[])]});}
 const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
 const ysFor=tid=>tid==null?catalog.yccds:catalog.yccds.filter(y=>catalog.maps.some(m=>m.topic_id===tid&&m.yccd_id===y.id));
 function selected(tid){const ys=ysFor(tid);return [...new Set(clauses.filter(c=>c.topic_id===tid).flatMap(c=>c.mode==='all'?ys.map(y=>y.id):c.mode==='outcomes'?ys.filter(y=>c.outcome_ids.includes(y.outcome_id)).map(y=>y.id):c.yccd_ids||[]))];}
 function toggle(tid,ids,check){const current=selected(tid),next=check?[...new Set([...current,...ids])]:current.filter(id=>!ids.includes(id));setTopic(tid,next.length?{mode:'yccds',yccd_ids:next}:null);}
 function standards(tid){
  const ys=ysFor(tid),chosen=selected(tid),groups=Object.groupBy(ys,y=>y.outcome_id);
  return <div className="scope-v2-standards">{!ys.length&&<p>Chưa có mục tiêu được liên kết với bài. Vẫn có thể chọn toàn bộ bài; giáo viên cần xác nhận liên kết từ chương trình.</p>}{Object.entries(groups).map(([id,rows])=><details key={id}><summary><Tick checked={rows.every(y=>chosen.includes(y.id))} mixed={rows.some(y=>chosen.includes(y.id))&&!rows.every(y=>chosen.includes(y.id))} onClick={e=>e.stopPropagation()} onChange={e=>toggle(tid,rows.map(y=>y.id),e.target.checked)}>{rows[0].outcome_title}<small>{rows[0].outcome_code} · {rows.filter(y=>chosen.includes(y.id)).length}/{rows.length} mục tiêu</small></Tick></summary>{rows.map(y=><Tick key={y.id} checked={chosen.includes(y.id)} onChange={e=>toggle(tid,[y.id],e.target.checked)}>{y.yccd_text}<small>{y.yccd_code}</small></Tick>)}</details>)}</div>;
 }
 const visible=catalog.topics.filter(t=>fold(t.name+' '+(t.chapter||'')).includes(fold(search))),chapters=Object.groupBy(visible,t=>t.chapter||'Các bài học');
 return <section className="scope-v2" aria-label="Chọn nội dung học tập"><div className="scope-v2-tabs"><button type="button" className="btn" aria-pressed={tab==='lessons'} onClick={()=>setTab('lessons')}>Theo bài / chuyên đề</button><button type="button" className="btn" aria-pressed={tab==='standards'} onClick={()=>setTab('standards')}>{student?'Mục tiêu học tập · nâng cao':'Outcome / YCCĐ trực tiếp'}</button></div>
 <p>Tick bài để chọn toàn bộ. Mở phần tinh chỉnh nếu chỉ muốn chọn một số mục tiêu. Có thể phối hợp nhiều bài.</p>
 {!subject_id?<p>Chọn môn và khối trước.</p>:loading?<p role="status">Đang tải nội dung…</p>:error?<p role="alert">{error}</p>:<>
 {tab==='lessons'?<><label>Tìm bài / chuyên đề<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tên bài hoặc chương…"/></label>{Object.entries(chapters).map(([chapter,ts])=><div key={chapter} className="scope-v2-chapter"><h4>{chapter}</h4>{ts.map(t=>{const cs=clauses.filter(c=>c.topic_id===t.id),all=cs.some(c=>c.mode==='all');return <article className={'scope-v2-lesson '+(cs.length?'selected':'')} key={t.id}><Tick checked={all} mixed={!all&&cs.length>0} onChange={e=>setTopic(t.id,e.target.checked?{mode:'all'}:null)}><strong>{t.name}</strong><small>{all?'Đã chọn toàn bộ bài':cs.length?selected(t.id).length+' mục tiêu đã chọn':'Chưa chọn'}</small></Tick><details><summary>{student?'Tinh chỉnh mục tiêu học tập':'Tinh chỉnh Outcome / YCCĐ'}</summary>{standards(t.id)}</details></article>;})}</div>)}{!visible.length&&<p>Không có bài phù hợp.</p>}</>:standards(null)}
 <div className="scope-v2-summary" role="status"><strong>Phạm vi đã chọn</strong>{!clauses.length?<p>Chưa chọn nội dung.</p>:<ul>{clauses.map((c,i)=><li key={i}>{c.topic_id?catalog.topics.find(t=>t.id===c.topic_id)?.name||'Bài #'+c.topic_id:'Mục tiêu xuyên bài'} — {c.mode==='all'?'toàn bộ':(c.yccd_ids?.length||c.outcome_ids?.length||0)+' mục tiêu'}<button type="button" className="btn" aria-label={'Bỏ phạm vi '+(i+1)} onClick={()=>onChange({...value,clauses:clauses.filter((_,j)=>j!==i)})}>Bỏ</button></li>)}</ul>}
 {showCounts&&clauses.length>0&&<p>{counts?.error?counts.error:counts?counts.total+' câu hiện đủ điều kiện trong phạm vi được phép luyện.':'Đang kiểm tra số câu…'} Số câu theo từng mức sẽ được kiểm tra trước khi bắt đầu.</p>}</div></>}
 </section>;
}
