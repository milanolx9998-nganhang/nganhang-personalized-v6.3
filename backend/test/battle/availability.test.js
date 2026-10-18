import test from 'node:test';
import assert from 'node:assert/strict';
import {createAvailability} from '../../src/services/battle/availability.js';
import {createStorage} from '../../src/services/battle/storage.js';
test('B0: thiếu bảng hoặc mọi lỗi khởi tạo chỉ làm Đấu không khả dụng',async()=>{
 for(const error of [Object.assign(Error('thiếu bảng'),{code:'42P01'}),Error('lỗi bất kỳ')]){let cleaned=false;const warnings=[];const state=createAvailability({initialize:async()=>{throw error;},cleanup:()=>{cleaned=true;},warn:value=>warnings.push(value)});assert.equal(await state.start(),false);assert.equal(state.ready,false);assert.equal(cleaned,true);assert.equal(warnings.length,1);}
 const state=createAvailability({initialize:async()=>{},warn:()=>{}});assert.equal(await state.start(),true);assert.equal(state.ready,true);
});
test('Q1: restart đóng phòng chờ, chỉ phòng đang chơi bị interrupted',async()=>{const sql=[],client={query:async text=>{sql.push(text);return {rows:[]};},release:()=>{}};await createStorage({connect:async()=>client}).recover();assert.ok(sql.some(s=>s.includes("status='closed'")&&s.includes("WHERE status='lobby'")));assert.ok(sql.some(s=>s.includes("status='interrupted'")&&s.includes("WHERE status='playing'")));assert.equal(sql.at(-1),'COMMIT');});
