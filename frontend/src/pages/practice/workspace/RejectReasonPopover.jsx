import {useState} from 'react';

// Lý do trả sửa có mã, thay cho window.prompt. Mã giúp thống kê được câu hay bị trả vì lỗi gì;
// phần ghi chú tự do vẫn giữ để người duyệt nói rõ trường hợp cụ thể.
export const REJECT_REASONS = [
  {code: 'LEVEL_MISMATCH', label: 'Sai mức độ nhận thức'},
  {code: 'CURRICULUM_MISMATCH', label: 'Sai hoặc chưa rõ YCCĐ / Bài'},
  {code: 'INSUFFICIENT_DATA', label: 'Dữ kiện chưa đủ hoặc mơ hồ'},
  {code: 'WEAK_DISTRACTORS', label: 'Phương án nhiễu chưa tốt'},
  {code: 'ANSWER_MISMATCH', label: 'Đáp án hoặc lời giải chưa khớp'},
  {code: 'MEDIA_PROBLEM', label: 'Hình, công thức hoặc bảng có vấn đề'},
  {code: 'DUPLICATE_SUSPECT', label: 'Nghi trùng với câu đã có'},
];

// Ghép mã đã chọn và ghi chú thành một lý do đọc được — backend vẫn yêu cầu lý do dạng chữ.
export function composeReason(codes, note) {
  const labels = REJECT_REASONS.filter(r => codes.includes(r.code)).map(r => r.label);
  return [labels.join('; '), String(note || '').trim()].filter(Boolean).join(' — ');
}

export default function RejectReasonPopover({count = 1, busy, onCancel, onSubmit, submitLabel}) {
  const [codes, setCodes] = useState([]);
  const [note, setNote] = useState('');
  const ready = codes.length > 0 || note.trim().length > 0;
  return (
    <div className="reject-popover" role="dialog" aria-label="Lý do trả sửa">
      <p><strong>Trả sửa {count > 1 ? `${count} câu` : 'câu này'}</strong></p>
      {REJECT_REASONS.map(reason => (
        <label className="scope-v2-tick" key={reason.code}>
          <input type="checkbox" checked={codes.includes(reason.code)}
                 onChange={e => setCodes(e.target.checked ? [...codes, reason.code] : codes.filter(c => c !== reason.code))}/>
          {reason.label}
        </label>
      ))}
      <label>Ghi chú thêm
        <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Nêu cụ thể chỗ cần sửa…"/>
      </label>
      <div className="practice-actions">
        <button className="btn primary" disabled={busy || !ready}
                onClick={() => onSubmit({codes, reason: composeReason(codes, note)})}>
          {submitLabel || 'Trả sửa & sang câu tiếp'}
        </button>
        <button className="btn" onClick={onCancel}>Hủy</button>
      </div>
    </div>
  );
}
