import { useState, useMemo } from 'react';

/**
 * TopicPicker: chọn tập các topic_id
 * - Nhóm theo chapter
 * - Tick 1 chapter = chọn hết bài trong chương
 * - Tick từng bài riêng
 * - Nếu có branches (KHTN): lọc theo branch
 */
export default function TopicPicker({ topics, branches, selectedIds, onChange }) {
  const [expandedChapters, setExpandedChapters] = useState(new Set());
  const [filterBranchId, setFilterBranchId] = useState(null);

  const filtered = useMemo(() => {
    if (!filterBranchId) return topics;
    return topics.filter(t => t.branch_id === filterBranchId);
  }, [topics, filterBranchId]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const t of filtered) {
      const key = t.chapter || t.branch_name || 'Khác';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const toggleTopic = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange([...next]);
  };

  const toggleChapter = (chapterTopicIds) => {
    const next = new Set(selectedIds);
    const allSelected = chapterTopicIds.every(id => next.has(id));
    if (allSelected) {
      chapterTopicIds.forEach(id => next.delete(id));
    } else {
      chapterTopicIds.forEach(id => next.add(id));
    }
    onChange([...next]);
  };

  const toggleExpand = (chapter) => {
    const next = new Set(expandedChapters);
    if (next.has(chapter)) next.delete(chapter); else next.add(chapter);
    setExpandedChapters(next);
  };

  const clearAll = () => onChange([]);
  const selectAll = () => onChange(filtered.map(t => t.id));

  return (
    <div>
      <div className="row" style={{ marginBottom: 8, justifyContent: 'space-between' }}>
        <div className="row">
          <strong>📖 Phạm vi kiểm tra</strong>
          <span className="badge">{selectedIds.length} / {filtered.length} bài</span>
          {branches && branches.length > 0 && (
            <select value={filterBranchId || ''} onChange={e => setFilterBranchId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Tất cả phân môn</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </div>
        <div className="row">
          <button type="button" className="btn ghost sm" onClick={selectAll}>Chọn tất cả</button>
          <button type="button" className="btn ghost sm" onClick={clearAll}>Bỏ chọn</button>
        </div>
      </div>

      <div className="topic-picker">
        {grouped.length === 0 ? (
          <div className="empty-state" style={{ padding: 20 }}>
            Chưa có bài nào. Vào <strong>Môn học · Chương · Bài</strong> để tạo.
          </div>
        ) : grouped.map(([chapter, items]) => {
          const ids = items.map(i => i.id);
          const allSelected = ids.every(id => selectedIds.includes(id));
          const someSelected = !allSelected && ids.some(id => selectedIds.includes(id));
          const expanded = expandedChapters.has(chapter);
          return (
            <div key={chapter} className="topic-chapter">
              <div className="topic-chapter-head" onClick={() => toggleExpand(chapter)}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={() => toggleChapter(ids)}
                  onClick={e => e.stopPropagation()}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ flex: 1 }}>
                  {expanded ? '▼' : '▶'} {chapter}
                </span>
                <span className="badge info">
                  {ids.filter(id => selectedIds.includes(id)).length} / {ids.length}
                </span>
              </div>
              {expanded && (
                <div className="topic-list">
                  {items.map(t => {
                    const sel = selectedIds.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`topic-item ${sel ? 'selected' : ''}`}
                        style={t.branch_color ? { borderLeft: `3px solid ${t.branch_color}` } : {}}
                        title={t.learning_goal || ''}
                      >
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => toggleTopic(t.id)}
                        />
                        {t.name}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
