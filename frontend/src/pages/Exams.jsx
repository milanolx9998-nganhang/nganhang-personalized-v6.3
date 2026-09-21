import { useState, useEffect } from 'react';
import {useSearchParams} from 'react-router-dom';
import {CoveragePanel} from '../components/MatrixBuilder.jsx';
import {Rich} from './practice/Rich.jsx';
import { api, downloadFile } from '../api/client.js';
import { useAuth, can } from '../hooks/useAuth.js';

export default function Exams() {
  const { user } = useAuth();
  const manage = !!user.capabilities?.content_write;
  const [params]=useSearchParams();
  const [exams, setExams] = useState([]);
  const [matrices, setMatrices] = useState([]);
  const [showGen, setShowGen] = useState(!!params.get('matrix'));
  const [viewing, setViewing] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setExams(await api.get('/api/exams')); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    api.get('/api/matrix').then(setMatrices);
  }, []);

  const del = async (id) => {
    if (!confirm('Xóa đề này?')) return;
    try { await api.del(`/api/exams/${id}`); load(); }
    catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div className="page-header">
        <h2>📄 Đề thi đã sinh</h2>
        {/* Teacher: ẩn nút sinh đề */}
        {manage && <button className="btn primary" onClick={() => setShowGen(true)}>+ Sinh đề mới</button>}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="loading">Đang tải...</div> :
         exams.length === 0 ? <div className="empty-state">Chưa có đề nào. Tạo ma trận trước, rồi bấm "Sinh đề mới".</div> :
        <table>
          <thead>
            <tr>
              <th>Tên đề</th>
              <th>Ma trận · Môn</th>
              <th>Số mã</th>
              <th>Ngày sinh</th>
              <th>Cảnh báo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {exams.map(e => (
              <tr key={e.id}>
                <td><strong>{e.exam_name}</strong></td>
                <td>{e.matrix_name} · {e.subject_name}</td>
                <td>{e.code_count}</td>
                <td>{new Date(e.created_at).toLocaleString('vi-VN')}</td>
                <td>{e.warnings?.length > 0 ? <span className="badge warning">{e.warnings.length}</span> : '-'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn ghost sm" onClick={() => setViewing(e)}>Xem</button>
                  {can(user, ['exam.create']) && (
                    <button className="btn ghost sm" onClick={() => del(e.id)} style={{ color: 'var(--danger)' }}>Xóa</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>}
      </div>

      {showGen && <GenerateModal initialMatrix={params.get('matrix')} matrices={matrices} onClose={() => setShowGen(false)} onDone={() => { setShowGen(false); load(); }} />}
      {viewing && <ExamDetailModal exam={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function GenerateModal({ matrices, onClose, onDone, initialMatrix }) {
  const [matrixId, setMatrixId] = useState(initialMatrix||'');
  const [examName, setExamName] = useState('');
  const [codeCount, setCodeCount] = useState(2);
  const [antiRepeat, setAntiRepeat] = useState(180);
  const [avoidCross, setAvoidCross] = useState(true);
  const [loading, setLoading] = useState(false);
  const [coverage, setCoverage] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [coverageError,setCoverageError]=useState('');
  const [allTags, setAllTags] = useState([]);
  const [tagExtras, setTagExtras] = useState([]); // [{tag_id, count}]

  useEffect(() => { api.get('/api/tags').then(setAllTags).catch(() => {}); }, []);

  const checkCoverage = async (id) => {
    if (!id) { setCoverage(null); return; }
    try { setCoverageError('');setCoverage(await api.get(`/api/matrix/${id}/coverage`)); }
    catch (e) { setCoverage(null);setCoverageError(e.message); }
  };

  useEffect(() => { checkCoverage(matrixId); }, [matrixId]);

  const submit = async () => {
    if (!matrixId) return alert('Chọn ma trận');
    if (!examName.trim()) return alert('Nhập tên đề');
    setLoading(true);
    try {
      const r = await api.post('/api/exams/generate', {
        matrix_id: Number(matrixId),
        exam_name: examName,
        exam_code_count: Number(codeCount),
        anti_repeat_days: Number(antiRepeat),
        avoid_cross_code_overlap: avoidCross,
        shuffle_options: true,
        tag_extras: tagExtras.filter(te => te.tag_id && te.count > 0).map(te => ({ tag_id: Number(te.tag_id), count: Number(te.count) })),
      });
      setWarnings(r.warnings || []);
      if (!r.warnings || r.warnings.length === 0) {
        alert('✅ Sinh đề thành công');
        onDone();
      }
    } catch (e) { alert(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>📄 Sinh đề thi</h3>

        <div style={{ marginBottom: 10 }}>
          <label className="label">Ma trận</label>
          <select value={matrixId} onChange={e => setMatrixId(e.target.value)} style={{ width: '100%' }}>
            <option value="">-- Chọn --</option>
            {matrices.map(m => <option key={m.id} value={m.id}>{m.name} · {m.subject_name} L{m.grade}</option>)}
          </select>
        </div>

        {coverageError&&<p className="warn-box" role="alert">{coverageError}</p>}<CoveragePanel coverage={coverage} onRefresh={()=>checkCoverage(matrixId)}/>

        <div style={{ marginBottom: 10 }}>
          <label className="label">Tên đề</label>
          <input value={examName} onChange={e => setExamName(e.target.value)} placeholder="VD: Giữa kỳ I năm 2026" style={{ width: '100%' }} />
        </div>

        <div className="row">
          <div style={{ flex: 1 }}>
            <label className="label">Số mã đề</label>
            <input type="number" min="1" max="10" value={codeCount} onChange={e => setCodeCount(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">Anti-repeat (ngày)</label>
            <input type="number" min="0" max="365" value={antiRepeat} onChange={e => setAntiRepeat(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 16 }}>
          <input type="checkbox" checked={avoidCross} onChange={e => setAvoidCross(e.target.checked)} />
          Tránh trùng câu giữa các mã đề
        </label>

        {/* === TAG EXTRAS === */}
        <div style={{ marginBottom: 16 }}>
          <div className="row space-between" style={{ marginBottom: 6 }}>
            <label className="label" style={{ margin: 0 }}>🏷️ Ưu tiên nhãn trong các ô ma trận</label>
            <button className="btn ghost sm" onClick={() => setTagExtras(te => [...te, { tag_id: '', count: 2 }])}>+ Thêm tag</button>
          </div>
          {tagExtras.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>
              (Không bắt buộc) Ưu tiên nhãn trong tập câu khớp YCCĐ/mức/dạng. Không thêm câu hoặc điểm ngoài ma trận.
            </div>
          )}
          {tagExtras.map((te, i) => (
            <div key={i} className="row" style={{ gap: 6, marginBottom: 4 }}>
              <select value={te.tag_id} onChange={e => {
                const v = e.target.value;
                setTagExtras(arr => arr.map((t, j) => j === i ? { ...t, tag_id: v } : t));
              }} style={{ flex: 1 }}>
                <option value="">-- Chọn tag --</option>
                {allTags.map(t => <option key={t.id} value={t.id}>{t.name} ({t.question_count} câu)</option>)}
              </select>
              <span style={{fontSize:12}}>Ưu tiên trong các ô khớp</span>
              <button className="btn ghost sm" style={{ color: 'var(--danger)' }}
                onClick={() => setTagExtras(arr => arr.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>

        {warnings.length > 0 && (
          <div className="warn-box">
            <strong>Đã sinh với cảnh báo:</strong>
            <ul style={{ margin: '6px 0 0 20px' }}>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            <button className="btn secondary sm" style={{ marginTop: 8 }} onClick={onDone}>Đóng và xem đề</button>
          </div>
        )}

        <div className="row space-between">
          <button className="btn secondary" onClick={onClose}>Hủy</button>
          <button className="btn primary" onClick={submit} disabled={loading||!coverage?.summary.can_generate}>{loading ? 'Đang sinh...' : 'Sinh đề'}</button>
        </div>
      </div>
    </div>
  );
}

function ExamDetailModal({ exam, onClose }) {
  const [detail, setDetail] = useState(null);
  const [selCode, setSelCode] = useState(null);

  useEffect(() => {
    api.get(`/api/exams/${exam.id}`).then(d => {
      setDetail(d);
      const codes = Object.keys(d.codes || {});
      if (codes.length > 0) setSelCode(codes[0]);
    });
  }, [exam.id]);

  if (!detail) return (
    <div className="modal-overlay" onClick={onClose}><div className="modal"><div className="loading">Đang tải...</div></div></div>
  );

  const codes = Object.keys(detail.codes || {});
  const items = detail.codes?.[selCode] || [];

  const dl = (kind) =>
    downloadFile(`/api/exams/${exam.id}/download?code=${selCode}&kind=${kind}`,
                 `${kind === 'answer' ? 'dapan' : 'de'}_${exam.exam_name}_${selCode}.docx`);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
        <div className="row space-between">
          <h3 style={{ margin: 0 }}>{detail.exam_name}</h3>
          <button className="btn ghost" onClick={onClose}>✕</button>
        </div>

        {detail.warnings?.length > 0 && (
          <div className="warn-box">
            {detail.warnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
        )}

        <div className="row" style={{ marginBottom: 10 }}>
          {codes.map(c => (
            <button key={c} className={`btn ${selCode === c ? 'primary' : 'secondary'}`} onClick={() => setSelCode(c)}>
              Mã {c}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button className="btn secondary" onClick={() => dl('exam')}>📥 Tải đề Word</button>
          <button className="btn secondary" onClick={() => dl('answer')}>📥 Tải đáp án</button>
          <button className="btn secondary" style={{ background: '#e74c3c', color: 'white', borderColor: '#e74c3c' }}
            onClick={() => downloadFile(`/api/exams/${exam.id}/download-qti?code=${selCode}`, `qti_${exam.exam_name}_${selCode}.zip`)}>
            📦 Tải QTI (Canvas)
          </button>
        </div>

        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {items.map((it, i) => (
            <div key={i} style={{ marginBottom: 14, padding: 10, background: '#f9fafb', borderRadius: 6 }}>
              <div style={{ marginBottom: 4 }}>
                <strong>Câu {it.order_index}.</strong>{' '}
                <span className={`level-chip ${it.cognitive_level}`}>{it.cognitive_level}</span>{' '}
                <span className="q-type-chip">{it.q_type}</span>{' '}
                <code style={{ fontSize: 10, color: 'var(--text-muted)' }}>{it.question_code}</code>
              </div>
              <p>{it.assigned_score!=null?Number(it.assigned_score).toFixed(2)+' điểm · ':''}Phiên bản {it.question_version_id||'Chưa xác định'}</p><Rich text={it.stem_text}/>{it.type==='matching'&&<div className="practice-grid"><div>{it.left?.map(l=><p key={l.id}>{l.id}. {l.text}</p>)}</div><div>{it.right?.map(r=><p key={r.id}>{r.id}. {r.text}</p>)}</div></div>}{it.type==='true_false'&&it.statements?.map(s=><p key={s.id}>{s.id}) {s.text}</p>)}
              {it.q_type === 'mcq4' && (
                <div style={{ marginTop: 4, fontSize: 12 }}>
                  {['A','B','C','D'].map(k => {
                    const txt = it['option_' + k.toLowerCase()];
                    return txt ? <div key={k}>{k}. {txt}</div> : null;
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
