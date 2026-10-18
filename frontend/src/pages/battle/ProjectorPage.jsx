import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { Rich } from '../practice/Rich.jsx';
import { battleApi, formatRoomCode } from './battleApi.js';
import { useBattleStream } from './useBattleStream.js';

import ConnectionBanner from './components/ConnectionBanner.jsx';
import CountdownOverlay from './components/CountdownOverlay.jsx';
import ScopeLabel from './components/ScopeLabel.jsx';
import { QuestionSolutionDetail } from './components/RevealPanel.jsx';

const MC_SHAPES = { A: '▲', B: '●', C: '■', D: '◆' };
const MC_COLOR_CLASSES = {
  A: 'arena-option-btn--A',
  B: 'arena-option-btn--B',
  C: 'arena-option-btn--C',
  D: 'arena-option-btn--D',
};

const START_REASON_LABELS = {
  not_enough_players: 'Cần có ít nhất 1 học sinh vào phòng để bắt đầu.',
  scope_not_selected: 'Phòng đấu chưa có nội dung câu hỏi.',
  battle_disabled: 'Hệ thống Đấu hiện đang tạm ngưng tạo ván mới.',
};

function translateStartReason(reason) {
  if (!reason) return '';
  return START_REASON_LABELS[reason] || String(reason);
}

/**
 * Tạo ma trận QR 13x13 giả lập bằng SVG từ mã phòng 6 chữ số (dùng trang trí trực quan trên máy chiếu).
 */
function DecorativeQrSvg({ code }) {
  const cells = useMemo(() => {
    const clean = String(code || '482910').replace(/\D/g, '') || '482910';
    let seed = 2166136261;
    for (let i = 0; i < clean.length; i += 1) {
      seed ^= clean.charCodeAt(i);
      seed = Math.imul(seed, 16777619);
    }

    const size = 13;
    const grid = [];

    const isFinder = (r, c) => {
      const inTL = r < 4 && c < 4;
      const inTR = r < 4 && c >= size - 4;
      const inBL = r >= size - 4 && c < 4;
      return inTL || inTR || inBL;
    };

    const drawFinderBit = (r, c, topR, leftC) => {
      const lr = r - topR;
      const lc = c - leftC;
      if (lr === 3 || lc === 3) return false; // viền trắng phân cách
      if (lr === 0 || lr === 2 || lc === 0 || lc === 2) return true;
      if (lr === 1 && lc === 1) return true;
      return false;
    };

    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        let on = false;
        if (isFinder(r, c)) {
          if (r < 4 && c < 4) on = drawFinderBit(r, c, 0, 0);
          else if (r < 4 && c >= size - 4) on = drawFinderBit(r, c, 0, size - 3);
          else if (r >= size - 4 && c < 4) on = drawFinderBit(r, c, size - 3, 0);
        } else {
          seed ^= (r * 31 + c * 17) & 0xff;
          seed = Math.imul(seed, 16777619);
          on = (Math.abs(seed) % 10) < 5;
        }
        if (on) {
          grid.push({ key: `${r}-${c}`, x: c + 1, y: r + 1 });
        }
      }
    }
    return grid;
  }, [code]);

  return (
    <svg
      className="arena-proj-qr-svg"
      viewBox="0 0 15 15"
      role="img"
      aria-label={`Mã trang trí phòng ${formatRoomCode(code)}. Học sinh nhập mã 6 số để vào phòng.`}
    >
      <rect x="0" y="0" width="15" height="15" rx="1.2" fill="#FFFFFF" />
      {cells.map((cell) => (
        <rect
          key={cell.key}
          x={cell.x}
          y={cell.y}
          width="0.92"
          height="0.92"
          rx="0.15"
          fill="#153F57"
        />
      ))}
    </svg>
  );
}

/**
 * Đồng hồ tròn SVG cỡ lớn trên màn chiếu
 */
function CircularProjectorTimer({ remainingSec, totalSeconds, isPaused }) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const safeTotal = Math.max(1, totalSeconds);
  const ratio = Math.min(1, Math.max(0, remainingSec / safeTotal));
  const strokeDashoffset = circumference * (1 - ratio);

  let strokeColor = '#F5B82E';
  if (remainingSec <= 5) {
    strokeColor = '#FF5A4E';
  } else if (remainingSec <= 10) {
    strokeColor = '#FFA726';
  }

  return (
    <div
      className="arena-proj-clock"
      role="timer"
      aria-live="off"
      aria-label={
        isPaused
          ? `Đang tạm dừng ở ${remainingSec} giây`
          : `Còn ${remainingSec} giây`
      }
    >
      <svg className="arena-proj-clock__svg" viewBox="0 0 120 120">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="10"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dashoffset 0.15s linear, stroke 0.25s ease' }}
        />
      </svg>
      <div className="arena-proj-clock__center">
        <span className="arena-proj-clock__num arena-mono">{remainingSec}</span>
        <span className="arena-proj-clock__unit">
          {isPaused ? 'TẠM DỪNG' : 'GIÂY'}
        </span>
      </div>
    </div>
  );
}

