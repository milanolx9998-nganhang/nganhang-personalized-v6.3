// Dựng dữ liệu seed Bài ↔ YCCĐ cho KHTN 6–9 từ tài liệu của trường (chạy trên máy có ổ G, không chạy trên server).
//
//   node scripts/build-khtn-lesson-seed.mjs            → ghi src/db/seed-data/khtn{6..9}-lessons.json + báo cáo rà soát
//
// Nguồn (đường dẫn đổi được bằng biến môi trường):
//   KHDH_DIR     Kế hoạch dạy học 26-27: mỗi tuần có "Tên bài" + "Yêu cầu cần đạt" cho KHTN1/2/3  → ánh xạ Bài ↔ YCCĐ
//   OUTCOME_DIR  4 workbook Outcome/YCCĐ chính thức (CT2018)                                    → nguyên văn + số thứ tự
//   SGK_DIR      Tổng quan SGK KNTT (mục lục)                                                    → chương, tên Bài, trang
//
// Nguyên văn YCCĐ trong seed lấy từ workbook chính thức, tách bằng CHÍNH normalizeSourceRows của bước nạp chương
// trình, nên khớp từng ký tự với dữ liệu trong database. KHDH chỉ dùng để biết YCCĐ nào thuộc Bài nào.
// Không đọc sheet "Thông tin chung" (có tên giáo viên).
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import {normalizeSourceRows} from '../src/services/curriculumMaster/trustedProfiles.js';

const KHDH_DIR = process.env.KHDH_DIR || 'G:/NSHM/26 27/KHDH/4.2.3.2. NB_26-27_KHDH_KHTN';
const OUTCOME_DIR = process.env.OUTCOME_DIR || 'G:/NSHM/26 27/outcome/New folder';
const SGK_DIR = process.env.SGK_DIR || 'G:/NSHM/SGK KHTN/TONG_QUAN_SGK';
const OUT_DIR = path.resolve(process.env.OUT_DIR || 'src/db/seed-data');
const REPORT = path.resolve(process.env.REPORT || '../docs/KHTN_BAI_YCCD_SEED_REVIEW.md');
const FUZZY = Number(process.env.FUZZY || 0.75);
const GRADES = (process.env.GRADES || '6,7,8,9').split(',').map(Number);

// So khớp "lỏng": bỏ dấu, bỏ ký tự không phải chữ/số — chịu được khác biệt "hoá/hóa", dấu câu, gạch đầu dòng.
// Đồng nhất cách viết: "KHTN" = "Khoa học tự nhiên", "lí/lý", "kĩ/kỹ", "mĩ/mỹ".
const loose = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'd')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\bkhtn\b/g, 'khoa hoc tu nhien').replace(/\b([lkms])y\b/g, '$1i')
  .replace(/\b(natri|kali|canxi|magie|metan|etylic|axit|oxi)\b/g, w => CHEM[w]).trim();
// Tên hoá chất: chương trình và KHDH trộn tên Việt hoá cũ với tên IUPAC.
const CHEM = {natri: 'sodium', kali: 'potassium', canxi: 'calcium', magie: 'magnesium', metan: 'methane', etylic: 'ethylic', axit: 'acid', oxi: 'oxygen'};
const words = s => new Set(loose(s).split(' ').filter(w => w.length > 1));
const dice = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const w of a) if (b.has(w)) n++; return 2 * n / (a.size + b.size); };
const lessonNo = s => { const m = /^\s*Bài\s*(\d+)/i.exec(String(s)); return m ? Number(m[1]) : null; };
const cleanName = s => String(s).replace(/\s*\((?:tiết|t)\s*\d+[^)]*\)\s*$/i, '').replace(/\s+/g, ' ').trim();

function readOfficial(grade) {
  const wb = XLSX.read(fs.readFileSync(path.join(OUTCOME_DIR, `Outcome_YCCD_KHTN_${grade}.xlsx`)));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: null});
  // Dòng tên cột có đủ "Môn" và "Yêu cầu cần đạt" (dòng tiêu đề trang cũng chứa chữ "yêu cầu cần đạt").
  const h = rows.findIndex(r => r.some(c => /^\s*môn\s*$/i.test(String(c ?? ''))) && r.some(c => /^\s*yêu cầu cần đạt\s*$/i.test(String(c ?? ''))));
  const col = name => rows[h].findIndex(c => new RegExp(name, 'i').test(String(c ?? '')));
  const [dCol, gCol, tCol, pCol] = [col('^môn'), col('chủ đề'), col('yêu cầu cần đạt'), col('trang')];
  const source = rows.slice(h + 1).filter(r => r[tCol]).map(r => ({domain: r[dCol], group: r[gCol], text: r[tCol], page: r[pCol]}));
  return normalizeSourceRows(source).map(r => ({branch: r.branch_code, outcome: r.outcome_ordinal, stt: r.yccd_ordinal,
    outcome_title: r.outcome_title, text: r.text, loose: loose(r.text), words: words(r.text), flags: r.source_flags}));
}

