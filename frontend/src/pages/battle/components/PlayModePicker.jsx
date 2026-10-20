import React, { useEffect } from 'react';

const TOTAL_MINUTE_OPTIONS = [3, 5, 10, 15, 20];

/**
 * Chuẩn hoá 6 trường cấu hình cách chơi theo đúng hợp đồng V6.9.3
 */
export function normalizePlayModeConfig(raw = {}, flags = {}, kind = 'duel') {
  const canSelfPaced = Boolean(flags?.self_paced) && kind !== 'team';
  const canSpeedScoring = Boolean(flags?.speed_scoring);

  let pacing = raw.pacing === 'self' && canSelfPaced ? 'self' : 'sync';
  let scoring = raw.scoring === 'speed' && canSpeedScoring ? 'speed' : 'accuracy';

  let time_limit = 'per_question';
  let total_minutes = null;
  let reveal_policy = 'instant';
  let show_live_board = true;

  if (pacing === 'self') {
    time_limit = raw.time_limit === 'total' ? 'total' : 'per_question';
    if (time_limit === 'total') {
      const m = Number(raw.total_minutes);
      total_minutes = TOTAL_MINUTE_OPTIONS.includes(m) ? m : 10;
    } else {
      total_minutes = null;
    }
    reveal_policy = raw.reveal_policy === 'deferred' ? 'deferred' : 'instant';
    show_live_board =
      typeof raw.show_live_board === 'boolean' ? raw.show_live_board : true;
  }

  return {
    pacing,
    scoring,
    time_limit,
    total_minutes,
    reveal_policy,
    show_live_board,
  };
}

