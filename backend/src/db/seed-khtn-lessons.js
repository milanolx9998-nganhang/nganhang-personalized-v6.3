// Nạp Bài SGK + liên kết Bài ↔ YCCĐ cho cả một khối KHTN (6–9), mọi phân môn.
//
// Dữ liệu: seed-data/khtn{khối}-lessons.json, dựng bằng scripts/build-khtn-lesson-seed.mjs từ KHDH 26-27 của trường
// (Tên bài ↔ Yêu cầu cần đạt) + workbook Outcome/YCCĐ chính thức. Báo cáo rà soát: docs/KHTN_BAI_YCCD_SEED_REVIEW.md.
//
// Dùng:  node src/db/seed-khtn-lessons.js --grade 9 [--dry-run] [--allow-legacy] [--include-uncertain]
//   --dry-run            làm thật trong transaction rồi ROLLBACK, in bản tóm tắt
//   --allow-legacy       cho phép dùng YCCĐ cũ chưa gắn phiên bản khi khối chưa có bản PUBLISHED
//   --include-uncertain  nạp cả mục từ ô KHDH gộp nhiều Bài chưa phân định được Bài (mặc định bỏ qua, xem báo cáo rà soát)
// Chạy lại nhiều lần không sinh dữ liệu trùng. Bài đã có được dùng lại theo số Bài.
import 'dotenv/config';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {pool, tx} from './pool.js';
import {seedGradeLessons, LessonSeedError} from '../services/curriculumMaster/lessonSeed.js';

const args = process.argv.slice(2);
const grade = Number(args[args.indexOf('--grade') + 1]);
const dryRun = args.includes('--dry-run');
const allowLegacy = args.includes('--allow-legacy');
const includeUncertain = args.includes('--include-uncertain');

let exitCode = 0;
try {
  if (!args.includes('--grade') || ![6, 7, 8, 9].includes(grade)) throw new LessonSeedError('BAD_ARGS', 'Cần --grade 6|7|8|9');
  const data = JSON.parse(fs.readFileSync(fileURLToPath(new URL(`./seed-data/khtn${grade}-lessons.json`, import.meta.url)), 'utf8'));
  const result = await tx(async client => {
    const summary = await seedGradeLessons(client, data, {allowLegacy, includeUncertain});
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
    for (const m of e.details.missing || []) console.error(`  thiếu  [${m.stt}] ${m.lesson} — ${m.text}`);
    for (const a of e.details.ambiguous || []) console.error(`  trùng  [${a.stt}] ${a.lesson} — ${a.text} (YCCĐ ${a.yccd_ids.join(', ')})`);
    if (e.details.topic_ids) console.error(`  Bài trùng số: ${e.details.topic_ids.join(', ')}`);
  } else console.error(e);
} finally {
  await pool.end();
}
process.exitCode = exitCode;
