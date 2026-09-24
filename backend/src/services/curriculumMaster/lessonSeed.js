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

// Cả khối, nhiều phân môn (V6.6.7.1): seed-data/khtn{6..9}-lessons.json do scripts/build-khtn-lesson-seed.mjs dựng
// từ KHDH của trường. Khác seedLessons ở ba điểm:
//   - YCCĐ tra theo nguyên văn TRONG ĐÚNG phân môn của mục (L/H/S) — cùng câu chữ ở hai phân môn không lẫn nhau;
//   - Bài đã có được dùng lại theo SỐ BÀI trong môn + khối ("Bài 2: …" hay "Bài 2. …" đều là Bài 2), không tạo
//     Bài trùng chỉ vì khác dấu câu; Bài chưa có mới được tạo;
//   - mục từ ô KHDH gộp nhiều Bài mà chưa phân định được Bài (matched_by grouped) chỉ nạp khi cho phép
//     (includeUncertain). Cặp khớp gần đúng về câu chữ (fuzzy) được nạp: nguyên văn chuẩn luôn là workbook chính thức.
const UNCERTAIN = new Set(['grouped']);
const lessonNumber = name => { const m = /^\s*Bài\s*(\d+)/i.exec(String(name ?? '')); return m ? Number(m[1]) : null; };

