// Bản đồ bài học (V6.8): Chương → Bài của một môn + khối.
//   lessonCoverage — giáo viên: mỗi Bài có bao nhiêu câu đã duyệt theo mức, học sinh tự luyện được bao nhiêu.
//   lessonMap      — học sinh: tiến độ từng Bài (sao), "em đang ở đây", tối đa 3 Bài đang vướng, chuỗi ngày học, huy hiệu.
//   startLessons   — "Luyện ngay" một chạm cho một hoặc nhiều Bài: tự chọn số câu và tỉ lệ mức khớp với số câu đang có.
// Số câu "luyện được" đếm bằng đúng điều kiện bốc câu (attempts.js: USABLE_*). Sao và huy hiệu tính lại mỗi lần đọc từ
// mastery_states / attempts, không lưu riêng — không có gì để lệch với dữ liệu gốc.
import {z} from 'zod';
import {pool} from '../../db/pool.js';
import {fail,settings} from './config.js';
import {subjectAccess} from './authorization.js';
import {candidates,createAttempt,USABLE_FROM,USABLE_WHERE,USABLE_LESSON,studentBanks} from './attempts.js';
import {answered} from './portfolio.js';
import {fitPercent} from './selection.js';
import {letterOf,lessonNumber,lessonTitle} from '../curriculumMaster/lessonPlan.js';

const AUTO_TYPES = ['multiple_choice', 'true_false', 'short_answer', 'matching'];   // tự luận không tự chấm nên không vào lượt luyện nhanh
const LESSON_COUNT = 10;            // số câu một lượt "Luyện ngay"; Bài có ít câu hơn thì luyện hết số câu đang có
const LESSON_MIN = 5;               // sàn riêng của lượt luyện nhanh theo Bài: kho mỏng vẫn luyện được từng Bài (tự chọn bài luyện giữ practice_min_questions)
const floorOf = cfg => Math.min(cfg.practice_min_questions, LESSON_MIN);
const COUNT_CHOICES = [10, 15, 20]; // khi tự tạo đề từ nhiều Bài
const FOCUS_BELOW = 70;             // cùng ngưỡng "nên củng cố" của hồ sơ (portfolioRules.learningSignals)
const BASE_PERCENT = [50, 50, 0, 0]; // luyện lại phần nền tảng: nhận biết + thông hiểu
const TZ = 'Asia/Ho_Chi_Minh';
const scope = z.object({subject_id: z.coerce.number().int().positive(), grade: z.coerce.number().int().min(1).max(12)});
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// ---------- Hàm thuần (có test đơn vị) ----------
const weighted = list => { const w = list.reduce((s, x) => s + x.effective_question_count, 0); return w ? list.reduce((s, x) => s + x.mastery_score * x.effective_question_count, 0) / w : null; };
const attemptsOf = list => new Set(list.flatMap(l => (l.history || []).map(h => h.attempt_id))).size;
const round = v => v == null ? null : Math.round(v);

// Tiến độ một Bài từ các trạng thái thành thạo theo mức. Sao: 1 = đã luyện; 2 = điểm thành thạo từ 70; 3 = từ ngưỡng thành
// thạo qua ít nhất 2 lượt. Nền tảng (NB, TH) và thử thách (VD, VDC) tính riêng: sai câu khó không kéo điểm nền tảng.
export function lessonProgress(levels, threshold) {
  if (!levels?.length) return {status: 'new', stars: 0, mastery: null, base: null, challenge: null, attempts: 0, seen: 0, last_at: null, low_data: false, stuck: false};
  const base = levels.filter(l => Number(l.cognitive_level) <= 2), mastery = weighted(levels), attempts = attemptsOf(levels);
  const stars = mastery >= threshold && attempts >= 2 ? 3 : mastery >= FOCUS_BELOW ? 2 : 1;
  const baseScore = weighted(base), times = levels.flatMap(l => (l.history || []).map(h => h.at)).filter(Boolean).map(t => new Date(t).getTime());
  return {
    status: stars === 3 ? 'done' : 'practicing', stars, mastery: round(mastery), base: round(baseScore), challenge: round(weighted(levels.filter(l => Number(l.cognitive_level) >= 3))),
    attempts, seen: levels.reduce((s, l) => s + (l.unique_question_count || 0), 0), last_at: times.length ? new Date(Math.max(...times)).toISOString() : null,
    low_data: levels.every(l => l.confidence === 'LOW'),
    // Đang vướng: đã luyện từ 2 lượt mà điểm nền tảng (không có thì điểm chung) vẫn dưới 70.
    stuck: (base.length ? attemptsOf(base) : attempts) >= 2 && (baseScore ?? mastery) < FOCUS_BELOW,
  };
}

