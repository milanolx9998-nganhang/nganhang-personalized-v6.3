import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth, can } from '../hooks/useAuth.js';

const TIER_LABELS = { core: '🔵 Lõi', academic: '🟢 Học thuật', ops: '🟡 Vận hành', custom: '⚪ Tùy chỉnh' };
const TIER_COLORS = { core: '#3b82f6', academic: '#10b981', ops: '#f59e0b', custom: '#6b7280' };

export default function Tags() {
  const { user } = useAuth();
  const manage = can(user, ['system.config']);
  const [tags, setTags] = useState([]);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');

  const load = () => api.get('/api/tags').then(setTags);
  useEffect(() => { load(); }, []);

  const filtered = tags.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.category || '').toLowerCase().includes(search.toLowerCase())
  );

  // Nhóm theo tier
  const grouped = {};
  for (const t of filtered) {
    if (!grouped[t.tier]) grouped[t.tier] = [];
    grouped[t.tier].push(t);
  }

  const handleDelete = async (tag) => {
    if (!confirm(`Xóa nhãn "${tag.name}"? Sẽ gỡ khỏi tất cả câu hỏi đang sử dụng.`)) return;
    try { await api.del(`/api/tags/${tag.id}`); load(); }
    catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div className="page-header">
        <h2>🏷️ Quản lý Nhãn (Tags)</h2>
        {manage && <button className="btn primary" onClick={() => setEditing({})}>+ Nhãn mới</button>}
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Tìm nhãn..." style={{ flex: 1, maxWidth: 300 }}
        />
        <span className="badge info" style={{ marginLeft: 8 }}>
          {tags.length} nhãn · gắn tổng {tags.reduce((a, t) => a + t.question_count, 0)} lượt
        </span>
      </div>

      {['core', 'academic', 'ops', 'custom'].map(tier => {
        const items = grouped[tier];
        if (!items || items.length === 0) return null;
        return (
          <div key={tier} className="card" style={{ marginBottom: 12 }}>
            <h4 style={{ margin: '0 0 10px', color: TIER_COLORS[tier] }}>
              {TIER_LABELS[tier]} ({items.length})
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {items.map(t => (
                <div key={t.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: TIER_COLORS[tier] + '12', border: `1px solid ${TIER_COLORS[tier]}40`,
                  borderRadius: 6, padding: '6px 10px', fontSize: 13,
                }}>
                  <span style={{ fontWeight: 500 }}>{t.name}</span>
                  {t.category && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({t.category})</span>}
                  <span className="badge" style={{ fontSize: 10, minWidth: 18, textAlign: 'center', padding: '1px 5px' }}>
                    {t.question_count}
                  </span>
                  {manage && (
                    <>
                      <button className="btn ghost sm" style={{ padding: 2, fontSize: 11 }}
                        onClick={() => setEditing(t)}>✏️</button>
                      <button className="btn ghost sm" style={{ padding: 2, fontSize: 11, color: 'var(--danger)' }}
                        onClick={() => handleDelete(t)}>✕</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {tags.length === 0 && (
        <div className="card">
          <div className="empty-state">
            Chưa có nhãn nào. Bấm "+ Nhãn mới" để tạo.<br />
            <small style={{ color: 'var(--text-muted)' }}>
              Ví dụ: "SGK_KNTT", "Bám sát đề thi", "Câu hay", "Cần review"...
            </small>
          </div>
        </div>
      )}

      {editing !== null && (
        <TagModal tag={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function TagModal({ tag, onClose, onSaved }) {
  const isNew = !tag.id;
  const [data, setData] = useState({
    name: tag.name || '',
    tier: tag.tier || 'custom',
    category: tag.category || '',
  });

  const save = async () => {
    try {
      if (isNew) {
        await api.post('/api/tags', data);
      } else {
        await api.put(`/api/tags/${tag.id}`, data);
      }
      onSaved();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{isNew ? '+ Thêm nhãn' : 'Sửa nhãn'}</h3>
        <div style={{ marginBottom: 10 }}>
          <label className="label">Tên nhãn</label>
          <input value={data.name} onChange={e => setData(d => ({ ...d, name: e.target.value }))}
            style={{ width: '100%' }} placeholder="VD: SGK_KNTT, Câu hay, Đề thi HSG..." />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label className="label">Phân loại (Tier)</label>
          <select value={data.tier} onChange={e => setData(d => ({ ...d, tier: e.target.value }))} style={{ width: '100%' }}>
            <option value="core">🔵 Lõi (Core)</option>
            <option value="academic">🟢 Học thuật (Academic)</option>
            <option value="ops">🟡 Vận hành (Ops)</option>
            <option value="custom">⚪ Tùy chỉnh (Custom)</option>
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className="label">Danh mục (tuỳ chọn)</label>
          <input value={data.category} onChange={e => setData(d => ({ ...d, category: e.target.value }))}
            style={{ width: '100%' }} placeholder="VD: Nguồn, Chất lượng, Đề thi..." />
        </div>
        <div className="row space-between">
          <button className="btn secondary" onClick={onClose}>Hủy</button>
          <button className="btn primary" onClick={save}>💾 Lưu</button>
        </div>
      </div>
    </div>
  );
}