export async function seedGradeLessons(client, data, {allowLegacy = false, includeUncertain = false} = {}) {
  const subject = (await client.query('SELECT id,name FROM subjects WHERE code=$1', [data.subject_code])).rows[0];
  if (!subject) throw new LessonSeedError('SUBJECT_NOT_FOUND', `Không tìm thấy môn có mã ${data.subject_code}`);
  const version = await effectiveCurriculumVersion(client, subject.id, data.grade);
  if (!version && !allowLegacy) {
    throw new LessonSeedError('NO_PUBLISHED_VERSION',
      `${subject.name} khối ${data.grade} chưa có bản chương trình PUBLISHED. Công bố bản chương trình trước, `
      + 'hoặc chạy lại với --allow-legacy nếu máy chủ đang dùng dữ liệu cũ chưa gắn phiên bản.');
  }
  const versionId = version?.id ?? null;
  const branches = new Map((await client.query(
    `SELECT id,CASE code WHEN 'VL' THEN 'L' WHEN 'HH' THEN 'H' WHEN 'SH' THEN 'S' ELSE code END AS letter FROM branches WHERE subject_id=$1 ORDER BY id`,
    [subject.id])).rows.reverse().map(r => [r.letter, r.id]));

  const rows = (await client.query(
    `SELECT y.id,y.text,COALESCE(o.source_branch_code,o.domain_code) AS branch,o.source_ordinal AS outcome_ordinal,y.source_ordinal AS yccd_ordinal
     FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id
     WHERE o.subject_id=$1 AND o.grade=$2 AND y.status='ACTIVE' AND o.status='ACTIVE'
       AND ($3::int IS NULL AND o.curriculum_version_id IS NULL OR o.curriculum_version_id=$3)`,
    [subject.id, data.grade, versionId])).rows;
  const byText = new Map();
  for (const r of rows) {
    const key = r.branch + '|' + norm(r.text);
    if (!byText.has(key)) byText.set(key, []);
    byText.get(key).push(r);
  }

  // Bài được dùng lại theo số Bài: mục không có số sẽ khớp nhầm mọi Bài không đánh số → dừng trước khi ghi.
  const unnumbered = data.lessons.filter(l => !Number.isInteger(l.lesson_no)).map(l => l.name);
  if (unnumbered.length) throw new LessonSeedError('BAD_LESSON_DATA', `${unnumbered.length} Bài trong dữ liệu seed không có số Bài: ${unnumbered.slice(0, 3).join('; ')}`);

  const missing = [], ambiguous = [];
  let skippedUncertain = 0;
  const plan = data.lessons.map(lesson => ({lesson, items: lesson.yccd.filter(item => {
    if (!includeUncertain && UNCERTAIN.has(item.matched_by)) { skippedUncertain++; return false; }
    const found = byText.get(item.branch_code + '|' + norm(item.text)) || [];
    if (!found.length) missing.push({lesson: lesson.name, stt: `${item.branch_code}.${item.outcome}.${item.stt}`, text: item.text.slice(0, 80)});
    else if (found.length > 1) ambiguous.push({lesson: lesson.name, stt: `${item.branch_code}.${item.outcome}.${item.stt}`, text: item.text.slice(0, 80), yccd_ids: found.map(r => r.id)});
    return true;
  })}));
  const total = plan.reduce((n, p) => n + p.items.length, 0);
  if (ambiguous.length) {
    throw new LessonSeedError('AMBIGUOUS_YCCD_TEXT',
      `${ambiguous.length}/${total} YCCĐ có nguyên văn trùng với nhiều YCCĐ trong cùng phân môn; cần làm rõ trước khi liên kết.`, {ambiguous});
  }
  if (missing.length) {
    throw new LessonSeedError('YCCD_NOT_FOUND',
      `Thiếu ${missing.length}/${total} YCCĐ trong bản chương trình khối ${data.grade}; nạp đúng workbook chính thức trước.`, {missing});
  }

  const existing = (await client.query(
    `SELECT t.id,t.name,CASE b.code WHEN 'VL' THEN 'L' WHEN 'HH' THEN 'H' WHEN 'SH' THEN 'S' ELSE b.code END AS letter,
            (SELECT count(*)::int FROM topic_yccd_map m WHERE m.topic_id=t.id) AS links
     FROM topics t LEFT JOIN branches b ON b.id=t.branch_id WHERE t.subject_id=$1 AND t.grade=$2 ORDER BY t.id`, [subject.id, data.grade])).rows;
  let createdTopics = 0, reusedTopics = 0, createdLinks = 0, existingLinks = 0;
  const branchCorrected = [], skippedCrossBranch = [];
  for (const {lesson, items: planned} of plan) {
    if (!planned.length) continue;
    let items = planned;
    const letters = [...new Set(items.map(i => i.branch_code))];
    const same = existing.filter(t => lessonNumber(t.name) === lesson.lesson_no);
    if (same.length > 1) throw new LessonSeedError('DUPLICATE_LESSON', `Môn/khối đã có ${same.length} Bài số ${lesson.lesson_no}; gộp tay trước khi seed.`, {topic_ids: same.map(t => t.id)});
    let topic = same[0];
    if (topic) {
      reusedTopics++;
      // Liên kết Bài ↔ YCCĐ phải cùng phân môn (trigger v643). Bài có sẵn gắn sai phân môn (vd. dữ liệu cũ đặt
      // "Vòng năng lượng" vào Hoá) mà CHƯA có liên kết nào, và mọi YCCĐ của nó cùng một phân môn → sửa phân môn
      // của Bài theo chương trình. Các trường hợp khác: chỉ liên kết YCCĐ cùng phân môn, phần còn lại báo lại.
      if (topic.letter && letters.some(l => l !== topic.letter)) {
        if (!topic.links && letters.length === 1 && branches.has(letters[0])) {
          await client.query('UPDATE topics SET branch_id=$2 WHERE id=$1', [topic.id, branches.get(letters[0])]);
          branchCorrected.push({topic_id: topic.id, lesson: topic.name, from: topic.letter, to: letters[0]});
          topic.letter = letters[0];
        } else {
          const other = items.filter(i => i.branch_code !== topic.letter);
          skippedCrossBranch.push(...other.map(i => ({lesson: topic.name, stt: `${i.branch_code}.${i.outcome}.${i.stt}`})));
          items = items.filter(i => i.branch_code === topic.letter);
        }
      }
    } else {
      // Bài mới: một phân môn thì gắn phân môn đó; Bài liên môn thì để trống phân môn (trigger cho phép).
      topic = (await client.query(
        `INSERT INTO topics(subject_id,branch_id,grade,chapter,name,order_index,status) VALUES($1,$2,$3,$4,$5,$6,'ACTIVE') RETURNING id,name`,
        [subject.id, letters.length === 1 ? branches.get(letters[0]) ?? null : null, data.grade, lesson.chapter, lesson.name, lesson.lesson_no])).rows[0];
      existing.push({...topic, letter: letters.length === 1 ? letters[0] : null, links: 0});
      createdTopics++;
    }
    for (const item of items) {
      const [yccd] = byText.get(item.branch_code + '|' + norm(item.text));
      const inserted = await client.query(
        `INSERT INTO topic_yccd_map(topic_id,yccd_id,relation_type,status,source_evidence)
         VALUES($1,$2,'core','ACTIVE',$3) ON CONFLICT DO NOTHING RETURNING topic_id`,
        [topic.id, yccd.id, JSON.stringify({
          source: data.source, curriculum: data.curriculum, curriculum_version: version?.version_code || 'LEGACY',
          matched_by: item.matched_by || 'exact', db_label: `${item.branch_code}.${yccd.outcome_ordinal}.${yccd.yccd_ordinal}`,
        })]);
      if (inserted.rowCount) createdLinks++; else existingLinks++;
    }
  }
  return {
    subject: subject.name, grade: data.grade, curriculum_version: version ? {id: version.id, code: version.version_code} : 'LEGACY',
    lessons: plan.filter(p => p.items.length).length, topics_created: createdTopics, topics_reused: reusedTopics,
    links_created: createdLinks, links_already_present: existingLinks, skipped_uncertain: skippedUncertain,
    topic_branch_corrected: branchCorrected, skipped_cross_branch: skippedCrossBranch,
  };
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