// Chuỗi ngày học liên tiếp. days: các ngày 'YYYY-MM-DD' (giờ Việt Nam) có lượt hoàn thành; chuỗi hiện tại tính tới hôm nay,
// hôm nay chưa học thì tính tới hôm qua (chưa đứt cho tới hết ngày).
export function streakOf(days, today) {
  const set = new Set(days), prev = d => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };
  let current = 0, d = set.has(today) ? today : prev(today);
  while (set.has(d)) { current++; d = prev(d); }
  let best = 0, run = 0, last = null;
  for (const x of [...set].sort()) { run = last && prev(x) === last ? run + 1 : 1; best = Math.max(best, run); last = x; }
  return {current, best, today_done: set.has(today)};
}

export function badgesOf({completed, answered: answeredCount, retries, streak, chapters}) {
  const lessons = chapters.flatMap(c => c.lessons), cap = (n, max) => `${Math.min(n, max)}/${max}`;
  return [
    {id: 'first', name: 'Khởi động', hint: 'Hoàn thành lượt luyện đầu tiên', earned: completed >= 1},
    {id: 'streak3', name: 'Ba ngày liền', hint: 'Luyện 3 ngày liên tiếp', earned: streak.best >= 3, progress: cap(streak.best, 3)},
    {id: 'streak7', name: 'Bền bỉ', hint: 'Luyện 7 ngày liên tiếp', earned: streak.best >= 7, progress: cap(streak.best, 7)},
    {id: 'hundred', name: 'Trăm câu', hint: 'Trả lời 100 câu', earned: answeredCount >= 100, progress: cap(answeredCount, 100)},
    {id: 'fix', name: 'Sửa sai', hint: 'Luyện lại các câu sai của một lượt', earned: retries >= 1},
    {id: 'star3', name: 'Ba sao đầu tiên', hint: 'Một Bài đạt 3 sao', earned: lessons.some(l => l.progress.stars === 3)},
    {id: 'chapter', name: 'Trọn một chương', hint: 'Mọi Bài luyện được của một chương đạt từ 2 sao',
      earned: chapters.some(c => { const open = c.lessons.filter(l => l.can_practice); return open.length > 0 && open.every(l => l.progress.stars >= 2); })},
    {id: 'challenge', name: 'Vượt thử thách', hint: 'Đạt từ 70 điểm ở câu vận dụng của một Bài', earned: lessons.some(l => l.progress.challenge != null && l.progress.challenge >= FOCUS_BELOW)},
  ];
}

// ---------- Đọc dữ liệu ----------
async function practiceTypes(c, subjectId) {
  const allowed = (await c.query('SELECT config FROM subject_profiles WHERE subject_id=$1', [subjectId])).rows[0]?.config?.allowed_types;
  const types = (Array.isArray(allowed) ? allowed : AUTO_TYPES).filter(t => AUTO_TYPES.includes(t));
  return types.length ? types : AUTO_TYPES;
}

async function lessonsOf(c, subjectId, grade) {
  return (await c.query(`SELECT t.id,t.name,t.chapter,b.code AS branch_code FROM topics t LEFT JOIN branches b ON b.id=t.branch_id
    WHERE t.subject_id=$1 AND t.grade=$2 AND t.status='ACTIVE' ORDER BY t.order_index,t.id`, [subjectId, grade])).rows;
}

