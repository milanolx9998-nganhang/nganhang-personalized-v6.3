// Ngân hàng từ vựng: đọc bộ từ / dòng từ cho Đấu. Tách hẳn khỏi ngân hàng câu hỏi.
import {pool} from '../../db/pool.js';
import {fail} from '../practice/config.js';
import {ALL_VOCAB_KINDS,languageOf} from './generator.js';
export const MIN_VOCAB_ENTRIES=8;
const gradeFits='($2::int IS NULL OR ((s.grade_min IS NULL OR s.grade_min<=$2) AND (s.grade_max IS NULL OR s.grade_max>=$2)))';
const setLabel=rows=>rows.length===1?rows[0].name:rows.length<=3?rows.map(r=>r.name).join(' · '):`${rows.length} bộ từ`;
export async function vocabScope(grade,scope={},client=pool){
 const ids=[...new Set((scope.vocab_set_ids||[]).map(Number))].sort((a,b)=>a-b);
 if(!ids.length||ids.length>20||ids.some(id=>!Number.isInteger(id)||id<1))fail('Chọn từ 1 đến 20 bộ từ vựng');
 const rows=(await client.query(`SELECT s.id,s.subject_id,s.name FROM vocab_sets s WHERE s.id=ANY($1::int[]) AND s.status='active' AND ${gradeFits} ORDER BY s.order_index,s.id`,[ids,grade??null])).rows;
 if(rows.length!==ids.length)fail('Bộ từ vựng không dùng được cho khối này');
 const subjects=new Set(rows.map(r=>r.subject_id));
 if(subjects.size!==1||(scope.subject_id!=null&&!subjects.has(Number(scope.subject_id))))fail('Các bộ từ phải cùng một môn');
 const kinds=scope.vocab_kinds?.length?[...new Set(scope.vocab_kinds)]:null;if(kinds?.some(k=>!ALL_VOCAB_KINDS.includes(k)))fail('Dạng câu từ vựng không hợp lệ');
 return {subject_id:rows[0].subject_id,branch_id:null,topic_ids:null,content:'vocab',vocab_set_ids:ids,...(kinds?{vocab_kinds:kinds}:{}),vocab_label:setLabel(rows)};
}
export async function vocabEntries(setIds,client=pool){
 return (await client.query(`SELECT e.id,e.set_id,s.name AS set_name,e.term,e.reading,e.han_viet,e.pos,e.meaning_vi,e.example,e.example_vi,e.confusable_group
  FROM vocab_entries e JOIN vocab_sets s ON s.id=e.set_id WHERE e.set_id=ANY($1::int[]) AND e.status='approved' AND s.status='active'`,[setIds])).rows;
}
// Số câu tối đa một phạm vi sinh được (mỗi từ làm đích một lần); dưới ngưỡng thì coi như chưa chơi được.
export async function vocabCount(scope,client=pool){const n=(await vocabEntries(scope.vocab_set_ids,client)).length;return n>=MIN_VOCAB_ENTRIES?n:0;}
// Bộ từ học sinh khối này chơi được; giáo viên (grade null) thấy mọi bộ đang hiện.
export async function playableSets(grade,subjectId=null,client=pool){
 const rows=(await client.query(`SELECT s.id,s.subject_id,sub.name AS subject_name,sub.code AS subject_code,s.name,s.kind,s.level,s.grade_min,s.grade_max,s.topic_id,s.order_index,
  count(e.id) FILTER (WHERE e.status='approved')::int AS entry_count,bool_or(e.term ~ '[㐀-䶿一-鿿]') AS han
  FROM vocab_sets s JOIN subjects sub ON sub.id=s.subject_id LEFT JOIN vocab_entries e ON e.set_id=s.id
  WHERE s.status='active' AND ${gradeFits} AND ($1::int IS NULL OR s.subject_id=$1)
  GROUP BY s.id,sub.name,sub.code ORDER BY sub.name,s.kind,s.level NULLS LAST,s.order_index,s.name`,[subjectId,grade??null])).rows;
 return rows.map(({han,...s})=>({...s,language:han||s.kind==='hsk'?'zh':'en',playable:s.entry_count>=MIN_VOCAB_ENTRIES}));
}
export {languageOf};
