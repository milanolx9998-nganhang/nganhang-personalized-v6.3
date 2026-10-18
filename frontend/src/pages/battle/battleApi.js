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
  getLobby() {
    return api.get(`${BASE}/lobby`);
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
