import {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {api} from '../../../api/client.js';
import {base} from '../shared.jsx';

// Khung sửa nhanh của bàn làm việc (V6.6.6).
//
// Phạm vi "Chỉ câu này ⇄ Cả N câu đang chọn": sửa riêng một câu KHÔNG làm mất lô đang chọn; câu đó được
// đánh dấu "chỉnh riêng" để lệnh hàng loạt sau không ghi đè. Mọi thay đổi đi qua /questions/quick-edit,
// tất cả hoặc không, và trả lại giá trị trước để hoàn tác được.
export const LEVEL_CODES = ['NB', 'TH', 'VD', 'VDC'];
export const levelIndex = row => Number(String(row?.cognitive_level || '').replace(/^M/, '')) || null;

// Thân yêu cầu hoàn tác: đưa từng câu về đúng giá trị trước khi sửa.
export function undoBody(items) {
  const restore = items.map(i => {
    const out = {id: i.question_id};
    if (i.before.cognitive_level && i.before.cognitive_level !== i.after.cognitive_level) out.cognitive_level = i.before.cognitive_level;
    if (i.before.topic_id !== i.after.topic_id) out.topic_id = i.before.topic_id;
    return out;
  }).filter(o => Object.keys(o).length > 1);
  return {items: restore, regenerate_code: items.some(i => i.before.display_code !== i.after.display_code),
    allow_unlinked: true, reason: 'Hoàn tác sửa nhanh'};
}

// Hoàn tác gán Bài hàng loạt (assign-lesson trả before_topic_id cho từng câu).
export function undoLessonBody(result) {
  return {items: (result.items || []).map(i => ({id: i.question_id, topic_id: i.before_topic_id ?? null})),
    allow_unlinked: true, reason: 'Hoàn tác gán Bài'};
}

const QuickInspector = forwardRef(function QuickInspector(
  {row, selection, overrides, keepOverrides, onOverride, scope, onScope, topics = [], onApplied, onError, onOpenLessonDialog}, ref) {
  const [lesson, setLesson] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const lessonSelect = useRef(null);
  const multi = selection.count > 1;
  const bulk = scope === 'selection' && multi;
  const targets = () => selection.ids.filter(id => !(keepOverrides && overrides[id]));
  const expectedFor = ids => Object.fromEntries(ids.filter(id => selection.map[String(id)]).map(id => [String(id), selection.map[String(id)]]));

  useEffect(() => {
    setConflict(null); setPlan(null); setLesson(null);
    if (!row) return undefined;
    let active = true;
    api.post(base + '/questions/lesson-options', {ids: [row.id]})
      .then(result => { if (active) setLesson(result.groups?.[0] || {status: 'NO_YCCD', candidates: []}); })
      .catch(() => { if (active) setLesson({status: 'NO_YCCD', candidates: []}); });
    return () => { active = false; };
  }, [row?.id, row?.current_version_id]);

  async function execute(body, message, {single = false} = {}) {
    setBusy(true);
    try {
      const result = await api.post(base + '/questions/quick-edit', body);
      if (single && row && selection.has(row.id) && multi) onOverride(row.id);
      setConflict(null); setPlan(null);
      onApplied({message: result.applied ? message(result) : 'Không có gì thay đổi.', items: result.items || []});
      return result;
    } catch (e) {
      const first = e.details?.blocked?.[0];
      if (single && first?.reason_code === 'CODE_METADATA_CONFLICT') setConflict({...first, body});
      else onError(e.message + (e.details?.blocked?.length ? ' — ' + e.details.blocked.slice(0, 3).map(b => `${b.question_code || b.question_id}: ${b.message}`).join('; ') : ''));
      return null;
    } finally { setBusy(false); }
  }

  // forceScope: bảng lệnh gọi thẳng "cho câu này" / "cho cả lô", không phụ thuộc công tắc đang bật.
  async function setLevel(level, forceScope) {
    if (!row || busy) return;
    const label = LEVEL_CODES[level - 1];
    const isBulk = forceScope ? forceScope === 'selection' && multi : bulk;
    if (!isBulk) {
      return execute({ids: [row.id], changes: {cognitive_level: level}, expected_versions: {[String(row.id)]: row.current_version_id}},
        () => `Đã đặt mức ${label} cho ${row.display_code}.`, {single: true});
    }
    const ids = targets();
    if (!ids.length) { onError('Mọi câu đang chọn đều đã chỉnh riêng; bỏ “Giữ câu chỉnh riêng” để áp cho cả lô.'); return; }
    setBusy(true);
    try {
      const preview = await api.post(base + '/questions/quick-edit/preflight', {ids, changes: {cognitive_level: level}, expected_versions: expectedFor(ids)});
      if (!preview.blocked.length) {
        setBusy(false);
        return execute({ids, changes: {cognitive_level: level}, expected_versions: expectedFor(ids)},
          r => `Đã đặt mức ${label} cho ${r.applied} câu.` + skippedNote(ids));
      }
      setPlan({level, label, ids, eligible: preview.eligible.map(e => e.question_id),
        codeConflicts: preview.blocked.filter(b => b.reason_code === 'CODE_METADATA_CONFLICT').map(b => b.question_id),
        others: preview.blocked.filter(b => b.reason_code !== 'CODE_METADATA_CONFLICT')});
    } catch (e) { onError(e.message); }
    finally { setBusy(false); }
  }

  const skippedNote = ids => {
    const kept = selection.count - ids.length;
    return kept > 0 ? ` Giữ nguyên ${kept} câu đã chỉnh riêng.` : '';
  };

  function setTopic(value) {
    if (!row) return;
    const topicId = value ? Number(value) : null;
    return execute({ids: [row.id], changes: {topic_id: topicId}, expected_versions: {[String(row.id)]: row.current_version_id}},
      () => topicId ? `Đã gắn Bài cho ${row.display_code}.` : `Đã bỏ Bài của ${row.display_code}.`, {single: true});
  }

  function openLesson() {
    if (bulk) onOpenLessonDialog(targets());
    else lessonSelect.current?.focus();
  }

  useImperativeHandle(ref, () => ({setLevel, openLesson}));
  if (!row) return null;

  const current = levelIndex(row);
  const candidates = lesson?.status === 'NO_YCCD'
    ? topics.filter(t => t.subject_id === row.subject_id && t.grade === row.grade)
    : lesson?.candidates || [];
  const overridden = !!overrides[row.id];
  return (
    <section className="quick-inspector" aria-label="Sửa nhanh phân loại">
      {multi && <>
        <div className="scope-toggle" role="group" aria-label="Phạm vi sửa">
          <button className={'seg' + (!bulk ? ' on' : '')} aria-pressed={!bulk} onClick={() => onScope('one')}>Chỉ câu này</button>
          <button className={'seg' + (bulk ? ' on' : '')} aria-pressed={bulk} onClick={() => onScope('selection')}>Cả {selection.count} câu đang chọn</button>
        </div>
        <p className="muted small">{bulk
          ? `Thay đổi dưới đây áp cho cả lô${keepOverrides && Object.keys(overrides).some(id => selection.has(Number(id))) ? ', trừ câu đã chỉnh riêng' : ''}. Phím G đổi phạm vi.`
          : `Lô ${selection.count} câu vẫn được giữ chọn. Sửa ở đây chỉ đổi câu này và đánh dấu “chỉnh riêng”.`}</p>
      </>}
      {overridden && <p className="override-note">Đã chỉnh riêng · lệnh hàng loạt sau {keepOverrides ? 'sẽ giữ nguyên câu này' : 'vẫn áp cho câu này (đang tắt “giữ câu chỉnh riêng”)'}</p>}

      <div className="quick-field">
        <span className="quick-label">Bài</span>
        {bulk
          ? <button className="btn" disabled={busy} onClick={openLesson}>Gắn Bài cho {targets().length} câu… <kbd>B</kbd></button>
          : <select ref={lessonSelect} aria-label="Bài của câu đang xem" disabled={busy || !lesson} value={row.topic_id || ''} onChange={e => setTopic(e.target.value)}>
              <option value="">{row.topic_id ? 'Bỏ Bài' : 'Chưa gắn Bài'}</option>
              {row.topic_id && !candidates.some(t => t.id === row.topic_id) && <option value={row.topic_id}>{row.topic_name || 'Bài hiện tại'}</option>}
              {candidates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>}
        {!bulk && lesson?.status === 'UNMAPPED' && <small className="muted">YCCĐ của câu chưa liên kết Bài nào trong dữ liệu nền.</small>}
      </div>

      <div className="quick-field">
        <span className="quick-label">Mức</span>
        <div className="seg-group" role="group" aria-label="Mức nhận thức">
          {LEVEL_CODES.map((code, i) => (
            <button key={code} className={'seg' + (!bulk && current === i + 1 ? ' on' : '')} aria-pressed={!bulk && current === i + 1}
                    disabled={busy} onClick={() => setLevel(i + 1)}>{code}</button>
          ))}
        </div>
        <small className="muted">Phím 1–4</small>
      </div>

      {conflict && (
        <div className="warn-box" role="alert">
          <p>Mức nằm trong mã câu. Đổi mức thì mã phải đổi theo: <span className="mono">{conflict.current_code}</span> → <span className="mono">{conflict.suggested_code}</span></p>
          <div className="practice-actions">
            <button className="btn primary" disabled={busy}
                    onClick={() => execute({...conflict.body, regenerate_code: true}, () => `Đã đổi mức và tạo lại mã: ${conflict.suggested_code}.`, {single: true})}>
              Tạo lại mã theo mức mới
            </button>
            <button className="btn" onClick={() => setConflict(null)}>Giữ theo mã</button>
          </div>
        </div>
      )}

      {plan && (
        <div className="warn-box" role="alert">
          <p>Đặt mức {plan.label} cho {plan.ids.length} câu: <strong>{plan.eligible.length}</strong> câu đổi được ngay
            {plan.codeConflicts.length > 0 && <> · <strong>{plan.codeConflicts.length}</strong> câu có mã ghi mức khác (phải tạo lại mã)</>}
            {plan.others.length > 0 && <> · <strong>{plan.others.length}</strong> câu không sửa được</>}.</p>
          {plan.others.length > 0 && <ul>{plan.others.slice(0, 5).map(b => <li key={b.question_id}>{b.question_code || b.question_id}: {b.message}</li>)}</ul>}
          <div className="practice-actions">
            {plan.eligible.length > 0 && <button className="btn primary" disabled={busy}
              onClick={() => execute({ids: plan.eligible, changes: {cognitive_level: plan.level}, expected_versions: expectedFor(plan.eligible)},
                r => `Đã đặt mức ${plan.label} cho ${r.applied} câu.`)}>Chỉ áp {plan.eligible.length} câu</button>}
            {plan.codeConflicts.length > 0 && <button className="btn" disabled={busy}
              onClick={() => { const ids = [...plan.eligible, ...plan.codeConflicts]; return execute({ids, changes: {cognitive_level: plan.level}, regenerate_code: true, expected_versions: expectedFor(ids)},
                r => `Đã đặt mức ${plan.label} và tạo lại mã cho ${r.applied} câu.`); }}>
              Áp {plan.eligible.length + plan.codeConflicts.length} câu, tạo lại mã</button>}
            <button className="btn" onClick={() => setPlan(null)}>Hủy</button>
          </div>
        </div>
      )}
    </section>
  );
});

export default QuickInspector;
