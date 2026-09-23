import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {api, downloadFile} from '../../api/client.js';
import {useAuth} from '../../hooks/useAuth.js';
import {base, useLoad, ErrorBox} from './shared.jsx';
import QuestionQuality from './QuestionQuality.jsx';
import QuestionReviewPanel from './QuestionReviewPanel.jsx';
import BulkQuestionToolbar, {ACTION_LABELS} from './queue/BulkQuestionToolbar.jsx';
import {useQueue, useSelection, QuestionQueueTable, QuestionPreviewPane} from './queue/QuestionQueue.jsx';
import WorkspaceShell from './workspace/WorkspaceShell.jsx';
import SimpleFilterBar from './workspace/SimpleFilterBar.jsx';
import LessonAssignDialog from './workspace/LessonAssignDialog.jsx';
import RejectReasonPopover from './workspace/RejectReasonPopover.jsx';
import WorkViews, {useWorkViews} from './workspace/WorkViews.jsx';
import QuickInspector, {LEVEL_CODES, undoOperation} from './workspace/QuickInspector.jsx';
import CommandPalette from './workspace/CommandPalette.jsx';
import UndoToast, {useUndo} from './workspace/UndoToast.jsx';
import {useHotkeys} from './workspace/useHotkeys.js';
import ExceptionChips, {useExceptionCounts} from './workspace/ExceptionChips.jsx';
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

const EXCEPTION_FILTERS = [
  ['clean', 'Sạch'], ['level', 'Cần xem mức'], ['lesson', 'Chưa gắn Bài'],
  ['duplicate', 'Nghi trùng'], ['metadata', 'Lỗi metadata'], ['media', 'Media'],
];
const ARROW_LEFT = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>;
const ARROW_RIGHT = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>;
const FORM_FILTERS = {mcq4: 'TN', true_false: 'ĐS', short: 'TLN', matching: 'GN', essay: 'TL'};

