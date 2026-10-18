import React, { useState, useEffect } from 'react';
import { battleApi } from '../battleApi.js';

const EMOTES = [
  { kind: 'hello', icon: '👋', label: 'Chào' },
  { kind: 'cheer', icon: '💪', label: 'Cố lên' },
  { kind: 'thanks', icon: '🙏', label: 'Cảm ơn' },
  { kind: 'well_done', icon: '🌟', label: 'Hay quá' },
];

export default function EmoteBar({ roomId, disabled = false, onError }) {
  const [cooldownSec, setCooldownSec] = useState(0);
  const [sendingKind, setSendingKind] = useState(null);

  useEffect(() => {
    if (cooldownSec <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldownSec((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSec]);

  const handleSend = async (kind) => {
    if (!roomId || disabled || cooldownSec > 0 || sendingKind) return;

    setSendingKind(kind);
    try {
      await battleApi.sendEmote(roomId, kind);
      setCooldownSec(10);
    } catch (err) {
      if (typeof onError === 'function') {
        onError(err?.message || 'Chưa gửi được biểu cảm.');
      }
    } finally {
      setSendingKind(null);
    }
  };

  const isLocked = disabled || cooldownSec > 0 || Boolean(sendingKind);

  return (
    <div
      className="arena-emote-bar"
      role="group"
      aria-label="Gửi lời khích lệ tới các bạn trong phòng"
    >
      <span className="arena-emote-bar__label">
        {cooldownSec > 0
          ? `Chờ ${cooldownSec}s để gửi tiếp:`
          : 'Khích lệ bạn cùng phòng:'}
      </span>
      <div className="arena-emote-bar__buttons">
        {EMOTES.map((item) => (
          <button
            key={item.kind}
            type="button"
            className="arena-btn arena-btn--secondary arena-btn--sm arena-emote-btn"
            disabled={isLocked}
            onClick={() => handleSend(item.kind)}
            aria-label={`Gửi biểu cảm ${item.label}`}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
