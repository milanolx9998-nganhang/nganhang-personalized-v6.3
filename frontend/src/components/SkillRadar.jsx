// Biểu đồ mạng nhện một chuỗi (V6.8): mỗi trục một năng lực / một môn, thang 0–100.
// Trục chưa có dữ liệu KHÔNG bị coi là 0: nan vẽ nét đứt, nhãn ghi "chưa có dữ liệu", và vùng tô chỉ vẽ khi mọi trục đều có số.
// Trục ít dữ liệu (weak) dùng chấm rỗng. Số và căn cứ (detail: mấy bài, mấy minh chứng) luôn có ở nhãn từng trục nên không phụ thuộc màu.
const W=440,H=320,CX=W/2,R=104;

export default function SkillRadar({axes,label}){
 const n=axes.length;
 const text=a=>a.value==null?'chưa có dữ liệu':`${a.value}/100${a.detail?' · '+a.detail:''}`;
 const summary=`${label}: ${axes.map(a=>`${a.label} ${text(a)}`).join('; ')}`;
 // Dưới 3 trục thì không thành đa giác: liệt kê bằng thanh ngang.
 if(n<3)return <ul className="radar-bars" aria-label={summary}>{axes.map(a=><li key={a.key}><span>{a.label}</span><span className="bar"><i style={{width:(a.value??0)+'%'}}/></span><b>{a.value==null?'—':a.value}</b></li>)}</ul>;
 const angle=i=>-Math.PI/2+i*2*Math.PI/n,sines=axes.map((_,i)=>Math.sin(angle(i)));
 // Đa giác lẻ cạnh (tam giác, ngũ giác) lệch lên trên tâm: dời tâm xuống để hình nằm giữa khung.
 const CY=H/2-R*(Math.max(...sines)+Math.min(...sines))/2;
 const point=(i,r)=>[CX+r*Math.cos(angle(i)),CY+r*Math.sin(angle(i))];
 const ring=v=>axes.map((_,i)=>point(i,R*v/100).join(',')).join(' ');
 const known=axes.map((a,i)=>a.value==null?null:point(i,R*a.value/100)),complete=known.every(Boolean);
 // Nhãn đặt ngoài đỉnh: đỉnh trên/dưới căn giữa; đỉnh hai bên căn theo cạnh, lệch hẳn lên/xuống thì đặt trên/dưới đỉnh để có chỗ cho tên dài.
 // Hai đỉnh thấp nhất ở hai bên (tam giác, ngũ giác): bên dưới không còn gì, nên nhãn căn giữa ngay dưới đỉnh và rộng tới mép khung / trục giữa.
 const lowest=Math.max(...sines),under=i=>Math.abs(Math.cos(angle(i)))>=.3&&sines[i]>.45&&sines[i]>lowest-.01;
 const side=i=>{const cos=Math.cos(angle(i)),sin=sines[i];return Math.abs(cos)<.3?(sin<0?'top':'bottom'):(cos>0?'right':'left')+(sin>.45?' low':sin<-.45?' high':'');};
 return <figure className="skill-radar" role="img" aria-label={summary}>
  <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
   {[25,50,75,100].map(v=><polygon key={v} className={'ring'+(v===100?' outer':'')} points={ring(v)}/>)}
   {axes.map((a,i)=>{const [x,y]=point(i,R);return <line key={a.key} className={'spoke'+(a.value==null?' empty':'')} x1={CX} y1={CY} x2={x} y2={y}/>;})}
   {complete&&<polygon className="area" points={known.map(p=>p.join(',')).join(' ')}/>}
   {known.map((p,i)=>p&&<g key={axes[i].key}>
    {!complete&&<line className="reach" x1={CX} y1={CY} x2={p[0]} y2={p[1]}/>}
    <circle className={'dot'+(axes[i].weak?' weak':'')} cx={p[0]} cy={p[1]} r="5"/>
    <circle className="hit" cx={p[0]} cy={p[1]} r="14"><title>{`${axes[i].label}: ${text(axes[i])}${axes[i].weak?' (còn ít dữ liệu)':''}`}</title></circle>
   </g>)}
  </svg>
  {axes.map((a,i)=>{const [x,y]=point(i,R+16),xr=x/W,room=under(i)?Math.round(200*Math.min(xr<.5?xr:1-xr,Math.abs(.5-xr)))-2:null;
   return <div key={a.key} className={'radar-label '+(room?'under'+(xr>.5?' r':''):side(i))} style={{top:y/H*100+'%',...(room?{maxWidth:room+'%'}:{}),...(room&&xr>.5?{right:(1-xr)*100+'%'}:{left:xr*100+'%'})}}><strong>{a.label}</strong>{a.value==null?'chưa có dữ liệu':<><b>{a.value}</b>/100{a.detail?' · '+a.detail:''}</>}</div>;})}
 </figure>;
}
