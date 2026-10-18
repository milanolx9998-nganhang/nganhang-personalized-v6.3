// Lỗi khởi tạo tính năng tùy chọn không được làm hỏng phần tự luyện.
export function createAvailability({initialize,cleanup=()=>{},warn=console.warn}){
 let ready=false;
 return {get ready(){return ready;},async start(){
  ready=false;
  try{await initialize();ready=true;return true;}
  catch(e){await Promise.resolve().then(cleanup).catch(()=>{});warn(JSON.stringify({event:'battle_unavailable',code:e.code||e.cause?.code||'INIT_FAILED'}));return false;}
 }};
}
