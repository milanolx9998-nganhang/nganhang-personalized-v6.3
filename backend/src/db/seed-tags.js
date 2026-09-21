import 'dotenv/config';
import { pool } from './pool.js';

const TAGS = [
  { name: 'SGK Kết nối', tier: 'core', category: 'Nguồn' },
  { name: 'SGK Chân trời', tier: 'core', category: 'Nguồn' },
  { name: 'SGK Cánh diều', tier: 'core', category: 'Nguồn' },
  { name: 'Đề thi BGD', tier: 'core', category: 'Nguồn' },
  { name: 'Đề thi Sở', tier: 'core', category: 'Nguồn' },
  { name: 'Tự biên soạn', tier: 'core', category: 'Nguồn' },
  { name: 'Câu hay', tier: 'academic', category: 'Chất lượng' },
  { name: 'Câu khó', tier: 'academic', category: 'Chất lượng' },
  { name: 'Dễ sai', tier: 'academic', category: 'Chất lượng' },
  { name: 'Cần review', tier: 'ops', category: 'Workflow' },
  { name: 'Bám sát đề thi', tier: 'academic', category: 'Mục đích' },
  { name: 'Ôn tập HK1', tier: 'academic', category: 'Kỳ thi' },
  { name: 'Ôn tập HK2', tier: 'academic', category: 'Kỳ thi' },
  { name: 'Đề cương', tier: 'academic', category: 'Kỳ thi' },
  { name: 'HSG', tier: 'academic', category: 'Kỳ thi' },
];

async function main() {
  let n = 0;
  for (const t of TAGS) {
    const { rowCount } = await pool.query(
      'INSERT INTO tags (name, tier, category) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [t.name, t.tier, t.category]
    );
    if (rowCount) n++;
  }
  console.log(`✓ Seeded ${n} tags (${TAGS.length - n} already existed)`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
