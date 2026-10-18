import {EventEmitter} from 'node:events';
// Chờ sự kiện từ luồng thật, không hỏi trạng thái bằng vòng lặp HTTP.
export async function connectStream(origin,path,token){
 const controller=new AbortController(),res=await fetch(origin+'/api'+path,{headers:{Authorization:'Bearer '+token},signal:controller.signal});
 if(!res.ok)throw Error('Không mở được SSE: '+res.status+' '+await res.text());
 const events=new EventEmitter(),snapshots=[];let buffer='',last=null;
 const reader=res.body.getReader(),decoder=new TextDecoder();
 const pump=(async()=>{try{for(;;){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let index;while((index=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,index);buffer=buffer.slice(index+2);const event=frame.match(/^event: (.+)$/m)?.[1],data=frame.match(/^data: (.+)$/m)?.[1];if(!data)continue;const parsed=JSON.parse(data);if(event==='snapshot'){last=parsed;snapshots.push(parsed);events.emit('snapshot',parsed);}else events.emit(event,parsed);}}}catch(e){if(!controller.signal.aborted)events.emit('streamError',e);}})();
 return {snapshots,waitFor:(predicate,ms=40000)=>{if(last&&predicate(last))return Promise.resolve(last);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error('Không nhận được pha SSE trong hạn'));},ms);const onData=data=>{if(predicate(data)){cleanup();resolve(data);}},onError=e=>{cleanup();reject(e);};function cleanup(){clearTimeout(timer);events.off('snapshot',onData);events.off('streamError',onError);}events.on('snapshot',onData);events.on('streamError',onError);});},close:async()=>{controller.abort();await pump;}};
}
