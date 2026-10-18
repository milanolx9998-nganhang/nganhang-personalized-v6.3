import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { Rich } from '../practice/Rich.jsx';
import {
  battleApi,
  getOrCreateAnswerClientId,
  formatRoomCode,
} from './battleApi.js';
import { useBattleStream } from './useBattleStream.js';

import AnswerInput from './components/AnswerInput.jsx';
import CountdownOverlay from './components/CountdownOverlay.jsx';
import RankStrip from './components/RankStrip.jsx';
import ConnectionBanner from './components/ConnectionBanner.jsx';
import ContentVote from './components/ContentVote.jsx';
import PlayerMenu from './components/PlayerMenu.jsx';
import EmoteBar from './components/EmoteBar.jsx';
import RevealPanel from './components/RevealPanel.jsx';
import ResultView from './components/ResultView.jsx';
import ScopeLabel from './components/ScopeLabel.jsx';

const SUBMIT_RETRY_DELAYS_MS = [1000, 2000, 4000, 4000, 4000];

const START_REASON_LABELS = {
  not_enough_players: 'Cần thêm người chơi vào phòng để bắt đầu.',
  not_all_ready: 'Cần tất cả các bạn trong phòng bấm Sẵn sàng.',
  unbalanced_teams: 'Mỗi đội cần có từ 1 đến 4 bạn để bắt đầu.',
  empty_team: 'Cả hai đội đều phải có thành viên.',
  voting_in_progress: 'Đang chờ cả phòng bỏ phiếu chọn nội dung.',
  scope_not_selected: 'Chưa chọn nội dung câu hỏi cho phòng đấu.',
  battle_disabled: 'Hệ thống Đấu hiện đang tạm ngưng tạo ván mới.',
};

function translateStartReason(reason) {
  if (!reason) return '';
  if (START_REASON_LABELS[reason]) return START_REASON_LABELS[reason];
  return String(reason);
}

const KIND_LABELS = {
  duel: 'Đấu đôi',
  team: 'Đấu đội',
  ffa: 'Nhiều người',
  class: 'Cả lớp cùng đấu',
};

const EMOTE_DISPLAY = {
  hello: { icon: '👋', text: 'Chào' },
  cheer: { icon: '💪', text: 'Cố lên' },
  thanks: { icon: '🙏', text: 'Cảm ơn' },
  well_done: { icon: '🌟', text: 'Hay quá' },
};

function isAnswerEmpty(question, val) {
  if (!question) return true;
  if (val === null || val === undefined) return true;
  switch (question.type) {
    case 'multiple_choice':
      return typeof val !== 'string' || val.trim() === '';
    case 'true_false': {
      if (typeof val !== 'object') return true;
      return Object.keys(val).length === 0;
    }
    case 'short_answer': {
      if (typeof val === 'object') {
        return !String(val.value ?? '').trim();
      }
      return !String(val).trim();
    }
    case 'matching': {
      if (typeof val !== 'object') return true;
      return Object.keys(val).length === 0;
    }
    default:
      return false;
  }
}

