// Chương trình môn học bằng file mẫu (V6.6.7.3): tải file mẫu (kèm dữ liệu hiện có) → sửa → tải lên, kiểm tra từng dòng,
// xem thay đổi → tạo bản nháp → sửa trên web (Chủ đề/Outcome, YCCĐ, Bài học) → công bố.
import {useEffect,useState} from 'react';
import {api,uploadFile,downloadFile} from '../../api/client.js';

const base='/api/curriculum';
const COUNT_LABELS={outcomes_added:'Chủ đề thêm',outcomes_renamed:'Chủ đề đổi tên',outcomes_removed:'Chủ đề bỏ',yccds_added:'YCCĐ thêm',yccds_changed:'YCCĐ sửa nội dung',yccds_removed:'YCCĐ bỏ',lessons_added:'Bài thêm',lessons_changed:'Bài đổi tên / đổi YCCĐ',lessons_kept_not_in_file:'Bài không có trong file (giữ nguyên)'};
const date=v=>v?new Date(v).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';

function Diff({diff}){
 if(!diff)return null;
 const counts=Object.entries(diff.counts).filter(([,n])=>n>0);
 if(!counts.length)return <p>Không có thay đổi so với bản đang dùng.</p>;
 return <>
  <ul className="template-counts">{counts.map(([k,n])=><li key={k}>{COUNT_LABELS[k]||k}: <strong>{n}</strong></li>)}</ul>
  <details><summary>Xem chi tiết thay đổi</summary>
   {diff.outcomes.added.map(o=><p key={'oa'+o.label}>+ Chủ đề <b>{o.label}</b> · {o.title}</p>)}
   {diff.outcomes.renamed.map(o=><p key={'or'+o.label}>~ Chủ đề <b>{o.label}</b>: {o.before} → {o.after}</p>)}
   {diff.outcomes.removed.map(o=><p key={'od'+o.label}>− Chủ đề <b>{o.label}</b> · {o.title}</p>)}
   {diff.yccds.added.map(y=><p key={'ya'+y.label}>+ YCCĐ <b>{y.label}</b> · {y.text}</p>)}
   {diff.yccds.changed.map(y=><p key={'yc'+y.label}>~ YCCĐ <b>{y.label}</b>: {y.before} → <strong>{y.after}</strong></p>)}
   {diff.yccds.removed.map(y=><p key={'yd'+y.label}>− YCCĐ <b>{y.label}</b> · {y.text}</p>)}
   {diff.lessons.added.map(l=><p key={'la'+l.number}>+ Bài {l.number}: {l.name} · {l.codes.join('; ')||'chưa có YCCĐ'}</p>)}
   {diff.lessons.changed.map(l=><p key={'lc'+l.number}>~ Bài {l.number}: {l.name}{l.fields.length?' · đổi '+l.fields.join(', '):''}{l.added_codes.length?' · thêm '+l.added_codes.join('; '):''}{l.removed_codes.length?' · bỏ '+l.removed_codes.join('; '):''}</p>)}
   {diff.lessons.removed.map(l=><p key={'lr'+l.number}>· Bài {l.number}: {l.name} — không có trong file, giữ nguyên</p>)}
  </details>
 </>;
}

function Problems({title,items}){
 if(!items?.length)return null;
 return <div className={title==='Lỗi'?'practice-error':'warn-box'} role={title==='Lỗi'?'alert':'status'}><strong>{title} ({items.length})</strong><ul>{items.slice(0,100).map((e,i)=><li key={i}>{[e.sheet,e.row&&'dòng '+e.row,e.at&&!e.row?e.at:null].filter(Boolean).join(' · ')}{(e.sheet||e.row)&&': '}{e.message}</li>)}</ul></div>;
}

