import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeContentScope,compileQuestionScopeSQL,resolveContentScope} from '../../src/services/contentScopeV2.js';
const raw={version:2,subject_id:1,grade:7,clauses:[{topic_id:11,mode:'all'},{topic_id:12,mode:'yccds',yccd_ids:[2,2]},{topic_id:null,mode:'outcomes',outcome_ids:[4]}]};
test('V2 giữ mệnh đề từng bài, khử trùng ID, không làm phẳng',()=>{
 const s=normalizeContentScope(raw);assert.equal(s.clauses.length,3);assert.deepEqual(s.clauses[1].yccd_ids,[2]);assert.equal(s.clauses[2].topic_id,null);
});
test('SQL OR giữa mệnh đề, AND trong bài, bind tham số an toàn',()=>{
 const q=compileQuestionScopeSQL({...raw,clauses:raw.clauses.slice(0,2)},'q',3);
 assert.match(q.sql,/ OR /);assert.match(q.sql,/AND/);assert.deepEqual(q.params,[1,7,11,12,[2]]);assert.match(q.sql,/\$3/);
 assert.throws(()=>compileQuestionScopeSQL(raw,'q;DROP TABLE questions'));
});
test('V2 từ chối phạm vi rỗng, mode lạ, ID ngoài miền, all không bài',()=>{
 for(const clauses of [[],[{mode:'all',topic_id:null}],[{mode:'yccds',topic_id:1,yccd_ids:[]}],[{mode:'hack',topic_id:1}],[{mode:'all',topic_id:-1}]])assert.throws(()=>normalizeContentScope({...raw,clauses}));
});
test('adapter đọc cấu hình cũ giữ topic và identity master/node/code',()=>{
 const c=normalizeContentScope({subject_id:1,grade:7,selection_mode:'yccd',yccd_keys:['["master",2]','["node",3]','["code",11,"L","O1","Y1"]']});
 assert.equal(c.clauses.length,3);assert.equal(c.clauses[0].yccd_ids[0],2);assert.equal(c.clauses[1].legacy_key[0],'node');
 assert.deepEqual(normalizeContentScope({subject_id:1,grade:7,topic_ids:[11,12]}).clauses.map(c=>c.topic_id),[11,12]);
});
test('Outcome trong bài chỉ resolve YCCĐ được map bài đó',async()=>{
 const client={query:async sql=>({rows:sql.includes('FROM topics')?[{id:11,subject_id:1,grade:7,status:'ACTIVE'}]:sql.includes('FROM curriculum_outcomes')?[{id:4,subject_id:1,grade:7,status:'ACTIVE'}]:[{id:2,outcome_id:4,topic_id:11,status:'ACTIVE'}]})};
 const s=await resolveContentScope({subject_id:1,grade:7,version:2,clauses:[{topic_id:11,mode:'outcomes',outcome_ids:[4]}]},client);
 assert.deepEqual(s.clauses[0].yccd_ids,[2]);assert.equal(s.clauses[0].topic_id,11);
});