export default function RoomPage() {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [streamEnabled, setStreamEnabled] = useState(true);
  const [fallbackResult, setFallbackResult] = useState(null);
  const [loadingFallback, setLoadingFallback] = useState(false);
  const [optionsCatalog, setOptionsCatalog] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [busyAction, setBusyAction] = useState(false);

  // Biểu cảm (emote) nổi trong phòng
  const [recentEmotes, setRecentEmotes] = useState([]);

  // Trạng thái trả lời câu hỏi hiện tại
  const [draftAnswer, setDraftAnswer] = useState(null);
  const [submitState, setSubmitState] = useState('idle'); // 'idle' | 'sending' | 'received' | 'retry_error'
  const [submitErrorText, setSubmitErrorText] = useState('');
  const [skippedLocally, setSkippedLocally] = useState(false);
  const [missingTfCount, setMissingTfCount] = useState(0);

  // Đồng hồ đếm ngược câu hỏi
  const [remainingMs, setRemainingMs] = useState(null);

  const retryTimerRef = useRef(null);
  const activeQuestionIdxRef = useRef(null);

  const handleStreamEvent = useCallback((eventName, payload) => {
    if (eventName === 'emote' && payload) {
      const idKey = `${Date.now()}-${Math.random()}`;
      setRecentEmotes((prev) => [...prev.slice(-4), { ...payload, _id: idKey }]);
      setTimeout(() => {
        setRecentEmotes((prev) => prev.filter((item) => item._id !== idKey));
      }, 4500);
    }
  }, []);

  const {
    snapshot: streamSnapshot,
    status: streamStatus,
    stopReason,
    offsetMs,
    applyExternalSnapshot,
  } = useBattleStream(
    roomId ? `/api/battle/rooms/${encodeURIComponent(roomId)}/stream` : null,
    {
      enabled: streamEnabled,
      onEvent: handleStreamEvent,
    }
  );

  const snapshot = streamSnapshot || fallbackResult;

  // Nếu luồng SSE dừng do 403 hoặc ván đã kết thúc (người chơi từng tham gia xem lại), gọi GET /rooms/:id/result
  useEffect(() => {
    if (!roomId) return;
    if (streamStatus === 'stopped' && !streamSnapshot && !fallbackResult && !loadingFallback) {
      let cancelled = false;
      setLoadingFallback(true);
      battleApi
        .getRoomResult(roomId)
        .then((res) => {
          if (!cancelled && res) {
            setFallbackResult(res);
          }
        })
        .catch((err) => {
          if (!cancelled && !stopReason?.message) {
            setErrorMsg(err?.message || 'Không tải được dữ liệu phòng đấu.');
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

  // Khi ván đấu đã sang trạng thái kết thúc hoàn toàn, có thể ngắt SSE để tiết kiệm luồng
  useEffect(() => {
    const phase = snapshot?.phase;
    if (phase === 'finished' || phase === 'interrupted' || phase === 'closed') {
      setStreamEnabled(false);
    }
  }, [snapshot?.phase]);

  // Chuyển hướng Giáo viên chủ phòng lớp sang màn máy chiếu ProjectorPage
  useEffect(() => {
    if (!snapshot || !user) return;
    const isStaff = user.role === 'teacher' || user.role === 'admin';
    if (
      snapshot.kind === 'class' &&
      isStaff &&
      Number(snapshot.host_id) === Number(user.id)
    ) {
      navigate(`/practice/battle/rooms/${encodeURIComponent(roomId)}/projector`, {
        replace: true,
      });
    }
  }, [snapshot, user, roomId, navigate]);

  // Nạp danh mục /options để dịch tên phạm vi (ScopeLabel)
  useEffect(() => {
    if (!user || user.role !== 'student') return;
    let cancelled = false;
    battleApi
      .getOptions({ count: snapshot?.question_count || 7 })
      .then((res) => {
        if (!cancelled) setOptionsCatalog(res);
      })
      .catch(() => {
        // Không chặn giao diện nếu options lỗi
      });
    return () => {
      cancelled = true;
    };
  }, [user, snapshot?.question_count]);

  // Khởi tạo / đồng bộ trạng thái câu trả lời mỗi khi đổi câu hỏi hoặc nhận snapshot mới
  const currentQuestionIndex = snapshot?.question?.index ?? null;
  const serverMyAnswer = snapshot?.my_answer;

  useEffect(() => {
    if (currentQuestionIndex === null) {
      activeQuestionIdxRef.current = null;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      return;
    }

    // Khi sang câu hỏi mới
    if (activeQuestionIdxRef.current !== currentQuestionIndex) {
      activeQuestionIdxRef.current = currentQuestionIndex;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setMissingTfCount(0);
      setSubmitErrorText('');

      if (serverMyAnswer?.received) {
        setDraftAnswer(serverMyAnswer.response ?? null);
        setSkippedLocally(Boolean(serverMyAnswer.skipped));
        setSubmitState('received');
      } else {
        setDraftAnswer(null);
        setSkippedLocally(false);
        setSubmitState('idle');
      }
      return;
    }

    // Cùng câu hỏi nhưng máy chủ xác nhận đã nhận câu trả lời
    if (serverMyAnswer?.received && submitState !== 'received') {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (serverMyAnswer.response !== undefined) {
        setDraftAnswer(serverMyAnswer.response);
      }
      setSkippedLocally(Boolean(serverMyAnswer.skipped));
      setSubmitState('received');
      setSubmitErrorText('');
    }
  }, [currentQuestionIndex, serverMyAnswer, submitState]);

  // Huỷ timer gửi lại khi unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  // Đồng hồ đếm ngược theo giờ máy chủ (serverNow = Date.now() + offsetMs)
  useEffect(() => {
    const phase = snapshot?.phase;
    const deadline = snapshot?.deadline;
    if ((phase !== 'question' && phase !== 'closing') || typeof deadline !== 'number') {
      setRemainingMs(null);
      return undefined;
    }

    const updateClock = () => {
      const serverNow = Date.now() + offsetMs;
      const left = Math.max(0, deadline - serverNow);
      setRemainingMs(left);
    };

    updateClock();
    const intervalId = setInterval(updateClock, 100);
    return () => clearInterval(intervalId);
  }, [snapshot?.phase, snapshot?.deadline, offsetMs]);

  // Hàm gửi câu trả lời kèm cơ chế tự thử lại 1, 2, 4 giây (tối đa 5 lần) khi lỗi mạng / 503
  const executeSubmitAnswer = useCallback(
    async ({ isSkip = false, attempt = 0, payloadOverride = null }) => {
      if (!snapshot?.question || !roomId) return;
      const qIndex = snapshot.question.index;
      const clientId = getOrCreateAnswerClientId(roomId, qIndex);
      const responseValue =
        payloadOverride !== null ? payloadOverride : draftAnswer;

      setSubmitState('sending');
      setSubmitErrorText('');
      if (isSkip) {
        setSkippedLocally(true);
      }

      try {
        const res = await battleApi.submitAnswer(roomId, {
          index: qIndex,
          client_id: clientId,
          response: responseValue,
          skip: isSkip,
        });

        if (activeQuestionIdxRef.current !== qIndex) return;

        if (res?.received) {
          setSubmitState('received');
          setSubmitErrorText('');
        }
      } catch (err) {
        if (activeQuestionIdxRef.current !== qIndex) return;

        // 409 kèm details.receipt => câu trả lời đã được máy chủ ghi nhận trước đó
        if (err?.status === 409 && err?.details?.receipt) {
          setSubmitState('received');
          setSubmitErrorText('');
          return;
        }

        // Lỗi mạng (không có status) hoặc 503 DB bận => tự gửi lại cùng client_id tối đa 5 lần
        const isTransient = !err?.status || err.status === 503 || err.status === 502 || err.status === 504;
        if (isTransient && attempt < SUBMIT_RETRY_DELAYS_MS.length) {
          const delay = SUBMIT_RETRY_DELAYS_MS[attempt];
          retryTimerRef.current = setTimeout(() => {
            executeSubmitAnswer({
              isSkip,
              attempt: attempt + 1,
              payloadOverride: responseValue,
            });
          }, delay);
          return;
        }

        setSubmitState('retry_error');
        setSkippedLocally(false);
        setSubmitErrorText(
          err?.message || 'Chưa gửi được, em bấm Chốt lại.'
        );
      }
    },
    [snapshot?.question, roomId, draftAnswer]
  );

  // Xử lý bấm nút Chốt (kiểm tra câu Đúng/Sai còn thiếu ý trước khi gửi)
  const handlePressLockAnswer = useCallback(() => {
    const q = snapshot?.question;
    if (!q || submitState === 'sending' || submitState === 'received') return;
    if (isAnswerEmpty(q, draftAnswer)) return;

    if (q.type === 'true_false') {
      const statements = Array.isArray(q.statements) ? q.statements : [];
      const ansObj = draftAnswer && typeof draftAnswer === 'object' ? draftAnswer : {};
      const missing = statements.filter(
        (st) => typeof ansObj[st.id] !== 'boolean'
      ).length;
      if (missing > 0) {
        setMissingTfCount(missing);
        return;
      }
    }

    executeSubmitAnswer({ isSkip: false, attempt: 0 });
  }, [snapshot?.question, submitState, draftAnswer, executeSubmitAnswer]);

  const handleConfirmMissingTf = () => {
    setMissingTfCount(0);
    executeSubmitAnswer({ isSkip: false, attempt: 0 });
  };

  const handlePressSkipQuestion = () => {
    if (!snapshot?.question || submitState === 'sending' || submitState === 'received') {
      return;
    }
    setMissingTfCount(0);
    executeSubmitAnswer({ isSkip: true, attempt: 0 });
  };

  // Thao tác trong Phòng chờ (Lobby)
  const handleCopyCode = async () => {
    if (!snapshot?.code) return;
    try {
      await navigator.clipboard.writeText(String(snapshot.code).replace(/\s+/g, ''));
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setErrorMsg('Không thể tự động sao chép, em hãy ghi lại mã phòng trên màn hình.');
    }
  };

  const handleToggleReady = async () => {
    if (!snapshot || busyAction) return;
    const mePlayer = (snapshot.players || []).find(
      (p) => Number(p.id) === Number(user?.id)
    );
    const nextReady = !mePlayer?.ready;
    setBusyAction(true);
    setErrorMsg('');
    try {
      const res = await battleApi.setReady(roomId, nextReady);
      if (res && typeof res === 'object' && res.phase) {
        applyExternalSnapshot(res);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Không đổi được trạng thái sẵn sàng.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSwitchTeam = async (targetTeam) => {
    if (!snapshot || busyAction) return;
    setBusyAction(true);
    setErrorMsg('');
    try {
      const res = await battleApi.setTeam(roomId, targetTeam);
      if (res && typeof res === 'object' && res.phase) {
        applyExternalSnapshot(res);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Không chuyển đội được.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleStartMatch = async () => {
    if (!snapshot || busyAction) return;
    setBusyAction(true);
    setErrorMsg('');
    try {
      const res = await battleApi.startRoom(roomId);
      if (res && typeof res === 'object' && res.phase) {
        applyExternalSnapshot(res);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Chưa thể bắt đầu ván đấu.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (busyAction) return;
    setBusyAction(true);
    try {
      await battleApi.leaveRoom(roomId);
    } catch {
      // Cho phép điều hướng về sảnh kể cả khi phòng đã đóng
    } finally {
      setBusyAction(false);
      navigate('/practice/battle');
    }
  };

  const handleHostSoloEnd = async () => {
    if (busyAction) return;
    setBusyAction(true);
    setErrorMsg('');
    try {
      await battleApi.endRoom(roomId);
    } catch (err) {
      setErrorMsg(err?.message || 'Không thể kết thúc ván đấu lúc này.');
    } finally {
      setBusyAction(false);
    }
  };

  const myPlayer = useMemo(() => {
    if (!snapshot?.players || !user) return null;
    return snapshot.players.find((p) => Number(p.id) === Number(user.id)) || null;
  }, [snapshot?.players, user]);

  const isHost = Boolean(
    snapshot && user && Number(snapshot.host_id) === Number(user.id)
  );
  const startReasons = Array.isArray(snapshot?.start_reasons)
    ? snapshot.start_reasons
    : [];
  const canHostStart = isHost && startReasons.length === 0;

  // Render một dòng người chơi trong Phòng chờ
  const renderPlayerCard = (player) => {
    const isMe = Number(player.id) === Number(user?.id);
    const isRoomHost = Number(player.id) === Number(snapshot?.host_id);
    const activeEmote = recentEmotes
      .slice()
      .reverse()
      .find((e) => Number(e.user_id || e.player_id) === Number(player.id));
    const emoteMeta = activeEmote ? EMOTE_DISPLAY[activeEmote.kind] : null;

    return (
      <div
        key={player.id}
        className={`arena-player-item ${isMe ? 'arena-player-item--me' : ''}`}
      >
        <div className="arena-player-item__info">
          <div className="arena-player-avatar" aria-hidden="true">
            {String(player.name || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="arena-player-item__text">
            <div className="arena-player-item__name-row">
              <span className="arena-player-item__name">{player.name}</span>
              {isMe && <span className="arena-chip arena-chip--accent">Em</span>}
              {isRoomHost && (
                <span className="arena-chip arena-chip--amber">Chủ phòng</span>
              )}
            </div>
            {player.class_name && (
              <span className="arena-player-item__class">
                Lớp {player.class_name}
              </span>
            )}
          </div>
        </div>

        <div className="arena-player-item__actions">
          {emoteMeta && (
            <span className="arena-emote-bubble" aria-live="polite">
              <span aria-hidden="true">{emoteMeta.icon}</span> {emoteMeta.text}
            </span>
          )}

          {snapshot?.kind !== 'class' && (
            <span
              className={`arena-chip ${
                player.ready ? 'arena-chip--live' : ''
              }`}
            >
              {player.ready ? '✓ Sẵn sàng' : 'Đang chuẩn bị'}
            </span>
          )}

          {!isMe && (
            <PlayerMenu
              roomId={roomId}
              player={player}
              onError={(msg) => setErrorMsg(msg)}
            />
          )}
        </div>
      </div>
    );
  };

  // Trạng thái đang tải lần đầu
  if (!snapshot && (streamStatus !== 'stopped' || loadingFallback)) {
    return (
      <div className="arena-page">
        <div className="arena-container">
          <div className="arena-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div
              className="arena-spinner arena-spinner--dark"
              style={{ margin: '0 auto 12px', width: '28px', height: '28px' }}
            />
            <p className="arena-title-md">Đang vào phòng đấu…</p>
            <p className="arena-subtitle">Đang đồng bộ trạng thái từ máy chủ</p>
          </div>
        </div>
      </div>
    );
  }

  // Không tải được phòng hoặc bị từ chối quyền truy cập
  if (!snapshot && streamStatus === 'stopped') {
    return (
      <div className="arena-page">
        <div className="arena-container">
          <ConnectionBanner status={streamStatus} stopReason={stopReason} />
          {errorMsg && (
            <div className="arena-alert arena-alert--error" role="alert">
              <span>{errorMsg}</span>
            </div>
          )}
          <div className="arena-card" style={{ textAlign: 'center', padding: '32px 20px' }}>
            <h1 className="arena-title-md">Không thể mở phòng đấu</h1>
            <p className="arena-subtitle" style={{ marginBottom: '20px' }}>
              {stopReason?.message ||
                errorMsg ||
                'Phòng đấu không tồn tại hoặc đã đóng.'}
            </p>
            <Link to="/practice/battle" className="arena-btn arena-btn--primary">
              Về sảnh Đấu
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const phase = snapshot?.phase;
  const players = Array.isArray(snapshot?.players) ? snapshot.players : [];

  // ===== PHA KẾT QUẢ (finished / interrupted / closed) =====
  if (phase === 'finished' || phase === 'interrupted' || phase === 'closed') {
    return (
      <div className="arena-page">
        <ConnectionBanner status={streamStatus} stopReason={stopReason} />
        <div className="arena-container">
          {errorMsg && (
            <div className="arena-alert arena-alert--error" role="alert">
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
          <ResultView snapshot={snapshot} userId={user?.id} roomId={roomId} />
        </div>
      </div>
    );
  }

  // ===== PHA LỜI GIẢI (reveal) =====
  if (phase === 'reveal') {
    const isTeacherUser = user?.role === 'teacher' || user?.role === 'admin';
    return (
      <div className="arena-page">
        <ConnectionBanner status={streamStatus} stopReason={stopReason} />
        <div className="arena-container">
          {errorMsg && (
            <div className="arena-alert arena-alert--error" role="alert">
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

          <RevealPanel
            snapshot={snapshot}
            userId={user?.id}
            roomId={roomId}
            isTeacher={isTeacherUser}
            onError={(msg) => setErrorMsg(msg)}
          />

          {snapshot.kind !== 'class' && (
            <div style={{ marginTop: '16px' }}>
              <EmoteBar
                roomId={roomId}
                disabled={false}
                onError={(msg) => setErrorMsg(msg)}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== PHA PHÒNG CHỜ (lobby) =====
  if (phase === 'lobby') {
    const team1Players = players.filter((p) => Number(p.team) === 1);
    const team2Players = players.filter((p) => Number(p.team) === 2);
    const unassignedPlayers = players.filter(
      (p) => Number(p.team) !== 1 && Number(p.team) !== 2
    );

    return (
      <div className="arena-page">
        <ConnectionBanner status={streamStatus} stopReason={stopReason} />

        <div className="arena-container">
          {errorMsg && (
            <div className="arena-alert arena-alert--error" role="alert">
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

          {/* Thẻ đầu phòng chờ: Mã phòng Mono lớn + Cấu hình + Nút Rời phòng */}
          <section className="arena-card arena-card--dark arena-lobby-hero">
            <div
              className="arena-finish-strip"
              style={{ marginBottom: '14px' }}
              aria-hidden="true"
            />
            <div className="arena-row arena-row--between">
              <div>
                <div className="arena-row" style={{ gap: '8px', marginBottom: '6px' }}>
                  <span className="arena-chip arena-chip--amber">
                    {KIND_LABELS[snapshot.kind] || 'Phòng đấu'}
                  </span>
                  <span className="arena-chip">
                    {snapshot.question_count || 7} câu · {snapshot.seconds || 30} giây/câu
                  </span>
                  <span className="arena-chip">
                    Đúng là chính
                  </span>
                </div>
                <div className="arena-lobby-scope-line">
                  <ScopeLabel scope={snapshot.scope} options={optionsCatalog} />
                </div>
              </div>

              <button
                type="button"
                className="arena-btn arena-btn--ghost-light arena-btn--sm"
                onClick={handleLeaveRoom}
                disabled={busyAction}
              >
                Rời phòng
              </button>
            </div>

            {snapshot.code && (
              <div className="arena-code-box">
                <div>
                  <span className="arena-code-box__label">MÃ PHÒNG</span>
                  <div className="arena-code-display" aria-label={`Mã phòng ${snapshot.code}`}>
                    Mã {formatRoomCode(snapshot.code)}
                  </div>
                </div>
                <button
                  type="button"
                  className="arena-btn arena-btn--amber"
                  onClick={handleCopyCode}
                >
                  {copiedCode ? '✓ Đã chép mã' : 'Sao chép'}
                </button>
              </div>
            )}
          </section>

          {/* Khối bầu chọn nội dung nếu phòng ở chế độ vote */}
          {snapshot.vote && (
            <section style={{ marginTop: '16px' }}>
              <ContentVote
                roomId={roomId}
                snapshot={snapshot}
                userId={user?.id}
                onError={(msg) => setErrorMsg(msg)}
              />
            </section>
          )}

          {/* Danh sách người chơi (Chia 2 cột nếu là phòng Đấu đội) */}
          <section style={{ marginTop: '16px' }}>
            <div className="arena-row arena-row--between" style={{ marginBottom: '10px' }}>
              <h2 className="arena-title-md">
                Bạn cùng phòng ({players.length}
                {snapshot.capacity ? `/${snapshot.capacity}` : ''})
              </h2>
              {snapshot.kind !== 'class' && (
                <span className="arena-subtitle" style={{ margin: 0 }}>
                  Đã sẵn sàng: {players.filter((p) => p.ready).length}/{players.length}
                </span>
              )}
            </div>

            {snapshot.kind === 'team' ? (
              <div className="arena-teams-grid">
                {/* Cột Đội 1 */}
                <div className="arena-team-column arena-team-column--1">
                  <div className="arena-team-column__header">
                    <div>
                      <h3 className="arena-title-md" style={{ color: 'var(--arena-team-1)' }}>
                        Đội 1
                      </h3>
                      <span className="arena-subtitle">
                        {team1Players.length}/4 thành viên
                      </span>
                    </div>
                    {Number(myPlayer?.team) !== 1 && (
                      <button
                        type="button"
                        className="arena-btn arena-btn--primary arena-btn--sm"
                        onClick={() => handleSwitchTeam(1)}
                        disabled={busyAction || team1Players.length >= 4}
                      >
                        Vào đội 1
                      </button>
                    )}
                  </div>
                  <div className="arena-player-list">
                    {team1Players.length === 0 ? (
                      <p className="arena-empty-hint">Chưa có bạn nào ở Đội 1.</p>
                    ) : (
                      team1Players.map(renderPlayerCard)
                    )}
                  </div>
                </div>

                {/* Cột Đội 2 */}
                <div className="arena-team-column arena-team-column--2">
                  <div className="arena-team-column__header">
                    <div>
                      <h3 className="arena-title-md" style={{ color: 'var(--arena-team-2)' }}>
                        Đội 2
                      </h3>
                      <span className="arena-subtitle">
                        {team2Players.length}/4 thành viên
                      </span>
                    </div>
                    {Number(myPlayer?.team) !== 2 && (
                      <button
                        type="button"
                        className="arena-btn arena-btn--amber arena-btn--sm"
                        onClick={() => handleSwitchTeam(2)}
                        disabled={busyAction || team2Players.length >= 4}
                      >
                        Vào đội 2
                      </button>
                    )}
                  </div>
                  <div className="arena-player-list">
                    {team2Players.length === 0 ? (
                      <p className="arena-empty-hint">Chưa có bạn nào ở Đội 2.</p>
                    ) : (
                      team2Players.map(renderPlayerCard)
                    )}
                  </div>
                </div>

                {unassignedPlayers.length > 0 && (
                  <div className="arena-card" style={{ gridColumn: '1 / -1' }}>
                    <h4 className="arena-field-label">Chưa chọn đội</h4>
                    <div className="arena-player-list">
                      {unassignedPlayers.map(renderPlayerCard)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="arena-card">
                <div className="arena-player-list">
                  {players.map(renderPlayerCard)}
                </div>
              </div>
            )}
          </section>

          {/* Thanh biểu cảm nhanh (Không hiện ở phòng lớp) */}
          {snapshot.kind !== 'class' && (
            <section style={{ marginTop: '14px' }}>
              <EmoteBar
                roomId={roomId}
                disabled={busyAction}
                onError={(msg) => setErrorMsg(msg)}
              />
            </section>
          )}

          {/* Khu vực điều khiển Sẵn sàng & Bắt đầu */}
          <section className="arena-card arena-lobby-controls" style={{ marginTop: '16px' }}>
            <div className="arena-lobby-controls__row">
              {snapshot.kind !== 'class' && myPlayer && (
                <button
                  type="button"
                  className={`arena-btn arena-btn--lg ${
                    myPlayer.ready ? 'arena-btn--secondary' : 'arena-btn--primary'
                  }`}
                  onClick={handleToggleReady}
                  disabled={busyAction}
                >
                  {myPlayer.ready ? 'Huỷ sẵn sàng' : '✓ Sẵn sàng'}
                </button>
              )}

              {isHost ? (
                <button
                  type="button"
                  className="arena-btn arena-btn--lg arena-btn--amber"
                  onClick={handleStartMatch}
                  disabled={!canHostStart || busyAction}
                >
                  Bắt đầu ván đấu
                </button>
              ) : (
                <div className="arena-waiting-host-note" role="status">
                  <span className="arena-pulse-dot" aria-hidden="true" />
                  <span>
                    {snapshot.kind === 'class'
                      ? 'Chờ thầy cô bắt đầu ván đấu…'
                      : 'Chờ chủ phòng bắt đầu…'}
                  </span>
                </div>
              )}
            </div>

            {isHost && startReasons.length > 0 && (
              <div className="arena-start-reasons" role="status" aria-live="polite">
                {startReasons.map((r, idx) => (
                  <p key={idx} className="arena-start-reasons__item">
                    • {translateStartReason(r)}
                  </p>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  // ===== PHA TRONG VÁN ĐẤU (countdown / question / paused / closing) =====
  const question = snapshot?.question;
  const totalSeconds = Number(snapshot?.seconds) || 30;
  const remainingSec =
    remainingMs !== null ? Math.ceil(remainingMs / 1000) : totalSeconds;
  const timerPercent =
    remainingMs !== null
      ? Math.min(100, Math.max(0, (remainingMs / (totalSeconds * 1000)) * 100))
      : 100;

  const isAnswerLocked =
    phase === 'paused' ||
    phase === 'closing' ||
    submitState === 'sending' ||
    submitState === 'received' ||
    Boolean(serverMyAnswer?.received) ||
    (remainingMs !== null && remainingMs <= 0);

  const isUrgentUnconfirmed =
    phase === 'question' &&
    !serverMyAnswer?.received &&
    submitState !== 'received' &&
    remainingMs !== null &&
    remainingMs > 0 &&
    remainingMs <= 5000;

  const teamsData = Array.isArray(snapshot?.teams) ? snapshot.teams : null;
  const team1Points =
    teamsData?.find((t) => Number(t.team || t.id) === 1)?.points ?? 0;
  const team2Points =
    teamsData?.find((t) => Number(t.team || t.id) === 2)?.points ?? 0;
  const totalTeamPoints = team1Points + team2Points;
  const team1Ratio =
    totalTeamPoints > 0 ? Math.round((team1Points / totalTeamPoints) * 100) : 50;

  const canSoloHostEnd =
    isHost &&
    snapshot?.kind !== 'class' &&
    players.length <= 1 &&
    (phase === 'question' || phase === 'paused');

  return (
    <div className="arena-page arena-page--playing">
      <ConnectionBanner status={streamStatus} stopReason={stopReason} />

      {/* Đếm ngược 3-2-1 đầu ván */}
      {phase === 'countdown' && <CountdownOverlay />}

      {/* Lớp phủ khi Thầy cô tạm dừng */}
      {phase === 'paused' && (
        <div
          className="arena-fullscreen-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="arena-paused-title"
        >
          <div className="arena-finish-strip" style={{ maxWidth: '320px', marginBottom: '20px' }} />
          <h2 id="arena-paused-title" className="arena-title-lg">
            Thầy cô tạm dừng
          </h2>
          <p className="arena-subtitle" style={{ color: 'rgba(255,255,255,0.85)', marginTop: '8px' }}>
            Ván đấu đang tạm dừng. Ô trả lời sẽ mở lại ngay khi thầy cô tiếp tục.
          </p>
        </div>
      )}

      {/* Hộp xác nhận khi câu Đúng/Sai còn ý chưa chọn */}
      {missingTfCount > 0 && (
        <div
          className="arena-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="arena-tf-confirm-title"
        >
          <div className="arena-sheet" style={{ maxWidth: '420px' }}>
            <div className="arena-sheet__header">
              <h3 id="arena-tf-confirm-title" className="arena-title-md">
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
                onClick={handleConfirmMissingTf}
              >
                Vẫn chốt
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="arena-container arena-play-container">
        {errorMsg && (
          <div className="arena-alert arena-alert--error" role="alert">
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

        {/* Thanh thời gian mảnh trên đỉnh */}
        <div className="arena-play-top">
          <div
            className="arena-timer-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={totalSeconds}
            aria-valuenow={remainingSec}
            aria-label="Thời gian còn lại của câu hỏi"
          >
            <div
              className={`arena-timer-fill ${
                remainingSec <= 5
                  ? 'arena-timer-fill--danger'
                  : remainingSec <= 10
                  ? 'arena-timer-fill--warn'
                  : ''
              }`}
              style={{ width: `${timerPercent}%` }}
            />
          </div>

          <div className="arena-play-meta-row">
            <div className="arena-row" style={{ gap: '8px' }}>
              <span className="arena-chip arena-chip--accent arena-mono">
                Câu {(question?.index ?? 0) + 1}/
                {question?.total || snapshot?.question_count || 7}
              </span>
              {question?.topic_name && (
                <span className="arena-chip">
                  <span className="arena-chip__text">{question.topic_name}</span>
                </span>
              )}
            </div>

            <div className="arena-row" style={{ gap: '8px' }}>
              <span
                className={`arena-timer-badge arena-mono ${
                  remainingSec <= 5 ? 'arena-timer-badge--urgent' : ''
                }`}
              >
                {remainingSec}s
              </span>
              {canSoloHostEnd && (
                <button
                  type="button"
                  className="arena-btn arena-btn--danger-outline arena-btn--sm"
                  onClick={handleHostSoloEnd}
                  disabled={busyAction}
                >
                  Kết thúc
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Thanh kéo co 2 đội (nếu phòng Đấu đội) */}
        {snapshot?.kind === 'team' && (
          <div className="arena-tug-bar" aria-label="Điểm số hai đội đến câu trước">
            <div className="arena-tug-bar__labels">
              <span className="arena-tug-bar__team1">
                Đội 1: <strong className="arena-mono">{team1Points} điểm</strong>
              </span>
              <span className="arena-tug-bar__team2">
                Đội 2: <strong className="arena-mono">{team2Points} điểm</strong>
              </span>
            </div>
            <div className="arena-tug-bar__track">
              <div
                className="arena-tug-bar__fill-1"
                style={{ width: `${team1Ratio}%` }}
              />
            </div>
          </div>
        )}

        {/* Cảnh báo khi còn 5 giây mà chưa bấm Chốt */}
        {isUrgentUnconfirmed && (
          <div
            className="arena-alert arena-alert--warn arena-urgent-banner"
            role="status"
            aria-live="assertive"
          >
            <span>⚠️ Còn {remainingSec} giây — em chưa chốt (hết giờ chưa chốt thì không tính)</span>
          </div>
        )}

        {/* Nội dung câu hỏi & ô trả lời */}
        {question ? (
          <div className="arena-question-stage">
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
                      const headers = Array.isArray(block.headers) ? block.headers : [];
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
            </article>

            {/* Khu vực nhập/chọn đáp án theo 4 loại */}
            <div className="arena-answer-area">
              <AnswerInput
                question={question}
                value={draftAnswer}
                onChange={setDraftAnswer}
                disabled={isAnswerLocked}
                onSubmit={handlePressLockAnswer}
              />
            </div>

            {/* Trạng thái biên nhận & nút Chốt / Bỏ qua */}
            <div className="arena-submit-bar" aria-live="polite">
              {submitState === 'received' || serverMyAnswer?.received ? (
                <div className="arena-receipt-box arena-receipt-box--ok">
                  <span className="arena-receipt-box__icon" aria-hidden="true">✓</span>
                  <div>
                    <strong>Máy chủ đã nhận ✓</strong>
                    <div className="arena-receipt-box__sub">
                      {serverMyAnswer?.skipped || skippedLocally
                        ? 'Em đã chọn bỏ qua câu này.'
                        : 'Câu trả lời của em đã được khoá an toàn.'}
                    </div>
                  </div>
                </div>
              ) : submitState === 'sending' ? (
                <div className="arena-receipt-box">
                  <span className="arena-spinner arena-spinner--dark" aria-hidden="true" />
                  <span>Đang gửi…</span>
                </div>
              ) : (
                <>
                  {submitState === 'retry_error' && (
                    <div className="arena-alert arena-alert--error" style={{ width: '100%', marginBottom: '8px' }}>
                      <span>{submitErrorText || 'Chưa gửi được, em bấm Chốt lại'}</span>
                    </div>
                  )}

                  <div className="arena-submit-actions">
                    <button
                      type="button"
                      className="arena-btn arena-btn--amber arena-btn--lg arena-submit-main-btn"
                      onClick={handlePressLockAnswer}
                      disabled={isAnswerLocked || isAnswerEmpty(question, draftAnswer)}
                    >
                      Chốt đáp án
                    </button>
                    <button
                      type="button"
                      className="arena-btn arena-btn--secondary arena-btn--lg"
                      onClick={handlePressSkipQuestion}
                      disabled={isAnswerLocked}
                    >
                      Bỏ qua
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="arena-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
            <p className="arena-title-md">Đang chuẩn bị câu hỏi…</p>
          </div>
        )}
      </div>

      {/* Dải trạng thái trả lời & điểm số đến câu trước ở đáy màn hình */}
      <RankStrip snapshot={snapshot} userId={user?.id} />
    </div>
  );
}
