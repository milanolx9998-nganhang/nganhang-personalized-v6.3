// Nạp Bài SGK và liên kết Bài ↔ YCCĐ cho phần Vật lí KHTN lớp 7.
//
// Vì sao cần script này: dữ liệu chương trình nằm trong cơ sở dữ liệu, không đi theo git. Đẩy mã lên
// GitHub không mang theo các bảng Bài/YCCĐ. Dữ liệu nguồn đã được trích sẵn thành
// `seed-data/khtn7-vatli-lessons.json` và commit cùng mã, nên máy chủ chỉ cần chạy script này một lần.
//
// Luật đối chiếu nằm ở services/curriculumMaster/lessonSeed.js: chỉ tra trong bản chương trình
// PUBLISHED mới nhất; nguyên văn khớp nhiều YCCĐ thì dừng; thiếu YCCĐ thì dừng và liệt kê.
//
// Dùng:  node src/db/seed-khtn7-vatli-lessons.js [--dry-run] [--allow-legacy]
//   --allow-legacy  cho phép liên kết vào dữ liệu cũ chưa gắn phiên bản khi môn/khối chưa có bản PUBLISHED
import 'dotenv/config';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {pool, tx} from './pool.js';
import {seedLessons, LessonSeedError} from '../services/curriculumMaster/lessonSeed.js';

const dryRun = process.argv.includes('--dry-run');
const allowLegacy = process.argv.includes('--allow-legacy');
const data = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./seed-data/khtn7-vatli-lessons.json', import.meta.url)), 'utf8'));

let exitCode = 0;
try {
  const result = await tx(async client => {
    const summary = await seedLessons(client, data, {allowLegacy});
    if (dryRun) throw Object.assign(new Error('DRY_RUN'), {summary});
    return summary;
  }).catch(e => {
    if (e.message === 'DRY_RUN') { console.log(JSON.stringify({dry_run: true, ...e.summary}, null, 1)); return null; }
    throw e;
  });
  if (result) console.log(JSON.stringify(result, null, 1));
} catch (e) {
  exitCode = 1;
  if (e instanceof LessonSeedError) {
    console.error(`[${e.code}] ${e.message}`);
    for (const m of e.details.missing || []) console.error(`  thiếu  [STT ${m.stt}] ${m.lesson} — ${m.text}`);
    for (const a of e.details.ambiguous || []) console.error(`  trùng  [STT ${a.stt}] ${a.lesson} — ${a.text} (YCCĐ ${a.yccd_ids.join(', ')})`);
  } else console.error(e);
} finally {
  await pool.end();
}
process.exitCode = exitCode;
