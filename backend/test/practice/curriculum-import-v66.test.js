import test from 'node:test';import assert from 'node:assert/strict';
import {mapRows,validateRows} from '../../src/services/curriculumMaster/importRules.js';
test('V66: thiếu Outcome giữ staging, không tự biến Chủ đề thành Outcome',()=>{
 const rows=mapRows([['L','Ánh sáng','Nêu được\nđặc điểm','']],{domain:0,group:1,text:2,page:3},false);
 assert.equal(rows[0].outcome_title,'');assert.equal(rows[0].text,'Nêu được\nđặc điểm');assert.equal(rows[0].domain,'L');
 assert.equal(validateRows(rows)[0].row_status,'BLOCKED');
 assert.equal(mapRows([['Chủ đề','Chuẩn']],{group:0,text:1},true)[0].outcome_title,'Chủ đề');
});
test('V66: nhận biết trùng mã, xung đột và trùng text khác mã, không tự gộp',()=>{
 const rows=[{code:'A',text:'Một',outcome_title:'O',outcome_code:'O',domain:''},{code:'A',text:'Hai',outcome_title:'O',outcome_code:'O',domain:''},{code:'B',text:'Một',outcome_title:'O',outcome_code:'O',domain:''}];
 assert.equal(validateRows(rows)[1].row_status,'BLOCKED');assert.equal(validateRows(rows)[2].row_status,'DUPLICATE');
});
