import {useEffect, useState} from 'react';
import {api} from '../../../api/client.js';
import {base} from '../shared.jsx';

// Chip lọc theo kiểm tra máy, kèm số câu của từng nhóm trong bộ lọc hiện tại (V6.6.6).
export const EXCEPTIONS = [
  ['', 'Tất cả', 'total'], ['clean', 'Sạch', 'clean'], ['level', 'Cần xem mức', 'level'], ['lesson', 'Chưa gắn Bài', 'lesson'],
  ['duplicate', 'Nghi trùng', 'duplicate'], ['metadata', 'Lỗi metadata', 'metadata'], ['media', 'Media', 'media'],
];

export function useExceptionCounts(search, reloadKey) {
  const [counts, setCounts] = useState(null);
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(search);
    for (const key of ['exception', 'ids', 'limit', 'offset']) query.delete(key);
    api.get(base + '/questions/exception-counts?' + query.toString())
      .then(c => { if (active) setCounts(c); })
      .catch(() => { if (active) setCounts(null); });
    return () => { active = false; };
  }, [search, reloadKey]);
  return counts;
}

export default function ExceptionChips({value, onPick, counts, children}) {
  return (
    <div className="exception-filters" role="group" aria-label="Lọc theo kiểm tra máy">
      {EXCEPTIONS.map(([key, label, countKey]) => (
        <button key={key || 'all'} type="button" className="chip" aria-pressed={(value || '') === key} onClick={() => onPick(key)}>
          {label}{counts && <span className="chip-count">{counts[countKey] ?? 0}</span>}
        </button>
      ))}
      {children}
    </div>
  );
}
