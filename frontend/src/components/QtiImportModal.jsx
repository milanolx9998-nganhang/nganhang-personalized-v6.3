import { useState, useRef, useEffect } from 'react';
import { api, uploadFile } from '../api/client.js';

export default function QtiImportModal({ subjects, onClose, onSuccess }) {
  const [data, setData] = useState({
    subject_id: '',
    grade: '',
    branch_id: '',
    topic_id: ''
  });
  const [branches, setBranches] = useState([]);
  const [topics, setTopics] = useState([]);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!data.subject_id) {
       setBranches([]);
       return;
    }
    api.get(`/api/taxonomy/branches?subject_id=${data.subject_id}`).then(setBranches);
  }, [data.subject_id]);

  useEffect(() => {
    if (!data.subject_id || !data.grade) {
       setTopics([]);
       return;
    }
    api.get(`/api/taxonomy/topics?subject_id=${data.subject_id}&grade=${data.grade}`).then(setTopics);
  }, [data.subject_id, data.grade]);

  const handleImport = async () => {
    if (!data.subject_id || !data.grade) {
       return alert("Vui lòng chọn Môn và Lớp!");
    }
    if (!file) {
       return alert("Vui lòng chọn file .zip QTI!");
    }
    
    setLoading(true);
    try {
       const fd = new FormData();
       fd.append('file', file);
       fd.append('subject_id', data.subject_id);
       fd.append('grade', data.grade);
       if (data.branch_id) fd.append('branch_id', data.branch_id);
       if (data.topic_id) fd.append('topic_id', data.topic_id);

       const r = await uploadFile('/api/uploads/questions-qti', fd);
       alert(`Nhập thành công!\n+ Chèn mới: ${r.inserted}\n+ Bỏ qua (trùng lặp): ${r.duplicates}\nLỗi: ${r.errors.length}`);
       onSuccess();
    } catch (e) {
       alert('Lỗi nhập QTI: ' + e.message);
    } finally {
       setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>📦 Import Gói QTI (Canvas LMS)</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          QTI không lưu cấu trúc Cây môn học. Vui lòng chọn điểm rơi cho các câu hỏi lấy từ Gói ZIP này.
        </p>

        <div className="row" style={{ marginBottom: 12, marginTop: 12 }}>
          <div className="col" style={{ flex: 1 }}>
            <label className="label">1. Rơi vào Môn học *</label>
            <select value={data.subject_id} onChange={e => setData({...data, subject_id: e.target.value, branch_id: '', topic_id: ''})}>
               <option value="">-- Chọn môn --</option>
               {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col" style={{ width: 100 }}>
            <label className="label">2. Khối Lớp *</label>
            <select value={data.grade} onChange={e => setData({...data, grade: e.target.value, topic_id: ''})}>
               <option value="">- Chọn -</option>
               {[6,7,8,9,10,11,12].map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>

        <div className="row" style={{ marginBottom: 16 }}>
          {branches.length > 0 && (
            <div className="col" style={{ flex: 1 }}>
              <label className="label">Phân môn</label>
              <select value={data.branch_id} onChange={e => setData({...data, branch_id: e.target.value})}>
                 <option value="">-- Không --</option>
                 {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div className="col" style={{ flex: 1 }}>
            <label className="label">3. Rơi vào Chủ đề</label>
            <select value={data.topic_id} onChange={e => setData({...data, topic_id: e.target.value})}>
               <option value="">-- Không đẩy vào chủ đề con nào --</option>
               {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 20, padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px dashed #cbd5e1', textAlign: 'center' }}>
           <input type="file" accept=".zip" onChange={e => setFile(e.target.files[0])} id="qti_file" hidden />
           <label htmlFor="qti_file" className="btn secondary" style={{ cursor: 'pointer', margin: 0 }}>
             {file ? '📁 Đã chọn: ' + file.name : '📤 Click để chọn file ZIP QTI'}
           </label>
        </div>

        <div className="row space-between">
          <button className="btn ghost" disabled={loading} onClick={onClose}>Hủy</button>
          <button className="btn primary" disabled={loading} onClick={handleImport}>
             {loading ? '⏳ Đang xử lý giải nén...' : '📥 Import Gói'}
          </button>
        </div>
      </div>
    </div>
  );
}
