import rateLimit,{ipKeyGenerator} from 'express-rate-limit';
import crypto from 'node:crypto';
import {audit} from '../utils/audit.js';
import {FallbackRedisStore,countBlocked} from './rateLimitStore.js';
const userKey=req=>req.user?.id?'user:'+req.user.id:ipKeyGenerator(req.ip);
const envLimit=(name,fallback)=>{const n=Number(process.env[name]);return Number.isInteger(n)&&n>0?n:fallback;};
const blocked={error:'Quá nhiều yêu cầu. Vui lòng thử lại sau thời gian Retry-After.'};
const auditBlocked=req=>audit(req.user?.id||null,'RATE_LIMITED','security',null,{path:req.path},req.ip);
// PERF V6.6.7: bộ đếm nằm trong Redis khi có (dùng chung giữa các tiến trình, không mất khi khởi động lại),
// tự quay về bộ nhớ khi Redis không có / lỗi. Mỗi limiter một tên để khóa không lẫn nhau.
let unnamed=0;
export function limiter(...args){
 // Chữ ký cũ limiter(windowMs,limit,…) vẫn dùng được; limiter không tên thì khóa Redis chỉ riêng tiến trình này.
 const [name,windowMs,limit,keyGenerator,skipSuccessfulRequests=false,onBlocked=auditBlocked]=typeof args[0]==='string'?args:['local-'+process.pid+'-'+(++unnamed),...args];
 return rateLimit({windowMs,limit,keyGenerator,skipSuccessfulRequests,standardHeaders:true,legacyHeaders:false,store:new FallbackRedisStore(name),
 handler:(req,res)=>{countBlocked(name);void onBlocked(req);res.status(429).json(blocked);}});
}
// Chỉ đếm lượt THẤT BẠI, và chỉ khi đã có kết quả. Cách "đếm trước, trừ lại nếu thành công" chặn nhầm cả lớp
// đăng nhập đúng cùng lúc sau một IP chung (NAT trường): đo local 120 lượt đồng thời → 70 lượt bị 429.
export function failureLimiter(name,windowMs,limit,keyGenerator,onBlocked=auditBlocked){
 const store=new FallbackRedisStore(name);store.init({windowMs});
 return async(req,res,next)=>{
  let key;
  try{
   key=keyGenerator(req);
   const current=await store.get(key);
   if(current&&current.totalHits>=limit){
    countBlocked(name);void onBlocked(req);
    res.setHeader('Retry-After',String(Math.max(1,Math.ceil((new Date(current.resetTime)-Date.now())/1000))));
    return res.status(429).json(blocked);
   }
  }catch(e){return next(e);}
  res.on('finish',()=>{if(res.statusCode>=400)store.increment(key).catch(()=>{});});
  next();
 };
}
// Trần theo IP chỉnh được qua môi trường cho trường có nhiều học sinh sau một IP (xem docs/PERF_V6_6_7_REDIS_SUPAVISOR.md).
export const loginIpLimiter=failureLimiter('login-ip',15*60*1000,envLimit('RATE_LIMIT_LOGIN_IP',50),req=>ipKeyGenerator(req.ip));
export const loginAccountLimiter=limiter('login-account',15*60*1000,5,req=>'account:'+crypto.createHash('sha256').update(String(req.body?.username||'').trim().toLowerCase()).digest('hex'),true);
export const loginLimiter=[loginIpLimiter,loginAccountLimiter];
export const apiLimiter=limiter('api-user',60*1000,envLimit('RATE_LIMIT_API_USER',300),userKey);
export const apiIpLimiter=limiter('api-ip',60*1000,envLimit('RATE_LIMIT_API_IP',3000),req=>ipKeyGenerator(req.ip));
export const uploadLimiter=limiter('upload',60*1000,10,userKey);
const reset=limiter('password',60*60*1000,40,userKey),attempt=limiter('attempt-start',60*60*1000,60,userKey),exports=limiter('export',10*60*1000,20,userKey),source=limiter('source',10*60*1000,10,userKey),staff=limiter('staff-write',10*60*1000,120,userKey);
export function sensitiveLimiter(req,res,next){
 if(req.method==='POST'&&/\/imports$|\/roster(?:\/preview)?$/.test(req.path))return uploadLimiter(req,res,next);
 if(/reset-password|change-password/.test(req.path))return reset(req,res,next);
 if(req.method==='POST'&&/\/attempts$|\/start$|\/retry$/.test(req.path))return attempt(req,res,next);
 if(/download-source|\/source(?:\/|$)/.test(req.path))return source(req,res,next);
 if(/export|download/.test(req.path))return exports(req,res,next);
 if(!['GET','HEAD'].includes(req.method)&&req.path.startsWith('/staff'))return staff(req,res,next);
 next();
}
