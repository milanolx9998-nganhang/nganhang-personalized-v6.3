import {useEffect, useMemo, useRef, useState} from 'react';

// Bảng lệnh Ctrl+K (V6.6.6): gõ vài chữ, không dấu cũng được — "gan bai 9", "loc chua gan",
// "muc vd" — rồi Enter. Mỗi lệnh là một hàm của trang gọi; bảng lệnh không tự làm gì ngoài việc tìm.
export const fold = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export default function CommandPalette({open, onClose, commands}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery(''); setIndex(0);
    const t = setTimeout(() => input.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const results = useMemo(() => {
    if (!open) return [];
    const list = (typeof commands === 'function' ? commands(query) : commands).filter(c => c && !c.disabled);
    const terms = fold(query).split(/\s+/).filter(Boolean);
    const matched = terms.length
      ? list.filter(c => { const hay = fold([c.group, c.label, c.keywords].join(' ')); return terms.every(t => hay.includes(t)); })
      : list.filter(c => !c.searchOnly);
    return matched.slice(0, 50);
  }, [open, commands, query]);

  useEffect(() => { setIndex(0); }, [query]);
  if (!open) return null;

  const run = async command => {
    onClose();
    await command.run();
  };
  const onKeyDown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[index]) run(results[index]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let lastGroup = null;
  return (
    <div className="palette-layer">
      <button className="palette-backdrop" aria-label="Đóng bảng lệnh" tabIndex={-1} onClick={onClose}/>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Bảng lệnh">
        <input ref={input} className="palette-input" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKeyDown}
               role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list"
               aria-activedescendant={results[index] ? 'palette-item-' + index : undefined}
               aria-label="Gõ lệnh hoặc từ khóa" placeholder="Gõ lệnh: “gắn bài 9”, “lọc chưa gắn bài”, “mức vd”, hoặc mã câu…"/>
        <ul id="palette-list" role="listbox" className="palette-list" aria-label="Lệnh phù hợp">
          {results.map((command, i) => {
            const header = command.group !== lastGroup ? command.group : null;
            lastGroup = command.group;
            return [
              header && <li key={'g' + i} role="presentation" className="palette-group">{header}</li>,
              <li key={command.id} id={'palette-item-' + i} role="option" aria-selected={i === index}
                  className={'palette-item' + (i === index ? ' active' : '')}
                  onMouseEnter={() => setIndex(i)} onMouseDown={e => { e.preventDefault(); run(command); }}>
                <span className="palette-label">{command.label}</span>
                {command.hint && <span className="palette-hint">{command.hint}</span>}
                {command.shortcut && <kbd>{command.shortcut}</kbd>}
              </li>,
            ];
          })}
          {!results.length && <li className="palette-empty" role="presentation">Không có lệnh phù hợp.</li>}
        </ul>
        <p className="palette-foot"><kbd>↑</kbd> <kbd>↓</kbd> chọn · <kbd>Enter</kbd> chạy · <kbd>Esc</kbd> đóng · lệnh sửa phân loại đều hoàn tác được</p>
      </div>
    </div>
  );
}