export default function PlayModePicker({
  value = {},
  onChange,
  flags = {},
  kind = 'duel',
  isTeacher = false,
}) {
  const canSelfPaced = Boolean(flags?.self_paced) && kind !== 'team';
  const canSpeedScoring = Boolean(flags?.speed_scoring);

  const normalized = normalizePlayModeConfig(value, flags, kind);
  const groupNoun = isTeacher ? 'cả lớp' : 'cả phòng';

  // Nếu cờ hoặc kiểu phòng thay đổi làm tổ hợp hiện tại không còn hợp lệ, tự động chuẩn hoá lại
  useEffect(() => {
    const isDiff =
      value?.pacing !== normalized.pacing ||
      value?.scoring !== normalized.scoring ||
      value?.time_limit !== normalized.time_limit ||
      value?.total_minutes !== normalized.total_minutes ||
      value?.reveal_policy !== normalized.reveal_policy ||
      value?.show_live_board !== normalized.show_live_board;

    if (isDiff && typeof onChange === 'function') {
      onChange(normalized);
    }
  }, [
    canSelfPaced,
    canSpeedScoring,
    kind,
    value?.pacing,
    value?.scoring,
    value?.time_limit,
    value?.total_minutes,
    value?.reveal_policy,
    value?.show_live_board,
    normalized,
    onChange,
  ]);

  const emitChange = (patch) => {
    if (typeof onChange !== 'function') return;
    const merged = { ...normalized, ...patch };
    onChange(normalizePlayModeConfig(merged, flags, kind));
  };

  // Xác định thẻ Cách chơi đang chọn: 'sync' | 'self_per_q' | 'self_total'
  const currentStyleCard =
    normalized.pacing === 'sync'
      ? 'sync'
      : normalized.time_limit === 'total'
      ? 'self_total'
      : 'self_per_q';

  const handleSelectStyleCard = (styleKey) => {
    if (styleKey === 'sync') {
      emitChange({
        pacing: 'sync',
        time_limit: 'per_question',
        total_minutes: null,
        reveal_policy: 'instant',
        show_live_board: true,
      });
    } else if (styleKey === 'self_per_q') {
      emitChange({
        pacing: 'self',
        time_limit: 'per_question',
        total_minutes: null,
      });
    } else if (styleKey === 'self_total') {
      emitChange({
        pacing: 'self',
        time_limit: 'total',
        total_minutes: normalized.total_minutes || 10,
      });
    }
  };

  const isRankedEligibleCombo =
    normalized.pacing === 'sync' &&
    normalized.scoring === 'accuracy' &&
    normalized.time_limit === 'per_question';

  return (
    <div className="arena-mode-picker">
      {/* 1. CHỌN CÁCH CHƠI */}
      <div className="arena-mode-picker__section">
        <span className="arena-field-label">Cách chơi</span>
        <div className="arena-mode-picker__cards">
          <button
            type="button"
            aria-pressed={currentStyleCard === 'sync'}
            className={`arena-choice-tile ${
              currentStyleCard === 'sync' ? 'arena-choice-tile--active' : ''
            }`}
            onClick={() => handleSelectStyleCard('sync')}
          >
            <div className="arena-row arena-row--between">
              <span className="arena-choice-tile__title">🎯 Cùng nhịp</span>
              <span className="arena-chip arena-chip--accent">Truyền thống</span>
            </div>
            <div className="arena-choice-tile__desc">
              {isTeacher
                ? 'Cả lớp làm chung từng câu theo điều khiển của thầy cô.'
                : 'Cả phòng làm chung từng câu và xem lời giải cùng lúc.'}
            </div>
          </button>

          {canSelfPaced && (
            <>
              <button
                type="button"
                aria-pressed={currentStyleCard === 'self_per_q'}
                className={`arena-choice-tile ${
                  currentStyleCard === 'self_per_q' ? 'arena-choice-tile--active' : ''
                }`}
                onClick={() => handleSelectStyleCard('self_per_q')}
              >
                <div className="arena-row arena-row--between">
                  <span className="arena-choice-tile__title">🏃 Tự chơi</span>
                  <span className="arena-chip arena-chip--amber">Mỗi bạn một nhịp</span>
                </div>
                <div className="arena-choice-tile__desc">
                  {isTeacher
                    ? 'Học sinh tự chuyển câu theo tốc độ riêng, thầy cô xem bảng trực tiếp của cả lớp.'
                    : 'Chốt xong tự sang câu mới ngay, không phải chờ các bạn khác.'}
                </div>
              </button>

              <button
                type="button"
                aria-pressed={currentStyleCard === 'self_total'}
                className={`arena-choice-tile ${
                  currentStyleCard === 'self_total' ? 'arena-choice-tile--active' : ''
                }`}
                onClick={() => handleSelectStyleCard('self_total')}
              >
                <div className="arena-row arena-row--between">
                  <span className="arena-choice-tile__title">⏱ Thi theo phút</span>
                  <span className="arena-chip arena-chip--amber">Đếm giờ tổng</span>
                </div>
                <div className="arena-choice-tile__desc">
                  {isTeacher
                    ? 'Đặt tổng số phút cho cả lớp, tự phân bổ thời gian từng câu, hết giờ là dừng.'
                    : 'Cả phòng làm bài trong tổng số phút cố định, hết giờ là dừng.'}
                </div>
              </button>
            </>
          )}
        </div>

        {/* Chip chọn số phút khi chọn Thi theo phút */}
        {normalized.pacing === 'self' && normalized.time_limit === 'total' && (
          <div className="arena-mode-picker__subbox">
            <span className="arena-field-label">Tổng thời gian làm bài</span>
            <div className="arena-row" style={{ gap: '8px' }}>
              {TOTAL_MINUTE_OPTIONS.map((mins) => {
                const active = Number(normalized.total_minutes) === mins;
                return (
                  <button
                    key={mins}
                    type="button"
                    aria-pressed={active}
                    className={`arena-btn arena-btn--sm arena-mono ${
                      active ? 'arena-btn--amber' : 'arena-btn--secondary'
                    }`}
                    onClick={() => emitChange({ total_minutes: mins })}
                  >
                    {mins} phút
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2. CÁCH TÍNH ĐIỂM */}
      {canSpeedScoring && (
        <div className="arena-mode-picker__section">
          <span className="arena-field-label">Cách tính điểm</span>
          <div className="arena-grid-2">
            <button
              type="button"
              aria-pressed={normalized.scoring === 'accuracy'}
              className={`arena-choice-tile ${
                normalized.scoring === 'accuracy' ? 'arena-choice-tile--active' : ''
              }`}
              onClick={() => emitChange({ scoring: 'accuracy' })}
            >
              <div className="arena-choice-tile__title">✓ Đúng là chính</div>
              <div className="arena-choice-tile__desc">
                Mỗi câu đúng được 100 điểm. Cẩn thận suy nghĩ, miễn chốt trước khi hết giờ.
              </div>
            </button>

            <button
              type="button"
              aria-pressed={normalized.scoring === 'speed'}
              className={`arena-choice-tile ${
                normalized.scoring === 'speed' ? 'arena-choice-tile--active' : ''
              }`}
              onClick={() => emitChange({ scoring: 'speed' })}
            >
              <div className="arena-choice-tile__title">⚡ Nhanh tay</div>
              <div className="arena-choice-tile__desc">
                Đúng được 600 điểm + thưởng tốc độ tới 400 điểm
                {normalized.pacing === 'sync'
                  ? ` (ai đúng sớm nhất ${groupNoun} được thêm +100 ⚡ Nhanh nhất).`
                  : '.'}
              </div>
            </button>
          </div>
        </div>
      )}

      {/* 3. CÔNG BỐ ĐÁP ÁN & BẢNG TRỰC TIẾP (Chỉ hiện khi Tự chơi / Thi theo phút) */}
      {normalized.pacing === 'self' && (
        <div className="arena-mode-picker__section">
          <span className="arena-field-label">Công bố đáp án & lời giải</span>
          <div className="arena-grid-2">
            <button
              type="button"
              aria-pressed={normalized.reveal_policy === 'instant'}
              className={`arena-choice-tile ${
                normalized.reveal_policy === 'instant'
                  ? 'arena-choice-tile--active'
                  : ''
              }`}
              onClick={() => emitChange({ reveal_policy: 'instant' })}
            >
              <div className="arena-choice-tile__title">💡 Ôn tập (Hiện ngay)</div>
              <div className="arena-choice-tile__desc">
                Chốt xong câu nào biết ngay đúng/sai và đọc được lời giải chi tiết.
              </div>
            </button>

            <button
              type="button"
              aria-pressed={normalized.reveal_policy === 'deferred'}
              className={`arena-choice-tile ${
                normalized.reveal_policy === 'deferred'
                  ? 'arena-choice-tile--active'
                  : ''
              }`}
              onClick={() => emitChange({ reveal_policy: 'deferred' })}
            >
              <div className="arena-choice-tile__title">🔒 Thi đua (Cuối ván)</div>
              <div className="arena-choice-tile__desc">
                Lúc làm chỉ báo đã nhận câu trả lời, giữ kín đáp án tới khi kết thúc ván.
              </div>
            </button>
          </div>

          <label className="arena-toggle-row arena-mode-picker__board-toggle">
            <div>
              <div className="arena-toggle-row__title">
                📊 Hiện bảng xếp hạng trực tiếp
              </div>
              <div className="arena-subtitle" style={{ margin: 0 }}>
                Cho phép {groupNoun} theo dõi tiến độ số câu đã làm trong lúc đang đấu.
              </div>
            </div>
            <input
              type="checkbox"
              checked={Boolean(normalized.show_live_board)}
              onChange={(e) => emitChange({ show_live_board: e.target.checked })}
            />
          </label>
        </div>
      )}

      {/* 4. DÒNG TÓM TẮT TÍNH HẠNG DƯỚI CÙNG */}
      <div
        className={`arena-mode-picker__summary ${
          isRankedEligibleCombo
            ? 'arena-mode-picker__summary--ranked'
            : 'arena-mode-picker__summary--unranked'
        }`}
        role="status"
      >
        <span className="arena-chip arena-chip--amber">
          {isRankedEligibleCombo ? '🏅 Tính hạng' : 'Không tính hạng'}
        </span>
        <span className="arena-mode-picker__summary-text">
          {isRankedEligibleCombo
            ? 'Tổ hợp Cùng nhịp · Đúng là chính đủ điều kiện xét tính hạng (khi phạm vi từ cả Chương).'
            : 'Không tính hạng — chỉ ván Cùng nhịp · Đúng là chính mới tính hạng.'}
        </span>
      </div>
    </div>
  );
}
