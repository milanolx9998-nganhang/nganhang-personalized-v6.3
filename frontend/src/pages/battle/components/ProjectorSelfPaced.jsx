import React, { useState, useEffect, useMemo } from 'react';

function formatProjectorClock(ms) {
  if (typeof ms !== 'number' || ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function buildProjectorModeTitle(projector) {
  if (!projector) return 'Tự chơi';
  const parts = [];
  if (projector.time_limit === 'total') {
    parts.push(
      `Thi theo phút (${projector.total_minutes || 10} phút)`
    );
  } else {
    parts.push('Tự chơi theo nhịp cá nhân');
  }
  parts.push(
    projector.scoring === 'speed' ? '⚡ Nhanh tay' : '✓ Đúng là chính'
  );
  parts.push(
    projector.reveal_policy === 'deferred'
      ? '🔒 Thi đua (công bố cuối ván)'
      : '💡 Ôn tập (hiện lời giải ngay)'
  );
  return parts.join(' · ');
}

export default function ProjectorSelfPaced({
  projector,
  offsetMs = 0,
  onEnd,
  onPause,
  onResume,
  busy = false,
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (projector?.phase === 'paused' || projector?.phase === 'finished') {
      return undefined;
    }
    setNowMs(Date.now());
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 200);
    return () => clearInterval(id);
  }, [projector?.phase]);

  const board = useMemo(() => {
    if (!projector) return [];
    if (Array.isArray(projector.public_board)) return projector.public_board;
    if (Array.isArray(projector.board)) return projector.board;
    return [];
  }, [projector]);

  if (!projector) return null;

  const phase = projector.phase || 'question';
  const isFinished =
    phase === 'finished' || phase === 'interrupted' || phase === 'closed';
  const isPaused = phase === 'paused';

  const totalQuestions = Number(projector.question_count) || 7;
  const totalStudents =
    typeof projector.player_count === 'number'
      ? projector.player_count
      : board.length;

  const finishedStudentsCount =
    typeof projector.finished_count === 'number'
      ? projector.finished_count
      : typeof projector.done_count === 'number'
      ? projector.done_count
      : board.filter(
          (row) => Number(row.submitted) >= Number(row.total || totalQuestions)
        ).length;

  const serverNow = nowMs + offsetMs;
  const remainingTotalMs =
    projector.time_limit === 'total' && typeof projector.ends_at === 'number'
      ? Math.max(0, projector.ends_at - serverNow)
      : null;

  const top10Board = board.slice(0, 10);
  const podiumTop3 =
    Array.isArray(projector.podium) && projector.podium.length > 0
      ? projector.podium.slice(0, 3)
      : board.slice(0, 3);

  return (
    <div className="arena-proj-self">
      {/* Thanh HUD cỡ lớn: Chế độ · Đồng hồ tổng (hoặc Mỗi câu X giây) · Số em đã xong */}
      <section className="arena-proj-self__hud">
        <div className="arena-proj-self__meta">
          <span className="arena-chip arena-chip--amber">
            CHẾ ĐỘ TỰ CHƠI · MÀN CHIẾU LỚP HỌC
          </span>
          <h2 className="arena-proj-self__mode-title">
            {buildProjectorModeTitle(projector)}
          </h2>
        </div>

        <div className="arena-proj-self__clock-box">
          {projector.time_limit === 'total' ? (
            <div
              className={`arena-proj-self__big-timer arena-mono ${
                remainingTotalMs !== null && remainingTotalMs < 30000
                  ? 'arena-proj-self__big-timer--urgent'
                  : ''
              }`}
              role="timer"
              aria-live="off"
            >
              <span className="arena-proj-self__timer-label">
                {isPaused ? 'ĐANG TẠM DỪNG' : 'THỜI GIAN CÒN LẠI'}
              </span>
              <span className="arena-proj-self__timer-value">
                {isFinished
                  ? '00:00'
                  : remainingTotalMs !== null
                  ? formatProjectorClock(remainingTotalMs)
                  : `${projector.total_minutes || 10}:00`}
              </span>
            </div>
          ) : (
            <div className="arena-proj-self__big-timer arena-mono">
              <span className="arena-proj-self__timer-label">NHỊP ĐỘ CÂU HỎI</span>
              <span className="arena-proj-self__timer-value">
                Mỗi câu {projector.seconds || 30} giây
              </span>
            </div>
          )}
        </div>

        <div className="arena-proj-self__done-counter" aria-live="polite">
          <span className="arena-proj-self__done-num arena-mono">
            {finishedStudentsCount}/{totalStudents}
          </span>
          <span className="arena-proj-self__done-label">
            em đã hoàn thành bài
          </span>
        </div>
      </section>

      {isPaused && (
        <div
          className="arena-proj-paused-banner"
          role="status"
          aria-live="polite"
        >
          ⏸ Thầy cô đang tạm dừng ván đấu — Đồng hồ của cả lớp đã dừng lại.
        </div>
      )}

      {/* KHI VÁN ĐẤU ĐÃ KẾT THÚC: Hiện "Hết giờ!" + Top 3 */}
      {isFinished ? (
        <section className="arena-proj-dark-panel arena-proj-self__finished">
          <div className="arena-proj-self__finished-banner">
            <span className="arena-chip arena-chip--amber">HOÀN TẤT VÁN ĐẤU</span>
            <h1 className="arena-proj-title" style={{ marginTop: '8px' }}>
              🏁 Hết giờ!
            </h1>
            <p className="arena-proj-subtitle">
              Đã ghi nhận kết quả của {totalStudents} học sinh trong lớp.
            </p>
          </div>

          {podiumTop3.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h3
                className="arena-title-lg"
                style={{ color: 'var(--arena-amber)', marginBottom: '14px' }}
              >
                🏆 Vinh danh Top 3 dẫn đầu lớp
              </h3>
              <div className="arena-podium-grid">
                {podiumTop3.map((p, idx) => {
                  const rankNum = p.rank ?? idx + 1;
                  return (
                    <div
                      key={p.id || p.name || idx}
                      className={`arena-podium-card arena-podium-card--rank-${rankNum}`}
                    >
                      <div className="arena-podium-card__medal arena-mono">
                        Hạng {rankNum}
                      </div>
                      <div className="arena-podium-card__name">{p.name}</div>
                      {typeof p.points === 'number' && (
                        <div className="arena-podium-card__points arena-mono">
                          {p.points} điểm
                        </div>
                      )}
                      {p.submitted !== undefined && (
                        <div className="arena-podium-card__sub arena-mono">
                          Đã nộp {p.submitted}/{p.total || totalQuestions} câu
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      ) : (
        /* KHI VÁN ĐANG CHẠY: Bảng trực tiếp Top 10 cỡ chữ lớn đọc rõ từ cuối lớp */
        <section className="arena-proj-dark-panel arena-proj-self__board-wrap">
          <div className="arena-row arena-row--between" style={{ marginBottom: '14px' }}>
            <h3 className="arena-title-lg" style={{ color: '#FFFFFF' }}>
              📊 Bảng tiến độ trực tiếp (Top 10)
            </h3>
            <span className="arena-chip arena-chip--amber">
              Tổng số: {totalQuestions} câu hỏi
            </span>
          </div>

          {top10Board.length === 0 ? (
            <div className="arena-proj-empty-roster">
              <p>
                {projector.show_live_board === false
                  ? 'Thầy cô đang tắt hiển thị bảng xếp hạng trực tiếp để học sinh tập trung làm bài.'
                  : 'Đang chờ học sinh chốt những câu trả lời đầu tiên…'}
              </p>
            </div>
          ) : (
            <div className="arena-proj-self__top10-grid">
              {top10Board.map((row, idx) => {
                const rTotal = Number(row.total) || totalQuestions;
                const rSub = Number(row.submitted) || 0;
                const pct = Math.min(
                  100,
                  Math.round((rSub / Math.max(1, rTotal)) * 100)
                );
                const hasPoints = typeof row.points === 'number';

                return (
                  <div
                    key={`${row.name}-${idx}`}
                    className={`arena-proj-self__row ${
                      idx < 3 ? 'arena-proj-self__row--top3' : ''
                    }`}
                  >
                    <div className="arena-proj-self__row-left">
                      <span className="arena-proj-self__rank arena-mono">
                        #{idx + 1}
                      </span>
                      <span className="arena-proj-self__name">{row.name}</span>
                    </div>

                    <div className="arena-proj-self__row-bar">
                      <div
                        className="arena-proj-self__row-fill"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="arena-proj-self__row-right arena-mono">
                      <span className="arena-proj-self__progress-text">
                        {rSub}/{rTotal} câu
                      </span>
                      {hasPoints && (
                        <strong className="arena-proj-self__points">
                          {row.points} điểm
                        </strong>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Thanh nút điều khiển của Giáo viên ở chân màn chiếu */}
      {!isFinished && (
        <footer className="arena-proj-controls-bar">
          <div className="arena-row" style={{ gap: '12px' }}>
            {!isPaused && typeof onPause === 'function' && (
              <button
                type="button"
                className="arena-btn arena-btn--amber arena-btn--lg"
                onClick={onPause}
                disabled={busy}
              >
                ⏸ Tạm dừng
              </button>
            )}
            {isPaused && typeof onResume === 'function' && (
              <button
                type="button"
                className="arena-btn arena-btn--amber arena-btn--lg"
                onClick={onResume}
                disabled={busy}
              >
                ▶ Tiếp tục
              </button>
            )}
          </div>

          {typeof onEnd === 'function' && (
            <button
              type="button"
              className="arena-btn arena-btn--danger arena-btn--lg"
              onClick={onEnd}
              disabled={busy}
            >
              Kết thúc ván
            </button>
          )}
        </footer>
      )}
    </div>
  );
}
