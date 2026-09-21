import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth, can } from '../hooks/useAuth.js';

const LEVEL_LABELS = { M1: 'Nhận biết', M2: 'Thông hiểu', M3: 'Vận dụng', M4: 'Vận dụng cao' };
const TYPE_LABELS  = { mcq4: 'Trắc nghiệm', true_false: 'Đúng-Sai', short: 'TL ngắn', essay: 'Tự luận' };

export default function Reports() {
  const { user } = useAuth();
  const showAudit = can(user, ['audit.read']);
  const [stats, setStats] = useState([]);
  const [topUsed, setTopUsed] = useState([]);
  const [audit, setAudit] = useState([]);
  const [health, setHealth] = useState(null);
  const [gaps, setGaps] = useState(null);
  const [dups, setDups] = useState(null);
  const [tab, setTab] = useState('health');

  useEffect(() => {
    api.get('/api/reports/questions/stats').then(setStats);
    api.get('/api/reports/questions/top-used').then(setTopUsed);
    api.get('/api/reports/health').then(setHealth).catch(() => {});
    api.get('/api/reports/gaps').then(setGaps).catch(() => {});
    api.get('/api/reports/duplicates').then(setDups).catch(() => {});
    if (showAudit) api.get('/api/reports/audit?limit=100').then(setAudit).catch(() => {});
  }, []);

  const TABS = [
    { id: 'health', label: '🏥 Sức khỏe kho', icon: '' },
    { id: 'gaps',   label: '🕳️ Lỗ hổng',     icon: '' },
    { id: 'dups',   label: '🔁 Trùng lặp',    icon: '' },
    { id: 'stats',  label: '📊 Thống kê',      icon: '' },
    { id: 'top',    label: '🔥 Top dùng nhiều', icon: '' },
  ];
  if (showAudit) TABS.push({ id: 'audit', label: '📋 Nhật ký', icon: '' });

  return (
    <div>
      <div className="page-header">
        <h2>📊 Báo cáo</h2>
      </div>
      <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
        {TABS.map(t => (
          <button key={t.id} className={`btn ${tab === t.id ? 'primary' : 'secondary'}`}
            onClick={() => setTab(t.id)} style={{ fontSize: 13 }}>{t.label}</button>
        ))}
      </div>

      {/* =============== HEALTH =============== */}
      {tab === 'health' && (
        <div>
          {!health ? <div className="loading">Đang tải...</div> : (
            <>
              {/* Score card */}
              <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: '24px 16px' }}>
                <div style={{ fontSize: 48, fontWeight: 800, color: health.grade === 'A' ? '#10b981' : health.grade === 'B' ? '#3b82f6' : health.grade === 'C' ? '#f59e0b' : '#ef4444' }}>
                  {health.grade}
                </div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>{health.score}/100 điểm</div>
                <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>Tổng: {health.total} câu hỏi</div>

                {/* Status badges */}
                <div className="row" style={{ justifyContent: 'center', marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(health.status).map(([s, n]) => (
                    <span key={s} className="badge" style={{
                      background: s === 'Đã duyệt' ? '#10b98120' : s === 'Đã rà soát' ? '#3b82f620' : s === 'Tạm ẩn' ? '#ef444420' : '#f59e0b20',
                      color: s === 'Đã duyệt' ? '#10b981' : s === 'Đã rà soát' ? '#3b82f6' : s === 'Tạm ẩn' ? '#ef4444' : '#f59e0b',
                      padding: '4px 10px',
                    }}>
                      {s}: <strong>{n}</strong>
                    </span>
                  ))}
                </div>

                {/* Progress bar */}
                <div style={{ marginTop: 16, maxWidth: 400, margin: '16px auto 0' }}>
                  <div style={{ height: 12, background: 'var(--bg-hover)', borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
                    {health.total > 0 && (
                      <>
                        <div style={{ width: `${((health.status['Đã duyệt'] || 0) + (health.status['Đã sử dụng'] || 0)) / health.total * 100}%`, background: '#10b981' }} title="Đã duyệt" />
                        <div style={{ width: `${(health.status['Đã rà soát'] || 0) / health.total * 100}%`, background: '#3b82f6' }} title="Đã rà soát" />
                        <div style={{ width: `${(health.status['Mới tạo'] || 0) / health.total * 100}%`, background: '#f59e0b' }} title="Mới tạo" />
                        <div style={{ width: `${(health.status['Tạm ẩn'] || 0) / health.total * 100}%`, background: '#ef4444' }} title="Tạm ẩn" />
                      </>
                    )}
                  </div>
                  <div className="row" style={{ justifyContent: 'center', gap: 12, marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>🟢 Duyệt</span><span>🔵 Rà soát</span><span>🟡 Nháp</span><span>🔴 Ẩn</span>
                  </div>
                </div>
              </div>

              {/* By subject × grade */}
              <div className="card" style={{ padding: 0 }}>
                <h4 style={{ padding: '12px 16px', margin: 0, borderBottom: '1px solid var(--border)' }}>Phủ kho theo Môn × Lớp</h4>
                <table>
                  <thead>
                    <tr><th>Môn</th><th>Lớp</th><th>Số câu</th><th>Mức độ</th><th>Dạng</th><th>Đánh giá</th></tr>
                  </thead>
                  <tbody>
                    {health.by_subject_grade.map((r, i) => {
                      const ok = r.level_count >= 4 && r.type_count >= 2 && r.n >= 10;
                      const warn = r.n >= 5;
                      return (
                        <tr key={i}>
                          <td>{r.subject_name}</td>
                          <td>Lớp {r.grade}</td>
                          <td><strong>{r.n}</strong></td>
                          <td>{r.level_count}/4 mức</td>
                          <td>{r.type_count}/4 dạng</td>
                          <td>
                            <span className={`badge ${ok ? 'success' : warn ? 'warning' : 'danger'}`}>
                              {ok ? '✅ Đủ' : warn ? '⚠️ Thiếu' : '❌ Yếu'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* =============== GAPS =============== */}
      {tab === 'gaps' && (
        <div>
          {!gaps ? <div className="loading">Đang tải...</div> : (
            <>
              <div className="card" style={{ marginBottom: 16, padding: 16 }}>
                <div className="row space-between">
                  <div>
                    <strong style={{ fontSize: 20 }}>{gaps.total_gaps}</strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>lỗ hổng phát hiện</span>
                  </div>
                  <span className="badge info">Ngưỡng tối thiểu: {gaps.min_per_cell} câu/ô</span>
                </div>
              </div>

              {gaps.gaps.length === 0
                ? <div className="card"><div className="empty-state">🎉 Không có lỗ hổng nào! Kho câu hỏi phủ đều.</div></div>
                : (
                  <div className="card" style={{ padding: 0 }}>
                    <table>
                      <thead>
                        <tr><th>Môn</th><th>Lớp</th><th>Mức độ</th><th>Dạng</th><th>Hiện có</th><th>Cần thêm</th></tr>
                      </thead>
                      <tbody>
                        {gaps.gaps.map((g, i) => (
                          <tr key={i}>
                            <td>{g.subject_name}</td>
                            <td>Lớp {g.grade}</td>
                            <td><span className={`level-chip ${g.cognitive_level}`}>{g.cognitive_level}</span></td>
                            <td>{TYPE_LABELS[g.q_type] || g.q_type}</td>
                            <td style={{ color: g.current === 0 ? 'var(--danger)' : 'var(--warning)' }}>
                              <strong>{g.current}</strong>
                            </td>
                            <td>
                              <span className="badge danger">+{g.deficit}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </>
          )}
        </div>
      )}

      {/* =============== DUPLICATES =============== */}
      {tab === 'dups' && (
        <div>
          {!dups ? <div className="loading">Đang tải...</div> : (
            <>
              <div className="card" style={{ marginBottom: 16, padding: 16 }}>
                <div className="row space-between">
                  <div>
                    <strong style={{ fontSize: 20, color: dups.total_duplicates > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {dups.total_duplicates}
                    </strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>câu trùng lặp</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({dups.total_groups} nhóm)</span>
                  </div>
                </div>
              </div>

              {dups.groups.length === 0
                ? <div className="card"><div className="empty-state">🎉 Không phát hiện câu hỏi trùng lặp!</div></div>
                : (
                  <div className="card" style={{ padding: 0 }}>
                    <table>
                      <thead>
                        <tr><th>Nội dung (120 ký tự đầu)</th><th>Môn</th><th>Lớp</th><th>Số bản</th><th>Mã câu hỏi</th></tr>
                      </thead>
                      <tbody>
                        {dups.groups.map((g, i) => (
                          <tr key={i}>
                            <td style={{ maxWidth: 400, fontSize: 12 }}>{g.stem_preview}...</td>
                            <td>{g.subject_name}</td>
                            <td>{g.grade}</td>
                            <td><span className="badge danger">{g.count}×</span></td>
                            <td style={{ fontSize: 11 }}>{g.codes.join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </>
          )}
        </div>
      )}

      {/* =============== STATS =============== */}
      {tab === 'stats' && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Môn</th><th>Lớp</th><th>Mức độ</th><th>Dạng</th><th>Số lượng</th></tr>
            </thead>
            <tbody>
              {stats.map((s, i) => (
                <tr key={i}>
                  <td>{s.name}</td>
                  <td>{s.grade}</td>
                  <td><span className={`level-chip ${s.cognitive_level}`}>{s.cognitive_level}</span></td>
                  <td>{TYPE_LABELS[s.q_type] || s.q_type}</td>
                  <td><strong>{s.n}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* =============== TOP USED =============== */}
      {tab === 'top' && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Mã</th><th>Môn</th><th>Nội dung</th><th>Số lần dùng</th></tr>
            </thead>
            <tbody>
              {topUsed.map(q => (
                <tr key={q.id}>
                  <td><code>{q.question_code}</code></td>
                  <td>{q.subject_name}</td>
                  <td style={{ maxWidth: 500 }}>{q.stem_text?.slice(0, 100)}</td>
                  <td><strong>{q.usage_count}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* =============== AUDIT =============== */}
      {tab === 'audit' && (
        <div className="card" style={{ padding: 0 }}>
          {audit.length === 0 ? <div className="empty-state">Chỉ admin/BGH xem được audit log</div> :
          <table>
            <thead>
              <tr><th>Thời gian</th><th>User</th><th>Hành động</th><th>Đối tượng</th><th>IP</th></tr>
            </thead>
            <tbody>
              {audit.map(a => (
                <tr key={a.id}>
                  <td style={{ fontSize: 12 }}>{new Date(a.created_at).toLocaleString('vi-VN')}</td>
                  <td>{a.full_name || a.username}</td>
                  <td><span className="badge">{a.action}</span></td>
                  <td style={{ fontSize: 12 }}>{a.entity_type} #{a.entity_id}</td>
                  <td style={{ fontSize: 12 }}>{a.ip_address}</td>
                </tr>
              ))}
            </tbody>
          </table>}
        </div>
      )}
    </div>
  );
}
