// Nạp Bài SGK và liên kết Bài ↔ YCCĐ từ một tệp dữ liệu đã trích sẵn (vd. seed-data/khtn7-vatli-lessons.json).
//
// Nguyên tắc (V6.6.5.2 §63–64):
//   - KHÔNG tạo mới Outcome/YCCĐ. Chuẩn chương trình phải có sẵn.
//   - Chỉ tra trong ĐÚNG MỘT bản chương trình: bản PUBLISHED mới nhất của môn + khối. Không có bản nào
//     thì dừng — trừ khi người chạy chủ động cho phép dùng dữ liệu cũ chưa gắn phiên bản (allowLegacy),
//     đúng như resolver đang làm. Không bao giờ trộn hai nguồn.
//   - YCCĐ đối chiếu bằng NGUYÊN VĂN. Một nguyên văn khớp nhiều YCCĐ thì dừng (AMBIGUOUS_YCCD_TEXT),
//     không chọn đại hàng đầu tiên.
//   - Bài được dùng lại chỉ khi trùng môn + khối + phân môn + tên.
//   - Chạy lại nhiều lần không sinh dữ liệu trùng.
import {effectiveCurriculumVersion} from '../curriculumResolver.js';

const norm = s => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

export class LessonSeedError extends Error {
  constructor(code, message, details = {}) { super(message); this.code = code; this.details = details; }
}

export async function seedLessons(client, data, {allowLegacy = false} = {}) {
  const subject = (await client.query('SELECT id,name FROM subjects WHERE code=$1', [data.subject_code])).rows[0];
  if (!subject) throw new LessonSeedError('SUBJECT_NOT_FOUND', `Không tìm thấy môn có mã ${data.subject_code}`);

  const branch = (await client.query(
    `SELECT id FROM branches WHERE subject_id=$1
       AND (CASE code WHEN 'VL' THEN 'L' WHEN 'HH' THEN 'H' WHEN 'SH' THEN 'S' ELSE code END)=$2
     ORDER BY id LIMIT 1`, [subject.id, data.branch_code])).rows[0];
  if (!branch) throw new LessonSeedError('BRANCH_NOT_FOUND', `Không tìm thấy phân môn ${data.branch_code} của môn ${subject.name}`);

  const version = await effectiveCurriculumVersion(client, subject.id, data.grade);
  if (!version && !allowLegacy) {
    throw new LessonSeedError('NO_PUBLISHED_VERSION',
      `${subject.name} khối ${data.grade} chưa có bản chương trình PUBLISHED. Công bố bản chương trình trước, `
      + 'hoặc chạy lại với --allow-legacy nếu máy chủ đang dùng dữ liệu cũ chưa gắn phiên bản.');
  }
  const versionId = version?.id ?? null;

  const rows = (await client.query(
    `SELECT y.id,y.text,o.source_ordinal AS outcome_ordinal,y.source_ordinal AS yccd_ordinal
     FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id
     WHERE o.subject_id=$1 AND o.grade=$2 AND COALESCE(o.source_branch_code,o.domain_code)=$3
       AND y.status='ACTIVE' AND o.status='ACTIVE'
       AND ($4::int IS NULL AND o.curriculum_version_id IS NULL OR o.curriculum_version_id=$4)`,
    [subject.id, data.grade, data.branch_code, versionId])).rows;
  const byText = new Map();
  for (const r of rows) {
    const key = norm(r.text);
    if (!byText.has(key)) byText.set(key, []);
    byText.get(key).push(r);
  }

  const missing = [], ambiguous = [];
  for (const lesson of data.lessons) {
    for (const item of lesson.yccd) {
      const found = byText.get(norm(item.text)) || [];
      if (!found.length) missing.push({lesson: lesson.name, stt: item.stt, text: item.text.slice(0, 80)});
      else if (found.length > 1) ambiguous.push({lesson: lesson.name, stt: item.stt, text: item.text.slice(0, 80), yccd_ids: found.map(r => r.id)});
    }
  }
  const total = data.lessons.reduce((n, l) => n + l.yccd.length, 0);
  if (ambiguous.length) {
    throw new LessonSeedError('AMBIGUOUS_YCCD_TEXT',
      `${ambiguous.length}/${total} YCCĐ có nguyên văn trùng với nhiều YCCĐ trong bản chương trình; cần làm rõ trước khi liên kết.`,
      {ambiguous});
  }
  if (missing.length) {
    throw new LessonSeedError('YCCD_NOT_FOUND',
      `Thiếu ${missing.length}/${total} YCCĐ; nạp chuẩn chương trình khối ${data.grade} trước.`, {missing});
  }

  let createdTopics = 0, reusedTopics = 0, createdLinks = 0, existingLinks = 0;
  for (const lesson of data.lessons) {
    let topic = (await client.query(
      'SELECT id FROM topics WHERE subject_id=$1 AND grade=$2 AND branch_id IS NOT DISTINCT FROM $3 AND name=$4 ORDER BY id LIMIT 1',
      [subject.id, data.grade, branch.id, lesson.name])).rows[0];
    if (topic) reusedTopics++;
    else {
      topic = (await client.query(
        `INSERT INTO topics(subject_id,branch_id,grade,chapter,name,order_index,status)
         VALUES($1,$2,$3,$4,$5,$6,'ACTIVE') RETURNING id`,
        [subject.id, branch.id, data.grade, lesson.chapter, lesson.name, lesson.lesson_no])).rows[0];
      createdTopics++;
    }
    for (const item of lesson.yccd) {
      const [yccd] = byText.get(norm(item.text));
      const inserted = await client.query(
        `INSERT INTO topic_yccd_map(topic_id,yccd_id,relation_type,status,source_evidence)
         VALUES($1,$2,'core','ACTIVE',$3) ON CONFLICT DO NOTHING RETURNING topic_id`,
        [topic.id, yccd.id, JSON.stringify({
          source: data.source, curriculum: data.curriculum, curriculum_version: version?.version_code || 'LEGACY',
          source_stt: item.stt, matched_by: 'exact_text',
          db_label: `${data.branch_code}.${yccd.outcome_ordinal}.${yccd.yccd_ordinal}`,
        })]);
      if (inserted.rowCount) createdLinks++; else existingLinks++;
    }
  }
  return {
    subject: subject.name, grade: data.grade, branch: data.branch_code,
    curriculum_version: version ? {id: version.id, code: version.version_code} : 'LEGACY',
    lessons: data.lessons.length, topics_created: createdTopics, topics_reused: reusedTopics,
    links_created: createdLinks, links_already_present: existingLinks,
  };
}
