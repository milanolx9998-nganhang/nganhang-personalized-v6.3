import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {api} from '../../api/client.js';
import {useAuth, hasAnyCapability} from '../../hooks/useAuth.js';
import {base, useLoad, ErrorBox} from './shared.jsx';
import QuestionReviewPanel from './QuestionReviewPanel.jsx';
import ReviewCaseQueue from './ReviewQueue.jsx';
import BulkQuestionToolbar, {ACTION_LABELS} from './queue/BulkQuestionToolbar.jsx';
import {useQueue, useSelection, QuestionQueueTable, QuestionPreviewPane} from './queue/QuestionQueue.jsx';
import WorkspaceShell from './workspace/WorkspaceShell.jsx';
import SimpleFilterBar from './workspace/SimpleFilterBar.jsx';
import {REJECT_REASONS, ReasonChips, composeReason, suggestedReasons} from './workspace/RejectReasonPopover.jsx';
import QuickInspector, {LEVEL_CODES, undoBody, undoLessonBody} from './workspace/QuickInspector.jsx';
import LessonAssignDialog from './workspace/LessonAssignDialog.jsx';
import CommandPalette from './workspace/CommandPalette.jsx';
import UndoToast, {useUndo} from './workspace/UndoToast.jsx';
import {useHotkeys} from './workspace/useHotkeys.js';

const TABS = [
  {id: 'author', label: 'Bản nháp của tôi', capabilities: ['content.write']},
  {id: 'pending', label: 'Chờ duyệt', capabilities: ['content.review', 'content.approve']},
  {id: 'cases', label: 'Cần xem kỹ', capabilities: ['content.review', 'content.approve']},
];

const TAB_QUERY = {
  author: {lifecycle: 'draft', review_status: 'DRAFT'},
  pending: {review_status: 'PENDING_REVIEW'},
};
// §60 — lọc theo ngoại lệ để người duyệt xử lý phần khó trước, duyệt nhanh phần sạch sau.
const EXCEPTIONS = [
  ['', 'Tất cả'], ['clean', 'Sạch'], ['level', 'Cần xem mức'], ['lesson', 'Chưa gắn Bài'],
  ['duplicate', 'Nghi trùng'], ['metadata', 'Lỗi metadata'], ['media', 'Media'],
];

const TAB_ACTIONS = {
  author: ['submit'],
  pending: ['approve', 'request_changes', 'reject'],
};
// §21 — một checklist cho cả lô sạch, không bắt tick bốn mục cho từng câu.
const CLEAN_CHECKLIST = [
  'Nội dung, dữ kiện đúng và rõ',
  'Đáp án khớp dạng câu',
  'Bài, YCCĐ, mức phù hợp',
  'Hình, công thức, lời giải hiển thị đủ',
];

