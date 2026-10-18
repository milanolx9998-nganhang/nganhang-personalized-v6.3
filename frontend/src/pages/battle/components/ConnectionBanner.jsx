import React from 'react';

export default function ConnectionBanner({ status, stopReason }) {
  if (status === 'reconnecting') {
    return (
      <div
        className="arena-connection-banner"
        role="status"
        aria-live="polite"
      >
        <span className="arena-spinner" aria-hidden="true" />
        <span>Đang nối lại… câu em đang làm vẫn được giữ</span>
      </div>
    );
  }

  if (status === 'stopped' && stopReason?.message) {
    return (
      <div
        className="arena-connection-banner arena-connection-banner--stopped"
        role="alert"
      >
        <span>⚠️ {stopReason.message}</span>
      </div>
    );
  }

  return null;
}
