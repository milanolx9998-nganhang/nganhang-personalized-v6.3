import {useCallback, useState} from 'react';

// Mọi lệnh sửa phân loại trên bàn làm việc đều hoàn tác được một bước (Ctrl+Z). Lệnh chuyển trạng thái
// (gửi duyệt, duyệt) không có nút hoàn tác: chúng đi qua quy trình duyệt, không đảo ngược âm thầm.
export function useUndo() {
  const [entry, setEntry] = useState(null);
  const push = useCallback((message, undo) => setEntry({message, undo: undo || null, id: Date.now()}), []);
  const clear = useCallback(() => setEntry(null), []);
  const run = useCallback(async () => {
    if (!entry?.undo) return false;
    const undo = entry.undo;
    setEntry({message: 'Đang hoàn tác…', undo: null, id: Date.now()});
    try {
      await undo();
      setEntry({message: 'Đã hoàn tác.', undo: null, id: Date.now()});
    } catch (e) {
      setEntry({message: 'Không hoàn tác được: ' + e.message, undo: null, error: true, id: Date.now()});
    }
    return true;
  }, [entry]);
  return {entry, push, clear, run};
}

export default function UndoToast({undo}) {
  if (!undo.entry) return null;
  return (
    <div className={'undo-toast' + (undo.entry.error ? ' error' : '')} role="status" aria-live="polite">
      <span>{undo.entry.message}</span>
      {undo.entry.undo && <button className="btn" onClick={undo.run}>Hoàn tác <kbd>Ctrl Z</kbd></button>}
      <button className="btn link" aria-label="Đóng thông báo" onClick={undo.clear}>×</button>
    </div>
  );
}
