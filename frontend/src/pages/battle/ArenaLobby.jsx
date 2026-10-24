import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { battleApi, battleApiFlex, buildLobbyQuery } from './battleApi.js';
import { useBattleStream } from './useBattleStream.js';

import ConnectionBanner from './components/ConnectionBanner.jsx';
import ScopeLabel from './components/ScopeLabel.jsx';
import CreateRoomSheet from './components/CreateRoomSheet.jsx';
import FindMatchSheet from './components/FindMatchSheet.jsx';
import MatchWaiting from './components/MatchWaiting.jsx';
import PlayModePicker from './components/PlayModePicker.jsx';
import ArenaHall from './components/ArenaHall.jsx';

import '../../styles/arena.css';

const KIND_LABELS = {
  duel: 'Đấu đôi',
  team: 'Đấu đội',
  ffa: 'Nhiều người',
  class: 'Cả lớp cùng đấu',
};

function formatDateShort(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatCountdownMinSec(ms) {
  if (typeof ms !== 'number' || ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function ArenaLobby() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isStaff = user?.role === 'teacher' || user?.role === 'admin';
  const location = useLocation();
  // Plan 1.2: giáo viên dùng "Quiz lớp" (/practice/quiz); tab Đấu là Đấu trường của học sinh
  useEffect(() => {
    if (isStaff && location.pathname === '/practice/battle') navigate('/practice/quiz', { replace: true });
  }, [isStaff, location.pathname, navigate]);

  // Trạng thái chung từ /api/battle/me
  const [meData, setMeData] = useState(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Dữ liệu học sinh: sảnh, options, rank, leaderboard, history
  const [initialLobby, setInitialLobby] = useState(null);
  const [optionsCatalog, setOptionsCatalog] = useState(null);
  const [rankInfo, setRankInfo] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [historyList, setHistoryList] = useState([]);

  // Sheet / Modal học sinh
  const [showFindMatch, setShowFindMatch] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [createRoomInitialScope, setCreateRoomInitialScope] = useState(null);
  const [createRoomDefaultStyle, setCreateRoomDefaultStyle] = useState(null);
  const [showBotModal, setShowBotModal] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState('medium');
  const [busyBotStart, setBusyBotStart] = useState(false);

  // Ô nhập mã phòng 6 số & thao tác vào phòng / ghép nhanh từ Sảnh V6.9.4
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [busyJoinCode, setBusyJoinCode] = useState(false);
  const [busyJoinRoomId, setBusyJoinRoomId] = useState(null);
  const [busyQuickMatch, setBusyQuickMatch] = useState(false);
  const [busyToggleBadge, setBusyToggleBadge] = useState(false);

  // Bộ lọc query đồng bộ với GET /api/battle/lobby và SSE /api/battle/lobby/stream (V6.9.4)
  const [lobbyQueryParams, setLobbyQueryParams] = useState({});
  const lobbyQueryString = useMemo(
    () => buildLobbyQuery(lobbyQueryParams),
    [lobbyQueryParams]
  );

  // Dữ liệu dành riêng cho Giáo viên mở phòng lớp (§F)
  const [teacherClasses, setTeacherClasses] = useState([]);
  const [manualClassIdMode, setManualClassIdMode] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [tSubjectId, setTSubjectId] = useState('');
  const [tBranchId, setTBranchId] = useState('');
  const [tScopeMode, setTScopeMode] = useState('chapter'); // 'chapter' | 'topics'
  const [tChapter, setTChapter] = useState('');
  const [tTopicIds, setTTopicIds] = useState([]);
  const [tQuestionCount, setTQuestionCount] = useState(10);
  const [tSeconds, setTSeconds] = useState(30);
  const [tPlayMode, setTPlayMode] = useState({
    pacing: 'sync',
    scoring: 'accuracy',
    time_limit: 'per_question',
    total_minutes: null,
    reveal_policy: 'instant',
    show_live_board: true,
  });
  const [teacherOptions, setTeacherOptions] = useState(null);
  const [loadingTeacherOptions, setLoadingTeacherOptions] = useState(false);
  const [busyCreateClassRoom, setBusyCreateClassRoom] = useState(false);

  // 1. Gọi /api/battle/me đầu tiên
  const fetchMe = useCallback(async () => {
    setLoadingMe(true);
    try {
      const res = await battleApi.getMe();
      setMeData(res);
      return res;
    } catch (err) {
      setErrorMsg(
        err?.message ||
          err?.error ||
          'Chưa tải được thông tin Đấu Trường. Em hãy thử tải lại trang.'
      );
      return null;
    } finally {
      setLoadingMe(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Cờ khả năng từ /me
  const flags = useMemo(() => {
    const rawModes = meData?.modes || meData?.battle_modes || meData?.flags || {};
    const battleEnabled =
      meData?.battle_enabled !== undefined ? Boolean(meData.battle_enabled) : true;
    const emergencyStop = Boolean(meData?.battle_emergency_stop);
    return {
      battle_enabled: battleEnabled && !emergencyStop,
      emergency_stop: emergencyStop,
      class: Boolean(rawModes.class ?? true),
      duel_code: Boolean(rawModes.duel_code ?? true),
      lobby: Boolean(rawModes.lobby ?? true),
      matchmaking: Boolean(rawModes.matchmaking ?? true),
      vote: Boolean(rawModes.vote ?? false),
      ffa: Boolean(rawModes.ffa ?? true),
      team: Boolean(rawModes.team ?? true),
      ranked: Boolean(
        rawModes.ranked ?? meData?.ranked_enabled ?? meData?.battle_rank?.enabled ?? true
      ),
      self_created_ranked: Boolean(meData?.battle_rank?.self_created ?? false),
      leaderboard: Boolean(
        rawModes.leaderboard ?? meData?.leaderboard_enabled ?? false
      ),
      bot: Boolean(rawModes.bot ?? meData?.bot_enabled ?? true),
      self_paced: Boolean(rawModes.self_paced ?? false),
      speed_scoring: Boolean(rawModes.speed_scoring ?? false),
    };
  }, [meData]);

  // Kết nối luồng SSE sảnh cho học sinh (đóng luồng cũ và mở lại URL mới khi đổi bộ lọc query)
  const shouldConnectLobbyStream = Boolean(
    !loadingMe && !isStaff && flags.battle_enabled && (flags.lobby || flags.class || flags.matchmaking)
  );

  const lobbyStreamUrl = `/api/battle/lobby/stream${lobbyQueryString}`;

  const {
    snapshot: streamLobby,
    status: streamStatus,
    stopReason,
    offsetMs,
    applyExternalSnapshot,
  } = useBattleStream(lobbyStreamUrl, {
    enabled: shouldConnectLobbyStream,
    initialSnapshot: initialLobby,
  });

  const lobbySnapshot = streamLobby || initialLobby;

  // 2. Nạp dữ liệu khởi tạo theo vai trò (Học sinh vs Giáo viên)
  useEffect(() => {
    if (loadingMe || !meData) return undefined;
    let cancelled = false;

    if (!isStaff) {
      // Học sinh: nạp /options, /history, /rank, và /leaderboard (nếu bật)
      battleApi
        .getOptions({ count: 7 })
        .then((res) => {
          if (!cancelled && res) setOptionsCatalog(res);
        })
        .catch(() => {});

      battleApi
        .getHistory()
        .then((res) => {
          if (!cancelled) {
            const list = Array.isArray(res) ? res : res?.items || [];
            setHistoryList(list);
          }
        })
        .catch(() => {});

      battleApiFlex
        .getMyRank()
        .then((res) => {
          if (!cancelled && res) setRankInfo(res);
        })
        .catch(() => {});

      if (flags.leaderboard) {
        battleApiFlex
          .getLeaderboard()
          .then((res) => {
            if (!cancelled) {
              const items = Array.isArray(res) ? res : res?.items || res?.leaderboard || [];
              setLeaderboard(items.slice(0, 20));
            }
          })
          .catch(() => {});
      }
    } else {
      // Giáo viên / Quản trị: nạp danh sách lớp & lịch sử phòng đã mở
      battleApiFlex
        .getTeacherClassesSafe()
        .then((res) => {
          if (cancelled) return;
          const classes = Array.isArray(res) ? res : res?.classes || res?.items || [];
          setTeacherClasses(classes);
          if (classes.length > 0) {
            setSelectedClassId(String(classes[0].id));
          } else {
            setManualClassIdMode(true);
          }
        })
        .catch(() => {
          if (!cancelled) setManualClassIdMode(true);
        });

      battleApi
        .getHistory()
        .then((res) => {
          if (!cancelled) {
            const list = Array.isArray(res) ? res : res?.items || [];
            setHistoryList(list);
          }
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [loadingMe, meData, isStaff, flags.leaderboard]);

  // 2b. Nạp /api/battle/lobby mỗi khi khởi tạo hoặc đổi bộ lọc query (V6.9.4)
  useEffect(() => {
    if (loadingMe || !meData || isStaff) return undefined;
    let cancelled = false;

    battleApi
      .getLobby(lobbyQueryParams)
      .then((res) => {
        if (!cancelled && res) {
          setInitialLobby(res);
          applyExternalSnapshot(res);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [loadingMe, meData, isStaff, lobbyQueryString, lobbyQueryParams, applyExternalSnapshot]);

  // 3. Tự động điều hướng vào phòng khi ghép trận xong (current_room_id xuất hiện trong luồng sảnh)
  const activeMatchTicket = lobbySnapshot?.match ?? meData?.queue ?? null;
  const streamCurrentRoomId = lobbySnapshot?.current_room_id ?? null;

  useEffect(() => {
    if (!isStaff && streamCurrentRoomId) {
      navigate(`/practice/battle/rooms/${encodeURIComponent(streamCurrentRoomId)}`);
    }
  }, [isStaff, streamCurrentRoomId, navigate]);

  // 4. Nạp /options cho Giáo viên khi chọn Lớp / Môn / Số câu
  useEffect(() => {
    if (!isStaff || !selectedClassId) return undefined;
    let cancelled = false;
    setLoadingTeacherOptions(true);

    const params = {
      class_id: selectedClassId,
      count: tQuestionCount,
    };
    if (tSubjectId) {
      params.subject_id = tSubjectId;
    }

    battleApi
      .getOptions(params)
      .then((res) => {
        if (cancelled) return;
        setTeacherOptions(res);
        const subjects = Array.isArray(res?.subjects) ? res.subjects : [];
        if (!tSubjectId && subjects.length > 0) {
          setTSubjectId(String(subjects[0].id));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(
            err?.message ||
              'Không tải được danh mục bài học cho lớp này. Thầy cô kiểm tra lại phân công lớp–môn.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTeacherOptions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isStaff, selectedClassId, tSubjectId, tQuestionCount]);

  // Đồng hồ đếm ngược Giờ vàng & thời gian ván đang đấu (cập nhật mỗi giây)
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const goldenHours = useMemo(() => {
    const raw = lobbySnapshot?.golden_hours || meData?.golden_hours || [];
    return Array.isArray(raw) ? raw : [];
  }, [lobbySnapshot?.golden_hours, meData?.golden_hours]);

  // Phân loại phòng trong sảnh: phòng lớp ghim (kind === 'class') tách riêng khỏi Sảnh Đấu trường
  const allRooms = useMemo(() => {
    const raw = lobbySnapshot?.rooms || [];
    return Array.isArray(raw) ? raw : [];
  }, [lobbySnapshot?.rooms]);

  const pinnedClassRooms = useMemo(
    () => allRooms.filter((r) => r.kind === 'class'),
    [allRooms]
  );

  // Xử lý Học sinh nhập mã 6 số
  const handleJoinByCodeSubmit = async (e) => {
    e.preventDefault();
    const clean = joinCodeInput.replace(/\D/g, '');
    if (clean.length !== 6 || busyJoinCode) return;

    setBusyJoinCode(true);
    setErrorMsg('');
    try {
      const room = await battleApi.joinRoomByCode(clean);
      if (room?.id) {
        navigate(`/practice/battle/rooms/${encodeURIComponent(room.id)}`);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Mã phòng không đúng hoặc phòng đã bắt đầu.');
    } finally {
      setBusyJoinCode(false);
    }
  };

  // Xử lý Học sinh bấm "Vào" một phòng trên sảnh
  const handleJoinRoomCard = async (roomId) => {
    if (!roomId || busyJoinRoomId) return;
    setBusyJoinRoomId(roomId);
    setErrorMsg('');
    try {
      await battleApi.joinRoomById(roomId);
      navigate(`/practice/battle/rooms/${encodeURIComponent(roomId)}`);
    } catch (err) {
      setErrorMsg(err?.message || 'Không vào được phòng này.');
    } finally {
      setBusyJoinRoomId(null);
    }
  };

  // Xử lý Học sinh bấm "⚡ Đấu cùng" hoặc "⚡ Tìm bạn..." từ Sảnh V6.9.4
  const handleQuickMatchFromHall = useCallback(
    async (choiceScope = null) => {
      if (meData?.suspension || busyQuickMatch) return;
      setBusyQuickMatch(true);
      setErrorMsg('');
      try {
        // Hợp đồng API V6.9.4: hủy vé cũ bằng DELETE /match trước khi đổi lựa chọn mới
        if (activeMatchTicket) {
          await battleApi.cancelMatchmaking().catch(() => {});
        }

        const kinds = ['duel'];
        if (flags.ffa !== false) kinds.push('ffa');

        const choices = [];
        if (choiceScope && choiceScope.subject_id) {
          const cleanScope = { subject_id: Number(choiceScope.subject_id) };
          if (choiceScope.branch_id !== null && choiceScope.branch_id !== undefined && choiceScope.branch_id !== '') {
            cleanScope.branch_id = Number(choiceScope.branch_id);
          }
          if (Array.isArray(choiceScope.topic_ids) && choiceScope.topic_ids.length > 0) {
            cleanScope.topic_ids = choiceScope.topic_ids.map(Number);
          } else if (choiceScope.chapter && String(choiceScope.chapter).trim()) {
            cleanScope.chapter = String(choiceScope.chapter).trim();
          }
          choices.push(cleanScope);
        }

        const ticket = {
          kinds,
          choices,
          lengths: 'any',
          flex: 'gradual',
          ranked: Boolean(flags.ranked),
          bot_fill: false,
        };

        const res = await battleApiFlex.startFlexMatch(ticket);
        if (res?.current_room_id) {
          navigate(`/practice/battle/rooms/${encodeURIComponent(res.current_room_id)}`);
          return;
        }
        const queueData = res?.queue || ticket;
        setInitialLobby((prev) => ({
          ...(prev || {}),
          match: queueData,
        }));
      } catch (err) {
        setErrorMsg(err?.message || 'Không thể bắt đầu tìm đối thủ lúc này.');
      } finally {
        setBusyQuickMatch(false);
      }
    },
    [meData?.suspension, busyQuickMatch, activeMatchTicket, flags.ffa, flags.ranked, navigate]
  );

  // Mở Sheet tạo phòng từ Sảnh (điền sẵn môn/chương đang chọn và ưu tiên phòng công khai)
  const handleOpenCreateRoomFromHall = useCallback(
    (scope = null) => {
      setCreateRoomInitialScope(scope || null);
      setCreateRoomDefaultStyle(flags.lobby ? 'public_open' : 'private_code');
      setShowCreateRoom(true);
    },
    [flags.lobby]
  );

  // Xử lý Đấu với máy từ sảnh
  const handleStartBotFromLobby = async () => {
    if (busyBotStart) return;
    setBusyBotStart(true);
    setErrorMsg('');
    try {
      const res = await battleApiFlex.startBotBattle({
        choices: [],
        lengths: 'any',
        difficulty: botDifficulty,
      });
      setShowBotModal(false);
      if (res?.current_room_id) {
        navigate(`/practice/battle/rooms/${encodeURIComponent(res.current_room_id)}`);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Chưa tạo được ván luyện với máy.');
    } finally {
      setBusyBotStart(false);
    }
  };

  // Xử lý Ẩn / Hiện huy hiệu bậc học thuật
  const handleToggleRankBadge = async () => {
    if (!rankInfo?.rating || busyToggleBadge) return;
    const currentHidden = Boolean(rankInfo.rating.hidden);
    const nextHidden = !currentHidden;
    setBusyToggleBadge(true);
    setErrorMsg('');
    try {
      await battleApiFlex.updateRankVisibility(nextHidden);
      setRankInfo((prev) =>
        prev
          ? {
              ...prev,
              rating: { ...prev.rating, hidden: nextHidden },
            }
          : prev
      );
    } catch (err) {
      setErrorMsg(err?.message || 'Chưa đổi được cài đặt hiển thị huy hiệu.');
    } finally {
      setBusyToggleBadge(false);
    }
  };

  // Xử lý Giáo viên bấm "Mở phòng cho lớp"
  const handleTeacherOpenClassRoom = async (e) => {
    e.preventDefault();
    if (!selectedClassId || !tSubjectId || busyCreateClassRoom) return;

    const scope = { subject_id: Number(tSubjectId) };
    if (tBranchId) {
      scope.branch_id = Number(tBranchId);
    }
    if (tScopeMode === 'chapter') {
      if (!tChapter) {
        setErrorMsg('Thầy cô vui lòng chọn một Chương.');
        return;
      }
      scope.chapter = tChapter;
    } else if (tScopeMode === 'topics') {
      if (tTopicIds.length === 0) {
        setErrorMsg('Thầy cô vui lòng chọn ít nhất một Bài học.');
        return;
      }
      scope.topic_ids = tTopicIds;
    }

    const clampedSeconds = Math.min(180, Math.max(20, Number(tSeconds) || 30));

    setBusyCreateClassRoom(true);
    setErrorMsg('');
    try {
      const created = await battleApi.createRoom({
        kind: 'class',
        class_id: Number(selectedClassId),
        scope,
        question_count: Number(tQuestionCount),
        seconds: clampedSeconds,
        content_mode: 'fixed',
        visibility: 'code',
        // Chỉ gửi trục khác mặc định (payload cũ giữ luật V6.9.2)
        ...(tPlayMode.pacing !== 'sync' ? { pacing: tPlayMode.pacing } : {}),
        ...(tPlayMode.scoring !== 'accuracy' ? { scoring: tPlayMode.scoring } : {}),
        ...(tPlayMode.time_limit !== 'per_question'
          ? { time_limit: tPlayMode.time_limit, total_minutes: tPlayMode.total_minutes }
          : {}),
        ...(tPlayMode.pacing === 'self' && tPlayMode.reveal_policy !== 'instant'
          ? { reveal_policy: tPlayMode.reveal_policy }
          : {}),
        ...(tPlayMode.pacing === 'self' && tPlayMode.show_live_board === false
          ? { show_live_board: false }
          : {}),
      });
      if (created?.id) {
        navigate(
          `/practice/battle/rooms/${encodeURIComponent(created.id)}/projector`
        );
      }
    } catch (err) {
      setErrorMsg(
        err?.message ||
          'Không mở được phòng cho lớp. Thầy cô kiểm tra lại quyền phân công lớp – môn.'
      );
    } finally {
      setBusyCreateClassRoom(false);
    }
  };

  const canCreateAnyStudentRoom =
    flags.battle_enabled && (flags.duel_code || flags.lobby || flags.team || flags.ffa);

  // ===== MÀN HÌNH DÀNH CHO GIÁO VIÊN / QUẢN TRỊ (§F) =====
  if (isStaff) {
    const tSubjects = Array.isArray(teacherOptions?.subjects)
      ? teacherOptions.subjects
      : [];
    const tBranches = (teacherOptions?.branches || []).filter(
      (b) => !b.subject_id || Number(b.subject_id) === Number(tSubjectId)
    );
    const tChapters = (teacherOptions?.chapters || []).filter((ch) => {
      if (ch.subject_id && Number(ch.subject_id) !== Number(tSubjectId)) return false;
      if (tBranchId && ch.branch_id) return Number(ch.branch_id) === Number(tBranchId);
      return true;
    });
    const tTopics = (teacherOptions?.topics || []).filter((tp) => {
      if (tp.subject_id && Number(tp.subject_id) !== Number(tSubjectId)) return false;
      if (tBranchId && tp.branch_id) return Number(tp.branch_id) === Number(tBranchId);
      return true;
    });

    const toggleTeacherTopic = (id) => {
      const num = Number(id);
      setTTopicIds((prev) =>
        prev.includes(num) ? prev.filter((x) => x !== num) : [...prev, num]
      );
    };

    return (
      <div className="arena-page">
        <div className="arena-container">
          <header className="arena-card arena-card--dark" style={{ marginBottom: '18px' }}>
            <div className="arena-finish-strip" style={{ marginBottom: '14px' }} aria-hidden="true" />
            <div className="arena-row arena-row--between">
              <div>
                <span className="arena-chip arena-chip--amber">DÀNH CHO GIÁO VIÊN</span>
                <h1 className="arena-title-lg" style={{ marginTop: '6px' }}>
                  Quiz lớp · Mở phòng trực tiếp
                </h1>
                <p className="arena-subtitle">
                  Xin chào {user?.full_name || 'Thầy/Cô'}. Mở quiz cho cả lớp: cùng nhịp, tự chơi hoặc thi theo phút, chiếu lên màn hình 16:9.
                </p>
              </div>

              <div className="arena-row" style={{ gap: '10px' }}>
                {meData?.current_room_id && (
                  <Link
                    to={`/practice/battle/rooms/${encodeURIComponent(
                      meData.current_room_id
                    )}/projector`}
                    className="arena-btn arena-btn--amber"
                  >
                    ▶ Quay lại phòng đang mở
                  </Link>
                )}
              </div>
            </div>
          </header>

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

          {/* Biểu mẫu mở phòng cho lớp */}
          <section className="arena-card" style={{ marginBottom: '20px' }}>
            <h2 className="arena-title-md" style={{ marginBottom: '14px' }}>
              Thiết lập phòng đấu cho lớp
            </h2>

            <form onSubmit={handleTeacherOpenClassRoom} className="arena-teacher-form">
              <div className="arena-grid-2">
                {/* Chọn lớp */}
                <div>
                  <div className="arena-row arena-row--between">
                    <label htmlFor="teacher-class-select" className="arena-field-label">
                      1. Chọn lớp học
                    </label>
                    <button
                      type="button"
                      className="arena-link-inline"
                      onClick={() => setManualClassIdMode((v) => !v)}
                    >
                      {manualClassIdMode ? 'Chọn từ danh sách' : 'Nhập mã ID lớp'}
                    </button>
                  </div>

                  {manualClassIdMode || teacherClasses.length === 0 ? (
                    <input
                      id="teacher-class-select"
                      type="number"
                      className="arena-input arena-mono"
                      placeholder="Nhập class_id (VD: 12)…"
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      required
                    />
                  ) : (
                    <select
                      id="teacher-class-select"
                      className="arena-select"
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      required
                    >
                      {teacherClasses.map((cl) => (
                        <option key={cl.id} value={cl.id}>
                          Lớp {cl.name} (Khối {cl.grade}
                          {cl.student_count ? ` · ${cl.student_count} HS` : ''})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Chọn môn */}
                <div>
                  <label htmlFor="teacher-subject-select" className="arena-field-label">
                    2. Môn học được phân công
                  </label>
                  <select
                    id="teacher-subject-select"
                    className="arena-select"
                    value={tSubjectId}
                    onChange={(e) => {
                      setTSubjectId(e.target.value);
                      setTBranchId('');
                      setTChapter('');
                      setTTopicIds([]);
                    }}
                    disabled={loadingTeacherOptions}
                    required
                  >
                    <option value="">-- Chọn môn học --</option>
                    {tSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.count} câu)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Chọn Phân môn & Cách giới hạn phạm vi */}
              <div className="arena-grid-2" style={{ marginTop: '14px' }}>
                <div>
                  <label htmlFor="teacher-branch-select" className="arena-field-label">
                    3. Phân môn (tuỳ chọn)
                  </label>
                  <select
                    id="teacher-branch-select"
                    className="arena-select"
                    value={tBranchId}
                    onChange={(e) => {
                      setTBranchId(e.target.value);
                      setTChapter('');
                      setTTopicIds([]);
                    }}
                  >
                    <option value="">Tất cả phân môn</option>
                    {tBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="arena-field-label">4. Chọn nội dung theo</span>
                  <div className="arena-row" style={{ gap: '8px' }}>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--sm ${
                        tScopeMode === 'chapter'
                          ? 'arena-btn--primary'
                          : 'arena-btn--secondary'
                      }`}
                      onClick={() => setTScopeMode('chapter')}
                    >
                      Theo Chương
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--sm ${
                        tScopeMode === 'topics'
                          ? 'arena-btn--primary'
                          : 'arena-btn--secondary'
                      }`}
                      onClick={() => setTScopeMode('topics')}
                    >
                      Chọn từng Bài
                    </button>
                  </div>
                </div>
              </div>

              {/* Chọn Chương hoặc Bài cụ thể */}
              <div style={{ marginTop: '14px' }}>
                {tScopeMode === 'chapter' ? (
                  <div>
                    <label htmlFor="teacher-chapter-select" className="arena-field-label">
                      Chọn Chương (đủ ít nhất {tQuestionCount} câu)
                    </label>
                    <select
                      id="teacher-chapter-select"
                      className="arena-select"
                      value={tChapter}
                      onChange={(e) => setTChapter(e.target.value)}
                      required
                    >
                      <option value="">-- Chọn Chương --</option>
                      {tChapters.map((ch, idx) => (
                        <option key={ch.name || idx} value={ch.name}>
                          {ch.name} ({ch.count} câu)
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <span className="arena-field-label">
                      Chọn Bài học ({tTopicIds.length} bài đã chọn)
                    </span>
                    <div className="arena-topic-check-list">
                      {tTopics.length === 0 ? (
                        <p className="arena-empty-hint">
                          Chưa có bài học nào đủ câu cho cấu hình này.
                        </p>
                      ) : (
                        tTopics.map((tp) => {
                          const checked = tTopicIds.includes(Number(tp.id));
                          return (
                            <label
                              key={tp.id}
                              className={`arena-topic-check-item ${
                                checked ? 'arena-topic-check-item--checked' : ''
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleTeacherTopic(tp.id)}
                              />
                              <span className="arena-topic-check-item__name">
                                {tp.name}
                              </span>
                              <span className="arena-chip arena-mono">
                                {tp.count} câu
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Số câu & Thời gian mỗi câu (20 - 180 giây) */}
              <div className="arena-grid-2" style={{ marginTop: '14px' }}>
                <div>
                  <span className="arena-field-label">5. Số câu hỏi trong ván</span>
                  <div className="arena-row" style={{ gap: '8px' }}>
                    {[7, 10, 15].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        className={`arena-btn arena-btn--sm arena-mono ${
                          Number(tQuestionCount) === cnt
                            ? 'arena-btn--primary'
                            : 'arena-btn--secondary'
                        }`}
                        onClick={() => setTQuestionCount(cnt)}
                      >
                        {cnt} câu
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="teacher-seconds-input" className="arena-field-label">
                    6. Thời gian mỗi câu (20 – 180 giây)
                  </label>
                  <div className="arena-row" style={{ gap: '8px' }}>
                    <input
                      id="teacher-seconds-input"
                      type="number"
                      min={20}
                      max={180}
                      className="arena-input arena-mono"
                      style={{ maxWidth: '120px' }}
                      value={tSeconds}
                      onChange={(e) => setTSeconds(e.target.value)}
                    />
                    {[20, 30, 45, 60, 90].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        className={`arena-btn arena-btn--sm arena-mono ${
                          Number(tSeconds) === sec
                            ? 'arena-btn--primary'
                            : 'arena-btn--secondary'
                        }`}
                        onClick={() => setTSeconds(sec)}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {(flags.self_paced || flags.speed_scoring) && (
                <div style={{ marginTop: '20px' }}>
                  <div className="arena-field-label">7. Cách chơi &amp; tính điểm</div>
                  <PlayModePicker
                    value={tPlayMode}
                    onChange={setTPlayMode}
                    flags={flags}
                    kind="class"
                    isTeacher
                  />
                </div>
              )}

              <div style={{ marginTop: '20px' }}>
                <button
                  type="submit"
                  className="arena-btn arena-btn--amber arena-btn--lg"
                  disabled={busyCreateClassRoom || !flags.class || !flags.battle_enabled}
                >
                  {busyCreateClassRoom
                    ? 'Đang mở phòng lớp…'
                    : '🖥 Mở phòng & Chuyển sang màn chiếu 16:9'}
                </button>
              </div>
            </form>
          </section>

          {/* Lịch sử các ván đã mở của Giáo viên */}
          <section className="arena-card">
            <h2 className="arena-title-md" style={{ marginBottom: '12px' }}>
              Lịch sử phòng đã mở gần đây
            </h2>
            {historyList.length === 0 ? (
              <p className="arena-empty-hint">Chưa có ván đấu nào đã kết thúc.</p>
            ) : (
              <div className="arena-history-list">
                {historyList.map((item) => (
                  <div key={item.id} className="arena-history-row">
                    <div>
                      <div className="arena-row" style={{ gap: '8px' }}>
                        <span className="arena-chip arena-chip--accent">
                          {KIND_LABELS[item.kind] || 'Phòng lớp'}
                        </span>
                        <strong className="arena-history-row__scope">
                          <ScopeLabel scope={item.scope} options={teacherOptions} />
                        </strong>
                      </div>
                      <span className="arena-subtitle">
                        {formatDateShort(item.finished_at || item.created_at)}
                      </span>
                    </div>
                    <Link
                      to={`/practice/battle/rooms/${encodeURIComponent(
                        item.id
                      )}/projector`}
                      className="arena-btn arena-btn--secondary arena-btn--sm"
                    >
                      Xem thống kê
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  // ===== MÀN HÌNH SẢNH CHO HỌC SINH (§A + V6.9.1/V6.9.2/V6.9.4) =====
  const suspension = meData?.suspension;
  const rating = rankInfo?.rating || null;
  const season = rankInfo?.season || null;

  return (
    <div className="arena-page">
      <ConnectionBanner status={streamStatus} stopReason={stopReason} />

      <div className="arena-container">
        {/* Cảnh báo tạm khoá hoặc phản hồi báo cáo từ /me */}
        {suspension && (
          <div className="arena-alert arena-alert--error" role="alert">
            <div>
              <strong>Tài khoản của em đang tạm khoá tính năng Đấu</strong>
              <div style={{ fontSize: '0.88rem', marginTop: '2px' }}>
                Lý do: {suspension.reason || 'Vi phạm quy tắc phòng đấu'}
                {suspension.until
                  ? ` · Mở lại vào ${formatDateShort(suspension.until)}`
                  : ''}
              </div>
            </div>
          </div>
        )}

        {Array.isArray(meData?.report_feedbacks) &&
          meData.report_feedbacks.map((fb, idx) => (
            <div key={fb.id || idx} className="arena-alert arena-alert--info" role="status">
              <span>
                📬 Phản hồi báo cáo: {fb.message || 'Thầy cô đã xem xét báo cáo của em.'}
              </span>
            </div>
          ))}

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

        {/* Nút quay lại phòng đang diễn ra nếu học sinh lỡ thoát ra sảnh */}
        {meData?.current_room_id && (
          <div className="arena-card arena-card--pinned" style={{ marginBottom: '16px' }}>
            <div className="arena-row arena-row--between">
              <div>
                <span className="arena-chip arena-chip--amber">PHÒNG ĐANG DIỄN RA</span>
                <h2 className="arena-title-md" style={{ color: '#FFFFFF', marginTop: '6px' }}>
                  Em đang có một phòng đấu chưa kết thúc
                </h2>
              </div>
              <Link
                to={`/practice/battle/rooms/${encodeURIComponent(
                  meData.current_room_id
                )}`}
                className="arena-btn arena-btn--amber arena-btn--lg"
              >
                Quay lại phòng →
              </Link>
            </div>
          </div>
        )}

        {/* BANNER GIỜ VÀNG (Đang diễn ra hoặc sắp mở trong 30 phút) */}
        {goldenHours.length > 0 && (
          <section className="arena-golden-list" aria-label="Khung giờ vàng thi đấu">
            {goldenHours.map((gh) => {
              const serverNow = nowTick + offsetMs;
              const isLive =
                Boolean(gh.active) &&
                typeof gh.starts_at === 'number' &&
                serverNow >= gh.starts_at &&
                (!gh.ends_at || serverNow < gh.ends_at);
              const leftMs = isLive
                ? Math.max(0, (gh.ends_at || serverNow) - serverNow)
                : typeof gh.starts_at === 'number'
                ? Math.max(0, gh.starts_at - serverNow)
                : gh.countdown_ms || 0;

              const subjObj = (optionsCatalog?.subjects || []).find(
                (s) => Number(s.id) === Number(gh.subject_id)
              );
              const subjName = subjObj?.name || gh.subject_name || 'Khoa học tự nhiên';

              return (
                <div
                  key={gh.id}
                  className={`arena-golden-banner ${
                    isLive ? 'arena-golden-banner--live' : ''
                  }`}
                >
                  <div className="arena-golden-banner__left">
                    <span className="arena-chip arena-chip--amber">
                      {isLive ? '🔥 GIỜ VÀNG ĐANG DIỄN RA' : '⏰ SẮP TỚI GIỜ VÀNG'}
                    </span>
                    <div className="arena-golden-banner__title">
                      Khối {gh.grade} · {subjName}
                    </div>
                  </div>

                  <div className="arena-golden-banner__right">
                    {typeof gh.participants === 'number' && gh.participants > 0 && (
                      <span className="arena-golden-banner__stat">
                        <span className="arena-pulse-dot arena-pulse-dot--amber" />
                        <strong>{gh.participants}</strong> bạn đang tham gia
                      </span>
                    )}
                    <span className="arena-golden-banner__clock arena-mono">
                      {isLive ? 'Còn ' : 'Mở sau '}
                      {formatCountdownMinSec(leftMs)}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* KHỐI CHÀO MỪNG + NÚT CHÍNH (TÌM ĐỐI THỦ / TẠO PHÒNG / ĐẤU VỚI MÁY / NHẬP MÃ) */}
        <section className="arena-card arena-card--dark arena-hero-banner">
          <div className="arena-finish-strip" style={{ marginBottom: '16px' }} aria-hidden="true" />

          <div className="arena-hero-banner__top">
            <div>
              <div className="arena-row" style={{ gap: '8px', marginBottom: '6px' }}>
                <span className="arena-chip arena-chip--amber">ĐẤU TRƯỜNG KIẾN THỨC</span>
                <span className="arena-chip">Đúng là chính</span>
              </div>
              <h1 className="arena-title-lg" style={{ color: '#FFFFFF' }}>
                Chào {user?.full_name || 'em'}, sẵn sàng thử sức hôm nay?
              </h1>
              <p className="arena-subtitle">
                Ôn luyện vững vàng qua từng câu hỏi cùng bạn bè cùng khối.
              </p>
            </div>

            {/* Ô nhập mã 6 số vào nhanh */}
            {flags.battle_enabled && (flags.duel_code || flags.class) && (
              <form className="arena-code-join-form" onSubmit={handleJoinByCodeSubmit}>
                <label htmlFor="arena-join-code-input" className="arena-code-join-form__label">
                  Có mã phòng 6 số?
                </label>
                <div className="arena-code-join-form__row">
                  <input
                    id="arena-join-code-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={7}
                    placeholder="482 910"
                    className="arena-input arena-mono arena-code-join-form__input"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value)}
                    disabled={Boolean(suspension)}
                  />
                  <button
                    type="submit"
                    className="arena-btn arena-btn--amber"
                    disabled={
                      busyJoinCode ||
                      Boolean(suspension) ||
                      joinCodeInput.replace(/\D/g, '').length !== 6
                    }
                  >
                    {busyJoinCode ? 'Đang vào…' : 'Vào phòng'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Hàng nút hành động chính */}
          <div className="arena-hero-actions">
            {flags.battle_enabled && flags.matchmaking && (
              <button
                type="button"
                className="arena-btn arena-btn--amber arena-btn--lg arena-hero-actions__main"
                onClick={() => setShowFindMatch(true)}
                disabled={Boolean(suspension) || Boolean(activeMatchTicket)}
              >
                ⚡ Tìm đối thủ
              </button>
            )}

            {canCreateAnyStudentRoom && (
              <button
                type="button"
                className="arena-btn arena-btn--ghost-light arena-btn--lg"
                onClick={() => {
                  setCreateRoomInitialScope(null);
                  setCreateRoomDefaultStyle(null);
                  setShowCreateRoom(true);
                }}
                disabled={Boolean(suspension)}
              >
                + Tạo phòng
              </button>
            )}

            {flags.battle_enabled && flags.bot && (
              <button
                type="button"
                className="arena-btn arena-btn--ghost-light arena-btn--lg"
                onClick={() => setShowBotModal(true)}
                disabled={Boolean(suspension)}
              >
                🤖 Luyện đấu với máy
              </button>
            )}
          </div>
        </section>

        {/* MÀN CHỜ GHÉP TRẬN LINH HOẠT (Khi học sinh đang có vé match trong sảnh) */}
        {activeMatchTicket && (
          <section style={{ marginTop: '16px' }}>
            <MatchWaiting
              match={activeMatchTicket}
              options={optionsCatalog}
              offsetMs={offsetMs}
              onRoomJoined={(roomId) =>
                navigate(`/practice/battle/rooms/${encodeURIComponent(roomId)}`)
              }
              onCancelled={() => {
                fetchMe();
              }}
              onError={(msg) => setErrorMsg(msg)}
            />
          </section>
        )}

        {/* THẺ GHIM "CẢ LỚP CÙNG ĐẤU" (Khi lớp có phòng kind:'class' đang mở) */}
        {pinnedClassRooms.length > 0 && (
          <section style={{ marginTop: '16px' }} aria-label="Phòng của lớp đang mở">
            {pinnedClassRooms.map((cRoom) => {
              const pCount = Number(cRoom.players?.length ?? cRoom.players ?? 0);
              return (
                <div
                  key={cRoom.id}
                  className="arena-card arena-card--pinned"
                  style={{ marginBottom: '12px' }}
                >
                  <div className="arena-row arena-row--between">
                    <div>
                      <div className="arena-row" style={{ gap: '8px', marginBottom: '6px' }}>
                        <span className="arena-chip arena-chip--live">
                          <span className="arena-pulse-dot" /> Đang mở · {pCount} bạn đã vào
                        </span>
                        <span className="arena-chip arena-chip--amber">
                          Cả lớp cùng đấu
                        </span>
                      </div>
                      <h2 className="arena-title-md" style={{ color: '#FFFFFF' }}>
                        Phòng của {cRoom.host_name || 'Thầy/Cô'} ·{' '}
                        <ScopeLabel
                          scope={cRoom.scope}
                          scopeLabel={cRoom.scope_label}
                          options={optionsCatalog}
                        />
                      </h2>
                      <p className="arena-subtitle">
                        {cRoom.question_count || 7} câu · {cRoom.seconds || 30} giây/câu
                      </p>
                    </div>

                    <button
                      type="button"
                      className="arena-btn arena-btn--amber arena-btn--lg"
                      onClick={() => handleJoinRoomCard(cRoom.id)}
                      disabled={busyJoinRoomId === cRoom.id || Boolean(suspension)}
                    >
                      {busyJoinRoomId === cRoom.id ? 'Đang vào…' : 'Vào ngay →'}
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* THẺ BẬC HỌC THUẬT CỦA EM + BẢNG CAO THỦ (nếu bật) */}
        {rating && (
          <section className="arena-rank-And-board" style={{ marginTop: '16px' }}>
            <div className="arena-card arena-rank-card">
              <div className="arena-row arena-row--between">
                <div className="arena-row" style={{ gap: '12px' }}>
                  <div className="arena-rank-emblem" aria-hidden="true">
                    🏅
                  </div>
                  <div>
                    <div className="arena-row" style={{ gap: '8px' }}>
                      <span className="arena-rank-tier-name">
                        {rating.tier_name || rating.tier || 'Tập sự'}
                        {rating.division ? ` · Cấp ${rating.division}` : ''}
                      </span>
                      {typeof rating.lp === 'number' && (
                        <span className="arena-chip arena-chip--amber arena-mono">
                          {rating.lp} LP
                        </span>
                      )}
                    </div>
                    <p className="arena-subtitle">
                      {rating.placement_remaining > 0
                        ? `Đang định vị ${rating.placement_remaining} ván`
                        : season?.name
                        ? `Mùa học thuật: ${season.name}`
                        : 'Bậc học thuật cá nhân · Tính theo độ chính xác và phạm vi kiến thức'}
                    </p>
                  </div>
                </div>

                {(rating.can_show || rating.can_toggle_visibility || !rating.hidden) && (
                  <button
                    type="button"
                    className="arena-btn arena-btn--secondary arena-btn--sm"
                    onClick={handleToggleRankBadge}
                    disabled={busyToggleBadge || (rating.hidden && rating.can_show === false)}
                  >
                    {rating.hidden ? '👁 Hiện huy hiệu' : '🙈 Ẩn huy hiệu'}
                  </button>
                )}
              </div>
            </div>

            {flags.leaderboard && leaderboard.length > 0 && (
              <div className="arena-card arena-leaderboard-card">
                <div className="arena-row arena-row--between" style={{ marginBottom: '10px' }}>
                  <h3 className="arena-title-md">🌟 Bảng cao thủ cùng khối</h3>
                  <span className="arena-subtitle" style={{ margin: 0 }}>
                    Các bạn đã chọn hiển thị huy hiệu
                  </span>
                </div>
                <div className="arena-leaderboard-list">
                  {leaderboard.map((entry, idx) => (
                    <div key={entry.user_id || entry.id || idx} className="arena-leaderboard-item">
                      <span className="arena-leaderboard-item__pos arena-mono">
                        #{entry.rank ?? idx + 1}
                      </span>
                      <span className="arena-leaderboard-item__name">
                        {entry.name}
                        {entry.class_name ? ` (${entry.class_name})` : ''}
                      </span>
                      <span className="arena-chip arena-chip--amber">
                        {entry.tier_name || entry.tier}
                        {entry.division ? ` ${entry.division}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* SẢNH ĐẤU TRƯỜNG V6.9.4 (THEO MÔN: PHÒNG CHỜ · ĐANG TÌM · ĐANG ĐẤU) */}
        {flags.lobby && (
          <ArenaHall
            lobbySnapshot={lobbySnapshot}
            optionsCatalog={optionsCatalog}
            flags={flags}
            suspension={suspension}
            activeMatchTicket={activeMatchTicket}
            offsetMs={offsetMs}
            nowTick={nowTick}
            busyJoinRoomId={busyJoinRoomId}
            busyQuickMatch={busyQuickMatch}
            onJoinRoom={handleJoinRoomCard}
            onQuickMatch={handleQuickMatchFromHall}
            onOpenCreateRoom={handleOpenCreateRoomFromHall}
            onFilterQueryChange={setLobbyQueryParams}
          />
        )}

        {/* MỤC "VÁN ĐẤU CỦA EM" TỪ /history */}
        <section className="arena-card" style={{ marginTop: '22px' }}>
          <h2 className="arena-title-md" style={{ marginBottom: '12px' }}>
            Ván đấu của em
          </h2>
          {historyList.length === 0 ? (
            <p className="arena-empty-hint">
              Em chưa có ván đấu nào đã kết thúc. Hãy tham gia một ván để thử sức nhé!
            </p>
          ) : (
            <div className="arena-history-list">
              {historyList.map((item) => {
                const rankText =
                  item.me && typeof item.me.rank === 'number'
                    ? `Hạng ${item.me.rank}/${item.me.participant_count ?? '-'}`
                    : null;

                return (
                  <div key={item.id} className="arena-history-row">
                    <div className="arena-history-row__info">
                      <div className="arena-row" style={{ gap: '8px' }}>
                        <span className="arena-chip">
                          {item.has_bots
                            ? '🤖 Đấu với máy'
                            : KIND_LABELS[item.kind] || 'Ván đấu'}
                        </span>
                        <strong className="arena-history-row__scope">
                          <ScopeLabel
                            scope={item.scope}
                            scopeLabel={item.scope_label}
                            options={optionsCatalog}
                          />
                        </strong>
                        {rankText && (
                          <span className="arena-chip arena-chip--amber arena-mono">
                            {rankText}
                          </span>
                        )}
                      </div>
                      <span className="arena-subtitle">
                        {formatDateShort(item.finished_at || item.created_at)}
                        {item.me?.points !== undefined
                          ? ` · ${item.me.points} điểm`
                          : ''}
                      </span>
                    </div>

                    <Link
                      to={`/practice/battle/rooms/${encodeURIComponent(item.id)}`}
                      className="arena-btn arena-btn--secondary arena-btn--sm"
                    >
                      Xem lại kết quả
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* SHEET TẠO PHÒNG MỚI */}
      {showCreateRoom && (
        <CreateRoomSheet
          flags={flags}
          initialScope={createRoomInitialScope}
          initialRoomStyleId={createRoomDefaultStyle}
          onClose={() => setShowCreateRoom(false)}
          onCreated={(room) => {
            setShowCreateRoom(false);
            if (room?.id) {
              navigate(`/practice/battle/rooms/${encodeURIComponent(room.id)}`);
            }
          }}
        />
      )}

      {/* SHEET TÌM ĐỐI THỦ LINH HOẠT */}
      {showFindMatch && (
        <FindMatchSheet
          flags={flags}
          initialOptions={optionsCatalog}
          onClose={() => setShowFindMatch(false)}
          onMatchedRoom={(roomId) => {
            setShowFindMatch(false);
            navigate(`/practice/battle/rooms/${encodeURIComponent(roomId)}`);
          }}
          onQueued={(queueData) => {
            setShowFindMatch(false);
            if (queueData) {
              setInitialLobby((prev) => ({
                ...(prev || {}),
                match: queueData,
              }));
            }
          }}
        />
      )}

      {/* MODAL CHỌN ĐỘ KHÓ KHI LUYỆN ĐẤU VỚI MÁY */}
      {showBotModal && (
        <div
          className="arena-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="arena-bot-modal-title"
        >
          <div className="arena-sheet" style={{ maxWidth: '440px' }}>
            <div className="arena-sheet__header">
              <h3 id="arena-bot-modal-title" className="arena-title-md">
                🤖 Luyện đấu với máy
              </h3>
              <button
                type="button"
                className="arena-btn arena-btn--secondary arena-btn--sm"
                onClick={() => setShowBotModal(false)}
              >
                Đóng
              </button>
            </div>

            <div className="arena-sheet__body">
              <p className="arena-subtitle" style={{ marginTop: 0, marginBottom: '14px' }}>
                Ván luyện với máy bắt đầu ngay lập tức và <strong>không tính hạng</strong>.
              </p>

              <span className="arena-field-label">Chọn mức độ của Đối thủ máy</span>
              <div className="arena-bot-diff-list">
                {[
                  {
                    id: 'easy',
                    title: 'Dễ · Khởi động nhẹ nhàng',
                    desc: 'Phù hợp khi em mới ôn lại bài học.',
                  },
                  {
                    id: 'medium',
                    title: 'Vừa · Cân sức cùng khối',
                    desc: 'Tốc độ và độ chính xác tương đương bạn học khá.',
                  },
                  {
                    id: 'hard',
                    title: 'Khó · Thử thách vững vàng',
                    desc: 'Đối thủ máy trả lời rất chắc chắn ở các câu vận dụng.',
                  },
                ].map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={botDifficulty === d.id}
                    className={`arena-choice-tile ${
                      botDifficulty === d.id ? 'arena-choice-tile--active' : ''
                    }`}
                    onClick={() => setBotDifficulty(d.id)}
                  >
                    <div className="arena-choice-tile__title">{d.title}</div>
                    <div className="arena-choice-tile__desc">{d.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="arena-sheet__footer">
              <button
                type="button"
                className="arena-btn arena-btn--secondary"
                onClick={() => setShowBotModal(false)}
                disabled={busyBotStart}
              >
                Huỷ
              </button>
              <button
                type="button"
                className="arena-btn arena-btn--amber"
                onClick={handleStartBotFromLobby}
                disabled={busyBotStart}
              >
                {busyBotStart ? 'Đang vào ván…' : 'Vào đấu với máy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
