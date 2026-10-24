import React, { useEffect, useMemo, useState } from 'react';
import { battleApi, battleApiVocab, VOCAB_KINDS, VOCAB_KIND_LABELS } from '../battleApi.js';

// V6.9.5 Đấu từ vựng: chọn môn + bộ từ rồi tìm bạn (hàng chờ riêng) hoặc mở phòng.
export function VocabBattleSheet({ flags, onClose, onQueued, onRoomCreated }) {
  const [sets, setSets] = useState(null);
  const [subjectId, setSubjectId] = useState(null);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    battleApiVocab
      .getSets()
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.sets) ? res.sets : [];
        setSets(list);
        const first = list.find((s) => s.playable) || list[0];
        if (first) setSubjectId(first.subject_id);
      })
      .catch((err) => !cancelled && setErrorMsg(err?.message || 'Không tải được bộ từ vựng.'));
    return () => {
      cancelled = true;
    };
  }, []);

  const subjects = useMemo(() => {
    const map = new Map();
    for (const s of sets || []) {
      const row = map.get(s.subject_id) || { id: s.subject_id, name: s.subject_name, language: s.language, count: 0 };
      if (s.playable) row.count += 1;
      map.set(s.subject_id, row);
    }
    return [...map.values()];
  }, [sets]);
  const subjectSets = (sets || []).filter((s) => s.subject_id === subjectId);
  const toggle = (id) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 20 ? prev : [...prev, id]));
  const chosen = picked.filter((id) => subjectSets.some((s) => s.id === id && s.playable));
  const canRoom = flags.battle_enabled && flags.duel_code;

  async function findFriend() {
    setBusy('match');
    setErrorMsg('');
    try {
      const res = await battleApiVocab.joinMatch({ subject_id: subjectId, vocab_set_ids: chosen });
      onQueued?.(res?.queue || null);
    } catch (err) {
      setErrorMsg(err?.message || 'Không bắt đầu tìm bạn được.');
    } finally {
      setBusy('');
    }
  }

  async function openRoom(kind) {
    setBusy('room');
    setErrorMsg('');
    try {
      const room = await battleApi.createRoom({
        kind,
        visibility: flags.lobby ? 'public' : 'code',
        content_mode: 'fixed',
        question_count: 10,
        seconds: 30,
        scope: { content: 'vocab', subject_id: subjectId, vocab_set_ids: chosen },
      });
      onRoomCreated?.(room?.id);
    } catch (err) {
      setErrorMsg(err?.message || 'Không mở được phòng.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="arena-overlay" role="dialog" aria-modal="true" aria-labelledby="vocab-sheet-title">
      <div className="arena-sheet">
        <div className="arena-sheet__header">
          <h2 id="vocab-sheet-title" className="arena-title-md">📖 Đấu từ vựng</h2>
          <button type="button" className="arena-btn arena-btn--secondary arena-btn--sm" onClick={onClose}>
            Đóng
          </button>
        </div>
        <div className="arena-sheet__body">
          {errorMsg && (
            <div className="arena-alert arena-alert--error" role="alert">
              <span>{errorMsg}</span>
            </div>
          )}
          {sets === null && !errorMsg && <p className="arena-muted">Đang tải bộ từ…</p>}
          {sets && !sets.length && <p className="arena-muted">Chưa có bộ từ vựng nào cho khối của em.</p>}

          {subjects.length > 1 && (
            <div style={{ marginBottom: '16px' }}>
              <span className="arena-field-label">1. Môn</span>
              <div className="arena-row" style={{ gap: '8px', flexWrap: 'wrap' }}>
                {subjects.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={subjectId === s.id}
                    className={`arena-btn arena-btn--sm ${subjectId === s.id ? 'arena-btn--primary' : 'arena-btn--secondary'}`}
                    onClick={() => setSubjectId(s.id)}
                  >
                    {s.language === 'zh' ? '🀄 ' : '🔤 '}
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {subjectSets.length > 0 && (
            <div>
              <span className="arena-field-label">
                {subjects.length > 1 ? '2. ' : ''}Chọn bộ từ (chọn nhiều bộ để dễ gặp bạn hơn)
              </span>
              <div className="vocab-set-grid">
                {subjectSets.map((s) => {
                  const on = picked.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={on}
                      disabled={!s.playable}
                      className={`vocab-set-chip${on ? ' is-on' : ''}`}
                      onClick={() => toggle(s.id)}
                      title={s.playable ? '' : 'Bộ này chưa đủ từ để đấu'}
                    >
                      <span className="vocab-set-chip__name">{on ? '✓ ' : ''}{s.name}</span>
                      <span className="vocab-set-chip__meta">
                        {s.playable ? `${s.entry_count} từ` : 'Chưa đủ từ'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <p className="arena-muted" style={{ marginTop: '12px' }}>
            10 câu · trả lời đúng và nhanh được thêm điểm · không tính vào xếp hạng.
          </p>
        </div>
        <div className="arena-sheet__footer vocab-sheet-footer">
          {canRoom && (
            <button
              type="button"
              className="arena-btn arena-btn--secondary"
              disabled={!chosen.length || Boolean(busy)}
              onClick={() => openRoom('duel')}
            >
              {busy === 'room' ? 'Đang mở…' : '+ Mở phòng rủ bạn'}
            </button>
          )}
          <button
            type="button"
            className="arena-btn arena-btn--amber"
            disabled={!chosen.length || Boolean(busy)}
            onClick={findFriend}
          >
            {busy === 'match' ? 'Đang vào hàng chờ…' : '⚡ Tìm bạn đấu'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Khung chờ riêng của Đấu từ vựng (không dùng MatchWaiting của Đấu bài học).
export function VocabWaiting({ queue, flags, onMatched, onCancelled, onError }) {
  const [now, setNow] = useState(Date.now());
  const [busy, setBusyState] = useState('');
  const busyRef = React.useRef('');
  const setBusy = (v) => {
    busyRef.current = v;
    setBusyState(v);
  };

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    // Sảnh có thể chưa mở luồng SSE (chỉ bật Đấu từ vựng): tự hỏi /me để biết đã ghép xong.
    const poll = setInterval(async () => {
      if (busyRef.current) return;
      try {
        const me = await battleApi.getMe();
        if (busyRef.current) return;
        if (me?.current_room_id) onMatched?.(me.current_room_id);
        else if (!me?.vocab_queue) onCancelled?.();
      } catch {
        /* thử lại vòng sau */
      }
    }, 2000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [onMatched, onCancelled]);

  const elapsed = Math.max(0, Math.floor((now - Number(queue.joined_at || now)) / 1000));
  const botReady = flags.bot && (queue.bot_available || elapsed >= 20);

  async function cancel() {
    setBusy('cancel');
    try {
      await battleApiVocab.leaveMatch();
      onCancelled?.();
    } catch (err) {
      onError?.(err?.message || 'Không huỷ được.');
    } finally {
      setBusy('');
    }
  }
  async function bot() {
    setBusy('bot');
    try {
      const res = await battleApiVocab.toBot('medium');
      if (res?.room_id) onMatched?.(res.room_id);
      else {
        // Vé vừa được vòng ghép tự động lấy đi: xem em đã vào phòng nào chưa
        const me = await battleApi.getMe();
        if (me?.current_room_id) onMatched?.(me.current_room_id);
      }
    } catch (err) {
      onError?.(err?.message || 'Chưa đấu với máy được.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="arena-card arena-waiting-card vocab-waiting" role="region" aria-label="Đang tìm bạn đấu từ vựng">
      <div className="arena-row arena-row--between" style={{ gap: '12px', flexWrap: 'wrap' }}>
        <div className="arena-row" style={{ gap: '10px' }}>
          <span className="arena-spinner arena-spinner--dark" aria-hidden="true" />
          <div>
            <h2 className="arena-title-md">
              Đang tìm bạn đấu từ vựng…{' '}
              <span className="arena-mono" style={{ color: 'var(--accent, #1E5A7A)' }}>{elapsed}s</span>
            </h2>
            <p className="arena-muted" style={{ margin: 0 }}>
              📖 {queue.scope_label || 'Bộ từ đã chọn'}
              {queue.waiting > 1 ? ` · ${queue.waiting} bạn đang chờ cùng môn` : ''}
            </p>
          </div>
        </div>
        <button type="button" className="arena-btn arena-btn--danger-outline arena-btn--sm" disabled={Boolean(busy)} onClick={cancel}>
          Huỷ tìm
        </button>
      </div>
      {queue.widened && (
        <span className="arena-chip arena-chip--amber" role="status" style={{ marginTop: '10px' }}>
          Đã mở rộng ra mọi bộ từ của môn để dễ gặp bạn hơn
        </span>
      )}
      {botReady && (
        <div className="arena-row" style={{ gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
          <span className="arena-muted">Chưa có bạn nào? </span>
          <button type="button" className="arena-btn arena-btn--amber arena-btn--sm" disabled={Boolean(busy)} onClick={bot}>
            {busy === 'bot' ? 'Đang vào…' : '🤖 Đấu với máy'}
          </button>
        </div>
      )}
    </div>
  );
}

// Quiz lớp từ vựng (giáo viên): chọn môn, bộ từ và dạng câu cho phép.
export function VocabQuizPicker({ value, onChange, classId }) {
  const [sets, setSets] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  useEffect(() => {
    let cancelled = false;
    battleApiVocab
      .getSets(undefined, classId)
      .then((res) => !cancelled && setSets(Array.isArray(res?.sets) ? res.sets : []))
      .catch((err) => !cancelled && setErrorMsg(err?.message || 'Không tải được ngân hàng từ vựng.'));
    return () => {
      cancelled = true;
    };
  }, [classId]);
  const subjects = useMemo(() => {
    const map = new Map();
    for (const s of sets || []) if (!map.has(s.subject_id)) map.set(s.subject_id, { id: s.subject_id, name: s.subject_name, language: s.language });
    return [...map.values()];
  }, [sets]);
  useEffect(() => {
    if (!value.subjectId && subjects.length) onChange({ subjectId: subjects[0].id, setIds: [], kinds: [] });
  }, [subjects, value.subjectId, onChange]);
  const subject = subjects.find((s) => s.id === value.subjectId);
  const kinds = VOCAB_KINDS[subject?.language || 'en'];
  const subjectSets = (sets || []).filter((s) => s.subject_id === value.subjectId);
  const toggle = (key, id) =>
    onChange({
      ...value,
      [key]: value[key].includes(id)
        ? value[key].filter((x) => x !== id)
        : key === 'setIds' && value.setIds.length >= 20
        ? value[key]
        : [...value[key], id],
    });

  if (errorMsg) {
    return (
      <div className="arena-alert arena-alert--error" role="alert">
        <span>{errorMsg}</span>
      </div>
    );
  }
  if (sets === null) return <p className="arena-muted">Đang tải ngân hàng từ vựng…</p>;
  if (!sets.length) {
    return <p className="arena-muted">Ngân hàng từ vựng chưa có bộ nào đang hiện. Nhập từ ở trang Ngân hàng từ vựng trước.</p>;
  }
  return (
    <div style={{ marginTop: '14px', display: 'grid', gap: '14px' }}>
      {subjects.length > 1 && (
        <div>
          <span className="arena-field-label">Môn</span>
          <div className="arena-row" style={{ gap: '8px', flexWrap: 'wrap' }}>
            {subjects.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={value.subjectId === s.id}
                className={`arena-btn arena-btn--sm ${value.subjectId === s.id ? 'arena-btn--primary' : 'arena-btn--secondary'}`}
                onClick={() => onChange({ subjectId: s.id, setIds: [], kinds: [] })}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <span className="arena-field-label">Bộ từ (chọn một hoặc nhiều bộ)</span>
        <div className="vocab-set-grid">
          {subjectSets.map((s) => {
            const on = value.setIds.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                disabled={!s.playable}
                className={`vocab-set-chip${on ? ' is-on' : ''}`}
                onClick={() => toggle('setIds', s.id)}
              >
                <span className="vocab-set-chip__name">
                  {on ? '✓ ' : ''}
                  {s.name}
                </span>
                <span className="vocab-set-chip__meta">{s.playable ? `${s.entry_count} từ` : 'Chưa đủ từ'}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <span className="arena-field-label">Dạng câu (để trống = trộn mọi dạng)</span>
        <div className="arena-row" style={{ gap: '8px', flexWrap: 'wrap' }}>
          {kinds.map((k) => {
            const on = value.kinds.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                className={`arena-btn arena-btn--sm ${on ? 'arena-btn--primary' : 'arena-btn--secondary'}`}
                onClick={() => toggle('kinds', k)}
              >
                {on ? '✓ ' : ''}
                {VOCAB_KIND_LABELS[k]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
