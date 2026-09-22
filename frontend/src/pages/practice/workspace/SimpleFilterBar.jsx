import {useEffect, useMemo, useState} from 'react';
import {api} from '../../../api/client.js';
import {base, useLoad} from '../shared.jsx';
import {LEVELS, FORMS, LESSON_STATUS} from './labels.js';

// Mặc định chỉ năm ô: Tìm · Môn · Khối · Bài · Lọc thêm. Mọi thứ còn lại nằm sau "Lọc thêm",
// vì một giáo viên mở màn hình này để tìm câu, không phải để cấu hình truy vấn.
const ADVANCED_KEYS = ['branch_id', 'outcome_id', 'yccd_id', 'cognitive_level', 'q_type', 'tag_id',
  'created_by', 'lifecycle', 'review_status', 'metadata_status', 'import_job_id', 'lesson_status'];

const CHIP_LABELS = {
  search: 'Tìm', subject_id: 'Môn', grade: 'Khối', topic_id: 'Bài', branch_id: 'Phân môn',
  outcome_id: 'Outcome', yccd_id: 'YCCĐ', cognitive_level: 'Mức', q_type: 'Dạng', tag_id: 'Nhãn',
  created_by: 'Người soạn', lifecycle: 'Trạng thái', review_status: 'Duyệt',
  metadata_status: 'Phân loại', import_job_id: 'Đợt nhập', lesson_status: 'Gắn Bài',
};

