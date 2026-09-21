import { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth, can } from '../hooks/useAuth.js';
import MatrixBuilder from '../components/MatrixBuilder.jsx';



export default function Matrix() {
  const { user } = useAuth();
  const manage = !!user.capabilities?.content_write;
  const [matrices, setMatrices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [wizard, setWizard] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null); // matrix to edit

  const load = async () => {
    setLoading(true);
    try { setMatrices(await api.get('/api/matrix')); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    api.get('/api/taxonomy/subjects').then(setSubjects);
  }, []);

  const deleteMatrix = async (id) => {
    if (!confirm('Xóa ma trận này?')) return;
    try { await api.del(`/api/matrix/${id}`); load(); }
    catch (e) { alert(e.message); }
  };

  const toggleLock = async (m) => {
    const action = m.status === 'Đã chốt' ? 'Mở khóa' : 'Chốt';
    if (!confirm(`${action} ma trận "${m.name}"?`)) return;
    try {
      await api.patch(`/api/matrix/${m.id}/toggle-lock`);
      load();
    } catch (e) { alert(e.message); }
  };

  const canEditMatrix = (m) => {
    if (m.status === 'Đã chốt' && !can(user, ['matrix.lock'])) return false;
    const isCreator = m.creator_id === user.id;
    const isHigher = can(user, ['matrix.lock']);
    return manage && (isCreator || isHigher);
  };

  const workflow=async(m,status)=>{try{await api.post('/api/matrix/'+m.id+'/workflow',{status});await load();}catch(e){alert(e.message);}};

  return (
    <div>
      <div className="page-header">
        <h2>📐 Ma trận đề</h2>
        {/* Teacher: ẩn nút tạo ma trận */}
        {!wizard && manage && (
          <div className="row">
            <button className="btn primary" disabled={!subjects.length} onClick={() => setWizard('khtn')}>🧪 KHTN (3 phân môn)</button>
            <button className="btn secondary" disabled={!subjects.length} onClick={() => setWizard('generic')}>📚 Toán / Văn / Anh...</button>
          </div>
        )}
      </div>

      {wizard && (
        <MatrixBuilder subjects={subjects} onClose={() => setWizard(null)} onSaved={() => load()} />
      )}

      {!wizard && (
        <div className="card" style={{ padding: 0 }}>
          {loading ? <div className="loading">Đang tải...</div> :
           matrices.length === 0 ? <div className="empty-state">{manage ? 'Chưa có ma trận nào. Bấm nút ở trên để tạo.' : 'Chưa có ma trận nào cho môn của bạn.'}</div> :
          <table>
            <thead>
              <tr>
                <th>Tên ma trận</th>
                <th>Môn · Lớp</th>
                <th>Mục đích</th>
                <th>Điểm · Phút · Ô</th>
                <th>Trạng thái</th>
                <th>Người tạo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {matrices.map(m => (
                <tr key={m.id}>
                  <td><strong>{m.name}</strong></td>
                  <td>{m.subject_name} · L{m.grade}</td>
                  <td><span className="badge">{m.purpose}</span></td>
                  <td>{Number(m.total_score).toFixed(1)}đ · {m.duration_minutes}p · {m.cell_count} ô</td>
                  <td>
                    <span className={`badge ${m.status === 'Đã chốt' ? 'success' : 'info'}`}>
                      {{draft:'Bản nháp',pending_review:'Chờ duyệt',approved:'Đã duyệt',locked:'Đã khóa',archived:'Lưu trữ'}[m.workflow_status]||m.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.creator_name || '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn ghost sm" onClick={() => setViewing(m)}>Xem</button>
                    {canEditMatrix(m) && (
                      <button className="btn ghost sm" onClick={() => setEditing(m)}>Sửa</button>
                    )}
                    {manage&&m.creator_id===user.id&&m.workflow_status==='draft'&&<button className="btn ghost sm" onClick={()=>workflow(m,'pending_review')}>Gửi duyệt</button>}
                    {user.capabilities?.content_review&&m.workflow_status==='pending_review'&&<button className="btn ghost sm" onClick={()=>workflow(m,'approved')}>Duyệt</button>}
                    {user.capabilities?.content_review && (
                      <button className="btn ghost sm" onClick={() => toggleLock(m)}
                        style={{ color: m.status === 'Đã chốt' ? 'var(--success)' : 'var(--warning)' }}>
                        {m.status === 'Đã chốt' ? '🔓 Mở' : '🔒 Chốt'}
                      </button>
                    )}
                    {can(user, ['matrix.review']) && (
                      <button className="btn ghost sm" onClick={() => deleteMatrix(m.id)} style={{ color: 'var(--danger)' }}>Xóa</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>}
        </div>
      )}

      {viewing && <MatrixViewModal matrix={viewing} onClose={() => setViewing(null)} />}
      {editing && <div className="modal-overlay"><div className="modal modal-xl" style={{maxHeight:'92vh',overflow:'auto'}}><MatrixBuilder subjects={subjects} matrix={editing} onClose={()=>setEditing(null)} onSaved={()=>load()}/></div></div>}
    </div>
  );
}

// ================================================================
// WIZARD 1: KHTN (3 phân môn: Vật lí + Hóa + Sinh)
// ================================================================
function MatrixViewModal({ matrix, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/matrix/${matrix.id}`).then(d => {
      setDetail(d);
      setLoading(false);
    }).catch(e => { alert(e.message); onClose(); });
  }, [matrix.id]);

  const LEVEL_LABELS = { M1: 'Nhận biết', M2: 'Thông hiểu', M3: 'Vận dụng', M4: 'Vận dụng cao' };
  const TYPE_LABELS = { mcq4: 'Trắc nghiệm', true_false: 'Đúng-Sai', short: 'Trả lời ngắn', essay: 'Tự luận', matching:'Ghép nối' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflow: 'auto' }}>
        <div className="row space-between" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>📐 {matrix.name}</h3>
          <button className="btn ghost" onClick={onClose}>✕</button>
        </div>

        {loading ? <div className="loading">Đang tải chi tiết...</div> : detail && (
          <>
            <div className="row" style={{ flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <div className="card" style={{ padding: '10px 14px', flex: 1, minWidth: 120 }}>
                <small style={{ color: 'var(--text-muted)' }}>Môn</small>
                <div><strong>{detail.subject_name}</strong></div>
              </div>
              <div className="card" style={{ padding: '10px 14px', flex: 1, minWidth: 80 }}>
                <small style={{ color: 'var(--text-muted)' }}>Lớp</small>
                <div><strong>{detail.grade}</strong></div>
              </div>
              <div className="card" style={{ padding: '10px 14px', flex: 1, minWidth: 100 }}>
                <small style={{ color: 'var(--text-muted)' }}>Mục đích</small>
                <div><strong>{detail.purpose}</strong></div>
              </div>
              <div className="card" style={{ padding: '10px 14px', flex: 1, minWidth: 100 }}>
                <small style={{ color: 'var(--text-muted)' }}>Tổng điểm</small>
                <div><strong>{Number(detail.total_score).toFixed(1)}đ</strong></div>
              </div>
              <div className="card" style={{ padding: '10px 14px', flex: 1, minWidth: 100 }}>
                <small style={{ color: 'var(--text-muted)' }}>Thời gian</small>
                <div><strong>{detail.duration_minutes} phút</strong></div>
              </div>
              <div className="card" style={{ padding: '10px 14px', flex: 1, minWidth: 120 }}>
                <small style={{ color: 'var(--text-muted)' }}>Trạng thái</small>
                <div>
                  <span className={`badge ${detail.status === 'Đã chốt' ? 'success' : 'info'}`}>
                    {detail.status === 'Đã chốt' ? '🔒 ' : ''}{detail.status}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <strong>📊 Tỉ trọng:</strong>{' '}
              M1: {detail.ratio_m1}% · M2: {detail.ratio_m2}% · M3: {detail.ratio_m3}% · M4: {detail.ratio_m4}%
            </div>

            {detail.branch_config && Array.isArray(detail.branch_config) && detail.branch_config.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <strong>🔬 Phân môn:</strong>
                <div className="row" style={{ gap: 8, marginTop: 6 }}>
                  {detail.branch_config.map((bc, i) => (
                    <div key={i} className="card" style={{ padding: '6px 10px', fontSize: 13 }}>
                      <strong>{bc.branch_code}</strong>: {bc.score}đ · {bc.periods || 0} tiết
                    </div>
                  ))}
                </div>
              </div>
            )}

            <h4 style={{ margin: '12px 0 8px' }}>📋 Chi tiết ô ({detail.cells?.length || 0} ô)</h4>
            <div className="card" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Phần</th>
                    <th>Dạng câu</th>
                    <th>Mức độ</th>
                    <th>Phân môn</th>
                    <th>Outcome / YCCĐ</th><th>Số câu</th>
                    <th>Điểm/câu</th>
                    <th>Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.cells || []).map((c, i) => (
                    <tr key={c.id || i}>
                      <td>{i + 1}</td>
                      <td style={{ fontSize: 12 }}>{c.part_name || '-'}</td>
                      <td><span className="q-type-chip">{TYPE_LABELS[c.q_type] || c.q_type}</span></td>
                      <td><span className={`level-chip ${c.cognitive_level}`}>{c.cognitive_level} ({LEVEL_LABELS[c.cognitive_level]})</span></td>
                      <td style={{ color: c.branch_color || 'var(--text-muted)' }}>{c.branch_name || '-'}</td>
                      <td title={c.yccd_text}>{c.outcome_code||'—'} / {c.yccd_code||'Chưa gán'}</td><td><strong>{c.question_count}</strong></td>
                      <td>{Number(c.score_per_question).toFixed(2)}đ</td>
                      <td><strong>{(c.question_count * Number(c.score_per_question)).toFixed(2)}đ</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f9fafb', fontWeight: 600 }}>
                    <td colSpan={6}>Tổng</td>
                    <td>{(detail.cells || []).reduce((s, c) => s + c.question_count, 0)}</td>
                    <td></td>
                    <td>{(detail.cells || []).reduce((s, c) => s + c.question_count * Number(c.score_per_question), 0).toFixed(2)}đ</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              Người tạo: {detail.creator_name || '-'} · Tạo lúc: {new Date(detail.created_at).toLocaleString('vi-VN')}
            </div>
          </>
        )}

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn secondary" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
