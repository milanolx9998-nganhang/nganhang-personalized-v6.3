import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../../api/client.js';
// Một hàng đợi riêng theo người dùng+lượt, không trộn cờ với đáp án/uncertain.
export default function useAttemptFlags(userId,attemptId,onSaved){
 const key='nganhang:flags:'+userId+':'+attemptId,ref=useRef({}),chain=useRef(Promise.resolve()),mounted=useRef(true),callback=useRef(onSaved);
 callback.current=onSaved;
 const [pending,setPending]=useState({}),[status,setStatus]=useState('');
 const flush=useCallback(()=>{
  const op=chain.current.catch(()=>{}).then(async()=>{
   for(const [item,entry] of Object.entries(ref.current)){
    try{
     await api.patch('/api/practice/attempts/'+attemptId+'/items/'+item+'/flag',{flagged:entry.flagged});
     if(ref.current[item]?.stamp===entry.stamp){delete ref.current[item];localStorage.setItem(key,JSON.stringify(ref.current));if(mounted.current){setPending({...ref.current});callback.current?.(item,entry.flagged);}}
    }catch(e){if(mounted.current)setStatus('Cờ chưa đồng bộ · sẽ thử lại khi có mạng. '+e.message);return;}
   }
   if(mounted.current)setStatus('Đã lưu cờ xem lại');
  });chain.current=op;return op;
 },[key,attemptId]);
 useEffect(()=>{
  mounted.current=true;try{ref.current=JSON.parse(localStorage.getItem(key)||'{}');}catch{ref.current={};}setPending({...ref.current});if(Object.keys(ref.current).length)flush();
  const retry=()=>{if(Object.keys(ref.current).length)flush();};window.addEventListener('online',retry);const timer=setInterval(retry,10000);
  return()=>{mounted.current=false;window.removeEventListener('online',retry);clearInterval(timer);};
 },[key,flush]);
 const toggle=(item,flagged)=>{
  const next={...ref.current,[item]:{flagged,stamp:crypto.randomUUID()}};
  try{localStorage.setItem(key,JSON.stringify(next));}catch{setStatus('Không lưu được hàng đợi trên thiết bị. Hãy thử lại; cờ chưa thay đổi.');return;}
  ref.current=next;setPending(next);setStatus('Đang lưu cờ…');flush();
 };
 return {pending,status,toggle,retry:flush};
}
