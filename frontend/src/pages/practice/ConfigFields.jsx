import {useEffect,useState} from 'react';
import ContentPicker from './ContentPicker.jsx';
import {api} from '../../api/client.js';
import {types,base} from './shared.jsx';
// Môn người dùng được đọc nội dung (cùng quy tắc content.read máy chủ dùng để báo "Không có quyền với môn này"); null = mọi môn.
function useMySubjects(){const [ids,setIds]=useState(null);useEffect(()=>{let live=true;api.get(base+'/catalog/my-subjects').then(r=>{if(live)setIds(r.subject_ids);}).catch(()=>{});return()=>{live=false;};},[]);return ids;}
export function ConfigFields({value,onChange,catalog,settings,simple=false}){
 const allowed=useMySubjects();
 const update=(key,val)=>onChange({...value,[key]:val});const options=catalog?.topics.filter(t=>t.subject_id===Number(value.subject_id)&&t.grade===Number(value.grade))||[];
 return <div className="practice-grid">
  <label>Môn học<select aria-label="Môn học" value={value.subject_id||''} onChange={e=>onChange({...value,subject_id:Number(e.target.value),topic_ids:[],yccd_keys:[],content_scope_v2:null})}><option value="">Chọn môn</option>{catalog?.subjects.filter(s=>!allowed||allowed.includes(s.id)||s.id===Number(value.subject_id)).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
  <label>Khối<select aria-label="Khối" value={value.grade} onChange={e=>onChange({...value,grade:Number(e.target.value),topic_ids:[],yccd_keys:[],content_scope_v2:null})}>{[6,7,8,9,10,11,12].map(g=><option key={g}>{g}</option>)}</select></label>
  <ContentPicker key={value.subject_id+':'+value.grade} value={value} onChange={onChange} topics={options}/>
  <label>Số câu<select aria-label="Số câu" value={value.count} onChange={e=>update('count',Number(e.target.value))}>{[10,15,20,30,40].map(n=><option key={n}>{n}</option>)}</select></label>
  <label>Cách luyện<select value={value.mode} onChange={e=>update('mode',e.target.value)}><option value="practice">Luyện tập · chấm từng câu</option><option value="challenge">Thử sức · chấm khi nộp</option></select></label>
  <details className="wide" open={!simple}><summary>Tùy chỉnh nâng cao · mức độ và dạng câu</summary><p>Mặc định dùng phân bố cân bằng. Không tự tăng phạm vi khi thiếu câu.</p><label>Phân bố mức độ<select aria-label="Phân bố mức độ" defaultValue="balanced" onChange={e=>{const p=e.target.value;if(p.startsWith('M'))update('percent',[1,2,3,4].map(n=>n===Number(p.slice(1))?100:0));else if(p!=='custom')update('percent',settings?.practice_presets?.[p]||[25,25,25,25]);}}><option value="basic">Cơ bản</option><option value="balanced">Cân bằng</option><option value="advanced">Nâng cao</option>{[1,2,3,4].map(n=><option key={n} value={'M'+n}>Chỉ M{n}</option>)}<option value="custom">Tùy chỉnh</option></select></label>
  <div className="wide level-inputs">{value.percent.map((v,i)=><label key={i}>M{i+1} (%)<small style={{display:'block'}}>{catalog?.subjects.find(s=>s.id===Number(value.subject_id))?.profile?.level_labels?.[i]}</small><input type="number" min="0" max="100" value={v} onChange={e=>update('percent',value.percent.map((x,j)=>j===i?Number(e.target.value):x))}/></label>)}<span>Tổng: {value.percent.reduce((a,b)=>a+b,0)}%</span></div>
  <fieldset className="wide"><legend>Dạng câu</legend>{Object.entries(types).filter(([id])=>!catalog?.subjects.find(s=>s.id===Number(value.subject_id))?.profile?.allowed_types||catalog.subjects.find(s=>s.id===Number(value.subject_id)).profile.allowed_types.includes(id)).map(([id,label])=><label key={id} className="check-label"><input type="checkbox" checked={value.types.includes(id)} onChange={e=>update('types',e.target.checked?[...value.types,id]:value.types.filter(t=>t!==id))}/>{id==='essay'?'Thêm tự luận · tự đối chiếu':label}</label>)}</fieldset></details>
 </div>;
}
