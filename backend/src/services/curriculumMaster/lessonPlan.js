// Kế hoạch Bài học của MỘT phiên bản chương trình (V6.6.7.3): danh sách Bài + mã YCCĐ của từng Bài, lưu ở
// curriculum_versions.lesson_plan khi nạp file mẫu / sửa trên web, và được áp dụng lúc công bố.
//
// - Bài không phiên bản hoá: tìm theo số Bài trong môn + khối ("Bài 2: …"); đổi tên / chương / thứ tự nếu khác.
//   Bài không có trong kế hoạch được giữ nguyên (không tự lưu trữ).
// - Liên kết của phiên bản cũ giữ nguyên làm lịch sử; chỉ thêm liên kết tới YCCĐ của phiên bản đang công bố.
// - Liên kết khác phân môn với Bài (trigger v643 chặn) bị bỏ qua và báo lại, không làm hỏng cả lần công bố.
import {fail} from '../practice/config.js';

// Mã phân môn trong bảng branches (VL/HH/SH) ↔ chữ dùng trong mã câu và nhãn (L/H/S). Môn khác dùng nguyên mã.
const LETTER = {VL: 'L', HH: 'H', SH: 'S'};
export const letterOf = code => LETTER[code] || code || '';
export const lessonNumber = name => { const m = /^\s*Bài\s*(\d+)/i.exec(String(name ?? '')); return m ? Number(m[1]) : null; };
export const lessonTitle = name => String(name ?? '').replace(/^\s*Bài\s*\d+\s*[:.\-–]?\s*/i, '').trim();
export const fullLessonName = (number, name) => `Bài ${number}: ${lessonTitle(name)}`;
// Nhãn YCCĐ theo nguồn: "L.2.1" (phân môn L của KHTN) hoặc "T.2.1" (chữ viết tắt của môn Toán); "2.1" chỉ còn ở môn chưa có chữ.
export const yccdLabelOf = (branch, topic, yccd) => (branch ? branch + '.' : '') + topic + '.' + yccd;
// Môn không chia phân môn: chữ đầu nhãn là chữ viết tắt của môn. Dữ liệu cũ chưa ghi chữ này ở Chủ đề thì lấy từ môn (V6.6.7.4).
const subjectLetterSql = o => `(SELECT s.code_letter FROM subjects s WHERE s.id=${o}.subject_id AND NOT EXISTS(SELECT 1 FROM branches b WHERE b.subject_id=s.id))`;

// Nhãn → YCCĐ của một phiên bản. YCCĐ chưa có số nguồn (dữ liệu cũ) dùng thứ tự trong Chủ đề.
export async function versionLabels(c, versionId) {
  const rows = (await c.query(`SELECT y.id, y.source_ordinal AS y_ord, o.id AS outcome_id, o.source_ordinal AS o_ord,
      COALESCE(NULLIF(o.source_branch_code,''),${subjectLetterSql('o')},'') AS branch, o.order_index AS o_order, y.order_index AS y_order
    FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id
    WHERE y.curriculum_version_id=$1 AND y.status<>'RETIRED' AND o.status<>'RETIRED'
    ORDER BY o.order_index, o.id, y.order_index, y.id`, [versionId])).rows;
  const labels = new Map(), outcomeSeq = new Map(), yccdSeq = new Map();
  for (const r of rows) {
    if (!outcomeSeq.has(r.outcome_id)) outcomeSeq.set(r.outcome_id, outcomeSeq.size + 1);
    yccdSeq.set(r.outcome_id, (yccdSeq.get(r.outcome_id) || 0) + 1);
    labels.set(yccdLabelOf(r.branch, r.o_ord ?? outcomeSeq.get(r.outcome_id), r.y_ord ?? yccdSeq.get(r.outcome_id)), {id: r.id, branch: r.branch});
  }
  return labels;
}

