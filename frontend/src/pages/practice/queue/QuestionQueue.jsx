import {useEffect, useMemo, useState} from 'react';
import {api} from '../../../api/client.js';
import {base, ErrorBox} from '../shared.jsx';
import {Rich} from '../Rich.jsx';

export const LIFECYCLE = {draft: 'Bản nháp', pending_review: 'Chờ duyệt', approved: 'Đã duyệt', active: 'Đang dùng', archived: 'Lưu trữ'};
export const REVIEW_STATUS = {DRAFT: 'Nháp', PENDING_REVIEW: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', SUPERSEDED: 'Đã thay'};
export const Q_TYPES = {mcq4: 'Trắc nghiệm', true_false: 'Đúng / Sai', short: 'Trả lời ngắn', matching: 'Ghép nối', essay: 'Tự luận'};
export const LEVELS = {M1: 'NB', M2: 'TH', M3: 'VD', M4: 'VDC'};

export function useQueue(search) {
  const [state, setState] = useState({loading: true, data: null, error: ''});
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setState(s => ({...s, loading: true}));
    api.get(base + '/questions/queue?' + search)
      .then(d => { if (active) setState({loading: false, data: d, error: ''}); })
      .catch(e => { if (active) setState({loading: false, data: null, error: e.message}); });
    return () => { active = false; };
  }, [search, revision]);
  return {...state, reload: () => setRevision(n => n + 1)};
}

// Selection carries question_id -> current_version_id so every bulk call can prove which version the
// reviewer actually looked at (§38). "All matching the filter" is resolved by the server, never by
// ticking the rows that happen to be rendered (§23).
export function useSelection() {
  const [map, setMap] = useState({});
  const [scope, setScope] = useState(null);
  const ids = useMemo(() => Object.keys(map).map(Number), [map]);
  return {
    map, ids, scope,
    count: ids.length,
    has: id => String(id) in map,
    toggle: (id, version) => setMap(m => {
      const next = {...m};
      if (String(id) in next) delete next[String(id)]; else next[String(id)] = version;
      return next;
    }),
    setRows: (rows, on) => setMap(m => {
      const next = {...m};
      for (const r of rows) { if (on) next[String(r.id)] = r.current_version_id; else delete next[String(r.id)]; }
      return next;
    }),
    selectFiltered: async search => {
      const result = await api.get(base + '/questions/selection-ids?' + search);
      setMap(result.expected_versions);
      setScope({total: result.total, truncated: result.truncated, limit: result.limit});
      return result;
    },
    clear: () => { setMap({}); setScope(null); },
  };
}

function RiskBadges({row}) {
  const badges = [];
  if (row.risk?.quarantined) badges.push(['Cách ly', 'risk-high']);
  if (row.risk?.open_case_severity) badges.push([`Hồ sơ ${row.risk.open_case_severity}`, row.risk.open_case_severity === 'P0' ? 'risk-high' : 'risk-mid']);
  if (row.risk?.needs_curriculum_review) badges.push(['Cần xem phân loại', 'risk-mid']);
  if (!badges.length) return <span className="risk-badge risk-ok">Sạch</span>;
  return <>{badges.map(([label, cls]) => <span key={label} className={'risk-badge ' + cls}>{label}</span>)}</>;
}

export function QuestionQueueTable({rows, selection, activeId, onActivate, pageSize, onPageSize, total, offset, onOffset}) {
  const allOnPage = rows.length > 0 && rows.every(r => selection.has(r.id));
  return (
    <div className="queue-table-wrap">
      <table className="queue-table">
        <thead>
          <tr>
            <th scope="col" className="queue-check">
              <input type="checkbox" aria-label="Chọn tất cả trang này" checked={allOnPage}
                     onChange={e => selection.setRows(rows, e.target.checked)}/>
            </th>
            <th scope="col">Mã</th>
            <th scope="col">Nội dung</th>
            <th scope="col">Môn · Khối</th>
            <th scope="col">Bài</th>
            <th scope="col">Outcome · YCCĐ</th>
            <th scope="col">Mức</th>
            <th scope="col">Dạng</th>
            <th scope="col">Vòng đời</th>
            <th scope="col">Duyệt</th>
            <th scope="col">Rủi ro</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className={row.id === activeId ? 'queue-row active' : 'queue-row'}
                aria-selected={row.id === activeId} onClick={() => onActivate(row)}>
              <td className="queue-check" data-label="Chọn" onClick={e => e.stopPropagation()}>
                <input type="checkbox" aria-label={'Chọn câu ' + row.display_code}
                       checked={selection.has(row.id)}
                       onChange={() => selection.toggle(row.id, row.current_version_id)}/>
              </td>
              <td data-label="Mã">{row.display_code}{row.version_number ? ' · v' + row.version_number : ''}</td>
              <td data-label="Nội dung" className="queue-stem">{row.stem_excerpt}</td>
              <td data-label="Môn · Khối">{row.subject_name || '—'} · {row.grade || '—'}</td>
              <td data-label="Bài">{row.topic_name || '—'}</td>
              <td data-label="Outcome · YCCĐ">{[row.outcome_code, row.yccd_code].filter(Boolean).join(' · ') || '—'}</td>
              <td data-label="Mức">{LEVELS[row.cognitive_level] || '—'}</td>
              <td data-label="Dạng">{Q_TYPES[row.q_type] || '—'}</td>
              <td data-label="Vòng đời">{LIFECYCLE[row.lifecycle] || row.lifecycle}</td>
              <td data-label="Duyệt">{REVIEW_STATUS[row.review_status] || '—'}</td>
              <td data-label="Rủi ro"><RiskBadges row={row}/></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p role="status">Không có câu hỏi trong bộ lọc này.</p>}
      <div className="practice-actions queue-pager">
        <label>Số dòng
          <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))}>
            {[30, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button className="btn" disabled={offset === 0} onClick={() => onOffset(Math.max(0, offset - pageSize))}>Trang trước</button>
        <span>{total ? `${offset + 1}–${Math.min(offset + pageSize, total)} / ${total} câu` : '0 câu'}</span>
        <button className="btn" disabled={offset + pageSize >= total} onClick={() => onOffset(offset + pageSize)}>Trang sau</button>
      </div>
    </div>
  );
}

