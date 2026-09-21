import { pool } from './src/db/pool.js';
import { buildQtiZip } from './src/services/qtiExport.js';

(async () => {
  try {
    const {rows} = await pool.query('SELECT * FROM exam_runs LIMIT 1');
    if(!rows[0]) return console.log('NO EXAM RUN');
    const run = rows[0];
    const {rows: items} = await pool.query(`
        SELECT q.id, q.question_code, q.stem_text, q.q_type,
               q.option_a, q.option_b, q.option_c, q.option_d,
               q.answer_key, q.explanation, q.score, q.image_url
        FROM exam_items ei
        JOIN questions q ON q.id = ei.question_id
        WHERE ei.run_id = $1
        ORDER BY ei.order_index
    `, [run.id]);
    
    if(!items.length) { console.log('NO ITEMS'); return; }
    console.log('Building for', items.length, 'items');
    const buf = await buildQtiZip({ title: 'test', questions: items });
    console.log('SUCCESS, bytes:', buf.length);
  } catch(e) {
    console.log('CATCH ERROR:', e);
  } finally {
    process.exit(0);
  }
})();
