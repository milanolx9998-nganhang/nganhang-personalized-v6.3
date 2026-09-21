import {useEffect,useState} from 'react';
import {api} from '../../api/client.js';
export const base='/api/practice';
export const types={multiple_choice:'Trắc nghiệm',true_false:'Đúng / Sai',short_answer:'Trả lời ngắn',matching:'Ghép nối',essay:'Tự luận'};
export function useLoad(url){const[data,setData]=useState(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);useEffect(()=>{let active=true;setError('');api.get(url).then(r=>{if(active)setData(r);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[url,revision]);return{data,error,setError,setData,reload:()=>setRevision(n=>n+1)};}
export function ErrorBox({error}){return error?<div role="alert" className="practice-error">{error}</div>:null;}
export function Pending({data,error}){return error?<ErrorBox error={error}/>:!data?<p role="status">Đang tải…</p>:null;}
export const initialConfig={subject_id:0,grade:9,topic_ids:[],count:20,percent:[25,25,25,25],types:['multiple_choice','true_false','short_answer','matching'],mode:'practice'};
export const confidence={LOW:'Thấp',MEDIUM:'Trung bình',HIGH:'Cao'};
export const trends={UP:'↑ Đang tiến bộ',DOWN:'↓ Cần chú ý',STABLE:'→ Ổn định',INSUFFICIENT:'Cần thêm dữ liệu'};
export function masteryLabel(s){if(!['MEDIUM','HIGH'].includes(s.confidence))return 'Chưa đủ dữ liệu';return s.mastery_score>=85?'Thành thạo':s.mastery_score>=70?'Khá thành thạo':s.mastery_score>=50?'Đang hình thành':'Cần củng cố';}
export function ProgressChart({attempts}){const values=attempts.filter(a=>a.status==='completed'&&a.percentage!=null).slice(0,15).reverse();if(values.length<2)return <p>Cần thêm lượt luyện để xem tiến độ.</p>;const points=values.map((a,i)=>`${20+i*560/(values.length-1)},${180-Number(a.percentage)*1.6}`).join(' ');return <figure><svg role="img" aria-label="Kết quả các lượt luyện theo thời gian" viewBox="0 0 600 210"><path d="M20 20V180H580" fill="none" stroke="currentColor"/><polyline points={points} fill="none" stroke="#2563eb" strokeWidth="3"/>{values.map((a,i)=><circle key={a.id} cx={20+i*560/(values.length-1)} cy={180-Number(a.percentage)*1.6} r="4" fill="#2563eb"><title>{new Date(a.started_at).toLocaleDateString('vi-VN')}: {Number(a.percentage).toFixed(0)}%</title></circle>)}</svg><figcaption>Kết quả gần đây: {values.map(a=>Number(a.percentage).toFixed(0)+'%').join(' → ')}</figcaption></figure>;}
