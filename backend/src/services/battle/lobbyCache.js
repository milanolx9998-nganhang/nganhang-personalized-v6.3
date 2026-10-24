// Các lần nạp đang chạy tách khỏi LRU: eviction không được gây nạp lại đệ quy.
export function createLobbyCache(load,{now=Date.now,ttl=60000,max=2400}={}){
 const entries=new Map(),pending=new Map();
 function invalidate(key){entries.delete(key);const e=pending.get(key);if(e){e.invalidated=true;pending.delete(key);}}
 return {
  async get(key){
   for(;;){
    const hit=entries.get(key);
    if(hit&&now()-hit.at<ttl){entries.delete(key);entries.set(key,hit);return hit.value;}
    entries.delete(key);
    let e=pending.get(key);
    if(!e){
     e={invalidated:false};pending.set(key,e);
     e.promise=Promise.resolve().then(()=>load(key)).then(value=>{
      if(!e.invalidated){entries.delete(key);entries.set(key,{at:now(),value});while(entries.size>max)entries.delete(entries.keys().next().value);}
      return value;
     }).finally(()=>{if(pending.get(key)===e)pending.delete(key);});
    }
    const value=await e.promise;
    if(!e.invalidated)return value; // Chỉ đọc lại sau invalidation tường minh, không sau eviction.
   }
  },
  delete:invalidate,clear:()=>{for(const key of pending.keys())invalidate(key);entries.clear();}
 };
}
