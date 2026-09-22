import {useCallback, useEffect, useMemo, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {api} from '../../api/client.js';
import {useAuth, hasAnyCapability} from '../../hooks/useAuth.js';
import {base, useLoad, ErrorBox} from './shared.jsx';
import BankScopeFilters from './BankScopeFilters.jsx';
import QuestionReviewPanel from './QuestionReviewPanel.jsx';
import ReviewCaseQueue from './ReviewQueue.jsx';
import BulkQuestionToolbar from './queue/BulkQuestionToolbar.jsx';
import {useQueue, useSelection, QuestionQueueTable, QuestionPreviewPane, QueueExtraFilters} from './queue/QuestionQueue.jsx';

const TABS = [
  {id: 'author', label: 'Cần gửi duyệt', capabilities: ['content.write']},
  {id: 'pending', label: 'Chờ duyệt', capabilities: ['content.review', 'content.approve']},
  {id: 'cases', label: 'Hồ sơ sự cố', capabilities: ['content.review', 'content.approve']},
];

// Tab A is the author's own drafts; tab B is everything waiting on a reviewer. Keeping them as
// separate server-side filters is what makes "select all matching the filter" safe to bulk-act on.
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
    // An author without review rights only ever acts on their own drafts.
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
  const active = rows.find(r => r.id === activeId) || null;
  const authors = useMemo(() => {
    const seen = new Map();
    for (const r of rows) if (r.creator_id && r.author_name) seen.set(r.creator_id, {id: r.creator_id, full_name: r.author_name});
    return [...seen.values()];
  }, [rows]);

  const move = useCallback(step => {
    if (!rows.length) return;
    const index = rows.findIndex(r => r.id === activeId);
    const next = index < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, index + step));
    setActiveId(rows[next].id);
  }, [rows, activeId]);

  // Fast single review goes through the same bulk endpoint as a batch, so one question and five
  // hundred obey identical policy, audit and stale-version rules.
  const single = useCallback(async (row, action) => {
    if (!row) return;
    let reason = '';
    if (action === 'request_changes') {
      reason = window.prompt('Lý do yêu cầu sửa') || '';
      if (!reason.trim()) return;
    }
    setBusy(true); setError('');
    const index = rows.findIndex(r => r.id === row.id);
    try {
      await api.post(base + '/questions/bulk-workflow', {
        ids: [row.id], action, reason: reason.trim(),
        expected_versions: {[String(row.id)]: row.current_version_id},
      });
      const next = rows[index + 1];
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
    <div className="practice-actions">
      {TAB_ACTIONS[tab].includes('submit') && <button className="btn primary" disabled={busy} onClick={() => single(active, 'submit')}>Gửi duyệt câu này</button>}
      {TAB_ACTIONS[tab].includes('approve') && <button className="btn primary" disabled={busy} onClick={() => single(active, 'approve')}>Duyệt (A)</button>}
      {TAB_ACTIONS[tab].includes('request_changes') && <button className="btn" disabled={busy} onClick={() => single(active, 'request_changes')}>Yêu cầu sửa (R)</button>}
    </div>
  );

  return (
    <>
      <BankScopeFilters params={params} setParams={setParams} catalog={catalog.data}/>
      <QueueExtraFilters params={params} setParams={setParams} authors={authors}/>
      {params.get('import_job_id') &&
        <p className="ok-box">Đang lọc theo đợt nhập <code>{params.get('import_job_id')}</code>. Phạm vi môn, khối và kho vẫn áp dụng như bình thường.</p>}
      <ErrorBox error={error || queue.error}/>
      <div className="practice-actions">
        <button className="btn" onClick={() => selection.setRows(rows, true)}>Chọn tất cả trang này ({rows.length})</button>
        <button className="btn" onClick={() => selection.selectFiltered(search.toString()).catch(e => setError(e.message))}>
          Chọn tất cả theo bộ lọc ({total})
        </button>
      </div>
      <BulkQuestionToolbar selection={selection} actions={TAB_ACTIONS[tab]} banks={banks.data || []}
                           onDone={() => { queue.reload(); setActiveId(null); }}/>
      <p className="queue-hint">Phím tắt: J/K chuyển câu · Space chọn · A duyệt · R yêu cầu sửa. Phím tắt không chạy khi con trỏ đang ở ô nhập liệu.</p>
      <div className="queue-layout">
        <QuestionQueueTable rows={rows} selection={selection} activeId={activeId} onActivate={row => setActiveId(row.id)}
                            pageSize={pageSize} onPageSize={setPageSize} total={total} offset={offset} onOffset={setOffset}/>
        <QuestionPreviewPane row={active} onDeepReview={row => setDeepId(row.id)} actions={singleActions}/>
      </div>
      {deepId && <QuestionReviewPanel id={deepId} onClose={() => setDeepId(null)} onChanged={queue.reload}/>}
    </>
  );
}

export default function ReviewWorkspace() {
  const {user} = useAuth();
  const [params, setParams] = useSearchParams();
  const allowed = TABS.filter(t => hasAnyCapability(user, t.capabilities));
  const requested = params.get('tab');
  const tab = allowed.some(t => t.id === requested) ? requested : allowed[0]?.id;
  const setTab = id => {
    const next = new URLSearchParams(params);
    next.set('tab', id);
    setParams(next);
  };
  if (!tab) return <section className="practice-page"><h1>Duyệt câu hỏi</h1><p>Tài khoản chưa được giao quyền biên soạn hoặc duyệt nội dung.</p></section>;
  return (
    <section className="practice-page">
      <h1>Duyệt câu hỏi</h1>
      <p>Gửi duyệt, duyệt phiên bản và hồ sơ sự cố nằm cùng một nơi. Mọi thao tác vẫn đi qua phân quyền, quy trình phiên bản và nhật ký như duyệt từng câu.</p>
      <nav className="queue-tabs" aria-label="Khu vực duyệt">
        {allowed.map(t => (
          <button key={t.id} className={'btn' + (t.id === tab ? ' primary' : '')} aria-current={t.id === tab}
                  onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      {tab === 'cases'
        ? <ReviewCaseQueue/>
        : <QuestionTab key={tab} tab={tab} params={params} setParams={setParams} user={user}/>}
    </section>
  );
}
