import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth.js';
import { Rich } from '../../practice/Rich.jsx';
import {
  battleApi,
  battleApiModes,
  getOrCreateAnswerClientId,
  loadDraftAnswer,
  saveDraftAnswer,
} from '../battleApi.js';
import AnswerInput from './AnswerInput.jsx';
import { QuestionSolutionDetail } from './RevealPanel.jsx';
import { SpeedPointsPop } from './SpeedPoints.jsx';

const SUBMIT_RETRY_DELAYS_MS = [1000, 2000, 4000, 4000, 4000];

function isAnswerEmpty(question, val) {
  if (!question) return true;
  if (val === null || val === undefined) return true;
  switch (question.type) {
    case 'multiple_choice':
      return typeof val !== 'string' || val.trim() === '';
    case 'true_false':
      return typeof val !== 'object' || Object.keys(val).length === 0;
    case 'short_answer':
      if (typeof val === 'object') return !String(val.value ?? '').trim();
      return !String(val).trim();
    case 'matching':
      return typeof val !== 'object' || Object.keys(val).length === 0;
    default:
      return false;
  }
}

function formatMmSs(ms) {
  if (typeof ms !== 'number' || ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function buildSelfModeBadgeText(snapshot) {
  if (!snapshot) return 'Tự chơi';
  const parts = [];
  if (snapshot.time_limit === 'total') {
    parts.push('Thi theo phút');
    if (snapshot.total_minutes) {
      parts.push(`${snapshot.total_minutes} phút`);
    }
  } else {
    parts.push('Tự chơi');
  }
  if (snapshot.scoring === 'speed') {
    parts.push('Nhanh tay');
  }
  if (snapshot.reveal_policy === 'deferred') {
    parts.push('Thi đua');
  } else {
    parts.push('Ôn tập');
  }
  return parts.join(' · ');
}

export default function SelfPacedPlay({
  snapshot,
  roomId,
  offsetMs = 0,
  onError,
}) {
  const { user } = useAuth();

  const myProgress = snapshot?.my_progress || null;
  const question = snapshot?.question || null;
  const myAnswer = snapshot?.my_answer || null;
  const feedback = snapshot?.feedback || null;
  const publicBoard = Array.isArray(snapshot?.public_board)
    ? snapshot.public_board
    : null;

  const cursor = typeof myProgress?.cursor === 'number' ? myProgress.cursor : 0;
  const personalPhase = myProgress?.phase || 'question'; // 'question' | 'feedback' | 'done'
  const totalQuestions =
    Number(question?.total ?? snapshot?.question_count) || 7;
  const issuedCount =
    typeof myProgress?.issued_count === 'number'
      ? myProgress.issued_count
      : Math.min(totalQuestions, cursor + 1);

  const [draftAnswer, setDraftAnswer] = useState(null);
  const [submitState, setSubmitState] = useState('idle'); // 'idle' | 'sending' | 'waiting_snapshot' | 'retry_error'
  const [submitErrorText, setSubmitErrorText] = useState('');
  const [missingTfCount, setMissingTfCount] = useState(0);
  const [busyNext, setBusyNext] = useState(false);
  const [boardExpanded, setBoardExpanded] = useState(false);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const retryTimerRef = useRef(null);
  const activeCursorRef = useRef(null);

  // Đồng hồ nhảy mỗi 150ms khi không bị tạm dừng
  useEffect(() => {
    if (snapshot?.phase === 'paused') return undefined;
    setNowMs(Date.now());
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 150);
    return () => clearInterval(timer);
  }, [snapshot?.phase]);

  // Reset lựa chọn nháp khi sang cursor mới hoặc khi đổi phase cá nhân
  useEffect(() => {
    if (activeCursorRef.current !== cursor) {
      activeCursorRef.current = cursor;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setMissingTfCount(0);
      setSubmitErrorText('');
      setBusyNext(false);

      if (myAnswer?.received) {
        setDraftAnswer(myAnswer.response ?? null);
        setSubmitState('waiting_snapshot');
      } else {
        // F5 giữa câu: đưa lại lựa chọn em đã bấm nhưng chưa chốt
        setDraftAnswer(loadDraftAnswer(roomId, cursor));
        setSubmitState('idle');
      }
      return;
    }

    if (personalPhase === 'feedback' || personalPhase === 'done') {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setSubmitState('idle');
      setSubmitErrorText('');
    } else if (myAnswer?.received && submitState === 'idle') {
      setDraftAnswer(myAnswer.response ?? null);
      setSubmitState('waiting_snapshot');
    }
  }, [cursor, personalPhase, myAnswer, submitState]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  // Tính thời gian còn lại (theo tổng phút ends_at hoặc theo câu my_progress.deadline)
  const serverNow = nowMs + offsetMs;
  const isTotalTimer = snapshot?.time_limit === 'total';
  const targetDeadline = isTotalTimer
    ? snapshot?.ends_at
    : myProgress?.deadline;

  const remainingMs =
    typeof targetDeadline === 'number'
      ? Math.max(0, targetDeadline - serverNow)
      : null;

  const autoNextRemainingSec =
    personalPhase === 'feedback' && typeof myProgress?.auto_next_at === 'number'
      ? Math.max(0, Math.ceil((myProgress.auto_next_at - serverNow) / 1000))
      : null;

  // Gửi câu trả lời kèm retry cùng client_id (UUID) khi lỗi mạng / 503
  const executeSubmit = useCallback(
    async ({ isSkip = false, attempt = 0, payloadOverride = null }) => {
      if (!roomId || question === null) return;
      const qIdx = typeof question.index === 'number' ? question.index : cursor;
      const clientId = getOrCreateAnswerClientId(roomId, qIdx);
      const responseValue =
        payloadOverride !== null ? payloadOverride : draftAnswer;

      setSubmitState('sending');
      setSubmitErrorText('');

      try {
        const ack = await battleApi.submitAnswer(roomId, {
          index: qIdx,
          client_id: clientId,
          response: responseValue,
          skip: isSkip,
        });

        if (activeCursorRef.current !== cursor) return;
        if (ack?.received) {
          // Chờ snapshot SSE đẩy feedback / đổi phase, không tự đoán đúng sai
          setSubmitState('waiting_snapshot');
        }
      } catch (err) {
        if (activeCursorRef.current !== cursor) return;

        // 409 có biên nhận cũ -> coi như đã nhận, chờ snapshot
        if (err?.status === 409 && err?.details?.receipt) {
          setSubmitState('waiting_snapshot');
          return;
        }

        // Hết giờ tổng hoặc câu đã đóng
        if (
          err?.code === 'BATTLE_TOTAL_EXPIRED' ||
          err?.code === 'BATTLE_QUESTION_CLOSED'
        ) {
          setSubmitState('waiting_snapshot');
          if (typeof onError === 'function') {
            onError(err?.message || 'Đã hết thời gian cho câu trả lời này.');
          }
          return;
        }

        const isTransient =
          !err?.status ||
          err.status === 503 ||
          err.status === 502 ||
          err.status === 504;
        if (isTransient && attempt < SUBMIT_RETRY_DELAYS_MS.length) {
          const delay = SUBMIT_RETRY_DELAYS_MS[attempt];
          retryTimerRef.current = setTimeout(() => {
            executeSubmit({
              isSkip,
              attempt: attempt + 1,
              payloadOverride: responseValue,
            });
          }, delay);
          return;
        }

        setSubmitState('retry_error');
        setSubmitErrorText(
          err?.message || 'Chưa gửi được câu trả lời, em bấm Chốt lại.'
        );
      }
    },
    [roomId, question, cursor, draftAnswer, onError]
  );

  const handleLockAnswer = useCallback(() => {
    if (
      !question ||
      personalPhase !== 'question' ||
      submitState === 'sending' ||
      submitState === 'waiting_snapshot'
    ) {
      return;
    }
    if (isAnswerEmpty(question, draftAnswer)) return;

    if (question.type === 'true_false') {
      const statements = Array.isArray(question.statements)
        ? question.statements
        : [];
      const ansObj =
        draftAnswer && typeof draftAnswer === 'object' ? draftAnswer : {};
      const missing = statements.filter(
        (st) => typeof ansObj[st.id] !== 'boolean'
      ).length;
      if (missing > 0) {
        setMissingTfCount(missing);
        return;
      }
    }

    executeSubmit({ isSkip: false, attempt: 0 });
  }, [question, personalPhase, submitState, draftAnswer, executeSubmit]);

  const handleSkip = () => {
    if (
      !question ||
      personalPhase !== 'question' ||
      submitState === 'sending' ||
      submitState === 'waiting_snapshot'
    ) {
      return;
    }
    setMissingTfCount(0);
    executeSubmit({ isSkip: true, attempt: 0 });
  };

  // Chuyển sang câu tiếp theo với expected_cursor bắt buộc
  const handleNextSelfQuestion = async () => {
    if (!roomId || busyNext) return;
    setBusyNext(true);
    try {
      await battleApiModes.nextSelf(roomId, cursor);
    } catch (err) {
      // Lỗi 409 BATTLE_CURSOR_CONFLICT thì bỏ qua theo đúng hợp đồng (snapshot sẽ cập nhật)
      if (err?.status === 409 && err?.code === 'BATTLE_CURSOR_CONFLICT') {
        setBusyNext(false);
        return;
      }
      if (typeof onError === 'function') {
        onError(err?.message || 'Chưa chuyển được sang câu tiếp theo.');
      }
      setBusyNext(false);
    }
  };

  // Xử lý dữ liệu bảng trực tiếp public_board (tìm vị trí của em + 2 bạn trên/dưới)
  const boardWithRanks = useMemo(() => {
    if (!publicBoard || publicBoard.length === 0) return [];
    return publicBoard.map((row, idx) => ({
      ...row,
      _rank: idx + 1,
    }));
  }, [publicBoard]);

  const myBoardIndex = useMemo(() => {
    if (boardWithRanks.length === 0 || !user) return -1;
    const fullName = String(user.full_name || user.name || '').trim();
    const shortName = fullName.split(/\s+/).pop() || fullName;

    let idx = boardWithRanks.findIndex(
      (r) =>
        r.is_me ||
        (r.id !== undefined && Number(r.id) === Number(user.id)) ||
        (fullName && r.name === fullName)
    );
    if (idx === -1 && shortName) {
      idx = boardWithRanks.findIndex((r) => r.name === shortName);
    }
    return idx;
  }, [boardWithRanks, user]);

  const neighborhoodBoard = useMemo(() => {
    if (boardWithRanks.length === 0) return [];
    if (myBoardIndex === -1) {
      return boardWithRanks.slice(0, 5);
    }
    const start = Math.max(0, myBoardIndex - 2);
    const end = Math.min(boardWithRanks.length, myBoardIndex + 3);
    return boardWithRanks.slice(start, end);
  }, [boardWithRanks, myBoardIndex]);

  const modeBadgeLabel = buildSelfModeBadgeText(snapshot);
  const progressPercent = Math.min(
    100,
    Math.round((issuedCount / Math.max(1, totalQuestions)) * 100)
  );

  const isClockDanger =
    remainingMs !== null &&
    (isTotalTimer ? remainingMs < 30000 : remainingMs <= 5000);

  const isAnswerDisabled =
    snapshot?.phase === 'paused' ||
    personalPhase !== 'question' ||
    submitState === 'sending' ||
    submitState === 'waiting_snapshot' ||
    Boolean(myAnswer?.received);

  // Render một bảng xếp hạng trực tiếp
  const renderLiveBoardRows = (rows) => (
    <div className="arena-self-board-list">
      {rows.map((row, idx) => {
        const isMeRow =
          myBoardIndex !== -1 &&
          boardWithRanks[myBoardIndex]?._rank === row._rank &&
          boardWithRanks[myBoardIndex]?.name === row.name;
        const rowTotal = Number(row.total) || totalQuestions;
        const rowSubmitted = Number(row.submitted) || 0;
        const hasPoints = typeof row.points === 'number';

        return (
          <div
            key={`${row.name}-${row._rank || idx}`}
            className={`arena-self-board-row ${
              isMeRow ? 'arena-self-board-row--me' : ''
            }`}
          >
            <div className="arena-self-board-row__left">
              <span className="arena-self-board-row__rank arena-mono">
                #{row._rank || idx + 1}
              </span>
              <span className="arena-self-board-row__name">{row.name}</span>
              {isMeRow && (
                <span className="arena-chip arena-chip--accent">Em</span>
              )}
            </div>

            <div className="arena-self-board-row__right">
              <span className="arena-chip arena-mono">
                {rowSubmitted}/{rowTotal} câu
              </span>
              {hasPoints && (
                <strong className="arena-self-board-row__pts arena-mono">
                  {row.points} điểm
                </strong>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // Phân tích kết quả feedback ở chế độ Ôn tập (instant)
  const renderInstantFeedbackSection = () => {
    const fbQ = feedback?.question || question;
    const score = typeof feedback?.score === 'number' ? feedback.score : 0;
    const basePts =
      typeof feedback?.base_points === 'number'
        ? feedback.base_points
        : Math.round(score * (snapshot?.scoring === 'speed' ? 600 : 100));
    const speedPts =
      typeof feedback?.speed_points === 'number' ? feedback.speed_points : 0;
    const fastestPts =
      typeof feedback?.fastest_points === 'number'
        ? feedback.fastest_points
        : 0;
    const totalEarned = basePts + speedPts + fastestPts;

    let verdictClass = 'arena-verdict--wrong';
    let verdictIcon = '✕';
    let verdictTitle = 'Chưa đúng';

    if (score >= 1) {
      verdictClass = 'arena-verdict--correct';
      verdictIcon = '✓';
      verdictTitle = 'Đúng';
    } else if (score > 0 && score < 1) {
      verdictClass = 'arena-verdict--partial';
      verdictIcon = '◐';
      verdictTitle = 'Đúng một phần';
    } else if (myAnswer?.skipped) {
      verdictClass = 'arena-verdict--unanswered';
      verdictIcon = '—';
      verdictTitle = 'Em đã bỏ qua câu này';
    }

    return (
      <div className="arena-self-feedback-stage" aria-live="polite">
        <div className={`arena-card arena-verdict-banner ${verdictClass}`}>
          <div className="arena-verdict-banner__left">
            <span className="arena-verdict-banner__icon" aria-hidden="true">
              {verdictIcon}
            </span>
            <div>
              <h2 className="arena-title-md">{verdictTitle}</h2>
              <span className="arena-subtitle">
                Câu {cursor + 1}/{totalQuestions}
              </span>
            </div>
          </div>

          {snapshot?.scoring === 'speed' ? (
            <SpeedPointsPop
              base={basePts}
              speed={speedPts}
              fastest={fastestPts}
            />
          ) : (
            <div className="arena-verdict-banner__points arena-mono">
              +{totalEarned} điểm
            </div>
          )}
        </div>

        {fbQ && (
          <div className="arena-card" style={{ marginTop: '12px' }}>
            <div className="arena-question-stem" style={{ marginBottom: '12px' }}>
              <Rich text={fbQ.stem || ''} />
            </div>
            <QuestionSolutionDetail
              question={fbQ}
              myResponse={myAnswer?.response ?? draftAnswer}
              mySkipped={Boolean(myAnswer?.skipped)}
            />
            <div className="arena-review-explanation">
              <strong>💡 Lời giải: </strong>
              {fbQ.explanation && String(fbQ.explanation).trim() ? (
                <Rich text={fbQ.explanation} />
              ) : (
                <span className="arena-subtitle">Câu này chưa có lời giải</span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="arena-self-play">
      {/* Lớp phủ khi Thầy cô tạm dừng */}
      {snapshot?.phase === 'paused' && (
        <div
          className="arena-fullscreen-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="self-paused-title"
        >
          <div
            className="arena-finish-strip"
            style={{ maxWidth: '300px', marginBottom: '18px' }}
            aria-hidden="true"
          />
          <h2 id="self-paused-title" className="arena-title-lg">
            Thầy cô đang tạm dừng
          </h2>
          <p
            className="arena-subtitle"
            style={{ color: 'rgba(255, 255, 255, 0.85)', marginTop: '8px' }}
          >
            Thời gian làm bài và điểm thưởng tốc độ đang được bảo lưu.
          </p>
        </div>
      )}

      {/* Hộp xác nhận khi câu Đúng/Sai còn thiếu ý */}
      {missingTfCount > 0 && (
        <div
          className="arena-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="self-tf-confirm-title"
        >
          <div className="arena-sheet" style={{ maxWidth: '420px' }}>
            <div className="arena-sheet__header">
              <h3 id="self-tf-confirm-title" className="arena-title-md">
                Xác nhận chốt câu trả lời
              </h3>
            </div>
            <div className="arena-sheet__body">
              <p style={{ margin: 0 }}>
                Còn <strong>{missingTfCount} ý</strong> chưa chọn, ý thiếu tính sai. Vẫn chốt?
              </p>
            </div>
            <div className="arena-sheet__footer">
              <button
                type="button"
                className="arena-btn arena-btn--secondary"
                onClick={() => setMissingTfCount(0)}
              >
                Chọn tiếp
              </button>
              <button
                type="button"
                className="arena-btn arena-btn--amber"
                onClick={() => {
                  setMissingTfCount(0);
                  executeSubmit({ isSkip: false, attempt: 0 });
                }}
              >
                Vẫn chốt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thanh đầu trang: Nhãn chế độ + Câu X/Y + Đồng hồ + Tiến độ issued/total */}
      <header className="arena-card arena-self-header">
        <div className="arena-row arena-row--between">
          <span className="arena-chip arena-chip--amber">{modeBadgeLabel}</span>
          {snapshot?.rank_disabled_reason && (
            <span className="arena-chip">Không tính hạng</span>
          )}
        </div>

        <div className="arena-self-header__hud">
          <div className="arena-row" style={{ gap: '8px' }}>
            <span className="arena-chip arena-chip--accent arena-mono">
              {personalPhase === 'done'
                ? `Đã hoàn thành ${totalQuestions}/${totalQuestions}`
                : `Câu ${Math.min(cursor + 1, totalQuestions)}/${totalQuestions}`}
            </span>
            {question?.topic_name && personalPhase !== 'done' && (
              <span className="arena-chip">
                <span className="arena-chip__text">{question.topic_name}</span>
              </span>
            )}
          </div>

          {remainingMs !== null && personalPhase !== 'done' && (
            <div
              className={`arena-self-clock arena-mono ${
                isClockDanger ? 'arena-self-clock--danger' : ''
              }`}
              role="timer"
              aria-live="off"
              aria-label={
                isTotalTimer
                  ? `Thời gian tổng còn lại ${formatMmSs(remainingMs)}`
                  : `Thời gian câu hỏi còn ${Math.ceil(remainingMs / 1000)} giây`
              }
            >
              {isTotalTimer
                ? `⏱ ${formatMmSs(remainingMs)}`
                : `⏱ ${Math.ceil(remainingMs / 1000)}s`}
            </div>
          )}
        </div>

        {/* Thanh tiến độ nhỏ issued/total */}
        <div className="arena-self-progress">
          <div
            className="arena-self-progress__track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={totalQuestions}
            aria-valuenow={issuedCount}
            aria-label={`Đã mở ${issuedCount} trên ${totalQuestions} câu`}
          >
            <div
              className="arena-self-progress__fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="arena-self-progress__label arena-mono">
            Tiến độ: {issuedCount}/{totalQuestions} câu
          </span>
        </div>
      </header>

      {/* ===== TRẠNG THÁI 1: ĐANG LÀM CÂU HỎI HIỆN TẠI (phase === 'question') ===== */}
      {personalPhase === 'question' && (
        <div className="arena-self-question-wrap">
          {question ? (
            <>
              <article className="arena-card arena-question-card">
                <div className="arena-question-stem">
                  <Rich text={question.stem || ''} />
                </div>

                {Array.isArray(question.blocks) && question.blocks.length > 0 && (
                  <div className="arena-question-blocks">
                    {question.blocks.map((block, bIdx) => {
                      if (block.type === 'paragraph') {
                        return (
                          <div key={bIdx} className="arena-question-block-p">
                            <Rich text={block.text || block.content || ''} />
                          </div>
                        );
                      }
                      if (block.type === 'table') {
                        const headers = Array.isArray(block.headers)
                          ? block.headers
                          : [];
                        const rows = Array.isArray(block.rows) ? block.rows : [];
                        return (
                          <div key={bIdx} className="arena-table-scroll">
                            <table className="arena-question-table">
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
                                    {(Array.isArray(row) ? row : []).map(
                                      (cell, cIdx) => (
                                        <td key={cIdx}>
                                          <Rich text={String(cell ?? '')} />
                                        </td>
                                      )
                                    )}
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
              </article>

              <AnswerInput
                question={question}
                value={draftAnswer}
                onChange={(next) => {
                  setDraftAnswer(next);
                  saveDraftAnswer(roomId, cursor, next);
                }}
                disabled={isAnswerDisabled}
                onSubmit={handleLockAnswer}
              />

              <div className="arena-submit-bar" aria-live="polite">
                {submitState === 'sending' ||
                submitState === 'waiting_snapshot' ||
                myAnswer?.received ? (
                  <div className="arena-receipt-box">
                    <span
                      className="arena-spinner arena-spinner--dark"
                      aria-hidden="true"
                    />
                    <span>
                      Đang ghi nhận câu trả lời và chuyển trạng thái…
                    </span>
                  </div>
                ) : (
                  <>
                    {submitState === 'retry_error' && (
                      <div
                        className="arena-alert arena-alert--error"
                        style={{ marginBottom: '10px' }}
                      >
                        <span>
                          {submitErrorText ||
                            'Chưa gửi được câu trả lời, em bấm Chốt lại.'}
                        </span>
                      </div>
                    )}

                    <div className="arena-submit-actions">
                      <button
                        type="button"
                        className="arena-btn arena-btn--amber arena-btn--lg arena-submit-main-btn"
                        disabled={
                          isAnswerDisabled || isAnswerEmpty(question, draftAnswer)
                        }
                        onClick={handleLockAnswer}
                      >
                        Chốt đáp án
                      </button>
                      <button
                        type="button"
                        className="arena-btn arena-btn--secondary arena-btn--lg"
                        disabled={isAnswerDisabled}
                        onClick={handleSkip}
                      >
                        Bỏ qua
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="arena-card" style={{ textAlign: 'center', padding: '28px 16px' }}>
              <div
                className="arena-spinner arena-spinner--dark"
                style={{ margin: '0 auto 10px' }}
              />
              <p className="arena-title-md">Đang mở câu hỏi của em…</p>
            </div>
          )}
        </div>
      )}

      {/* ===== TRẠNG THÁI 2: PHẢN HỒI SAU KHI CHỐT CÂU (phase === 'feedback') ===== */}
      {personalPhase === 'feedback' && (
        <div className="arena-self-feedback-wrap">
          {feedback?.question || snapshot?.reveal_policy === 'instant' ? (
            renderInstantFeedbackSection()
          ) : (
            <div
              className="arena-card arena-self-deferred-card"
              role="status"
              aria-live="polite"
            >
              <div className="arena-receipt-box__icon" aria-hidden="true">
                ✓
              </div>
              <div>
                <h2 className="arena-title-md">
                  Đã nhận câu trả lời — kết quả công bố khi hết ván
                </h2>
                <p className="arena-subtitle" style={{ marginTop: '4px' }}>
                  Em hãy bấm Câu tiếp để làm luôn các câu còn lại nhé!
                </p>
              </div>
            </div>
          )}

          <div className="arena-self-next-bar" style={{ marginTop: '14px' }}>
            <button
              type="button"
              className="arena-btn arena-btn--amber arena-btn--lg arena-btn--block"
              onClick={handleNextSelfQuestion}
              disabled={busyNext || snapshot?.phase === 'paused'}
            >
              {busyNext ? 'Đang mở câu tiếp…' : 'Câu tiếp →'}
            </button>
            {autoNextRemainingSec !== null && (
              <p
                className="arena-self-autonext-hint arena-mono"
                aria-live="polite"
              >
                Tự sang câu sau {autoNextRemainingSec} giây
              </p>
            )}
          </div>
        </div>
      )}

      {/* ===== TRẠNG THÁI 3: EM ĐÃ LÀM XONG TẤT CẢ CÂU (phase === 'done') ===== */}
      {personalPhase === 'done' && (
        <section
          className="arena-card arena-self-done-card"
          role="status"
          aria-live="polite"
        >
          <div
            className="arena-finish-strip"
            style={{ marginBottom: '14px' }}
            aria-hidden="true"
          />
          <h2 className="arena-title-lg">
            🎉 Em đã làm xong! Chờ các bạn…
          </h2>
          <p className="arena-subtitle" style={{ marginTop: '6px' }}>
            Hệ thống sẽ công bố tổng kết và lời giải đầy đủ ngay khi ván đấu kết thúc.
          </p>

          {boardWithRanks.length > 0 && (
            <div style={{ marginTop: '18px', textAlign: 'left' }}>
              <h3 className="arena-title-md" style={{ marginBottom: '10px' }}>
                📊 Bảng tiến độ trực tiếp của phòng
              </h3>
              {renderLiveBoardRows(boardWithRanks)}
            </div>
          )}
        </section>
      )}

      {/* ===== DẢI BẢNG TRỰC TIẾP PUBLIC_BOARD Ở ĐÁY (Khi chưa xong & có public_board) ===== */}
      {personalPhase !== 'done' && boardWithRanks.length > 0 && (
        <section
          className="arena-card arena-self-live-strip"
          aria-label="Bảng xếp hạng trực tiếp"
        >
          <div className="arena-row arena-row--between" style={{ marginBottom: '10px' }}>
            <div className="arena-row" style={{ gap: '8px' }}>
              <span className="arena-pulse-dot" aria-hidden="true" />
              <h3 className="arena-title-md">Bảng trực tiếp</h3>
              {myBoardIndex !== -1 && (
                <span className="arena-chip arena-chip--amber arena-mono">
                  Em hạng #{boardWithRanks[myBoardIndex]._rank}/
                  {boardWithRanks.length}
                </span>
              )}
            </div>

            {boardWithRanks.length > neighborhoodBoard.length && (
              <button
                type="button"
                className="arena-btn arena-btn--secondary arena-btn--sm"
                aria-expanded={boardExpanded}
                onClick={() => setBoardExpanded((v) => !v)}
              >
                {boardExpanded
                  ? 'Thu gọn'
                  : `Xem cả bảng (${boardWithRanks.length})`}
              </button>
            )}
          </div>

          {renderLiveBoardRows(
            boardExpanded ? boardWithRanks : neighborhoodBoard
          )}
        </section>
      )}
    </div>
  );
}
