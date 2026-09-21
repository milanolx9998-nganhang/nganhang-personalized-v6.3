import {useEffect,useState} from 'react';
import {api} from '../api/client.js';
export function useCurriculum(subjectId,grade,topicId=null){
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{let active=true;setRows([]);setError('');if(!subjectId||!grade)return;setLoading(true);
 api.get('/api/practice/curriculum?'+new URLSearchParams({subject_id:subjectId,grade,...(topicId?{topic_id:topicId}:{})})).then(r=>{if(active)setRows(r);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};
 },[subjectId,grade,topicId]);return {rows,error,loading};
}
export default function CurriculumPicker({rows,selected,onChange}){
 const [search,setSearch]=useState('');
 const visible=rows.filter(y=>(y.yccd_code+' '+y.yccd_text+' '+y.outcome_title).toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
 const groups=Object.groupBy(visible,y=>y.outcome_id);
 return <div className="curriculum-picker"><label>Tìm Outcome / YCCĐ<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Mã hoặc nội dung yêu cầu cần đạt…"/></label><p>Đã chọn {selected.length} YCCĐ · Nội dung lấy từ chương trình nguồn, không suy từ số câu trong kho.</p>
 <div className="curriculum-list">{Object.entries(groups).map(([id,ys])=><details key={id} open={search?true:undefined}><summary><label onClick={e=>e.stopPropagation()}><input type="checkbox" checked={ys.every(y=>selected.includes(y.id))} onChange={e=>onChange(e.target.checked?[...new Set([...selected,...ys.map(y=>y.id)])]:selected.filter(x=>!ys.some(y=>y.id===x)))}/><strong>{ys[0].outcome_code} · {ys[0].outcome_title}</strong></label><small>{ys.filter(y=>selected.includes(y.id)).length}/{ys.length} YCCĐ</small></summary>{ys.map(y=><label className="curriculum-row" key={y.id}><input type="checkbox" checked={selected.includes(y.id)} onChange={e=>onChange(e.target.checked?[...selected,y.id]:selected.filter(x=>x!==y.id))}/><span><strong>{y.yccd_code}</strong> — {y.yccd_text}<small>{y.source_document} · {y.source_locator||'Chưa bổ sung vị trí nguồn'}</small></span></label>)}</details>)}</div>
 {!rows.length&&<p className="warn-box">Chưa có bộ Outcome/YCCĐ chính thức cho môn/khối này. Không tự tạo mã từ câu hỏi.</p>}</div>;
}
export function CurriculumField({q,onChange}){
 const {rows,error,loading}=useCurriculum(q.subject_id,q.grade,q.topic_id);
 return <label>YCCĐ chuẩn {loading?'· đang tải…':''}<select value={q.yccd_id||''} onChange={e=>{const y=rows.find(x=>x.id===Number(e.target.value));onChange({...q,yccd_id:y?.id||null,outcome_id:y?.outcome_id||null,branch_id:y?.branch_id||null,yccd_code:y?.yccd_code||'',outcome_code:y?.outcome_code||''});}}><option value="">Chưa gán — chỉ lưu bản nháp</option>{rows.map(y=><option key={y.id} value={y.id}>{y.yccd_code} · {y.yccd_text}</option>)}</select>{error&&<small role="alert">{error}</small>}{q.yccd_id&&<small>{rows.find(y=>y.id===q.yccd_id)?.yccd_text}</small>}</label>;
}
