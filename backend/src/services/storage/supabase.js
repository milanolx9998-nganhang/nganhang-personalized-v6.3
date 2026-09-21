import {validateKey} from './local.js';
const buckets={images:'question-media-private',media:'question-media-private','private-imports':'import-source-private',exports:'exports-temporary'};
export class SupabaseStorageAdapter{
 constructor({url,key,fetchImpl=fetch}){this.url=url.replace(/\/$/,'')+'/storage/v1';this.key=key;this.fetch=fetchImpl;}
 location(key){validateKey(key);return {bucket:buckets[key.split('/')[0]],object:key.split('/').map(encodeURIComponent).join('/')};}
 async request(route,options={}){
  const response=await this.fetch(this.url+route,{...options,headers:{apikey:this.key,Authorization:'Bearer '+this.key,...options.headers},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok){const detail=await response.json().catch(()=>({}));const missing=response.status===404||(response.status===400&&String(detail.statusCode)==='404');throw Object.assign(Error('Kho riêng tư không khả dụng'),{status:missing?404:503,code:missing?'ENOENT':'STORAGE_FAILURE'});}
  return response;
 }
 async privateBucket(bucket){const info=await(await this.request('/bucket/'+bucket)).json();if(info.public!==false)throw Error('Từ chối bucket public hoặc trạng thái bucket không xác định');}
 async put(key,bytes,mime='application/octet-stream'){const {bucket,object}=this.location(key);await this.privateBucket(bucket);await this.request('/object/'+bucket+'/'+object,{method:'POST',headers:{'Content-Type':mime,'x-upsert':'false'},body:bytes});return {key};}
 async get(key){const {bucket,object}=this.location(key);await this.privateBucket(bucket);const r=await this.request('/object/authenticated/'+bucket+'/'+object);const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>20*1024*1024)throw Error('Tệp kho vượt giới hạn');chunks.push(chunk);}return Buffer.concat(chunks);}
 async exists(key){const {bucket,object}=this.location(key);await this.privateBucket(bucket);try{await this.request('/object/info/'+bucket+'/'+object);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
 async delete(key){const {bucket}=this.location(key);await this.privateBucket(bucket);await this.request('/object/'+bucket,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[key]})});}
 async health(){for(const bucket of new Set(Object.values(buckets)))await this.privateBucket(bucket);return true;}
 async getAuthorizedDelivery(key,authorize){if(typeof authorize!=='function'||!await authorize())throw Object.assign(Error('Không có quyền tải tệp'),{status:403});return this.get(key);}
}
