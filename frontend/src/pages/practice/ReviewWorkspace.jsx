import {useCallback, useEffect, useMemo, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {api} from '../../api/client.js';
import {useAuth, hasAnyCapability} from '../../hooks/useAuth.js';
import {base, useLoad, ErrorBox} from './shared.jsx';
import QuestionReviewPanel from './QuestionReviewPanel.jsx';
import ReviewCaseQueue from './ReviewQueue.jsx';
import BulkQuestionToolbar from './queue/BulkQuestionToolbar.jsx';
import {useQueue, useSelection, QuestionQueueTable, QuestionPreviewPane} from './queue/QuestionQueue.jsx';
import WorkspaceShell from './workspace/WorkspaceShell.jsx';
import SimpleFilterBar from './workspace/SimpleFilterBar.jsx';

const TABS = [
  {id: 'author', label: 'Bản nháp của tôi', capabilities: ['content.write']},
  {id: 'pending', label: 'Chờ duyệt', capabilities: ['content.review', 'content.approve']},
  {id: 'cases', label: 'Cần xem kỹ', capabilities: ['content.review', 'content.approve']},
];

const TAB_QUERY = {
  author: {lifecycle: 'draft', review_status: 'DRAFT'},
  pending: {review_status: 'PENDING_REVIEW'},
};
const TAB_ACTIONS = {
  author: ['submit'],
  pending: ['approve', 'request_changes', 'reject'],
};

function QuestionTab({tab, params, setParams, user}) {
  const [pageSize, setPageSize] = useState(30);
  const [offset, setOffset] = useState(0);
  const [activeId, setActiveId] = useState(null);
  const [deepId, setDeepId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selection = useSelection();
  const banks = useLoad(base + '/banks');
  const catalog = useLoad(base + '/catalog');

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
  const rows = queue.data?.items || [];
  const total = queue.data?.total || 0;
  useEffect(() => { setOffset(0); }, [search.toString(), pageSize]);
  const index = rows.findIndex(r => r.id === activeId);
  const active = index >= 0 ? rows[index] : null;

  const move = useCallback(step => {
    if (!rows.length) return;
    const current = rows.findIndex(r => r.id === activeId);
    const next = current < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, current + step));
    setActiveId(rows[next].id);
  }, [rows, activeId]);

  // Một câu và năm trăm câu đi qua cùng một endpoint, nên chính sách và nhật ký không thể lệch nhau.
  const single = useCallback(async (row, action) => {
    if (!row) return;
    let reason = '';
    if (action === 'request_changes') {
      reason = window.prompt('Lý do trả sửa') || '';
      if (!reason.trim()) return;
    }
    setBusy(true); setError('');
    const at = rows.findIndex(r => r.id === row.id);
    try {
      await api.post(base + '/questions/bulk-workflow', {
        ids: [row.id], action, reason: reason.trim(),
        expected_versions: {[String(row.id)]: row.current_version_id},
      });
      const next = rows[at + 1];
      setActiveId(next ? next.id : null);
      queue.reload();
    } catch (e) {
      const stopper = e.details?.requires_deep_review?.[0] || e.details?.blocked?.[0];
      setError(stopper ? `${stopper.question_code || row.display_code}: ${stopper.message}` : e.message);
    } finally { setBusy(false); }
  }, [rows, queue]);

  useEffect(() => {
    const handler = event => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'j') { event.preventDefault(); move(1); }
      else if (key === 'k') { event.preventDefault(); move(-1); }
      else if (event.key === ' ' && active) { event.preventDefault(); selection.toggle(active.id, active.current_version_id); }
      else if (key === 'a' && active && TAB_ACTIONS[tab].includes('approve')) { event.preventDefault(); single(active, 'approve'); }
      else if (key === 'r' && active && TAB_ACTIONS[tab].includes('request_changes')) { event.preventDefault(); single(active, 'request_changes'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [move, active, tab, single, selection]);

  const singleActions = active && (
    <div className="review-actions">
      <p className="review-counter">Câu {index + 1} / {rows.length}{total > rows.length ? ` (trang này, tổng ${total})` : ''}</p>
      <div className="practice-actions">
        <button className="btn" disabled={busy || index <= 0} onClick={() => move(-1)} aria-label="Câu trước">←</button>
        {TAB_ACTIONS[tab].includes('submit') && <button className="btn primary" disabled={busy} onClick={() => single(active, 'submit')}>Gửi duyệt</button>}
        {TAB_ACTIONS[tab].includes('request_changes') && <button className="btn" disabled={busy} onClick={() => single(active, 'request_changes')}>Trả sửa</button>}
        {TAB_ACTIONS[tab].includes('approve') && <button className="btn primary" disabled={busy} onClick={() => single(active, 'approve')}>Duyệt</button>}
        <button className="btn" disabled={busy || index >= rows.length - 1} onClick={() => move(1)} aria-label="Câu sau">→</button>
      </div>
    </div>
  );

  return (
    <>
      <SimpleFilterBar params={params} setParams={setParams} catalog={catalog.data} hideKeys={['lifecycle', 'review_status']}/>
      {params.get('import_job_id') &&
        <p className="ok-box">Đang xem nhóm câu vừa nhập. Phạm vi môn, khối và kho vẫn áp dụng như bình thường.</p>}
      <ErrorBox error={error || queue.error}/>
      <div className="practice-actions select-actions">
        <button className="btn" onClick={() => selection.setRows(rows, true)}>Chọn trang này ({rows.length})</button>
        <button className="btn" onClick={() => selection.selectFiltered(search.toString()).catch(e => setError(e.message))}>
          Chọn tất cả kết quả ({total})
        </button>
      </div>
      {selection.count > 0 &&
        <BulkQuestionToolbar selection={selection} actions={TAB_ACTIONS[tab]} banks={banks.data || []}
                             onDone={() => { queue.reload(); setActiveId(null); }}/>}
      <p className="queue-hint">Phím tắt: J/K chuyển câu · Space chọn · A duyệt · R trả sửa. Không chạy khi con trỏ đang ở ô nhập liệu.</p>
      <div className="queue-layout">
        <QuestionQueueTable rows={rows} selection={selection} activeId={activeId} onActivate={row => setActiveId(row.id)}
                            pageSize={pageSize} onPageSize={setPageSize} total={total} offset={offset} onOffset={setOffset}/>
        <QuestionPreviewPane row={active} onDeepReview={row => setDeepId(row.id)} actions={singleActions}/>
      </div>
      {/* Panel rà soát sâu chỉ mở khi người dùng bấm "Xem kỹ" hoặc khi câu có rủi ro. */}
      {deepId && <QuestionReviewPanel id={deepId} onClose={() => setDeepId(null)} onChanged={queue.reload}/>}
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
