import {useCallback,useEffect,useRef,useState} from 'react';
import {api,uploadFile,downloadFile} from '../../api/client.js';
import {ErrorBox} from '../practice/shared.jsx';
import '../../styles/vocab.css';
// Ngân hàng từ vựng: tách khỏi ngân hàng câu hỏi; máy sinh câu Đấu từ vựng từ các bộ ở đây.
const BASE='/api/vocab',MIN=8;
const STATUS={NEW:'Thêm mới',UPDATE:'Cập nhật',SAME:'Không đổi',DUPLICATE:'Trùng trong tệp',ERROR:'Lỗi'};
const KIND={topic:'Chủ đề',unit:'Unit',hsk:'HSK'};
const grades=s=>s.grade_min==null&&s.grade_max==null?'Mọi khối':s.grade_min===s.grade_max?'Khối '+s.grade_min:`Khối ${s.grade_min??'…'}–${s.grade_max??'…'}`;
const isZh=subject=>/trung/i.test(subject?.name||'')||subject?.code==='TiengTrung';
const num=v=>v===''||v==null?null:Number(v);

function ImportPanel({subject,onDone}){
 const [file,setFile]=useState(null),[set,setSet]=useState(''),[source,setSource]=useState(''),[preview,setPreview]=useState(null),[filter,setFilter]=useState('ALL'),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function analyse(){setBusy(true);setError('');setResult(null);try{setPreview(await uploadFile(BASE+'/import/preview',file,{subject_id:subject.id,set:set||undefined,source:source||undefined}));setFilter('ALL');}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function confirm(){setBusy(true);setError('');try{setResult(await api.post(BASE+'/import/confirm',{token:preview.token}));setPreview(null);setFile(null);onDone();}catch(e){setError(e.message);}finally{setBusy(false);}}
 const rows=preview?preview.rows.filter(r=>filter==='ALL'||r.status===filter):[];
 return <section className="vocab-import">
  <h3>Nhập từ vựng từ tệp</h3>
  <p className="vocab-muted">Nhận .csv (UTF-8), .json, .xlsx. Cột: {isZh(subject)?'hanzi, pinyin, han_viet, nghia, hsk':'word, ipa, loai_tu, nghia'}, bo_tu, vi_du. Xem trước không lưu gì; chỉ lưu khi xác nhận.{' '}
   <button type="button" className="vocab-link" onClick={()=>downloadFile(BASE+'/template?lang='+(isZh(subject)?'zh':'en'),isZh(subject)?'mau-tu-vung-tieng-trung.xlsx':'mau-tu-vung-tieng-anh.xlsx')}>Tải tệp mẫu</button></p>
  <ErrorBox error={error}/>
  <div className="vocab-import__fields">
   <label>Tệp từ vựng<input type="file" accept=".csv,.json,.xlsx" disabled={busy} onChange={e=>{setFile(e.target.files[0]);setPreview(null);setResult(null);}}/></label>
   <label>Bộ mặc định (khi tệp không có cột bộ)<input value={set} maxLength={120} disabled={busy} onChange={e=>setSet(e.target.value)} placeholder={isZh(subject)?'VD: HSK 1':'VD: Unit 1: My new school'}/></label>
   <label>Nguồn (ghi chú)<input value={source} maxLength={40} disabled={busy} onChange={e=>setSource(e.target.value)} placeholder="VD: tổ Anh, bufopia"/></label>
  </div>
  <button className="btn" disabled={!file||busy} onClick={analyse}>{busy&&!preview?'Đang phân tích…':'Phân tích và xem trước'}</button>
  {preview&&<div className="vocab-preview">
   <div className="vocab-chips" role="tablist" aria-label="Lọc theo kết quả">
    <button type="button" className={filter==='ALL'?'active':''} onClick={()=>setFilter('ALL')}>Tất cả {preview.rows.length}</button>
    {Object.entries(STATUS).map(([k,label])=><button type="button" key={k} className={(filter===k?'active ':'')+'is-'+k.toLowerCase()} onClick={()=>setFilter(k)}>{label} {preview.summary[k.toLowerCase()]}</button>)}
   </div>
   {preview.new_sets.length>0&&<p>Sẽ tạo bộ mới: <strong>{preview.new_sets.join(', ')}</strong></p>}
   <div className="table-scroll vocab-table"><table><thead><tr><th>Dòng</th><th>Bộ</th><th>Từ</th><th>Phiên âm</th><th>Nghĩa</th><th>Kết quả</th></tr></thead>
    <tbody>{rows.slice(0,500).map(r=><tr key={r.row} className={'is-'+r.status.toLowerCase()}><td>{r.row}</td><td>{r.set}</td><td lang={isZh(subject)?'zh':'en'} className="vocab-term">{r.term}</td><td>{r.reading||'—'}</td><td>{r.meaning_vi}</td><td>{STATUS[r.status]}{r.errors.length?' — '+r.errors.join('; '):''}</td></tr>)}</tbody></table></div>
   {rows.length>500&&<p className="vocab-muted">Đang hiện 500/{rows.length} dòng.</p>}
   <p className="vocab-muted">Dòng lỗi / trùng sẽ bị bỏ qua. Bản xem trước có hiệu lực 15 phút.</p>
   <button className="btn" disabled={busy||!preview.can_confirm} onClick={confirm}>{busy?'Đang lưu…':`Xác nhận nhập ${preview.summary.new+preview.summary.update} từ`}</button>
  </div>}
  {result&&<p role="status" className="vocab-done">Đã lưu {result.created} từ mới, cập nhật {result.updated}, tạo {result.new_sets} bộ.</p>}
 </section>;
}

function SetRow({set,active,onOpen,onSaved}){
 const [edit,setEdit]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(patch){setBusy(true);setError('');try{await api.patch(BASE+'/sets/'+set.id,patch);setEdit(null);onSaved();}catch(e){setError(e.message);}finally{setBusy(false);}}
 if(edit)return <li className="vocab-set is-editing">
  <ErrorBox error={error}/>
  <label>Tên bộ<input value={edit.name} maxLength={120} onChange={e=>setEdit({...edit,name:e.target.value})}/></label>
  <div className="vocab-set__grades"><label>Từ khối<input type="number" min="1" max="12" value={edit.grade_min??''} onChange={e=>setEdit({...edit,grade_min:e.target.value})}/></label><label>Đến khối<input type="number" min="1" max="12" value={edit.grade_max??''} onChange={e=>setEdit({...edit,grade_max:e.target.value})}/></label></div>
  <p className="vocab-muted">Để trống = mọi khối đều đấu được bộ này.</p>
  <div className="vocab-actions"><button className="btn" disabled={busy||!edit.name.trim()} onClick={()=>save({name:edit.name.trim(),grade_min:num(edit.grade_min),grade_max:num(edit.grade_max)})}>Lưu</button><button className="btn secondary" disabled={busy} onClick={()=>setEdit(null)}>Huỷ</button></div>
 </li>;
 return <li className={'vocab-set'+(active?' is-active':'')+(set.status==='hidden'?' is-hidden':'')}>
  <button type="button" className="vocab-set__open" onClick={onOpen} aria-pressed={active}>
   <span className="vocab-set__name">{set.name}</span>
   <span className="vocab-set__meta">{KIND[set.kind]}{set.kind==='hsk'&&set.level?' '+set.level:''} · {grades(set)} · <strong>{set.entry_count}</strong> từ{set.status==='hidden'?' · Đang ẩn':''}</span>
   {set.entry_count<MIN&&<span className="vocab-warn">Chưa đủ {MIN} từ để đấu</span>}
  </button>
  <div className="vocab-actions"><button className="btn secondary" onClick={()=>setEdit({name:set.name,grade_min:set.grade_min,grade_max:set.grade_max})}>Sửa</button><button className="btn secondary" disabled={busy} onClick={()=>save({status:set.status==='hidden'?'active':'hidden'})}>{set.status==='hidden'?'Hiện':'Ẩn'}</button></div>
 </li>;
}

function EntryRow({entry,zh,onSaved}){
 const [edit,setEdit]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(patch){setBusy(true);setError('');try{await api.patch(BASE+'/entries/'+entry.id,patch);setEdit(null);onSaved();}catch(e){setError(e.message);}finally{setBusy(false);}}
 const field=(k,label,wide)=><label className={wide?'wide':''}>{label}<input value={edit[k]??''} onChange={e=>setEdit({...edit,[k]:e.target.value})}/></label>;
 if(edit)return <tr className="is-editing"><td colSpan={zh?7:6}><ErrorBox error={error}/><div className="vocab-entry-form">{field('term',zh?'Chữ Hán':'Từ')}{field('reading',zh?'Pinyin':'IPA')}{zh&&field('han_viet','Hán Việt')}{field('pos','Loại từ')}{field('meaning_vi','Nghĩa',true)}{field('example','Ví dụ',true)}{field('example_vi','Nghĩa ví dụ',true)}</div>
  <div className="vocab-actions"><button className="btn" disabled={busy||!edit.term?.trim()||!edit.meaning_vi?.trim()} onClick={()=>save(Object.fromEntries(Object.entries(edit).map(([k,v])=>[k,['term','meaning_vi'].includes(k)?v.trim():(v?.trim()||null)])))}>Lưu</button><button className="btn secondary" disabled={busy} onClick={()=>setEdit(null)}>Huỷ</button></div></td></tr>;
 const retired=entry.status==='retired';
 return <tr className={retired?'is-retired':''}>
  <td lang={zh?'zh':'en'} className="vocab-term">{entry.term}</td><td>{entry.reading||'—'}</td>{zh&&<td>{entry.han_viet||'—'}</td>}<td>{entry.pos||'—'}</td><td>{entry.meaning_vi}</td><td className="vocab-example">{entry.example||'—'}</td>
  <td className="vocab-actions">{error&&<span className="vocab-warn">{error}</span>}<button className="btn secondary" onClick={()=>setEdit({term:entry.term,reading:entry.reading,han_viet:entry.han_viet,pos:entry.pos,meaning_vi:entry.meaning_vi,example:entry.example,example_vi:entry.example_vi})}>Sửa</button><button className="btn secondary" disabled={busy} onClick={()=>save({status:retired?'approved':'retired'})}>{retired?'Dùng lại':'Ẩn từ'}</button></td>
 </tr>;
}

export default function VocabBank(){
 const [subjects,setSubjects]=useState(null),[subject,setSubject]=useState(null),[sets,setSets]=useState([]),[setId,setSetId]=useState(null),[entries,setEntries]=useState(null),[q,setQ]=useState(''),[page,setPage]=useState(1),[error,setError]=useState(''),[adding,setAdding]=useState(''),[addBusy,setAddBusy]=useState(false);
 const loadSubjects=useCallback(async()=>{try{const list=(await api.get(BASE+'/subjects')).subjects;setSubjects(list);setSubject(s=>s?list.find(x=>x.id===s.id)||list[0]:list[0]||null);}catch(e){setError(e.message);}},[]);
 const subjectId=subject?.id;
 const wanted=useRef({subject:null,set:null,page:1,q:''});
 wanted.current={subject:subjectId,set:setId,page,q};
 const loadSets=useCallback(async()=>{if(!subjectId)return;try{const list=(await api.get(BASE+'/sets?subject_id='+subjectId)).sets;if(wanted.current.subject===subjectId)setSets(list);}catch(e){setError(e.message);}},[subjectId]);
 const loadEntries=useCallback(async()=>{if(!setId)return setEntries(null);try{const res=await api.get(`${BASE}/entries?set_id=${setId}&page=${page}${q.trim()?'&q='+encodeURIComponent(q.trim()):''}`);const w=wanted.current;if(w.set===setId&&w.page===page&&w.q===q)setEntries(res);}catch(e){setError(e.message);}},[setId,page,q]);
 useEffect(()=>{loadSubjects();},[loadSubjects]);
 useEffect(()=>{setSetId(null);loadSets();},[loadSets]); // đổi môn thì đóng bộ đang mở
 useEffect(()=>{const t=setTimeout(loadEntries,250);return ()=>clearTimeout(t);},[loadEntries]);
 const refresh=()=>{loadSubjects();loadSets();loadEntries();};
 async function addSet(){if(addBusy)return;setAddBusy(true);setError('');try{const s=await api.post(BASE+'/sets',{subject_id:subject.id,name:adding.trim(),kind:isZh(subject)?'hsk':'topic'});setAdding('');await loadSets();setSetId(s.id);}catch(e){setError(e.message);}finally{setAddBusy(false);}}
 const zh=isZh(subject),current=sets.find(s=>s.id===setId);
 return <div className="vocab-page">
  <header className="vocab-head"><div><h1>Ngân hàng từ vựng</h1><p className="vocab-muted">Kho từ riêng cho Tiếng Anh / Tiếng Trung, tách khỏi ngân hàng câu hỏi. Đấu từ vựng và Quiz lớp từ vựng tự sinh câu từ các bộ ở đây (mỗi bộ cần ít nhất {MIN} từ).</p></div></header>
  <ErrorBox error={error}/>
  {subjects&&!subjects.length&&<p className="vocab-muted">Chưa có môn Tiếng Anh / Tiếng Trung trong danh mục môn.</p>}
  {subjects?.length>0&&<nav className="vocab-subjects" aria-label="Chọn môn">{subjects.map(s=><button type="button" key={s.id} className={subject?.id===s.id?'active':''} onClick={()=>setSubject(s)}>{s.name}<small>{s.set_count} bộ · {s.entry_count} từ</small></button>)}</nav>}
  {subject&&<div className="vocab-layout">
   <aside className="practice-card vocab-sets"><h2>Bộ từ</h2>
    {!sets.length&&<p className="vocab-muted">Chưa có bộ nào — nhập tệp bên dưới để tạo.</p>}
    <ul>{sets.map(s=><SetRow key={s.id} set={s} active={s.id===setId} onOpen={()=>{setSetId(s.id);setPage(1);setQ('');}} onSaved={refresh}/>)}</ul>
    <div className="vocab-add"><input value={adding} maxLength={120} placeholder={zh?'Tên bộ mới, VD: HSK 2':'Tên bộ mới, VD: Unit 3: My friends'} onChange={e=>setAdding(e.target.value)}/><button className="btn secondary" disabled={!adding.trim()||addBusy} onClick={addSet}>{addBusy?'Đang thêm…':'Thêm bộ'}</button></div>
   </aside>
   <section className="practice-card vocab-main">
    {current?<>
     <div className="vocab-main__head"><h2>{current.name}</h2><input type="search" placeholder={zh?'Tìm chữ Hán, pinyin, nghĩa…':'Tìm từ, nghĩa…'} value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/></div>
     {entries&&<><div className="table-scroll vocab-table"><table><thead><tr><th>{zh?'Chữ Hán':'Từ'}</th><th>{zh?'Pinyin':'IPA'}</th>{zh&&<th>Hán Việt</th>}<th>Loại từ</th><th>Nghĩa</th><th>Ví dụ</th><th></th></tr></thead>
      <tbody>{entries.entries.map(e=><EntryRow key={e.id} entry={e} zh={zh} onSaved={refresh}/>)}</tbody></table></div>
      {!entries.entries.length&&<p className="vocab-muted">Không có từ phù hợp.</p>}
      {entries.total>entries.page_size&&<div className="vocab-pager"><button className="btn secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>‹ Trước</button><span>Trang {page}/{Math.ceil(entries.total/entries.page_size)} · {entries.total} từ</span><button className="btn secondary" disabled={page*entries.page_size>=entries.total} onClick={()=>setPage(p=>p+1)}>Sau ›</button></div>}</>}
    </>:<p className="vocab-muted">Chọn một bộ để xem và sửa từ.</p>}
    <ImportPanel subject={subject} onDone={refresh}/>
   </section>
  </div>}
 </div>;
}