// Số câu dùng được theo Bài × mức × (kho trường hay không). student: chỉ đếm kho học sinh đó tự luyện được.
async function usableByLesson(c, {subjectId, grade, types, student = null}) {
  const params = [subjectId, grade, types];
  if (student) params.push(student.department_id || null, student.id);
  return (await c.query(`SELECT q.topic_id,right(q.cognitive_level::text,1)::int AS level,(b.kind='school') AS school,count(DISTINCT v.question_id)::int AS n
    ${USABLE_FROM} LEFT JOIN topics t ON t.id=q.topic_id
    WHERE ${USABLE_WHERE} AND q.subject_id=$1 AND q.grade=$2 AND ${USABLE_LESSON} AND v.question_type::text=ANY($3::text[])${student ? ` AND (${studentBanks(4, 5)})` : ''}
    GROUP BY 1,2,3`, params)).rows.filter(r => r.level >= 1 && r.level <= 4);
}
const tally = (rows, pick = () => true) => {
  const byLesson = new Map();
  for (const r of rows) if (pick(r)) { const levels = byLesson.get(r.topic_id) || [0, 0, 0, 0]; levels[r.level - 1] += r.n; byLesson.set(r.topic_id, levels); }
  return byLesson;
};
const sum = levels => levels.reduce((a, b) => a + b, 0);
const display = t => ({id: t.id, name: t.name, number: lessonNumber(t.name), title: lessonTitle(t.name) || t.name, branch: letterOf(t.branch_code)});
function byChapter(lessons) {
  const chapters = new Map();
  for (const l of lessons) { const name = l.chapter || 'Chưa xếp chương'; if (!chapters.has(name)) chapters.set(name, {name, lessons: []}); chapters.get(name).lessons.push(l); }
  return [...chapters.values()];
}

// ---------- Giáo viên: độ phủ câu hỏi theo Bài ----------
export async function lessonCoverage(user, raw) {
  if (user.role === 'student') fail('Không đủ quyền', 403);
  const d = scope.parse(raw);
  await subjectAccess(user, d.subject_id, d.grade);
  const cfg = await settings(), types = await practiceTypes(pool, d.subject_id), topics = await lessonsOf(pool, d.subject_id, d.grade);
  const rows = await usableByLesson(pool, {subjectId: d.subject_id, grade: d.grade, types});
  const school = tally(rows, r => r.school), other = tally(rows, r => !r.school);
  const waiting = new Map((await pool.query(`SELECT q.topic_id,count(*) FILTER(WHERE v.review_status='PENDING_REVIEW')::int AS pending,count(*) FILTER(WHERE v.review_status='DRAFT')::int AS draft
    FROM questions q JOIN question_versions v ON v.id=q.current_version_id
    WHERE q.subject_id=$1 AND q.grade=$2 AND q.lifecycle<>'archived' AND q.topic_id IS NOT NULL GROUP BY 1`, [d.subject_id, d.grade])).rows.map(r => [r.topic_id, r]));
  const unassigned = (await pool.query(`SELECT count(*)::int AS n ${USABLE_FROM} WHERE ${USABLE_WHERE} AND q.subject_id=$1 AND q.grade=$2 AND q.topic_id IS NULL`, [d.subject_id, d.grade])).rows[0].n;
  const min = floorOf(cfg);
  const lessons = topics.map(t => {
    const levels = school.get(t.id) || [0, 0, 0, 0], total = sum(levels);
    return {...display(t), chapter: t.chapter || '', levels, total, other: sum(other.get(t.id) || [0, 0, 0, 0]), pending: waiting.get(t.id)?.pending || 0, draft: waiting.get(t.id)?.draft || 0,
      ready: total >= min, missing: Math.max(0, min - total)};
  });
  return {
    min_questions: min, types, chapters: byChapter(lessons),
    summary: {lessons: lessons.length, ready: lessons.filter(l => l.ready).length, empty: lessons.filter(l => !l.total).length,
      questions: lessons.reduce((n, l) => n + l.total, 0), other: lessons.reduce((n, l) => n + l.other, 0), pending: lessons.reduce((n, l) => n + l.pending, 0), unassigned},
  };
}

