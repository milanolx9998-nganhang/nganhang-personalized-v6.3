import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import crypto from 'node:crypto';
import {csrfGuard,issueCsrf,setSession,clearSession} from '../../src/middleware/session.js';
test('Cookie HttpOnly và CSRF: cùng nguồn hợp lệ, thiếu mã/khác nguồn bị chặn',async()=>{
 const prior=process.env.JWT_SECRET;process.env.JWT_SECRET=crypto.randomBytes(64).toString('hex');
 const app=express();app.use(csrfGuard);app.get('/csrf',(req,res)=>res.json({csrf:issueCsrf(req,res)}));app.post('/login',(req,res)=>res.json({csrf:setSession(req,res,'test-only-session')}));app.post('/logout',(req,res)=>{clearSession(req,res);res.json({ok:true});});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  const bootstrap=await fetch(origin+'/csrf'),cookie=bootstrap.headers.getSetCookie()[0].split(';')[0],csrf=(await bootstrap.json()).csrf;
  const headers={Origin:origin,Cookie:cookie,'X-CSRF-Token':csrf,'Sec-Fetch-Site':'same-origin'};
  const success=await fetch(origin+'/login',{method:'POST',headers});assert.equal(success.status,200);
  const issued=success.headers.getSetCookie();assert(issued.every(c=>c.includes('HttpOnly')&&c.includes('SameSite=Lax')&&c.includes('Path=/')));
  assert.equal((await fetch(origin+'/login',{method:'POST',headers:{...headers,'X-CSRF-Token':''}})).status,403);
  assert.equal((await fetch(origin+'/login',{method:'POST',headers:{...headers,Origin:'https://evil.example','Sec-Fetch-Site':'cross-site'}})).status,403);
  assert.notEqual((await success.json()).csrf,csrf);
  const logout=await fetch(origin+'/logout',{method:'POST',headers});assert.equal(logout.status,200);assert(logout.headers.getSetCookie().every(c=>c.includes('Expires=Thu, 01 Jan 1970')));
 }finally{await new Promise(r=>server.close(r));if(prior===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=prior;}
});
