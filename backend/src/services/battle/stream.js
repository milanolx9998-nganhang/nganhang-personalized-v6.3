import {randomUUID} from 'node:crypto';
import {fail} from '../practice/config.js';
export function createStreams({now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const clients=new Set(),opening=new Map(),pending=new Map();const runId=randomUUID();let version=0;
 const limits={sse_total:1200,sse_per_user:2,sse_bytes:65536,stream_opens:10};
 function close(c,reason){if(!clients.delete(c))return;clearTimer(c.heartbeat);clearTimer(c.expiry);if(c.opened)c.res.end(`event: closed\ndata: ${JSON.stringify({reason})}\n\n`);else c.cancelled=true;}
 function write(c,body){if(c.res.writableLength+Buffer.byteLength(body)>limits.sse_bytes){close(c,'slow');return;}c.res.write(body);}
 async function send(c){if(!c.opened)return;if(c.busy){c.dirty=true;return;}c.busy=true;try{if(c.authorized&&!await c.authorized()){close(c,'left');return;}const data=await c.snapshot();if(clients.has(c))write(c,`event: snapshot\ndata: ${JSON.stringify(data)}\n\n`);}catch{close(c,'unavailable');}finally{c.busy=false;if(c.dirty&&clients.has(c)){c.dirty=false;void send(c);}}}
 function pulse(c){c.heartbeat=setTimer(async()=>{if(!clients.has(c))return;try{if(c.authorized&&!await c.authorized()){close(c,'left');return;}write(c,': ping\n\n');if(clients.has(c))pulse(c);}catch{close(c,'unavailable');}},15000);c.heartbeat.unref?.();}
 async function open({req,res,key,user,snapshot,authorized,expiresAt,onDisconnect}){
  const at=now(),recent=(opening.get(user.id)||[]).filter(t=>t>at-60000);
  if(recent.length>=limits.stream_opens||clients.size>=limits.sse_total||[...clients].filter(c=>c.user.id===user.id).length>=limits.sse_per_user){res.setHeader('Retry-After','60');fail('Đã đạt giới hạn mở luồng',429);}
  opening.set(user.id,[...recent,at]);if(opening.size>2400)for(const [id,list] of opening)if(list.at(-1)<at-60000)opening.delete(id);
  // Giữ chỗ trước await để các lần mở đồng thời cũng chịu trần luồng.
  const c={res,key,user,snapshot,authorized};clients.add(c);let initial;
  try{if(authorized&&!await authorized())fail('Em không còn trong phòng này',403);initial=await snapshot();if(c.cancelled)fail('Em không còn trong phòng này',403);}catch(e){clients.delete(c);throw e;}
  c.opened=true;
  res.status(200).set({'Content-Type':'text/event-stream','Cache-Control':'private, no-store, no-transform','X-Accel-Buffering':'no'});res.flushHeaders();
  res.on('close',()=>{const unexpected=clients.delete(c);clearTimer(c.heartbeat);clearTimer(c.expiry);if(unexpected&&onDisconnect&&![...clients].some(x=>x.user.id===user.id&&x.key===key))void Promise.resolve().then(onDisconnect).catch(()=>{});});
  write(c,`event: snapshot\ndata: ${JSON.stringify(initial)}\n\n`);if(clients.has(c))pulse(c);
  if(expiresAt&&clients.has(c)){c.expiry=setTimer(()=>close(c,'expired'),Math.max(0,expiresAt-at));c.expiry.unref?.();}
  return c;
 }
 function publish(key,immediate=false){
  if(immediate){clearTimer(pending.get(key));pending.delete(key);version++;for(const c of clients)if(c.key===key)void send(c);return;}
  if(!pending.has(key)){const timer=setTimer(()=>{pending.delete(key);publish(key,true);},250);timer.unref?.();pending.set(key,timer);}
 }
 return {open,publish,configure:values=>Object.assign(limits,values),envelope:()=>({run_id:runId,version,server_now:now()}),closeUser:(id,reason,key)=>{for(const c of clients)if(c.user.id===id&&(!key||c.key===key))close(c,reason);},closeAll:reason=>{for(const c of clients)close(c,reason);},dispose:()=>{for(const c of clients)close(c,'shutdown');for(const t of pending.values())clearTimer(t);pending.clear();},stats:()=>({streams:clients.size})};
}
export const streams=createStreams();
