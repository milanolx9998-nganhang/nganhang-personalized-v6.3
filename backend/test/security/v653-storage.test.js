import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {loadProfile} from '../../src/config/profile.js';
import {LocalPrivateStorageAdapter} from '../../src/services/storage/local.js';
import {SupabaseStorageAdapter} from '../../src/services/storage/supabase.js';
test('V653 profile fail-closed, local không cần Internet, test không dùng DB chính',()=>{
 assert.equal(loadProfile({}).name,'local-lan');assert.throws(()=>loadProfile({APP_PROFILE:'other'}));
 assert.throws(()=>loadProfile({APP_PROFILE:'local-lan',STORAGE_PROVIDER:'supabase'}));
 assert.throws(()=>loadProfile({APP_PROFILE:'home-supabase'}));
 assert.throws(()=>loadProfile({APP_PROFILE:'home-supabase',DATABASE_URL:'postgres://localhost/nganhang_personalized_v63',SUPABASE_URL:'http://localhost:8000',SUPABASE_SERVICE_ROLE_KEY:'test-key'}));
});
test('V653 local storage contract, traversal và delivery không được bỏ authorization',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nganhang-storage-')),s=new LocalPrivateStorageAdapter(root);
 try{assert(await s.health());await s.put('media/test.png',Buffer.from('test'));assert(await s.exists('media/test.png'));assert.equal((await s.get('media/test.png')).toString(),'test');
  await assert.rejects(s.get('media/../private-imports/test'));await assert.rejects(s.getAuthorizedDelivery('media/test.png',async()=>false));await assert.rejects(s.getAuthorizedDelivery('media/test.png'));
  assert.equal((await s.getAuthorizedDelivery('media/test.png',async()=>true)).toString(),'test');await s.delete('media/test.png');assert.equal(await s.exists('media/test.png'),false);
 }finally{await fs.rm(root,{recursive:true});}
});
test('V653 Supabase contract stub: private bucket, key chỉ server, chặn public',async()=>{
 const calls=[];let publicBucket=false;
 const s=new SupabaseStorageAdapter({url:'https://example.invalid',key:'SERVER_ONLY_TEST',fetchImpl:async(url,options)=>{calls.push({url,options});return url.includes('/bucket/')?Response.json({public:publicBucket}):new Response(Buffer.from('test'));}});
 assert.equal((await s.getAuthorizedDelivery('media/test.png',async()=>true)).toString(),'test');assert(calls.every(c=>c.options.redirect==='error'));assert(calls.at(-1).url.includes('/object/authenticated/question-media-private/media/test.png'));
 const before=calls.length;await assert.rejects(s.getAuthorizedDelivery('media/test.png',async()=>false));assert.equal(calls.length,before);
 publicBucket=true;await assert.rejects(s.get('media/test.png'),/public/);
});

test('V653 Supabase legacy 400/404 được nhận diện, lỗi không lộ nội dung upstream',async()=>{
 const s=new SupabaseStorageAdapter({url:'https://example.invalid',key:'TEST',fetchImpl:async()=>Response.json({statusCode:'404',message:'upstream-private-data'},{status:400})});
 await assert.rejects(s.privateBucket('test'),e=>e.code==='ENOENT'&&!e.message.includes('upstream-private-data'));
});
