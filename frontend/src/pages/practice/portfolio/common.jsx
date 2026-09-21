import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../../../api/client.js';
export const sourceLabels={self_practice:'Tự luyện',teacher_assigned:'Bài được giao',retry:'Luyện lại'};
export const statusLabels={in_progress:'Đang làm',completed:'Đã hoàn thành',abandoned:'Đã bỏ'};
export const date=v=>v?new Date(v).toLocaleString('vi-VN'):'—';
export const duration=v=>{const m=Math.round((Number(v)||0)/60);return m>=60?Math.floor(m/60)+' giờ '+m%60+' phút':m+' phút';};
export const result=a=>a.status!=='completed'?statusLabels[a.status]:a.percentage==null?'Tự đối chiếu':Number(a.percentage).toFixed(0)+'%';
export const portfolioUrl=(id,self)=>self?'/practice/portfolio':'/practice/students/'+id+'/portfolio';
export const reviewUrl=(id,a,self)=>self?(a.status==='in_progress'?'/practice/attempts/'+a.id:'/practice/review/'+a.id):'/practice/students/'+id+'/attempts/'+a.id;
export function usePortfolio(url){const [state,setState]=useState({}),[revision,setRevision]=useState(0);useEffect(()=>{let active=true;setState({url});api.get(url).then(data=>{if(active)setState({url,data});}).catch(e=>{if(active)setState({url,error:e.message});});return()=>{active=false;};},[url,revision]);return {...(state.url===url?state:{}),reload:()=>setRevision(n=>n+1)};}
export function LoadState({load}){return load.error?<div role="alert" className="practice-error">{load.error}<button className="btn" onClick={load.reload}>Thử lại</button></div>:<div className="portfolio-loading" role="status">Đang tải hồ sơ học tập…<div/><div/><div/></div>;}
export function AttemptLink({id,a,self}){return <Link className="btn" to={reviewUrl(id,a,self)}>{self&&a.status==='in_progress'?'Tiếp tục':'Xem chi tiết'} →</Link>;}
