import crypto from 'node:crypto';
export const SESSION_COOKIE='nganhang_session';
const NONCE_COOKIE='nganhang_csrf_nonce';
export const SESSION_MS=8*60*60*1000;
export function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim().split(/=(.*)/s)).filter(v=>v[0]).map(([k,v])=>[k,v||'']));}
export function browserRequest(req){return !!(req.headers.origin||req.headers['sec-fetch-site']||cookies(req)[SESSION_COOKIE]||cookies(req)[NONCE_COOKIE]);}
function options(req){const loopback=['127.0.0.1','localhost','::1','[::1]'].includes(req.hostname);return {httpOnly:true,secure:process.env.NODE_ENV==='production'||req.secure||!loopback,sameSite:'lax',path:'/',maxAge:SESSION_MS};}
function signature(nonce){if(!process.env.JWT_SECRET)throw Error('JWT_SECRET required');return crypto.createHmac('sha256',process.env.JWT_SECRET).update('csrf:'+nonce).digest('hex');}
export function issueCsrf(req,res,rotate=false){
 const prior=cookies(req)[NONCE_COOKIE];
 const nonce=!rotate&&/^[a-f0-9]{64}$/.test(prior||'')?prior:crypto.randomBytes(32).toString('hex');
 res.cookie(NONCE_COOKIE,nonce,options(req));res.setHeader('Cache-Control','no-store');
 return signature(nonce);
}
export function setSession(req,res,token){res.cookie(SESSION_COOKIE,token,options(req));return issueCsrf(req,res,true);}
export function clearSession(req,res){for(const name of [SESSION_COOKIE,NONCE_COOKIE])res.clearCookie(name,{...options(req),maxAge:undefined});}
export function csrfGuard(req,res,next){
 if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
 // Temporary non-browser bearer API compatibility; browser calls always need CSRF.
 if(!browserRequest(req))return next();
 const origin=req.headers.origin,expected=`${req.protocol}://${req.get('host')}`;
 const site=req.headers['sec-fetch-site'];
 if(site==='cross-site'||origin&&origin!==expected)return res.status(403).json({error:'Nguồn yêu cầu không hợp lệ',code:'CSRF_ORIGIN'});
 const nonce=cookies(req)[NONCE_COOKIE],token=req.headers['x-csrf-token'];
 if(!/^[a-f0-9]{64}$/.test(nonce||'')||! /^[a-f0-9]{64}$/.test(token||'')||!crypto.timingSafeEqual(Buffer.from(token),Buffer.from(signature(nonce))))return res.status(403).json({error:'Mã bảo vệ phiên không hợp lệ. Tải lại trang.',code:'CSRF_TOKEN'});
 next();
}
