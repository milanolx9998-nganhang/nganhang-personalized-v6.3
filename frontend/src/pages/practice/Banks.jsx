import {useCallback, useEffect, useMemo, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {api, downloadFile} from '../../api/client.js';
import {useAuth} from '../../hooks/useAuth.js';
import {base, useLoad, ErrorBox} from './shared.jsx';
import BankScopeFilters from './BankScopeFilters.jsx';
import QuestionQuality from './QuestionQuality.jsx';
import QuestionReviewPanel from './QuestionReviewPanel.jsx';
import BulkQuestionToolbar from './queue/BulkQuestionToolbar.jsx';
import {useQueue, useSelection, QuestionQueueTable, QuestionPreviewPane, QueueExtraFilters} from './queue/QuestionQueue.jsx';
import {QuestionEditor} from './Teacher.jsx';

const NEW_DRAFT = params => ({
  type: ({mcq4: 'multiple_choice', short: 'short_answer'}[params.get('q_type')] || params.get('q_type') || 'multiple_choice'),
  grade: Number(params.get('grade')) || 7,
  subject_id: Number(params.get('subject_id')) || null,
  topic_id: Number(params.get('topic_id')) || null,
  yccd_id: Number(params.get('yccd_id')) || null,
  outcome_id: Number(params.get('outcome_id')) || null,
  branch_id: Number(params.get('branch_id')) || null,
  cognitive_level: Number(params.get('cognitive_level')?.slice(1)) || null,
  stem: '',
  answer: {correct: ''},
  options: ['A', 'B', 'C', 'D'].map(id => ({id, text: ''})),
});

export default function Banks() {
  const {user} = useAuth();
  const readOnly = !user.capabilities?.content_write;
  const [params, setParams] = useSearchParams();
  const [pageSize, setPageSize] = useState(30);
  const [offset, setOffset] = useState(0);
  const [activeId, setActiveId] = useState(null);
  const [deepId, setDeepId] = useState(null);
  const [editor, setEditor] = useState(null);
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selection = useSelection();
  const banks = useLoad(base + '/banks');
  const catalog = useLoad(base + '/catalog');

  const search = useMemo(() => {
    const next = new URLSearchParams(params);
    next.delete('tab');
    return next;
  }, [params]);
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

  const bulkActions = useMemo(() => {
    const out = [];
    if (user.capabilities?.['content.write']) out.push('submit');
    if (user.capabilities?.['content.approve']) out.push('approve', 'activate');
    if (user.capabilities?.['content.review']) out.push('request_changes', 'reject');
    if (user.capabilities?.['content.write']) out.push('archive');
    return out.length ? out : ['submit'];
  }, [user]);

  // The editor needs the full version (answers included); the queue payload deliberately omits it.
  const openEditor = useCallback(async row => {
    setError('');
    try {
      const detail = await api.get(base + '/questions/' + row.id + '/compare');
      setEditor({id: row.id, version: detail.question.current_version_id, draft: detail.after.content});
    } catch (e) { setError('Không mở được bản đầy đủ để sửa: ' + e.message); }
  }, []);

  async function save() {
    setBusy(true);
    try {
      if (editor.id) await api.put(`${base}/questions/${editor.id}`, {...editor.draft, question_version_id: editor.version});
      else await api.post(base + '/questions', editor.draft);
      setEditor(null);
      queue.reload();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const single = useCallback(async (row, action) => {
    let reason = '';
    if (action === 'request_changes') {
      reason = window.prompt('Lý do yêu cầu sửa') || '';
      if (!reason.trim()) return;
    }
    setBusy(true); setError('');
    try {
      await api.post(base + '/questions/bulk-workflow', {
        ids: [row.id], action, reason: reason.trim(),
        expected_versions: {[String(row.id)]: row.current_version_id},
      });
      queue.reload();
    } catch (e) {
      const stopper = e.details?.requires_deep_review?.[0] || e.details?.blocked?.[0];
      setError(stopper ? `${stopper.question_code || row.display_code}: ${stopper.message}` : e.message);
    } finally { setBusy(false); }
  }, [queue]);

  const singleActions = active && !readOnly && (
    <div className="practice-actions">
      <button className="btn" disabled={busy} onClick={() => openEditor(active)}>Sửa</button>
      <button className="btn" disabled={busy} onClick={async () => {
        try { await api.post(`${base}/questions/${active.id}/copy`, {}); queue.reload(); }
        catch (e) { setError(e.message); }
      }}>Sao chép về kho cá nhân</button>
      {active.review_status === 'DRAFT' && <button className="btn primary" disabled={busy} onClick={() => single(active, 'submit')}>Gửi duyệt</button>}
      {active.review_status === 'PENDING_REVIEW' && user.capabilities?.['content.approve'] &&
        <button className="btn primary" disabled={busy} onClick={() => single(active, 'approve')}>Duyệt</button>}
      {active.review_status === 'PENDING_REVIEW' && user.capabilities?.['content.review'] &&
        <button className="btn" disabled={busy} onClick={() => single(active, 'request_changes')}>Yêu cầu sửa</button>}
      {active.lifecycle === 'approved' && user.capabilities?.['content.approve'] &&
        <button className="btn" disabled={busy} onClick={() => single(active, 'activate')}>Đưa vào luyện</button>}
      <button className="btn" disabled={busy} onClick={async () => {
        try { setVersions(await api.get(`${base}/questions/${active.id}/versions`)); }
        catch (e) { setError(e.message); }
      }}>Lịch sử phiên bản</button>
    </div>
  );

  return (
    <section className="practice-page">
      <h1>Kho câu hỏi</h1>
      <BankScopeFilters params={params} setParams={setParams} catalog={catalog.data}/>
      <QueueExtraFilters params={params} setParams={setParams} authors={authors}/>
      {params.get('yccd_id') &&
        <p className="ok-box">Đang lọc theo ô ma trận: YCCĐ #{params.get('yccd_id')} · {params.get('cognitive_level')} · {params.get('q_type')}. Câu mới sẽ được điền phạm vi này.</p>}
      <div className="practice-actions">
        <button className="btn" onClick={() => downloadFile(base + '/questions-export?' + search.toString(), 'cau-hoi-advanced.xlsx').catch(e => setError(e.message))}>
          Xuất Excel nâng cao · bộ lọc hiện tại
        </button>
        {!readOnly && <button className="btn primary" onClick={() => setEditor({draft: NEW_DRAFT(params)})}>Thêm câu hỏi</button>}
      </div>
      <QuestionQuality query={search.toString()}/>
      <ErrorBox error={error || queue.error}/>
      {editor && <article className="practice-card">
        <QuestionEditor value={editor.draft} catalog={catalog.data} onChange={draft => setEditor({...editor, draft})}/>
        <div className="practice-actions">
          <button className="btn primary" disabled={busy} onClick={save}>Lưu phiên bản</button>
          <button className="btn" onClick={() => setEditor(null)}>Đóng</button>
        </div>
      </article>}
      <div className="practice-actions">
        <button className="btn" onClick={() => selection.setRows(rows, true)}>Chọn tất cả trang này ({rows.length})</button>
        <button className="btn" onClick={() => selection.selectFiltered(search.toString()).catch(e => setError(e.message))}>
          Chọn tất cả theo bộ lọc ({total})
        </button>
      </div>
      {!readOnly && <BulkQuestionToolbar selection={selection} actions={bulkActions} banks={banks.data || []}
                                         onDone={() => { queue.reload(); setActiveId(null); }}/>}
      <div className="queue-layout">
        <QuestionQueueTable rows={rows} selection={selection} activeId={activeId} onActivate={row => setActiveId(row.id)}
                            pageSize={pageSize} onPageSize={setPageSize} total={total} offset={offset} onOffset={setOffset}/>
        <QuestionPreviewPane row={active} onDeepReview={row => setDeepId(row.id)} actions={singleActions}/>
      </div>
      {deepId && <QuestionReviewPanel id={deepId} onClose={() => setDeepId(null)} onChanged={queue.reload}/>}
      {versions && <article className="practice-card">
        <header className="section-heading"><h2>Lịch sử bất biến</h2><button className="btn" onClick={() => setVersions(null)}>Đóng</button></header>
        {versions.map(v => <details key={v.id}>
          <summary>v{v.version_number} · {new Date(v.created_at).toLocaleString('vi-VN')}</summary>
          <p>{v.content?.stem || v.content?.stem_text}</p>
        </details>)}
      </article>}
    </section>
  );
}
