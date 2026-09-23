import {useEffect, useRef} from 'react';

// Phím tắt của bàn làm việc (V6.6.6). Khóa dạng 'j', '1', ' ', 'mod+k', 'mod+z', 'escape'.
// Không chạy khi con trỏ đang ở ô nhập liệu — trừ Ctrl+K (mở bảng lệnh) và Esc (đóng).
const ALWAYS = new Set(['mod+k', 'escape']);

export function keyName(e) {
  const key = e.key === ' ' ? ' ' : e.key.toLowerCase();
  return (e.ctrlKey || e.metaKey ? 'mod+' : '') + key;
}

export function isTyping(target) {
  return !!target?.closest?.('input,textarea,select,[contenteditable="true"]');
}

export function useHotkeys(map, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = e => {
      if (e.altKey) return;
      const key = keyName(e);
      const handler = ref.current[key];
      if (!handler) return;
      if (isTyping(e.target) && !ALWAYS.has(key)) return;
      if (handler(e) === false) return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
