import React from 'react';

function formatDecimalOne(num) {
  const n = Number(num) || 0;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace('.', ',');
}

/**
 * Bong bóng điểm thưởng tốc độ nảy lên (+870 điểm · 600 đúng · +270 nhanh · +100 ⚡ nhanh nhất)
 */
export function SpeedPointsPop({ base = 0, speed = 0, fastest = 0 }) {
  const b = Number(base) || 0;
  const s = Number(speed) || 0;
  const f = Number(fastest) || 0;
  const total = b + s + f;

  const breakdownParts = [`${b} đúng`];
  if (s > 0) {
    breakdownParts.push(`+${s} nhanh`);
  }
  if (f > 0) {
    breakdownParts.push(`+${f} ⚡ nhanh nhất`);
  }

  return (
    <div
      className="arena-speed-pop"
      role="status"
      aria-live="polite"
      aria-label={`Cộng ${total} điểm: ${breakdownParts.join(', ')}`}
    >
      <div className="arena-speed-pop__bubble arena-mono">+{total} điểm</div>
      <div className="arena-speed-pop__breakdown arena-mono">
        {breakdownParts.join(' · ')}
      </div>
    </div>
  );
}

/**
 * Huy hiệu vinh danh học sinh trả lời đúng hoàn toàn sớm nhất ở chế độ Cùng nhịp + Nhanh tay
 */
export function FastestBadge({ names = [] }) {
  const cleanNames = Array.isArray(names)
    ? names.map((n) => String(n || '').trim()).filter(Boolean)
    : [];

  if (cleanNames.length === 0) return null;

  return (
    <div
      className="arena-fastest-badge"
      role="status"
      aria-live="polite"
    >
      <span className="arena-fastest-badge__icon" aria-hidden="true">
        ⚡
      </span>
      <span>
        Nhanh nhất: <strong>{cleanNames.join(', ')}</strong> (+100 điểm)
      </span>
    </div>
  );
}

/**
 * Thẻ tóm tắt Điểm & Độ chính xác kèm mẫu số chuẩn V6.9.3 ở màn Kết quả / Lịch sử
 */
export function ResultScoreSummary({ me, scoring = 'accuracy' }) {
  if (!me) return null;

  const points = Number(me.points) || 0;
  const accuracySum =
    typeof me.accuracy_sum === 'number'
      ? me.accuracy_sum
      : Number(me.fully_correct ?? me.correct ?? 0);
  const submitted =
    typeof me.submitted === 'number'
      ? me.submitted
      : Number(me.issued ?? me.total ?? 0);
  const issued =
    typeof me.issued === 'number' ? me.issued : Number(me.total ?? submitted);
  const total = Number(me.total) || issued;

  const basePts = Number(me.base_points) || 0;
  const speedPts = Number(me.speed_points) || 0;
  const fastestPts = Number(me.fastest_points) || 0;
  const showSpeedBreakdown =
    scoring === 'speed' || speedPts > 0 || fastestPts > 0;

  return (
    <div
      className="arena-card arena-score-summary"
      role="region"
      aria-label="Tóm tắt điểm số và độ chính xác của em"
    >
      <div className="arena-score-summary__grid">
        {/* Cột 1: Tổng điểm */}
        <div className="arena-score-summary__metric">
          <span className="arena-score-summary__label">Tổng điểm của em</span>
          <div className="arena-score-summary__value arena-mono">
            {points} điểm
          </div>
          {showSpeedBreakdown && (
            <div className="arena-score-summary__sub arena-mono">
              {basePts} điểm đúng · +{speedPts} tốc độ
              {fastestPts > 0 ? ` · +${fastestPts} ⚡ nhanh nhất` : ''}
            </div>
          )}
        </div>

        {/* Cột 2: Độ chính xác kèm mẫu số */}
        <div className="arena-score-summary__metric">
          <span className="arena-score-summary__label">Độ chính xác</span>
          <div className="arena-score-summary__value arena-mono">
            {formatDecimalOne(accuracySum)}/{submitted} câu đã làm
          </div>
          <div className="arena-score-summary__sub arena-mono">
            đã làm {issued}/{total} câu
            {typeof me.fully_correct === 'number'
              ? ` · đúng trọn vẹn ${me.fully_correct} câu`
              : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
