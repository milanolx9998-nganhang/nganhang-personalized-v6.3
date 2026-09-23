import {useEffect, useState} from 'react';
import {api} from '../../../api/client.js';
import {base} from '../shared.jsx';

// "Việc của tôi" (V6.6.6): góc nhìn cố định do máy chủ đếm, cộng góc nhìn tự lưu trên máy này.
// Góc nhìn chỉ là một bộ tham số lọc — bấm vào là ra đúng danh sách, cùng quy tắc phạm vi truy cập.
const STORE = 'nganhang.workbench.views';
const IGNORED = new Set(['limit', 'offset', 'ids']);

function readCustom() {
  try { const list = JSON.parse(localStorage.getItem(STORE)); return Array.isArray(list) ? list : []; } catch { return []; }
}
function writeCustom(list) {
  try { localStorage.setItem(STORE, JSON.stringify(list)); } catch { /* bộ nhớ trình duyệt bị chặn: chỉ mất góc nhìn tự lưu */ }
}
export function canonicalQuery(params) {
  const entries = [...new URLSearchParams(params).entries()].filter(([k, v]) => v !== '' && !IGNORED.has(k)).sort(([a], [b]) => a.localeCompare(b));
  return new URLSearchParams(entries).toString();
}

export function useWorkViews(reloadKey) {
  const [views, setViews] = useState([]);
  useEffect(() => {
    let active = true;
    api.get(base + '/questions/view-counts').then(v => { if (active) setViews(v); }).catch(() => { if (active) setViews([]); });
    return () => { active = false; };
  }, [reloadKey]);
  return views;
}

export default function WorkViews({views, params, setParams}) {
  const [custom, setCustom] = useState(readCustom);
  const [naming, setNaming] = useState(null);
  const current = canonicalQuery(params);
  const open = query => setParams(new URLSearchParams(query));
  const save = () => {
    const name = String(naming || '').trim();
    if (!name) return;
    const next = [...custom.filter(v => v.name !== name), {name, query: current}];
    setCustom(next); writeCustom(next); setNaming(null);
  };
  const remove = name => { const next = custom.filter(v => v.name !== name); setCustom(next); writeCustom(next); };
  const item = (key, label, query, count, extra = null) => {
    const on = canonicalQuery(query) === current;
    return (
      <li key={key} className="work-view">
        <button className={'work-view-btn' + (on ? ' active' : '')} aria-current={on ? 'true' : undefined} onClick={() => open(query)}>
          <span>{label}</span>{count != null && <strong>{count}</strong>}
        </button>
        {extra}
      </li>
    );
  };
  return (
    <nav className="work-views" aria-label="Góc nhìn">
      <p className="work-views-title">Việc của tôi</p>
      <ul>
        {item('all', 'Tất cả câu', '', null)}
        {views.map(v => item(v.key, v.label, v.query, v.count))}
      </ul>
      {custom.length > 0 && <>
        <p className="work-views-title">Góc nhìn đã lưu</p>
        <ul>{custom.map(v => item('c:' + v.name, v.name, v.query, null,
          <button className="btn link" aria-label={'Xóa góc nhìn ' + v.name} onClick={() => remove(v.name)}>×</button>))}</ul>
      </>}
      {naming === null
        ? <button className="btn work-views-save" disabled={!current} onClick={() => setNaming('')}>+ Lưu góc nhìn này</button>
        : <div className="work-views-name">
            <input aria-label="Tên góc nhìn" value={naming} autoFocus placeholder="Vd. KHTN7 · Bài 9 · chưa duyệt"
                   onChange={e => setNaming(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setNaming(null); }}/>
            <button className="btn primary" onClick={save}>Lưu</button>
          </div>}
      <p className="work-views-keys"><kbd>Ctrl K</kbd> bảng lệnh · <kbd>J</kbd>/<kbd>K</kbd> chuyển · <kbd>X</kbd> chọn · <kbd>1</kbd>–<kbd>4</kbd> mức · <kbd>B</kbd> Bài · <kbd>G</kbd> phạm vi · <kbd>Ctrl Z</kbd> hoàn tác</p>
    </nav>
  );
}