export default function SimpleFilterBar({params, setParams, catalog, hideKeys = []}) {
  const [advanced, setAdvanced] = useState(() => ADVANCED_KEYS.some(k => params.get(k)));
  const [search, setSearch] = useState(params.get('search') || '');
  const branches = useLoad('/api/taxonomy/branches');
  const tags = useLoad('/api/tags');
  const [authors, setAuthors] = useState([]);

  const subject = Number(params.get('subject_id')) || '';
  const grade = Number(params.get('grade')) || '';

  const set = (key, value, clear = []) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    for (const k of clear) next.delete(k);
    setParams(next);
  };

  // Tìm kiếm gõ tới đâu lọc tới đó, nhưng chỉ đẩy vào URL sau khi ngừng gõ.
  useEffect(() => {
    const timer = setTimeout(() => { if ((params.get('search') || '') !== search) set('search', search.trim()); }, 350);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => { setSearch(params.get('search') || ''); }, [params.get('search')]);

  // Danh sách người biên soạn lấy theo phạm vi thật, không suy từ các dòng đang hiển thị.
  useEffect(() => {
    if (!advanced) return;
    let active = true;
    const scope = new URLSearchParams();
    for (const key of ['subject_id', 'grade']) if (params.get(key)) scope.set(key, params.get(key));
    api.get(base + '/questions/author-options?' + scope.toString())
      .then(rows => { if (active) setAuthors(rows); })
      .catch(() => { if (active) setAuthors([]); });
    return () => { active = false; };
  }, [advanced, params.get('subject_id'), params.get('grade')]);

  const topics = useMemo(() => (catalog?.topics || [])
    .filter(t => (!subject || t.subject_id === subject) && (!grade || t.grade === grade)), [catalog, subject, grade]);

  const chips = useMemo(() => {
    const out = [];
    for (const [key, label] of Object.entries(CHIP_LABELS)) {
      const value = params.get(key);
      if (!value || hideKeys.includes(key)) continue;
      let shown = value;
      if (key === 'subject_id') shown = catalog?.subjects.find(s => s.id === Number(value))?.name || value;
      if (key === 'topic_id') shown = catalog?.topics.find(t => t.id === Number(value))?.name || value;
      if (key === 'grade') shown = 'Khối ' + value;
      if (key === 'branch_id') shown = branches.data?.find(b => b.id === Number(value))?.name || value;
      if (key === 'tag_id') shown = (Array.isArray(tags.data) ? tags.data : tags.data?.tags || []).find(t => t.id === Number(value))?.name || value;
      if (key === 'created_by') shown = authors.find(a => a.id === Number(value))?.full_name || value;
      if (key === 'cognitive_level') shown = LEVELS[value] || value;
      if (key === 'q_type') shown = FORMS[value] || value;
      if (key === 'lesson_status') shown = value === 'UNASSIGNED' ? 'Chưa gắn Bài' : LESSON_STATUS[value] || value;
      out.push({key, label, shown});
    }
    return out;
  }, [params, catalog, branches.data, tags.data, authors, hideKeys]);

  return (
    <div className="filter-bar">
      <div className="filter-row">
        <label className="filter-search">
          <span className="sr-only">Tìm mã hoặc nội dung</span>
          <input type="search" placeholder="Tìm mã câu hoặc nội dung…" value={search}
                 onChange={e => setSearch(e.target.value)}/>
        </label>
        <label>
          <span className="sr-only">Môn</span>
          <select value={subject} onChange={e => set('subject_id', e.target.value, ['topic_id', 'branch_id', 'outcome_id', 'yccd_id', 'content_scope_v2'])}>
            <option value="">Mọi môn</option>
            {catalog?.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Khối</span>
          <select value={grade} onChange={e => set('grade', e.target.value, ['topic_id', 'outcome_id', 'yccd_id', 'content_scope_v2'])}>
            <option value="">Mọi khối</option>
            {[6, 7, 8, 9, 10, 11, 12].map(g => <option key={g} value={g}>Khối {g}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Bài</span>
          <select value={params.get('topic_id') || ''} onChange={e => set('topic_id', e.target.value)}>
            <option value="">Mọi bài</option>
            {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <button className="btn" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>
          {advanced ? 'Ẩn bớt' : 'Lọc thêm'}
        </button>
      </div>

      {chips.length > 0 && (
        <div className="filter-chips">
          {chips.map(chip => (
            <button key={chip.key} className="filter-chip" onClick={() => set(chip.key, '')}>
              {chip.label}: {chip.shown} <span aria-hidden="true">×</span>
              <span className="sr-only">Bỏ lọc</span>
            </button>
          ))}
          <button className="btn" onClick={() => setParams(new URLSearchParams())}>Xóa tất cả</button>
        </div>
      )}

      {advanced && (
        <div className="practice-grid filter-advanced">
          <label>Phân môn
            <select value={params.get('branch_id') || ''} onChange={e => set('branch_id', e.target.value)}>
              <option value="">Tất cả</option>
              {branches.data?.filter(b => !subject || b.subject_id === subject).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label>Mức độ
            <select value={params.get('cognitive_level') || ''} onChange={e => set('cognitive_level', e.target.value)}>
              <option value="">Tất cả</option>
              {Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Dạng câu
            <select value={params.get('q_type') || ''} onChange={e => set('q_type', e.target.value)}>
              <option value="">Tất cả</option>
              {Object.entries(FORMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Gắn Bài
            <select value={params.get('lesson_status') || ''} onChange={e => set('lesson_status', e.target.value)}>
              <option value="">Tất cả</option>
              <option value="UNASSIGNED">Chưa gắn Bài</option>
              <option value="AUTO_MAPPED">Tự gắn Bài</option>
              <option value="AMBIGUOUS">Nhiều Bài — cần chọn</option>
            </select>
          </label>
          <label>Nhãn
            <select value={params.get('tag_id') || ''} onChange={e => set('tag_id', e.target.value)}>
              <option value="">Tất cả</option>
              {(Array.isArray(tags.data) ? tags.data : tags.data?.tags || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label>Người biên soạn
            <select value={params.get('created_by') || ''} onChange={e => set('created_by', e.target.value)}>
              <option value="">Tất cả</option>
              {authors.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </label>
          {!hideKeys.includes('lifecycle') && <label>Trạng thái
            <select value={params.get('lifecycle') || ''} onChange={e => set('lifecycle', e.target.value)}>
              <option value="">Tất cả</option>
              <option value="draft">Nháp</option>
              <option value="pending_review">Chờ duyệt</option>
              <option value="approved">Đã duyệt</option>
              <option value="active">Đang dùng</option>
              <option value="archived">Ngừng dùng</option>
            </select>
          </label>}
          <label>Phân loại chương trình
            <select value={params.get('metadata_status') || ''} onChange={e => set('metadata_status', e.target.value)}>
              <option value="">Tất cả</option>
              <option value="VERIFIED">Đã phân loại</option>
              <option value="NEEDS_REVIEW">Cần xem</option>
              <option value="LEGACY_UNRESOLVED">Chưa ánh xạ chuẩn</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
