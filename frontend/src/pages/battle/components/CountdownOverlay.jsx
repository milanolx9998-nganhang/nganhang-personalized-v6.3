import React, { useState, useEffect } from 'react';

export default function CountdownOverlay() {
  const [count, setCount] = useState(3);

  useEffect(() => {
    const timer = setInterval(() => {
      setCount((prev) => (prev > 1 ? prev - 1 : 1));
    }, 950);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="arena-fullscreen-overlay"
      role="status"
      aria-live="assertive"
      aria-label={`Ván đấu bắt đầu sau ${count} giây`}
    >
      <div
        className="arena-finish-strip"
        style={{ maxWidth: '300px', marginBottom: '20px' }}
        aria-hidden="true"
      />
      <p className="arena-countdown-subtitle">SẴN SÀNG XUẤT PHÁT</p>
      <div key={count} className="arena-countdown-number">
        {count}
      </div>
      <p className="arena-subtitle" style={{ color: 'rgba(255, 255, 255, 0.85)' }}>
        Đọc kỹ đề và bấm Chốt khi đã chắc chắn — Đúng là chính!
      </p>
    </div>
  );
}