function readSgk(grade) {
  const file = path.join(SGK_DIR, `TONG_QUAN_SGK_KHTN_${grade}.md`);
  const lessons = new Map();
  if (!fs.existsSync(file)) return lessons;
  let chapter = null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const ch = /^###\s+(.*)$/.exec(line);
    if (ch) { chapter = ch[1].replace(/\s+/g, ' ').trim(); continue; }
    const m = /^-\s+(Bài\s*(\d+)\.\s*(.*?))\s+—\s+trang\s+(\d+)/.exec(line);
    if (m) lessons.set(Number(m[2]), {name: `Bài ${m[2]}. ${m[3].trim()}`, chapter, page: Number(m[4])});
  }
  return lessons;
}

// KHDH: mỗi khối phân môn (KHTN1/2/3) có cột Tên bài + Yêu cầu cần đạt. Ô tên bài liệt kê các tiết (tên lặp lại);
// ô YCCĐ chia nhóm bằng dòng trống, mỗi nhóm ứng với một Bài khác nhau theo đúng thứ tự.
// KHDH khối 6/7 ghi tên bài không kèm số ("Đo chiều dài (Tiết 1)") → tra số Bài theo tên trong mục lục SGK.
function lessonResolver(sgk) {
  const entries = [...sgk.entries()].map(([no, l]) => ({no, key: loose(l.name.replace(/^Bài\s*\d+\.\s*/i, '')), w: words(l.name.replace(/^Bài\s*\d+\.\s*/i, ''))}));
  return name => {
    const no = lessonNo(name);
    if (no) return no;
    const key = loose(name.replace(/^Bài\s*\d+\s*[.:]\s*/i, ''));
    const exact = entries.filter(e => e.key === key);
    if (exact.length === 1) return exact[0].no;
    const w = words(name);
    const scored = entries.map(e => ({no: e.no, s: dice(w, e.w)})).sort((a, b) => b.s - a.s);
    return scored[0]?.s >= 0.75 && (scored[1]?.s ?? 0) < scored[0].s - 0.1 ? scored[0].no : null;
  };
}

// Chia m nhóm (theo thứ tự) cho n Bài (m > n), mỗi Bài ít nhất một nhóm, tối đa tổng độ giống.
function splitGroups(groups, lessonWords) {
  const m = groups.length, n = lessonWords.length;
  const sim = groups.map(g => lessonWords.map(w => dice(words(g.join(' ')), w)));
  const best = Array.from({length: m + 1}, () => Array(n + 1).fill(-Infinity));
  const from = Array.from({length: m + 1}, () => Array(n + 1).fill(null));
  best[0][0] = 0;
  for (let g = 1; g <= m; g++) for (let l = 1; l <= n; l++) {
    // nhóm g-1 thuộc Bài l-1: hoặc tiếp tục Bài l-1, hoặc mở Bài l-1 mới
    for (const prev of [l, l - 1]) {
      const v = best[g - 1][prev] + sim[g - 1][l - 1];
      if (prev >= 0 && v > best[g][l]) { best[g][l] = v; from[g][l] = prev; }
    }
  }
  const plan = Array(m);
  for (let g = m, l = n; g > 0; g--) { plan[g - 1] = l - 1; l = from[g][l]; }
  return plan;
}

let sgkName = () => null;

