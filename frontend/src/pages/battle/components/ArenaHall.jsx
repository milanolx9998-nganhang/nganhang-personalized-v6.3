import React, { useState, useEffect, useMemo, useRef } from 'react';
import ScopeLabel from './ScopeLabel.jsx';

const KIND_LABELS = {
  duel: 'Đấu đôi',
  team: 'Đấu đội',
  ffa: 'Nhiều người',
  class: 'Cả lớp cùng đấu',
};

const COLLAPSED_LIVE_LIMIT = 3;

function getSubjectIcon(name = '', id = null) {
  if (id === null || id === 'unselected') return '🗳';
  const lower = String(name).toLowerCase();
  if (lower.includes('khoa học tự nhiên') || lower.includes('khtn') || lower.includes('vật lí') || lower.includes('hoá') || lower.includes('sinh')) {
    return '🔬';
  }
  if (lower.includes('toán')) return '📐';
  if (lower.includes('anh') || lower.includes('ngoại ngữ')) return '🌍';
  if (lower.includes('văn') || lower.includes('ngữ văn')) return '📖';
  if (lower.includes('lịch sử') || lower.includes('địa') || lower.includes('sử')) return '🏛';
  if (lower.includes('tin')) return '💻';
  if (lower.includes('công dân') || lower.includes('gdcd')) return '⚖️';
  if (lower.includes('công nghệ')) return '🛠';
  return '📚';
}

function formatElapsedShort(ms) {
  if (typeof ms !== 'number' || Number.isNaN(ms) || ms < 0) return 'Vừa mở';
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return secs > 0 ? `${mins}p ${secs}s` : `${mins}p`;
}

function getRoomSubjectIds(scope) {
  if (!scope) return [];
  if (Array.isArray(scope.subject_ids) && scope.subject_ids.length > 0) {
    return scope.subject_ids.map(Number).filter((n) => !Number.isNaN(n) && n > 0);
  }
  if (scope.subject_id !== null && scope.subject_id !== undefined && scope.subject_id !== '') {
    const n = Number(scope.subject_id);
    return !Number.isNaN(n) && n > 0 ? [n] : [];
  }
  return [];
}

/**
 * Định dạng câu hiển thị cho một nhóm đang tìm đối thủ (seeking / seeking_any).
 * Hợp đồng V6.9.4: khi chỉ có 1 người (count === null && has_waiters || count === 1),
 * hiển thị "Đang có bạn chờ ghép", tuyệt đối không đổi null thành 0 hay 1.
 */
function formatSeekingWaiterText(count, hasWaiters = true) {
  if (typeof count === 'number' && count >= 2) {
    return `${count} bạn cùng khối đang tìm đối thủ`;
  }
  if (count === 1 || (count === null && hasWaiters !== false)) {
    return 'Đang có bạn chờ ghép';
  }
  return 'Đang có bạn chờ ghép';
}

/**
 * Định dạng dòng tổng hợp trên tiêu đề khối môn từ subjects[].
 */
