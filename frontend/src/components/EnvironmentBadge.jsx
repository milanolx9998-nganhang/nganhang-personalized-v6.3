import {useEffect,useState} from 'react';
export default function EnvironmentBadge(){
 const [env,setEnv]=useState(null);
 useEffect(()=>{let live=true;fetch('/api/health',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(v=>{if(live)setEnv(v);}).catch(()=>{});return()=>{live=false;};},[]);
 if(!env?.profile)return null;
 return <aside aria-label="Môi trường ứng dụng" style={{padding:'10px 16px',marginBottom:16,borderRadius:8,background:env.test_environment?'#FBEEDB':'#E3EEF3',color:'#1C1B17',border:'1px solid '+(env.test_environment?'#F0D5AC':'#C6DAE5'),fontSize:12,letterSpacing:'.04em'}}><strong>{env.profile.toUpperCase()}{env.test_environment?' · TEST':''}</strong>{env.test_environment&&<p style={{margin:'4px 0'}}>MÔI TRƯỜNG THỬ NGHIỆM — KHÔNG NHẬP DỮ LIỆU THẬT</p>}</aside>;
}
