import { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth, can, canManage } from '../hooks/useAuth.js';

const FLAG_LABEL = {
  good: { text: '✅ Tốt', color: '#10b981', bg: '#10b98118' },
  review: { text: '⚠️ Cần xem lại', color: '#f59e0b', bg: '#f59e0b18' },
  poor: { text: '❌ Kém', color: '#ef4444', bg: '#ef444418' },
  flag: { text: '🚩 Lỗi', color: '#dc2626', bg: '#dc262618' },
};

const P_LABELS = [
  { range: [0, 0.20], label: 'Rất khó', color: '#dc2626' },
  { range: [0.20, 0.40], label: 'Khó', color: '#f59e0b' },
  { range: [0.40, 0.60], label: 'Vừa', color: '#10b981' },
  { range: [0.60, 0.80], label: 'Dễ', color: '#3b82f6' },
  { range: [0.80, 1.01], label: 'Rất dễ', color: '#8b5cf6' },
];

function getPLabel(p) {
  for (const l of P_LABELS) if (p >= l.range[0] && p < l.range[1]) return l;
  return P_LABELS[2];
}

export default function Analysis() {
  const { user } = useAuth();
  const manage = can(user, ['exam.create']);
  const [tab, setTab] = useState('summary');
  const [summary, setSummary] = useState(null);
  const [exams, setExams] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [importModal, setImportModal] = useState(null);

  useEffect(() => {
    api.get('/api/analysis/summary').then(setSummary).catch(() => {});
    api.get('/api/exams').then(setExams).catch(() => {});
  }, []);

  const runAnalysis = async (runId) => {
    setAnalyzing(true);
    try {
      const result = await api.post(`/api/analysis/exams/${runId}/analyze`);
      alert(`✅ Phân tích xong ${result.analyzed} câu hỏi!`);
      api.get('/api/analysis/summary').then(setSummary);
    } catch (e) { alert(e.message); }
    finally { setAnalyzing(false); }
  };

  const TABS = [
    { id: 'summary', label: '📊 Tổng hợp chất lượng' },
    { id: 'exams', label: '📝 Phân tích đợt thi' },
    { id: 'worst', label: '🚩 Câu cần sửa' },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>🔬 Phân tích Chất lượng Câu hỏi (Item Analysis)</h2>
      </div>

      <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
        {TABS.map(t => (
          <button key={t.id} className={`btn ${tab === t.id ? 'primary' : 'secondary'}`}
            onClick={() => setTab(t.id)} style={{ fontSize: 13 }}>{t.label}</button>
        ))}
      </div>

      {/* ============ SUMMARY ============ */}
      {tab === 'summary' && (
        <div>
          {!summary ? <div className="loading">Đang tải...</div> : (
            <>
              {/* Quality distribution */}
              <div className="stat-grid" style={{ marginBottom: 16 }}>
                {Object.entries(FLAG_LABEL).map(([key, cfg]) => (
                  <div key={key} className="stat-card" style={{ borderLeft: `4px solid ${cfg.color}` }}>
                    <div className="label">{cfg.text}</div>
                    <div className="value">{summary.quality_flags[key] || 0}</div>
                  </div>
                ))}
                <div className="stat-card">
                  <div className="label">Đã phân tích</div>
                  <div className="value">{summary.difficulty_distribution?.analyzed_count || 0}</div>
                </div>
              </div>

              {/* Difficulty distribution bar */}
              {summary.difficulty_distribution?.analyzed_count > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 12px' }}>Phân bố Độ khó (Difficulty Index)</h4>
                  <div style={{ display: 'flex', gap: 0, height: 32, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
                    {[
                      { key: 'very_hard', label: 'Rất khó', color: '#dc2626' },
                      { key: 'hard', label: 'Khó', color: '#f59e0b' },
                      { key: 'medium', label: 'Vừa', color: '#10b981' },
                      { key: 'easy', label: 'Dễ', color: '#3b82f6' },
                      { key: 'very_easy', label: 'Rất dễ', color: '#8b5cf6' },
                    ].map(seg => {
                      const count = summary.difficulty_distribution[seg.key] || 0;
                      const total = summary.difficulty_distribution.analyzed_count || 1;
                      const pct = (count / total * 100).toFixed(0);
                      if (count === 0) return null;
                      return (
                        <div key={seg.key} style={{
                          width: `${pct}%`, background: seg.color, minWidth: count > 0 ? 24 : 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'white', fontSize: 11, fontWeight: 600,
                        }} title={`${seg.label}: ${count} câu (${pct}%)`}>
                          {pct > 8 ? `${pct}%` : ''}
                        </div>
                      );
                    })}
                  </div>
                  <div className="row" style={{ gap: 12, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                    <span>🔴 Rất khó (&lt;0.2)</span>
                    <span>🟡 Khó (0.2-0.4)</span>
                    <span>🟢 Vừa (0.4-0.6)</span>
                    <span>🔵 Dễ (0.6-0.8)</span>
                    <span>🟣 Rất dễ (&gt;0.8)</span>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
                    Trung bình: <strong>p = {summary.difficulty_distribution.avg_p}</strong> · 
                    <strong> D = {summary.difficulty_distribution.avg_d}</strong>
                  </div>
                </div>
              )}

              {summary.difficulty_distribution?.analyzed_count === 0 && (
                <div className="card">
                  <div className="empty-state">
                    Chưa có dữ liệu phân tích. Hãy import kết quả HS ở tab "Phân tích đợt thi" trước.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ============ EXAMS ============ */}
      {tab === 'exams' && (
        <div>
          <div className="card" style={{ padding: 16, marginBottom: 12, background: '#f0f9ff', border: '1px solid #bae6fd' }}>
            <strong>Hướng dẫn:</strong>
            <ol style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13 }}>
              <li>Chọn đợt thi cần phân tích</li>
              <li>Import kết quả trả lời HS (JSON format)</li>
              <li>Bấm "Phân tích" để hệ thống tính toán chỉ số</li>
              <li>Kết quả sẽ cập nhật vào từng câu hỏi trong kho</li>
            </ol>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Đợt thi</th>
                  <th>Môn · Ma trận</th>
                  <th>Ngày tạo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {exams.map(e => (
                  <tr key={e.id}>
                    <td><strong>{e.exam_name}</strong></td>
                    <td>{e.subject_name} · {e.matrix_name}</td>
                    <td style={{ fontSize: 12 }}>{new Date(e.created_at).toLocaleString('vi-VN')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {manage && (
                        <>
                          <button className="btn secondary sm" onClick={() => setImportModal(e)}>
                            📥 Import KQ
                          </button>
                          <button className="btn primary sm" onClick={() => runAnalysis(e.id)}
                            disabled={analyzing} style={{ marginLeft: 4 }}>
                            {analyzing ? '⏳...' : '🔬 Phân tích'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============ WORST ============ */}
      {tab === 'worst' && (
        <div className="card" style={{ padding: 0 }}>
          <h4 style={{ padding: '12px 16px', margin: 0, borderBottom: '1px solid var(--border)' }}>
            🚩 Câu hỏi chất lượng kém (D &lt; 0.10)
          </h4>
          {!summary?.worst_items?.length ? (
            <div className="empty-state">Chưa có câu nào bị đánh dấu kém. Chạy phân tích trước.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Môn</th>
                  <th>Nội dung</th>
                  <th>p (Khó)</th>
                  <th>D (Phân biệt)</th>
                  <th>Đánh giá</th>
                </tr>
              </thead>
              <tbody>
                {summary.worst_items.map(q => {
                  const pInfo = getPLabel(q.difficulty_index || 0);
                  const flagInfo = FLAG_LABEL[q.quality_flag] || FLAG_LABEL.review;
                  return (
                    <tr key={q.id}>
                      <td><code>{q.question_code}</code></td>
                      <td>{q.subject_name}</td>
                      <td style={{ maxWidth: 300, fontSize: 12 }}>{q.stem_text?.slice(0, 80)}...</td>
                      <td>
                        <span style={{ color: pInfo.color, fontWeight: 600 }}>
                          {q.difficulty_index?.toFixed(3)}
                        </span>
                        <br /><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{pInfo.label}</span>
                      </td>
                      <td>
                        <span style={{ color: q.discrimination_index < 0 ? '#dc2626' : '#f59e0b', fontWeight: 600 }}>
                          {q.discrimination_index?.toFixed(3)}
                        </span>
                      </td>
                      <td>
                        <span className="badge" style={{ background: flagInfo.bg, color: flagInfo.color }}>
                          {flagInfo.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Import Modal */}
      {importModal && (
        <ImportResponsesModal exam={importModal} onClose={() => setImportModal(null)}
          onDone={() => { setImportModal(null); api.get('/api/analysis/summary').then(setSummary); }} />
      )}
    </div>
  );
}

function ImportResponsesModal({ exam, onClose, onDone }) {
  const [json, setJson] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    try {
      const responses = JSON.parse(json);
      if (!Array.isArray(responses)) return alert('Dữ liệu phải là mảng JSON');
      setLoading(true);
      const r = await api.post(`/api/analysis/exams/${exam.id}/import-responses`, { responses });
      alert(`✅ Đã import ${r.inserted} bản ghi`);
      onDone();
    } catch (e) {
      alert(e.message || 'Lỗi parse JSON');
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>📥 Import kết quả HS — {exam.exam_name}</h3>
        <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text-muted)' }}>
          Paste JSON array, mỗi phần tử: <code>{`{ student_code, exam_code, question_id, selected_answer }`}</code>
        </div>
        <textarea
          value={json} onChange={e => setJson(e.target.value)}
          placeholder={`[\n  { "student_code": "HS001", "exam_code": "101", "question_id": 42, "selected_answer": "B" },\n  ...\n]`}
          style={{ width: '100%', height: 200, fontFamily: 'monospace', fontSize: 12, marginBottom: 16 }}
        />
        <div className="row space-between">
          <button className="btn secondary" onClick={onClose}>Hủy</button>
          <button className="btn primary" onClick={submit} disabled={loading}>
            {loading ? 'Đang import...' : '📥 Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