export default function CurriculumTemplate({catalog}){
 const [subject,setSubject]=useState(''),[grade,setGrade]=useState(''),[ws,setWs]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [file,setFile]=useState(null),[preview,setPreview]=useState(null),[reason,setReason]=useState(''),[editReason,setEditReason]=useState(''),[edits,setEdits]=useState({}),[lessons,setLessons]=useState([]),[lessonErrors,setLessonErrors]=useState(null),[publishReason,setPublishReason]=useState(''),[confirmed,setConfirmed]=useState(false),[published,setPublished]=useState(null);
 const grades=catalog.find(s=>s.id===Number(subject))?.grades||[];
 const query='subject_id='+subject+'&grade='+grade;
 async function load(){if(!subject||!grade){setWs(null);return;}setError('');try{const d=await api.get(base+'/template/workspace?'+query);setWs(d);setLessons((d.draft?.lessons||[]).map(l=>({...l,codes:(l.codes||[]).join('; ')})));setEdits({});setLessonErrors(null);}catch(e){setError(e.message);}}
 useEffect(()=>{setPreview(null);setPublished(null);setFile(null);load();},[subject,grade]);
 async function run(fn,done){setBusy(true);setError('');setMessage('');try{const r=await fn();if(done)setMessage(typeof done==='function'?done(r):done);await load();return r;}catch(e){setError(e.message);if(e.details?.errors)setLessonErrors(e.details.errors);}finally{setBusy(false);}}
 async function check(){setBusy(true);setError('');setMessage('');setPreview(null);try{setPreview(await uploadFile(base+'/template/preview',file,{subject_id:subject,grade}));}catch(e){setError(e.message);}finally{setBusy(false);}}
 const draft=ws?.draft;
 const saveItem=(type,item,outcome)=>run(()=>api.patch(`${base}/${type}s/${item.id}`,{version_id:draft.id,revision:draft.revision,code:item.code,text:edits[type+item.id],domain_code:type==='outcome'?item.domain_code:'',outcome_id:type==='yccd'?outcome.id:null,source_page:type==='yccd'?item.page||'':'',order_index:item.order_index||0,reason:editReason}),'Đã lưu vào bản nháp.');
 const setLesson=(i,patch)=>setLessons(ls=>ls.map((l,j)=>j===i?{...l,...patch}:l));
 return <section className="curriculum-template">
  <h2>Chương trình môn học</h2>
  <p>Mỗi môn/khối dùng MỘT file mẫu gồm Chủ đề (Outcome), YCCĐ và Bài học. Tải file về (đã có sẵn dữ liệu hiện tại), sửa rồi tải lên; hoặc mở bản nháp để sửa ngay trên web. Mọi thay đổi chỉ có hiệu lực sau khi <strong>Công bố</strong>.</p>
  <div className="practice-grid">
   <label>Môn<select value={subject} onChange={e=>{setSubject(e.target.value);setGrade('');}}><option value="">Chọn môn</option>{catalog.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <label>Khối<select value={grade} disabled={!subject} onChange={e=>setGrade(e.target.value)}><option value="">Chọn khối</option>{grades.map(g=><option key={g} value={g}>{g}</option>)}</select></label>
  </div>
  {error&&<div className="practice-error" role="alert">{error}</div>}{message&&<p className="ok-box" role="status">{message}</p>}
  {ws&&<>
   <article className="practice-card">
    <h3>Đang dùng</h3>
    {ws.published.version?<p><b>{ws.published.version.version_code}</b> · công bố {date(ws.published.version.published_at)} · {ws.published.outcomes} Chủ đề · {ws.published.yccds} YCCĐ · {ws.published.lessons} Bài</p>
     :ws.published.legacy?<p>Dữ liệu cũ chưa gắn phiên bản · {ws.published.outcomes} Chủ đề · {ws.published.yccds} YCCĐ · {ws.published.lessons} Bài. Tải file mẫu về, rà lại rồi tải lên để có phiên bản chính thức.</p>
     :<p>Chưa có chương trình cho môn/khối này. Tải file mẫu trống, điền rồi tải lên.</p>}
    {draft&&<p>Bản nháp đang mở: <b>{draft.version_code}</b> · tạo {date(draft.created_at)} · nguồn: {draft.source_name}</p>}
    <div className="practice-actions">
     <button className="btn primary" disabled={busy} onClick={()=>run(()=>downloadFile(base+'/template?'+query,`Mau_chuong_trinh_khoi${grade}.xlsx`))}>Tải file mẫu{draft?' (theo bản nháp)':''}</button>
     {!draft&&ws.can.import&&<button className="btn" disabled={busy} onClick={()=>run(()=>api.post(base+'/template/draft',{subject_id:Number(subject),grade:Number(grade)}),'Đã mở bản nháp từ bản đang dùng. Sửa ở phần bên dưới.')}>Mở bản nháp để sửa trên web</button>}
    </div>
   </article>

   {ws.can.import&&<article className="practice-card">
    <h3>Tải lên file mẫu</h3>
    <label>File mẫu (.xlsx)<input type="file" accept=".xlsx" onChange={e=>{setFile(e.target.files?.[0]||null);setPreview(null);}}/></label>
    <div className="practice-actions"><button className="btn" disabled={busy||!file} onClick={check}>{busy&&!preview?'Đang kiểm tra…':'Kiểm tra file'}</button></div>
    {preview&&!preview.ok&&<Problems title="Lỗi" items={preview.errors}/>}
    {preview&&<Problems title="Lưu ý" items={preview.warnings}/>}
    {preview?.ok&&<>
     <p className="ok-box">File hợp lệ: {preview.counts.outcomes} Chủ đề · {preview.counts.yccds} YCCĐ · {preview.counts.lessons} Bài · {preview.counts.links} liên kết Bài–YCCĐ.</p>
     <h4>Thay đổi so với bản đang dùng</h4><Diff diff={preview.diff}/>
     {preview.replaces_draft&&<p className="warn-box">Bản nháp {preview.replaces_draft} đang mở sẽ được lưu trữ và thay bằng nội dung file này.</p>}
     <label>Lý do / căn cứ<textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ví dụ: Cập nhật chương trình năm học 2026-2027 theo kế hoạch dạy học của tổ"/></label>
     <button className="btn primary" disabled={busy||reason.trim().length<3} onClick={()=>run(()=>uploadFile(base+'/template/import',file,{subject_id:subject,grade,reason}),r=>`Đã tạo bản nháp ${r.version.version_code}: ${r.counts.outcomes} Chủ đề, ${r.counts.yccds} YCCĐ, ${r.counts.lessons} Bài. Rà lại rồi Công bố.`).then(r=>{if(r){setPreview(null);setFile(null);}})}>Tạo bản nháp từ file</button>
    </>}
   </article>}

   {draft&&<article className="practice-card">
    <h3>Bản nháp {draft.version_code}</h3>
    <h4>Thay đổi so với bản đang dùng</h4><Diff diff={draft.diff}/>
    {ws.can.import&&<>
     <label>Lý do sửa (dùng cho các lần lưu bên dưới)<input value={editReason} onChange={e=>setEditReason(e.target.value)} placeholder="Ví dụ: sửa lỗi chính tả YCCĐ"/></label>
     <details><summary>Sửa Chủ đề (Outcome) và YCCĐ — {draft.outcomes.length} Chủ đề</summary>
      <p className="staff-muted">Chỉ sửa nội dung chữ ở đây. Thêm / bớt / đánh số lại Chủ đề hoặc YCCĐ: sửa trong file mẫu rồi tải lên.</p>
      {draft.outcomes.map(o=><div key={o.id} className="template-outcome">
       <label><b>{o.label}</b> · Tên Chủ đề<input value={edits['outcome'+o.id]??o.title} onChange={e=>setEdits({...edits,['outcome'+o.id]:e.target.value})}/></label>
       {edits['outcome'+o.id]!==undefined&&edits['outcome'+o.id]!==o.title&&<button className="btn" disabled={busy||editReason.trim().length<3} onClick={()=>saveItem('outcome',o)}>Lưu Chủ đề {o.label}</button>}
       {o.yccds.map(y=><div key={y.id}>
        <label><b>{y.label}</b><textarea rows={2} value={edits['yccd'+y.id]??y.text} onChange={e=>setEdits({...edits,['yccd'+y.id]:e.target.value})}/></label>
        {edits['yccd'+y.id]!==undefined&&edits['yccd'+y.id]!==y.text&&<button className="btn" disabled={busy||editReason.trim().length<3} onClick={()=>saveItem('yccd',y,o)}>Lưu YCCĐ {y.label}</button>}
       </div>)}
      </div>)}
     </details>
     <details><summary>Sửa Bài học — {lessons.length} Bài</summary>
      <p className="staff-muted">Mã YCCĐ viết dạng {ws.subject.branches.length?'L.2.1':'2.1'}, cách nhau bằng dấu ;. Bài có trong danh sách sẽ được tạo / đổi tên và liên kết lại khi công bố; Bài không có trong danh sách được giữ nguyên.</p>
      <div className="table-scroll"><table className="template-lessons"><thead><tr><th>Số bài</th><th>Tên bài</th><th>Chương</th>{ws.subject.branches.length>0&&<th>Phân môn</th>}<th>Mã YCCĐ</th><th></th></tr></thead><tbody>
       {lessons.map((l,i)=><tr key={i}>
        <td><input aria-label={'Số bài dòng '+(i+1)} type="number" min="1" value={l.number} onChange={e=>setLesson(i,{number:e.target.value})}/></td>
        <td><input aria-label={'Tên bài dòng '+(i+1)} value={l.name} onChange={e=>setLesson(i,{name:e.target.value})}/></td>
        <td><input aria-label={'Chương dòng '+(i+1)} value={l.chapter||''} onChange={e=>setLesson(i,{chapter:e.target.value})}/></td>
        {ws.subject.branches.length>0&&<td><select aria-label={'Phân môn dòng '+(i+1)} value={l.branch||''} onChange={e=>setLesson(i,{branch:e.target.value})}><option value="">Liên môn / tự nhận</option>{ws.subject.branches.map(b=><option key={b} value={b}>{b}</option>)}</select></td>}
        <td><input aria-label={'Mã YCCĐ dòng '+(i+1)} value={l.codes} onChange={e=>setLesson(i,{codes:e.target.value})}/></td>
        <td><button className="btn" aria-label={'Bỏ dòng '+(i+1)} onClick={()=>setLessons(ls=>ls.filter((_,j)=>j!==i))}>Bỏ</button></td>
       </tr>)}
      </tbody></table></div>
      <div className="practice-actions">
       <button className="btn" onClick={()=>setLessons(ls=>[...ls,{number:(Math.max(0,...ls.map(l=>Number(l.number)||0))+1),name:'',chapter:ls.at(-1)?.chapter||'',branch:'',codes:''}])}>+ Thêm Bài</button>
       <button className="btn primary" disabled={busy||editReason.trim().length<3} onClick={()=>{setLessonErrors(null);run(()=>api.put(`${base}/versions/${draft.id}/lesson-plan`,{revision:draft.revision,reason:editReason,lessons:lessons.map(l=>({number:String(l.number),name:l.name,chapter:l.chapter||'',branch:l.branch||'',codes:l.codes||''}))}),'Đã lưu danh sách Bài vào bản nháp.');}}>Lưu danh sách Bài</button>
      </div>
      <Problems title="Lỗi" items={lessonErrors}/>
     </details>
    </>}
    {ws.can.publish?<div className="warn-box">
     <h4>Công bố</h4>
     <p>Công bố xong: bản này thành chương trình đang dùng (mã câu hỏi mới đối chiếu theo bản này), Bài và liên kết Bài–YCCĐ được dựng lại theo danh sách Bài. Bản cũ vẫn giữ trong lịch sử; câu hỏi và bài làm cũ không bị sửa.</p>
     <label>Lý do công bố<input value={publishReason} onChange={e=>setPublishReason(e.target.value)}/></label>
     <label className="check-label"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Tôi đã rà nội dung bản nháp</label>
     <button className="btn primary" disabled={busy||!confirmed||publishReason.trim().length<3} onClick={()=>run(()=>api.post(`${base}/versions/${draft.id}/publish`,{revision:draft.revision,confirmed:true,reason:publishReason}),r=>{setPublished(r.lessons);setConfirmed(false);return 'Đã công bố.'+(r.lessons?` Bài: tạo ${r.lessons.topics_created}, cập nhật ${r.lessons.topics_updated}; liên kết mới ${r.lessons.links_created}.`:'');})}>Công bố bản nháp</button>
    </div>:<p className="staff-muted">Bản nháp chờ BGH chuyên môn / quản trị công bố.</p>}
   </article>}
   {published?.skipped?.length>0&&<Problems title="Lưu ý" items={published.skipped.map(s=>({at:'Bài '+s.lesson,message:`${s.code}: ${s.reason}`}))}/>}
  </>}
 </section>;
}