function formatSubjectHeaderSummary(subj) {
  if (!subj) return '';
  const parts = [];
  const waiting = Number(subj.waiting) || 0;
  const live = Number(subj.live) || 0;
  const seeking = subj.seeking;
  const hasSeekers = Boolean(subj.has_seekers) || (typeof seeking === 'number' && seeking > 0);

  if (waiting > 0) {
    parts.push(`${waiting} phòng chờ`);
  }
  if (hasSeekers) {
    if (typeof seeking === 'number' && seeking >= 2) {
      parts.push(`${seeking} bạn đang tìm`);
    } else {
      parts.push('Đang có bạn chờ ghép');
    }
  }
  if (live > 0) {
    parts.push(`${live} ván đang đấu`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'Chưa có hoạt động';
}

/**
 * Định dạng badge số đếm trên Chip Môn học (không lộ số 1 khi seeking === null).
 */
function formatSubjectChipBadge(subj) {
  if (!subj) return '0';
  const waiting = Number(subj.waiting) || 0;
  const live = Number(subj.live) || 0;
  const seeking = subj.seeking;
  const hasSeekers = Boolean(subj.has_seekers) || (typeof seeking === 'number' && seeking > 0);

  if (hasSeekers && (seeking === null || seeking === 1)) {
    const base = waiting + live;
    return base > 0 ? `${base}+` : '●';
  }
  const total = waiting + (typeof seeking === 'number' ? seeking : 0) + live;
  return String(total);
}

export default function ArenaHall({
  lobbySnapshot,
  optionsCatalog,
  flags = {},
  suspension = null,
  activeMatchTicket = null,
  offsetMs = 0,
  nowTick = Date.now(),
  busyJoinRoomId = null,
  busyQuickMatch = false,
  onJoinRoom,
  onQuickMatch,
  onOpenCreateRoom,
  onFilterQueryChange,
}) {
  // Bộ lọc Sảnh V6.9.4: Môn -> Phân môn -> Chương -> Bài + Tab + Kiểu đấu + Còn chỗ
  const [selectedSubject, setSelectedSubject] = useState(''); // '' | '<id>' | 'unselected'
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedChapter, setSelectedChapter] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [selectedKind, setSelectedKind] = useState('');
  const [onlyOpenSlot, setOnlyOpenSlot] = useState(true);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'waiting' | 'seeking' | 'live'

  // Sheet lọc trên Mobile
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  // Trạng thái mở rộng dải "Đang so tài" theo từng môn (giữ nguyên qua các nhịp SSE)
  const [expandedLiveMap, setExpandedLiveMap] = useState({});

  // Lưu bản chụp subjects[] khi không lọc để hàng chip môn không bị mất các môn khác khi chọn 1 môn
  const [unfilteredSubjectsCache, setUnfilteredSubjectsCache] = useState([]);
  const [unfilteredSeekingAnyCache, setUnfilteredSeekingAnyCache] = useState({
    count: 0,
    has_waiters: false,
  });

  const isUnfilteredQuery =
    !selectedSubject && !selectedBranch && !selectedChapter && !selectedTopicId;

  useEffect(() => {
    if (isUnfilteredQuery && Array.isArray(lobbySnapshot?.subjects)) {
      setUnfilteredSubjectsCache(lobbySnapshot.subjects);
      if (lobbySnapshot?.seeking_any) {
        setUnfilteredSeekingAnyCache(lobbySnapshot.seeking_any);
      }
    }
  }, [isUnfilteredQuery, lobbySnapshot?.subjects, lobbySnapshot?.seeking_any]);

  // Báo query hợp lệ lên ArenaLobby để đồng bộ GET /api/battle/lobby và SSE /api/battle/lobby/stream
  const lastQueryKeyRef = useRef('');
  useEffect(() => {
    if (typeof onFilterQueryChange !== 'function') return;
    const isNumericSubject = /^[1-9]\d*$/.test(String(selectedSubject).trim());
    const nextQuery = isNumericSubject
      ? {
          subject_id: String(selectedSubject).trim(),
          ...(selectedBranch ? { branch_id: String(selectedBranch).trim() } : {}),
          ...(selectedChapter ? { chapter: String(selectedChapter).trim() } : {}),
          ...(selectedTopicId ? { topic_id: String(selectedTopicId).trim() } : {}),
        }
      : {};
    const key = JSON.stringify(nextQuery);
    if (key !== lastQueryKeyRef.current) {
      lastQueryKeyRef.current = key;
      onFilterQueryChange(nextQuery);
    }
  }, [
    selectedSubject,
    selectedBranch,
    selectedChapter,
    selectedTopicId,
    onFilterQueryChange,
  ]);

  const serverNow = nowTick + offsetMs;

  // Dữ liệu thô từ snapshot
  const rawWaitingRooms = useMemo(() => {
    const list = Array.isArray(lobbySnapshot?.rooms) ? lobbySnapshot.rooms : [];
    return list.filter((r) => r && r.kind !== 'class');
  }, [lobbySnapshot?.rooms]);

  const rawLiveRooms = useMemo(() => {
    const list = Array.isArray(lobbySnapshot?.live) ? lobbySnapshot.live : [];
    return list.filter((r) => r && r.kind !== 'class');
  }, [lobbySnapshot?.live]);

  const rawSeekingList = useMemo(() => {
    const list = Array.isArray(lobbySnapshot?.seeking) ? lobbySnapshot.seeking : [];
    return list.filter(
      (s) => s && (s.has_waiters !== false || (typeof s.count === 'number' && s.count > 0))
    );
  }, [lobbySnapshot?.seeking]);

  const seekingAny = useMemo(() => {
    const raw = lobbySnapshot?.seeking_any;
    if (!raw || typeof raw !== 'object') {
      return { count: 0, has_waiters: false };
    }
    return {
      count: raw.count ?? 0,
      has_waiters: Boolean(raw.has_waiters) || (typeof raw.count === 'number' && raw.count > 0),
    };
  }, [lobbySnapshot?.seeking_any]);

  // Bản đồ bài gợi ý (suggestions từ /options) để gắn nhãn "🎯 Bài em đang học" / "💪 Bài cần gỡ điểm"
  const suggestionLookup = useMemo(() => {
    const topicMap = new Map();
    const chapterSet = new Set();
    const subjectSet = new Set();
    const enrichedList = [];

    const rawSugs = Array.isArray(optionsCatalog?.suggestions)
      ? optionsCatalog.suggestions
      : [];
    const allTopics = Array.isArray(optionsCatalog?.topics) ? optionsCatalog.topics : [];
    const allSubjects = Array.isArray(optionsCatalog?.subjects)
      ? optionsCatalog.subjects
      : [];

    rawSugs.forEach((sug) => {
      const tId = Number(sug.topic_id);
      const tp = allTopics.find((t) => Number(t.id) === tId);
      const reason = sug.reason === 'weak' ? 'weak' : 'recent';
      topicMap.set(tId, { reason, topic: tp || null });
      if (tp) {
        const sObj = allSubjects.find((s) => Number(s.id) === Number(tp.subject_id));
        if (tp.subject_id) subjectSet.add(Number(tp.subject_id));
        if (tp.subject_id && tp.chapter) {
          chapterSet.add(`${tp.subject_id}::${tp.chapter}`);
        }
        enrichedList.push({
          topic_id: tId,
          reason,
          topic: tp,
          subject_name: sObj?.name || `Môn ${tp.subject_id}`,
        });
      }
    });

    return { topicMap, chapterSet, subjectSet, enrichedList };
  }, [optionsCatalog]);

  // Kiểm tra một phòng chờ có khớp bài gợi ý của học sinh không
  const getRoomSuggestionBadge = (room) => {
    const scope = room?.scope;
    if (!scope) return null;
    if (Array.isArray(scope.topic_ids) && scope.topic_ids.length > 0) {
      for (let i = 0; i < scope.topic_ids.length; i += 1) {
        const hit = suggestionLookup.topicMap.get(Number(scope.topic_ids[i]));
        if (hit) {
          return hit.reason === 'weak'
            ? { text: '💪 Bài cần gỡ điểm', className: 'arena-chip--warn' }
            : { text: '🎯 Bài em đang học', className: 'arena-chip--live' };
        }
      }
    }
    const ch = scope.chapter || room?.scope_label?.chapter;
    if (scope.subject_id && ch && suggestionLookup.chapterSet.has(`${scope.subject_id}::${ch}`)) {
      return { text: '🎯 Chương em đang học', className: 'arena-chip--live' };
    }
    return null;
  };

  // Danh mục Phân môn -> Chương -> Bài theo môn đang chọn
  const availableSubjects = useMemo(() => {
    const map = new Map();
    (optionsCatalog?.subjects || []).forEach((s) => {
      if (s && s.id != null) {
        map.set(Number(s.id), { id: Number(s.id), name: s.name });
      }
    });
    (unfilteredSubjectsCache || []).forEach((s) => {
      if (s && s.id != null && !map.has(Number(s.id))) {
        map.set(Number(s.id), { id: Number(s.id), name: s.name });
      }
    });
    (lobbySnapshot?.subjects || []).forEach((s) => {
      if (s && s.id != null && !map.has(Number(s.id))) {
        map.set(Number(s.id), { id: Number(s.id), name: s.name });
      }
    });
    return Array.from(map.values());
  }, [optionsCatalog?.subjects, unfilteredSubjectsCache, lobbySnapshot?.subjects]);

  const availableBranches = useMemo(() => {
    const rawBranches = Array.isArray(optionsCatalog?.branches) ? optionsCatalog.branches : [];
    const allTopics = Array.isArray(optionsCatalog?.topics) ? optionsCatalog.topics : [];
    const isNumericSubject = /^[1-9]\d*$/.test(String(selectedSubject));
    if (!isNumericSubject) return [];

    const subjIdNum = Number(selectedSubject);
    const branchIdsOfSubj = new Set(
      allTopics
        .filter((t) => Number(t.subject_id) === subjIdNum && t.branch_id != null)
        .map((t) => Number(t.branch_id))
    );

    return rawBranches.filter((b) => {
      if (b.subject_id != null) return Number(b.subject_id) === subjIdNum;
      return branchIdsOfSubj.has(Number(b.id));
    });
  }, [optionsCatalog?.branches, optionsCatalog?.topics, selectedSubject]);

  const availableChapters = useMemo(() => {
    const isNumericSubject = /^[1-9]\d*$/.test(String(selectedSubject));
    if (!isNumericSubject) return [];
    const subjIdNum = Number(selectedSubject);
    const branchIdNum = selectedBranch ? Number(selectedBranch) : null;

    const allTopics = Array.isArray(optionsCatalog?.topics) ? optionsCatalog.topics : [];
    const rawChapters = Array.isArray(optionsCatalog?.chapters) ? optionsCatalog.chapters : [];

    const chapterNames = new Set();

    // 1. Từ topics khớp môn & phân môn
    allTopics.forEach((tp) => {
      if (Number(tp.subject_id) !== subjIdNum) return;
      if (branchIdNum && tp.branch_id != null && Number(tp.branch_id) !== branchIdNum) return;
      if (tp.chapter && String(tp.chapter).trim()) {
        chapterNames.add(String(tp.chapter).trim());
      }
    });

    // 2. Từ chapters trong optionsCatalog
    rawChapters.forEach((ch) => {
      if (ch.subject_id != null && Number(ch.subject_id) !== subjIdNum) return;
      if (branchIdNum) {
        if (ch.branch_id != null && Number(ch.branch_id) !== branchIdNum) return;
        if (ch.branch_id == null && Array.isArray(ch.topic_ids)) {
          const matchesBranch = ch.topic_ids.some((tid) => {
            const tp = allTopics.find((t) => Number(t.id) === Number(tid));
            return tp && Number(tp.branch_id) === branchIdNum;
          });
          if (!matchesBranch && allTopics.length > 0) return;
        }
      }
      if (ch.name && String(ch.name).trim()) {
        chapterNames.add(String(ch.name).trim());
      }
    });

    // 3. Bổ sung chương xuất hiện trực tiếp trên rooms / live / seeking của môn đó
    [...rawWaitingRooms, ...rawLiveRooms].forEach((r) => {
      const rSubjIds = getRoomSubjectIds(r.scope);
      if (!rSubjIds.includes(subjIdNum)) return;
      if (branchIdNum && r.scope?.branch_id && Number(r.scope.branch_id) !== branchIdNum) return;
      const ch = r.scope?.chapter || r.scope_label?.chapter;
      if (ch && String(ch).trim()) chapterNames.add(String(ch).trim());
    });
    rawSeekingList.forEach((s) => {
      if (Number(s.subject_id) !== subjIdNum) return;
      if (branchIdNum && s.branch_id && Number(s.branch_id) !== branchIdNum) return;
      if (s.chapter && String(s.chapter).trim()) chapterNames.add(String(s.chapter).trim());
    });

    return Array.from(chapterNames);
  }, [
    selectedSubject,
    selectedBranch,
    optionsCatalog?.topics,
    optionsCatalog?.chapters,
    rawWaitingRooms,
    rawLiveRooms,
    rawSeekingList,
  ]);

  const availableTopics = useMemo(() => {
    const isNumericSubject = /^[1-9]\d*$/.test(String(selectedSubject));
    if (!isNumericSubject) return [];
    const subjIdNum = Number(selectedSubject);
    const branchIdNum = selectedBranch ? Number(selectedBranch) : null;

    const allTopics = Array.isArray(optionsCatalog?.topics) ? optionsCatalog.topics : [];
    return allTopics.filter((tp) => {
      if (Number(tp.subject_id) !== subjIdNum) return false;
      if (branchIdNum && tp.branch_id != null && Number(tp.branch_id) !== branchIdNum) {
        return false;
      }
      if (selectedChapter && tp.chapter !== selectedChapter) {
        return false;
      }
      return true;
    });
  }, [optionsCatalog?.topics, selectedSubject, selectedBranch, selectedChapter]);

  // Hàm kiểm tra một phòng (waiting hoặc live) có khớp bộ lọc cục bộ không
  const matchesCardFilter = useMemo(() => {
    const allTopics = Array.isArray(optionsCatalog?.topics) ? optionsCatalog.topics : [];
    const selectedBranchObj = availableBranches.find(
      (b) => Number(b.id) === Number(selectedBranch)
    );

    return (card, isWaitingCard = false) => {
      if (!card) return false;
      if (selectedKind && (card.kind || card.mode) !== selectedKind) {
        return false;
      }
      if (isWaitingCard && onlyOpenSlot) {
        const cap = Number(card.capacity) || 20;
        const pCount = Number(card.players?.length ?? card.players ?? 0);
        if (pCount >= cap) return false;
      }

      const subjIds = getRoomSubjectIds(card.scope);
      if (selectedSubject === 'unselected') {
        return subjIds.length === 0;
      }

      if (selectedSubject) {
        const targetSubj = Number(selectedSubject);
        if (!subjIds.includes(targetSubj)) return false;
      }

      if (selectedBranch) {
        const targetBranch = Number(selectedBranch);
        const scopeBranch = card.scope?.branch_id;
        if (scopeBranch != null) {
          if (Number(scopeBranch) !== targetBranch) return false;
        } else if (card.scope_label?.branch && selectedBranchObj?.name) {
          if (card.scope_label.branch !== selectedBranchObj.name) return false;
        } else if (Array.isArray(card.scope?.topic_ids) && card.scope.topic_ids.length > 0 && allTopics.length > 0) {
          const hasTopicInBranch = card.scope.topic_ids.some((tid) => {
            const tp = allTopics.find((t) => Number(t.id) === Number(tid));
            return !tp || tp.branch_id == null || Number(tp.branch_id) === targetBranch;
          });
          if (!hasTopicInBranch) return false;
        }
      }

      if (selectedChapter) {
        const cardChapter = card.scope?.chapter || card.scope_label?.chapter;
        if (cardChapter) {
          if (cardChapter !== selectedChapter) return false;
        } else if (Array.isArray(card.scope?.topic_ids) && card.scope.topic_ids.length > 0 && allTopics.length > 0) {
          const hasTopicInChapter = card.scope.topic_ids.some((tid) => {
            const tp = allTopics.find((t) => Number(t.id) === Number(tid));
            return !tp || tp.chapter === selectedChapter;
          });
          if (!hasTopicInChapter) return false;
        }
      }

      if (selectedTopicId) {
        const targetTopic = Number(selectedTopicId);
        const topicIds = Array.isArray(card.scope?.topic_ids)
          ? card.scope.topic_ids.map(Number)
          : [];
        if (topicIds.length > 0) {
          if (!topicIds.includes(targetTopic)) return false;
        } else {
          const cardChapter = card.scope?.chapter || card.scope_label?.chapter;
          if (cardChapter && allTopics.length > 0) {
            const tp = allTopics.find((t) => Number(t.id) === targetTopic);
            if (tp && tp.chapter && tp.chapter !== cardChapter) return false;
          }
        }
      }

      return true;
    };
  }, [
    optionsCatalog?.topics,
    availableBranches,
    selectedKind,
    onlyOpenSlot,
    selectedSubject,
    selectedBranch,
    selectedChapter,
    selectedTopicId,
  ]);

  const filteredWaitingRooms = useMemo(
    () => rawWaitingRooms.filter((r) => matchesCardFilter(r, true)),
    [rawWaitingRooms, matchesCardFilter]
  );

  const filteredLiveRooms = useMemo(
    () => rawLiveRooms.filter((r) => matchesCardFilter(r, false)),
    [rawLiveRooms, matchesCardFilter]
  );

  const filteredSeekingList = useMemo(() => {
    // Theo hợp đồng API.md: khi lọc theo topic_id thì seeking rỗng vì không công bố bộ đếm theo bài
    if (selectedTopicId) return [];
    if (selectedSubject === 'unselected') return [];
    return rawSeekingList.filter((s) => {
      if (selectedSubject && Number(s.subject_id) !== Number(selectedSubject)) {
        return false;
      }
      if (selectedBranch && Number(s.branch_id) !== Number(selectedBranch)) {
        return false;
      }
      if (selectedChapter && s.chapter !== selectedChapter) {
        return false;
      }
      return true;
    });
  }, [
    rawSeekingList,
    selectedTopicId,
    selectedSubject,
    selectedBranch,
    selectedChapter,
  ]);

  // Xây dựng danh sách Chip Môn học (luôn giữ đủ các môn để người dùng chuyển môn 1 chạm)
  const subjectChips = useMemo(() => {
    const activeMap = new Map();
    const baseSubjects =
      unfilteredSubjectsCache.length > 0
        ? unfilteredSubjectsCache
        : Array.isArray(lobbySnapshot?.subjects)
        ? lobbySnapshot.subjects
        : [];

    baseSubjects.forEach((s) => {
      const key = s.id === null || s.id === undefined ? 'unselected' : String(s.id);
      activeMap.set(key, { ...s, key });
    });

    // Cập nhật số mới nhất từ snapshot hiện tại nếu đang lọc đúng môn đó
    if (Array.isArray(lobbySnapshot?.subjects)) {
      lobbySnapshot.subjects.forEach((s) => {
        const key = s.id === null || s.id === undefined ? 'unselected' : String(s.id);
        if (
          !selectedBranch &&
          !selectedChapter &&
          !selectedTopicId &&
          (!selectedSubject || selectedSubject === key)
        ) {
          activeMap.set(key, { ...s, key });
        }
      });
    }

    // Nếu cả cache lẫn snapshot đều chưa có subjects[], tự tổng hợp từ rooms/live/seeking
    if (activeMap.size === 0) {
      const fallbackAdd = (id, field, val = 1) => {
        const key = id === null ? 'unselected' : String(id);
        if (!activeMap.has(key)) {
          const sObj = (optionsCatalog?.subjects || []).find(
            (item) => Number(item.id) === Number(id)
          );
          activeMap.set(key, {
            id,
            key,
            name: id === null ? 'Chưa chọn môn' : sObj?.name || `Môn ${id}`,
            waiting: 0,
            live: 0,
            seeking: 0,
            has_seekers: false,
          });
        }
        const entry = activeMap.get(key);
        if (field === 'seeking') {
          entry.has_seekers = true;
          entry.seeking =
            entry.seeking === null || val === null ? null : entry.seeking + val;
        } else {
          entry[field] += val;
        }
      };

      rawWaitingRooms.forEach((r) => {
        const ids = getRoomSubjectIds(r.scope);
        (ids.length > 0 ? ids : [null]).forEach((id) => fallbackAdd(id, 'waiting', 1));
      });
      rawLiveRooms.forEach((r) => {
        const ids = getRoomSubjectIds(r.scope);
        (ids.length > 0 ? ids : [null]).forEach((id) => fallbackAdd(id, 'live', 1));
      });
      rawSeekingList.forEach((s) => {
        fallbackAdd(Number(s.subject_id), 'seeking', s.count);
      });
    }

    // Các môn có hoạt động trước (giữ đúng thứ tự ưu tiên từ server)
    const activeChips = Array.from(activeMap.values()).filter(
      (s) =>
        (Number(s.waiting) || 0) > 0 ||
        Boolean(s.has_seekers) ||
        (typeof s.seeking === 'number' && s.seeking > 0) ||
        (Number(s.live) || 0) > 0
    );

    // Các môn còn lại trong optionsCatalog (0 hoạt động) xếp phía sau để học sinh vẫn chọn được
    const zeroChips = [];
    (optionsCatalog?.subjects || []).forEach((s) => {
      const key = String(s.id);
      if (!activeChips.some((ac) => ac.key === key)) {
        zeroChips.push({
          id: Number(s.id),
          key,
          name: s.name,
          waiting: 0,
          live: 0,
          seeking: 0,
          has_seekers: false,
        });
      }
    });

    return [...activeChips, ...zeroChips];
  }, [
    unfilteredSubjectsCache,
    lobbySnapshot?.subjects,
    selectedSubject,
    selectedBranch,
    selectedChapter,
    selectedTopicId,
    optionsCatalog?.subjects,
    rawWaitingRooms,
    rawLiveRooms,
    rawSeekingList,
  ]);

  // Tính badge tổng trên chip "Tất cả môn"
  const allChipBadge = useMemo(() => {
    let knownSum = 0;
    let hasHiddenOne = false;

    const refSubjects =
      unfilteredSubjectsCache.length > 0
        ? unfilteredSubjectsCache
        : Array.isArray(lobbySnapshot?.subjects)
        ? lobbySnapshot.subjects
        : [];

    refSubjects.forEach((s) => {
      knownSum += (Number(s.waiting) || 0) + (Number(s.live) || 0);
      if (typeof s.seeking === 'number' && s.seeking >= 2) {
        knownSum += s.seeking;
      } else if (s.has_seekers || s.seeking === 1) {
        hasHiddenOne = true;
      }
    });

    const refAny = isUnfilteredQuery ? seekingAny : unfilteredSeekingAnyCache;
    if (refAny?.has_waiters) {
      if (typeof refAny.count === 'number' && refAny.count >= 2) {
        knownSum += refAny.count;
      } else {
        hasHiddenOne = true;
      }
    }

    if (hasHiddenOne) {
      return knownSum > 0 ? `${knownSum}+` : '●';
    }
    return String(knownSum);
  }, [
    unfilteredSubjectsCache,
    lobbySnapshot?.subjects,
    isUnfilteredQuery,
    seekingAny,
    unfilteredSeekingAnyCache,
  ]);

  // Xây dựng các Khối theo Môn (Subject Blocks) để hiển thị bên dưới
  const subjectBlocks = useMemo(() => {
    const map = new Map();

    const ensureSubjectBlock = (id, fallbackName = null) => {
      const key = id === null || id === undefined ? 'unselected' : String(id);
      if (selectedSubject && selectedSubject !== key) return null;
      if (!map.has(key)) {
        const fromServer = (lobbySnapshot?.subjects || []).find((s) =>
          id === null ? s.id === null : Number(s.id) === Number(id)
        );
        const fromCatalog = (optionsCatalog?.subjects || []).find(
          (s) => Number(s.id) === Number(id)
        );
        map.set(key, {
          id: id === null ? null : Number(id),
          key,
          name:
            fromServer?.name ||
            fromCatalog?.name ||
            fallbackName ||
            (id === null ? 'Chưa chọn môn' : `Môn ${id}`),
          serverSummary: fromServer || null,
          waitingRooms: [],
          seekingItems: [],
          liveRooms: [],
        });
      }
      return map.get(key);
    };

    // Khởi tạo theo thứ tự chuẩn của server (lobbySnapshot.subjects)
    if (Array.isArray(lobbySnapshot?.subjects)) {
      lobbySnapshot.subjects.forEach((s) => {
        ensureSubjectBlock(s.id ?? null, s.name);
      });
    }

    // Phân bổ phòng chờ vào khối môn
    filteredWaitingRooms.forEach((room) => {
      const ids = getRoomSubjectIds(room.scope);
      const targets = ids.length > 0 ? ids : [null];
      targets.forEach((subjId) => {
        const block = ensureSubjectBlock(subjId, room.scope_label?.subject);
        if (block && !block.waitingRooms.some((r) => r.id === room.id)) {
          block.waitingRooms.push(room);
        }
      });
    });

    // Phân bổ nhóm đang tìm vào khối môn
    filteredSeekingList.forEach((seek) => {
      const block = ensureSubjectBlock(Number(seek.subject_id));
      if (block) {
        block.seekingItems.push(seek);
      }
    });

    // Phân bổ ván đang đấu vào khối môn
    filteredLiveRooms.forEach((liveRoom) => {
      const ids = getRoomSubjectIds(liveRoom.scope);
      const targets = ids.length > 0 ? ids : [null];
      targets.forEach((subjId) => {
        const block = ensureSubjectBlock(subjId, liveRoom.scope_label?.subject);
        if (block && !block.liveRooms.some((r) => r.id === liveRoom.id)) {
          block.liveRooms.push(liveRoom);
        }
      });
    });

    // Tính toán summary cho mỗi khối môn và lọc theo activeTab
    const blocks = Array.from(map.values()).map((b) => {
      const useServerCounts = !selectedKind && onlyOpenSlot && b.serverSummary;
      const waitingCount = useServerCounts
        ? Number(b.serverSummary.waiting) || b.waitingRooms.length
        : b.waitingRooms.length;
      const liveCount = useServerCounts
        ? Number(b.serverSummary.live) || b.liveRooms.length
        : b.liveRooms.length;

      let seekingCount = 0;
      let hasSeekers = false;
      if (b.seekingItems.length > 0) {
        hasSeekers = true;
        const hasNullOrOne = b.seekingItems.some(
          (item) => item.count === null || item.count === 1
        );
        if (hasNullOrOne) {
          seekingCount = null;
        } else {
          seekingCount = b.seekingItems.reduce(
            (acc, item) => acc + (Number(item.count) || 0),
            0
          );
        }
      } else if (useServerCounts && b.serverSummary.has_seekers && !selectedTopicId) {
        hasSeekers = true;
        seekingCount = b.serverSummary.seeking;
      }

      const summaryObj = {
        id: b.id,
        name: b.name,
        waiting: waitingCount,
        live: liveCount,
        seeking: seekingCount,
        has_seekers: hasSeekers,
      };

      return {
        ...b,
        summaryObj,
        headerSummaryText: formatSubjectHeaderSummary(summaryObj),
      };
    });

    // Lọc các khối môn có nội dung khớp với tab đang xem
    const visibleBlocks = blocks.filter((b) => {
      if (activeTab === 'waiting') return b.waitingRooms.length > 0;
      if (activeTab === 'seeking') {
        return b.seekingItems.length > 0 || b.summaryObj.has_seekers;
      }
      if (activeTab === 'live') return b.liveRooms.length > 0;
      return (
        b.waitingRooms.length > 0 ||
        b.seekingItems.length > 0 ||
        b.summaryObj.has_seekers ||
        b.liveRooms.length > 0
      );
    });

    // Nếu server chưa sắp xếp (fallback), sắp theo: waiting > 0 desc -> waiting + seeking desc -> live desc -> id asc
    visibleBlocks.sort((a, b) => {
      const aWait = a.summaryObj.waiting > 0 ? 1 : 0;
      const bWait = b.summaryObj.waiting > 0 ? 1 : 0;
      if (bWait !== aWait) return bWait - aWait;
      const aScore = a.summaryObj.waiting + (a.summaryObj.seeking ?? 0);
      const bScore = b.summaryObj.waiting + (b.summaryObj.seeking ?? 0);
      if (bScore !== aScore) return bScore - aScore;
      if (b.summaryObj.live !== a.summaryObj.live) {
        return b.summaryObj.live - a.summaryObj.live;
      }
      const aId = a.id === null ? Infinity : a.id;
      const bId = b.id === null ? Infinity : b.id;
      return aId - bId;
    });

    return visibleBlocks;
  }, [
    lobbySnapshot?.subjects,
    optionsCatalog?.subjects,
    selectedSubject,
    selectedKind,
    onlyOpenSlot,
    selectedTopicId,
    filteredWaitingRooms,
    filteredSeekingList,
    filteredLiveRooms,
    activeTab,
  ]);

  // Có hiển thị dải seeking_any ("Đang tìm mọi môn") không?
  const showSeekingAnyRow =
    !selectedSubject &&
    !selectedBranch &&
    !selectedChapter &&
    !selectedTopicId &&
    (activeTab === 'all' || activeTab === 'seeking') &&
    Boolean(seekingAny?.has_waiters);

  // Số đếm trên 4 tab nhỏ
  const tabCounts = useMemo(() => {
    const waitCnt = filteredWaitingRooms.length;
    const liveCnt = filteredLiveRooms.length;
    let seekKnown = 0;
    let seekHasHidden = false;

    filteredSeekingList.forEach((s) => {
      if (typeof s.count === 'number' && s.count >= 2) {
        seekKnown += s.count;
      } else {
        seekHasHidden = true;
      }
    });

    if (!selectedSubject && !selectedTopicId && seekingAny?.has_waiters) {
      if (typeof seekingAny.count === 'number' && seekingAny.count >= 2) {
        seekKnown += seekingAny.count;
      } else {
        seekHasHidden = true;
      }
    }

    const seekLabel = seekHasHidden
      ? seekKnown > 0
        ? `${seekKnown}+`
        : '●'
      : String(seekKnown);

    return {
      waiting: waitCnt,
      seeking: seekLabel,
      live: liveCnt,
    };
  }, [
    filteredWaitingRooms.length,
    filteredLiveRooms.length,
    filteredSeekingList,
    selectedSubject,
    selectedTopicId,
    seekingAny,
  ]);

  // Đếm số bộ lọc chi tiết đang bật (Phân môn / Chương / Bài / Kiểu đấu / !onlyOpenSlot)
  const activeDetailFilterCount = useMemo(() => {
    let cnt = 0;
    if (selectedBranch) cnt += 1;
    if (selectedChapter) cnt += 1;
    if (selectedTopicId) cnt += 1;
    if (selectedKind) cnt += 1;
    if (!onlyOpenSlot) cnt += 1;
    return cnt;
  }, [selectedBranch, selectedChapter, selectedTopicId, selectedKind, onlyOpenSlot]);

  // Nhãn mô tả phạm vi đang lọc để gắn vào nút ở Trạng thái trống
  const currentFilterContext = useMemo(() => {
    const isNumericSubject = /^[1-9]\d*$/.test(String(selectedSubject));
    const subjObj = isNumericSubject
      ? availableSubjects.find((s) => Number(s.id) === Number(selectedSubject))
      : null;
    const branchObj = selectedBranch
      ? availableBranches.find((b) => Number(b.id) === Number(selectedBranch))
      : null;
    const topicObj = selectedTopicId
      ? availableTopics.find((t) => Number(t.id) === Number(selectedTopicId))
      : null;

    const scopeForAction = isNumericSubject
      ? {
          subject_id: Number(selectedSubject),
          ...(selectedBranch ? { branch_id: Number(selectedBranch) } : {}),
          ...(selectedTopicId
            ? { topic_ids: [Number(selectedTopicId)] }
            : selectedChapter
            ? { chapter: selectedChapter }
            : {}),
        }
      : null;

    const labelParts = [];
    if (subjObj?.name) labelParts.push(subjObj.name);
    if (branchObj?.name) labelParts.push(branchObj.name);
    if (selectedChapter) labelParts.push(selectedChapter);
    if (topicObj?.name) labelParts.push(topicObj.name);

    const shortActionName = topicObj?.name
      ? `bài ${topicObj.name}`
      : selectedChapter
      ? `${subjObj?.name || ''} · ${selectedChapter}`.trim()
      : subjObj?.name
      ? `môn ${subjObj.name}`
      : 'cùng khối';

    return {
      subjObj,
      branchObj,
      topicObj,
      scopeForAction,
      fullLabel: labelParts.join(' · '),
      shortActionName,
    };
  }, [
    selectedSubject,
    selectedBranch,
    selectedChapter,
    selectedTopicId,
    availableSubjects,
    availableBranches,
    availableTopics,
  ]);

  // Gợi ý bài học phù hợp cho Trạng thái trống
  const emptyStateSuggestions = useMemo(() => {
    const isNumericSubject = /^[1-9]\d*$/.test(String(selectedSubject));
    const list = suggestionLookup.enrichedList;
    const filtered = isNumericSubject
      ? list.filter((item) => Number(item.topic?.subject_id) === Number(selectedSubject))
      : list;
    if (filtered.length > 0) return filtered.slice(0, 3);
    return list.slice(0, 3);
  }, [suggestionLookup.enrichedList, selectedSubject]);

  const handleSelectSubjectChip = (subjKey) => {
    setSelectedSubject(subjKey);
    setSelectedBranch('');
    setSelectedChapter('');
    setSelectedTopicId('');
  };

  const handleResetAllFilters = () => {
    setSelectedSubject('');
    setSelectedBranch('');
    setSelectedChapter('');
    setSelectedTopicId('');
    setSelectedKind('');
    setOnlyOpenSlot(true);
    setActiveTab('all');
  };

  const toggleLiveExpand = (subjKey) => {
    setExpandedLiveMap((prev) => ({
      ...prev,
      [subjKey]: !prev[subjKey],
    }));
  };

  const formatSeekingScopeLabel = (seekItem, subjectName) => {
    const parts = [];
    if (seekItem.branch_id != null) {
      const br = (optionsCatalog?.branches || []).find(
        (b) => Number(b.id) === Number(seekItem.branch_id)
      );
      parts.push(br?.name || `Phân môn ${seekItem.branch_id}`);
    }
    if (seekItem.chapter) {
      parts.push(seekItem.chapter);
    }
    if (parts.length === 0) {
      return `Môn ${subjectName}`;
    }
    return parts.join(' · ');
  };

  return (
    <section
      className="arena-hall"
      style={{ marginTop: '20px' }}
      aria-label="Sảnh Đấu trường cùng khối"
    >
      {/* ĐẦU SẢNH: TIÊU ĐỀ & HƯỚNG DẪN QUÉT NHANH */}
      <div className="arena-hall__top-bar">
        <div>
          <h2 className="arena-title-md">Sảnh Đấu trường cùng khối</h2>
          <p className="arena-subtitle" style={{ margin: '2px 0 0' }}>
            Chọn môn học để vào phòng ngay hoặc đấu cùng các bạn đang chờ ghép
          </p>
        </div>
        {(selectedSubject || activeDetailFilterCount > 0 || activeTab !== 'all') && (
          <button
            type="button"
            className="arena-btn arena-btn--secondary arena-btn--sm"
            onClick={handleResetAllFilters}
          >
            ↺ Xem toàn sảnh
          </button>
        )}
      </div>

      {/* NHỊP 1: DẢI CHIP MÔN HỌC CÓ SỐ ĐẾM (CUỘN NGANG TRÊN MOBILE) */}
      <div
        className="arena-hall-subject-strip"
        role="region"
        aria-label="Chọn nhanh môn học"
      >
        <button
          type="button"
          aria-pressed={selectedSubject === ''}
          className={`arena-hall-subject-chip ${
            selectedSubject === '' ? 'arena-hall-subject-chip--active' : ''
          }`}
          onClick={() => handleSelectSubjectChip('')}
        >
          <span className="arena-hall-subject-chip__icon" aria-hidden="true">
            ⚡
          </span>
          <span className="arena-hall-subject-chip__name">Tất cả</span>
          <span className="arena-hall-subject-chip__count arena-mono">
            {allChipBadge}
          </span>
        </button>

        {subjectChips.map((subj) => {
          const isActive = selectedSubject === subj.key;
          const badgeText = formatSubjectChipBadge(subj);
          const hasActivity = badgeText !== '0';
          return (
            <button
              key={subj.key}
              type="button"
              aria-pressed={isActive}
              className={`arena-hall-subject-chip ${
                isActive ? 'arena-hall-subject-chip--active' : ''
              } ${!hasActivity ? 'arena-hall-subject-chip--quiet' : ''}`}
              onClick={() =>
                handleSelectSubjectChip(isActive ? '' : subj.key)
              }
            >
              <span className="arena-hall-subject-chip__icon" aria-hidden="true">
                {getSubjectIcon(subj.name, subj.id)}
              </span>
              <span className="arena-hall-subject-chip__name">{subj.name}</span>
              <span
                className={`arena-hall-subject-chip__count arena-mono ${
                  hasActivity ? 'arena-hall-subject-chip__count--live' : ''
                }`}
              >
                {badgeText}
              </span>
            </button>
          );
        })}
      </div>

      {/* NHỊP 2: HÀNG TAB NHỎ (TẤT CẢ / PHÒNG CHỜ / ĐANG TÌM / ĐANG ĐẤU) + NÚT SHEET LỌC MOBILE */}
      <div className="arena-hall-controls-row">
        <div className="arena-hall-tabs" role="tablist" aria-label="Phân loại hoạt động trong sảnh">
          {[
            { id: 'all', label: 'Tất cả', count: null },
            { id: 'waiting', label: 'Phòng chờ', count: tabCounts.waiting },
            { id: 'seeking', label: 'Đang tìm', count: tabCounts.seeking },
            { id: 'live', label: 'Đang đấu', count: tabCounts.live },
          ].map((tab) => {
            const isTabActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isTabActive}
                className={`arena-hall-tab ${
                  isTabActive ? 'arena-hall-tab--active' : ''
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span className="arena-hall-tab__badge arena-mono">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Nút mở Sheet lọc Phân môn -> Chương -> Bài trên Mobile */}
        <button
          type="button"
          className={`arena-btn arena-btn--sm arena-hall-mobile-filter-btn ${
            activeDetailFilterCount > 0 ? 'arena-btn--primary' : 'arena-btn--secondary'
          }`}
          onClick={() => setShowFilterSheet(true)}
        >
          <span>⚙ Lọc bài</span>
          {activeDetailFilterCount > 0 && (
            <span className="arena-hall-filter-count arena-mono">
              {activeDetailFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* THANH BỘ LỌC TRÊN DESKTOP: PHÂN MÔN -> CHƯƠNG -> BÀI + KIỂU ĐẤU */}
      <div
        className="arena-hall-desktop-filters"
        role="region"
        aria-label="Bộ lọc phân môn, chương, bài học"
      >
        <select
          className="arena-select arena-hall-filter-select"
          aria-label="Lọc theo môn học"
          value={selectedSubject}
          onChange={(e) => handleSelectSubjectChip(e.target.value)}
        >
          <option value="">Tất cả môn học</option>
          {availableSubjects.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.name}
            </option>
          ))}
          {subjectChips.some((c) => c.key === 'unselected') && (
            <option value="unselected">Chưa chọn môn (Bỏ phiếu)</option>
          )}
        </select>

        <select
          className="arena-select arena-hall-filter-select"
          aria-label="Lọc theo phân môn"
          value={selectedBranch}
          disabled={!/^[1-9]\d*$/.test(String(selectedSubject)) || availableBranches.length === 0}
          onChange={(e) => {
            setSelectedBranch(e.target.value);
            setSelectedChapter('');
            setSelectedTopicId('');
          }}
        >
          <option value="">
            {!/^[1-9]\d*$/.test(String(selectedSubject))
              ? 'Phân môn (chọn môn trước)'
              : availableBranches.length === 0
              ? 'Không chia phân môn'
              : 'Tất cả phân môn'}
          </option>
          {availableBranches.map((b) => (
            <option key={b.id} value={String(b.id)}>
              {b.name}
            </option>
          ))}
        </select>

        <select
          className="arena-select arena-hall-filter-select"
          aria-label="Lọc theo chương"
          value={selectedChapter}
          disabled={!/^[1-9]\d*$/.test(String(selectedSubject)) || availableChapters.length === 0}
          onChange={(e) => {
            setSelectedChapter(e.target.value);
            setSelectedTopicId('');
          }}
        >
          <option value="">
            {!/^[1-9]\d*$/.test(String(selectedSubject))
              ? 'Chương (chọn môn trước)'
              : 'Tất cả chương'}
          </option>
          {availableChapters.map((chName) => (
            <option key={chName} value={chName}>
              {chName}
            </option>
          ))}
        </select>

        <select
          className="arena-select arena-hall-filter-select"
          aria-label="Lọc theo bài học"
          value={selectedTopicId}
          disabled={!/^[1-9]\d*$/.test(String(selectedSubject)) || availableTopics.length === 0}
          onChange={(e) => setSelectedTopicId(e.target.value)}
        >
          <option value="">
            {!/^[1-9]\d*$/.test(String(selectedSubject))
              ? 'Bài học (chọn môn trước)'
              : 'Tất cả bài học'}
          </option>
          {availableTopics.map((tp) => (
            <option key={tp.id} value={String(tp.id)}>
              {tp.name}
            </option>
          ))}
        </select>

        <select
          className="arena-select arena-hall-filter-select"
          aria-label="Lọc theo kiểu đấu"
          value={selectedKind}
          onChange={(e) => setSelectedKind(e.target.value)}
        >
          <option value="">Mọi kiểu đấu</option>
          <option value="duel">Đấu đôi (1v1)</option>
          <option value="team">Đấu đội</option>
          <option value="ffa">Nhiều người</option>
        </select>
      </div>

      {/* DẢI CHIP TÓM TẮT BỘ LỌC ĐANG BẬT (DỄ GỠ 1 CHẠM TRÊN CẢ MOBILE & DESKTOP) */}
      {(currentFilterContext.branchObj ||
        selectedChapter ||
        currentFilterContext.topicObj ||
        selectedKind) && (
        <div className="arena-hall-active-filters" aria-label="Bộ lọc đang áp dụng">
          {currentFilterContext.branchObj && (
            <span className="arena-chip arena-chip--accent">
              <span>Phân môn: {currentFilterContext.branchObj.name}</span>
              <button
                type="button"
                className="arena-chip-remove"
                aria-label="Bỏ lọc phân môn"
                onClick={() => {
                  setSelectedBranch('');
                  setSelectedChapter('');
                  setSelectedTopicId('');
                }}
              >
                ✕
              </button>
            </span>
          )}
          {selectedChapter && (
            <span className="arena-chip arena-chip--accent">
              <span>{selectedChapter}</span>
              <button
                type="button"
                className="arena-chip-remove"
                aria-label="Bỏ lọc chương"
                onClick={() => {
                  setSelectedChapter('');
                  setSelectedTopicId('');
                }}
              >
                ✕
              </button>
            </span>
          )}
          {currentFilterContext.topicObj && (
            <span className="arena-chip arena-chip--accent">
              <span>{currentFilterContext.topicObj.name}</span>
              <button
                type="button"
                className="arena-chip-remove"
                aria-label="Bỏ lọc bài học"
                onClick={() => setSelectedTopicId('')}
              >
                ✕
              </button>
            </span>
          )}
          {selectedKind && (
            <span className="arena-chip arena-chip--accent">
              <span>Kiểu: {KIND_LABELS[selectedKind] || selectedKind}</span>
              <button
                type="button"
                className="arena-chip-remove"
                aria-label="Bỏ lọc kiểu đấu"
                onClick={() => setSelectedKind('')}
              >
                ✕
              </button>
            </span>
          )}
        </div>
      )}

      {/* DẢI SEEKING_ANY: "ĐANG TÌM MỌI MÔN" (KHI XEM TẤT CẢ MÔN) */}
      {showSeekingAnyRow && (
        <div className="arena-hall-seeking-row arena-hall-seeking-row--any">
          <div className="arena-hall-seeking-row__info">
            <span className="arena-pulse-dot" aria-hidden="true" />
            <div className="arena-hall-seeking-row__text">
              <strong>
                {formatSeekingWaiterText(seekingAny.count, seekingAny.has_waiters)}
              </strong>
              <span className="arena-hall-seeking-row__sep">·</span>
              <span className="arena-hall-seeking-row__scope">Đang tìm mọi môn</span>
            </div>
          </div>

          {flags.battle_enabled && flags.matchmaking && (
            <button
              type="button"
              className="arena-btn arena-btn--amber arena-btn--sm arena-hall-seeking-row__btn"
              disabled={Boolean(suspension) || busyQuickMatch}
              onClick={() => onQuickMatch && onQuickMatch(null)}
            >
              ⚡ Đấu cùng
            </button>
          )}
        </div>
      )}

      {/* NHỊP 3: DANH SÁCH KHỐI THEO MÔN HOẶC TRẠNG THÁI TRỐNG */}
      {subjectBlocks.length === 0 && !showSeekingAnyRow ? (
        <div className="arena-card arena-hall-empty">
          <div className="arena-hall-empty__badge">
            {selectedSubject
              ? `${getSubjectIcon(
                  currentFilterContext.subjObj?.name,
                  selectedSubject === 'unselected' ? null : Number(selectedSubject)
                )} ${currentFilterContext.fullLabel || 'Môn đang chọn'}`
              : '🌟 Sảnh Đấu trường'}
          </div>

          <h3 className="arena-title-md" style={{ marginTop: '8px' }}>
            {selectedSubject
              ? `Chưa có ${
                  activeTab === 'waiting'
                    ? 'phòng chờ'
                    : activeTab === 'seeking'
                    ? 'bạn đang tìm'
                    : activeTab === 'live'
                    ? 'ván đang đấu'
                    : 'phòng hay lượt tìm nào'
                } ở ${currentFilterContext.fullLabel || 'phần này'}`
              : activeTab !== 'all'
              ? `Hiện chưa có hoạt động ở mục "${
                  activeTab === 'waiting'
                    ? 'Phòng chờ'
                    : activeTab === 'seeking'
                    ? 'Đang tìm'
                    : 'Đang đấu'
                }"`
              : 'Sảnh đang yên tĩnh — Em làm người mở màn nhé!'}
          </h3>

          <p className="arena-subtitle" style={{ maxWidth: '540px', margin: '6px auto 16px' }}>
            {selectedSubject
              ? 'Em có thể bấm Tìm bạn hoặc Mở phòng ngay bên dưới để rủ các bạn cùng khối vào so tài.'
              : 'Chọn một bài học gợi ý hoặc bấm Tìm bạn để ghép trận nhanh cùng khối.'}
          </p>

          {/* 2 Nút hành động chính gắn sẵn phạm vi môn/chương/bài đang chọn */}
          <div className="arena-hall-empty__actions">
            {flags.battle_enabled && flags.matchmaking && selectedSubject !== 'unselected' && (
              <button
                type="button"
                className="arena-btn arena-btn--amber"
                disabled={Boolean(suspension) || busyQuickMatch}
                onClick={() =>
                  onQuickMatch && onQuickMatch(currentFilterContext.scopeForAction)
                }
              >
                ⚡ Tìm bạn {currentFilterContext.shortActionName}
              </button>
            )}

            {flags.battle_enabled &&
              (flags.lobby || flags.duel_code || flags.team || flags.ffa) && (
                <button
                  type="button"
                  className="arena-btn arena-btn--primary"
                  disabled={Boolean(suspension)}
                  onClick={() =>
                    onOpenCreateRoom &&
                    onOpenCreateRoom(currentFilterContext.scopeForAction)
                  }
                >
                  + Mở phòng {currentFilterContext.shortActionName}
                </button>
              )}

            {(selectedSubject || activeDetailFilterCount > 0 || activeTab !== 'all') && (
              <button
                type="button"
                className="arena-btn arena-btn--secondary"
                onClick={handleResetAllFilters}
              >
                Xem toàn bộ sảnh
              </button>
            )}
          </div>

          {/* Gợi ý bài học để học sinh chọn 1 chạm khi chưa biết đấu gì */}
          {emptyStateSuggestions.length > 0 && (
            <div className="arena-hall-empty__suggestions">
              <div className="arena-hall-empty__sug-title">
                💡 Gợi ý bài học cho em hôm nay
              </div>
              <div className="arena-hall-empty__sug-grid">
                {emptyStateSuggestions.map((sug) => {
                  const isWeak = sug.reason === 'weak';
                  const sugScope = {
                    subject_id: Number(sug.topic.subject_id),
                    ...(sug.topic.branch_id
                      ? { branch_id: Number(sug.topic.branch_id) }
                      : {}),
                    topic_ids: [Number(sug.topic_id)],
                  };
                  return (
                    <div
                      key={`${sug.topic_id}-${sug.reason}`}
                      className="arena-hall-sug-card"
                    >
                      <div className="arena-hall-sug-card__top">
                        <span
                          className={`arena-chip ${
                            isWeak ? 'arena-chip--warn' : 'arena-chip--live'
                          }`}
                        >
                          {isWeak ? '💪 Bài cần gỡ điểm' : '🎯 Bài em đang luyện'}
                        </span>
                        <span className="arena-hall-sug-card__subj">
                          {sug.subject_name}
                          {sug.topic.chapter ? ` · ${sug.topic.chapter}` : ''}
                        </span>
                      </div>

                      <div className="arena-hall-sug-card__name">
                        {sug.topic.name}
                      </div>

                      <div className="arena-hall-sug-card__actions">
                        {flags.battle_enabled && flags.matchmaking && (
                          <button
                            type="button"
                            className="arena-btn arena-btn--amber arena-btn--sm"
                            disabled={Boolean(suspension) || busyQuickMatch}
                            onClick={() => onQuickMatch && onQuickMatch(sugScope)}
                          >
                            ⚡ Đấu cùng bài này
                          </button>
                        )}
                        {flags.battle_enabled &&
                          (flags.lobby || flags.duel_code) && (
                            <button
                              type="button"
                              className="arena-btn arena-btn--secondary arena-btn--sm"
                              disabled={Boolean(suspension)}
                              onClick={() =>
                                onOpenCreateRoom && onOpenCreateRoom(sugScope)
                              }
                            >
                              + Mở phòng
                            </button>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="arena-hall-subject-list">
          {subjectBlocks.map((block) => {
            const showSeekingInBlock =
              activeTab === 'all' || activeTab === 'seeking';
            const showWaitingInBlock =
              activeTab === 'all' || activeTab === 'waiting';
            const showLiveInBlock = activeTab === 'all' || activeTab === 'live';

            const isLiveExpanded = Boolean(expandedLiveMap[block.key]);
            const visibleLiveRooms = isLiveExpanded
              ? block.liveRooms
              : block.liveRooms.slice(0, COLLAPSED_LIVE_LIMIT);
            const hiddenLiveCount = Math.max(
              0,
              block.liveRooms.length - COLLAPSED_LIVE_LIMIT
            );

            // Nếu server báo has_seekers ở cấp môn nhưng mảng seekingItems bị ẩn chi tiết
            const effectiveSeekingItems =
              block.seekingItems.length > 0
                ? block.seekingItems
                : block.summaryObj.has_seekers && block.id !== null
                ? [
                    {
                      subject_id: block.id,
                      branch_id: null,
                      chapter: null,
                      count: block.summaryObj.seeking,
                      has_waiters: true,
                    },
                  ]
                : [];

            return (
              <section
                key={block.key}
                className="arena-card arena-hall-subject-block"
                aria-label={`Khối môn ${block.name}`}
              >
                {/* TIÊU ĐỀ KHỐI MÔN + TỔNG HOẠT ĐỘNG */}
                <header className="arena-hall-subject-header">
                  <div className="arena-hall-subject-header__left">
                    <span
                      className="arena-hall-subject-header__icon"
                      aria-hidden="true"
                    >
                      {getSubjectIcon(block.name, block.id)}
                    </span>
                    <div>
                      <h3 className="arena-hall-subject-header__title">
                        {block.name}
                      </h3>
                      <p className="arena-hall-subject-header__summary">
                        {block.headerSummaryText}
                      </p>
                    </div>
                  </div>

                  {block.id !== null &&
                    flags.battle_enabled &&
                    (flags.lobby || flags.duel_code || flags.team || flags.ffa) && (
                      <button
                        type="button"
                        className="arena-btn arena-btn--secondary arena-btn--sm"
                        disabled={Boolean(suspension)}
                        onClick={() =>
                          onOpenCreateRoom &&
                          onOpenCreateRoom({ subject_id: block.id })
                        }
                      >
                        + Mở phòng {block.name}
                      </button>
                    )}
                </header>

                {/* 1. CÁC DÒNG "ĐANG TÌM ĐỐI THỦ" + NÚT ⚡ ĐẤU CÙNG */}
                {showSeekingInBlock && effectiveSeekingItems.length > 0 && (
                  <div className="arena-hall-seeking-list">
                    {effectiveSeekingItems.map((seek, idx) => {
                      const seekKey = `${seek.subject_id}-${seek.branch_id ?? 'all'}-${
                        seek.chapter ?? 'all'
                      }-${idx}`;
                      const scopeText = formatSeekingScopeLabel(seek, block.name);
                      const isSuggestedChapter =
                        seek.chapter &&
                        suggestionLookup.chapterSet.has(
                          `${seek.subject_id}::${seek.chapter}`
                        );

                      const matchScope = {
                        subject_id: Number(seek.subject_id),
                        ...(seek.branch_id != null
                          ? { branch_id: Number(seek.branch_id) }
                          : {}),
                        ...(seek.chapter ? { chapter: seek.chapter } : {}),
                      };

                      return (
                        <div key={seekKey} className="arena-hall-seeking-row">
                          <div className="arena-hall-seeking-row__info">
                            <span className="arena-pulse-dot" aria-hidden="true" />
                            <div className="arena-hall-seeking-row__text">
                              <strong>
                                {formatSeekingWaiterText(
                                  seek.count,
                                  seek.has_waiters
                                )}
                              </strong>
                              <span className="arena-hall-seeking-row__sep">·</span>
                              <span className="arena-hall-seeking-row__scope">
                                {scopeText}
                              </span>
                              {isSuggestedChapter && (
                                <span
                                  className="arena-chip arena-chip--live"
                                  style={{ marginLeft: '6px' }}
                                >
                                  🎯 Đang học
                                </span>
                              )}
                            </div>
                          </div>

                          {flags.battle_enabled && flags.matchmaking && (
                            <button
                              type="button"
                              className="arena-btn arena-btn--amber arena-btn--sm arena-hall-seeking-row__btn"
                              disabled={Boolean(suspension) || busyQuickMatch}
                              onClick={() =>
                                onQuickMatch && onQuickMatch(matchScope)
                              }
                            >
                              ⚡ Đấu cùng
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 2. LƯỚI THẺ PHÒNG ĐANG CHỜ + NÚT VÀO */}
                {showWaitingInBlock && block.waitingRooms.length > 0 && (
                  <div className="arena-grid-cards arena-hall-rooms-grid">
                    {block.waitingRooms.map((r) => {
                      const pCount = Number(r.players?.length ?? r.players ?? 0);
                      const cap = Number(r.capacity) || 20;
                      const isFull = pCount >= cap;
                      const missingOne = !isFull && cap - pCount === 1;
                      const roomKind = r.kind || r.mode || 'duel';
                      const sugBadge = getRoomSuggestionBadge(r);
                      const topicNames = Array.isArray(r.scope_label?.topics)
                        ? r.scope_label.topics
                        : [];

                      return (
                        <article
                          key={r.id}
                          className={`arena-card arena-room-card ${
                            missingOne ? 'arena-room-card--almost-full' : ''
                          }`}
                        >
                          <div className="arena-room-card__top">
                            <div className="arena-row" style={{ gap: '6px' }}>
                              <span className="arena-chip arena-chip--accent">
                                {KIND_LABELS[roomKind] || 'Phòng đấu'}
                              </span>
                              {missingOne && (
                                <span className="arena-chip arena-chip--amber">
                                  🔥 Thiếu 1 bạn · Vào là đấu!
                                </span>
                              )}
                              {!missingOne && r.open_slots && (
                                <span className="arena-chip arena-chip--amber">
                                  {r.label || 'Nhóm bạn đang tìm thêm người'}
                                </span>
                              )}
                              {r.ranked && (
                                <span className="arena-chip arena-chip--live">
                                  🏅 Tính hạng
                                </span>
                              )}
                              {sugBadge && (
                                <span className={`arena-chip ${sugBadge.className}`}>
                                  {sugBadge.text}
                                </span>
                              )}
                            </div>

                            <span className="arena-chip arena-mono">
                              {pCount}/{cap} bạn
                            </span>
                          </div>

                          <div className="arena-room-card__body">
                            <h4 className="arena-room-card__title">
                              <ScopeLabel
                                scope={r.scope}
                                scopeLabel={r.scope_label}
                                options={optionsCatalog}
                              />
                            </h4>
                            {topicNames.length > 1 && (
                              <p className="arena-hall-room-topics">
                                Bài: {topicNames.slice(0, 3).join(', ')}
                                {topicNames.length > 3
                                  ? ` (+${topicNames.length - 3} bài)`
                                  : ''}
                              </p>
                            )}
                            <p className="arena-subtitle" style={{ marginTop: '4px' }}>
                              Chủ phòng:{' '}
                              <strong>{r.host_name || 'Bạn cùng khối'}</strong>
                              {r.host_badge?.name && (
                                <span
                                  className="arena-hall-host-badge"
                                  title="Bậc học thuật của chủ phòng"
                                >
                                  🏅 {r.host_badge.name}
                                  {r.host_badge.division
                                    ? ` ${r.host_badge.division}`
                                    : ''}
                                </span>
                              )}{' '}
                              · {r.question_count || 7} câu · {r.seconds || 30}s/câu
                            </p>
                          </div>

                          <div className="arena-room-card__footer">
                            <button
                              type="button"
                              className={`arena-btn arena-btn--block ${
                                missingOne ? 'arena-btn--amber' : 'arena-btn--primary'
                              }`}
                              disabled={
                                isFull ||
                                busyJoinRoomId === r.id ||
                                Boolean(suspension)
                              }
                              onClick={() => onJoinRoom && onJoinRoom(r.id)}
                            >
                              {isFull
                                ? 'Phòng đã đầy'
                                : busyJoinRoomId === r.id
                                ? 'Đang vào…'
                                : missingOne
                                ? 'Vào ngay →'
                                : 'Vào phòng'}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                {/* 3. DẢI "👀 ĐANG SO TÀI · CÂU X/Y" THU GỌN 2-3 DÒNG, BẤM MỞ THÊM */}
                {showLiveInBlock && block.liveRooms.length > 0 && (
                  <div
                    className="arena-hall-live-box"
                    aria-label={`Các ván đang đấu môn ${block.name}`}
                  >
                    <div className="arena-hall-live-list">
                      {visibleLiveRooms.map((lv) => {
                        const asked = Number(lv.asked_count) || 0;
                        const totalQ = Number(lv.question_count) || 7;
                        const progressText =
                          asked > 0
                            ? `Câu ${asked}/${totalQ}`
                            : `Sắp bắt đầu (${totalQ} câu)`;
                        const elapsedMs =
                          typeof lv.started_at === 'number'
                            ? Math.max(0, serverNow - lv.started_at)
                            : null;

                        return (
                          <div key={lv.id} className="arena-hall-live-row">
                            <div className="arena-hall-live-row__main">
                              <span className="arena-hall-live-row__tag arena-mono">
                                👀 Đang so tài · {progressText}
                              </span>
                              <span className="arena-hall-live-row__scope">
                                <ScopeLabel
                                  scope={lv.scope}
                                  scopeLabel={lv.scope_label}
                                  options={optionsCatalog}
                                />
                              </span>
                            </div>

                            <div className="arena-hall-live-row__meta arena-mono">
                              <span>
                                {KIND_LABELS[lv.kind] || 'Ván đấu'} ·{' '}
                                {Number(lv.players) || 2}/{Number(lv.capacity) || 2} bạn
                              </span>
                              {elapsedMs !== null && (
                                <span className="arena-hall-live-row__time">
                                  ⏱ {formatElapsedShort(elapsedMs)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {block.liveRooms.length > COLLAPSED_LIVE_LIMIT && (
                      <button
                        type="button"
                        className="arena-hall-live-toggle"
                        onClick={() => toggleLiveExpand(block.key)}
                      >
                        {isLiveExpanded
                          ? 'Thu gọn danh sách đang so tài ▴'
                          : `Xem thêm ${hiddenLiveCount} ván đang so tài ▾`}
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* SHEET BỘ LỌC PHÂN MÔN -> CHƯƠNG -> BÀI TRÊN MOBILE */}
      {showFilterSheet && (
        <div
          className="arena-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="arena-hall-filter-sheet-title"
        >
          <div className="arena-sheet">
            <div className="arena-sheet__header">
              <h3 id="arena-hall-filter-sheet-title" className="arena-title-md">
                ⚙ Lọc phòng &amp; lượt đấu theo bài
              </h3>
              <button
                type="button"
                className="arena-btn arena-btn--secondary arena-btn--sm"
                onClick={() => setShowFilterSheet(false)}
              >
                Đóng
              </button>
            </div>

            <div className="arena-sheet__body">
              <div style={{ marginBottom: '14px' }}>
                <label htmlFor="hall-mobile-subject" className="arena-field-label">
                  1. Môn học
                </label>
                <select
                  id="hall-mobile-subject"
                  className="arena-select"
                  value={selectedSubject}
                  onChange={(e) => handleSelectSubjectChip(e.target.value)}
                >
                  <option value="">Tất cả môn học</option>
                  {availableSubjects.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                  {subjectChips.some((c) => c.key === 'unselected') && (
                    <option value="unselected">Chưa chọn môn (Bỏ phiếu)</option>
                  )}
                </select>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label htmlFor="hall-mobile-branch" className="arena-field-label">
                  2. Phân môn
                </label>
                <select
                  id="hall-mobile-branch"
                  className="arena-select"
                  value={selectedBranch}
                  disabled={
                    !/^[1-9]\d*$/.test(String(selectedSubject)) ||
                    availableBranches.length === 0
                  }
                  onChange={(e) => {
                    setSelectedBranch(e.target.value);
                    setSelectedChapter('');
                    setSelectedTopicId('');
                  }}
                >
                  <option value="">
                    {!/^[1-9]\d*$/.test(String(selectedSubject))
                      ? 'Chọn một môn học trước'
                      : availableBranches.length === 0
                      ? 'Môn này không chia phân môn'
                      : 'Tất cả phân môn'}
                  </option>
                  {availableBranches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label htmlFor="hall-mobile-chapter" className="arena-field-label">
                  3. Chương
                </label>
                <select
                  id="hall-mobile-chapter"
                  className="arena-select"
                  value={selectedChapter}
                  disabled={
                    !/^[1-9]\d*$/.test(String(selectedSubject)) ||
                    availableChapters.length === 0
                  }
                  onChange={(e) => {
                    setSelectedChapter(e.target.value);
                    setSelectedTopicId('');
                  }}
                >
                  <option value="">
                    {!/^[1-9]\d*$/.test(String(selectedSubject))
                      ? 'Chọn một môn học trước'
                      : 'Tất cả chương'}
                  </option>
                  {availableChapters.map((chName) => (
                    <option key={chName} value={chName}>
                      {chName}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label htmlFor="hall-mobile-topic" className="arena-field-label">
                  4. Bài học cụ thể
                </label>
                <select
                  id="hall-mobile-topic"
                  className="arena-select"
                  value={selectedTopicId}
                  disabled={
                    !/^[1-9]\d*$/.test(String(selectedSubject)) ||
                    availableTopics.length === 0
                  }
                  onChange={(e) => setSelectedTopicId(e.target.value)}
                >
                  <option value="">
                    {!/^[1-9]\d*$/.test(String(selectedSubject))
                      ? 'Chọn một môn học trước'
                      : 'Tất cả bài học'}
                  </option>
                  {availableTopics.map((tp) => (
                    <option key={tp.id} value={String(tp.id)}>
                      {tp.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label htmlFor="hall-mobile-kind" className="arena-field-label">
                  5. Kiểu thi đấu
                </label>
                <select
                  id="hall-mobile-kind"
                  className="arena-select"
                  value={selectedKind}
                  onChange={(e) => setSelectedKind(e.target.value)}
                >
                  <option value="">Mọi kiểu đấu</option>
                  <option value="duel">Đấu đôi (1v1)</option>
                  <option value="team">Đấu đội</option>
                  <option value="ffa">Nhiều người</option>
                </select>
              </div>

              <label className="arena-filter-checkbox" style={{ minHeight: '44px' }}>
                <input
                  type="checkbox"
                  checked={onlyOpenSlot}
                  onChange={(e) => setOnlyOpenSlot(e.target.checked)}
                />
                <span>Chỉ hiện phòng đang chờ còn chỗ trống</span>
              </label>
            </div>

            <div className="arena-sheet__footer">
              <button
                type="button"
                className="arena-btn arena-btn--secondary"
                onClick={() => {
                  setSelectedBranch('');
                  setSelectedChapter('');
                  setSelectedTopicId('');
                  setSelectedKind('');
                  setOnlyOpenSlot(true);
                }}
              >
                Đặt lại
              </button>
              <button
                type="button"
                className="arena-btn arena-btn--amber"
                onClick={() => setShowFilterSheet(false)}
              >
                Xem kết quả
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
