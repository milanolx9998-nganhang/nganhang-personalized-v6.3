import test from 'node:test';import assert from 'node:assert/strict';
import {mediaRefs,mediaId,mediaUrl,scopedQuestionMedia} from '../../src/services/practice/privateMedia.js';
import {flaggedItems} from '../../src/services/practice/flags.js';
test('Ảnh trong danh sách cờ cá nhân cũng dùng URL riêng của bài làm',async()=>{
 const client={query:async()=>({rows:[{id:'item-a',attempt_id:'attempt-a',stem:'![Ảnh](/uploads/media/flag.png)',preview:'![Ảnh](/uploads/media/flag.png)'}]})};
 const [row]=await flaggedItems({id:1,role:'student'},{},client);
 assert(row.preview.includes('/attempts/attempt-a/items/item-a/media/'));assert(!row.stem.includes('/uploads/'));
});
test('Media chỉ nhận đường dẫn nội bộ; URL học sinh buộc attempt và item',()=>{
 const url='/uploads/media/abcdef.png',id=mediaId(url);assert.equal(mediaUrl(id),url);assert.equal(mediaUrl(mediaId('/uploads/media/../private-imports/file.png')),null);
 assert.deepEqual(mediaRefs({text:'![Ảnh]('+url+')'}),[url]);
 const q=scopedQuestionMedia({stem:'![Ảnh]('+url+')'},'attempt-a','item-a');assert(q.stem.includes('/attempts/attempt-a/items/item-a/media/'+id));assert(!q.stem.includes('/uploads/'));
});
