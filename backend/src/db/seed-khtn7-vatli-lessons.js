// Nạp Bài SGK và liên kết Bài ↔ YCCĐ cho phần Vật lí KHTN lớp 7.
//
// Vì sao cần script này: dữ liệu chương trình nằm trong cơ sở dữ liệu, không đi theo git. Đẩy mã lên
// GitHub không mang theo các bảng Bài/YCCĐ. Dữ liệu nguồn đã được trích sẵn thành
// `seed-data/khtn7-vatli-lessons.json` và commit cùng mã, nên máy chủ chỉ cần chạy script này một lần.
//
// Nguyên tắc:
//   - KHÔNG tạo mới Outcome/YCCĐ. Chuẩn chương trình đã có trong cơ sở dữ liệu.
//   - YCCĐ được đối chiếu bằng NGUYÊN VĂN, không bằng số thứ tự, vì hai nguồn đánh số khác nhau
//     (cơ sở dữ liệu đánh theo từng Outcome, tệp thống kê đánh theo STT toàn khối 19–49).
//   - Thiếu một YCCĐ nào thì dừng và liệt kê; không đoán.
//   - Chạy lại nhiều lần không sinh dữ liệu trùng.
//
// Dùng:  node src/db/seed-khtn7-vatli-lessons.js [--dry-run]
import 'dotenv/config';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {pool, tx} from './pool.js';

const dryRun = process.argv.includes('--dry-run');
const data = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./seed-data/khtn7-vatli-lessons.json', import.meta.url)), 'utf8'));
const norm = s => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

const result = await tx(async client => {
  const subject = (await client.query('SELECT id,name FROM subjects WHERE code=$1', [data.subject_code])).rows[0];
  if (!subject) throw new Error(`Không tìm thấy môn có mã ${data.subject_code}`);

  const branch = (await client.query(
    `SELECT id FROM branches WHERE subject_id=$1
       AND (CASE code WHEN 'VL' THEN 'L' WHEN 'HH' THEN 'H' WHEN 'SH' THEN 'S' ELSE code END)=$2
     ORDER BY id LIMIT 1`, [subject.id, data.branch_code])).rows[0];
  if (!branch) throw new Error(`Không tìm thấy phân môn ${data.branch_code} của môn ${subject.name}`);

  // Bảng tra nguyên văn YCCĐ -> id, giới hạn trong đúng môn/khối/phân môn.
  const rows = (await client.query(
    `SELECT y.id,y.text,o.source_ordinal AS outcome_ordinal,y.source_ordinal AS yccd_ordinal
     FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id
     WHERE o.subject_id=$1 AND o.grade=$2 AND COALESCE(o.source_branch_code,o.domain_code)=$3
       AND y.status<>'RETIRED' AND o.status<>'RETIRED'`,
    [subject.id, data.grade, data.branch_code])).rows;
  const byText = new Map(rows.map(r => [norm(r.text), r]));

  const missing = [];
  for (const lesson of data.lessons) {
    for (const item of lesson.yccd) if (!byText.has(norm(item.text))) missing.push({lesson: lesson.name, stt: item.stt, text: item.text.slice(0, 80)});
  }
  if (missing.length) {
    console.error('Không đối chiếu được các YCCĐ sau với cơ sở dữ liệu:');
    for (const m of missing) console.error(`  [STT ${m.stt}] ${m.lesson} — ${m.text}`);
    throw new Error(`Thiếu ${missing.length}/${data.lessons.reduce((n, l) => n + l.yccd.length, 0)} YCCĐ; nạp chuẩn chương trình khối ${data.grade} trước.`);
  }

  let createdTopics = 0, reusedTopics = 0, createdLinks = 0, existingLinks = 0;
  for (const lesson of data.lessons) {
    let topic = (await client.query(
      'SELECT id FROM topics WHERE subject_id=$1 AND grade=$2 AND name=$3 ORDER BY id LIMIT 1',
      [subject.id, data.grade, lesson.name])).rows[0];
    if (topic) reusedTopics++;
    else {
      topic = (await client.query(
        `INSERT INTO topics(subject_id,branch_id,grade,chapter,name,order_index,status)
         VALUES($1,$2,$3,$4,$5,$6,'ACTIVE') RETURNING id`,
        [subject.id, branch.id, data.grade, lesson.chapter, lesson.name, lesson.lesson_no])).rows[0];
      createdTopics++;
    }

    for (const item of lesson.yccd) {
      const yccd = byText.get(norm(item.text));
      const inserted = await client.query(
        `INSERT INTO topic_yccd_map(topic_id,yccd_id,relation_type,status,source_evidence)
         VALUES($1,$2,'core','ACTIVE',$3) ON CONFLICT DO NOTHING RETURNING topic_id`,
        [topic.id, yccd.id, JSON.stringify({
          source: data.source, curriculum: data.curriculum,
          source_stt: item.stt, matched_by: 'exact_text',
          db_label: `${data.branch_code}.${yccd.outcome_ordinal}.${yccd.yccd_ordinal}`,
        })]);
      if (inserted.rowCount) createdLinks++; else existingLinks++;
    }
  }

  const summary = {
    subject: subject.name, grade: data.grade, branch: data.branch_code,
    lessons: data.lessons.length, topics_created: createdTopics, topics_reused: reusedTopics,
    links_created: createdLinks, links_already_present: existingLinks,
  };
  if (dryRun) throw Object.assign(new Error('DRY_RUN'), {summary});
  return summary;
}).catch(e => {
  if (e.message === 'DRY_RUN') { console.log(JSON.stringify({dry_run: true, ...e.summary}, null, 1)); return null; }
  throw e;
});

if (result) console.log(JSON.stringify(result, null, 1));
await pool.end();
