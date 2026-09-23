// Dải kiểm tra máy (§34, §61): mỗi khía cạnh một ô ✓ / ! / –, đọc lướt được trong một giây.
// Chỉ nói đúng/sai — không bao giờ hiển thị đáp án.
export const CHECK_LABELS = {
  code: 'Mã', curriculum: 'Chuẩn', lesson: 'Bài', level: 'Mức', form: 'Dạng',
  answer: 'Đáp án', explanation: 'Lời giải', media: 'Ảnh', duplicate: 'Trùng',
};
const HINTS = {
  code: ['Mã khớp phân loại', 'Mã lệch phân loại hoặc viết sai', 'Câu không dùng mã hiện hành'],
  curriculum: ['Đã gắn Outcome/YCCĐ', 'Chưa gắn chuẩn hoặc cần xem phân loại'],
  lesson: ['Đã gắn Bài', 'Chưa gắn Bài hoặc có nhiều Bài'],
  level: ['Mức khớp mã', 'Thiếu mức hoặc lệch mã'],
  form: ['Đã có dạng câu', 'Thiếu dạng câu'],
  answer: ['Có đáp án', 'Thiếu đáp án'],
  explanation: ['Có lời giải', 'Thiếu lời giải'],
  media: ['Ảnh ổn', 'Có phản ánh về ảnh'],
  duplicate: ['Không nghi trùng', 'Nghi trùng câu khác'],
};

export default function MachineChecks({checks, compact = false}) {
  if (!checks) return null;
  return (
    <ul className={'machine-checks' + (compact ? ' compact' : '')} aria-label="Kiểm tra máy">
      {Object.entries(CHECK_LABELS).map(([key, label]) => {
        const value = checks[key];
        if (value === undefined) return null;
        const state = value === null ? 'na' : value ? 'ok' : 'bad';
        const hint = value === null ? HINTS[key][2] || 'Không áp dụng' : HINTS[key][value ? 0 : 1];
        return (
          <li key={key} className={'check-' + state} title={hint} aria-label={`${label}: ${hint}`}>
            <span aria-hidden="true">{state === 'ok' ? '✓' : state === 'bad' ? '!' : '–'}</span> {label}
          </li>
        );
      })}
    </ul>
  );
}

// Suy dải kiểm tra cho một dòng đang dàn dựng trong phiên nhập, từ chính bản nháp và danh sách vấn đề.
export function importChecks(item) {
  const d = item.draft || {}, issues = item.validation?.issues || [];
  const has = (...codes) => issues.some(i => codes.includes(i.code));
  const coded = !!(d.display_code && /^Câu [LHS]\./u.test(d.display_code)) || !!d.code_raw;
  const answer = d.answer || {};
  const hasAnswer = d.type === 'essay' || !!(answer.correct || Object.keys(answer.values || {}).length
    || Object.keys(answer.pairs || {}).length || (answer.aliases || []).length || answer.numeric != null);
  return {
    code: coded ? !has('INVALID_CODE', 'CODE_METADATA_CONFLICT', 'UNKNOWN_OUTCOME', 'UNKNOWN_YCCD', 'CURRICULUM_RETIRED') : null,
    curriculum: !!d.yccd_id,
    lesson: !!d.topic_id && !has('LESSON_UNMAPPED', 'LESSON_AMBIGUOUS', 'LESSON_NOT_LINKED'),
    level: !!d.cognitive_level && !has('OPTIONAL_LEVEL_MISMATCH'),
    form: !!d.type,
    answer: hasAnswer,
    explanation: !!String(d.explanation || '').trim(),
    media: !String(d.stem || '').includes('[Ảnh cần kiểm tra]'),
    duplicate: !has('DUPLICATE_SUSPECT'),
  };
}
