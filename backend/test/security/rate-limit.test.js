import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';
import {limiter} from '../../src/middleware/rateLimiter.js';
test('NAT: 5 lỗi khóa tài khoản A nhưng không chặn B cùng IP; trả Retry-After',async()=>{
 const app=express();app.use(express.json());app.post('/login',limiter(900000,5,req=>'account:'+req.body.username,true,()=>{}),(req,res)=>res.sendStatus(req.body.ok?200:401));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port+'/login';
 const request=(username,ok=false)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,ok})});
 try{for(let n=0;n<5;n++)assert.equal((await request('A')).status,401);const blocked=await request('A');assert.equal(blocked.status,429);assert(Number(blocked.headers.get('retry-after'))>0);for(let n=0;n<10;n++)assert.equal((await request('B',true)).status,200);}finally{await new Promise(r=>server.close(r));}
});
