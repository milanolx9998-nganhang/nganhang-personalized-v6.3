import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { battleApi } from '../battleApi.js';

const REPORT_REASONS = [
  { value: 'bullying', label: 'Trêu chọc, bắt nạt bạn' },
  { value: 'name', label: 'Tên hiển thị không phù hợp' },
  { value: 'cheating', label: 'Gian lận hoặc phá rối ván đấu' },
  { value: 'other', label: 'Lý do khác' },
];

export default function PlayerMenu({ roomId, player, onError }) {
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [modalMode, setModalMode] = useState(null); // 'report' | 'block' | null
  const [reason, setReason] = useState('bullying');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState('');

  if (!player) return null;

  const closeAll = () => {
    setMenuOpen(false);
    setModalMode(null);
    setNote('');
    setReason('bullying');
  };

  const handleReportSubmit = async (e) => {
    e.preventDefault();
    if (!roomId || !player.id || submitting) return;

    setSubmitting(true);
    try {
      await battleApi.createReport({
        room_id: roomId,
        target_id: player.id,
        reason,
        note: note.trim().slice(0, 500),
      });
      closeAll();
      setFeedbackSuccess(`Đã gửi báo cáo về ${player.name}.`);
      setTimeout(() => setFeedbackSuccess(''), 3500);
    } catch (err) {
      if (typeof onError === 'function') {
        onError(err?.message || 'Không gửi được báo cáo lúc này.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmBlock = async () => {
    if (!player.id || submitting) return;

    setSubmitting(true);
    try {
      await battleApi.blockUser(player.id);
      // Nếu chặn ở phòng chờ, chính em cũng rời khỏi phòng để không ghép chung nữa
      if (roomId) {
        try {
          await battleApi.leaveRoom(roomId);
        } catch {
          // Bỏ qua nếu máy chủ đã tự tách khỏi phòng
        }
      }
      closeAll();
      navigate('/practice/battle');
    } catch (err) {
      if (typeof onError === 'function') {
        onError(err?.message || 'Không thể chặn người chơi này.');
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="arena-player-menu">
      {feedbackSuccess && (
        <span className="arena-chip arena-chip--live" role="status" aria-live="polite">
          ✓ {feedbackSuccess}
        </span>
      )}

      <button
        type="button"
        className="arena-btn arena-btn--secondary arena-btn--sm arena-player-menu__trigger"
        aria-label={`Tuỳ chọn với bạn ${player.name}`}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        ⋯
      </button>

      {menuOpen && (
        <div
          className="arena-player-menu__dropdown"
          role="menu"
          aria-label={`Hành động với ${player.name}`}
        >
          <button
            type="button"
            role="menuitem"
            className="arena-player-menu__item"
            onClick={() => {
              setMenuOpen(false);
              setModalMode('report');
            }}
          >
            🚩 Báo cáo vi phạm
          </button>
          <button
            type="button"
            role="menuitem"
            className="arena-player-menu__item arena-player-menu__item--danger"
            onClick={() => {
              setMenuOpen(false);
              setModalMode('block');
            }}
          >
            🚫 Chặn bạn này
          </button>
        </div>
      )}

      {/* Hộp thoại Báo cáo */}
      {modalMode === 'report' && (
        <div
          className="arena-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`report-title-${player.id}`}
        >
          <form className="arena-sheet" onSubmit={handleReportSubmit}>
            <div className="arena-sheet__header">
              <h3 id={`report-title-${player.id}`} className="arena-title-md">
                Báo cáo người chơi: {player.name}
              </h3>
              <button
                type="button"
                className="arena-btn arena-btn--secondary arena-btn--sm"
                onClick={closeAll}
              >
                Đóng
              </button>
            </div>

            <div className="arena-sheet__body">
              <div style={{ marginBottom: '14px' }}>
                <label
                  htmlFor={`report-reason-${player.id}`}
                  className="arena-field-label"
                >
                  Chọn lý do báo cáo
                </label>
                <select
                  id={`report-reason-${player.id}`}
                  className="arena-select"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  {REPORT_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor={`report-note-${player.id}`}
                  className="arena-field-label"
                >
                  Ghi chú thêm cho thầy cô quản trị (tối đa 500 ký tự)
                </label>
                <textarea
                  id={`report-note-${player.id}`}
                  className="arena-textarea"
                  rows={3}
                  maxLength={500}
                  placeholder="Mô tả ngắn sự việc nếu cần…"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 500))}
                />
                <span className="arena-subtitle" style={{ display: 'block', textAlign: 'right' }}>
                  {note.length}/500
                </span>
              </div>
            </div>

            <div className="arena-sheet__footer">
              <button
                type="button"
                className="arena-btn arena-btn--secondary"
                onClick={closeAll}
                disabled={submitting}
              >
                Huỷ
              </button>
              <button
                type="submit"
                className="arena-btn arena-btn--danger"
                disabled={submitting}
              >
                {submitting ? 'Đang gửi…' : 'Gửi báo cáo'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Hộp thoại xác nhận Chặn */}
      {modalMode === 'block' && (
        <div
          className="arena-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`block-title-${player.id}`}
        >
          <div className="arena-sheet" style={{ maxWidth: '440px' }}>
            <div className="arena-sheet__header">
              <h3 id={`block-title-${player.id}`} className="arena-title-md">
                Chặn bạn {player.name}?
              </h3>
            </div>
            <div className="arena-sheet__body">
              <p style={{ margin: '0 0 8px' }}>
                Sau khi chặn, hệ thống sẽ không ghép em và <strong>{player.name}</strong> vào cùng phòng đấu tự do nữa.
              </p>
              <p className="arena-subtitle" style={{ margin: 0 }}>
                Lưu ý: Nếu chặn ngay tại phòng chờ, em sẽ tự động rời khỏi phòng hiện tại.
              </p>
            </div>
            <div className="arena-sheet__footer">
              <button
                type="button"
                className="arena-btn arena-btn--secondary"
                onClick={closeAll}
                disabled={submitting}
              >
                Huỷ
              </button>
              <button
                type="button"
                className="arena-btn arena-btn--danger"
                onClick={handleConfirmBlock}
                disabled={submitting}
              >
                {submitting ? 'Đang xử lý…' : 'Xác nhận chặn & Rời phòng'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
