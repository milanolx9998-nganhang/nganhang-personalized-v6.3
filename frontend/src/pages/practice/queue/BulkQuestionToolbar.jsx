import {useState} from 'react';
import {api} from '../../../api/client.js';
import {base, ErrorBox} from '../shared.jsx';

export const ACTION_LABELS = {
  submit: 'Gửi duyệt', approve: 'Duyệt', request_changes: 'Yêu cầu sửa',
  reject: 'Từ chối', archive: 'Lưu trữ', activate: 'Đưa vào luyện',
};
const NEEDS_REASON = new Set(['request_changes', 'reject']);
// §21 — one checklist per batch, not four ticks per clean question. Deep review still asks per item.
const CHECKLIST = [
  'Nội dung / dữ kiện đúng, không mơ hồ',
  'Đáp án và quy tắc chấm khớp dạng câu',
  'Bài, YCCĐ và mức nhận thức phù hợp',
  'Hình, công thức, bảng và lời giải hiển thị đủ',
];

function PlanReport({plan, onRetryEligible}) {
  if (!plan) return null;
  const groups = [
    ['Đủ điều kiện', plan.eligible, 'ok-box'],
    ['Cần rà soát chi tiết', plan.requires_deep_review, 'warn-box'],
    ['Bị chặn', plan.blocked, 'practice-error'],
  ].filter(([, rows]) => rows?.length);
  return (
    <div className="bulk-plan">
      <p role="status">Đã kiểm tra {plan.requested} câu: {plan.eligible.length} đủ điều kiện · {plan.requires_deep_review.length} cần rà soát · {plan.blocked.length} bị chặn.</p>
      {groups.map(([label, rows, cls]) => (
        <details key={label} className={cls} open={cls !== 'ok-box'}>
          <summary>{label} ({rows.length})</summary>
          <ul>{rows.slice(0, 50).map(r => (
            <li key={r.question_id}>{r.question_code || '#' + r.question_id}{r.reason_code ? ` · ${r.reason_code}` : ''}{r.message ? ` — ${r.message}` : ''}</li>
          ))}</ul>
          {rows.length > 50 && <p>… và {rows.length - 50} câu nữa.</p>}
        </details>
      ))}
      {onRetryEligible && plan.eligible.length > 0 && (plan.blocked.length > 0 || plan.requires_deep_review.length > 0) &&
        <button className="btn" onClick={onRetryEligible}>Bỏ các câu không hợp lệ và chạy lại ({plan.eligible.length})</button>}
    </div>
  );
}

export default function BulkQuestionToolbar({selection, actions, banks = [], onDone, extraNote}) {
  const [action, setAction] = useState(actions[0]);
  const [reason, setReason] = useState('');
  const [targetBank, setTargetBank] = useState('');
  const [checked, setChecked] = useState([]);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const checklistDone = action !== 'approve' || checked.length === CHECKLIST.length;
  const reasonDone = !NEEDS_REASON.has(action) || reason.trim().length > 0;
  const ready = selection.count > 0 && checklistDone && reasonDone;

  const body = (ids = selection.ids) => ({
    ids,
    action,
    reason: reason.trim(),
    target_bank_id: targetBank ? Number(targetBank) : null,
    expected_versions: Object.fromEntries(ids.map(id => [String(id), selection.map[String(id)]])),
  });

  async function preflight() {
    setBusy(true); setError(''); setMessage(''); setPlan(null);
    try { setPlan(await api.post(base + '/questions/bulk-preflight', body())); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function execute(ids = selection.ids) {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api.post(base + '/questions/bulk-workflow', body(ids));
      setMessage(`${ACTION_LABELS[action]}: đã áp dụng cho ${result.applied} câu (lô ${result.batch_id.slice(0, 8)}).`);
      setPlan(null); setChecked([]); setReason(''); selection.clear(); onDone?.(result);
    } catch (e) {
      setError(e.message);
      // 409 from an atomic batch carries the same shape preflight returns, so the operator sees
      // exactly which questions stopped the whole run.
      if (e.details?.eligible) setPlan(e.details);
    } finally { setBusy(false); }
  }

  return (
    <section className="bulk-toolbar practice-card" aria-label="Thao tác hàng loạt">
      <p><strong>{selection.count}</strong> câu đang chọn
        {selection.scope && ` · chọn theo bộ lọc: ${selection.scope.total} câu khớp${selection.scope.truncated ? `, giới hạn ${selection.scope.limit} câu mỗi lô` : ''}`}
        {selection.count > 0 && <> · <button className="btn" onClick={() => { selection.clear(); setPlan(null); }}>Bỏ chọn</button></>}
      </p>
      {selection.scope?.truncated &&
        <p className="warn-box">Bộ lọc khớp {selection.scope.total} câu, vượt giới hạn {selection.scope.limit} câu mỗi lô. Hãy thu hẹp bộ lọc và xử lý thành nhiều lô.</p>}
      {extraNote}
      <div className="practice-grid">
        <label>Thao tác
          <select value={action} onChange={e => { setAction(e.target.value); setPlan(null); setChecked([]); }}>
            {actions.map(a => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
          </select>
        </label>
        {banks.length > 0 && <label>Kho đích (tùy chọn)
          <select value={targetBank} onChange={e => setTargetBank(e.target.value)}>
            <option value="">Giữ kho hiện tại</option>
            {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>}
      </div>
      <label>Lý do {NEEDS_REASON.has(action) ? '(bắt buộc)' : '(tùy chọn)'}
        <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="Nêu căn cứ cho thao tác này…"/>
      </label>
      {action === 'approve' && <fieldset>
        <legend>Xác nhận trước khi duyệt cả lô</legend>
        {CHECKLIST.map((item, i) => (
          <label className="scope-v2-tick" key={item}>
            <input type="checkbox" checked={checked.includes(i)}
                   onChange={e => setChecked(e.target.checked ? [...checked, i] : checked.filter(n => n !== i))}/>
            {item}
          </label>
        ))}
        <p>Câu có rủi ro (cách ly, hồ sơ P0/P1, sai phân loại, lỗi kiểm tra) vẫn bị tách sang rà soát chi tiết, không duyệt nhanh.</p>
      </fieldset>}
      <ErrorBox error={error}/>
      {message && <p className="ok-box" role="status">{message}</p>}
      <div className="practice-actions">
        <button className="btn" disabled={busy || !ready} onClick={preflight}>Kiểm tra trước</button>
        <button className="btn primary" disabled={busy || !ready || !plan || !plan.eligible.length || plan.blocked.length > 0 || plan.requires_deep_review.length > 0}
                onClick={() => execute()}>
          {ACTION_LABELS[action]} {plan?.eligible.length || selection.count} câu
        </button>
      </div>
      <PlanReport plan={plan} onRetryEligible={() => execute(plan.eligible.map(e => e.question_id))}/>
    </section>
  );
}
