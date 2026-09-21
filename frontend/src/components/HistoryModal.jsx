import { useState, useEffect } from 'react';
import { api } from '../api/client.js';

export default function HistoryModal({ questionId, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/questions/${questionId}/history`)
      .then(res => {
        setHistory(res);
        setLoading(false);
      })
      .catch(err => {
        alert('Lỗi tải lịch sử: ' + err.message);
        setLoading(false);
      });
  }, [questionId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div className="row space-between" style={{ marginBottom: 16 }}>
          <h3>🕒 Lịch sử Sửa đổi Câu hỏi</h3>
          <button className="btn icon" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <p>Đang tải...</p>
        ) : history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#888' }}>
            Chưa có lịch sử chỉnh sửa nào.
          </div>
        ) : (
          <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 10 }}>
            {history.map((rev, i) => (
              <div key={rev.id} style={{ 
                borderLeft: '3px solid var(--primary)', 
                padding: '10px 15px', 
                marginBottom: 16,
                background: '#f8fafc',
                borderRadius: '0 8px 8px 0'
              }}>
                <div style={{ marginBottom: 6 }}>
                  <strong>{rev.user_name || 'Hệ thống'}</strong>
                  <span style={{ color: '#64748b', fontSize: 13, marginLeft: 8 }}>
                    {new Date(rev.created_at).toLocaleString('vi-VN')}
                  </span>
                </div>
                
                {rev.changes && typeof rev.changes === 'object' && Object.keys(rev.changes).length > 0 ? (
                   <table className="table" style={{ fontSize: 13, background: '#fff' }}>
                     <thead>
                       <tr>
                         <th style={{ width: 120 }}>Trường</th>
                         <th style={{ width: '40%' }}>Cũ</th>
                         <th>Mới</th>
                       </tr>
                     </thead>
                     <tbody>
                       {Object.entries(rev.changes).map(([field, diff]) => (
                         <tr key={field}>
                           <td><code>{field}</code></td>
                           <td style={{ color: '#ef4444', textDecoration: 'line-through' }}>
                              {String(diff.old || '(Trống)')?.substring(0, 50)}
                           </td>
                           <td style={{ color: '#10b981' }}>
                              {String(diff.new || '(Trống)')?.substring(0, 50)}
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                ) : (
                   <p style={{ margin: 0, color: '#64748b', fontStyle: 'italic' }}>Cập nhật hệ thống</p>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
