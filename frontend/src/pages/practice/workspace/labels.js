// Một nơi duy nhất dịch enum kỹ thuật sang tiếng Việt. Giao diện không được hiển thị lifecycle,
// review_status, metadata_status, import_job_id, current_version_id hay P0/P1 ở dạng thô.

const REVIEW = {DRAFT: 'Nháp', PENDING_REVIEW: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Trả lại', SUPERSEDED: 'Bản cũ'};
const LIFECYCLE = {draft: 'Nháp', pending_review: 'Chờ duyệt', approved: 'Đã duyệt', active: 'Đang dùng', archived: 'Ngừng dùng'};

export const LEVELS = {M1: 'NB', M2: 'TH', M3: 'VD', M4: 'VDC'};
export const LEVEL_NAMES = {M1: 'Nhận biết', M2: 'Thông hiểu', M3: 'Vận dụng', M4: 'Vận dụng cao'};
export const FORMS = {mcq4: 'Trắc nghiệm', true_false: 'Đúng / Sai', short: 'Trả lời ngắn', matching: 'Ghép nối', essay: 'Tự luận'};
export const FORM_SHORT = {mcq4: 'TN', true_false: 'ĐS', short: 'TLN', matching: 'GN', essay: 'TL'};

export const LESSON_STATUS = {
  AUTO_MAPPED: 'Tự gắn Bài',
  MANUAL: 'Đã gắn Bài',
  UNMAPPED: 'Chưa gắn Bài',
  AMBIGUOUS: 'Nhiều Bài — cần chọn',
};

// Một câu chỉ có một trạng thái hiển thị. Ưu tiên tín hiệu cần người xử lý trước.
export function questionStatus(row) {
  if (row?.risk?.quarantined) return {label: 'Cần xem kỹ', tone: 'danger'};
  if (row?.risk?.open_case_severity === 'P0') return {label: 'Cần xem kỹ', tone: 'danger'};
  if (row?.risk?.open_case_severity) return {label: 'Cần xem', tone: 'warn'};
  if (row?.risk?.needs_curriculum_review) return {label: 'Cần xem phân loại', tone: 'warn'};
  if (row?.review_status && REVIEW[row.review_status] && row.review_status !== 'APPROVED') {
    return {label: REVIEW[row.review_status], tone: row.review_status === 'PENDING_REVIEW' ? 'info' : 'muted'};
  }
  return {label: LIFECYCLE[row?.lifecycle] || 'Nháp', tone: row?.lifecycle === 'active' ? 'ok' : 'muted'};
}

export const lessonLabel = row => row?.topic_name || LESSON_STATUS[row?.lesson_status] || 'Chưa gắn Bài';
export const curriculumLabel = row => [row?.outcome_code, row?.yccd_code].filter(Boolean).join(' · ') || 'Chưa gán chuẩn';
export const levelLabel = row => LEVELS[row?.cognitive_level] || '—';
export const formLabel = row => FORMS[row?.q_type] || '—';

// Nhãn gộp cho cột "Bài / YCCĐ" của bảng kho.
export function lessonAndCurriculum(row) {
  const lesson = row?.topic_name || (row?.lesson_status === 'AMBIGUOUS' ? 'Nhiều Bài' : 'Chưa gắn Bài');
  const curriculum = [row?.outcome_code, row?.yccd_code].filter(Boolean).join('.');
  return curriculum ? `${lesson} · ${curriculum}` : lesson;
}

export const IMPORT_STATUS = {
  VALID: {label: 'Tự nhận diện', tone: 'ok'},
  WARNING: {label: 'Cần xem', tone: 'warn'},
  NEEDS_REVIEW: {label: 'Cần xem', tone: 'warn'},
  ERROR: {label: 'Lỗi', tone: 'danger'},
};
