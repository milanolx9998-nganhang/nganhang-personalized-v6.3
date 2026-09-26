// Lệnh AI mẫu kèm nút "Sao chép lệnh" (V6.6.7.4). Trình duyệt không cho ghi clipboard thì chọn sẵn chữ để bấm Ctrl+C.
import {useRef,useState} from 'react';

export default function CopyPrompt({title,text,hint,rows=8}){
 const ref=useRef(null),[done,setDone]=useState('');
 async function copy(){
  try{await navigator.clipboard.writeText(text);setDone('Đã sao chép — dán vào ô chat của AI.');}
  catch{ref.current?.focus();ref.current?.select();setDone('Đã chọn sẵn lệnh — bấm Ctrl+C để sao chép.');}
  setTimeout(()=>setDone(''),4000);
 }
 return <div className="copy-prompt">
  <div className="copy-prompt-head"><strong>{title}</strong><button type="button" className="btn" onClick={copy}>Sao chép lệnh</button>{done&&<span className="copy-prompt-note" role="status">{done}</span>}</div>
  {hint&&<p className="copy-prompt-note">{hint}</p>}
  <textarea ref={ref} readOnly rows={rows} value={text} aria-label={title}/>
 </div>;
}
