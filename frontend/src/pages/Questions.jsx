import { useEffect, useState, Fragment } from 'react';
import { api, downloadFile, uploadFile } from '../api/client.js';
import { useAuth, can, isReadOnly, canManage, canReview } from '../hooks/useAuth.js';
import {Link} from 'react-router-dom';

import HistoryModal from '../components/HistoryModal.jsx';
import MathText from '../components/MathText.jsx';

const LEVELS = [
  { k: 'M1', label: 'M1 (NB)' }, { k: 'M2', label: 'M2 (TH)' },
  { k: 'M3', label: 'M3 (VD)' }, { k: 'M4', label: 'M4 (VDC)' },
];
const TYPES = [
  { k: 'mcq4', label: 'Trắc nghiệm 4 lựa chọn' },
  { k: 'true_false', label: 'Đúng - Sai' },
  { k: 'short', label: 'Trả lời ngắn' },
  { k: 'essay', label: 'Tự luận' },
];
const STATUSES = ['Mới tạo', 'Đã rà soát', 'Đã duyệt', 'Đã sử dụng', 'Tạm ẩn'];

export default function Questions() {
  const { user } = useAuth();
  const readOnly = isReadOnly(user);
  const manage = canManage(user);
  const review = canReview(user);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [branches, setBranches] = useState([]);
  const [topics, setTopics] = useState([]);
  const [filter, setFilter] = useState({ subject_id: '', branch_id: '', topic_id: '', grade: '', cognitive_level: '', q_type: '', status: '', search: '', tag_id: '' });
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(new Set());  // IDs đã chọn
  const [allTags, setAllTags] = useState([]);
  const [questionTags, setQuestionTags] = useState({}); // { qid: [tag, ...] }
  const [tagDropdown, setTagDropdown] = useState(null); // question id showing dropdown

  const [historyQid, setHistoryQid] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filter)) if (v) params.set(k, v);
      params.set('limit', '100');
      const r = await api.get(`/api/questions?${params}`);
      setItems(r.items);
      setTotal(r.total);
    } finally { setLoading(false); }
  };

  useEffect(() => { 
    api.get('/api/taxonomy/subjects').then(data => {
      setSubjects(data);
      if (data.length === 1 && !filter.subject_id) {
        setFilter(f => ({ ...f, subject_id: data[0].id }));
      }
    });
    api.get('/api/tags').then(setAllTags).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [filter]);

  // FIX BUG 4: Batch load tags (1 request thay vì N request)
  useEffect(() => {
    if (!items.length) { setQuestionTags({}); return; }
    const ids = items.map(q => q.id).join(',');
    api.get(`/api/tags/questions/batch?ids=${ids}`)
      .then(setQuestionTags)
      .catch(() => setQuestionTags({}));
  }, [items]);

  const assignTag = async (questionId, tagId) => {
    try {
      await api.post('/api/tags/assign', { question_id: questionId, tag_id: tagId });
      const tags = await api.get(`/api/tags/question/${questionId}`);
      setQuestionTags(prev => ({ ...prev, [questionId]: tags }));
    } catch (e) { alert(e.message); }
    setTagDropdown(null);
  };

  const unassignTag = async (questionId, tagId) => {
    try {
      await api.post('/api/tags/unassign', { question_id: questionId, tag_id: tagId });
      setQuestionTags(prev => ({
        ...prev,
        [questionId]: (prev[questionId] || []).filter(t => t.id !== tagId),
      }));
    } catch (e) { alert(e.message); }
  };

  useEffect(() => {
    if (!filter.subject_id) { setBranches([]); setTopics([]); return; }
    api.get(`/api/taxonomy/branches?subject_id=${filter.subject_id}`).then(setBranches);
    let url = `/api/taxonomy/topics?subject_id=${filter.subject_id}`;
    if (filter.grade) url += `&grade=${filter.grade}`;
    api.get(url).then(setTopics);
  }, [filter.subject_id, filter.grade]);

  const handleReview = async (id, status) => {
    try {
      await api.post(`/api/questions/${id}/review`, { status });
      load();
    } catch (e) { alert(e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa câu hỏi này?')) return;
    try { await api.del(`/api/questions/${id}`); load(); }
    catch (e) { alert(e.message); }
  };

  // === BULK ACTIONS ===
  const toggleSelect = (id) => {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };
  const toggleSelectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(q => q.id)));
  };
  const bulkReview = async (status) => {
    if (!selected.size) return;
    const ids = [...selected];
    if (!confirm(`Đổi trạng thái ${ids.length} câu thành "${status}"?`)) return;
    try {
      const r = await api.post('/api/questions/bulk-review', { ids, status });
      alert(`✅ Đã cập nhật ${r.updated} câu`);
      setSelected(new Set());
      load();
    } catch (e) { alert(e.message); }
  };
  const bulkDelete = async () => {
    if (!selected.size) return;
    const ids = [...selected];
    if (!confirm(`⚠️ Xóa ${ids.length} câu hỏi? Không thể hoàn tác!`)) return;
    try {
      const r = await api.post('/api/questions/bulk-delete', { ids });
      alert(`🗑️ Đã xóa ${r.deleted} câu`);
      setSelected(new Set());
      load();
    } catch (e) { alert(e.message); }
  };

  const downloadTemplate = () =>
    downloadFile('/api/uploads/questions-excel/template', 'Template_Ngan_Hang_V4.xlsx');

  return (
    <div>
      <div className="page-header">
        <h2>📝 Câu hỏi <span className="badge">{total}</span></h2>
        <div className="row">
          {/* Teacher: ẩn nút thêm/import — chỉ xem */}
          {!readOnly && (
            <>
              <button className="btn secondary" onClick={downloadTemplate}>⬇️ Template</button>
              <Link className="btn secondary" to="/practice/import">Nhập Word · Excel · QTI</Link>
              <button className="btn primary" onClick={() => setEditing({})}>+ Thêm</button>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row">
          <input placeholder="Tìm nội dung câu hỏi..." value={filter.search}
                 onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
                 style={{ flex: 1, minWidth: 140 }} />
          {/* Teacher: nếu chỉ có 1 môn thì ẩn dropdown môn,
              backend đã tự filter rồi */}
          {subjects.length > 1 ? (
            <select value={filter.subject_id} onChange={e => setFilter(f => ({ ...f, subject_id: e.target.value, branch_id: '', topic_id: '' }))}>
              <option value="">Tất cả môn</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : subjects.length === 1 ? (
            <span className="badge info" style={{ padding: '8px 12px', fontSize: 13 }}>📖 {subjects[0].name}</span>
          ) : null}
          <select value={filter.grade} onChange={e => setFilter(f => ({ ...f, grade: e.target.value, topic_id: '' }))}>
            <option value="">Mọi lớp</option>
            {[6,7,8,9,10,11,12].map(g => <option key={g} value={g}>Lớp {g}</option>)}
          </select>
          
          {branches.length > 0 && (
            <select value={filter.branch_id} onChange={e => setFilter(f => ({ ...f, branch_id: e.target.value }))}>
              <option value="">Mọi phân môn</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}

          {topics.length > 0 && (
            <select value={filter.topic_id} onChange={e => setFilter(f => ({ ...f, topic_id: e.target.value }))}>
              <option value="">Mọi chủ đề / bài</option>
              {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}

          <select value={filter.cognitive_level} onChange={e => setFilter(f => ({ ...f, cognitive_level: e.target.value }))}>
            <option value="">Mọi mức độ</option>
            {LEVELS.map(l => <option key={l.k} value={l.k}>{l.label}</option>)}
          </select>
          <select value={filter.q_type} onChange={e => setFilter(f => ({ ...f, q_type: e.target.value }))}>
            <option value="">Mọi dạng</option>
            {TYPES.map(t => <option key={t.k} value={t.k}>{t.label}</option>)}
          </select>
          <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
            <option value="">Mọi trạng thái</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filter.tag_id} onChange={e => setFilter(f => ({ ...f, tag_id: e.target.value }))}>
            <option value="">Mọi nhãn</option>
            {allTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {/* Bulk action bar — chỉ hiện cho quản lý */}
      {selected.size > 0 && manage && (
        <div className="bulk-bar">
          <span>📌 Đã chọn <b>{selected.size}</b> câu</span>
          <div className="row">
            {review && (
              <>
                <button className="btn sm primary" onClick={() => bulkReview('Đã duyệt')}>✓ Duyệt tất cả</button>
                <button className="btn sm secondary" onClick={() => bulkReview('Đã rà soát')}>📋 Rà soát</button>
                <button className="btn sm secondary" onClick={() => bulkReview('Tạm ẩn')}>🔒 Tạm ẩn</button>
              </>
            )}
            {can(user, ['content.write']) && (
              <button className="btn sm danger" onClick={bulkDelete}>🗑️ Xóa</button>
            )}
            <button className="btn sm ghost" onClick={() => setSelected(new Set())}>✕ Bỏ chọn</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {loading ? <div className="loading">Đang tải...</div> :
         items.length === 0 ? <div className="empty-state">Chưa có câu hỏi phù hợp bộ lọc.</div> :
        <table>
          <thead>
            <tr>
              {/* Checkbox chỉ hiện cho quản lý */}
              {manage && (
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={items.length > 0 && selected.size === items.length}
                         onChange={toggleSelectAll} title="Chọn tất cả" />
                </th>
              )}
              <th>Mã</th>
              <th>Nội dung</th>
              <th>Môn · Lớp</th>
              <th>Mức · Dạng</th>
              <th>Điểm</th>
              <th>Trạng thái</th>
              {manage && <th>Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {items.map(q => (
              <Fragment key={q.id}>
              <tr className={selected.has(q.id) ? 'row-selected' : ''}>
                {manage && (
                  <td>
                    <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggleSelect(q.id)} />
                  </td>
                )}
                <td><code style={{ fontSize: 11 }}>{q.question_code}</code></td>
                <td style={{ maxWidth: 400 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    {q.image_url && <img src={q.image_url} alt="" style={{ maxWidth: 60, maxHeight: 40, borderRadius: 4, border: '1px solid var(--border)', flexShrink: 0 }} />}
                    <div style={{ 
                       display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', 
                       overflow: 'hidden', wordBreak: 'break-word' 
                    }}>
                       <MathText text={q.stem_text} />
                    </div>
                  </div>
                </td>
                <td>
                  {q.subject_name} 
                  {q.branch_name ? <span style={{ color: 'var(--text-muted)' }}> ({q.branch_name})</span> : ''} 
                  {' · '}L{q.grade}
                </td>
                <td>
                  <span className={`level-chip ${q.cognitive_level}`}>{q.cognitive_level}</span>{' '}
                  <span className="q-type-chip">{TYPES.find(t => t.k === q.q_type)?.label.slice(0,12)}</span>
                </td>
                <td>{Number(q.score).toFixed(2)}</td>
                <td><span className="badge">{q.status}</span></td>
                {manage && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn ghost sm" onClick={() => setEditing(q)}>Sửa</button>
                    <button className="btn ghost sm" style={{ color: '#0284c7' }} onClick={() => setHistoryQid(q.id)}>🕒 Lịch sử</button>
                    {review && q.status !== 'Đã duyệt' && (
                      <button className="btn ghost sm" onClick={() => handleReview(q.id, 'Đã duyệt')}>✓ Duyệt</button>
                    )}
                    {can(user, ['content.write']) && (
                      <button className="btn ghost sm" onClick={() => handleDelete(q.id)} style={{ color: 'var(--danger)' }}>Xóa</button>
                    )}
                  </td>
                )}
              </tr>
              {/* Tag row */}
              <tr style={{ borderTop: 'none' }}>
                <td colSpan={manage ? 8 : 7} style={{ paddingTop: 0, paddingBottom: 6, borderTop: 'none' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                    {(questionTags[q.id] || []).map(tag => (
                      <span key={tag.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: 11, padding: '1px 6px', borderRadius: 4,
                        background: tag.tier === 'core' ? '#3b82f615' : tag.tier === 'academic' ? '#10b98115' : tag.tier === 'ops' ? '#f59e0b15' : '#6b728015',
                        color: tag.tier === 'core' ? '#3b82f6' : tag.tier === 'academic' ? '#10b981' : tag.tier === 'ops' ? '#f59e0b' : '#6b7280',
                        border: `1px solid ${tag.tier === 'core' ? '#3b82f630' : tag.tier === 'academic' ? '#10b98130' : tag.tier === 'ops' ? '#f59e0b30' : '#6b728030'}`,
                      }}>
                        {tag.name}
                        {!readOnly && (
                          <button onClick={() => unassignTag(q.id, tag.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 10, padding: 0, lineHeight: 1 }}>✕</button>
                        )}
                      </span>
                    ))}
                    {!readOnly && (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <button className="btn ghost sm" style={{ fontSize: 10, padding: '1px 5px' }}
                          onClick={() => setTagDropdown(tagDropdown === q.id ? null : q.id)}>+Tag</button>
                        {tagDropdown === q.id && (
                          <div style={{
                            position: 'absolute', top: '100%', left: 0, zIndex: 100,
                            background: 'white', border: '1px solid var(--border)', borderRadius: 6,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: 4, minWidth: 160, maxHeight: 200, overflowY: 'auto',
                          }}>
                            {allTags.filter(t => !(questionTags[q.id] || []).some(qt => qt.id === t.id)).map(t => (
                              <div key={t.id}
                                onClick={() => assignTag(q.id, t.id)}
                                style={{ padding: '4px 8px', cursor: 'pointer', fontSize: 12, borderRadius: 3 }}
                                onMouseEnter={e => e.target.style.background = '#f0f0f0'}
                                onMouseLeave={e => e.target.style.background = 'transparent'}>
                                {t.name}
                              </div>
                            ))}
                            {allTags.filter(t => !(questionTags[q.id] || []).some(qt => qt.id === t.id)).length === 0 && (
                              <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text-muted)' }}>Đã gắn hết</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
              </Fragment>
            ))}
          </tbody>
        </table>}
      </div>

      {editing !== null && (
        <QuestionModal
          question={editing}
          subjects={subjects}
          onClose={() => setEditing(null)}
          onSave={() => { setEditing(null); load(); }}
        />
      )}

      

      

      {historyQid && (
        <HistoryModal
          questionId={historyQid}
          onClose={() => setHistoryQid(null)}
        />
      )}
    </div>
  );
}

function QuestionModal({ question, subjects, onClose, onSave }) {
  const isNew = !question.id;
  const [data, setData] = useState({
    subject_id: question.subject_id || '',
    grade: question.grade || 9,
    branch_id: question.branch_id || '',
    topic_id: question.topic_id || '',
    main_topic: question.main_topic || '',
    sub_topic: question.sub_topic || '',
    cognitive_level: question.cognitive_level || 'M1',
    q_type: question.q_type || 'mcq4',
    stem_text: question.stem_text || '',
    option_a: question.option_a || '',
    option_b: question.option_b || '',
    option_c: question.option_c || '',
    option_d: question.option_d || '',
    answer_key: question.answer_key || '',
    explanation: question.explanation || '',
    score: question.score || 0.25,
    image_url: question.image_url || '',
  });
  const [branches, setBranches] = useState([]);
  const [topics, setTopics] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data.subject_id) return;
    api.get(`/api/taxonomy/branches?subject_id=${data.subject_id}`).then(setBranches);
    api.get(`/api/taxonomy/topics?subject_id=${data.subject_id}&grade=${data.grade}`).then(setTopics);
  }, [data.subject_id, data.grade]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...data };
      payload.subject_id = Number(payload.subject_id);
      payload.grade = Number(payload.grade);
      if (payload.branch_id) payload.branch_id = Number(payload.branch_id); else delete payload.branch_id;
      if (payload.topic_id) payload.topic_id = Number(payload.topic_id); else delete payload.topic_id;
      payload.score = parseFloat(payload.score);
      if (isNew) await api.post('/api/questions', payload);
      else await api.put(`/api/questions/${question.id}`, payload);
      onSave();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const isMcq = data.q_type === 'mcq4';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <h3>{isNew ? '➕ Câu hỏi mới' : `✏️ Sửa câu hỏi ${question.question_code || ''}`}</h3>

        <div className="row" style={{ marginBottom: 10 }}>
          <div className="col" style={{ flex: 1 }}>
            <label className="label">Môn</label>
            <select value={data.subject_id} onChange={e => setData(d => ({ ...d, subject_id: e.target.value, branch_id: '', topic_id: '' }))}>
              <option value="">-- Chọn môn --</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col" style={{ width: 100 }}>
            <label className="label">Lớp</label>
            <select value={data.grade} onChange={e => setData(d => ({ ...d, grade: Number(e.target.value), topic_id: '' }))}>
              {[6,7,8,9,10,11,12].map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          {branches.length > 0 && (
            <div className="col" style={{ flex: 1 }}>
              <label className="label">Phân môn</label>
              <select value={data.branch_id} onChange={e => setData(d => ({ ...d, branch_id: e.target.value }))}>
                <option value="">-- Không --</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="row" style={{ marginBottom: 10 }}>
          <div className="col" style={{ flex: 1 }}>
            <label className="label">Chương / Bài</label>
            <select value={data.topic_id} onChange={e => setData(d => ({ ...d, topic_id: e.target.value }))}>
              <option value="">-- Không --</option>
              {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="col" style={{ width: 130 }}>
            <label className="label">Mức độ</label>
            <select value={data.cognitive_level} onChange={e => setData(d => ({ ...d, cognitive_level: e.target.value }))}>
              {LEVELS.map(l => <option key={l.k} value={l.k}>{l.label}</option>)}
            </select>
          </div>
          <div className="col" style={{ width: 170 }}>
            <label className="label">Dạng câu</label>
            <select value={data.q_type} onChange={e => setData(d => ({ ...d, q_type: e.target.value }))}>
              {TYPES.map(t => <option key={t.k} value={t.k}>{t.label}</option>)}
            </select>
          </div>
          <div className="col" style={{ width: 90 }}>
            <label className="label">Điểm</label>
            <input type="number" step="0.25" min="0.25" value={data.score}
                   onChange={e => setData(d => ({ ...d, score: e.target.value }))} />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label className="label">Nội dung câu hỏi (phần dẫn)</label>
          <textarea rows="3" style={{ width: '100%', marginBottom: 4 }} value={data.stem_text}
                    onChange={e => setData(d => ({ ...d, stem_text: e.target.value }))} />
          {data.stem_text?.trim() && (
            <div style={{ 
               background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 4, 
               padding: '8px 12px', fontSize: 13, color: '#0369a1' 
            }}>
               <div style={{ fontWeight: 'bold', fontSize: 11, marginBottom: 4, textTransform: 'uppercase' }}>👁 Live Preview</div>
               <MathText text={data.stem_text} />
            </div>
          )}
        </div>

        {isMcq && (
          <>
            <div className="row" style={{ marginBottom: 8 }}>
              <div style={{ flex: 1 }}><label className="label">A</label>
                <input style={{ width: '100%' }} value={data.option_a} onChange={e => setData(d => ({ ...d, option_a: e.target.value }))} />
              </div>
              <div style={{ flex: 1 }}><label className="label">B</label>
                <input style={{ width: '100%' }} value={data.option_b} onChange={e => setData(d => ({ ...d, option_b: e.target.value }))} />
              </div>
            </div>
            <div className="row" style={{ marginBottom: 10 }}>
              <div style={{ flex: 1 }}><label className="label">C</label>
                <input style={{ width: '100%' }} value={data.option_c} onChange={e => setData(d => ({ ...d, option_c: e.target.value }))} />
              </div>
              <div style={{ flex: 1 }}><label className="label">D</label>
                <input style={{ width: '100%' }} value={data.option_d} onChange={e => setData(d => ({ ...d, option_d: e.target.value }))} />
              </div>
            </div>
          </>
        )}

        <div style={{ marginBottom: 10 }}>
          <label className="label">Đáp án {data.q_type === 'true_false' ? '(VD: a-Đ; b-S; c-Đ; d-S)' : data.q_type === 'mcq4' ? '(A / B / C / D)' : ''}</label>
          <input style={{ width: '100%' }} value={data.answer_key} onChange={e => setData(d => ({ ...d, answer_key: e.target.value }))} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="label">Lời giải / hướng dẫn chấm</label>
          <textarea rows="2" style={{ width: '100%' }} value={data.explanation}
                    onChange={e => setData(d => ({ ...d, explanation: e.target.value }))} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="label">🖼️ Hình ảnh câu hỏi</label>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <input style={{ flex: 1 }} value={data.image_url}
                   placeholder="URL hình ảnh hoặc upload bên dưới"
                   onChange={e => setData(d => ({ ...d, image_url: e.target.value }))} />
            <label className="btn secondary" style={{ cursor: 'pointer', fontSize: 12, margin: 0 }}>
              📤 Upload
              <input type="file" accept="image/*" hidden onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                  const fd = new FormData();
                  fd.append('image', file);
                  const r = await uploadFile('/api/uploads/image', fd);
                  setData(d => ({ ...d, image_url: r.url }));
                } catch (err) { alert('Lỗi upload: ' + err.message); }
              }} />
            </label>
          </div>
          {data.image_url && (
            <div style={{ marginTop: 6 }}>
              <img src={data.image_url} alt="Preview"
                   style={{ maxWidth: 200, maxHeight: 120, borderRadius: 6, border: '1px solid var(--border)' }}
                   onError={e => { e.target.style.display = 'none'; }} />
            </div>
          )}
        </div>

        <div className="row space-between">
          <button className="btn secondary" onClick={onClose}>Hủy</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu...' : '💾 Lưu'}</button>
        </div>
      </div>
    </div>
  );
}