// ---------- Học sinh: bản đồ bài học ----------
async function currentGrade(c, studentId) {
  return (await c.query(`SELECT c.grade FROM class_memberships m JOIN classes c ON c.id=m.class_id
    WHERE m.student_id=$1 AND m.ended_at IS NULL AND m.valid_from<=CURRENT_DATE AND (m.valid_to IS NULL OR m.valid_to>=CURRENT_DATE)
    ORDER BY m.valid_from DESC,m.id DESC LIMIT 1`, [studentId])).rows[0]?.grade ?? null;
}

export async function lessonMap(user, raw) {
  if (user.role !== 'student') fail('Trang dành cho học sinh', 403);
  const requested = z.object({subject_id: z.coerce.number().int().positive().optional()}).parse(raw || {}).subject_id;
  const cfg = await settings(), grade = await currentGrade(pool, user.id);
  if (!grade) return {grade: null, subjects: [], subject: null, chapters: []};
  const subjects = (await pool.query(`SELECT s.id,s.name,count(*)::int AS lessons FROM topics t JOIN subjects s ON s.id=t.subject_id
    WHERE t.grade=$1 AND t.status='ACTIVE' GROUP BY s.id,s.name ORDER BY s.name`, [grade])).rows;
  if (!subjects.length) return {grade, subjects: [], subject: null, chapters: []};
  // Môn mặc định: môn được chọn → môn của lượt luyện gần nhất → môn có nhiều câu luyện được nhất.
  const has = id => subjects.some(s => s.id === id);
  let subjectId = has(requested) ? requested : null;
  if (!subjectId) {
    const last = (await pool.query("SELECT (config->>'subject_id')::int AS id FROM attempts WHERE student_id=$1 ORDER BY started_at DESC LIMIT 1", [user.id])).rows[0]?.id;
    if (has(last)) subjectId = last;
  }
  if (!subjectId) {
    const rich = (await pool.query(`SELECT q.subject_id,count(*)::int AS n ${USABLE_FROM} LEFT JOIN topics t ON t.id=q.topic_id
      WHERE ${USABLE_WHERE} AND q.grade=$1 AND ${USABLE_LESSON} AND (${studentBanks(2, 3)}) GROUP BY 1 ORDER BY n DESC`, [grade, user.department_id || null, user.id])).rows.find(r => has(r.subject_id));
    subjectId = rich?.subject_id ?? subjects[0].id;
  }
  const types = await practiceTypes(pool, subjectId), topics = await lessonsOf(pool, subjectId, grade);
  const usable = tally(await usableByLesson(pool, {subjectId, grade, types, student: user}));
  const states = (await pool.query('SELECT m.state FROM mastery_states m JOIN topics t ON t.id=m.topic_id WHERE m.student_id=$1 AND t.subject_id=$2 AND t.grade=$3', [user.id, subjectId, grade])).rows.map(r => r.state);
  const min = floorOf(cfg), lessonCount = clamp(LESSON_COUNT, min, cfg.practice_max_questions);
  const lessons = topics.map(t => {
    const levels = usable.get(t.id) || [0, 0, 0, 0], total = sum(levels);
    return {...display(t), chapter: t.chapter || '', questions: {total, levels}, can_practice: total >= min, missing: Math.max(0, min - total),
      progress: lessonProgress(states.filter(s => s.topic_id === t.id), cfg.mastery_threshold)};
  });
  const open = lessons.filter(l => l.can_practice), started = open.filter(l => l.progress.status !== 'new'), chapters = byChapter(lessons);
  // "Em đang ở đây": Bài luyện gần nhất nếu chưa đạt; không thì Bài luyện được kế tiếp chưa đạt.
  const latest = [...started].sort((a, b) => new Date(b.progress.last_at) - new Date(a.progress.last_at))[0];
  const after = latest ? open.slice(open.indexOf(latest) + 1) : open;
  const current = latest && latest.progress.status !== 'done' ? latest : after.find(l => l.progress.status !== 'done') || open.find(l => l.progress.status !== 'done') || null;
  const focus = open.filter(l => l.progress.stuck).sort((a, b) => (a.progress.base ?? a.progress.mastery) - (b.progress.base ?? b.progress.mastery)).slice(0, 3)
    .map(l => ({lesson_id: l.id, name: l.name, score: l.progress.base ?? l.progress.mastery, attempts: l.progress.attempts, target: FOCUS_BELOW, base_questions: l.questions.levels[0] + l.questions.levels[1]}));

  const activity = (await pool.query(`SELECT count(*) FILTER(WHERE status='completed')::int AS completed,count(*) FILTER(WHERE status='completed' AND source='retry')::int AS retries,
      COALESCE(array_agg(DISTINCT (completed_at AT TIME ZONE '${TZ}')::date::text) FILTER(WHERE status='completed'),'{}') AS days,(now() AT TIME ZONE '${TZ}')::date::text AS today
    FROM attempts WHERE student_id=$1`, [user.id])).rows[0];
  const answeredCount = (await pool.query(`SELECT count(*) FILTER(WHERE ${answered})::int AS n FROM attempt_items i JOIN attempts a ON a.id=i.attempt_id WHERE a.student_id=$1 AND a.status='completed'`, [user.id])).rows[0].n;
  const streak = streakOf(activity.days, activity.today);
  return {
    grade, subjects, subject: subjects.find(s => s.id === subjectId), chapters, current_lesson_id: current?.id ?? null, focus,
    rules: {min_questions: min, lesson_count: lessonCount, counts: COUNT_CHOICES.filter(n => n >= min && n <= cfg.practice_max_questions), threshold: cfg.mastery_threshold, focus_below: FOCUS_BELOW},
    summary: {lessons: lessons.length, practicable: open.length, started: started.length, done: open.filter(l => l.progress.status === 'done').length, locked: lessons.length - open.length},
    motivation: {streak, stars: {earned: open.reduce((n, l) => n + l.progress.stars, 0), total: open.length * 3},
      badges: badgesOf({completed: activity.completed, answered: answeredCount, retries: activity.retries, streak, chapters})},
  };
}

