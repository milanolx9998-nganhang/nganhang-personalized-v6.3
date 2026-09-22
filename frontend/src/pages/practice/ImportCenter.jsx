import {useCallback, useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {api, uploadFile} from '../../api/client.js';
import {base, useLoad, ErrorBox} from './shared.jsx';
import {Rich} from './Rich.jsx';
import {Metadata, QuestionEditor, TemplateDownloads} from './Teacher.jsx';
import WorkspaceShell from './workspace/WorkspaceShell.jsx';
import {IMPORT_STATUS, FORM_SHORT} from './workspace/labels.js';

const DECISIONS = {import: 'Nhập thành câu mới', skip: 'Bỏ qua', version: 'Tạo bản mới cho câu trùng', replace: 'Thay thế câu trùng'};
const LEVEL_NAMES = ['NB', 'TH', 'VD', 'VDC'];
const excerpt = (text, length = 150) => {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > length ? flat.slice(0, length) + '…' : flat;
};
const statusOf = item => IMPORT_STATUS[item.validation.status] || IMPORT_STATUS.WARNING;
const needsWork = item => item.validation.status !== 'VALID';

function RecentJobs({onOpen}) {
  const jobs = useLoad(base + '/imports');
  const open = (jobs.data || []).filter(j => j.status !== 'confirmed');
  if (!jobs.data?.length) return null;
  return (
    <details className="practice-card" open={open.length > 0}>
      <summary>Mở lần nhập gần đây ({jobs.data.length})</summary>
      <ErrorBox error={jobs.error}/>
      <ul className="recent-jobs">
        {jobs.data.map(job => (
          <li key={job.id}>
            <span>{job.source_name} · {job.item_count} câu · {new Date(job.created_at).toLocaleString('vi-VN')}</span>
            <span>{job.status === 'confirmed' ? `Đã nhập ${job.imported_count}` : 'Đang soạn'}</span>
            {job.status !== 'confirmed' && <button className="btn" onClick={() => onOpen(job.id)}>Mở tiếp</button>}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function ImportCenter() {
  const catalog = useLoad(base + '/catalog');
  const [context, setContext] = useState({subject_id: null, grade: null});
  const [sheet, setSheet] = useState('');
  const [file, setFile] = useState(null);
  const [job, setJob] = useState(null);
  const [selected, setSelected] = useState([]);
  const [bulk, setBulk] = useState({});
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const items = job?.items || [];
  const counts = useMemo(() => ({
    total: items.length,
    ready: items.filter(i => i.validation.status === 'VALID').length,
    review: items.filter(i => ['WARNING', 'NEEDS_REVIEW'].includes(i.validation.status)).length,
    error: items.filter(i => i.validation.status === 'ERROR').length,
  }), [items]);
  const visible = useMemo(() => onlyIssues ? items.filter(needsWork) : items, [items, onlyIssues]);
  const active = items.find(i => i.id === activeId) || null;
  const confirmable = useMemo(() => selected.filter(id => items.find(i => i.id === id)?.validation.status !== 'ERROR'), [selected, items]);

  const loadJob = useCallback(async id => {
    setBusy(true); setError(''); setResult(null);
    try {
      const detail = await api.get(`${base}/imports/${id}`);
      setJob(detail);
      setSelected(detail.items.filter(i => i.validation.status !== 'ERROR').map(i => i.id));
      setActiveId(detail.items.find(needsWork)?.id || detail.items[0]?.id || null);
      setOnlyIssues(detail.items.some(needsWork));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }, []);

  async function parse() {
    if (!context.subject_id || !context.grade) { setError('Chọn Môn và Khối trước khi tải tệp'); return; }
    setBusy(true); setError(''); setResult(null);
    try {
      // Môn + Khối là ngữ cảnh phiên nhập: parser dùng chúng để giải mã Outcome/YCCĐ từ mã câu.
      const metadata = {subject_id: context.subject_id, grade: context.grade, ...(sheet ? {sheet_name: sheet} : {})};
      const created = await uploadFile(base + '/imports', file, {metadata: JSON.stringify(metadata)});
      await loadJob(created.id);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  // Luôn lưu chính đối tượng job vừa dựng, không đọc lại state có thể còn cũ.
  const save = useCallback(async (target, {bulkValues = {}, bulkIds = []} = {}) => {
    if (!target) return false;
    setBusy(true); setError('');
    try {
      await api.put(`${base}/imports/${target.id}`, {
        items: target.items.map(i => ({id: i.id, draft: i.draft, decision: i.decision})),
        bulk: bulkValues, bulk_ids: bulkIds,
      });
      const updated = await api.get(`${base}/imports/${target.id}`);
      setJob(updated);
      setSelected(prev => prev.filter(id => updated.items.find(i => i.id === id)?.validation.status !== 'ERROR'));
      return true;
    } catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  }, []);

  const patchItem = (id, patch) => {
    const nextItems = items.map(i => i.id === id ? {...i, ...patch} : i);
    const nextJob = {...job, items: nextItems};
    setJob(nextJob);
    return nextJob;
  };

  async function applyBulkDecision(decision) {
    const nextItems = items.map(i => selected.includes(i.id) && i.duplicate_candidates.length ? {...i, decision} : i);
    const nextJob = {...job, items: nextItems};
    setJob(nextJob);
    await save(nextJob);
  }

  async function confirm() {
    if (!await save(job)) return;
    setBusy(true); setError('');
    try {
      const done = await api.post(`${base}/imports/${job.id}/confirm`, {ids: confirmable});
      // Sau khi nhập, đếm ngay số câu đã/chưa gắn Bài để đưa việc tiếp theo lên trước mặt.
      let lessons = {assigned: null, unassigned: null};
      try {
        const queue = await api.get(`${base}/questions/queue?import_job_id=${done.job_id}&limit=100`);
        const rows = queue.items || [];
        lessons = {assigned: rows.filter(r => r.topic_name).length, unassigned: rows.filter(r => !r.topic_name).length};
      } catch { /* số liệu phụ; không chặn màn hình kết quả */ }
      setResult({...done, lessons});
      setJob(null); setSelected([]); setActiveId(null);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const step = result ? 3 : job ? 2 : 1;
  const subjects = catalog.data?.subjects || [];

  return (
    <WorkspaceShell>
      <ol className="import-steps" aria-label="Các bước nhập câu">
        {['Chọn tệp', 'Kiểm tra & sửa', 'Xác nhận'].map((label, i) => (
          <li key={label} className={step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''} aria-current={step === i + 1 ? 'step' : undefined}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>
      <ErrorBox error={error}/>

      {step === 3 && (
        <article className="ok-box" role="status">
          <h2>Đã nhập {result.imported} câu</h2>
          {result.lessons.assigned !== null && (
            <p>{result.lessons.assigned} câu đã gắn Bài · {result.lessons.unassigned} câu chưa gắn Bài.</p>
          )}
          <div className="practice-actions">
            <Link className="btn" to={`/practice/banks?import_job_id=${result.job_id}`}>Xem trong kho</Link>
            <Link className="btn primary" to={`/practice/reviews?tab=author&import_job_id=${result.job_id}`}>Gửi {result.imported} câu đi duyệt</Link>
            {result.lessons.unassigned > 0 &&
              <Link className="btn" to={`/practice/banks?import_job_id=${result.job_id}&lesson_status=UNASSIGNED`}>
                Xử lý {result.lessons.unassigned} câu chưa gắn Bài
              </Link>}
            <button className="btn" onClick={() => setResult(null)}>Nhập tệp khác</button>
          </div>
        </article>
      )}

      {step === 1 && <>
        <article className="practice-card import-context">
          <h2>Ngữ cảnh phiên nhập</h2>
          <p>Chọn Môn và Khối một lần. Mã câu không cần chứa khối — hệ thống dùng ngữ cảnh này để giải mã Outcome và YCCĐ.</p>
          <div className="practice-grid">
            <label>Môn
              <select aria-label="Môn" value={context.subject_id || ''} onChange={e => setContext({...context, subject_id: Number(e.target.value) || null})}>
                <option value="">Chọn môn</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>Khối
              <select aria-label="Khối" value={context.grade || ''} onChange={e => setContext({...context, grade: Number(e.target.value) || null})}>
                <option value="">Chọn khối</option>
                {[6, 7, 8, 9, 10, 11, 12].map(g => <option key={g} value={g}>Khối {g}</option>)}
              </select>
            </label>
          </div>
          <label>Tệp Word, Excel hoặc QTI
            <input type="file" accept=".docx,.xlsx,.zip" onChange={e => setFile(e.target.files[0])}/>
          </label>
          <details>
            <summary>Tuỳ chọn nâng cao</summary>
            <label>Sheet Excel
              <select value={sheet} onChange={e => setSheet(e.target.value)}>
                <option value="">Tự nhận diện</option>
                <option value="04_QUESTION_UPLOAD_SIMPLE">SIMPLE — câu mới</option>
                <option value="05_QUESTION_UPLOAD_ADV">ADV — nhập/cập nhật có phiên bản</option>
              </select>
            </label>
            <TemplateDownloads/>
          </details>
          <button className="btn primary" disabled={!file || busy || !context.subject_id || !context.grade} onClick={parse}>
            {busy ? 'Đang đọc tệp…' : 'Đọc tệp và kiểm tra'}
          </button>
        </article>
        <RecentJobs onOpen={loadJob}/>
      </>}

      {step === 2 && <>
        <header className="section-heading">
          <h2>Tìm thấy {counts.total} câu</h2>
          <button className="btn" onClick={() => { setJob(null); setSelected([]); setActiveId(null); }}>Hủy lần nhập</button>
        </header>
        <p className="import-summary">
          <span className="tone-ok">✓ {counts.ready} tự nhận diện</span>{' · '}
          <span className="tone-warn">! {counts.review} cần xem</span>{' · '}
          <span className="tone-danger">× {counts.error} lỗi</span>
        </p>
        {counts.review + counts.error > 0 && (
          <button className="btn primary" onClick={() => setOnlyIssues(!onlyIssues)}>
            {onlyIssues ? `Hiện đủ ${counts.total} câu` : `Chỉ hiện ${counts.review + counts.error} câu cần xử lý`}
          </button>
        )}

        <div className="practice-actions select-actions">
          <button className="btn" onClick={() => setSelected(items.filter(i => i.validation.status !== 'ERROR').map(i => i.id))}>Chọn tất cả hợp lệ</button>
          <button className="btn" onClick={() => setSelected(visible.filter(i => i.validation.status !== 'ERROR').map(i => i.id))}>Chọn theo bộ lọc</button>
          <button className="btn" onClick={() => setSelected([])}>Bỏ chọn</button>
          <span><strong>{confirmable.length}</strong> câu sẽ được nhập</span>
        </div>

        {/* Không chọn câu nào thì không hiện form sửa hàng loạt. */}
        {selected.length > 0 && (
          <details className="practice-card">
            <summary>Sửa hàng loạt {selected.length} câu đang chọn</summary>
            <Metadata q={bulk} onChange={setBulk} catalog={catalog.data}/>
            <div className="practice-actions">
              <button className="btn" disabled={busy} onClick={() => save(job, {bulkValues: bulk, bulkIds: selected})}>Áp dụng phân loại</button>
              {items.some(i => selected.includes(i.id) && i.duplicate_candidates.length > 0) &&
                Object.entries(DECISIONS).map(([key, label]) => (
                  <button key={key} className="btn" disabled={busy} onClick={() => applyBulkDecision(key)}>{label}</button>
                ))}
            </div>
          </details>
        )}

        <div className="queue-layout">
          <div className="queue-table-wrap">
            <table className="queue-table">
              <thead>
                <tr>
                  <th scope="col" className="queue-check">
                    <input type="checkbox" aria-label="Chọn tất cả dòng đang hiển thị"
                           checked={visible.length > 0 && visible.every(i => selected.includes(i.id))}
                           onChange={e => {
                             const ids = visible.filter(i => i.validation.status !== 'ERROR').map(i => i.id);
                             setSelected(e.target.checked ? [...new Set([...selected, ...ids])] : selected.filter(id => !ids.includes(id)));
                           }}/>
                  </th>
                  <th scope="col">Mã câu</th><th scope="col">Nội dung</th><th scope="col">Outcome · YCCĐ</th>
                  <th scope="col">Bài</th><th scope="col">Mức</th><th scope="col">Dạng</th><th scope="col">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(item => {
                  const d = item.draft, r = item.validation.resolution;
                  return (
                    <tr key={item.id} className={item.id === activeId ? 'queue-row active' : 'queue-row'}
                        onClick={() => { setActiveId(item.id); setEditing(false); }}>
                      <td className="queue-check" data-label="Chọn" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" aria-label={'Chọn câu ' + item.sequence}
                               disabled={item.validation.status === 'ERROR'}
                               checked={selected.includes(item.id)}
                               onChange={e => setSelected(e.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))}/>
                      </td>
                      <td data-label="Mã câu" className="queue-code">{d.display_code || '—'}</td>
                      <td data-label="Nội dung" className="queue-stem">{excerpt(d.stem)}</td>
                      <td data-label="Outcome · YCCĐ">{r ? [r.outcome, r.yccd].filter(Boolean).join(' · ') : '—'}</td>
                      <td data-label="Bài">{r?.lesson?.name || (r?.lesson_status === 'AMBIGUOUS' ? 'Nhiều Bài' : r?.lesson_status === 'UNMAPPED' ? 'Chưa gắn' : '—')}</td>
                      <td data-label="Mức">{r?.level || LEVEL_NAMES[(d.cognitive_level || 0) - 1] || '—'}</td>
                      <td data-label="Dạng">{r?.form || FORM_SHORT[d.type] || '—'}</td>
                      <td data-label="Trạng thái">
                        <span className={'status-pill tone-' + statusOf(item).tone}>{statusOf(item).label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!visible.length && <p role="status">Không có dòng nào trong bộ lọc này.</p>}
          </div>

          <aside className="queue-preview" aria-live="polite">
            {!active && <p>Chọn một dòng để xem trước.</p>}
            {active && <>
              <header className="section-heading">
                <h3>{active.draft.display_code || 'Câu ' + active.sequence}</h3>
                <span className={'status-pill tone-' + statusOf(active).tone}>{statusOf(active).label}</span>
              </header>
              {active.validation.resolution?.state === 'RESOLVED' && (
                <p className="ok-box">✓ Tự nhận diện: {active.validation.resolution.branch} · {active.validation.resolution.outcome} · {active.validation.resolution.yccd}
                  {active.validation.resolution.lesson ? ` · ${active.validation.resolution.lesson.name}` : ''}</p>
              )}
              {[...active.validation.errors, ...active.validation.warnings].map((w, i) => <p key={i} className="warn-box">{w}</p>)}
              {active.validation.resolution?.lesson_candidates?.length > 1 && (
                <label>Chọn Bài cho câu này
                  <select value={active.draft.topic_id || ''} onChange={async e => {
                    const next = patchItem(active.id, {draft: {...active.draft, topic_id: Number(e.target.value) || null, lesson_status: 'MANUAL'}});
                    await save(next);
                  }}>
                    <option value="">Chưa chọn</option>
                    {active.validation.resolution.lesson_candidates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              )}
              {active.duplicate_candidates.length > 0 && (
                <label>Có thể trùng: {active.duplicate_candidates.map(c => c.question_code).join(', ')}
                  <select value={active.decision} onChange={async e => { await save(patchItem(active.id, {decision: e.target.value})); }}>
                    {Object.entries(DECISIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              )}
              {!editing && <>
                <Rich text={active.draft.stem}/>
                {(active.draft.type === 'true_false' ? active.draft.statements : active.draft.options)?.map(o => (
                  <p key={o.id}><strong>{o.id}.</strong> {o.text}</p>
                ))}
                <button className="btn" onClick={() => setEditing(true)}>Sửa chi tiết</button>
              </>}
              {editing && <>
                <QuestionEditor value={active.draft} catalog={catalog.data}
                                onChange={draft => patchItem(active.id, {draft})}/>
                <div className="practice-actions">
                  <button className="btn primary" disabled={busy} onClick={async () => { if (await save(job)) setEditing(false); }}>Lưu và kiểm lại</button>
                  <button className="btn" onClick={() => setEditing(false)}>Đóng</button>
                </div>
              </>}
            </>}
          </aside>
        </div>

        <div className="practice-actions import-confirm">
          <button className="btn primary" disabled={busy || !confirmable.length} onClick={confirm}>
            Xác nhận nhập {confirmable.length} câu
          </button>
        </div>
      </>}
    </WorkspaceShell>
  );
}
