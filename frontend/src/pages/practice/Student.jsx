import {useEffect,useRef,useState} from 'react';import {useNavigate,useSearchParams} from 'react-router-dom';
import {api} from '../../api/client.js';
import {base,useLoad,Pending,ErrorBox,initialConfig} from './shared.jsx';
import {configReady,useAvailability,AvailabilityStatus} from './availability.jsx';

export function PracticeBuilder(){const nav=useNavigate(),[params]=useSearchParams();const catalog=useLoad(base+'/catalog'),settings=useLoad(base+'/settings');const [config,setConfig]=useState({...initialConfig,grade:Number(params.get('grade'))||9,subject_id:Number(params.get('subject_id')||params.get('subject'))||0,selection_mode:params.get('yccd_id')?'yccd':'topic',yccd_keys:params.get('yccd_id')?[JSON.stringify(['master',Number(params.get('yccd_id'))])]:[],topic_ids:params.get('topic')?[Number(params.get('topic'))]:[],percent:params.get('level')?[1,2,3,4].map(n=>n===Number(params.get('level'))?100:0):[25,25,25,25]});const revision=useRef(0);const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const ready=configReady(config),availability=useAvailability(config,ready),{preview,checking,short}=availability;
 const change=v=>{revision.current++;setConfig(v);};
 async function create(){setBusy(true);setError('');try{const a=await api.post(base+'/attempts',config);nav('/practice/attempts/'+a.id);}catch(e){setError(e.message);}finally{setBusy(false);}}
 useEffect(()=>{const topic=catalog.data?.topics.find(t=>t.id===Number(params.get('topic')));if(topic)setConfig(c=>({...c,grade:topic.grade,subject_id:topic.subject_id}));},[catalog.data]);
 useEffect(()=>{const profile=catalog.data?.subjects.find(s=>s.id===config.subject_id)?.profile;if(profile)setConfig(c=>({...c,types:profile.allowed_types||initialConfig.types}));},[config.subject_id,catalog.data]);
 return <section className="practice-page"><h1>Tự chọn bài luyện</h1><p>Chọn nội dung em muốn củng cố. Tự luận chỉ dùng để tự đối chiếu.</p><Pending data={catalog.data} error={catalog.error}/><ErrorBox error={error||availability.error}/><ConfigFields simple value={config} onChange={change} catalog={catalog.data} settings={settings.data}/><AvailabilityStatus config={config} ready={ready} availability={availability} onChange={change} idle="Chọn nội dung em muốn luyện để bắt đầu." lead="Em có thể:" verb="Luyện"/><div className="practice-actions"><button className="btn primary" disabled={busy||checking||!preview||short} onClick={create}>{busy?'Đang tạo bài…':'Bắt đầu luyện'}</button></div></section>;
}
import {ConfigFields} from './ConfigFields.jsx';
