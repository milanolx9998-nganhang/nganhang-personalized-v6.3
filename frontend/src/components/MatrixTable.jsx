import { useMemo } from 'react';

const LEVELS = ['M1', 'M2', 'M3', 'M4'];
const LEVEL_LABEL = { M1: 'NB', M2: 'TH', M3: 'VD', M4: 'VDC' };
const LEVEL_FULL = { M1: 'Nhận biết', M2: 'Thông hiểu', M3: 'Vận dụng', M4: 'Vận dụng cao' };
const TYPE_LABEL = { mcq4: 'TN', true_false: 'ĐS', short: 'TLN', matching:'GN', essay: 'TL' };

export default function MatrixTable({ cells, branches, totalScore, ratios, onToggleLock, onUpdateCell }) {
  const branchList = useMemo(() => {
    if (branches && branches.length > 0) return branches;
    // Không có branch (môn đơn): dùng 1 branch giả
    return [{ id: null, code: null, name: 'Toàn bộ', color: '#6366f1' }];
  }, [branches]);

  // Group cells theo (branch_id, cognitive_level)
  const grid = useMemo(() => {
    const map = {};
    for (const br of branchList) {
      map[br.id || '_none'] = {};
      for (const lv of LEVELS) map[br.id || '_none'][lv] = [];
    }
    for (const c of cells) {
      const key = c.branch_id || '_none';
      if (!map[key]) continue;
      if (!map[key][c.cognitive_level]) continue;
      map[key][c.cognitive_level].push(c);
    }
    return map;
  }, [cells, branchList]);

  // Tổng điểm theo cột mức độ
  const colTotals = useMemo(() => {
    const t = { M1: 0, M2: 0, M3: 0, M4: 0 };
    for (const c of cells) {
      t[c.cognitive_level] = (t[c.cognitive_level] || 0) + c.question_count * c.score_per_question;
    }
    return t;
  }, [cells]);

  // Tổng điểm theo phân môn
  const rowTotals = useMemo(() => {
    const t = {};
    for (const c of cells) {
      const key = c.branch_id || '_none';
      t[key] = (t[key] || 0) + c.question_count * c.score_per_question;
    }
    return t;
  }, [cells]);

  const grandTotal = Object.values(colTotals).reduce((a, b) => a + b, 0);

  return (
    <div className="matrix-table-wrap">
      <div className="row space-between" style={{ marginBottom: 10 }}>
        <strong>📋 Bảng ma trận · Bấm 🔒 để khóa ô không đổi khi tái phân bổ</strong>
        <span className={grandTotal === totalScore ? 'badge success' : 'badge danger'}>
          Tổng: {grandTotal.toFixed(2)}đ / {totalScore}đ {grandTotal === totalScore ? '✓' : '⚠'}
        </span>
      </div>
      <table className="matrix-table">
        <thead>
          <tr>
            <th className="branch-col">Phân môn</th>
            {LEVELS.map((lv, i) => (
              <th key={lv}>
                <div>{LEVEL_LABEL[lv]}</div>
                <small style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>
                  {LEVEL_FULL[lv]} ({ratios[i]}%)
                </small>
              </th>
            ))}
            <th>Điểm</th>
          </tr>
        </thead>
        <tbody>
          {branchList.map(br => {
            const key = br.id || '_none';
            const rowSum = rowTotals[key] || 0;
            return (
              <tr key={key}>
                <td className="branch-col" style={br.color ? { borderLeft: `4px solid ${br.color}` } : {}}>
                  <span style={{ color: br.color }}>{br.name}</span>
                </td>
                {LEVELS.map(lv => {
                  const items = grid[key]?.[lv] || [];
                  return (
                    <td key={lv}>
                      {items.length === 0 ? <span style={{ color: 'var(--text-light)' }}>—</span> :
                        items.map((c, idx) => (
                          <div key={`${c.id || c.q_type}-${idx}`} className={`matrix-cell-item ${c.is_locked ? 'locked' : ''}`}>
                            <button type="button" className="lock-btn" onClick={() => onToggleLock?.(c)} title={c.is_locked ? 'Đã khóa — bấm để mở' : 'Bấm để khóa'}>
                              {c.is_locked ? '🔒' : '🔓'}
                            </button>
                            {c.q_type === 'essay' ? (
                              <>
                                <input
                                  type="number" step="0.25" min="0.25"
                                  value={c.score_per_question}
                                  onChange={e => onUpdateCell?.(c, { score_per_question: parseFloat(e.target.value) || 0.25 })}
                                  disabled={!c.is_locked}
                                  style={{ width: 42 }}
                                />
                                <span>đ TL</span>
                              </>
                            ) : (
                              <>
                                <input
                                  type="number" min="1" step="1"
                                  value={c.question_count}
                                  onChange={e => onUpdateCell?.(c, { question_count: parseInt(e.target.value) || 1 })}
                                  disabled={!c.is_locked}
                                />
                                <span>{TYPE_LABEL[c.q_type]} ({(c.question_count * c.score_per_question).toFixed(2)}đ)</span>
                              </>
                            )}
                          </div>
                        ))
                      }
                    </td>
                  );
                })}
                <td style={{ fontWeight: 600 }}>{rowSum.toFixed(2)}đ</td>
              </tr>
            );
          })}
          <tr className="matrix-totals">
            <td className="branch-col">TỔNG</td>
            {LEVELS.map((lv, i) => (
              <td key={lv}>
                {colTotals[lv]?.toFixed(2)}đ
                <div className="pct">
                  Mục tiêu {((totalScore * ratios[i]) / 100).toFixed(2)}đ · Chênh {(colTotals[lv]-totalScore*ratios[i]/100).toFixed(2)}đ
                </div>
              </td>
            ))}
            <td className={grandTotal === totalScore ? 'badge success' : 'badge danger'}>
              {grandTotal.toFixed(2)}đ
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
