import { api } from '../../api/client.js';

const BASE = '/api/battle';

/**
 * Xây chuỗi query từ object, tự động bỏ qua giá trị undefined/null/rỗng.
 */
function buildQuery(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val === undefined || val === null || val === '') return;
    if (Array.isArray(val)) {
      if (val.length > 0) sp.set(key, val.join(','));
    } else {
      sp.set(key, String(val));
    }
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export function buildLobbyQuery(params = {}) {
  if (!params || typeof params !== 'object') return '';
  const isPositiveIntStr = (v) => {
    if (v === undefined || v === null || v === '') return false;
    const s = String(v).trim();
    if (!/^[1-9]\d*$/.test(s)) return false;
    const n = Number(s);
    return Number.isInteger(n) && n >= 1 && n <= 2147483647;
  };
  if (!isPositiveIntStr(params.subject_id)) return '';
  const sp = new URLSearchParams();
  sp.set('subject_id', String(params.subject_id).trim());
  if (isPositiveIntStr(params.branch_id)) sp.set('branch_id', String(params.branch_id).trim());
  if (typeof params.chapter === 'string' && params.chapter.trim().length > 0) {
    sp.set('chapter', params.chapter.trim().slice(0, 200));
  }
  if (isPositiveIntStr(params.topic_id)) sp.set('topic_id', String(params.topic_id).trim());
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export const battleApi = {
  // 1. Tư cách, cờ hệ thống, phòng đang tham gia, hàng chờ, tạm khoá
  getMe() {
    return api.get(`${BASE}/me`);
  },

  // 2. Danh sách môn, phân môn, chương, bài và gợi ý đủ câu hỏi
  getOptions(params = {}) {
    return api.get(`${BASE}/options${buildQuery(params)}`);
  },

  // 3. Ảnh chụp sảnh ban đầu

  getLobby(params = {}) {
    return api.get(`${BASE}/lobby${buildLobbyQuery(params)}`);
  },

  // 4. Lịch sử 10 ván đã kết thúc của người dùng
  getHistory() {
    return api.get(`${BASE}/history`);
  },

  // 5. Tạo phòng mới (duel, team, ffa cho HS; class cho GV/Admin)
  createRoom(payload) {
    return api.post(`${BASE}/rooms`, payload);
  },

  // 6. Vào phòng bằng mã 6 số
  joinRoomByCode(code) {
    const cleanCode = String(code || '').replace(/\s+/g, '');
    return api.post(`${BASE}/rooms/join`, { code: cleanCode });
  },

  // 7. Vào phòng công khai từ sảnh hoặc thẻ phòng lớp ghim
  joinRoomById(roomId) {
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/join`, {});
  },

  // 8. Rời phòng
  leaveRoom(roomId) {
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/leave`, {});
  },

  // 9. Bật/tắt trạng thái Sẵn sàng trong phòng chờ
  setReady(roomId, ready) {
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/ready`, {
      ready: Boolean(ready),
    });
  },

  // 10. Đổi đội trong phòng đấu đội (team: 1 | 2)
  setTeam(roomId, team) {
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/team`, {
      team: Number(team),
    });
  },

  // 11. Bỏ phiếu chọn nội dung (force = true dành cho chủ phòng khi quá bán)
  voteContent(roomId, optionId, force = false) {
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/vote`, {
      option_id: optionId,
      force: Boolean(force),
    });
  },

  // 12. Đề cử phạm vi ở vòng 2 hoặc chủ phòng chốt phạm vi khi hết 2 lượt không phiếu
  nominateScope(roomId, scope) {
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/nominate`, {
      scope,
    });
  },

  // 13. Chủ phòng bắt đầu ván đấu (phòng lớp có thể gửi { show_top3: true })
  startRoom(roomId, options = {}) {
    const body = {};
    if (typeof options.show_top3 === 'boolean') {
      body.show_top3 = options.show_top3;
    }
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/start`, body);
  },

  // 14. Chốt câu trả lời hoặc bỏ qua câu hỏi
  submitAnswer(roomId, { index, client_id, response, skip = false }) {
    const body = skip
      ? { index, client_id, skip: true }
      : { index, client_id, response };
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/answer`, body);
  },

  // 15. Sang câu tiếp theo từ màn lời giải (reveal)
  nextQuestion(roomId) {
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/next`, {});
  },

  // 16. Giáo viên tạm dừng câu hỏi đang chạy
  pauseRoom(roomId) {
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/pause`, {});
  },

  // 17. Giáo viên tiếp tục câu hỏi đang tạm dừng
  resumeRoom(roomId) {
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/resume`, {});
  },

  // 18. Kết thúc sớm ván đấu (GV phòng lớp hoặc chủ phòng HS còn một mình)
  endRoom(roomId) {
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/end`, {});
  },

  // 19. Gửi biểu cảm nhanh (hello | cheer | thanks | well_done)
  sendEmote(roomId, kind) {
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/emote`, { kind });
  },

  // 20. Tạo phòng đấu lại (rematch)
  rematch(roomId) {
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/rematch`, {});
  },

  // 21. Tạo lượt luyện tập lại các câu vừa làm sai trong ván
  retryWrong(roomId) {
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/retry-wrong`, {});
  },

  // 22. Lấy kết quả ván đấu đã kết thúc
  getRoomResult(roomId) {
    return api.get(`${BASE}/rooms/${encodeURIComponent(roomId)}/result`);
  },

  // 23. Tìm trận ghép tự động (duel | ffa)
  startMatchmaking(kind, scope = {}) {
    return api.post(`${BASE}/match`, { kind, scope });
  },

  // 24. Đồng ý lời mời mở rộng phạm vi tìm trận
  acceptMatchOffer() {
    return api.patch(`${BASE}/match`, { accept: true });
  },

  // 25. Huỷ tìm trận
  cancelMatchmaking() {
    return api.del(`${BASE}/match`, {});
  },

  // 26. Báo cáo người chơi khác trong phòng
  createReport({ room_id, target_id, reason, note }) {
    const payload = { room_id, target_id, reason };
    if (note && note.trim()) {
      payload.note = note.trim().slice(0, 500);
    }
    return api.post(`${BASE}/reports`, payload);
  },

  // 27. Danh sách người dùng mà mình đã chặn
  getBlocks() {
    return api.get(`${BASE}/blocks`);
  },

  // 28. Chặn một người chơi đã từng cùng phòng
  blockUser(userId) {
    return api.post(`${BASE}/blocks`, { user_id: userId });
  },

  // 29. Bỏ chặn người chơi
  unblockUser(userId) {
    return api.del(`${BASE}/blocks/${encodeURIComponent(userId)}`, {});
  },

  // 30. Danh sách lớp học của giáo viên (phục vụ mở phòng lớp)
  getTeacherClasses() {
    return api.get('/api/practice/classes');
  },

  // 31. Quản trị: Lấy danh sách báo cáo vi phạm
  adminGetReports(params = {}) {
    return api.get(`${BASE}/admin/reports${buildQuery(params)}`);
  },

  // 32. Quản trị: Cập nhật trạng thái báo cáo (reviewing | resolved | dismissed)
  adminUpdateReportStatus(id, status) {
    return api.post(`${BASE}/admin/reports`, { id, status });
  },

  // 33. Quản trị: Xem chi tiết bằng chứng báo cáo & ảnh chụp ván đấu
  adminGetReportDetail(id) {
    return api.get(`${BASE}/admin/reports/${encodeURIComponent(id)}`);
  },

  // 34. Quản trị: Lấy danh sách học sinh đang bị tạm khoá tính năng Đấu
  adminGetSuspensions() {
    return api.get(`${BASE}/admin/suspensions`);
  },

  // 35. Quản trị: Tạo lệnh tạm khoá mới (days: 1 | 3 | 7)
  adminCreateSuspension({ user_id, days, reason }) {
    return api.post(`${BASE}/admin/suspensions`, {
      user_id: Number(user_id),
      days: Number(days),
      reason: String(reason || '').trim(),
    });
  },

  // 36. Quản trị: Lấy cấu hình hệ thống Đấu
  adminGetSettings() {
    return api.get(`${BASE}/admin/settings`);
  },

  // 37. Quản trị: Lưu cấu hình hệ thống Đấu (battle_enabled, battle_emergency_stop, battle_modes, battle_limits)
  adminUpdateSettings(payload) {
    return api.post(`${BASE}/admin/settings`, payload);
  },
};

/**
 * Helper quản lý client_id (UUID) duy nhất cho mỗi cặp (roomId, questionIndex)
 * lưu trong sessionStorage theo đúng hợp đồng.
 */
export function getOrCreateAnswerClientId(roomId, questionIndex) {
  const storageKey = `battle:${roomId}:${questionIndex}`;
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const uuid =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });
    window.sessionStorage.setItem(storageKey, uuid);
    return uuid;
  } catch {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

/**
 * Định dạng mã phòng 6 chữ số luôn hiển thị thống nhất dạng "482 910"
 */
export function formatRoomCode(code) {
  if (!code) return '--- ---';
  const raw = String(code).replace(/\s+/g, '');
  if (raw.length === 6) {
    return `${raw.slice(0, 3)} ${raw.slice(3, 6)}`;
  }
  return raw;
}

/* ---- Lượt 4b ---- */
export const battleApiFlex = {
  // 1. Tạo vé ghép trận linh hoạt V6.9.1
  startFlexMatch(ticket) {
    return api.post(`${BASE}/match`, ticket);
  },

  // 2. Xác nhận vào phòng gợi ý khi đang trong hàng chờ
  acceptSuggestedRoom(roomId) {
    return api.post(`${BASE}/match/accept-room`, { room_id: roomId });
  },

  // 3. Lối thoát khỏi hàng chờ: 'bot' | 'public_room' | 'practice'
  exitMatchQueue({ to, difficulty }) {
    const payload = { to };
    if (difficulty) payload.difficulty = difficulty;
    return api.post(`${BASE}/match/exit`, payload);
  },

  // 4. Đấu với máy ngay từ sảnh (không qua hàng chờ, không tính hạng)
  startBotBattle({ choices = [], lengths = 'any', difficulty = 'medium' } = {}) {
    return api.post(`${BASE}/bot`, { choices, lengths, difficulty });
  },

  // 5. Đổi chế độ hiển thị phòng ở phòng chờ (code / public / open_slots)
  updateRoomVisibility(roomId, { visibility, open_slots }) {
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/visibility`, {
      visibility,
      open_slots: Boolean(open_slots),
    });
  },

  // 6. Bật/tắt sẵn sàng kèm tuỳ chọn tính hạng cá nhân
  setReadyWithRank(roomId, { ready, ranked }) {
    const body = { ready: Boolean(ready) };
    if (typeof ranked === 'boolean') {
      body.ranked = ranked;
    }
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/ready`, body);
  },

  // 7. Xem bậc học thuật, LP, tiến độ định vị và lịch sử tính hạng của học sinh
  getMyRank() {
    return api.get(`${BASE}/rank`);
  },

  // 8. Ẩn / hiện huy hiệu bậc học thuật công khai
  updateRankVisibility(hidden) {
    return api.patch(`${BASE}/rank`, { hidden: Boolean(hidden) });
  },

  // 9. Bảng cao thủ cùng khối (chỉ khi cờ leaderboard bật)
  getLeaderboard() {
    return api.get(`${BASE}/leaderboard`);
  },

  // 10. Danh sách khung giờ vàng (dành cho Giáo viên được cấp quyền / Quản trị)
  getGoldenHours() {
    return api.get(`${BASE}/golden-hours`);
  },

  // 11. Tạo khung giờ vàng mới
  createGoldenHour(payload) {
    return api.post(`${BASE}/golden-hours`, payload);
  },

  // 12. Cập nhật khung giờ vàng
  updateGoldenHour(id, payload) {
    return api.put(`${BASE}/golden-hours/${encodeURIComponent(id)}`, payload);
  },

  // 13. Xoá khung giờ vàng
  deleteGoldenHour(id) {
    return api.del(`${BASE}/golden-hours/${encodeURIComponent(id)}`, {});
  },

  // 14. Quản trị: Cấp / gỡ quyền quản lý giờ vàng cho giáo viên
  adminSetGoldenHourGrant({ user_id, grade, subject_id = null, enabled }) {
    return api.put(`${BASE}/admin/golden-hour-grants`, {
      user_id: Number(user_id),
      grade: Number(grade),
      subject_id: subject_id === null || subject_id === '' ? null : Number(subject_id),
      enabled: Boolean(enabled),
    });
  },

  // 15. Lấy danh sách lớp giáo viên được phân công (quản trị: mọi lớp)
  getTeacherClassesSafe() {
    return api.get('/api/practice/classes');
  },
};

export const battleApiModes = {
  // 1. Chuyển sang câu tiếp theo ở chế độ Tự chơi (bắt buộc gửi expected_cursor)
  nextSelf(roomId, expectedCursor) {
    return api.post(`${BASE}/rooms/${encodeURIComponent(roomId)}/next`, {
      expected_cursor: Number(expectedCursor),
    });
  },

  // 2. Lấy snapshot HTTP hiện tại của phòng (cùng hợp đồng với SSE /rooms/:id/stream)
  getRoom(roomId) {
    return api.get(`${BASE}/rooms/${encodeURIComponent(roomId)}`);
  },

  // 3. Lấy dữ liệu màn chiếu 16:9 riêng cho giáo viên chủ phòng lớp (không lộ câu hỏi/đáp án cá nhân)
  getProjector(roomId) {
    return api.get(`${BASE}/rooms/${encodeURIComponent(roomId)}/projector`);
  },
};

// V6.9.5 Đấu từ vựng: bộ từ chơi được và hàng chờ riêng (không qua /match của Đấu bài học).
export const battleApiVocab = {
  getSets(subjectId, classId) {
    return api.get(`${BASE}/vocab/sets${buildQuery({ subject_id: subjectId, class_id: classId })}`);
  },
  joinMatch(payload) {
    return api.post(`${BASE}/vocab/match`, payload);
  },
  getMatch() {
    return api.get(`${BASE}/vocab/match`);
  },
  leaveMatch() {
    return api.del(`${BASE}/vocab/match`);
  },
  toBot(difficulty = 'medium') {
    return api.post(`${BASE}/vocab/match/bot`, { difficulty });
  },
};

// Nhãn dạng câu từ vựng (giáo viên chọn khi tạo Quiz lớp).
export const VOCAB_KIND_LABELS = {
  EN1: 'Từ → nghĩa',
  EN2: 'Nghĩa → từ',
  EN3: 'Điền từ vào câu ví dụ',
  EN4: 'Gõ chính tả theo nghĩa',
  EN5: 'Ghép cặp',
  ZH1: 'Chữ Hán → nghĩa',
  ZH2: 'Nghĩa → chữ Hán',
  ZH3: 'Chữ Hán → pinyin',
  ZH4: 'Pinyin → chữ Hán',
  ZH5: 'Chọn thanh điệu',
  ZH6: 'Ghép cặp',
};
export const VOCAB_KINDS = { en: ['EN1', 'EN2', 'EN3', 'EN4', 'EN5'], zh: ['ZH1', 'ZH2', 'ZH3', 'ZH4', 'ZH5', 'ZH6'] };

// Lựa chọn chưa chốt giữ qua F5 trong cùng tab (như client_id của đáp án): chỉ là bản nháp trên máy, chốt mới tính.
const draftKey = (roomId, index) => `battle-draft:${roomId}:${index}`;
export function loadDraftAnswer(roomId, index) {
  if (!roomId || index === null || index === undefined) return null;
  try {
    const raw = window.sessionStorage.getItem(draftKey(roomId, index));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function saveDraftAnswer(roomId, index, value) {
  if (!roomId || index === null || index === undefined) return;
  try {
    if (value === null || value === undefined) window.sessionStorage.removeItem(draftKey(roomId, index));
    else window.sessionStorage.setItem(draftKey(roomId, index), JSON.stringify(value));
  } catch {
    /* trình duyệt chặn lưu trữ: bỏ qua */
  }
}
