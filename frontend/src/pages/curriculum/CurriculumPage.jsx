// Trang "Chương trình môn học" (V6.6.7.4): MỘT lối vào cho mọi môn — tải file mẫu, nạp, sửa, công bố; tải mẫu Word nhập câu.
// Công cụ nâng cao (sửa từng Outcome/YCCĐ theo phiên bản, import nguồn gốc, lịch sử, khung năng lực) ở Quản trị nhà trường.
import {useEffect,useState} from 'react';
import {api} from '../../api/client.js';
import CurriculumTemplate from './CurriculumTemplate.jsx';
import '../../styles/staff.css';

export default function CurriculumPage(){
 const [catalog,setCatalog]=useState([]),[error,setError]=useState('');
 useEffect(()=>{api.get('/api/curriculum/catalog').then(d=>setCatalog(d.subjects)).catch(e=>setError(e.message));},[]);
 return <section className="practice-page">
  {error&&<div className="practice-error" role="alert">{error}</div>}
  <CurriculumTemplate catalog={catalog}/>
 </section>;
}
