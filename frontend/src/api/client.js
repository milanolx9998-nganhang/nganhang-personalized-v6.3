// HttpOnly session cookie; only the non-authenticating CSRF token lives in memory.
let csrfToken=null,csrfPending=null;
try{localStorage.removeItem('nganhang_token');localStorage.removeItem('nganhang_auth');}catch{}
async function csrf(){
 if(csrfToken)return csrfToken;
 if(!csrfPending)csrfPending=fetch('/api/auth/csrf',{credentials:'same-origin',cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Không khởi tạo được bảo vệ phiên');csrfToken=(await r.json()).csrf_token;return csrfToken;}).finally(()=>{csrfPending=null;});
 return csrfPending;
}
async function request(method,url,body){
 const headers={'Content-Type':'application/json'};
 if(!['GET','HEAD'].includes(method))headers['X-CSRF-Token']=await csrf();
 const res=await fetch(url,{method,headers,credentials:'same-origin',body:body===undefined?undefined:JSON.stringify(body)});
 const data=(res.headers.get('content-type')||'').includes('application/json')?await res.json():await res.text();
 if(data?.csrf_token)csrfToken=data.csrf_token;
 if(res.status===401&&!url.startsWith('/api/auth/')){window.location.href='/login';throw Error('Phiên đăng nhập hết hạn');}
 if(!res.ok)throw Object.assign(Error(data?.error||data?.message||('Lỗi '+res.status)),{code:data?.code,details:data?.details,status:res.status});
 if(['/api/auth/logout','/api/auth/change-password'].includes(url))csrfToken=null;
 return data;
}
export const api={get:url=>request('GET',url),post:(url,body)=>request('POST',url,body),put:(url,body)=>request('PUT',url,body),patch:(url,body)=>request('PATCH',url,body),del:(url,body)=>request('DELETE',url,body)};
export async function downloadFile(url,filename){
 const res=await fetch(url,{credentials:'same-origin'});if(!res.ok)throw Error('Tải xuống thất bại');
 const link=document.createElement('a');link.href=URL.createObjectURL(await res.blob());link.download=filename||'download';document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(link.href);
}
export async function uploadFile(url,file,extraFields={}){
 const form=new FormData();form.append('file',file);for(const[k,v]of Object.entries(extraFields))if(v!==undefined&&v!==null)form.append(k,v);
 const res=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':await csrf()},body:form});
 const data=await res.json();if(!res.ok)throw Error(data?.error||('Lỗi '+res.status));return data;
}
