// Nhãn hiển thị Outcome / YCCĐ theo nguồn chương trình: phân môn.Chủ đề(.YCCĐ), vd L.2 và L.2.1 — cùng số giáo viên
// viết trong mã câu "Câu L. 2. 1. …". Mã máy (O-…/Y-…) chỉ nên để trong tooltip.
//  - Dòng API đã có sẵn nhãn (outcome_label / yccd_label, hoặc label) → dùng nhãn đó.
//  - Dòng thô của bảng chương trình (SELECT *) → tự tính từ source_branch_code + source_ordinal.
//  - Chuẩn chưa có số nguồn (nhập tay) → dùng mã.
const sourced = o => o?.source_branch_code && o.source_ordinal != null;

export const outcomeLabel = o => (sourced(o) ? `${o.source_branch_code}.${o.source_ordinal}` : o?.label || o?.code || '');
export const yccdLabel = (y, o) => (sourced(o) && y?.source_ordinal != null
  ? `${o.source_branch_code}.${o.source_ordinal}.${y.source_ordinal}` : y?.label || y?.code || '');

// Dòng phẳng từ API (outcome_code/yccd_code kèm outcome_label/yccd_label).
export const rowOutcome = r => r?.outcome_label || r?.outcome_code || '';
export const rowYccd = r => r?.yccd_label || r?.yccd_code || '';
// Một nhãn gộp: nhãn YCCĐ đã chứa Chủ đề (L.2.1) nên không ghép thêm mã Outcome.
export const rowCurriculum = r => r?.yccd_label || r?.outcome_label || [r?.outcome_code, r?.yccd_code].filter(Boolean).join(' · ');