// ---------- Học sinh: Luyện ngay ----------
export async function startLessons(user, raw) {
  if (user.role !== 'student') fail('Chỉ học sinh tạo lượt luyện', 403);
  const d = z.object({topic_ids: z.array(z.coerce.number().int().positive()).min(1).max(100), count: z.coerce.number().int().min(1).max(40).optional(), focus: z.enum(['base']).optional()}).strict().parse(raw);
  const ids = [...new Set(d.topic_ids)];
  const topics = (await pool.query("SELECT id,subject_id,grade FROM topics WHERE id=ANY($1::int[]) AND status='ACTIVE'", [ids])).rows;
  if (topics.length !== ids.length) fail('Có Bài không còn dùng được; tải lại trang rồi chọn lại', 422);
  const {subject_id, grade} = topics[0];
  if (topics.some(t => t.subject_id !== subject_id || t.grade !== grade)) fail('Chọn các Bài cùng một môn và một khối', 422);
  const cfg = await settings(), types = await practiceTypes(pool, subject_id);
  const config = {subject_id, grade, topic_ids: ids, selection_mode: 'topic', types, mode: 'practice'};
  const seen = new Set(), avail = [0, 0, 0, 0];
  for (const q of await candidates(pool, user, config)) if (types.includes(q.question_type) && !seen.has(q.question_id) && q.cognitive_level >= 1 && q.cognitive_level <= 4) { seen.add(q.question_id); avail[q.cognitive_level - 1]++; }
  const total = sum(avail), min = floorOf(cfg);
  if (total < min) fail(`Nội dung này mới có ${total} câu luyện được; cần ít nhất ${min} câu. Thầy cô đang bổ sung câu hỏi.`, 409);
  const count = Math.min(clamp(d.count ?? LESSON_COUNT, min, cfg.practice_max_questions), total);
  const percent = fitPercent(count, d.focus === 'base' ? BASE_PERCENT : cfg.practice_presets.balanced, avail);
  if (!percent) fail('Kho chưa đủ câu để tạo lượt luyện này', 409);
  return createAttempt(user, {...config, count, percent}, {minQuestions: min});
}
