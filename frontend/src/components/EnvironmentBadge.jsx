import {useEffect,useState} from 'react';

// Nhãn môi trường. Môi trường thử nghiệm: dải cảnh báo lớn để không ai nhập dữ liệu thật vào đó.
// Môi trường thật (PROD/LAN): chỉ một nhãn nhỏ ở góc — đủ để biết đang ở đâu, không chiếm chỗ làm việc.
export default function EnvironmentBadge(){
 const [env,setEnv]=useState(null);
 useEffect(()=>{let live=true;fetch('/api/health',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(v=>{if(live)setEnv(v);}).catch(()=>{});return()=>{live=false;};},[]);
 if(!env?.profile)return null;
 if(!env.test_environment){
  return <div className="env-badge" aria-label={'Môi trường ứng dụng: '+env.profile}><span>{env.profile.toUpperCase()}</span>{env.version&&<span className="env-version">v{env.version}</span>}</div>;
 }
 return <aside className="env-banner" aria-label="Môi trường ứng dụng" role="note"><strong>{env.profile.toUpperCase()} · TEST</strong><p>MÔI TRƯỜNG THỬ NGHIỆM — KHÔNG NHẬP DỮ LIỆU THẬT</p></aside>;
}