function readKhdh(grade, resolveLesson) {
  const wb = XLSX.read(fs.readFileSync(path.join(KHDH_DIR, `NB_26-27_KHDH_KHTN_Khối ${grade}.xlsx`)));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.KHDH, {header: 1, defval: null});
  const head = rows.findIndex(r => r.filter(c => /tên bài/i.test(String(c ?? ''))).length);
  const blocks = [];
  rows[head].forEach((c, i) => { if (/tên bài/i.test(String(c ?? ''))) blocks.push({name: i, yccd: rows[head].findIndex((x, j) => j > i && /yêu cầu cần đạt/i.test(String(x ?? '')))}); });
  const out = [], problems = [];
  for (let r = head + 1; r < rows.length; r++) {
    for (const b of blocks) {
      const names = String(rows[r][b.name] ?? '').split(/\r?\n/).map(cleanName).filter(Boolean);
      const distinct = [];
      for (const n of names) { const no = resolveLesson(n); if (no && !distinct.some(d => d.no === no)) distinct.push({no, name: n}); }
      const cell = String(rows[r][b.yccd] ?? '').replace(/\r\n/g, '\n').trim();
      if (!cell || !distinct.length) continue;
      const groups = cell.split(/\n\s*\n/).map(g => {
        const items = [];
        for (const line of g.split('\n').map(l => l.trim()).filter(Boolean)) {
          if (/^[-–•*]\s*/.test(line) || !items.length) items.push(line.replace(/^[-–•*]\s*/, ''));
          else items[items.length - 1] += '\n' + line; // dòng "+" nối tiếp thuộc ý trước
        }
        return items;
      }).filter(g => g.length);
      if (groups.length === distinct.length) distinct.forEach((d, i) => out.push({...d, items: groups[i], row: r + 1}));
      else if (distinct.length === 1) out.push({...distinct[0], items: groups.flat(), row: r + 1});
      else if (groups.length > distinct.length) {
        // Ô gộp nhiều Bài và nhiều nhóm hơn số Bài: chia nhóm theo đúng thứ tự (không đảo), mỗi Bài ≥ 1 nhóm,
        // chọn cách chia có tổng độ giống tên Bài cao nhất. Đánh dấu "grouped" để người xác nhận.
        const lessonWords = distinct.map(d => words((sgkName(d.no) || '') + ' ' + d.name));
        const plan = splitGroups(groups, lessonWords);
        const candidates = distinct.map((d, i) => ({no: d.no, name: d.name, words: lessonWords[i]}));
        distinct.forEach((d, i) => { const items = plan.flatMap((l, g) => l === i ? groups[g] : []); if (items.length) out.push({...d, items, row: r + 1, grouped: true, candidates}); });
        problems.push({row: r + 1, lessons: distinct.map(d => d.no), groups: groups.length, items: groups.flat(), resolved: 'grouped'});
      }
      else problems.push({row: r + 1, lessons: distinct.map(d => d.no), groups: groups.length, items: groups.flat()});
    }
  }
  return {entries: out, problems};
}

