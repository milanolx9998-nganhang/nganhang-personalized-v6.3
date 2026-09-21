import 'dotenv/config';
import {pool,tx} from '../../db/pool.js';
import {recalculate} from './mastery.js';
import {settings} from './config.js';
try {
 const ids=(await pool.query('SELECT user_id FROM student_profiles ORDER BY user_id')).rows;
 for(const {user_id} of ids)await tx(async client=>{
  await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user_id]);
  await recalculate(client,user_id,await settings(client));
 });
 console.log(JSON.stringify({recalculated_students:ids.length}));
} finally {await pool.end();}
