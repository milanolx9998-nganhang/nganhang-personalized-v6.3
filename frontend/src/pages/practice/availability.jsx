// Tự kiểm số câu trong kho cho một cấu hình luyện/giao bài và gợi ý cách sửa khi thiếu — dùng chung cho Tự luyện và Giao bài.
import {useEffect,useState} from 'react';
import {api} from '../../api/client.js';
import {base} from './shared.jsx';

// Chia số câu theo mức — bản sao đúng allocate() của máy chủ (services/practice/selection.js) để gợi ý sửa chắc chắn hợp lệ.
export function allocate(count,percent){const raw=percent.map(x=>count*x/100),out=raw.map(Math.floor);const ranked=raw.map((v,i)=>({i,f:v-out[i]})).sort((a,b)=>b.f-a.f||a.i-b.i);const missing=count-out.reduce((a,b)=>a+b,0);for(let j=0;j<missing;j++)out[ranked[j].i]++;return out;}
const fits=(count,percent,avail)=>allocate(count,percent).every((n,i)=>n<=avail[i]);
// Số câu lớn nhất vẫn đủ với tỉ lệ hiện tại.
export function fewerCount(config,avail){for(let n=config.count-1;n>0;n--)if(fits(n,config.percent,avail))return n;return 0;}
// Giữ số câu, chia lại mức: mức thiếu lấy tối đa số đang có, phần hụt dồn sang mức gần nhất còn dư.
export function rebalance(config,avail){if(avail.reduce((a,b)=>a+b,0)<config.count)return null;const want=allocate(config.count,config.percent),got=want.map((n,i)=>Math.min(n,avail[i]));let left=config.count-got.reduce((a,b)=>a+b,0);const short=want.map((n,i)=>n>avail[i]?i:-1).filter(i=>i>=0);for(const s of short.length?short:[0])for(const i of [0,1,2,3].sort((a,b)=>Math.abs(a-s)-Math.abs(b-s)||a-b)){const add=Math.min(left,avail[i]-got[i]);got[i]+=add;left-=add;}if(left>0)return null;return toPercent(got,config.count,avail);}
// Tỉ lệ số nguyên (dư chia cho phần lẻ lớn nhất) để ô % hiển thị gọn; không khớp thì dùng tỉ lệ thập phân.
function toPercent(got,count,avail){const raw=got.map(n=>n*100/count),out=raw.map(Math.floor);const order=raw.map((v,i)=>({i,f:v-out[i]})).sort((a,b)=>b.f-a.f||a.i-b.i);for(let j=0;j<100-out.reduce((a,b)=>a+b,0);j++)out[order[j].i]++;return fits(count,out,avail)?out:fits(count,raw,avail)?raw:null;}

// Đủ thông tin để hỏi máy chủ: có nội dung, có dạng câu, có môn, tỉ lệ mức đủ 100%.
export const configReady=config=>!!(config&&(config.content_scope_v2?.clauses?.length||(config.selection_mode==='yccd'?config.yccd_keys?.length:config.topic_ids?.length))&&config.types?.length&&config.subject_id&&Math.abs((config.percent?.reduce((a,b)=>a+b,0)??0)-100)<0.00001);

// Tự kiểm sau khi người dùng ngừng chỉnh 0,4 giây; kết quả của cấu hình cũ bị bỏ.
export function useAvailability(config,ready){
 const [preview,setPreview]=useState(null),[checking,setChecking]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!ready){setPreview(null);setChecking(false);setError('');return;}let live=true;setChecking(true);const t=setTimeout(()=>{api.post(base+'/availability',config).then(r=>{if(live){setPreview(r);setError('');}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setChecking(false);});},400);return()=>{live=false;clearTimeout(t);};},[config,ready]);
 return {preview,checking,error,short:!!preview?.shortages.length};
}

// Trạng thái + các cách sửa. verb: "Luyện" (học sinh) / "Giao" (giáo viên).
export function AvailabilityStatus({config,ready,availability,onChange,idle,lead,verb}){
 const {preview,checking,short}=availability;
 const avail=preview?.availability.map(r=>r.available),fewer=short?fewerCount(config,avail):0,balanced=short?rebalance(config,avail):null;
 const total=avail?avail.reduce((a,b)=>a+b,0):0,few=Math.min(total,config.count);// Dùng hết số câu đang có (chia lại mức) khi được nhiều câu hơn cách "giảm số câu giữ tỉ lệ".
 const combo=short&&!balanced&&few>fewer?rebalance({...config,count:few},avail):null;
 return <div className="practice-card availability-status" role="status" aria-live="polite">{!ready?<p>{idle}</p>:checking||!preview?<p>Đang kiểm tra số câu phù hợp…</p>:!short?<p>✓ Có đủ câu phù hợp · {config.count} câu</p>:<><p><strong>Chưa đủ câu.</strong> {preview.shortages.map(r=>`M${r.level}: cần ${r.required}, hiện có ${r.available}`).join(' · ')}</p><p>{lead}</p><div className="practice-actions">{balanced&&<button type="button" className="btn" onClick={()=>onChange({...config,percent:balanced})}>Giữ {config.count} câu, tự chia lại mức</button>}{combo&&<button type="button" className="btn" onClick={()=>onChange({...config,count:few,percent:combo})}>{verb} {few} câu hiện có</button>}{fewer>0&&<button type="button" className="btn" onClick={()=>onChange({...config,count:fewer})}>Giảm còn {fewer} câu, giữ tỉ lệ mức</button>}<button type="button" className="btn" onClick={()=>document.querySelector('[aria-label="Tìm bài / chuyên đề"]')?.focus()}>Chọn thêm nội dung</button></div></>}</div>;
}