function build(grade) {
  const official = readOfficial(grade);
  const sgk = readSgk(grade);
  sgkName = no => sgk.get(no)?.name || null;
  const {entries, problems} = readKhdh(grade, lessonResolver(sgk));
  const byLesson = new Map();
  const unmatched = [];
  const used = new Set();
  const fuzzy = [];
  const match = item => {
    const l = loose(item);
    const exact = official.filter(o => o.loose === l);
    if (exact.length) return {hits: exact, how: 'exact'};
    const contained = official.filter(o => o.loose.length > 25 && (l.includes(o.loose) || o.loose.includes(l) && l.length > 0.7 * o.loose.length));
    if (contained.length) return {hits: contained, how: 'contain'};
    // Dòng KHDH là một đoạn nguyên văn của đúng MỘT YCCĐ (KHDH tách một YCCĐ thành nhiều dòng).
    const partOf = l.length >= 30 ? official.filter(o => o.loose.includes(l)) : [];
    if (partOf.length === 1) return {hits: partOf, how: 'part'};
    const w = words(item);
    const scored = official.map(o => ({o, s: dice(w, o.words)})).sort((a, b) => b.s - a.s);
    if (scored[0]?.s >= FUZZY && (scored[1]?.s ?? 0) < scored[0].s - 0.06) return {hits: [scored[0].o], how: 'fuzzy', score: scored[0].s};
    return {hits: [], how: 'none', best: scored[0]};
  };
  // Một dòng KHDH có thể gộp nhiều YCCĐ bằng dấu ";" → không khớp cả dòng thì thử từng vế.
  const matchLine = item => {
    const whole = match(item);
    if (whole.hits.length || !item.includes(';')) return whole;
    const parts = item.split(';').map(x => x.trim()).filter(x => x.length > 15).map(match);
    const hits = parts.flatMap(p => p.hits);
    return hits.length ? {hits: [...new Set(hits)], how: parts.some(p => p.how === 'fuzzy') ? 'fuzzy' : 'split', score: Math.min(...parts.filter(p => p.score).map(p => p.score), 1)} : whole;
  };
  for (const e of entries) {
    const lesson = byLesson.get(e.no) || {no: e.no, khdh_name: e.name, yccd: new Map()};
    byLesson.set(e.no, lesson);
    for (const item of e.items) {
      const m = matchLine(item);
      if (!m.hits.length) { unmatched.push({lesson: e.no, text: item, best: m.best ? `${m.best.o.branch}.${m.best.o.outcome}.${m.best.o.stt} (${m.best.s.toFixed(2)})` : null}); continue; }
      if (m.how === 'fuzzy') fuzzy.push({lesson: e.no, text: item, official: m.hits[0].text, score: m.score});
      for (const o of m.hits) {
        // Ô KHDH gộp nhiều Bài: gán YCCĐ cho Bài (trong đúng các Bài của ô) có tên gần nó nhất nếu hơn hẳn;
        // không phân định được thì giữ cách chia theo thứ tự nhóm và đánh dấu "grouped" (mặc định không nạp).
        let target = lesson, how = m.how;
        if (e.grouped) {
          // Cách chia theo thứ tự nhóm (e.no) và độ giống tên Bài cùng chỉ một Bài → chắc chắn. Tên Bài khác hơn hẳn
          // (≥ 0.10) → chuyển sang Bài đó. Còn lại giữ cách chia theo thứ tự nhưng đánh dấu chưa chắc.
          const ranked = e.candidates.map(c => ({c, s: dice(o.words, c.words)})).sort((a, b) => b.s - a.s);
          const own = ranked.find(x => x.c.no === e.no)?.s ?? 0;
          if (ranked[0].c.no === e.no && ranked[0].s > 0) how = 'grouped_named';
          else if (ranked[0].s - own >= 0.1) {
            how = 'grouped_named';
            target = byLesson.get(ranked[0].c.no) || {no: ranked[0].c.no, khdh_name: ranked[0].c.name, yccd: new Map()};
            byLesson.set(ranked[0].c.no, target);
          } else how = 'grouped';
        }
        const key = `${o.branch}.${o.outcome}.${o.stt}`;
        if (!target.yccd.has(key)) target.yccd.set(key, {...o, how});
        used.add(o);
      }
    }
  }
  // Nguồn đã được người lập đối chiếu theo từng Bài (ThongKe_YCCD_theo_Bai_SGK_KHTN7 → khtn7-vatli-lessons.json)
  // tốt hơn KHDH cho phần đó: gộp vào, quy nguyên văn về workbook chính thức.
  const curatedFile = path.join(OUT_DIR, `khtn${grade}-vatli-lessons.json`);
  const curatedSrc = fs.existsSync(curatedFile) ? curatedFile : path.resolve('src/db/seed-data', `khtn${grade}-vatli-lessons.json`);
  if (fs.existsSync(curatedSrc)) {
    for (const l of JSON.parse(fs.readFileSync(curatedSrc, 'utf8')).lessons) {
      const lesson = byLesson.get(l.lesson_no) || {no: l.lesson_no, khdh_name: l.name, yccd: new Map()};
      byLesson.set(l.lesson_no, lesson);
      for (const y of l.yccd) {
        const m = match(y.text);
        if (m.hits.length !== 1) { unmatched.push({lesson: l.lesson_no, text: '[ThongKe] ' + y.text, best: null}); continue; }
        const o = m.hits[0], key = `${o.branch}.${o.outcome}.${o.stt}`;
        lesson.yccd.set(key, {...o, how: 'curated'});
        used.add(o);
      }
    }
  }
  const lessons = [...byLesson.values()].sort((a, b) => a.no - b.no).map(l => {
    const yccd = [...l.yccd.values()].sort((a, b) => a.branch.localeCompare(b.branch) || a.outcome - b.outcome || a.stt - b.stt);
    const counts = {};
    for (const y of yccd) counts[y.branch] = (counts[y.branch] || 0) + 1;
    const branch = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const s = sgk.get(l.no);
    return {lesson_no: l.no, chapter: s?.chapter || null, name: s?.name || cleanName(l.khdh_name), sgk_page: s?.page || null,
      branch_code: branch, yccd: yccd.map(y => ({branch_code: y.branch, outcome: y.outcome, stt: y.stt, matched_by: y.how, text: y.text}))};
  });
  const notLinked = official.filter(o => !used.has(o));
  const data = {
    source: `KHDH 26-27 (NB_26-27_KHDH_KHTN_Khối ${grade}.xlsx) + Outcome_YCCD_KHTN_${grade}.xlsx + Tổng quan SGK KNTT`,
    curriculum: 'Chương trình GDPT 2018 môn Khoa học tự nhiên — TT 32/2018/TT-BGDĐT',
    subject_code: 'KHTN', grade,
    note: 'Nguyên văn YCCĐ lấy từ workbook chính thức (tách bằng normalizeSourceRows). Bài ↔ YCCĐ theo KHDH của trường; đối chiếu với database bằng nguyên văn, không bằng số.',
    lessons: lessons.filter(l => l.yccd.length),
  };
  return {data, stats: {grade, official: official.length, linked: used.size, not_linked: notLinked.length, lessons: data.lessons.length,
    sgk_lessons: sgk.size, khdh_entries: entries.length, unmatched: unmatched.length, fuzzy: fuzzy.length, khdh_problems: problems.length},
    notLinked, unmatched, fuzzy, problems, sgk, lessonsWithout: [...sgk.keys()].filter(n => !data.lessons.some(l => l.lesson_no === n))};
}

