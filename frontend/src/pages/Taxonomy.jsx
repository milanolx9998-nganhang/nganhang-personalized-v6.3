import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Taxonomy() {
  const [subjects, setSubjects] = useState([]);
  const [branches, setBranches] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedSub, setSelectedSub] = useState(null);
  const [selectedGrade, setSelectedGrade] = useState(9);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [showTopicModal, setShowTopicModal] = useState(null);

  const loadSubjects = () => api.get('/api/taxonomy/subjects').then(setSubjects);
  const loadTopics = () => {
    if (!selectedSub) return;
    api.get(`/api/taxonomy/topics?subject_id=${selectedSub.id}&grade=${selectedGrade}`).then(setTopics);
  };

  useEffect(() => { loadSubjects(); }, []);

  useEffect(() => {
    if (!selectedSub) return;
    api.get(`/api/taxonomy/branches?subject_id=${selectedSub.id}`).then(b => {
      setBranches(b);
      setSelectedBranch(null); // reset khi đổi môn
    });
    loadTopics();
  }, [selectedSub, selectedGrade]);

  return (
    <div>
      <div className="page-header">
        <h2>📚 Môn học · Chương · Bài</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 12 }}>
          <h4 style={{ margin: '0 0 10px' }}>Môn học</h4>
          <div className="col">
            {subjects.map(s => (
              <button key={s.id}
                className="btn"
                onClick={() => setSelectedSub(s)}
                style={{
                  justifyContent: 'space-between',
                  background: selectedSub?.id === s.id ? 'var(--primary)' : 'white',
                  color: selectedSub?.id === s.id ? 'white' : 'var(--text)',
                  border: '1px solid var(--border-strong)',
                }}>
                {s.name} {s.is_integrated && <span className="badge purple" style={{ fontSize: 9 }}>Tích hợp</span>}
              </button>
            ))}
          </div>
        </div>

        <div>
          {!selectedSub ? <div className="empty-state">Chọn môn ở bên trái</div> :
          <>
            <div className="row space-between" style={{ marginBottom: 10 }}>
              <div>
                <h3 style={{ margin: 0 }}>{selectedSub.name}</h3>
                {branches.length > 0 && (
                  <div className="row" style={{ marginTop: 6, gap: 4 }}>
                    <small style={{ color: 'var(--text-muted)' }}>Phân môn:</small>
                    <button
                      className="btn ghost sm"
                      onClick={() => setSelectedBranch(null)}
                      style={{
                        padding: '2px 8px', fontSize: 12, borderRadius: 4,
                        background: selectedBranch === null ? 'var(--primary)' : 'transparent',
                        color: selectedBranch === null ? 'white' : 'var(--text-muted)',
                      }}>Tất cả</button>
                    {branches.map(b => (
                      <button key={b.id}
                        className="btn ghost sm"
                        onClick={() => setSelectedBranch(b.id)}
                        style={{
                          padding: '2px 8px', fontSize: 12, borderRadius: 4,
                          background: selectedBranch === b.id ? b.color : b.color + '20',
                          color: selectedBranch === b.id ? 'white' : b.color,
                          fontWeight: selectedBranch === b.id ? 600 : 400,
                        }}>{b.name}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="row">
                <label>Lớp:</label>
                <select value={selectedGrade} onChange={e => setSelectedGrade(Number(e.target.value))}>
                  {[6,7,8,9,10,11,12].map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <button className="btn primary" onClick={() => setShowTopicModal({})}>+ Bài mới</button>
              </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
              {topics.length === 0 ? <div className="empty-state">Chưa có bài nào cho môn {selectedSub.name} lớp {selectedGrade}</div> :
              <table>
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Chương</th>
                    <th>Tên bài</th>
                    <th>Phân môn</th>
                    <th>Mục tiêu</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {topics.filter(t => selectedBranch === null || t.branch_id === selectedBranch).map(t => (
                    <tr key={t.id}>
                      <td>{t.order_index}</td>
                      <td>{t.chapter}</td>
                      <td><strong>{t.name}</strong></td>
                      <td>{t.branch_name ? <span style={{ color: t.branch_color }}>{t.branch_name}</span> : '-'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.learning_goal?.slice(0, 80)}</td>
                      <td>
                        <button className="btn ghost sm" onClick={() => setShowTopicModal(t)}>Sửa</button>
                        <button className="btn ghost sm" style={{ color: 'var(--danger)' }}
                          onClick={async () => {
                            if (!confirm(`Xóa bài "${t.name}"?`)) return;
                            try { await api.del(`/api/taxonomy/topics/${t.id}`); loadTopics(); }
                            catch(e) { alert(e.message); }
                          }}>Xóa</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>}
            </div>
          </>}
        </div>
      </div>

      {showTopicModal !== null && (
        <TopicModal topic={showTopicModal} subject={selectedSub} grade={selectedGrade} branches={branches}
                    onClose={() => setShowTopicModal(null)}
                    onSaved={() => { setShowTopicModal(null); loadTopics(); }} />
      )}
    </div>
  );
}

function TopicModal({ topic, subject, grade, branches, onClose, onSaved }) {
  const isNew = !topic.id;
  const [data, setData] = useState({
    chapter: topic.chapter || '',
    name: topic.name || '',
    branch_id: topic.branch_id || '',
    order_index: topic.order_index || 0,
    learning_goal: topic.learning_goal || '',
  });

  const save = async () => {
    try {
      if (isNew) {
        await api.post('/api/taxonomy/topics', {
          subject_id: subject.id, grade,
          branch_id: data.branch_id ? Number(data.branch_id) : null,
          chapter: data.chapter || null,
          name: data.name,
          order_index: Number(data.order_index) || 0,
          learning_goal: data.learning_goal || null,
        });
      } else {
        await api.put(`/api/taxonomy/topics/${topic.id}`, {
          chapter: data.chapter || null,
          name: data.name,
          order_index: Number(data.order_index),
          learning_goal: data.learning_goal || null,
        });
      }
      onSaved();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{isNew ? '+ Thêm bài' : 'Sửa bài'}</h3>
        {branches.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <label className="label">Phân môn</label>
            <select value={data.branch_id} onChange={e => setData(d => ({ ...d, branch_id: e.target.value }))} style={{ width: '100%' }}>
              <option value="">-- Không --</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <div style={{ marginBottom: 10 }}>
          <label className="label">Chương / Chủ đề lớn</label>
          <input value={data.chapter} onChange={e => setData(d => ({ ...d, chapter: e.target.value }))} style={{ width: '100%' }}
                 placeholder="VD: KHTN 9 — Vật lí: Năng lượng & Cơ năng" />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label className="label">Tên bài</label>
          <input value={data.name} onChange={e => setData(d => ({ ...d, name: e.target.value }))} style={{ width: '100%' }}
                 placeholder="VD: Bài 3: Cơ năng" />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label className="label">Thứ tự (STT)</label>
          <input type="number" value={data.order_index} onChange={e => setData(d => ({ ...d, order_index: e.target.value }))} style={{ width: 100 }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className="label">Mục tiêu học</label>
          <textarea rows="3" style={{ width: '100%' }} value={data.learning_goal} onChange={e => setData(d => ({ ...d, learning_goal: e.target.value }))} />
        </div>
        <div className="row space-between">
          <button className="btn secondary" onClick={onClose}>Hủy</button>
          <button className="btn primary" onClick={save}>💾 Lưu</button>
        </div>
      </div>
    </div>
  );
}
