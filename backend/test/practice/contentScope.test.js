import test from 'node:test';
import assert from 'node:assert/strict';
import {yccdScope,yccdOptions} from '../../src/services/practice/contentScope.js';
test('YCCĐ không tự suy từ chuyên đề hoặc câu chưa gắn mã',()=>{assert.equal(yccdScope({node_type:'specialty',taxonomy_node_id:1,content:{}}),null);});
test('Mã YCCĐ giữ riêng theo bài, Outcome và phân môn',()=>{const a={topic_id:1,content:{yccd:'1',outcome:'2',branch_code:'L'}};const keys=[a,{...a,topic_id:2},{...a,content:{...a.content,outcome:'3'}},{...a,content:{...a.content,branch_code:'H'}}].map(v=>yccdScope(v).key);assert.equal(new Set(keys).size,4);});
test('Nút YCCĐ dùng ID phiên bản; nhóm chỉ xuất nhãn, số câu và bài',()=>{const a={node_type:'yccd',taxonomy_node_id:17,node_name:'Yêu cầu A',version_name:'V1',topic_id:2,content:{answer:'bí mật'}};assert.equal(yccdScope(a).key,JSON.stringify(['node',17]));assert.deepEqual(yccdOptions([a,a]),[{key:JSON.stringify(['node',17]),name:'Yêu cầu A',context:'V1',topic_ids:[2],question_count:2}]);});
