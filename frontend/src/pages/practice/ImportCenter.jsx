import {useCallback, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {api, uploadFile} from '../../api/client.js';
import {base, useLoad, ErrorBox, types} from './shared.jsx';
import {Rich} from './Rich.jsx';
import {Metadata, QuestionEditor, TemplateDownloads} from './Teacher.jsx';

const STATUS_LABEL = {VALID: 'Hợp lệ', WARNING: 'Cảnh báo', NEEDS_REVIEW: 'Cần phân loại', ERROR: 'Lỗi'};
const STATUSES = ['VALID', 'WARNING', 'NEEDS_REVIEW', 'ERROR'];
const DECISIONS = {import: 'Nhập thành câu mới', skip: 'Bỏ qua', version: 'Tạo version cho câu trùng', replace: 'Thay thế bằng version mới'};
const LEVELS = ['NB', 'TH', 'VD', 'VDC'];

function excerpt(text, length = 160) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > length ? flat.slice(0, length) + '…' : flat;
}

function RecentJobs({onOpen}) {
  const jobs = useLoad(base + '/imports');
  if (!jobs.data?.length) return null;
  return (
    <details className="practice-card">
      <summary>Mở lần nhập gần đây ({jobs.data.length})</summary>
      <ErrorBox error={jobs.error}/>
      <div className="queue-table-wrap">
        <table className="queue-table">
          <thead><tr><th scope="col">Tệp</th><th scope="col">Trạng thái</th><th scope="col">Số câu</th><th scope="col">Lỗi</th><th scope="col">Đã nhập</th><th scope="col">Lúc</th><th scope="col"></th></tr></thead>
          <tbody>
            {jobs.data.map(job => (
              <tr key={job.id}>
                <td data-label="Tệp">{job.source_name}</td>
                <td data-label="Trạng thái">{job.status === 'confirmed' ? 'Đã xác nhận' : 'Đang soạn'}</td>
                <td data-label="Số câu">{job.item_count}</td>
                <td data-label="Lỗi">{job.error_count}</td>
                <td data-label="Đã nhập">{job.imported_count}</td>
                <td data-label="Lúc">{new Date(job.created_at).toLocaleString('vi-VN')}</td>
                <td data-label=""><button className="btn" onClick={() => onOpen(job.id)}>Mở</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function ImportCenter() {
  const catalog = useLoad(base + '/catalog');
  const [file, setFile] = useState(null);
  const [sheet, setSheet] = useState('');
  const [job, setJob] = useState(null);
  const [selected, setSelected] = useState([]);
  const [bulk, setBulk] = useState({});
  const [filter, setFilter] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const items = job?.items || [];
  const visible = useMemo(() => items.filter(i => !filter || i.validation.status === filter), [items, filter]);
  const active = items.find(i => i.id === activeId) || null;
  const counts = useMemo(() => Object.fromEntries(STATUSES.map(s => [s, items.filter(i => i.validation.status === s).length])), [items]);
  // §26 — ERROR rows can never take part in a confirm, whatever the user ticked before revalidation.
  const confirmable = useMemo(() => selected.filter(id => items.find(i => i.id === id)?.validation.status !== 'ERROR'), [selected, items]);

  const loadJob = useCallback(async id => {
    setBusy(true); setError(''); setResult(null);
    try {
      const detail = await api.get(`${base}/imports/${id}`);
      setJob(detail);
      setSelected(detail.items.filter(i => i.validation.status !== 'ERROR').map(i => i.id));
      setActiveId(detail.items[0]?.id || null);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }, []);

  async function parse() {
    setBusy(true); setError(''); setResult(null);
    try {
      const created = await uploadFile(base + '/imports', file, {metadata: JSON.stringify(sheet ? {sheet_name: sheet} : {})});
      await loadJob(created.id);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  // Every save round-trips through the backend so validation, duplicate detection and metadata
  // enrichment stay server-side; the grid only shows what came back.
  const save = useCallback(async ({applyBulk = false} = {}) => {
    setBusy(true); setError('');
    try {
      await api.put(`${base}/imports/${job.id}`, {
        items: job.items.map(i => ({id: i.id, draft: i.draft, decision: i.decision})),
        bulk: applyBulk ? bulk : {},
        bulk_ids: selected,
      });
      const updated = await api.get(`${base}/imports/${job.id}`);
      setJob(updated);
      setSelected(prev => prev.filter(id => updated.items.find(i => i.id === id)?.validation.status !== 'ERROR'));
      return true;
    } catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  }, [job, bulk, selected]);

  async function confirm() {
    if (!await save()) return;
    setBusy(true); setError('');
    try {
      const done = await api.post(`${base}/imports/${job.id}/confirm`, {ids: confirmable});
      setResult(done);
      setJob(null);
      setSelected([]);
      setActiveId(null);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const patchItem = (id, patch) => setJob(j => ({...j, items: j.items.map(i => i.id === id ? {...i, ...patch} : i)}));

  return (
    <section className="practice-page">
      <h1>Nhập Word · Excel · QTI</h1>
      <TemplateDownloads/>
      <p>Tệp được phân tích và kiểm tra trước khi xác nhận vào kho. Backend là nơi kiểm tra cuối: mỗi lần lưu đều được kiểm lại và cập nhật trạng thái dòng.</p>
      <ErrorBox error={error}/>

      {result && <article className="ok-box" role="status">
        <p><strong>Đã nhập {result.imported} câu</strong> vào kho cá nhân · lô <code>{result.job_id}</code>.</p>
        <div className="practice-actions">
          <Link className="btn" to={`/practice/banks?import_job_id=${result.job_id}`}>Mở nhóm vừa nhập</Link>
          <Link className="btn primary" to={`/practice/reviews?tab=author&import_job_id=${result.job_id}`}>Gửi nhóm này đi duyệt</Link>
        </div>
      </article>}

      {!job && <>
        <RecentJobs onOpen={loadJob}/>
        <div className="practice-card">
          <label>Sheet Excel
            <select value={sheet} onChange={e => setSheet(e.target.value)}>
              <option value="">Tự nhận diện nếu chỉ có một sheet dữ liệu</option>
              <option value="04_QUESTION_UPLOAD_SIMPLE">SIMPLE — câu mới</option>
              <option value="05_QUESTION_UPLOAD_ADV">ADV — nhập/cập nhật có phiên bản</option>
            </select>
          </label>
          <label>Tệp DOCX, XLSX hoặc ZIP
            <input type="file" accept=".docx,.xlsx,.zip" onChange={e => setFile(e.target.files[0])}/>
          </label>
          <button className="btn primary" disabled={!file || busy} onClick={parse}>{busy ? 'Đang xử lý…' : 'Phân tích và xem trước'}</button>
        </div>
      </>}

      {job && <>
        <header className="section-heading">
          <h2>{job.source_name} · {items.length} câu</h2>
          <button className="btn" onClick={() => { setJob(null); setSelected([]); setActiveId(null); }}>Đóng lần nhập</button>
        </header>
        <p>{STATUSES.map(s => `${STATUS_LABEL[s]}: ${counts[s]}`).join(' · ')}</p>

        <details className="practice-card" open>
          <summary>Sửa hàng loạt cho {selected.length} câu đang chọn</summary>
          <Metadata q={bulk} onChange={setBulk} catalog={catalog.data}/>
          <label>Quyết định trùng (chỉ áp dụng cho câu có bản trùng)
            <select value={bulk.decision || ''} onChange={e => setBulk({...bulk, decision: e.target.value})}>
              <option value="">Giữ nguyên</option>
              {Object.entries(DECISIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <button className="btn" disabled={busy || !selected.length} onClick={async () => {
            if (bulk.decision) {
              for (const id of selected) {
                const item = items.find(i => i.id === id);
                if (item?.duplicate_candidates.length) patchItem(id, {decision: bulk.decision});
              }
            }
            await save({applyBulk: true});
          }}>Áp dụng cho các câu đã chọn</button>
        </details>

        <div className="practice-actions">
          <label>Lọc trạng thái
            <select value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="">Tất cả ({items.length})</option>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]} ({counts[s]})</option>)}
            </select>
          </label>
          <button className="btn" onClick={() => setSelected(items.filter(i => i.validation.status !== 'ERROR').map(i => i.id))}>Chọn tất cả hợp lệ</button>
          <button className="btn" onClick={() => setSelected(visible.filter(i => i.validation.status !== 'ERROR').map(i => i.id))}>Chọn tất cả theo bộ lọc</button>
          <button className="btn" onClick={() => setSelected(items.filter(i => i.validation.status === 'WARNING').map(i => i.id))}>Chọn cảnh báo</button>
          <button className="btn" onClick={() => setSelected(items.filter(i => i.validation.status === 'NEEDS_REVIEW').map(i => i.id))}>Chọn cần phân loại</button>
          <button className="btn" onClick={() => setSelected([])}>Bỏ chọn tất cả</button>
        </div>
        <p role="status"><strong>{confirmable.length}</strong> câu sẽ được nhập
          {selected.length !== confirmable.length && ` (${selected.length - confirmable.length} câu lỗi đã bị loại khỏi lựa chọn)`}.</p>
        <button className="btn primary" disabled={busy || !confirmable.length} onClick={confirm}>Xác nhận nhập {confirmable.length} câu</button>

        <div className="queue-layout">
          <div className="queue-table-wrap">
            <table className="queue-table">
              <thead>
                <tr>
                  <th scope="col" className="queue-check">
                    <input type="checkbox" aria-label="Chọn tất cả dòng đang hiển thị"
                           checked={visible.length > 0 && visible.every(i => selected.includes(i.id))}
                           onChange={e => {
                             const ids = visible.map(i => i.id);
                             setSelected(e.target.checked ? [...new Set([...selected, ...ids])] : selected.filter(id => !ids.includes(id)));
                           }}/>
                  </th>
                  <th scope="col">#</th><th scope="col">Trạng thái</th><th scope="col">Mã</th><th scope="col">Nội dung</th>
                  <th scope="col">Môn · Khối</th><th scope="col">Bài</th><th scope="col">Outcome · YCCĐ</th>
                  <th scope="col">Mức</th><th scope="col">Dạng</th><th scope="col">Trùng</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(item => {
                  const d = item.draft;
                  return (
                    <tr key={item.id} className={item.id === activeId ? 'queue-row active' : 'queue-row'}
                        onClick={() => { setActiveId(item.id); setEditing(false); }}>
                      <td className="queue-check" data-label="Chọn" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" aria-label={'Chọn câu ' + item.sequence}
                               disabled={item.validation.status === 'ERROR'}
                               checked={selected.includes(item.id)}
                               onChange={e => setSelected(e.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))}/>
                      </td>
                      <td data-label="#">{item.sequence}</td>
                      <td data-label="Trạng thái" className={'import-status status-' + item.validation.status}>{STATUS_LABEL[item.validation.status]}</td>
                      <td data-label="Mã">{d.display_code || '—'}</td>
                      <td data-label="Nội dung" className="queue-stem">{excerpt(d.stem)}</td>
                      <td data-label="Môn · Khối">{catalog.data?.subjects.find(s => s.id === d.subject_id)?.name || '—'} · {d.grade || '—'}</td>
                      <td data-label="Bài">{catalog.data?.topics.find(t => t.id === d.topic_id)?.name || '—'}</td>
                      <td data-label="Outcome · YCCĐ">{[d.outcome, d.yccd].filter(Boolean).join(' · ') || '—'}</td>
                      <td data-label="Mức">{LEVELS[(d.cognitive_level || 0) - 1] || '—'}</td>
                      <td data-label="Dạng">{types[d.type] || '—'}</td>
                      <td data-label="Trùng" onClick={e => e.stopPropagation()}>
                        {item.duplicate_candidates.length > 0
                          ? <select value={item.decision} onChange={e => patchItem(item.id, {decision: e.target.value})}>
                              {Object.entries(DECISIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          : '—'}
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
                <h3>Câu {active.sequence}</h3>
                <span className={'import-status status-' + active.validation.status}>{STATUS_LABEL[active.validation.status]}</span>
              </header>
              {[...active.validation.errors, ...active.validation.warnings].map((w, i) => <p key={i} className="warn-box">{w}</p>)}
              {active.duplicate_candidates.length > 0 &&
                <p className="warn-box">Có thể trùng: {active.duplicate_candidates.map(c => c.question_code).join(', ')}</p>}
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
                  <button className="btn primary" disabled={busy} onClick={async () => { if (await save()) setEditing(false); }}>Lưu và kiểm tra lại</button>
                  <button className="btn" onClick={() => setEditing(false)}>Đóng</button>
                </div>
              </>}
            </>}
          </aside>
        </div>
      </>}
    </section>
  );
}