// Nội dung Chủ đề/YCCĐ của một phiên bản (hoặc dữ liệu cũ chưa gắn phiên bản khi versionId = null), nhóm theo Chủ đề.
// Số Chủ đề / số YCCĐ lấy theo nguồn; dữ liệu thiếu số dùng thứ tự.
export async function versionContent(c, {versionId, subjectId, grade}) {
  const where = versionId ? 'o.curriculum_version_id=$1' : "o.curriculum_version_id IS NULL AND o.subject_id=$1 AND o.grade=$2 AND o.status='ACTIVE'";
  const params = versionId ? [versionId] : [subjectId, grade];
  const os = (await c.query(`SELECT o.*, ${subjectLetterSql('o')} AS subject_letter FROM curriculum_outcomes o WHERE ${where} AND o.status<>'RETIRED' ORDER BY o.order_index,o.id`, params)).rows;
  const ys = (await c.query(`SELECT y.* FROM curriculum_yccds y JOIN curriculum_outcomes o ON o.id=y.outcome_id WHERE ${where} AND o.status<>'RETIRED' AND y.status<>'RETIRED' ORDER BY y.order_index,y.id`, params)).rows;
  const outcomes = os.map((o, i) => ({id: o.id, lineage_id: o.lineage_id, branch: o.source_branch_code || letterOf(o.domain_code) || o.subject_letter || '', number: o.source_ordinal ?? i + 1, title: o.title, row: o, yccds: []}));
  const byId = new Map(outcomes.map(o => [o.id, o]));
  for (const y of ys) {
    const o = byId.get(y.outcome_id);
    if (o) o.yccds.push({id: y.id, lineage_id: y.lineage_id, number: y.source_ordinal ?? o.yccds.length + 1, text: y.text, page: y.source_page || y.source_locator || '', row: y});
  }
  return outcomes;
}

// Bài hiện có của môn + khối kèm mã YCCĐ (chỉ liên kết ACTIVE tới YCCĐ trong `outcomes`), dạng kế hoạch Bài.
export async function currentLessons(c, subjectId, grade, outcomes) {
  const labelById = new Map();
  for (const o of outcomes) for (const y of o.yccds) labelById.set(y.id, yccdLabelOf(o.branch, o.number, y.number));
  const topics = (await c.query(`SELECT t.id,t.name,t.chapter,t.order_index,b.code AS bcode FROM topics t LEFT JOIN branches b ON b.id=t.branch_id
    WHERE t.subject_id=$1 AND t.grade=$2 AND t.status='ACTIVE' ORDER BY t.order_index,t.id`, [subjectId, grade])).rows;
  const links = topics.length ? (await c.query("SELECT topic_id,yccd_id FROM topic_yccd_map WHERE status='ACTIVE' AND topic_id=ANY($1::int[]) ORDER BY topic_id,yccd_id", [topics.map(t => t.id)])).rows : [];
  return topics.map(t => ({
    number: lessonNumber(t.name) ?? t.order_index, name: lessonTitle(t.name), chapter: t.chapter || '', branch: letterOf(t.bcode),
    codes: links.filter(l => l.topic_id === t.id && labelById.has(l.yccd_id)).map(l => labelById.get(l.yccd_id)),
  })).sort((a, b) => a.number - b.number);
}

// Khung năng lực đang dùng của môn + khối (bản công bố mới nhất): các thành phần và quy tắc mặc định theo mức nhận thức.
export async function frameworkOf(c, subjectId, grade) {
  const f = (await c.query("SELECT id,title,level_rule FROM competency_frameworks WHERE subject_id=$1 AND grade_from<=$2 AND grade_to>=$2 AND status='PUBLISHED' ORDER BY published_at DESC,id DESC LIMIT 1", [subjectId, grade])).rows[0];
  if (!f) return null;
  f.axes = (await c.query("SELECT id,code,name,allowed_evidence,framework_id FROM competency_axes WHERE framework_id=$1 AND status='ACTIVE' ORDER BY order_index,id", [f.id])).rows;
  return f;
}

// Năng lực đang gắn cho từng YCCĐ của môn + khối (bản gắn mới nhất): yccd id → {mã thành phần, entries}.
export async function yccdAbilities(c, subjectId, grade) {
  const rows = (await c.query("SELECT DISTINCT ON(target_id) id,target_id,entries FROM competency_mapping_versions WHERE subject_id=$1 AND grade=$2 AND target_type='yccd' ORDER BY target_id,id DESC", [subjectId, grade])).rows;
  return new Map(rows.map(r => [Number(r.target_id), {mapping_id: Number(r.id), entries: r.entries || [], codes: (r.entries || []).map(e => e.code).filter(Boolean)}]));
}

// Cột "Năng lực" của file mẫu (lesson_plan.competencies: nhãn YCCĐ → mã thành phần) thành bản gắn năng lực cho YCCĐ của phiên bản
// vừa công bố, chia đều trọng số. YCCĐ của phiên bản mới là dòng mới nên luôn ghi bản gắn mới; bản cũ giữ làm lịch sử.
export async function applyCompetencyPlan(c, v, actor) {
  const plan = Object.entries(v.lesson_plan?.competencies || {}).filter(([, codes]) => codes?.length);
  if (!plan.length) return null;
  const labels = await versionLabels(c, v.id), axes = (await frameworkOf(c, v.subject_id, v.grade))?.axes || [], out = {mapped: 0, skipped: []};
  for (const [label, codes] of plan) {
    const y = labels.get(label), picked = codes.map(code => axes.find(a => a.code === code));
    if (!y) { out.skipped.push({code: label, reason: 'Không có YCCĐ này trong phiên bản'}); continue; }
    if (picked.some(a => !a)) { out.skipped.push({code: label, reason: 'Năng lực không còn trong khung đang dùng: ' + codes.join('; ')}); continue; }
    const entries = picked.map(a => ({axis_id: a.id, weight: 1 / picked.length, allowed_evidence: a.allowed_evidence, framework_id: a.framework_id, code: a.code, name: a.name}));
    await c.query("INSERT INTO competency_mapping_versions(subject_id,grade,target_type,target_id,entries,reason,created_by) VALUES($1,$2,'yccd',$3,$4,$5,$6)",
      [v.subject_id, v.grade, String(y.id), JSON.stringify(entries), 'Theo cột Năng lực của file mẫu chương trình ' + v.version_code, actor.id]);
    out.mapped++;
  }
  return out;
}