// V6.6.6 — bàn làm việc hợp nhất: góc nhìn bên trái, lưới ở giữa, khung xem + sửa nhanh bên phải.
// Lô đang chọn không mất khi sửa riêng từng câu; mọi lệnh sửa phân loại hoàn tác được; Ctrl+K mở bảng lệnh.
export default function Banks() {
  const {user} = useAuth();
  const navigate = useNavigate();
  const readOnly = !user.capabilities?.content_write && !user.capabilities?.['content.write'];
  const [params, setParams] = useSearchParams();
  const [pageSize, setPageSize] = useState(30);
  const [offset, setOffset] = useState(0);
  const [activeId, setActiveId] = useState(null);
  const [deepId, setDeepId] = useState(null);
  const [editor, setEditor] = useState(null);
  const [lessonIds, setLessonIds] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState('one');
  const [overrides, setOverrides] = useState({});
  const [keepOverrides, setKeepOverrides] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [viewsKey, setViewsKey] = useState(0);
  const [requestedAction, setRequestedAction] = useState(null);
  const inspector = useRef(null);
  const selection = useSelection();
  const undo = useUndo();
  const banks = useLoad(base + '/banks');
  const catalog = useLoad(base + '/catalog');
  const views = useWorkViews(viewsKey);

  const search = useMemo(() => new URLSearchParams(params), [params]);
  const listSearch = useMemo(() => {
    const next = new URLSearchParams(search);
    next.set('limit', String(pageSize));
    next.set('offset', String(offset));
    return next.toString();
  }, [search, pageSize, offset]);

  const queue = useQueue(listSearch);
  const exceptionCounts = useExceptionCounts(search.toString(), viewsKey);
  const rows = queue.data?.items || [];
  const total = queue.data?.total || 0;
  useEffect(() => { setOffset(0); }, [search.toString(), pageSize]);
  // Sau khi sửa, câu có phiên bản mới: cập nhật phiên bản trong lô đang chọn để lệnh sau không bị báo "đã đổi".
  useEffect(() => { selection.sync(rows); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const index = rows.findIndex(r => r.id === activeId);
  const active = index >= 0 ? rows[index] : null;
  const unassigned = rows.filter(r => !r.topic_name).length;
  const overrideCount = selection.ids.filter(id => overrides[id]).length;
  const bulkTargets = () => selection.ids.filter(id => !(keepOverrides && overrides[id]));

  const bulkActions = useMemo(() => {
    const out = [];
    if (user.capabilities?.['content.write']) out.push('submit');
    if (user.capabilities?.['content.approve']) out.push('approve', 'activate');
    if (user.capabilities?.['content.review']) out.push('request_changes', 'reject');
    if (user.capabilities?.['content.write']) out.push('archive');
    return out.length ? out : ['submit'];
  }, [user]);

  const refreshAll = useCallback(() => { queue.reload(); setViewsKey(k => k + 1); }, [queue]);
  const setParam = (name, value) => {
    const next = new URLSearchParams(params);
    if (value === null || value === '') next.delete(name); else next.set(name, value);
    setParams(next);
  };
  const move = step => {
    if (!rows.length) return;
    const next = index < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, index + step));
    setActiveId(rows[next].id);
  };
  const clearSelection = () => { selection.clear(); setOverrides({}); setScope('one'); };

  // Kết quả sửa nhanh: cập nhật phiên bản trong lô, ghi lệnh hoàn tác, tải lại danh sách và bộ đếm.
  const undoWith = useCallback(token => token ? async () => {
    const back = await undoOperation(token);
    selection.refresh(back.items || []);
    refreshAll();
  } : null, [selection, refreshAll]);

  const onApplied = useCallback(({message, items, undoToken}) => {
    setError('');
    selection.refresh(items);
    undo.push(message, undoWith(undoToken));
    refreshAll();
  }, [selection, undo, refreshAll, undoWith]);

  const onLessonDone = useCallback(result => {
    setError('');
    selection.refresh(result.items || []);
    undo.push(`Đã gắn Bài cho ${result.assigned} câu.`, undoWith(result.undo_token));
    refreshAll();
  }, [selection, undo, refreshAll, undoWith]);

  async function assignLesson(topic, ids) {
    if (!ids.length) { setError('Không còn câu nào để gắn (mọi câu đã chỉnh riêng).'); return; }
    setBusy(true); setError('');
    try {
      const result = await api.post(base + '/questions/assign-lesson', {
        assignments: [{question_ids: ids, topic_id: topic.id}], reason: 'Gắn Bài từ bảng lệnh',
      });
      onLessonDone(result);
    } catch (e) {
      const blocked = e.details?.blocked || [];
      const unlinked = blocked.filter(b => b.reason_code === 'LESSON_NOT_LINKED').length;
      setError(unlinked
        ? `${unlinked} câu có YCCĐ không thuộc ${topic.name} — không đổi câu nào. Dùng “Gắn Bài theo nhóm YCCĐ” (phím B) để chọn Bài đúng cho từng nhóm.`
        : e.message);
    } finally { setBusy(false); }
  }

  const openEditor = useCallback(async row => {
    setError('');
    try {
      const detail = await api.get(base + '/questions/' + row.id + '/compare');
      setEditor({id: row.id, version: detail.question.current_version_id, draft: detail.after.content});
    } catch (e) { setError('Không mở được bản đầy đủ để sửa: ' + e.message); }
  }, []);

  async function save(extra = {}) {
    setBusy(true);
    try {
      if (editor.id) await api.put(`${base}/questions/${editor.id}`, {...editor.draft, ...extra, question_version_id: editor.version});
      else await api.post(base + '/questions', {...editor.draft, ...extra});
      setEditor(null);
      refreshAll();
    } catch (e) {
      // §69 — phân loại vừa sửa không còn khớp mã câu: hỏi rõ trước khi đổi mã, không tự đổi.
      if (e.details?.code === 'CODE_METADATA_CONFLICT' && e.details.suggested_code
          && window.confirm(`Mã câu hiện tại: ${e.details.current_code}\nPhân loại mới tương ứng mã: ${e.details.suggested_code}\n\nTạo lại mã theo phân loại mới?`)) {
        setBusy(false);
        return save({regenerate_code: true});
      }
      setError(e.message);
    }
    finally { setBusy(false); }
  }

  const single = useCallback(async (row, action, reason = '', reasonCodes = []) => {
    if (action === 'request_changes' && !reason.trim() && !reasonCodes.length) { setRejecting(row.id); return; }
    setBusy(true); setError('');
    try {
      await api.post(base + '/questions/bulk-workflow', {
        ids: [row.id], action, reason: reason.trim(), reason_codes: reasonCodes,
        expected_versions: {[String(row.id)]: row.current_version_id},
      });
      setRejecting(null);
      undo.push(`${ACTION_LABELS[action]}: ${row.display_code}.`);
      refreshAll();
    } catch (e) {
      const stopper = e.details?.requires_deep_review?.[0] || e.details?.blocked?.[0];
      setError(stopper ? `${stopper.question_code || row.display_code}: ${stopper.message}` : e.message);
    } finally { setBusy(false); }
  }, [refreshAll, undo]);

  useHotkeys({
    'j': () => move(1),
    'k': () => move(-1),
    'x': () => active && selection.toggle(active.id, active.current_version_id),
    ' ': () => active && selection.toggle(active.id, active.current_version_id),
    '1': () => !readOnly && inspector.current?.setLevel(1),
    '2': () => !readOnly && inspector.current?.setLevel(2),
    '3': () => !readOnly && inspector.current?.setLevel(3),
    '4': () => !readOnly && inspector.current?.setLevel(4),
    'b': () => { if (readOnly) return; if (scope === 'selection' && selection.count > 1) setLessonIds(bulkTargets()); else inspector.current?.openLesson(); },
    'g': () => selection.count > 1 && setScope(s => s === 'one' ? 'selection' : 'one'),
    'e': () => active && !readOnly && openEditor(active),
    'mod+k': () => setPaletteOpen(true),
    'mod+z': () => (undo.entry?.undo ? (undo.run(), true) : false),
    'escape': () => { setPaletteOpen(false); setRejecting(null); },
  }, !editor && !paletteOpen && !lessonIds && !deepId);

  // Bài trong ngữ cảnh đang xem: theo bộ lọc Môn/Khối, không thì theo câu đang mở.
  const contextTopics = useMemo(() => {
    const subject = Number(params.get('subject_id')) || active?.subject_id;
    const grade = Number(params.get('grade')) || active?.grade;
    return (catalog.data?.topics || []).filter(t => (!subject || t.subject_id === subject) && (!grade || t.grade === grade)).slice(0, 80);
  }, [catalog.data, params, active?.subject_id, active?.grade]);

  const commands = query => {
    const list = [];
    const count = selection.count;
    if (count && !readOnly) {
      const group = `Làm với ${count} câu đang chọn`;
      const n = bulkTargets().length;
      list.push({id: 'lesson-dialog', group, label: 'Gắn Bài theo nhóm YCCĐ…', keywords: 'gan bai nhom yccd', shortcut: 'B', run: () => setLessonIds(bulkTargets())});
      for (const t of contextTopics) list.push({id: 'assign-' + t.id, group, label: `Gắn ${t.name} cho ${n} câu`, keywords: 'gan bai', searchOnly: true, run: () => assignLesson(t, bulkTargets())});
      LEVEL_CODES.forEach((code, i) => list.push({id: 'bulk-level-' + code, group, label: `Đặt mức ${code} cho ${n} câu`, keywords: 'muc dat', searchOnly: true,
        run: () => { setScope('selection'); inspector.current?.setLevel(i + 1, 'selection'); }}));
      for (const a of bulkActions) list.push({id: 'act-' + a, group, label: `${ACTION_LABELS[a]} ${count} câu…`, keywords: a, run: () => setRequestedAction({action: a, at: Date.now()})});
      list.push({id: 'scope', group, label: scope === 'one' ? 'Chuyển phạm vi sửa sang cả lô' : 'Chuyển phạm vi sửa về chỉ câu đang xem', keywords: 'pham vi', shortcut: 'G', run: () => setScope(s => s === 'one' ? 'selection' : 'one')});
      list.push({id: 'clear', group, label: 'Bỏ chọn tất cả', keywords: 'bo chon', run: clearSelection});
    }
    if (active && !readOnly) {
      const group = 'Câu đang xem · ' + active.display_code;
      LEVEL_CODES.forEach((code, i) => list.push({id: 'level-' + code, group, label: `Đặt mức ${code}`, keywords: 'muc', shortcut: String(i + 1), searchOnly: true,
        run: () => inspector.current?.setLevel(i + 1, 'one')}));
      list.push({id: 'edit', group, label: 'Sửa nội dung đầy đủ', keywords: 'sua noi dung', shortcut: 'E', run: () => openEditor(active)});
      list.push({id: 'deep', group, label: 'Xem kỹ (so sánh phiên bản, hồ sơ rà soát)', keywords: 'xem ky', run: () => setDeepId(active.id)});
      list.push({id: 'select-active', group, label: selection.has(active.id) ? 'Bỏ chọn câu này' : 'Chọn câu này', keywords: 'chon', shortcut: 'X', run: () => selection.toggle(active.id, active.current_version_id)});
    }
    for (const v of views) list.push({id: 'view-' + v.key, group: 'Góc nhìn', label: `${v.label} (${v.count})`, keywords: 'mo goc nhin', run: () => setParams(new URLSearchParams(v.query))});
    for (const [key, label] of EXCEPTION_FILTERS) list.push({id: 'exc-' + key, group: 'Lọc', label: `Lọc: ${label}`, keywords: 'loc', run: () => setParam('exception', key)});
    LEVEL_CODES.forEach((code, i) => list.push({id: 'flevel-' + code, group: 'Lọc', label: `Lọc: mức ${code}`, keywords: 'loc muc', searchOnly: true, run: () => setParam('cognitive_level', 'M' + (i + 1))}));
    for (const [key, label] of Object.entries(FORM_FILTERS)) list.push({id: 'fform-' + key, group: 'Lọc', label: `Lọc: dạng ${label}`, keywords: 'loc dang', searchOnly: true, run: () => setParam('q_type', key)});
    for (const t of contextTopics) list.push({id: 'ftopic-' + t.id, group: 'Lọc', label: `Lọc: ${t.name}`, keywords: 'loc bai', searchOnly: true, run: () => setParam('topic_id', String(t.id))});
    list.push({id: 'clear-filters', group: 'Lọc', label: 'Bỏ mọi bộ lọc', keywords: 'bo loc tat ca', run: () => setParams(new URLSearchParams())});
    list.push({id: 'select-all', group: 'Chung', label: `Chọn tất cả ${total} câu trong bộ lọc`, keywords: 'chon tat ca', run: () => selection.selectFiltered(search.toString()).catch(e => setError(e.message))});
    if (!readOnly) {
      list.push({id: 'import', group: 'Chung', label: 'Nhập câu từ Word', keywords: 'nhap word tep', run: () => navigate('/practice/import')});
      list.push({id: 'new', group: 'Chung', label: 'Thêm câu hỏi', keywords: 'them tao moi', run: () => setEditor({draft: NEW_DRAFT(params)})});
    }
    list.push({id: 'review', group: 'Chung', label: 'Mở màn Duyệt câu', keywords: 'duyet', run: () => navigate('/practice/reviews')});
    if (undo.entry?.undo) list.push({id: 'undo', group: 'Chung', label: 'Hoàn tác: ' + undo.entry.message, keywords: 'hoan tac', shortcut: 'Ctrl Z', run: undo.run});
    const text = query.trim();
    if (text) list.push({id: 'search', group: 'Tìm', label: `Tìm “${text}” trong mã và nội dung câu`, keywords: text, run: () => setParam('search', text)});
    return list;
  };

  const inspectorNav = active && (
    <div className="inspector-nav">
      <button className="btn icon" disabled={index <= 0} onClick={() => move(-1)} aria-label="Câu trước (K)">{ARROW_LEFT}</button>
      <span className="pos">Câu {offset + index + 1} / {total}{selection.has(active.id) && selection.count > 1 ? ` · thuộc lô ${selection.count} câu` : ''}</span>
      <button className="btn icon" disabled={index >= rows.length - 1} onClick={() => move(1)} aria-label="Câu sau (J)">{ARROW_RIGHT}</button>
    </div>
  );

  const singleActions = active && !readOnly && (
    <>
      {rejecting === active.id && (
        <RejectReasonPopover busy={busy} onCancel={() => setRejecting(null)}
                             onSubmit={({reason, codes}) => single(active, 'request_changes', reason, codes)}/>
      )}
      <QuickInspector ref={inspector} row={active} selection={selection} overrides={overrides} keepOverrides={keepOverrides}
                      onOverride={id => setOverrides(o => ({...o, [id]: true}))}
                      scope={scope} onScope={setScope} topics={catalog.data?.topics || []}
                      onApplied={onApplied} onError={setError} onOpenLessonDialog={setLessonIds}/>
    </>
  );

  const inspectorFooter = active && !readOnly && (
    <>
      <button className="btn" disabled={busy} onClick={() => openEditor(active)}>Sửa nội dung <kbd>E</kbd></button>
      {active.review_status === 'DRAFT' && <button className="btn primary" disabled={busy} onClick={() => single(active, 'submit')}>Gửi duyệt</button>}
      {active.review_status === 'PENDING_REVIEW' && user.capabilities?.['content.approve'] &&
        <button className="btn primary" disabled={busy} onClick={() => single(active, 'approve')}>Duyệt</button>}
      {active.review_status === 'PENDING_REVIEW' && user.capabilities?.['content.review'] &&
        <button className="btn" disabled={busy} onClick={() => setRejecting(active.id)}>Trả sửa</button>}
      <button className="btn" disabled={busy} onClick={async () => {
        try { await api.post(`${base}/questions/${active.id}/copy`, {}); refreshAll(); }
        catch (e) { setError(e.message); }
      }}>Sao chép</button>
    </>
  );

  const badges = useMemo(() => Object.fromEntries(Object.keys(overrides).map(id => [id, 'chỉnh riêng'])), [overrides]);

  return (
    <WorkspaceShell
      actions={<>
        <button className="btn palette-trigger" onClick={() => setPaletteOpen(true)}>
          <span>Tìm lệnh: gắn Bài, lọc, đổi mức…</span><kbd>Ctrl K</kbd>
        </button>
        <button className="btn" onClick={() => downloadFile(base + '/questions-export?' + search.toString(), 'cau-hoi.xlsx').catch(e => setError(e.message))}>Xuất Excel</button>
        {!readOnly && <button className="btn primary" onClick={() => setEditor({draft: NEW_DRAFT(params)})}>Thêm câu hỏi</button>}
      </>}>
      <div className="workbench">
        <WorkViews views={views} params={params} setParams={setParams}/>
        <div className="workbench-main">
          <SimpleFilterBar params={params} setParams={setParams} catalog={catalog.data}/>
          <ExceptionChips value={params.get('exception')} counts={exceptionCounts} onPick={key => setParam('exception', key)}>
            {params.get('ids') && <button className="chip" onClick={() => setParam('ids', '')}>Bỏ lọc {params.get('ids').split(',').length} câu đang xem ×</button>}
          </ExceptionChips>
          {params.get('import_job_id') &&
            <p className="ok-box">Đang xem nhóm câu vừa nhập. Phạm vi môn, khối và kho vẫn áp dụng như bình thường.</p>}
          <ErrorBox error={error || queue.error}/>

          {unassigned > 0 && !params.get('lesson_status') && params.get('exception') !== 'lesson' && (
            <p className="warn-box">
              {unassigned} câu trong trang này chưa gắn Bài.{' '}
              <button className="btn" onClick={() => setParam('lesson_status', 'UNASSIGNED')}>Chỉ hiện câu chưa gắn Bài</button>
            </p>
          )}

          {editor && <article className="practice-card">
            <QuestionEditor value={editor.draft} catalog={catalog.data} onChange={draft => setEditor({...editor, draft})}/>
            <div className="practice-actions">
              <button className="btn primary" disabled={busy} onClick={() => save()}>Lưu</button>
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
            <BulkQuestionToolbar selection={selection} actions={bulkActions} banks={banks.data || []} requestedAction={requestedAction}
                                 onDone={() => { refreshAll(); setActiveId(null); setOverrides({}); }}
                                 onClear={clearSelection}
                                 extraActions={<>
                                   <button className="btn" onClick={() => setLessonIds(bulkTargets())}>Gắn Bài <kbd>B</kbd></button>
                                   {overrideCount > 0 && <label className="keep-overrides">
                                     <input type="checkbox" checked={keepOverrides} onChange={e => setKeepOverrides(e.target.checked)}/>
                                     Giữ {overrideCount} câu chỉnh riêng
                                   </label>}
                                 </>}/>}
          {lessonIds && <LessonAssignDialog ids={lessonIds} onClose={() => setLessonIds(null)} onDone={onLessonDone}/>}

          <div className="queue-layout">
            <QuestionQueueTable rows={rows} selection={selection} activeId={activeId} onActivate={row => setActiveId(row.id)} badges={badges}
                                pageSize={pageSize} onPageSize={setPageSize} total={total} offset={offset} onOffset={setOffset}/>
            <QuestionPreviewPane row={active} onDeepReview={row => setDeepId(row.id)} nav={inspectorNav} actions={singleActions} footer={inspectorFooter}/>
          </div>
          {deepId && <QuestionReviewPanel id={deepId} onClose={() => setDeepId(null)} onChanged={refreshAll}/>}
          <details className="practice-card">
            <summary>Chất lượng và mức sử dụng câu hỏi</summary>
            <QuestionQuality query={search.toString()}/>
          </details>
        </div>
      </div>
      <UndoToast undo={undo}/>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands}/>
    </WorkspaceShell>
  );
}