export default function ProjectorPage() {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [streamEnabled, setStreamEnabled] = useState(true);
  const [fallbackResult, setFallbackResult] = useState(null);
  const [loadingFallback, setLoadingFallback] = useState(false);
  const [optionsCatalog, setOptionsCatalog] = useState(null);

  const [showTop3, setShowTop3] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [remainingMs, setRemainingMs] = useState(null);
  const [expandedQuestionIdx, setExpandedQuestionIdx] = useState(null);

  const {
    snapshot: streamSnapshot,
    status: streamStatus,
    stopReason,
    offsetMs,
    applyExternalSnapshot,
  } = useBattleStream(
    roomId ? `/api/battle/rooms/${encodeURIComponent(roomId)}/stream` : null,
    { enabled: streamEnabled }
  );

  const snapshot = streamSnapshot || fallbackResult;

  // Nếu ván đã kết thúc và luồng đóng, nạp kết quả từ GET /rooms/:id/result
  useEffect(() => {
    if (!roomId) return undefined;
    if (streamStatus === 'stopped' && !streamSnapshot && !fallbackResult && !loadingFallback) {
      let cancelled = false;
      setLoadingFallback(true);
      battleApi
        .getRoomResult(roomId)
        .then((res) => {
          if (!cancelled && res) setFallbackResult(res);
        })
        .catch((err) => {
          if (!cancelled && !stopReason?.message) {
            setErrorMsg(err?.message || 'Không tải được dữ liệu phòng chiếu.');
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingFallback(false);
        });
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [roomId, streamStatus, streamSnapshot, fallbackResult, loadingFallback, stopReason]);

  // Ngắt SSE khi ván đã sang pha kết thúc
  useEffect(() => {
    const phase = snapshot?.phase;
    if (phase === 'finished' || phase === 'interrupted' || phase === 'closed') {
      setStreamEnabled(false);
    }
  }, [snapshot?.phase]);

  // Kiểm tra quyền: Người không phải chủ phòng hoặc không phải phòng 'class' -> chuyển về RoomPage
  useEffect(() => {
    if (!snapshot || !user) return;
    const isRoomHost = Number(snapshot.host_id) === Number(user.id);
    const isClassRoom = snapshot.kind === 'class';
    if (!isRoomHost || !isClassRoom) {
      navigate(`/practice/battle/rooms/${encodeURIComponent(roomId)}`, {
        replace: true,
      });
    }
  }, [snapshot, user, roomId, navigate]);

  // Nạp danh mục /options để dịch ScopeLabel
  useEffect(() => {
    if (!snapshot?.scope?.subject_id) return undefined;
    let cancelled = false;
    const params = {
      count: snapshot.question_count || 7,
      subject_id: snapshot.scope.subject_id,
    };
    if (snapshot.class_id) {
      params.class_id = snapshot.class_id;
    }
    battleApi
      .getOptions(params)
      .then((res) => {
        if (!cancelled) setOptionsCatalog(res);
      })
      .catch(() => {
        // Bỏ qua nếu không tải được
      });
    return () => {
      cancelled = true;
    };
  }, [snapshot?.scope?.subject_id, snapshot?.class_id, snapshot?.question_count]);

  // Theo dõi trạng thái Fullscreen của trình duyệt
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Đồng hồ đếm ngược câu hỏi theo giờ máy chủ
  useEffect(() => {
    const phase = snapshot?.phase;
    const deadline = snapshot?.deadline;
    if ((phase !== 'question' && phase !== 'closing') || typeof deadline !== 'number') {
      if (phase !== 'paused') {
        setRemainingMs(null);
      }
      return undefined;
    }

    const updateClock = () => {
      const serverNow = Date.now() + offsetMs;
      const left = Math.max(0, deadline - serverNow);
      setRemainingMs(left);
    };

    updateClock();
    const id = setInterval(updateClock, 100);
    return () => clearInterval(id);
  }, [snapshot?.phase, snapshot?.deadline, offsetMs]);

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      setErrorMsg('Trình duyệt không cho phép bật chế độ toàn màn hình tự động.');
    }
  };

  const handleCopyCode = async () => {
    if (!snapshot?.code) return;
    try {
      await navigator.clipboard.writeText(String(snapshot.code).replace(/\s+/g, ''));
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setErrorMsg('Không thể sao chép tự động, thầy cô hãy đọc mã trên màn hình.');
    }
  };

  const handleStartClassRoom = async () => {
    if (!roomId || busyAction) return;
    setBusyAction(true);
    setErrorMsg('');
    try {
      const res = await battleApi.startRoom(roomId, { show_top3: showTop3 });
      if (res && typeof res === 'object' && res.phase) {
        applyExternalSnapshot(res);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Chưa thể bắt đầu ván đấu của lớp.');
    } finally {
      setBusyAction(false);
    }
  };

  const handlePause = async () => {
    if (!roomId || busyAction) return;
    setBusyAction(true);
    setErrorMsg('');
    try {
      const res = await battleApi.pauseRoom(roomId);
      if (res && typeof res === 'object' && res.phase) {
        applyExternalSnapshot(res);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Không thể tạm dừng câu hỏi lúc này.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleResume = async () => {
    if (!roomId || busyAction) return;
    setBusyAction(true);
    setErrorMsg('');
    try {
      const res = await battleApi.resumeRoom(roomId);
      if (res && typeof res === 'object' && res.phase) {
        applyExternalSnapshot(res);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Không thể tiếp tục câu hỏi.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleNextQuestion = async () => {
    if (!roomId || busyAction) return;
    setBusyAction(true);
    setErrorMsg('');
    try {
      const res = await battleApi.nextQuestion(roomId);
      if (res && typeof res === 'object' && res.phase) {
        applyExternalSnapshot(res);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Chưa thể chuyển sang câu tiếp theo.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleConfirmEndRoom = async () => {
    if (!roomId || busyAction) return;
    setBusyAction(true);
    setErrorMsg('');
    try {
      const res = await battleApi.endRoom(roomId);
      setConfirmEndOpen(false);
      if (res && typeof res === 'object' && res.phase) {
        applyExternalSnapshot(res);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Không thể kết thúc ván đấu lúc này.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleLeaveClassLobby = async () => {
    if (!roomId || busyAction) return;
    setBusyAction(true);
    try {
      await battleApi.leaveRoom(roomId);
    } catch {
      // Cho phép quay về sảnh kể cả khi phòng đã đóng
    } finally {
      setBusyAction(false);
      navigate('/practice/battle');
    }
  };

  const handleRematchClass = async () => {
    if (!roomId || busyAction) return;
    setBusyAction(true);
    setErrorMsg('');
    try {
      const newRoom = await battleApi.rematch(roomId);
      if (newRoom?.id) {
        navigate(
          `/practice/battle/rooms/${encodeURIComponent(newRoom.id)}/projector`
        );
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Không tạo được phòng đấu mới.');
    } finally {
      setBusyAction(false);
    }
  };

  // Trạng thái đang kết nối ban đầu
  if (!snapshot && (streamStatus === 'connecting' || loadingFallback)) {
    return (
      <div className="arena-proj-page">
        <div className="arena-proj-stage">
          <div className="arena-proj-center-box">
            <div
              className="arena-spinner"
              style={{ width: '40px', height: '40px', margin: '0 auto 16px' }}
            />
            <h1 className="arena-proj-title">Đang chuẩn bị màn chiếu lớp học…</h1>
          </div>
        </div>
      </div>
    );
  }

  if (!snapshot && streamStatus === 'stopped') {
    return (
      <div className="arena-proj-page">
        <ConnectionBanner status={streamStatus} stopReason={stopReason} />
        <div className="arena-proj-stage">
          <div className="arena-proj-center-box">
            <h1 className="arena-proj-title">Không mở được màn chiếu</h1>
            <p className="arena-proj-subtitle">
              {stopReason?.message || errorMsg || 'Phòng đấu không tồn tại hoặc đã đóng.'}
            </p>
            <div style={{ marginTop: '24px' }}>
              <Link to="/practice/battle" className="arena-btn arena-btn--amber arena-btn--lg">
                Về sảnh Đấu
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const phase = snapshot?.phase;
  const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
  const playerCount =
    typeof snapshot?.player_count === 'number'
      ? snapshot.player_count
      : players.length;
  const answeredCount =
    typeof snapshot?.answered_count === 'number' ? snapshot.answered_count : 0;

  const question = snapshot?.question;
  const totalSeconds = Number(snapshot?.seconds) || 30;
  const remainingSec =
    remainingMs !== null
      ? Math.ceil(remainingMs / 1000)
      : typeof snapshot?.remaining_ms === 'number'
      ? Math.ceil(snapshot.remaining_ms / 1000)
      : totalSeconds;

  const canPauseNow =
    phase === 'question' && (remainingMs === null || remainingMs > 0);

  const startReasons = Array.isArray(snapshot?.start_reasons)
    ? snapshot.start_reasons
    : [];
  const canStartLobby = startReasons.length === 0;

  // Render phân bố đáp án của cả lớp (dùng ở pha reveal)
  const renderProjectorDistribution = (qItem, distData) => {
    const dist = distData || {};
    if (!qItem) return null;

    if (qItem.type === 'multiple_choice') {
      const options = Array.isArray(qItem.options) ? qItem.options : [];
      const letters = ['A', 'B', 'C', 'D'];
      const rows = options.map((opt, idx) => {
        const key = String(opt.id ?? letters[idx]);
        const count = Number(
          dist[key] ?? dist.options?.[key] ?? dist.counts?.[key] ?? 0
        );
        return {
          key,
          letter: letters[idx] || key,
          text: opt.text || opt.label || '',
          count,
        };
      });
      const total = Math.max(
        1,
        rows.reduce((sum, r) => sum + r.count, 0)
      );
      const correctKey =
        qItem.answer !== undefined && qItem.answer !== null
          ? String(qItem.answer)
          : null;

      return (
        <div className="arena-proj-dist-list">
          {rows.map((r) => {
            const pct = Math.round((r.count / total) * 100);
            const isCorrect = correctKey === r.key;
            return (
              <div
                key={r.key}
                className={`arena-proj-dist-row ${
                  isCorrect ? 'arena-proj-dist-row--correct' : ''
                }`}
              >
                <div className="arena-proj-dist-row__head">
                  <span className="arena-proj-dist-row__badge arena-mono">
                    {r.letter} {MC_SHAPES[r.letter] || ''}{' '}
                    {isCorrect ? '✓ ĐÁP ÁN ĐÚNG' : ''}
                  </span>
                  <span className="arena-proj-dist-row__stat arena-mono">
                    {r.count} học sinh ({pct}%)
                  </span>
                </div>
                <div className="arena-proj-dist-row__track">
                  <div
                    className={`arena-proj-dist-row__fill ${
                      isCorrect ? 'arena-proj-dist-row__fill--correct' : ''
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    const buckets = [
      {
        key: 'correct',
        label: '✓ Đúng hoàn toàn',
        count: Number(dist.correct ?? dist.full ?? 0),
        correct: true,
      },
      {
        key: 'partial',
        label: '◐ Đúng một phần',
        count: Number(dist.partial ?? 0),
        correct: false,
      },
      {
        key: 'wrong',
        label: '✕ Chưa đúng',
        count: Number(dist.wrong ?? dist.incorrect ?? 0),
        correct: false,
      },
      {
        key: 'empty',
        label: '— Bỏ trống / Chưa chốt',
        count: Number(dist.empty ?? dist.unanswered ?? dist.skipped ?? 0),
        correct: false,
      },
    ];
    const total = Math.max(
      1,
      buckets.reduce((sum, b) => sum + b.count, 0)
    );

    return (
      <div className="arena-proj-dist-list">
        {buckets.map((b) => {
          const pct = Math.round((b.count / total) * 100);
          return (
            <div
              key={b.key}
              className={`arena-proj-dist-row ${
                b.correct ? 'arena-proj-dist-row--correct' : ''
              }`}
            >
              <div className="arena-proj-dist-row__head">
                <span className="arena-proj-dist-row__badge">{b.label}</span>
                <span className="arena-proj-dist-row__stat arena-mono">
                  {b.count} học sinh ({pct}%)
                </span>
              </div>
              <div className="arena-proj-dist-row__track">
                <div
                  className={`arena-proj-dist-row__fill ${
                    b.correct ? 'arena-proj-dist-row__fill--correct' : ''
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Render nội dung câu hỏi ở pha question/paused (KHÔNG hiển thị đáp án đúng)
  const renderProjectorQuestionPreview = (qItem) => {
    if (!qItem) return null;

    if (qItem.type === 'multiple_choice') {
      const options = Array.isArray(qItem.options) ? qItem.options : [];
      const letters = ['A', 'B', 'C', 'D'];
      return (
        <div className="arena-proj-options-grid">
          {options.map((opt, idx) => {
            const letter = letters[idx] || String(opt.id || idx + 1);
            const shape = MC_SHAPES[letter] || '●';
            const colorClass = MC_COLOR_CLASSES[letter] || 'arena-option-btn--A';
            return (
              <div
                key={opt.id ?? letter}
                className={`arena-proj-option-card ${colorClass}`}
              >
                <span className="arena-proj-option-badge arena-mono" aria-hidden="true">
                  <span>{letter}</span>
                  <span>{shape}</span>
                </span>
                <div className="arena-proj-option-text">
                  <Rich text={opt.text || opt.label || ''} />
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (qItem.type === 'true_false') {
      const statements = Array.isArray(qItem.statements) ? qItem.statements : [];
      return (
        <div className="arena-proj-tf-list">
          {statements.map((st, idx) => {
            const stId = String(st.id ?? String.fromCharCode(97 + idx));
            return (
              <div key={stId} className="arena-proj-tf-item">
                <span className="arena-proj-tf-item__idx arena-mono">
                  {st.label || `${stId})`}
                </span>
                <div className="arena-proj-tf-item__text">
                  <Rich text={st.text || st.stem || ''} />
                </div>
                <span className="arena-chip arena-chip--amber">Đúng / Sai</span>
              </div>
            );
          })}
        </div>
      );
    }

    if (qItem.type === 'short_answer') {
      return (
        <div className="arena-proj-prompt-banner">
          <span>✍️ Học sinh nhập câu trả lời ngắn trên thiết bị cá nhân</span>
          {qItem.unit && (
            <span className="arena-chip arena-chip--amber arena-mono">
              Đơn vị: {qItem.unit}
            </span>
          )}
        </div>
      );
    }

    if (qItem.type === 'matching') {
      const leftItems = Array.isArray(qItem.left) ? qItem.left : [];
      const rightItems = Array.isArray(qItem.right) ? qItem.right : [];
      return (
        <div className="arena-proj-matching-grid">
          <div className="arena-proj-matching-col">
            <h3 className="arena-proj-matching-title">Cột A</h3>
            {leftItems.map((item, idx) => (
              <div key={item.id ?? idx} className="arena-proj-matching-card">
                <strong className="arena-mono">{item.label || `${idx + 1}.`}</strong>
                <div>
                  <Rich text={item.text || ''} />
                </div>
              </div>
            ))}
          </div>
          <div className="arena-proj-matching-col">
            <h3 className="arena-proj-matching-title">Cột B</h3>
            {rightItems.map((item, idx) => (
              <div
                key={item.id ?? idx}
                className="arena-proj-matching-card"
              >
                <strong className="arena-mono">
                  {item.label || `${String.fromCharCode(65 + idx)}.`}
                </strong>
                <div>
                  <Rich text={item.text || ''} />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="arena-proj-page">
      <ConnectionBanner status={streamStatus} stopReason={stopReason} />

      {phase === 'countdown' && <CountdownOverlay />}

      {/* Hộp xác nhận Kết thúc sớm ván đấu */}
      {confirmEndOpen && (
        <div
          className="arena-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="arena-proj-end-title"
        >
          <div className="arena-sheet" style={{ maxWidth: '460px' }}>
            <div className="arena-sheet__header">
              <h3 id="arena-proj-end-title" className="arena-title-md">
                Kết thúc ván đấu của lớp?
              </h3>
            </div>
            <div className="arena-sheet__body">
              <p style={{ margin: 0 }}>
                Ván đấu sẽ dừng ngay lập tức và tổng kết kết quả dựa trên những câu học sinh đã trả lời.
              </p>
            </div>
            <div className="arena-sheet__footer">
              <button
                type="button"
                className="arena-btn arena-btn--secondary"
                onClick={() => setConfirmEndOpen(false)}
                disabled={busyAction}
              >
                Huỷ
              </button>
              <button
                type="button"
                className="arena-btn arena-btn--danger"
                onClick={handleConfirmEndRoom}
                disabled={busyAction}
              >
                {busyAction ? 'Đang kết thúc…' : 'Xác nhận kết thúc'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="arena-proj-stage">
        {/* Thanh đỉnh màn chiếu */}
        <header className="arena-proj-topbar">
          <div className="arena-proj-topbar__left">
            <span className="arena-chip arena-chip--amber">
              MÀN CHIẾU LỚP HỌC
            </span>
            <span className="arena-proj-topbar__scope">
              <ScopeLabel scope={snapshot.scope} options={optionsCatalog} />
            </span>
            <span className="arena-chip arena-mono">
              {snapshot.question_count || 7} câu · {snapshot.seconds || 30}s/câu
            </span>
          </div>

          <div className="arena-proj-topbar__right">
            {snapshot.code && phase !== 'lobby' && (
              <span className="arena-proj-mini-code arena-mono">
                Mã: <strong>{formatRoomCode(snapshot.code)}</strong>
              </span>
            )}

            <button
              type="button"
              className="arena-btn arena-btn--ghost-light arena-btn--sm"
              onClick={handleToggleFullscreen}
            >
              {isFullscreen ? 'Thu nhỏ màn hình' : '⛶ Toàn màn hình'}
            </button>

            {phase === 'lobby' && (
              <button
                type="button"
                className="arena-btn arena-btn--danger-outline arena-btn--sm"
                onClick={handleLeaveClassLobby}
                disabled={busyAction}
              >
                Đóng phòng
              </button>
            )}

            {(phase === 'question' || phase === 'paused' || phase === 'reveal') && (
              <button
                type="button"
                className="arena-btn arena-btn--danger arena-btn--sm"
                onClick={() => setConfirmEndOpen(true)}
                disabled={busyAction}
              >
                Kết thúc
              </button>
            )}
          </div>
        </header>

        <div className="arena-finish-strip arena-finish-strip--thin" aria-hidden="true" />

        {errorMsg && (
          <div className="arena-alert arena-alert--error" role="alert" style={{ marginTop: '12px' }}>
            <span>{errorMsg}</span>
            <button
              type="button"
              className="arena-btn arena-btn--sm arena-btn--secondary"
              onClick={() => setErrorMsg('')}
            >
              Đóng
            </button>
          </div>
        )}

        {/* ===== 1. PHA PHÒNG CHỜ TRÊN MÀN CHIẾU (lobby) ===== */}
        {phase === 'lobby' && (
          <main className="arena-proj-lobby">
            <div className="arena-proj-lobby__join-panel">
              <span className="arena-proj-join-eyebrow">
                VÀO TAB &ldquo;ĐẤU&rdquo; · NHẬP MÃ PHÒNG 6 SỐ
              </span>
              <div
                className="arena-proj-huge-code arena-mono"
                aria-label={`Mã phòng ${snapshot.code}`}
              >
                Mã {formatRoomCode(snapshot.code)}
              </div>

              <div className="arena-proj-qr-row">
                <DecorativeQrSvg code={snapshot.code} />
                <div className="arena-proj-qr-caption">
                  <p style={{ margin: '0 0 10px' }}>
                    Học sinh mở ứng dụng luyện tập và nhập đúng mã 6 chữ số trên màn hình.
                  </p>
                  <button
                    type="button"
                    className="arena-btn arena-btn--ghost-light"
                    onClick={handleCopyCode}
                  >
                    {copiedCode ? '✓ Đã sao chép mã' : 'Sao chép mã phòng'}
                  </button>
                </div>
              </div>

              {/* Công tắc Hiện top 3 cuối ván & Nút Bắt đầu */}
              <div className="arena-proj-start-box">
                <label className="arena-proj-toggle">
                  <input
                    type="checkbox"
                    checked={showTop3}
                    onChange={(e) => setShowTop3(e.target.checked)}
                  />
                  <span>Hiện bục vinh danh Top 3 vào cuối ván đấu</span>
                </label>

                <button
                  type="button"
                  className="arena-btn arena-btn--amber arena-btn--lg arena-proj-start-btn"
                  onClick={handleStartClassRoom}
                  disabled={!canStartLobby || busyAction}
                >
                  {busyAction ? 'Đang bắt đầu…' : '▶ Bắt đầu ván đấu'}
                </button>

                {startReasons.length > 0 && (
                  <div className="arena-proj-reasons" role="status" aria-live="polite">
                    {startReasons.map((r, idx) => (
                      <div key={idx}>• {translateStartReason(r)}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="arena-proj-lobby__roster-panel">
              <div className="arena-proj-roster-header">
                <div className="arena-row" style={{ gap: '10px' }}>
                  <span className="arena-pulse-dot arena-pulse-dot--amber" aria-hidden="true" />
                  <h2 className="arena-proj-roster-count arena-mono">
                    {playerCount} học sinh đã vào phòng
                  </h2>
                </div>
                <span className="arena-chip arena-chip--amber">
                  Đúng là chính
                </span>
              </div>

              {players.length === 0 ? (
                <div className="arena-proj-empty-roster">
                  <p>Đang chờ học sinh trong lớp nhập mã vào phòng…</p>
                </div>
              ) : (
                <div className="arena-proj-roster-grid" aria-live="polite">
                  {players.map((p) => (
                    <div key={p.id} className="arena-proj-student-chip">
                      <span className="arena-proj-student-chip__avatar arena-mono" aria-hidden="true">
                        {String(p.name || '?').slice(0, 1).toUpperCase()}
                      </span>
                      <span className="arena-proj-student-chip__name">{p.name}</span>
                      {p.class_name && (
                        <span className="arena-proj-student-chip__class">
                          {p.class_name}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        )}

        {/* ===== 2. PHA CÂU HỎI / TẠM DỪNG TRÊN MÀN CHIẾU (question / paused / closing) ===== */}
        {(phase === 'question' || phase === 'paused' || phase === 'closing') && (
          <main className="arena-proj-question-main">
            <div className="arena-proj-question-Hud">
              <div className="arena-row" style={{ gap: '12px' }}>
                <span className="arena-proj-q-badge arena-mono">
                  Câu {(question?.index ?? 0) + 1}/
                  {question?.total || snapshot.question_count || 7}
                </span>
                {question?.topic_name && (
                  <span className="arena-proj-topic-badge">
                    {question.topic_name}
                  </span>
                )}
              </div>

              <div className="arena-proj-hud-center">
                <CircularProjectorTimer
                  remainingSec={remainingSec}
                  totalSeconds={totalSeconds}
                  isPaused={phase === 'paused'}
                />
              </div>

              <div className="arena-proj-answered-counter" aria-live="polite">
                <span className="arena-proj-answered-counter__num arena-mono">
                  {answeredCount}/{playerCount}
                </span>
                <span className="arena-proj-answered-counter__label">
                  bạn đã trả lời
                </span>
              </div>
            </div>

            {phase === 'paused' && (
              <div className="arena-proj-paused-banner" role="status" aria-live="polite">
                ⏸ Đang tạm dừng câu hỏi — Học sinh tạm thời không thể chốt đáp án.
              </div>
            )}

            {/* Nội dung đề bài lớn */}
            {question && (
              <div className="arena-proj-question-body">
                <div className="arena-proj-stem">
                  <Rich text={question.stem || ''} />
                </div>

                {Array.isArray(question.blocks) && question.blocks.length > 0 && (
                  <div className="arena-proj-blocks">
                    {question.blocks.map((block, bIdx) => {
                      if (block.type === 'paragraph') {
                        return (
                          <div key={bIdx} className="arena-proj-block-p">
                            <Rich text={block.text || block.content || ''} />
                          </div>
                        );
                      }
                      if (block.type === 'table') {
                        const headers = Array.isArray(block.headers) ? block.headers : [];
                        const rows = Array.isArray(block.rows) ? block.rows : [];
                        return (
                          <div key={bIdx} className="arena-table-scroll">
                            <table className="arena-question-table arena-proj-table">
                              {headers.length > 0 && (
                                <thead>
                                  <tr>
                                    {headers.map((h, hIdx) => (
                                      <th key={hIdx}>
                                        <Rich text={String(h ?? '')} />
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                              )}
                              <tbody>
                                {rows.map((row, rIdx) => (
                                  <tr key={rIdx}>
                                    {(Array.isArray(row) ? row : []).map((cell, cIdx) => (
                                      <td key={cIdx}>
                                        <Rich text={String(cell ?? '')} />
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}

                {renderProjectorQuestionPreview(question)}
              </div>
            )}

            {/* Thanh điều khiển của Giáo viên ở chân màn chiếu */}
            <footer className="arena-proj-controls-bar">
              <div className="arena-row" style={{ gap: '12px' }}>
                {phase === 'question' && (
                  <button
                    type="button"
                    className="arena-btn arena-btn--amber arena-btn--lg"
                    onClick={handlePause}
                    disabled={!canPauseNow || busyAction}
                  >
                    ⏸ Tạm dừng
                  </button>
                )}

                {phase === 'paused' && (
                  <button
                    type="button"
                    className="arena-btn arena-btn--amber arena-btn--lg"
                    onClick={handleResume}
                    disabled={busyAction}
                  >
                    ▶ Tiếp tục
                  </button>
                )}
              </div>

              <button
                type="button"
                className="arena-btn arena-btn--ghost-light arena-btn--lg"
                onClick={() => setConfirmEndOpen(true)}
                disabled={busyAction}
              >
                Kết thúc ván đấu
              </button>
            </footer>
          </main>
        )}

        {/* ===== 3. PHA LỜI GIẢI TRÊN MÀN CHIẾU (reveal) ===== */}
        {phase === 'reveal' && (
          <main className="arena-proj-reveal-main">
            <div className="arena-proj-reveal-top">
              <div className="arena-row" style={{ gap: '12px' }}>
                <span className="arena-proj-q-badge arena-mono">
                  Lời giải · Câu {(question?.index ?? 0) + 1}/
                  {question?.total || snapshot.question_count || 7}
                </span>
                {question?.topic_name && (
                  <span className="arena-proj-topic-badge">
                    {question.topic_name}
                  </span>
                )}
              </div>

              <button
                type="button"
                className="arena-btn arena-btn--amber arena-btn--lg"
                onClick={handleNextQuestion}
                disabled={busyAction}
              >
                {busyAction ? 'Đang chuyển…' : 'Câu tiếp →'}
              </button>
            </div>

            <div className="arena-proj-reveal-grid">
              {/* Cột trái: Đề bài + Đáp án đúng + Lời giải */}
              <div className="arena-proj-reveal-col">
                {question && (
                  <div className="arena-proj-light-card">
                    <div className="arena-proj-stem arena-proj-stem--dark" style={{ marginBottom: '16px' }}>
                      <Rich text={question.stem || ''} />
                    </div>

                    <QuestionSolutionDetail
                      question={question}
                      myResponse={null}
                      mySkipped={true}
                    />

                    <div className="arena-proj-explanation-box">
                      <h3 className="arena-title-md" style={{ marginBottom: '6px' }}>
                        💡 Lời giải chi tiết
                      </h3>
                      {question.explanation && String(question.explanation).trim() ? (
                        <div className="arena-proj-explanation-text">
                          <Rich text={question.explanation} />
                        </div>
                      ) : (
                        <p className="arena-subtitle" style={{ margin: 0 }}>
                          Câu này chưa có lời giải
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Cột phải: Phân bố câu trả lời của cả lớp */}
              <div className="arena-proj-reveal-col">
                <div className="arena-proj-dark-panel">
                  <div className="arena-row arena-row--between" style={{ marginBottom: '14px' }}>
                    <h3 className="arena-title-lg" style={{ color: '#FFFFFF' }}>
                      📊 Cả lớp chọn gì
                    </h3>
                    <span className="arena-chip arena-chip--amber arena-mono">
                      Đã trả lời: {answeredCount}/{playerCount}
                    </span>
                  </div>
                  {renderProjectorDistribution(question, snapshot.distribution)}
                </div>
              </div>
            </div>
          </main>
        )}

        {/* ===== 4. PHA TỔNG KẾT KẾT QUẢ LỚP HỌC (finished / interrupted / closed) ===== */}
        {(phase === 'finished' || phase === 'interrupted' || phase === 'closed') && (
          <main className="arena-proj-result-main">
            {phase === 'interrupted' && (
              <div className="arena-alert arena-alert--warn" role="alert">
                <strong>
                  Ván đấu bị gián đoạn ở câu{' '}
                  {snapshot.asked_count ?? (snapshot.questions || []).length}
                </strong>
              </div>
            )}

            <div className="arena-proj-result-header">
              <div>
                <h1 className="arena-proj-title">Tổng kết ván đấu của lớp</h1>
                <p className="arena-proj-subtitle">
                  Đã hoàn thành {(snapshot.questions || []).length} câu hỏi ·{' '}
                  {playerCount > 0 ? `${playerCount} học sinh tham gia` : 'Hoàn tất phiên đấu'}
                </p>
              </div>

              <div className="arena-row" style={{ gap: '12px' }}>
                <button
                  type="button"
                  className="arena-btn arena-btn--amber arena-btn--lg"
                  onClick={handleRematchClass}
                  disabled={busyAction}
                >
                  {busyAction ? 'Đang mở phòng…' : '🔄 Mở lại ván mới'}
                </button>
                <Link
                  to="/practice/battle"
                  className="arena-btn arena-btn--ghost-light arena-btn--lg"
                >
                  Về sảnh giáo viên
                </Link>
              </div>
            </div>

            {/* Podium Top 3 (Chỉ hiển thị khi giáo viên bật show_top3 và máy chủ trả podium) */}
            {Array.isArray(snapshot.podium) && snapshot.podium.length > 0 && (
              <section className="arena-proj-dark-panel" style={{ marginBottom: '20px' }}>
                <h2 className="arena-title-lg" style={{ color: 'var(--arena-amber)', marginBottom: '14px' }}>
                  🏆 Top 3 học sinh dẫn đầu
                </h2>
                <div className="arena-podium-grid">
                  {snapshot.podium.slice(0, 3).map((p, idx) => {
                    const rankNum = p.rank ?? idx + 1;
                    return (
                      <div
                        key={p.id || idx}
                        className={`arena-podium-card arena-podium-card--rank-${rankNum}`}
                      >
                        <div className="arena-podium-card__medal arena-mono">
                          Hạng {rankNum}
                        </div>
                        <div className="arena-podium-card__name">{p.name}</div>
                        {p.class_name && (
                          <div className="arena-podium-card__class">
                            Lớp {p.class_name}
                          </div>
                        )}
                        <div className="arena-podium-card__points arena-mono">
                          {p.points ?? 0} điểm
                        </div>
                        {typeof p.correct === 'number' && (
                          <div className="arena-podium-card__sub">
                            Đúng {p.correct} câu
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Thống kê từng câu hỏi trong ván để giáo viên chữa bài trên lớp */}
            <section className="arena-proj-light-card">
              <h2 className="arena-title-lg" style={{ marginBottom: '14px' }}>
                📋 Thống kê & Chữa câu hỏi tại lớp
              </h2>

              {(!snapshot.questions || snapshot.questions.length === 0) ? (
                <p className="arena-empty-hint">Chưa có câu hỏi nào được phát trong ván này.</p>
              ) : (
                <div className="arena-review-list">
                  {snapshot.questions.map((qItem, idx) => {
                    const qIdx = qItem.index ?? idx;
                    const isOpen = expandedQuestionIdx === qIdx;
                    const qDist = qItem.distribution || null;

                    return (
                      <div key={qIdx} className="arena-review-item">
                        <button
                          type="button"
                          className="arena-review-item__header"
                          aria-expanded={isOpen}
                          onClick={() =>
                            setExpandedQuestionIdx((prev) =>
                              prev === qIdx ? null : qIdx
                            )
                          }
                        >
                          <div className="arena-review-item__title-wrap">
                            <span className="arena-chip arena-chip--accent arena-mono">
                              Câu {qIdx + 1}
                            </span>
                            {qItem.topic_name && (
                              <span className="arena-review-item__topic">
                                {qItem.topic_name}
                              </span>
                            )}
                          </div>
                          <span className="arena-review-item__chevron">
                            {isOpen ? '▲ Thu gọn câu này' : '▼ Chiếu đề & Lời giải'}
                          </span>
                        </button>

                        {isOpen && (
                          <div className="arena-review-item__body">
                            <div
                              className="arena-proj-stem arena-proj-stem--dark"
                              style={{ marginBottom: '14px' }}
                            >
                              <Rich text={qItem.stem || ''} />
                            </div>

                            <QuestionSolutionDetail
                              question={qItem}
                              myResponse={null}
                              mySkipped={true}
                            />

                            {qDist && (
                              <div
                                className="arena-proj-dark-panel"
                                style={{ marginTop: '14px' }}
                              >
                                <h4
                                  className="arena-title-md"
                                  style={{ color: '#FFFFFF', marginBottom: '10px' }}
                                >
                                  Phân bố trả lời của lớp
                                </h4>
                                {renderProjectorDistribution(qItem, qDist)}
                              </div>
                            )}

                            <div className="arena-review-explanation">
                              <strong>💡 Lời giải: </strong>
                              {qItem.explanation && String(qItem.explanation).trim() ? (
                                <Rich text={qItem.explanation} />
                              ) : (
                                <span className="arena-subtitle">
                                  Câu này chưa có lời giải
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </main>
        )}
      </div>
    </div>
  );
}
