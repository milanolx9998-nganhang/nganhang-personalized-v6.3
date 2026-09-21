import test from 'node:test';import assert from 'node:assert/strict';
import {staffQuestionDto} from '../../src/services/access/visibility.js';
test('Staff DTO không lộ answer/source qua thuộc tính mới hoặc legacy_snapshot',()=>{
 const secret='UNRELEASED_SECRET';const q={id:1,stem_text:'Đề',answer_key:secret,source_path:secret,notes:secret,new_private_field:secret,normalized_content:{type:'short_answer',stem:'Đề',answer:{numeric:123},legacy_snapshot:{source_path:secret,answer_key:secret}},active_metadata:{topic_id:1,answer_key:secret}};
 const dto=staffQuestionDto(q,false);assert(!JSON.stringify(dto).includes(secret));assert(!dto.normalized_content.answer);
 const released=staffQuestionDto(q,true);assert.equal(released.answer_key,secret);assert.equal(released.source_path,undefined);assert.equal(released.normalized_content.legacy_snapshot,undefined);
});