// Full content (answers included) is never in the queue payload; it comes from the compare endpoint,
// which enforces content.view_answer on its own. A teacher without that capability still gets a
// usable preview from the summary fields instead of an error wall.
export function QuestionPreviewPane({row, onDeepReview, actions}) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!row) { setDetail(null); setError(''); return; }
    let active = true;
    setDetail(null); setError('');
    api.get(base + '/questions/' + row.id + '/compare')
      .then(d => { if (active) setDetail(d); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [row?.id]);
  if (!row) return <aside className="queue-preview"><p>Chọn một câu để xem trước.</p></aside>;
  const content = detail?.after?.content;
  return (
    <aside className="queue-preview" aria-live="polite">
      <header className="section-heading">
        <h3>{row.display_code}{row.version_number ? ' · v' + row.version_number : ''}</h3>
        <RiskBadges row={row}/>
      </header>
      <p>{row.subject_name || '—'} · Khối {row.grade || '—'} · {row.topic_name || 'Chưa gán bài'}</p>
      <p>{[row.outcome_code, row.yccd_code].filter(Boolean).join(' · ') || 'Chưa gán Outcome/YCCĐ'} · {LEVELS[row.cognitive_level] || '—'} · {Q_TYPES[row.q_type] || '—'}</p>
      <p>{LIFECYCLE[row.lifecycle]} · {REVIEW_STATUS[row.review_status] || '—'} · {row.bank_name}{row.author_name ? ' · ' + row.author_name : ''}</p>
      {actions}
      {error && <div className="warn-box"><p>Không mở được nội dung đầy đủ: {error}</p><p>{row.stem_excerpt}</p></div>}
      {!detail && !error && <p role="status">Đang tải nội dung…</p>}
      {content && <div className="queue-preview-body">
        <Rich text={content.stem || content.stem_text}/>
        {(content.type === 'true_false' ? content.statements : content.options)?.map(o => (
          <p key={o.id}><strong>{o.id}.</strong> {o.text}</p>
        ))}
        {content.answer && <details><summary>Đáp án và quy tắc chấm</summary>
          <pre className="queue-answer">{JSON.stringify(content.answer, null, 1)}</pre>
        </details>}
        {content.explanation && <details><summary>Lời giải</summary><Rich text={content.explanation}/></details>}
      </div>}
      <button className="btn" onClick={() => onDeepReview(row)}>Mở rà soát chi tiết</button>
    </aside>
  );
}

export function QueueExtraFilters({params, setParams, authors}) {
  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('offset');
    setParams(next);
  };
  return (
    <div className="practice-grid queue-extra-filters">
      <label>Người biên soạn
        <select value={params.get('created_by') || ''} onChange={e => set('created_by', e.target.value)}>
          <option value="">Tất cả</option>
          {authors.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
        </select>
      </label>
      <label>Đợt nhập
        <input type="text" placeholder="Mã lần nhập" value={params.get('import_job_id') || ''}
               onChange={e => set('import_job_id', e.target.value.trim())}/>
      </label>
      <label>Vòng đời
        <select value={params.get('lifecycle') || ''} onChange={e => set('lifecycle', e.target.value)}>
          <option value="">Tất cả</option>
          {Object.entries(LIFECYCLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
    </div>
  );
}

export {ErrorBox};
