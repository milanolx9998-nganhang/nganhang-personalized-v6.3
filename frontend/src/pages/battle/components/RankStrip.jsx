import React, { useState } from 'react';

export default function RankStrip({ snapshot, userId }) {
  const [expanded, setExpanded] = useState(false);

  if (!snapshot) return null;

  const players = Array.isArray(snapshot.players) ? snapshot.players : [];
  const playerCount =
    typeof snapshot.player_count === 'number'
      ? snapshot.player_count
      : players.length;
  const answeredCount =
    typeof snapshot.answered_count === 'number'
      ? snapshot.answered_count
      : players.filter((p) => p.answered).length;

  const mePlayer = players.find((p) => Number(p.id) === Number(userId));
  const myPoints = typeof mePlayer?.points === 'number' ? mePlayer.points : null;

  return (
    <div className="arena-rank-strip-wrapper">
      {expanded && players.length > 0 && (
        <div
          id="arena-rank-strip-drawer"
          className="arena-rank-strip-drawer"
          role="region"
          aria-label="Trạng thái trả lời của các bạn trong phòng"
        >
          <div className="arena-rank-strip-drawer__header">
            <span>Trạng thái trả lời câu này</span>
            <button
              type="button"
              className="arena-btn arena-btn--sm arena-btn--secondary"
              onClick={() => setExpanded(false)}
            >
              Thu gọn
            </button>
          </div>
          <ul className="arena-rank-strip-list">
            {players.map((p) => {
              const isMe = Number(p.id) === Number(userId);
              return (
                <li
                  key={p.id}
                  className={`arena-rank-strip-item ${
                    isMe ? 'arena-rank-strip-item--me' : ''
                  }`}
                >
                  <div className="arena-rank-strip-item__left">
                    <span className="arena-rank-strip-item__name">{p.name}</span>
                    {p.class_name && (
                      <span className="arena-rank-strip-item__class">
                        ({p.class_name})
                      </span>
                    )}
                    {isMe && (
                      <span className="arena-chip arena-chip--accent">Em</span>
                    )}
                  </div>
                  <div className="arena-rank-strip-item__right">
                    <span
                      className={`arena-status-pill ${
                        p.answered ? 'arena-status-pill--done' : ''
                      }`}
                    >
                      {p.answered ? '✓ Đã trả lời' : 'Đang suy nghĩ…'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="arena-rank-strip-bar">
        <div className="arena-rank-strip-bar__inner">
          <div className="arena-rank-strip-bar__stat">
            <span className="arena-pulse-dot arena-pulse-dot--amber" aria-hidden="true" />
            <span>
              Đã trả lời{' '}
              <strong className="arena-mono">
                {answeredCount}/{playerCount}
              </strong>
            </span>
          </div>

          {myPoints !== null && (
            <div className="arena-rank-strip-bar__points">
              Điểm đến câu trước:{' '}
              <strong className="arena-mono">{myPoints} điểm</strong>
            </div>
          )}

          {players.length > 0 && (
            <button
              type="button"
              className="arena-btn arena-btn--ghost-light arena-btn--sm"
              aria-expanded={expanded}
              aria-controls="arena-rank-strip-drawer"
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? 'Đóng danh sách' : 'Xem danh sách'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