export async function applyLessonPlan(c, v) {
  const plan = v.lesson_plan?.lessons || [];
  if (!plan.length) return null;
  const branchId = new Map();
  for (const b of (await c.query('SELECT id,code FROM branches WHERE subject_id=$1 ORDER BY id', [v.subject_id])).rows)
    if (!branchId.has(letterOf(b.code))) branchId.set(letterOf(b.code), b.id);
  const labels = await versionLabels(c, v.id);
  const topics = (await c.query(`SELECT t.id,t.name,t.chapter,t.order_index,b.code AS bcode,
      (SELECT count(*)::int FROM topic_yccd_map m WHERE m.topic_id=t.id AND m.status='ACTIVE') AS links
    FROM topics t LEFT JOIN branches b ON b.id=t.branch_id WHERE t.subject_id=$1 AND t.grade=$2 AND t.status='ACTIVE' ORDER BY t.id`,
  [v.subject_id, v.grade])).rows;
  const byNumber = new Map(), byTitle = new Map(), key = s => String(s ?? '').normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();
  for (const t of topics) { const n = lessonNumber(t.name); if (n != null) byNumber.set(n, [...(byNumber.get(n) || []), t]); else if (!byTitle.has(key(t.name))) byTitle.set(key(t.name), t); }
  const out = {topics_created: 0, topics_updated: 0, links_created: 0, links_existing: 0, skipped: []};
  for (const l of plan) {
    const same = byNumber.get(l.number) || (byTitle.has(key(l.name)) ? [byTitle.get(key(l.name))] : []);
    if (same.length > 1) fail(`Môn/khối đang có ${same.length} Bài số ${l.number}; lưu trữ bớt Bài trùng số trước khi công bố`, 409, {topic_ids: same.map(t => t.id)});
    const name = fullLessonName(l.number, l.name), want = l.branch || '';
    let t = same[0];
    if (!t) {
      t = (await c.query("INSERT INTO topics(subject_id,branch_id,grade,chapter,name,order_index,status) VALUES($1,$2,$3,$4,$5,$6,'ACTIVE') RETURNING id",
        [v.subject_id, want ? branchId.get(want) ?? null : null, v.grade, l.chapter || null, name, l.number])).rows[0];
      t.letter = want;
      out.topics_created++;
    } else {
      t.letter = letterOf(t.bcode);
      if (t.name !== name || (t.chapter || '') !== (l.chapter || '') || t.order_index !== l.number) {
        await c.query('UPDATE topics SET name=$2,chapter=$3,order_index=$4,updated_at=now() WHERE id=$1', [t.id, name, l.chapter || null, l.number]);
        out.topics_updated++;
      }
      // Bài chưa có liên kết nào mà phân môn khác kế hoạch → sửa theo kế hoạch (trigger v643 bắt cùng phân môn).
      if (want && t.letter !== want && !t.links && branchId.has(want)) { await c.query('UPDATE topics SET branch_id=$2 WHERE id=$1', [t.id, branchId.get(want)]); t.letter = want; }
    }
    for (const code of l.codes || []) {
      const y = labels.get(code);
      if (!y) { out.skipped.push({lesson: l.number, code, reason: 'Không có YCCĐ này trong phiên bản'}); continue; }
      if (t.letter && y.branch && t.letter !== y.branch) { out.skipped.push({lesson: l.number, code, reason: 'Khác phân môn với Bài'}); continue; }
      const r = await c.query("INSERT INTO topic_yccd_map(topic_id,yccd_id,relation_type,status,source_evidence) VALUES($1,$2,'core','ACTIVE',$3) ON CONFLICT DO NOTHING RETURNING topic_id",
        [t.id, y.id, JSON.stringify({source: 'curriculum_template', curriculum_version: v.version_code, label: code})]);
      if (r.rowCount) out.links_created++; else out.links_existing++;
    }
  }
  return out;
}