// V6.6.6 — "Phần sạch": mọi câu chờ duyệt đạt đủ kiểm tra máy, duyệt một lần sau một checklist.
// Câu có rủi ro vẫn bị tách ra ở bước kiểm tra trước (preflight), không bao giờ duyệt lẫn.
function CleanBatch({search, reloadKey, onDone, onFocusIds}) {
  const [data, setData] = useState(null);
  const [checked, setChecked] = useState([]);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const cleanSearch = useMemo(() => {
    const next = new URLSearchParams(search);
    next.delete('ids'); next.delete('limit'); next.delete('offset');
    next.set('exception', 'clean');
    return next.toString();
  }, [search]);

  useEffect(() => {
    let active = true;
    setPlan(null); setError('');
    api.get(base + '/questions/selection-ids?' + cleanSearch)
      .then(d => { if (active) setData(d); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [cleanSearch, reloadKey]);

  async function run(ids) {
    const body = {ids, action: 'approve', expected_versions: Object.fromEntries(ids.map(id => [String(id), data.expected_versions[String(id)]]))};
    setBusy(true); setError('');
    try {
      const preview = await api.post(base + '/questions/bulk-preflight', body);
      if (preview.blocked.length || preview.requires_deep_review.length) { setPlan(preview); return; }
      const result = await api.post(base + '/questions/bulk-workflow', body);
      setDone(result.applied); setPlan(null); setChecked([]);
      onDone(result);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (error) return <div className="practice-card"><ErrorBox error={error}/></div>;
  if (!data) return <p className="practice-card" role="status">Đang đếm câu sạch…</p>;
  const ready = checked.length === CLEAN_CHECKLIST.length;
  return (
    <section className="practice-card clean-batch" aria-label="Duyệt nhanh phần sạch">
      <p className="quick-label">Phần sạch · máy đã kiểm đủ 9 mục</p>
      {done != null && <p className="ok-box" role="status">Đã duyệt {done} câu sạch.</p>}
      {!data.total && <p>Không còn câu sạch nào đang chờ trong bộ lọc này.</p>}
      {data.total > 0 && <>
        <p className="big">{data.total} câu</p>
        {data.truncated && <p className="muted small">Mỗi lô tối đa {data.limit} câu; duyệt xong sẽ tải phần tiếp.</p>}
        <fieldset>
          <legend>Xác nhận một lần cho cả lô</legend>
          {CLEAN_CHECKLIST.map((item, i) => (
            <label className="scope-v2-tick" key={item}>
              <input type="checkbox" checked={checked.includes(i)} onChange={e => setChecked(e.target.checked ? [...checked, i] : checked.filter(n => n !== i))}/>
              {item}
            </label>
          ))}
        </fieldset>
        <button className="btn primary" disabled={busy || !ready} onClick={() => run(data.items.map(i => i.question_id))}>
          Duyệt {data.items.length} câu sạch
        </button>
      </>}
      {plan && (
        <div className="warn-box" role="alert">
          <p>{plan.eligible.length} câu đủ điều kiện · {plan.requires_deep_review.length + plan.blocked.length} câu cần xem riêng.</p>
          <div className="practice-actions">
            {plan.eligible.length > 0 && <button className="btn primary" disabled={busy || !ready} onClick={() => run(plan.eligible.map(e => e.question_id))}>Duyệt {plan.eligible.length} câu đủ điều kiện</button>}
            <button className="btn" onClick={() => onFocusIds([...plan.requires_deep_review, ...plan.blocked].map(r => r.question_id))}>
              Xem {plan.requires_deep_review.length + plan.blocked.length} câu còn lại
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function QuestionTab({tab, params, setParams, user}) {
  const navigate = useNavigate();
  const [pageSize, setPageSize] = useState(30);
  const [offset, setOffset] = useState(0);
  const [activeId, setActiveId] = useState(null);
  const [deepId, setDeepId] = useState(null);
  const [codes, setCodes] = useState([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [requestedAction, setRequestedAction] = useState(null);
  const [scope, setScope] = useState('one');
  const [overrides, setOverrides] = useState({});
  const [lessonIds, setLessonIds] = useState(null);
  const chips = useRef(null);
  const inspector = useRef(null);
  const selection = useSelection();
  const undo = useUndo();
  const banks = useLoad(base + '/banks');
  const catalog = useLoad(base + '/catalog');
  const canApprove = hasAnyCapability(user, ['content.approve']);
  const canWrite = hasAnyCapability(user, ['content.write']);

  const search = useMemo(() => {
    const next = new URLSearchParams(params);
    next.delete('tab');
    for (const [key, value] of Object.entries(TAB_QUERY[tab])) next.set(key, value);
    if (tab === 'author' && !hasAnyCapability(user, ['content.review', 'content.approve'])) {
      next.set('created_by', String(user.id));
    }
    return next;
  }, [params, tab, user]);

  const listSearch = useMemo(() => {
    const next = new URLSearchParams(search);
    next.set('limit', String(pageSize));
    next.set('offset', String(offset));
    return next.toString();
  }, [search, pageSize, offset]);

  const queue = useQueue(listSearch);
  const reload = useCallback(() => { queue.reload(); setReloadKey(k => k + 1); }, [queue]);
  // Đổi một bộ lọc trên URL; bộ lọc ngoại lệ và tập "câu còn lại" loại trừ nhau.
  const setFilter = (name, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    if (name === 'exception') next.delete('ids');
    setParams(next);
  };
  const rows = queue.data?.items || [];
  const total = queue.data?.total || 0;
  useEffect(() => { setOffset(0); }, [search.toString(), pageSize]);
  useEffect(() => { selection.sync(rows); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const index = rows.findIndex(r => r.id === activeId);
  const active = index >= 0 ? rows[index] : null;
  const suggested = useMemo(() => suggestedReasons(active), [active]);
  // Mỗi câu mới: chọn sẵn lý do gợi ý từ kiểm tra máy, xóa ghi chú cũ.
  useEffect(() => { setCodes(suggested); setNote(''); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = useCallback(step => {
    if (!rows.length) return;
    const current = rows.findIndex(r => r.id === activeId);
    const next = current < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, current + step));
    setActiveId(rows[next].id);
  }, [rows, activeId]);

  // Một câu và năm trăm câu đi qua cùng một endpoint, nên chính sách và nhật ký không thể lệch nhau.
  const single = useCallback(async (row, action, reasonCodes = [], text = '') => {
    if (!row) return;
    if (action === 'request_changes' && !reasonCodes.length && !text.trim()) { chips.current?.querySelector('button')?.focus(); return; }
    setBusy(true); setError('');
    const at = rows.findIndex(r => r.id === row.id);
    try {
      await api.post(base + '/questions/bulk-workflow', {
        ids: [row.id], action, reason: action === 'request_changes' ? composeReason(reasonCodes, text) : '', reason_codes: reasonCodes,
        expected_versions: {[String(row.id)]: row.current_version_id},
      });
      const next = rows[at + 1];
      setActiveId(next ? next.id : null);
      undo.push(`${ACTION_LABELS[action]}: ${row.display_code}.`);
      reload();
    } catch (e) {
      const stopper = e.details?.requires_deep_review?.[0] || e.details?.blocked?.[0];
      setError(stopper ? `${stopper.question_code || row.display_code}: ${stopper.message}` : e.message);
    } finally { setBusy(false); }
  }, [rows, reload, undo]);

  const onApplied = useCallback(({message, items}) => {
    setError('');
    selection.refresh(items);
    undo.push(message, items.length ? async () => {
      const back = await api.post(base + '/questions/quick-edit', undoBody(items));
      selection.refresh(back.items || []);
      reload();
    } : null);
    reload();
  }, [selection, undo, reload]);

  const can = action => TAB_ACTIONS[tab].includes(action);
  useHotkeys({
    'j': () => move(1),
    'k': () => move(-1),
    ' ': () => active && selection.toggle(active.id, active.current_version_id),
    'x': () => active && selection.toggle(active.id, active.current_version_id),
    'a': () => active && can('approve') && single(active, 'approve'),
    'r': () => { if (!active || !can('request_changes')) return; if (codes.length || note.trim()) single(active, 'request_changes', codes, note); else chips.current?.querySelector('button')?.focus(); },
    's': () => active && can('submit') && single(active, 'submit'),
    'e': () => active && setDeepId(active.id),
    '1': () => tab === 'author' && inspector.current?.setLevel(1),
    '2': () => tab === 'author' && inspector.current?.setLevel(2),
    '3': () => tab === 'author' && inspector.current?.setLevel(3),
    '4': () => tab === 'author' && inspector.current?.setLevel(4),
    'b': () => tab === 'author' && inspector.current?.openLesson(),
    'g': () => selection.count > 1 && setScope(s => s === 'one' ? 'selection' : 'one'),
    'mod+k': () => setPaletteOpen(true),
    'mod+z': () => (undo.entry?.undo ? (undo.run(), true) : false),
    'escape': () => setPaletteOpen(false),
  }, !paletteOpen && !deepId && !lessonIds);

  const commands = query => {
    const list = [];
    if (active) {
      const group = 'Câu đang xem · ' + active.display_code;
      if (can('approve')) list.push({id: 'approve', group, label: 'Duyệt và sang câu sau', keywords: 'duyet', shortcut: 'A', run: () => single(active, 'approve')});
      if (can('submit')) list.push({id: 'submit', group, label: 'Gửi duyệt', keywords: 'gui duyet', shortcut: 'S', run: () => single(active, 'submit')});
      if (can('request_changes')) for (const reason of REJECT_REASONS) {
        list.push({id: 'back-' + reason.code, group, label: `Trả sửa: ${reason.label}`, keywords: 'tra sua', searchOnly: !suggested.includes(reason.code),
          hint: suggested.includes(reason.code) ? 'gợi ý' : undefined, run: () => single(active, 'request_changes', [reason.code])});
      }
      if (tab === 'author') LEVEL_CODES.forEach((code, i) => list.push({id: 'level-' + code, group, label: `Đặt mức ${code}`, keywords: 'muc', shortcut: String(i + 1), searchOnly: true, run: () => inspector.current?.setLevel(i + 1, 'one')}));
      list.push({id: 'deep', group, label: 'Xem kỹ (so sánh phiên bản)', keywords: 'xem ky', shortcut: 'E', run: () => setDeepId(active.id)});
    }
    if (selection.count) {
      const group = `Làm với ${selection.count} câu đang chọn`;
      for (const a of TAB_ACTIONS[tab]) list.push({id: 'bulk-' + a, group, label: `${ACTION_LABELS[a]} ${selection.count} câu…`, keywords: a, run: () => setRequestedAction({action: a, at: Date.now()})});
      list.push({id: 'clear', group, label: 'Bỏ chọn tất cả', keywords: 'bo chon', run: () => { selection.clear(); setOverrides({}); }});
    }
    for (const [key, label] of EXCEPTIONS) list.push({id: 'exc-' + (key || 'all'), group: 'Lọc', label: `Lọc: ${label}`, keywords: 'loc', run: () => setFilter('exception', key)});
    for (const t of TABS) list.push({id: 'tab-' + t.id, group: 'Đi tới', label: t.label, keywords: 'mo tab', run: () => { const next = new URLSearchParams(params); next.set('tab', t.id); setParams(next); }});
    list.push({id: 'banks', group: 'Đi tới', label: 'Bàn làm việc (Kho câu hỏi)', keywords: 'kho', run: () => navigate('/practice/banks')});
    if (undo.entry?.undo) list.push({id: 'undo', group: 'Chung', label: 'Hoàn tác: ' + undo.entry.message, keywords: 'hoan tac', shortcut: 'Ctrl Z', run: undo.run});
    const text = query.trim();
    if (text) list.push({id: 'search', group: 'Tìm', label: `Tìm “${text}” trong mã và nội dung câu`, keywords: text, run: () => setFilter('search', text)});
    return list;
  };

  const singleActions = active && (
    <div className="review-actions">
      <p className="review-counter">Câu {index + 1} / {rows.length}{total > rows.length ? ` (trang này, tổng ${total})` : ''}</p>
      <div className="practice-actions">
        <button className="btn" disabled={busy || index <= 0} onClick={() => move(-1)} aria-label="Câu trước">←</button>
        {can('submit') && <button className="btn primary" disabled={busy} onClick={() => single(active, 'submit')}>Gửi duyệt <kbd>S</kbd></button>}
        {can('approve') && <button className="btn primary" disabled={busy} onClick={() => single(active, 'approve')}>Duyệt <kbd>A</kbd></button>}
        <button className="btn" disabled={busy || index >= rows.length - 1} onClick={() => move(1)} aria-label="Câu sau">→</button>
      </div>
      {can('request_changes') && (
        <div className="reason-inline" ref={chips}>
          <p className="quick-label">Lý do trả sửa {suggested.length > 0 && <span className="muted small">· viền cam là gợi ý từ kiểm tra máy</span>}</p>
          <ReasonChips codes={codes} onChange={setCodes} suggested={suggested}/>
          <label className="sr-only" htmlFor="reason-note">Ghi chú thêm</label>
          <input id="reason-note" type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Ghi chú thêm (không bắt buộc)"/>
          <button className="btn" disabled={busy || (!codes.length && !note.trim())} onClick={() => single(active, 'request_changes', codes, note)}>
            Trả sửa{codes.length ? ` (${codes.length} lý do)` : ''} <kbd>R</kbd>
          </button>
        </div>
      )}
      {tab === 'author' && canWrite && (
        <QuickInspector ref={inspector} row={active} selection={selection} overrides={overrides} keepOverrides
                        onOverride={id => setOverrides(o => ({...o, [id]: true}))} scope={scope} onScope={setScope}
                        topics={catalog.data?.topics || []} onApplied={onApplied} onError={setError} onOpenLessonDialog={setLessonIds}/>
      )}
    </div>
  );

  return (
    <>
      <SimpleFilterBar params={params} setParams={setParams} catalog={catalog.data} hideKeys={['lifecycle', 'review_status']}/>
      <div className="exception-filters" role="group" aria-label="Lọc theo ngoại lệ">
        {EXCEPTIONS.map(([key, label]) => (
          <button key={key || 'all'} className={'btn' + ((params.get('exception') || '') === key ? ' primary' : '')}
                  aria-pressed={(params.get('exception') || '') === key}
                  onClick={() => setFilter('exception', key)}>
            {label}
          </button>
        ))}
        {params.get('ids') && <button className="btn" onClick={() => setFilter('ids', '')}>
          Bỏ lọc {params.get('ids').split(',').length} câu đang xem</button>}
        <button className="btn" onClick={() => setPaletteOpen(true)}>Bảng lệnh <kbd>Ctrl K</kbd></button>
      </div>
      {params.get('import_job_id') &&
        <p className="ok-box">Đang xem nhóm câu vừa nhập. Phạm vi môn, khối và kho vẫn áp dụng như bình thường.</p>}
      <ErrorBox error={error || queue.error}/>
      {tab === 'pending' && canApprove && !params.get('ids') && (params.get('exception') || '') !== 'clean' &&
        <CleanBatch search={search} reloadKey={reloadKey} onDone={() => { reload(); setActiveId(null); }}
                    onFocusIds={ids => setFilter('ids', ids.join(','))}/>}
      <div className="practice-actions select-actions">
        <button className="btn" onClick={() => selection.setRows(rows, true)}>Chọn trang này ({rows.length})</button>
        <button className="btn" onClick={() => selection.selectFiltered(search.toString()).catch(e => setError(e.message))}>
          Chọn tất cả kết quả ({total})
        </button>
      </div>
      {selection.count > 0 &&
        <BulkQuestionToolbar selection={selection} actions={TAB_ACTIONS[tab]} banks={banks.data || []} requestedAction={requestedAction}
                             onDone={() => { reload(); setActiveId(null); setOverrides({}); }}
                             onClear={() => { selection.clear(); setOverrides({}); setScope('one'); }}
                             onFocusIds={ids => { setFilter('ids', ids.join(',')); selection.clear(); }}/>}
      {lessonIds && <LessonAssignDialog ids={lessonIds} onClose={() => setLessonIds(null)}
                                        onDone={result => {
                                          selection.refresh(result.items || []);
                                          undo.push(`Đã gắn Bài cho ${result.assigned} câu.`, result.items?.length ? async () => {
                                            await api.post(base + '/questions/quick-edit', undoLessonBody(result)); reload();
                                          } : null);
                                          reload();
                                        }}/>}
      <p className="queue-hint">Phím tắt: J/K chuyển câu · Space/X chọn · A duyệt · R trả sửa · S gửi duyệt · E xem kỹ · Ctrl K bảng lệnh · Shift+tick chọn cả đoạn.</p>
      <div className="queue-layout">
        <QuestionQueueTable rows={rows} selection={selection} activeId={activeId} onActivate={row => setActiveId(row.id)}
                            badges={Object.fromEntries(Object.keys(overrides).map(id => [id, 'chỉnh riêng']))}
                            pageSize={pageSize} onPageSize={setPageSize} total={total} offset={offset} onOffset={setOffset}/>
        <QuestionPreviewPane row={active} onDeepReview={row => setDeepId(row.id)} actions={singleActions}/>
      </div>
      {/* Panel rà soát sâu chỉ mở khi người dùng bấm "Xem kỹ" hoặc khi câu có rủi ro. */}
      {deepId && <QuestionReviewPanel id={deepId} onClose={() => setDeepId(null)} onChanged={reload}/>}
      <UndoToast undo={undo}/>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands}/>
    </>
  );
}

export default function ReviewWorkspace() {
  const {user} = useAuth();
  const [params, setParams] = useSearchParams();
  const allowed = TABS.filter(t => hasAnyCapability(user, t.capabilities));
  const requested = params.get('tab');
  // Người duyệt mở thẳng "Chờ duyệt"; người chỉ biên soạn mở "Bản nháp của tôi".
  const preferred = hasAnyCapability(user, ['content.review', 'content.approve']) ? 'pending' : 'author';
  const tab = allowed.some(t => t.id === requested) ? requested : (allowed.find(t => t.id === preferred)?.id || allowed[0]?.id);
  const setTab = id => {
    const next = new URLSearchParams(params);
    next.set('tab', id);
    setParams(next);
  };
  if (!tab) {
    return <WorkspaceShell title="Duyệt câu"><p>Tài khoản chưa được giao quyền biên soạn hoặc duyệt nội dung.</p></WorkspaceShell>;
  }
  return (
    <WorkspaceShell>
      <nav className="queue-tabs" aria-label="Khu vực duyệt">
        {allowed.map(t => (
          <button key={t.id} className={'btn' + (t.id === tab ? ' primary' : '')} aria-current={t.id === tab}
                  onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      {tab === 'cases'
        ? <ReviewCaseQueue/>
        : <QuestionTab key={tab} tab={tab} params={params} setParams={setParams} user={user}/>}
    </WorkspaceShell>
  );
}
