import {useEffect, useState} from 'react';
import {api} from '../../../api/client.js';
import {base, ErrorBox} from '../shared.jsx';

// Gán Bài theo từng nhóm YCCĐ. Các câu khác YCCĐ không bao giờ bị gán chung một Bài một cách mù quáng:
// mỗi nhóm có danh sách Bài ứng viên riêng, lấy từ liên kết Bài–YCCĐ thật.
export default function LessonAssignDialog({ids, onClose, onDone}) {
  const [groups, setGroups] = useState(null);
  const [choice, setChoice] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.post(base + '/questions/lesson-options', {ids})
      .then(result => {
        if (!active) return;
        setGroups(result);
        // Nhóm chỉ có đúng một Bài ứng viên thì chọn sẵn; người dùng vẫn thấy và đổi được.
        setChoice(Object.fromEntries(result.groups
          .filter(g => g.candidates.length === 1)
          .map(g => [String(g.yccd_id), String(g.candidates[0].id)])));
      })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [ids.join(',')]);

  async function submit() {
    setBusy(true); setError('');
    try {
      const assignments = (groups.groups || [])
        .filter(g => choice[String(g.yccd_id)])
        .map(g => ({question_ids: g.question_ids, topic_id: Number(choice[String(g.yccd_id)])}));
      if (!assignments.length) { setError('Chọn Bài cho ít nhất một nhóm'); return; }
      const result = await api.post(base + '/questions/assign-lesson', {assignments, reason: 'Gán Bài hàng loạt từ kho câu hỏi'});
      onDone?.(result);
      onClose();
    } catch (e) {
      setError(e.message + (e.details?.blocked?.length ? ' — ' + e.details.blocked.slice(0, 3).map(b => `${b.question_code || b.question_id}: ${b.message}`).join('; ') : ''));
    } finally { setBusy(false); }
  }

  const pending = groups?.groups?.filter(g => g.status !== 'NO_YCCD') || [];
  return (
    <article className="practice-card lesson-dialog">
      <header className="section-heading">
        <h3>Gán Bài cho {ids.length} câu</h3>
        <button className="btn" onClick={onClose}>Đóng</button>
      </header>
      <ErrorBox error={error}/>
      {!groups && !error && <p role="status">Đang tra liên kết Bài–YCCĐ…</p>}
      {groups?.out_of_scope?.length > 0 &&
        <p className="warn-box">{groups.out_of_scope.length} câu nằm ngoài phạm vi được phân quyền và sẽ bị bỏ qua.</p>}
      {groups && !pending.length && <p>Không có câu nào gắn được Bài: các câu đang chọn chưa có YCCĐ.</p>}
      {pending.map(group => (
        <div key={group.yccd_id} className="lesson-group">
          <p><strong>{group.question_ids.length} câu</strong> thuộc YCCĐ {group.yccd_label || 'chưa có mã'}</p>
          {group.yccd_text && <p className="lesson-yccd-text">{group.yccd_text}</p>}
          {group.status === 'UNMAPPED' && <p className="warn-box">YCCĐ này chưa liên kết Bài nào. Cần bổ sung liên kết ở mục Chuẩn đầu ra · Bài–YCCĐ trước.</p>}
          {group.candidates.length > 0 && (
            <label>Chọn Bài
              <select value={choice[String(group.yccd_id)] || ''}
                      onChange={e => setChoice({...choice, [String(group.yccd_id)]: e.target.value})}>
                <option value="">Bỏ qua nhóm này</option>
                {group.candidates.map(t => <option key={t.id} value={t.id}>{t.chapter ? t.chapter + ' · ' : ''}{t.name}</option>)}
              </select>
            </label>
          )}
        </div>
      ))}
      {pending.some(g => g.candidates.length > 0) && (
        <button className="btn primary" disabled={busy} onClick={submit}>Gán Bài</button>
      )}
    </article>
  );
}
