import {pool} from '../../db/pool.js';
import {z} from 'zod';
import {fail} from './config.js';
import {scopedQuestionMedia} from './privateMedia.js';
export async function setAttemptFlag(user,attemptId,itemId,raw,client=pool){
 if(user.role!=='student')fail('Cờ xem lại chỉ thuộc học sinh làm bài',403);
 const d=z.object({flagged:z.boolean()}).strict().parse(raw);
 const row=(await client.query('UPDATE attempt_items i SET is_flagged=$1 FROM attempts a WHERE i.id=$2 AND i.attempt_id=$3 AND a.id=i.attempt_id AND a.student_id=$4 RETURNING i.id,i.is_flagged',[d.flagged,itemId,attemptId,user.id])).rows[0];
 if(!row)fail('Không tìm thấy câu trong bài làm của em',404);
 return row;
}
export async function flaggedItems(user,query={},client=pool){
 if(user.role!=='student')fail('Chỉ học sinh xem cờ cá nhân',403);
 const limit=Math.min(100,Math.max(1,Number(query.limit)||30)),offset=Math.max(0,Number(query.offset)||0);
 return (await client.query("SELECT i.id,i.attempt_id,i.sequence,i.question_version_id,i.curriculum_snapshot,a.status,a.started_at,v.content->>'stem' AS stem,COALESCE(v.content->>'stem',v.content->>'stem_text') AS preview,count(*) OVER()::int AS total FROM attempt_items i JOIN attempts a ON a.id=i.attempt_id JOIN question_versions v ON v.id=i.question_version_id WHERE a.student_id=$1 AND i.is_flagged ORDER BY a.started_at DESC,i.sequence LIMIT $2 OFFSET $3",[user.id,limit,offset])).rows.map(row=>scopedQuestionMedia(row,row.attempt_id,row.id));
}
