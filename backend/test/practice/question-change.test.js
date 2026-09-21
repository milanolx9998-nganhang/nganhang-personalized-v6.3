import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyQuestionChange} from '../../src/services/questionReview.js';
const q={stem:'Tính 1 + 1',type:'multiple_choice',options:[{id:'A',text:'2'}],answer:{correct:'A'},topic_id:1,yccd_id:2};
test('Phân loại A: nhãn / ghi chú / khoảng trắng không sinh content version',()=>{
 for(const patch of [{tags:['stem']},{internal_notes:'ghi chú'},{stem:' Tính  1 + 1 '}])assert.equal(classifyQuestionChange(q,{...q,...patch}).classification,'NON_SEMANTIC');
});
test('Phân loại B: đổi bài / YCCĐ / mức chỉ metadata revision',()=>{
 const d=classifyQuestionChange(q,{...q,topic_id:3,yccd_id:4,cognitive_level:2,change_reason:'Ghi căn cứ'});assert.equal(d.classification,'CURRICULUM_METADATA');assert.equal(d.requires_content_version,false);assert.equal(d.requires_review,true);
});
test('Phân loại C: nội dung, đáp án, giải thích, sai số, media cần phiên bản',()=>{
 for(const patch of [{stem:'Tính 2 + 2'},{answer:{correct:'B'}},{explanation:'Cách khác'},{image_url:'/uploads/new.png'},{answer:{numeric:2,tolerance:.1}},{options:[{id:'A',text:'3'}]}]){const d=classifyQuestionChange(q,{...q,...patch});assert.equal(d.classification,'ASSESSMENT_CONTENT');assert.equal(d.requires_content_version,true);}
});
test('Metadata có trong legacy_snapshot không gây giả thay nội dung',()=>{
 const d=classifyQuestionChange({...q,legacy_snapshot:{yccd_id:2}},{...q,legacy_snapshot:{yccd_id:3},yccd_id:3});assert.equal(d.classification,'CURRICULUM_METADATA');
});
