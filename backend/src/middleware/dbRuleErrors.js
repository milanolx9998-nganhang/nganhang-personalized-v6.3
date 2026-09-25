// Lỗi quy tắc từ trigger PostgreSQL (RAISE EXCEPTION → SQLSTATE P0001) là thao tác không hợp lệ của người dùng, không phải
// lỗi máy chủ. Trước đây chúng rơi vào 500 ("Lỗi server nội bộ" trên production, mã thô ở máy dev). Nay trả 409 kèm câu
// tiếng Việt; mã gốc chỉ nằm ở trường `code` và log (V6.7: "mã lỗi → log, câu dễ hiểu → người dùng").
// Khớp theo đầu câu RAISE EXCEPTION trong các file migration; quy tắc cụ thể đặt trước quy tắc chung.
const RULES = [
  ['TOPIC_YCCD_MISMATCH: inactive', 'TOPIC_YCCD_MISMATCH', 'Bài hoặc YCCĐ đã ngừng dùng nên không liên kết được.'],
  ['TOPIC_YCCD_MISMATCH', 'TOPIC_YCCD_MISMATCH', 'YCCĐ này không cùng môn, khối hoặc phân môn với Bài đã chọn. Hãy chọn lại YCCĐ hoặc Bài.'],
  ['PUBLISHED_CURRICULUM_IMMUTABLE', 'PUBLISHED_CURRICULUM_IMMUTABLE', 'Chương trình đã công bố không sửa trực tiếp được. Hãy tạo bản chương trình nháp mới để sửa.'],
  ['CURRICULUM_REQUIRES_DRAFT', 'CURRICULUM_REQUIRES_DRAFT', 'Chỉ thêm hoặc sửa chuẩn trong bản chương trình nháp.'],
  ['CURRICULUM_PARENT_VERSION_MISMATCH', 'CURRICULUM_PARENT_VERSION_MISMATCH', 'YCCĐ phải thuộc cùng bản chương trình với Chủ đề (Outcome) của nó.'],
  ['COMPETENCY_SNAPSHOT_IMMUTABLE', 'COMPETENCY_SNAPSHOT_IMMUTABLE', 'Dữ liệu năng lực đã chốt, không sửa được.'],
  ['FRAMEWORK_REQUIRES_DRAFT', 'FRAMEWORK_REQUIRES_DRAFT', 'Chỉ sửa được khung năng lực ở bản nháp.'],
  ['LEARNING_INTERPRETATION_APPEND_ONLY', 'LEARNING_INTERPRETATION_APPEND_ONLY', 'Nhận xét học tập chỉ được thêm mới, không sửa hay xoá.'],
  ['YCCD domain mismatch', 'YCCD_MISMATCH', 'YCCĐ không khớp môn, khối hoặc Chủ đề của câu hỏi. Hãy chọn lại YCCĐ.'],
  ['YCCD does not match', 'YCCD_MISMATCH', 'YCCĐ không khớp môn, khối hoặc Chủ đề của câu hỏi. Hãy chọn lại YCCĐ.'],
  ['Taxonomy node does not belong', 'TAXONOMY_MISMATCH', 'Nhãn phân loại không thuộc môn của câu hỏi.'],
  ['Version pending review cannot be edited', 'VERSION_PENDING_REVIEW', 'Câu đang chờ duyệt nên chưa sửa được. Hãy chờ người duyệt hoặc rút lại yêu cầu duyệt.'],
  ['Approved, used or rejected versions cannot become editable drafts', 'VERSION_IMMUTABLE', 'Phiên bản đã duyệt, đã dùng hoặc bị từ chối không quay lại bản nháp được. Hãy tạo phiên bản mới.'],
  ['Question versions cannot be deleted', 'VERSION_IMMUTABLE', 'Không xoá được phiên bản câu hỏi. Hãy lưu trữ câu hỏi thay vì xoá.'],
  ['Question version', 'VERSION_IMMUTABLE', 'Phiên bản câu hỏi đã duyệt hoặc đã dùng không sửa được. Hãy tạo phiên bản mới.'],
  ['Version identity is immutable', 'VERSION_IMMUTABLE', 'Phiên bản câu hỏi đã duyệt hoặc đã dùng không sửa được. Hãy tạo phiên bản mới.'],
  ['Completed responses and scores are immutable', 'ATTEMPT_COMPLETED', 'Bài đã nộp không sửa được câu trả lời hay điểm.'],
  ['Attempt item identity', 'ATTEMPT_ITEM_IMMUTABLE', 'Không đổi được câu hỏi trong bài đã tạo.'],
  ['Approval history is immutable', 'APPROVAL_HISTORY_IMMUTABLE', 'Lịch sử duyệt không sửa được.'],
  ['Active pointer requires an approved version', 'VERSION_NOT_APPROVED', 'Chỉ đưa vào sử dụng phiên bản đã được duyệt.'],
];

export function dbRuleError(err) {
  if (err?.code !== 'P0001' || typeof err.message !== 'string') return null;
  const rule = RULES.find(([prefix]) => err.message.startsWith(prefix));
  return rule
    ? {status: 409, code: rule[1], message: rule[2]}
    : {status: 409, code: 'DB_RULE', message: 'Thao tác vi phạm quy tắc dữ liệu nên chưa được lưu. Hãy tải lại trang rồi thử lại.'};
}
