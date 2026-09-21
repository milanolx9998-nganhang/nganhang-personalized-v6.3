import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/api/reports/dashboard').then(setStats).catch(e => setErr(e.message));
  }, []);

  if (err) return <div className="error-box">{err}</div>;
  if (!stats) return <div className="loading">Đang tải...</div>;

  return (
    <div>
      <div className="page-header">
        <h2>📊 Tổng quan</h2>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Tổng câu hỏi</div>
          <div className="value">{stats.questions_total}</div>
        </div>
        <div className="stat-card">
          <div className="label">Chờ duyệt</div>
          <div className="value" style={{ color: 'var(--warning)' }}>{stats.pending_review}</div>
        </div>
        <div className="stat-card">
          <div className="label">Ma trận đề</div>
          <div className="value">{stats.matrices_total}</div>
        </div>
        <div className="stat-card">
          <div className="label">Đề đã sinh</div>
          <div className="value">{stats.exams_total}</div>
        </div>
        <div className="stat-card">
          <div className="label">Tài khoản</div>
          <div className="value">{stats.active_users}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 10px' }}>Phân loại câu hỏi theo trạng thái</h3>
        <div className="row">
          {Object.entries(stats.questions_by_status || {}).map(([s, n]) => (
            <div key={s} className="badge info" style={{ fontSize: 13, padding: '6px 12px' }}>
              {s}: <strong>{n}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 10px' }}>Bắt đầu nhanh</h3>
        <div className="row">
          <Link to="/questions" className="btn primary">📝 Thêm câu hỏi</Link>
          <Link to="/matrix" className="btn secondary">📐 Tạo ma trận đề</Link>
          <Link to="/exams" className="btn secondary">📄 Sinh đề thi</Link>
        </div>
      </div>
    </div>
  );
}
