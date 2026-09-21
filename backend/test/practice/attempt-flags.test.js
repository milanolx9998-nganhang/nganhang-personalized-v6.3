import test from 'node:test';
import assert from 'node:assert/strict';
import {setAttemptFlag} from '../../src/services/practice/flags.js';
test('Cờ chỉ đổi trường cá nhân, cho phép sau nộp và idempotent',async()=>{
 const queries=[],client={query:async(sql,params)=>{queries.push({sql,params});return {rows:[{id:'item',is_flagged:true}],rowCount:1};}};
 for(let i=0;i<2;i++)assert.equal((await setAttemptFlag({id:7,role:'student'},'attempt','item',{flagged:true},client)).is_flagged,true);
 assert.equal(queries.length,2);assert.match(queries[0].sql,/student_id/);assert.doesNotMatch(queries[0].sql,/SET.*(?:uncertain|grade_result|response|score)=/);
});
test('Cờ từ chối quyền khác, ID không thuộc mình, payload không boolean',async()=>{
 const client={query:async()=>({rows:[],rowCount:0})};
 await assert.rejects(()=>setAttemptFlag({id:7,role:'teacher'},'a','i',{flagged:true},client),{status:403});
 await assert.rejects(()=>setAttemptFlag({id:7,role:'student'},'a','i',{flagged:true},client),{status:404});
 await assert.rejects(()=>setAttemptFlag({id:7,role:'student'},'a','i',{flagged:'true'},client));
});
