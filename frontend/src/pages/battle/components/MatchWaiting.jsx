import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rich } from '../../practice/Rich.jsx';
import { battleApi, battleApiFlex } from '../battleApi.js';
import ScopeLabel from './ScopeLabel.jsx';

const MC_SHAPES = { A: '▲', B: '●', C: '■', D: '◆' };

export default function MatchWaiting({
  match,
  options,
  offsetMs = 0,
  onRoomJoined,
  onCancelled,
  onError,
}) {
  const navigate = useNavigate();

  const [elapsedSec, setElapsedSec] = useState(0);
  const [busyAction, setBusyAction] = useState(false);

  // Trạng thái làm câu hỏi nhanh giải trí trong lúc chờ (không tính điểm)
  const [quickSelected, setQuickSelected] = useState(null);
  const [quickSubmitted, setQuickSubmitted] = useState(false);

  // Reset câu hỏi nhanh khi đổi đề
  useEffect(() => {
    setQuickSelected(null);
    setQuickSubmitted(false);
  }, [match?.quick_question?.stem]);

  // Tính thời gian đã chờ từ joined_at hoặc elapsed_ms
  useEffect(() => {
    if (!match) return undefined;
    const baseJoinedAt =
      typeof match.joined_at === 'number'
        ? match.joined_at
        : Date.now() + offsetMs - (Number(match.elapsed_ms) || 0);

    const tick = () => {
      const serverNow = Date.now() + offsetMs;
      const sec = Math.max(0, Math.floor((serverNow - baseJoinedAt) / 1000));
      setElapsedSec(sec);
    };

    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [match, offsetMs]);

  if (!match) return null;

  const waitingCount =
    typeof match.waiting === 'number' && match.waiting >= 5
      ? match.waiting
      : null;
  const schoolPracticing =
    typeof match.school_practicing === 'number' ? match.school_practicing : 0;

  const suggestionRoom = match.suggestion_room || null;
  const botAvailable = Boolean(match.bot_available || elapsedSec >= 15);
  const exitsAvailable = Boolean(match.exits_available);
  const quickQuestion = match.quick_question || null;

  const handleCancelQueue = async () => {
    if (busyAction) return;
    setBusyAction(true);
    try {
      await battleApi.cancelMatchmaking();
      if (typeof onCancelled === 'function') onCancelled();
    } catch (err) {
      if (typeof onError === 'function') {
        onError(err?.message || 'Không huỷ được hàng chờ.');
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleAcceptSuggestedRoom = async () => {
    if (!suggestionRoom?.id || busyAction) return;
    setBusyAction(true);
    try {
      const res = await battleApiFlex.acceptSuggestedRoom(suggestionRoom.id);
      if (res?.current_room_id && typeof onRoomJoined === 'function') {
        onRoomJoined(res.current_room_id);
      }
    } catch (err) {
      if (typeof onError === 'function') {
        onError(err?.message || 'Phòng gợi ý đã đầy hoặc vừa bắt đầu.');
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleExitQueue = async (toTarget, difficulty = 'medium') => {
    if (busyAction) return;
    setBusyAction(true);
    try {
      const res = await battleApiFlex.exitMatchQueue({
        to: toTarget,
        difficulty: toTarget === 'bot' ? difficulty : undefined,
      });

      if (res?.current_room_id && typeof onRoomJoined === 'function') {
        onRoomJoined(res.current_room_id);
        return;
      }

      if (toTarget === 'practice') {
        const targetScope =
          res?.scope ||
          (Array.isArray(res?.choices) && res.choices[0]) ||
          match.scope ||
          (Array.isArray(match.choices) && match.choices[0]) ||
          null;
        const sp = new URLSearchParams();
        if (targetScope?.subject_id) sp.set('subject_id', String(targetScope.subject_id));
        if (targetScope?.branch_id) sp.set('branch_id', String(targetScope.branch_id));
        if (targetScope?.chapter) sp.set('chapter', String(targetScope.chapter));
        if (Array.isArray(targetScope?.topic_ids) && targetScope.topic_ids.length > 0) {
          sp.set('topic_ids', targetScope.topic_ids.join(','));
        }
        const qs = sp.toString();
        navigate(`/practice/new${qs ? `?${qs}` : ''}`, {
          state: { scope: targetScope, choices: res?.choices || match.choices },
        });
      }
    } catch (err) {
      if (typeof onError === 'function') {
        onError(err?.message || 'Không thể chuyển hướng từ hàng chờ.');
      }
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <div className="arena-card arena-waiting-card" role="region" aria-label="Đang tìm đối thủ">
      <div className="arena-finish-strip arena-finish-strip--thin" style={{ marginBottom: '12px' }} />

      <div className="arena-row arena-row--between">
        <div className="arena-row" style={{ gap: '10px' }}>
          <span className="arena-spinner arena-spinner--dark" aria-hidden="true" />
          <div>
            <h2 className="arena-title-md">
              Đang tìm bạn cùng khối…{' '}
              <span className="arena-mono" style={{ color: 'var(--accent, #1E5A7A)' }}>
                {elapsedSec}s
              </span>
            </h2>
            {/* Quy tắc: không hiện số người đang tìm khi < 5, thay bằng số bạn toàn trường đang ôn tập */}
            <p className="arena-subtitle" style={{ margin: 0 }}>
              {waitingCount !== null
                ? `Hiện có ${waitingCount} bạn cùng khối đang tìm trận`
                : `Tối nay có ${Math.max(1, schoolPracticing)} bạn toàn trường đang ôn tập`}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="arena-btn arena-btn--danger-outline arena-btn--sm"
          onClick={handleCancelQueue}
          disabled={busyAction}
        >
          Huỷ tìm
        </button>
      </div>

      {/* Phạm vi hiện tại + thông báo nhẹ khi đã nới rộng */}
      <div className="arena-waiting-scope-box">
        <div>
          <span className="arena-field-label" style={{ marginBottom: '2px' }}>
            Phạm vi đang tìm:
          </span>
          <strong>
            {match.current_scope_label ? (
              match.current_scope_label
            ) : match.scope ? (
              <ScopeLabel scope={match.scope} options={options} />
            ) : (
              'Môn nào cũng được trong phần em đã học'
            )}
          </strong>
        </div>

        {match.widened && match.widened !== 'none' && (
          <span className="arena-chip arena-chip--amber" role="status" aria-live="polite">
            {match.widened === 'chapter'
              ? 'Đã mở rộng ra cả Chương trong phần em đã học…'
              : match.widened === 'subject'
              ? 'Đã mở rộng ra các bài đã học trong Môn…'
              : `Đã mở rộng phạm vi (${match.widened})…`}
          </span>
        )}
      </div>

      {/* THẺ "CÓ PHÒNG PHÙ HỢP — VÀO?" (Xác nhận 1 chạm) */}
      {suggestionRoom && (
        <div
          className="arena-card arena-card--pinned"
          style={{ marginTop: '14px' }}
          role="status"
          aria-live="polite"
        >
          <div className="arena-row arena-row--between">
            <div>
              <span className="arena-chip arena-chip--amber">
                ✨ CÓ PHÒNG PHÙ HỢP — VÀO?
              </span>
              <h3 className="arena-title-md" style={{ color: '#FFFFFF', marginTop: '6px' }}>
                Phòng của {suggestionRoom.host_name || 'bạn cùng khối'} ·{' '}
                <ScopeLabel scope={suggestionRoom.scope} options={options} />
              </h3>
              <p className="arena-subtitle">
                {suggestionRoom.question_count || 7} câu · Đang có{' '}
                {Number(suggestionRoom.players?.length ?? suggestionRoom.players ?? 1)}/
                {suggestionRoom.capacity || 20} bạn
              </p>
            </div>

            <button
              type="button"
              className="arena-btn arena-btn--amber arena-btn--lg"
              onClick={handleAcceptSuggestedRoom}
              disabled={busyAction}
            >
              Vào ngay →
            </button>
          </div>
        </div>
      )}

      {/* TỪ GIÂY 15: HIỆN NÚT "ĐẤU VỚI MÁY NGAY" (khi chưa tới mốc cuối 3 lối thoát) */}
      {botAvailable && !exitsAvailable && (
        <div className="arena-waiting-bot-offer" style={{ marginTop: '14px' }}>
          <span>Chưa ghép được bạn ngay lúc này?</span>
          <button
            type="button"
            className="arena-btn arena-btn--amber arena-btn--sm"
            onClick={() => handleExitQueue('bot', 'medium')}
            disabled={busyAction}
          >
            🤖 Đấu với máy ngay (không tính hạng)
          </button>
        </div>
      )}

      {/* TỚI MỐC CUỐI: HIỆN ĐỦ 3 LỐI THOÁT (Đấu với máy / Mở phòng công khai / Tự luyện phần này) */}
      {exitsAvailable && (
        <div className="arena-waiting-exits" style={{ marginTop: '14px' }} role="region" aria-label="Các lựa chọn thay thế khi vắng người">
          <p className="arena-field-label" style={{ marginBottom: '8px' }}>
            Hiện đang ít bạn cùng tìm đúng phần này. Em có thể chọn ngay một trong 3 hướng:
          </p>
          <div className="arena-waiting-exits__grid">
            <button
              type="button"
              className="arena-btn arena-btn--amber"
              onClick={() => handleExitQueue('bot', 'medium')}
              disabled={busyAction}
            >
              🤖 Đấu với máy
            </button>
            <button
              type="button"
              className="arena-btn arena-btn--primary"
              onClick={() => handleExitQueue('public_room')}
              disabled={busyAction}
            >
              🌐 Mở phòng công khai
            </button>
            <button
              type="button"
              className="arena-btn arena-btn--secondary"
              onClick={() => handleExitQueue('practice')}
              disabled={busyAction}
            >
              📘 Tự luyện phần này
            </button>
          </div>
        </div>
      )}

      {/* MỘT CÂU HỎI NHANH ĐỂ LÀM TRONG LÚC CHỜ (Không tính điểm) */}
      {quickQuestion && (
        <div className="arena-quick-quiz" style={{ marginTop: '16px' }}>
          <div className="arena-row arena-row--between" style={{ marginBottom: '8px' }}>
            <span className="arena-chip arena-chip--accent">
              ⚡ Khởi động nhanh trong lúc chờ (không tính điểm)
            </span>
            {quickSubmitted && (
              <span className="arena-chip arena-chip--live">
                ✓ Đã ghi nhận lựa chọn nháp của em
              </span>
            )}
          </div>

          <div className="arena-quick-quiz__stem">
            <Rich text={quickQuestion.stem || ''} />
          </div>

          {Array.isArray(quickQuestion.options) && quickQuestion.options.length > 0 && (
            <div className="arena-options-grid" style={{ marginTop: '10px' }}>
              {quickQuestion.options.map((opt, idx) => {
                const letter = ['A', 'B', 'C', 'D'][idx] || String(opt.id || idx + 1);
                const optId = String(opt.id ?? letter);
                const isSelected = quickSelected === optId;
                return (
                  <button
                    key={optId}
                    type="button"
                    className={`arena-option-btn arena-option-btn--${letter} ${
                      isSelected ? 'arena-option-btn--selected' : ''
                    }`}
                    onClick={() => {
                      setQuickSelected(optId);
                      setQuickSubmitted(true);
                    }}
                  >
                    <span className="arena-option-badge" aria-hidden="true">
                      <span>{letter}</span>
                      <span>{MC_SHAPES[letter] || '●'}</span>
                    </span>
                    <div className="arena-option-content">
                      <Rich text={opt.text || opt.label || ''} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
