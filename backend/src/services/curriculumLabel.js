// Nhãn HIỂN THỊ của Outcome / YCCĐ theo nguồn chương trình: phân môn.Chủ đề(.YCCĐ), vd L.2 và L.2.1 — cùng số giáo
// viên viết trong mã câu "Câu L. 2. 1. …". Chỉ để hiển thị: mọi đối chiếu vẫn dùng code / canonical_key, vì code còn
// được so khớp (smartMetadata, curriculum_aliases) và được lưu trong snapshot. Chuẩn chưa có số nguồn → nhãn = code.
// Chương trình đã công bố là bất biến (trigger v663), nên nhãn của một YCCĐ không đổi theo thời gian.
export const outcomeLabelSql = (o = 'o') => `COALESCE(${o}.source_branch_code||'.'||${o}.source_ordinal,${o}.code)`;
export const yccdLabelSql = (y = 'y', o = 'o') => `COALESCE(${o}.source_branch_code||'.'||${o}.source_ordinal||'.'||${y}.source_ordinal,${y}.code)`;
