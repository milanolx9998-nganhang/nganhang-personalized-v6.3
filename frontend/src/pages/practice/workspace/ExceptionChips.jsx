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

// Các nhóm KHÔNG phải phân hoạch: một câu có thể vừa thiếu Bài vừa lệch mức, nên tổng các nhóm có thể
// lớn hơn "Tất cả". Nói rõ điều đó ngay trên thanh chip.
const OVERLAP_HINT = 'Một câu có thể thuộc nhiều nhóm kiểm tra, nên tổng các nhóm có thể lớn hơn “Tất cả”.';

export default function ExceptionChips({value, onPick, counts, children}) {
  return (
    <div className="exception-filters" role="group" aria-label="Lọc theo kiểm tra máy" aria-describedby="exception-overlap-hint">
      {EXCEPTIONS.map(([key, label, countKey]) => (
        <button key={key || 'all'} type="button" className="chip" aria-pressed={(value || '') === key} onClick={() => onPick(key)}
                title={key ? OVERLAP_HINT : undefined}>
          {label}{counts && <span className="chip-count">{counts[countKey] ?? 0}</span>}
        </button>
      ))}
      <span id="exception-overlap-hint" className="overlap-hint" title={OVERLAP_HINT}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>
        <span>Một câu có thể thuộc nhiều nhóm</span>
      </span>
      {children}
    </div>
  );
}