const report = ['# Rà soát seed Bài ↔ YCCĐ KHTN 6–9', '', `Sinh tự động bởi \`backend/scripts/build-khtn-lesson-seed.mjs\` lúc ${new Date().toISOString()}.`,
  'Nguồn: KHDH 26-27 của trường (Tên bài ↔ Yêu cầu cần đạt), workbook Outcome/YCCĐ chính thức, mục lục SGK KNTT.', ''];
const summary = [];
for (const grade of GRADES) {
  const r = build(grade);
  fs.writeFileSync(path.join(OUT_DIR, `khtn${grade}-lessons.json`), JSON.stringify(r.data, null, 1) + '\n');
  summary.push(r.stats);
  report.push(`## Khối ${grade}`, '', '```text', JSON.stringify(r.stats), '```', '');
  if (r.notLinked.length) {
    report.push(`### YCCĐ chính thức chưa gắn Bài nào (${r.notLinked.length})`, '');
    for (const o of r.notLinked) report.push(`- ${o.branch}.${o.outcome}.${o.stt} — ${o.text.replace(/\n/g, ' ').slice(0, 160)}`);
    report.push('');
  }
  if (r.unmatched.length) {
    report.push(`### Dòng YCCĐ trong KHDH không khớp nguyên văn chính thức (${r.unmatched.length})`, '');
    for (const u of r.unmatched) report.push(`- Bài ${u.lesson}: ${u.text.replace(/\n/g, ' ').slice(0, 160)}${u.best ? ` _(gần nhất ${u.best})_` : ''}`);
    report.push('');
  }
  if (r.fuzzy.length) {
    report.push(`### Khớp gần đúng — cần người xác nhận (${r.fuzzy.length})`, '');
    for (const f of r.fuzzy) report.push(`- Bài ${f.lesson} (${f.score.toFixed(2)}): KHDH “${f.text.replace(/\n/g, ' ').slice(0, 110)}” ↔ CT “${f.official.replace(/\n/g, ' ').slice(0, 110)}”`);
    report.push('');
  }
  if (r.problems.length) {
    report.push(`### Ô KHDH không tách được nhóm theo Bài (${r.problems.length})`, '');
    for (const p of r.problems) report.push(`- Dòng ${p.row}: Bài ${p.lessons.join(', ')} nhưng có ${p.groups} nhóm YCCĐ`);
    report.push('');
  }
  const uncertain = r.data.lessons.flatMap(l => l.yccd.filter(y => y.matched_by === 'grouped').map(y => ({l, y})));
  if (uncertain.length) {
    report.push(`### Ô KHDH gộp nhiều Bài — chưa chắc Bài nào, mặc định KHÔNG nạp (${uncertain.length})`, '');
    for (const {l, y} of uncertain) report.push(`- ${l.name} ← ${y.branch_code}.${y.outcome}.${y.stt} — ${y.text.replace(/\n/g, ' ').slice(0, 140)}`);
    report.push('');
  }
  if (r.lessonsWithout.length) report.push(`### Bài trong SGK chưa có YCCĐ trong seed: ${r.lessonsWithout.join(', ')}`, '');
}
// Không để khoảng trắng cuối dòng (câu bị cắt ngắn) hay dòng trống thừa cuối tệp — git diff --check phải sạch.
fs.writeFileSync(REPORT, report.map(line => line.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '') + '\n');
console.table(summary);
console.log('Báo cáo:', REPORT);
