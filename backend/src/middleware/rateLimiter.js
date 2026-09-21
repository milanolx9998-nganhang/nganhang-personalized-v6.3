import rateLimit,{ipKeyGenerator} from 'express-rate-limit';
import crypto from 'node:crypto';
import {audit} from '../utils/audit.js';
const userKey=req=>req.user?.id?'user:'+req.user.id:ipKeyGenerator(req.ip);
export function limiter(windowMs,limit,keyGenerator,skipSuccessfulRequests=false,onBlocked=(req)=>audit(req.user?.id||null,'RATE_LIMITED','security',null,{path:req.path},req.ip)){
 return rateLimit({windowMs,limit,keyGenerator,skipSuccessfulRequests,standardHeaders:true,legacyHeaders:false,
 handler:(req,res)=>{void onBlocked(req);res.status(429).json({error:'Quá nhiều yêu cầu. Vui lòng thử lại sau thời gian Retry-After.'});}});
}
export const loginIpLimiter=limiter(15*60*1000,50,req=>ipKeyGenerator(req.ip),true);
export const loginAccountLimiter=limiter(15*60*1000,5,req=>'account:'+crypto.createHash('sha256').update(String(req.body?.username||'').trim().toLowerCase()).digest('hex'),true);
export const loginLimiter=[loginIpLimiter,loginAccountLimiter];
export const apiLimiter=limiter(60*1000,300,userKey);
export const apiIpLimiter=limiter(60*1000,3000,req=>ipKeyGenerator(req.ip));
export const uploadLimiter=limiter(60*1000,10,userKey);
const reset=limiter(60*60*1000,40,userKey),attempt=limiter(60*60*1000,60,userKey),exports=limiter(10*60*1000,20,userKey),source=limiter(10*60*1000,10,userKey),staff=limiter(10*60*1000,120,userKey);
export function sensitiveLimiter(req,res,next){
 if(req.method==='POST'&&/\/imports$|\/roster(?:\/preview)?$/.test(req.path))return uploadLimiter(req,res,next);
 if(/reset-password|change-password/.test(req.path))return reset(req,res,next);
 if(req.method==='POST'&&/\/attempts$|\/start$|\/retry$/.test(req.path))return attempt(req,res,next);
 if(/download-source|\/source(?:\/|$)/.test(req.path))return source(req,res,next);
 if(/export|download/.test(req.path))return exports(req,res,next);
 if(!['GET','HEAD'].includes(req.method)&&req.path.startsWith('/staff'))return staff(req,res,next);
 next();
}
