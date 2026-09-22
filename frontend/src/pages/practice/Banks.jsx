import {useCallback, useEffect, useMemo, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {api, downloadFile} from '../../api/client.js';
import {useAuth} from '../../hooks/useAuth.js';
import {base, useLoad, ErrorBox} from './shared.jsx';
import QuestionQuality from './QuestionQuality.jsx';
import QuestionReviewPanel from './QuestionReviewPanel.jsx';
import BulkQuestionToolbar from './queue/BulkQuestionToolbar.jsx';
import {useQueue, useSelection, QuestionQueueTable, QuestionPreviewPane} from './queue/QuestionQueue.jsx';
import WorkspaceShell from './workspace/WorkspaceShell.jsx';
import SimpleFilterBar from './workspace/SimpleFilterBar.jsx';
import LessonAssignDialog from './workspace/LessonAssignDialog.jsx';
import RejectReasonPopover from './workspace/RejectReasonPopover.jsx';
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
  const [assigning, setAssigning] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selection = useSelection();
  const banks = useLoad(base + '/banks');
  const catalog = useLoad(base + '/catalog');

  const search = useMemo(() => new URLSearchParams(params), [params]);
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
  const unassigned = rows.filter(r => !r.topic_name).length;

  const bulkActions = useMemo(() => {
    const out = [];
    if (user.capabilities?.['content.write']) out.push('submit');
    if (user.capabilities?.['content.approve']) out.push('approve', 'activate');
    if (user.capabilities?.['content.review']) out.push('request_changes', 'reject');
    if (user.capabilities?.['content.write']) out.push('archive');
    return out.length ? out : ['submit'];
  }, [user]);

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

  const single = useCallback(async (row, action, reason = '') => {
    if (action === 'request_changes' && !reason.trim()) { setRejecting(row.id); return; }
    setBusy(true); setError('');
    try {
      await api.post(base + '/questions/bulk-workflow', {
        ids: [row.id], action, reason: reason.trim(),
        expected_versions: {[String(row.id)]: row.current_version_id},
      });
      setRejecting(null);
      queue.reload();
    } catch (e) {
      const stopper = e.details?.requires_deep_review?.[0] || e.details?.blocked?.[0];
      setError(stopper ? `${stopper.question_code || row.display_code}: ${stopper.message}` : e.message);
    } finally { setBusy(false); }
  }, [queue]);

  const singleActions = active && !readOnly && (
    <div className="practice-actions">
      <button className="btn" disabled={busy} onClick={() => openEditor(active)}>Sửa</button>
      {active.review_status === 'DRAFT' && <button className="btn primary" disabled={busy} onClick={() => single(active, 'submit')}>Gửi duyệt</button>}
      {active.review_status === 'PENDING_REVIEW' && user.capabilities?.['content.approve'] &&
        <button className="btn primary" disabled={busy} onClick={() => single(active, 'approve')}>Duyệt</button>}
      {active.review_status === 'PENDING_REVIEW' && user.capabilities?.['content.review'] &&
        <button className="btn" disabled={busy} onClick={() => setRejecting(active.id)}>Trả sửa</button>}
      <button className="btn" disabled={busy} onClick={async () => {
        try { await api.post(`${base}/questions/${active.id}/copy`, {}); queue.reload(); }
        catch (e) { setError(e.message); }
      }}>Sao chép</button>
      {rejecting === active.id && (
        <RejectReasonPopover busy={busy} onCancel={() => setRejecting(null)}
                             onSubmit={({reason}) => single(active, 'request_changes', reason)}/>
      )}
    </div>
  );

  return (
    <WorkspaceShell
      actions={<>
        <button className="btn" onClick={() => downloadFile(base + '/questions-export?' + search.toString(), 'cau-hoi.xlsx').catch(e => setError(e.message))}>Xuất Excel</button>
        {!readOnly && <button className="btn primary" onClick={() => setEditor({draft: NEW_DRAFT(params)})}>Thêm câu hỏi</button>}
      </>}>
      <SimpleFilterBar params={params} setParams={setParams} catalog={catalog.data}/>
      {params.get('import_job_id') &&
        <p className="ok-box">Đang xem nhóm câu vừa nhập. Phạm vi môn, khối và kho vẫn áp dụng như bình thường.</p>}
      <ErrorBox error={error || queue.error}/>
      {message && <p className="ok-box" role="status">{message}</p>}

      {unassigned > 0 && !params.get('lesson_status') && (
        <p className="warn-box">
          {unassigned} câu trong trang này chưa gắn Bài.{' '}
          <button className="btn" onClick={() => { const next = new URLSearchParams(params); next.set('lesson_status', 'UNASSIGNED'); setParams(next); }}>
            Chỉ hiện câu chưa gắn Bài
          </button>
        </p>
      )}

      {editor && <article className="practice-card">
        <QuestionEditor value={editor.draft} catalog={catalog.data} onChange={draft => setEditor({...editor, draft})}/>
        <div className="practice-actions">
          <button className="btn primary" disabled={busy} onClick={save}>Lưu</button>
          <button className="btn" onClick={() => setEditor(null)}>Đóng</button>
        </div>
      </article>}

      <div className="practice-actions select-actions">
        <button className="btn" onClick={() => selection.setRows(rows, true)}>Chọn trang này ({rows.length})</button>
        <button className="btn" onClick={() => selection.selectFiltered(search.toString()).catch(e => setError(e.message))}>
          Chọn tất cả kết quả ({total})
        </button>
      </div>

      {/* Không chọn câu nào thì không có thanh thao tác hàng loạt. */}
      {!readOnly && selection.count > 0 &&
        <BulkQuestionToolbar selection={selection} actions={bulkActions} banks={banks.data || []}
                             onDone={() => { queue.reload(); setActiveId(null); }}
                             extraActions={<button className="btn" onClick={() => setAssigning(true)}>Gán Bài</button>}/>}
      {assigning && <LessonAssignDialog ids={selection.ids} onClose={() => setAssigning(false)}
                                        onDone={result => { setMessage(`Đã gắn Bài cho ${result.assigned} câu.`); selection.clear(); queue.reload(); }}/>}

      <div className="queue-layout">
        <QuestionQueueTable rows={rows} selection={selection} activeId={activeId} onActivate={row => setActiveId(row.id)}
                            pageSize={pageSize} onPageSize={setPageSize} total={total} offset={offset} onOffset={setOffset}/>
        <QuestionPreviewPane row={active} onDeepReview={row => setDeepId(row.id)} actions={singleActions}/>
      </div>
      {deepId && <QuestionReviewPanel id={deepId} onClose={() => setDeepId(null)} onChanged={queue.reload}/>}
      <details className="practice-card">
        <summary>Chất lượng và mức sử dụng câu hỏi</summary>
        <QuestionQuality query={search.toString()}/>
      </details>
    </WorkspaceShell>
  );
}
