import {useEffect, useState} from 'react';
import {api} from '../../../api/client.js';
import {base, ErrorBox} from '../shared.jsx';
import RejectReasonPopover from '../workspace/RejectReasonPopover.jsx';

export const ACTION_LABELS = {
  submit: 'Gửi duyệt', approve: 'Duyệt', request_changes: 'Trả sửa',
  reject: 'Từ chối', archive: 'Lưu trữ', activate: 'Đưa vào luyện',
};
const NEEDS_REASON = new Set(['request_changes', 'reject']);
// §21 — một checklist cho cả lô, không bắt tick bốn mục cho từng câu sạch.
const CHECKLIST = [
  'Nội dung / dữ kiện đúng, không mơ hồ',
  'Đáp án và quy tắc chấm khớp dạng câu',
  'Bài, YCCĐ và mức nhận thức phù hợp',
  'Hình, công thức, bảng và lời giải hiển thị đủ',
];

const rest = plan => plan ? [...plan.requires_deep_review, ...plan.blocked].map(r => r.question_id) : [];

function PlanReport({plan, onRetryEligible}) {
  if (!plan) return null;
  const groups = [
    ['Đủ điều kiện', plan.eligible, 'ok-box'],
    ['Cần rà soát chi tiết', plan.requires_deep_review, 'warn-box'],
    ['Bị chặn', plan.blocked, 'practice-error'],
  ].filter(([, rows]) => rows?.length);
  return (
    <div className="bulk-plan">
      <p role="status">Đã kiểm {plan.requested} câu: {plan.eligible.length} đủ điều kiện · {plan.requires_deep_review.length} cần rà soát · {plan.blocked.length} bị chặn.</p>
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

export default function BulkQuestionToolbar({selection, actions, banks = [], onDone, extraActions, onFocusIds, requestedAction, onClear}) {
  // Thanh luôn gọn: chọn một thao tác mới mở panel chứa checklist, lý do và kết quả kiểm tra.
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [reasonCodes, setReasonCodes] = useState([]);
  const [targetBank, setTargetBank] = useState('');
  const [checked, setChecked] = useState([]);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const close = () => { setAction(null); setPlan(null); setChecked([]); setReason(''); setReasonCodes([]); };
  // Bảng lệnh (Ctrl+K) mở thẳng một thao tác của thanh này.
  useEffect(() => {
    if (requestedAction && actions.includes(requestedAction.action)) { setAction(requestedAction.action); setPlan(null); setChecked([]); }
  }, [requestedAction]); // eslint-disable-line react-hooks/exhaustive-deps
  const checklistDone = action !== 'approve' || checked.length === CHECKLIST.length;
  const reasonDone = !NEEDS_REASON.has(action) || reason.trim().length > 0;
  const ready = selection.count > 0 && checklistDone && reasonDone;

  const body = (ids = selection.ids) => ({
    ids,
    action,
    reason: reason.trim(),
    reason_codes: reasonCodes,
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
      setMessage(`${ACTION_LABELS[action]}: đã áp dụng cho ${result.applied} câu.`);
      selection.clear(); close(); onDone?.(result);
    } catch (e) {
      setError(e.message);
      if (e.details?.eligible) setPlan(e.details);
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="bulk-bar" role="region" aria-label="Thao tác hàng loạt">
        <span><strong>{selection.count}</strong> câu đã chọn
          {selection.scope?.truncated && ` · bộ lọc khớp ${selection.scope.total}, giới hạn ${selection.scope.limit} câu mỗi lô`}
        </span>
        <div className="bulk-bar-actions">
          {actions.map(a => (
            <button key={a} className={'btn' + (a === action ? ' primary' : '')}
                    onClick={() => { setAction(a === action ? null : a); setPlan(null); setChecked([]); }}>
              {ACTION_LABELS[a]}
            </button>
          ))}
          {extraActions}
          <button className="btn" onClick={() => { (onClear || selection.clear)(); close(); }}>Bỏ chọn</button>
        </div>
      </div>
      {message && <p className="ok-box" role="status">{message}</p>}

      {action && (
        <section className="practice-card bulk-sheet" aria-label={ACTION_LABELS[action] + ' hàng loạt'}>
          <header className="section-heading">
            <h3>{ACTION_LABELS[action]} {selection.count} câu</h3>
            <button className="btn" onClick={close}>Đóng</button>
          </header>
          <ErrorBox error={error}/>

          {NEEDS_REASON.has(action)
            ? <RejectReasonPopover count={selection.count} busy={busy}
                                   submitLabel={`Kiểm tra trước khi ${ACTION_LABELS[action].toLowerCase()}`}
                                   onCancel={close}
                                   onSubmit={({codes, reason: text}) => { setReasonCodes(codes); setReason(text); setPlan(null); }}/>
            : <>
                {banks.length > 0 && <label>Kho đích (tùy chọn)
                  <select value={targetBank} onChange={e => setTargetBank(e.target.value)}>
                    <option value="">Giữ kho hiện tại</option>
                    {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>}
                {action === 'approve' && <fieldset>
                  <legend>Xác nhận trước khi duyệt cả lô</legend>
                  {CHECKLIST.map((item, i) => (
                    <label className="scope-v2-tick" key={item}>
                      <input type="checkbox" checked={checked.includes(i)}
                             onChange={e => setChecked(e.target.checked ? [...checked, i] : checked.filter(n => n !== i))}/>
                      {item}
                    </label>
                  ))}
                  <p>Câu có rủi ro vẫn bị tách sang rà soát chi tiết, không duyệt nhanh.</p>
                </fieldset>}
              </>}

          {reason && NEEDS_REASON.has(action) && (
            <p className="ok-box">Lý do: {reason}{reasonCodes.length ? ` (${reasonCodes.join(', ')})` : ''}</p>
          )}

          <div className="practice-actions">
            <button className="btn" disabled={busy || !ready} onClick={preflight}>Kiểm tra trước</button>
            {/* §59 — lô lẫn câu sạch và câu có vấn đề: xử lý ngay phần sạch, mở riêng phần còn lại để xem. */}
            <button className="btn primary"
                    disabled={busy || !ready || !plan || !plan.eligible.length}
                    onClick={() => execute(plan.eligible.map(e => e.question_id))}>
              {ACTION_LABELS[action]} {plan?.eligible.length ?? selection.count} câu{rest(plan).length ? ' đủ điều kiện' : ''}
            </button>
            {rest(plan).length > 0 && onFocusIds &&
              <button className="btn" onClick={() => { onFocusIds(rest(plan)); close(); }}>Xem {rest(plan).length} câu còn lại</button>}
          </div>
          <PlanReport plan={plan}/>
        </section>
      )}
    </>
  );
}
