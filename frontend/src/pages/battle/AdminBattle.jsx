import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { battleApi, battleApiFlex } from './battleApi.js';
import '../../styles/arena.css';

// Danh sách 11 cờ khả năng battle_modes theo hợp đồng V6.9.2
const BATTLE_MODE_ITEMS = [
  {
    key: 'class',
    title: 'Phòng cả lớp (Giáo viên)',
    desc: 'Cho phép giáo viên mở phòng chiếu 16:9 và ghim thẻ phòng lớp cho học sinh.',
  },
  {
    key: 'duel_code',
    title: 'Đấu đôi qua mã phòng',
    desc: 'Học sinh tạo phòng riêng 1v1 và rủ bạn bè bằng mã 6 số.',
  },
  {
    key: 'lobby',
    title: 'Sảnh phòng công khai',
    desc: 'Hiển thị danh sách phòng chờ công khai và phòng mở chỗ trống tại sảnh.',
  },
  {
    key: 'matchmaking',
    title: 'Ghép trận linh hoạt',
    desc: 'Cho phép học sinh tạo vé tìm đối thủ tự động cùng khối.',
  },
  {
    key: 'vote',
    title: 'Bỏ phiếu chọn nội dung',
    desc: 'Cho phép phòng chờ bầu chọn 2 vòng: Môn học và Chương/Bài.',
  },
  {
    key: 'ffa',
    title: 'Nhiều người chơi (FFA 4–20 bạn)',
    desc: 'Chế độ đấu tự do nhiều học sinh trong cùng một phòng.',
  },
  {
    key: 'team',
    title: 'Đấu đội (2 đội kéo co)',
    desc: 'Chia 2 đội (1–4 bạn/đội) thi đua tổng điểm.',
  },
  {
    key: 'bot',
    title: 'Đối thủ máy (Bot)',
    desc: 'Cho phép luyện đấu với máy từ sảnh hoặc lấp chỗ khi hàng chờ vắng.',
  },
  {
    key: 'golden_hour',
    title: 'Khung Giờ vàng',
    desc: 'Hiển thị banner Giờ vàng và tăng tốc độ nới phạm vi ghép trận theo môn.',
  },
  {
    key: 'ranked',
    title: 'Xếp hạng học thuật (Rank / LP)',
    desc: 'Tính điểm LP và bậc học thuật cho các ván đấu đủ điều kiện phạm vi Chương.',
  },
  {
    key: 'leaderboard',
    title: 'Bảng cao thủ cùng khối',
    desc: 'Hiển thị danh sách tối đa 20 bạn cùng khối đã đồng ý công khai huy hiệu.',
  },
];

// Giá trị mặc định chuẩn của battle_flex theo hợp đồng
const DEFAULT_BATTLE_FLEX = {
  chapter_ms: 10000,
  subject_ms: 20000,
  exit_ms: 30000,
  length_ms: 10000,
  kind_ms: 0,
  round_ms: 2000,
  batch_size: 50,
  min_group: 3,
  max_group: 20,
  pair_ms: 20000,
  seconds: 30,

  countdown_ms: 5000,
  public_start_ms: 60000,
  exclude_ms: 300000,
  waiting_visible_min: 5,
  activity_ms: 900000,

  golden_chapter_ms: 5000,
  golden_subject_ms: 10000,
  golden_exit_ms: 15000,
  golden_banner_ms: 1800000,

  bot_ms: 15000,
  bot_default: 'medium',
  bot_easy: 0.85,
  bot_medium: 1,
  bot_hard: 1.15,
  bot_min_samples: 10,
  bot_nb: 0.8,
  bot_th: 0.65,
  bot_vd: 0.45,
  bot_probability_min: 0.05,
  bot_probability_max: 0.95,
  bot_time_min: 0.35,
  bot_time_max: 0.85,
};

// Giá trị mặc định chuẩn của battle_rank theo hợp đồng
const DEFAULT_BATTLE_RANK = {
  season: '2026-HK1',
  base_mmr: 1000,
  reset_factor: 0.5,
  lp_reset_factor: 0.5,
  mmr_window: 250,
  mmr_window_ms: 8000,
  mmr_k: 24,
  mmr_scale: 400,

  duel_win: 25,
  duel_loss: -10,
  underdog_gap: 150,
  underdog_win: 35,
  underdog_loss: -5,
  tie: 10,
  lp_three: [30, 10, -8],
  lp_four: [35, 18, -5, -10],
  chapter_factor: 1,
  subject_factor: 1.1,
  multi_subject_factor: 1.2,

  bot_wait_ms: 25000,
  bot_win_cap: 12,
  bot_loss: -5,
  bot_daily: 3,

  pair_daily: 10,
  streak_wins: 3,
  streak_factor: 0.5,
  abnormal_ms: 2000,
  abnormal_factor: 0.5,
  shield_daily: 1,

  max_players: 4,
  division_lp: 100,
  divisions: 3,
  placement_games: 3,
  placement_bonus: 5,
  visible_tier: 2,
  narrow_ratio: 0.5,
  ranked_lengths: [7, 10],
  self_created: false,
  tiers: [
    'Tập sự',
    'Khám phá',
    'Tinh anh',
    'Thông thái',
    'Bậc thầy',
    'Thách đấu',
  ],
};

// Cấu trúc phân nhóm trường nhập liệu cho battle_flex
const FLEX_FIELD_GROUPS = [
  {
    id: 'widen',
    title: 'Lịch nới phạm vi & Ghép trận',
    fields: [
      { key: 'chapter_ms', label: 'Mốc nới ra Chương (ms)', type: 'number' },
      { key: 'subject_ms', label: 'Mốc nới ra Môn (ms)', type: 'number' },
      { key: 'exit_ms', label: 'Mốc mở 3 lối thoát (ms)', type: 'number' },
      { key: 'length_ms', label: 'Mốc mở rộng độ dài câu (ms)', type: 'number' },
      { key: 'kind_ms', label: 'Mốc mở rộng kiểu đấu (ms)', type: 'number' },
      { key: 'round_ms', label: 'Chu kỳ quét hàng chờ (ms)', type: 'number' },
      { key: 'batch_size', label: 'Kích thước lô ghép (tối đa 50)', type: 'number' },
      { key: 'min_group', label: 'Số người tối thiểu nhóm FFA', type: 'number' },
      { key: 'max_group', label: 'Số người tối đa nhóm FFA', type: 'number' },
      { key: 'pair_ms', label: 'Thời gian giữ cặp ghép (ms)', type: 'number' },
      { key: 'seconds', label: 'Thời gian mỗi câu mặc định (giây)', type: 'number' },
    ],
  },
  {
    id: 'room_display',
    title: 'Phòng tự chạy & Hiển thị sảnh',
    fields: [
      { key: 'countdown_ms', label: 'Đếm ngược vào ván (ms)', type: 'number' },
      { key: 'public_start_ms', label: 'Tự bắt đầu phòng mở khi đủ điều kiện (ms)', type: 'number' },
      { key: 'exclude_ms', label: 'Ẩn phòng vừa rời khỏi gợi ý (ms)', type: 'number' },
      { key: 'waiting_visible_min', label: 'Ngưỡng tối thiểu hiện số người đang chờ', type: 'number' },
      { key: 'activity_ms', label: 'Cửa sổ tính học sinh đang ôn toàn trường (ms)', type: 'number' },
    ],
  },
  {
    id: 'golden_timing',
    title: 'Tốc độ nới trong Giờ vàng',
    fields: [
      { key: 'golden_chapter_ms', label: 'Giờ vàng: Nới ra Chương (ms)', type: 'number' },
      { key: 'golden_subject_ms', label: 'Giờ vàng: Nới ra Môn (ms)', type: 'number' },
      { key: 'golden_exit_ms', label: 'Giờ vàng: Mở lối thoát (ms)', type: 'number' },
      { key: 'golden_banner_ms', label: 'Hiện banner trước Giờ vàng (ms)', type: 'number' },
    ],
  },
  {
    id: 'bot_params',
    title: 'Thông số Đối thủ máy (Bot)',
    fields: [
      { key: 'bot_ms', label: 'Mốc hiện nút Đấu với máy ngay (ms)', type: 'number' },
      {
        key: 'bot_default',
        label: 'Độ khó máy mặc định',
        type: 'select',
        options: [
          { value: 'easy', label: 'Dễ (easy)' },
          { value: 'medium', label: 'Vừa (medium)' },
          { value: 'hard', label: 'Khó (hard)' },
        ],
      },
      { key: 'bot_easy', label: 'Hệ số độ khó Dễ', type: 'number', step: '0.05' },
      { key: 'bot_medium', label: 'Hệ số độ khó Vừa', type: 'number', step: '0.05' },
      { key: 'bot_hard', label: 'Hệ số độ khó Khó', type: 'number', step: '0.05' },
      { key: 'bot_min_samples', label: 'Số mẫu tối thiểu thống kê câu hỏi', type: 'number' },
      { key: 'bot_nb', label: 'Xác suất đúng câu Nhận biết', type: 'number', step: '0.05' },
      { key: 'bot_th', label: 'Xác suất đúng câu Thông hiểu', type: 'number', step: '0.05' },
      { key: 'bot_vd', label: 'Xác suất đúng câu Vận dụng', type: 'number', step: '0.05' },
      { key: 'bot_probability_min', label: 'Trần dưới xác suất máy đúng', type: 'number', step: '0.05' },
      { key: 'bot_probability_max', label: 'Trần trên xác suất máy đúng', type: 'number', step: '0.05' },
      { key: 'bot_time_min', label: 'Tỉ lệ thời gian trả lời tối thiểu', type: 'number', step: '0.05' },
      { key: 'bot_time_max', label: 'Tỉ lệ thời gian trả lời tối đa', type: 'number', step: '0.05' },
    ],
  },
];

// Cấu trúc phân nhóm trường nhập liệu cho battle_rank
const RANK_FIELD_GROUPS = [
  {
    id: 'season_mmr',
    title: 'Mùa học thuật & Hệ số ghép MMR',
    fields: [
      { key: 'season', label: 'Mã mùa học kỳ (VD: 2026-HK1)', type: 'text' },
      { key: 'base_mmr', label: 'MMR khởi điểm', type: 'number' },
      { key: 'reset_factor', label: 'Hệ số reset mềm MMR đầu mùa', type: 'number', step: '0.05' },
      { key: 'lp_reset_factor', label: 'Hệ số reset LP đầu mùa', type: 'number', step: '0.05' },
      { key: 'mmr_window', label: 'Khoảng cách MMR ưu tiên ghép', type: 'number' },
      { key: 'mmr_window_ms', label: 'Thời gian giữ cửa sổ MMR (ms)', type: 'number' },
      { key: 'mmr_k', label: 'Hệ số K cập nhật MMR', type: 'number' },
      { key: 'mmr_scale', label: 'Thang chia MMR (Scale)', type: 'number' },
    ],
  },
  {
    id: 'lp_rewards',
    title: 'Điểm LP & Hệ số độ rộng kiến thức',
    fields: [
      { key: 'duel_win', label: 'LP thắng Đấu đôi', type: 'number' },
      { key: 'duel_loss', label: 'LP thua Đấu đôi (số âm)', type: 'number' },
      { key: 'underdog_gap', label: 'Chênh lệch MMR tính vượt cấp', type: 'number' },
      { key: 'underdog_win', label: 'LP thắng vượt cấp', type: 'number' },
      { key: 'underdog_loss', label: 'LP thua khi gặp cao thủ', type: 'number' },
      { key: 'tie', label: 'LP khi hoà điểm', type: 'number' },
      { key: 'lp_three', label: 'Mảng LP ván 3 người (cách nhau dấu phẩy)', type: 'number_array' },
      { key: 'lp_four', label: 'Mảng LP ván 4 người (cách nhau dấu phẩy)', type: 'number_array' },
      { key: 'chapter_factor', label: 'Hệ số phạm vi Chương', type: 'number', step: '0.05' },
      { key: 'subject_factor', label: 'Hệ số phạm vi cả Môn', type: 'number', step: '0.05' },
      { key: 'multi_subject_factor', label: 'Hệ số nhiều Môn', type: 'number', step: '0.05' },
    ],
  },
  {
    id: 'ranked_bot_antifarm',
    title: 'Máy có hạng, Chống cày điểm & Khiên bảo vệ mạng',
    fields: [
      { key: 'bot_wait_ms', label: 'Thời gian chờ tối thiểu để ghép máy có hạng (ms)', type: 'number' },
      { key: 'bot_win_cap', label: 'Trần LP tối đa khi thắng máy', type: 'number' },
      { key: 'bot_loss', label: 'LP trừ khi thua máy', type: 'number' },
      { key: 'bot_daily', label: 'Số ván máy có hạng tối đa/ngày', type: 'number' },
      { key: 'pair_daily', label: 'Số ván tính hạng tối đa cùng 1 đối thủ/ngày', type: 'number' },
      { key: 'streak_wins', label: 'Ngưỡng chuỗi thắng cùng cặp giảm LP', type: 'number' },
      { key: 'streak_factor', label: 'Hệ số giảm LP khi vượt chuỗi', type: 'number', step: '0.05' },
      { key: 'abnormal_ms', label: 'Ngưỡng trả lời quá nhanh bất thường (ms)', type: 'number' },
      { key: 'abnormal_factor', label: 'Hệ số giảm LP khi có dấu hiệu bất thường', type: 'number', step: '0.05' },
      { key: 'shield_daily', label: 'Số lần Khiên bảo vệ rớt mạng/ngày', type: 'number' },
    ],
  },
  {
    id: 'tiers_scope',
    title: 'Bậc học thuật, Định vị & Phạm vi',
    fields: [
      { key: 'max_players', label: 'Số người tối đa ván tính hạng', type: 'number' },
      { key: 'division_lp', label: 'Số LP mỗi cấp (III → II → I)', type: 'number' },
      { key: 'divisions', label: 'Số cấp trong mỗi bậc', type: 'number' },
      { key: 'placement_games', label: 'Số ván định vị đầu mùa', type: 'number' },
      { key: 'placement_bonus', label: 'Điểm thưởng LP mỗi ván định vị', type: 'number' },
      { key: 'visible_tier', label: 'Chỉ số bậc tối thiểu được hiện huy hiệu (0–5)', type: 'number' },
      { key: 'narrow_ratio', label: 'Tỉ lệ chia câu khi Rộng gặp Hẹp', type: 'number', step: '0.05' },
      { key: 'ranked_lengths', label: 'Độ dài ván hợp lệ tính hạng (VD: 7, 10)', type: 'number_array' },
      { key: 'self_created', label: 'Cho phép phòng tự tạo đăng ký tính hạng', type: 'boolean' },
      { key: 'tiers', label: 'Tên 6 bậc học thuật (cách nhau dấu phẩy)', type: 'string_array' },
    ],
  },
];

const WEEKDAYS_VN = [
  { day: 1, label: 'T2' },
  { day: 2, label: 'T3' },
  { day: 3, label: 'T4' },
  { day: 4, label: 'T5' },
  { day: 5, label: 'T6' },
  { day: 6, label: 'T7' },
  { day: 0, label: 'CN' },
];

const REPORT_REASON_LABELS = {
  bullying: 'Trêu chọc / Bắt nạt',
  name: 'Tên hiển thị xấu',
  cheating: 'Gian lận / Phá rối',
  other: 'Lý do khác',
};

function formatDateTimeVN(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(val);
  }
}

/**
 * Chuyển chuỗi datetime-local sang chuỗi ISO có offset +07:00 theo chuẩn Việt Nam.
 */
function toIsoWithVnOffset(localInputStr) {
  if (!localInputStr) return '';
  if (localInputStr.includes('+') || localInputStr.endsWith('Z')) {
    return localInputStr;
  }
  const normalized = localInputStr.length === 16 ? `${localInputStr}:00` : localInputStr;
  return `${normalized}+07:00`;
}

/**
 * Chuyển timestamp hoặc chuỗi ISO sang định dạng YYYY-MM-DDTHH:mm cho input datetime-local.
 */
function toDatetimeLocalValue(val) {
  if (!val) return '2026-10-20T20:00';
  try {
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return '2026-10-20T20:00';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  } catch {
    return '2026-10-20T20:00';
  }
}

export default function AdminBattle() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState('switches'); // 'switches' | 'params' | 'golden' | 'moderation'
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState('');
  const [globalSuccess, setGlobalSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // 1. Trạng thái & Công tắc
  const [battleEnabled, setBattleEnabled] = useState(false);
  const [emergencyStop, setEmergencyStop] = useState(false);
  const [confirmEmergencyModal, setConfirmEmergencyModal] = useState(null); // boolean target
  const [battleModes, setBattleModes] = useState(() => {
    const init = {};
    BATTLE_MODE_ITEMS.forEach((m) => {
      init[m.key] = false;
    });
    return init;
  });

  // 2. Tham số battle_flex, battle_rank, battle_limits
  const [flexForm, setFlexForm] = useState({ ...DEFAULT_BATTLE_FLEX });
  const [rankForm, setRankForm] = useState(() => ({
    ...DEFAULT_BATTLE_RANK,
    lp_three: DEFAULT_BATTLE_RANK.lp_three.join(', '),
    lp_four: DEFAULT_BATTLE_RANK.lp_four.join(', '),
    ranked_lengths: DEFAULT_BATTLE_RANK.ranked_lengths.join(', '),
    tiers: DEFAULT_BATTLE_RANK.tiers.join(', '),
  }));
  const [limitsForm, setLimitsForm] = useState(null);
  const [savingSection, setSavingSection] = useState('');

  // 3. Khung Giờ vàng & Cấp quyền Giáo viên
  const [goldenList, setGoldenList] = useState([]);
  const [editingGoldenId, setEditingGoldenId] = useState(null);
  const [ghGrade, setGhGrade] = useState(9);
  const [ghSubjectId, setGhSubjectId] = useState('1');
  const [ghStartsAt, setGhStartsAt] = useState('2026-10-20T20:00');
  const [ghMinutes, setGhMinutes] = useState(15);
  const [ghRepeatMode, setGhRepeatMode] = useState('weekly'); // 'once' | 'weekly'
  const [ghWeekdays, setGhWeekdays] = useState([2, 4]);
  const [ghActive, setGhActive] = useState(true);
  const [busyGolden, setBusyGolden] = useState(false);

  // Phân quyền giáo viên quản lý Giờ vàng
  const [grantUserId, setGrantUserId] = useState('');
  const [grantGrade, setGrantGrade] = useState(9);
  const [grantSubjectId, setGrantSubjectId] = useState('');
  const [grantEnabled, setGrantEnabled] = useState(true);
  const [busyGrant, setBusyGrant] = useState(false);

  // 4. Báo cáo vi phạm & Xem chi tiết bằng chứng
  const [reports, setReports] = useState([]);
  const [reportFilterStatus, setReportFilterStatus] = useState('');
  const [selectedReportDetail, setSelectedReportDetail] = useState(null);
  const [loadingReportDetail, setLoadingReportDetail] = useState(false);
  const [busyReportId, setBusyReportId] = useState(null);

  // 5. Danh sách Tạm khoá & Tạo tạm khoá mới
  const [suspensions, setSuspensions] = useState([]);
  const [suspUserId, setSuspUserId] = useState('');
  const [suspDays, setSuspDays] = useState(1);
  const [suspReason, setSuspReason] = useState('');
  const [busySuspend, setBusySuspend] = useState(false);

  const showToast = (msg) => {
    setGlobalSuccess(msg);
    setTimeout(() => setGlobalSuccess(''), 3500);
  };

  const applyServerSettings = useCallback((data) => {
    if (!data || typeof data !== 'object') return;
    if (typeof data.battle_enabled === 'boolean') {
      setBattleEnabled(data.battle_enabled);
    }
    if (typeof data.battle_emergency_stop === 'boolean') {
      setEmergencyStop(data.battle_emergency_stop);
    }
    if (data.battle_modes && typeof data.battle_modes === 'object') {
      setBattleModes((prev) => ({ ...prev, ...data.battle_modes }));
    }
    if (data.battle_flex && typeof data.battle_flex === 'object') {
      setFlexForm((prev) => ({ ...prev, ...data.battle_flex }));
    }
    if (data.battle_rank && typeof data.battle_rank === 'object') {
      const r = { ...DEFAULT_BATTLE_RANK, ...data.battle_rank };
      setRankForm({
        ...r,
        lp_three: Array.isArray(r.lp_three) ? r.lp_three.join(', ') : String(r.lp_three ?? '30, 10, -8'),
        lp_four: Array.isArray(r.lp_four) ? r.lp_four.join(', ') : String(r.lp_four ?? '35, 18, -5, -10'),
        ranked_lengths: Array.isArray(r.ranked_lengths)
          ? r.ranked_lengths.join(', ')
          : String(r.ranked_lengths ?? '7, 10'),
        tiers: Array.isArray(r.tiers) ? r.tiers.join(', ') : String(r.tiers ?? ''),
      });
    }
    if (data.battle_limits && typeof data.battle_limits === 'object') {
      setLimitsForm(data.battle_limits);
    }
  }, []);

  const loadAllAdminData = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setGlobalError('');
    try {
      const [settingsRes, ghRes, repRes, suspRes] = await Promise.all([
        battleApi.adminGetSettings().catch((e) => {
          throw e;
        }),
        battleApiFlex.getGoldenHours().catch(() => []),
        battleApi.adminGetReports().catch(() => []),
        battleApi.adminGetSuspensions().catch(() => []),
      ]);

      applyServerSettings(settingsRes);
      setGoldenList(Array.isArray(ghRes) ? ghRes : ghRes?.items || []);
      setReports(Array.isArray(repRes) ? repRes : repRes?.items || []);
      setSuspensions(Array.isArray(suspRes) ? suspRes : suspRes?.items || []);
    } catch (err) {
      setGlobalError(err?.message || 'Không tải được cấu hình quản trị Đấu.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, applyServerSettings]);

  useEffect(() => {
    loadAllAdminData();
  }, [loadAllAdminData]);

  // Trích xuất lỗi kiểm tra từng trường từ err.details của máy chủ
  const handleApiValidationError = (err, fallbackMsg) => {
    setGlobalError(err?.message || err?.error || fallbackMsg);
    if (err?.details && typeof err.details === 'object') {
      const nextErrors = {};
      const src = err.details.fields || err.details.errors || err.details;
      Object.entries(src).forEach(([k, v]) => {
        nextErrors[k] = Array.isArray(v) ? v.join(', ') : String(v);
      });
      setFieldErrors(nextErrors);
    }
  };

  // ===== 1. XỬ LÝ BẬT/TẮT TRẠNG THÁI, DỪNG KHẨN CẤP & BATTLE_MODES =====
  const handleToggleBattleEnabled = async () => {
    const nextVal = !battleEnabled;
    setSavingSection('enabled');
    setGlobalError('');
    try {
      const res = await battleApi.adminUpdateSettings({
        battle_enabled: nextVal,
      });
      setBattleEnabled(nextVal);
      if (res) applyServerSettings(res);
      showToast(
        nextVal
          ? 'Đã bật nhận ván đấu mới trên toàn hệ thống.'
          : 'Đã ngừng nhận ván mới (các ván đang chạy vẫn được chơi nốt).'
      );
    } catch (err) {
      handleApiValidationError(err, 'Không đổi được trạng thái battle_enabled.');
    } finally {
      setSavingSection('');
    }
  };

  const handleConfirmEmergencyStop = async () => {
    if (confirmEmergencyModal === null) return;
    const nextStop = Boolean(confirmEmergencyModal);
    setSavingSection('emergency');
    setGlobalError('');
    try {
      const res = await battleApi.adminUpdateSettings({
        battle_emergency_stop: nextStop,
      });
      setEmergencyStop(nextStop);
      setConfirmEmergencyModal(null);
      if (res) applyServerSettings(res);
      showToast(
        nextStop
          ? 'ĐÃ KÍCH HOẠT DỪNG KHẨN CẤP: Mọi ván đang chạy đã chuyển sang gián đoạn và đóng luồng.'
          : 'Đã gỡ trạng thái Dừng khẩn cấp.'
      );
    } catch (err) {
      handleApiValidationError(err, 'Không thể cập nhật trạng thái Dừng khẩn cấp.');
    } finally {
      setSavingSection('');
    }
  };

  const handleToggleModeFlag = (modeKey) => {
    setBattleModes((prev) => ({
      ...prev,
      [modeKey]: !prev[modeKey],
    }));
  };

  const handleSaveBattleModes = async () => {
    setSavingSection('modes');
    setGlobalError('');
    setFieldErrors({});
    try {
      // Gửi đầy đủ các khoá của battle_modes theo đúng hợp đồng
      const fullModesPayload = {};
      BATTLE_MODE_ITEMS.forEach((item) => {
        fullModesPayload[item.key] = Boolean(battleModes[item.key]);
      });
      const res = await battleApi.adminUpdateSettings({
        battle_modes: fullModesPayload,
      });
      if (res) applyServerSettings(res);
      showToast('Đã lưu cấu hình các chế độ Đấu (battle_modes).');
    } catch (err) {
      handleApiValidationError(err, 'Không lưu được các cờ chế độ Đấu.');
    } finally {
      setSavingSection('');
    }
  };

  // ===== 2. XỬ LÝ LƯU THAM SỐ GHÉP TRẬN (battle_flex) & XẾP HẠNG (battle_rank) =====
  const handleSaveFlexSettings = async (e) => {
    e.preventDefault();
    setSavingSection('flex');
    setGlobalError('');
    setFieldErrors({});

    const cleanedFlex = {};
    Object.keys(DEFAULT_BATTLE_FLEX).forEach((key) => {
      if (key === 'bot_default') {
        cleanedFlex[key] = String(flexForm[key] || 'medium');
      } else {
        cleanedFlex[key] = Number(flexForm[key]);
      }
    });

    try {
      const res = await battleApi.adminUpdateSettings({
        battle_flex: cleanedFlex,
      });
      if (res) applyServerSettings(res);
      showToast('Đã lưu bộ tham số ghép trận linh hoạt (battle_flex).');
    } catch (err) {
      handleApiValidationError(err, 'Tham số battle_flex có giá trị chưa hợp lệ.');
    } finally {
      setSavingSection('');
    }
  };

  const handleRestoreDefaultFlexGroup = (group) => {
    setFlexForm((prev) => {
      const next = { ...prev };
      group.fields.forEach((f) => {
        next[f.key] = DEFAULT_BATTLE_FLEX[f.key];
      });
      return next;
    });
  };

  const handleSaveRankSettings = async (e) => {
    e.preventDefault();
    setSavingSection('rank');
    setGlobalError('');
    setFieldErrors({});

    const parseNumArray = (raw) =>
      String(raw || '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => !Number.isNaN(n));

    const parseStrArray = (raw) =>
      String(raw || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    const cleanedRank = {
      season: String(rankForm.season || '2026-HK1').trim(),
      base_mmr: Number(rankForm.base_mmr),
      reset_factor: Number(rankForm.reset_factor),
      lp_reset_factor: Number(rankForm.lp_reset_factor),
      mmr_window: Number(rankForm.mmr_window),
      mmr_window_ms: Number(rankForm.mmr_window_ms),
      mmr_k: Number(rankForm.mmr_k),
      mmr_scale: Number(rankForm.mmr_scale),

      duel_win: Number(rankForm.duel_win),
      duel_loss: Number(rankForm.duel_loss),
      underdog_gap: Number(rankForm.underdog_gap),
      underdog_win: Number(rankForm.underdog_win),
      underdog_loss: Number(rankForm.underdog_loss),
      tie: Number(rankForm.tie),
      lp_three: parseNumArray(rankForm.lp_three),
      lp_four: parseNumArray(rankForm.lp_four),
      chapter_factor: Number(rankForm.chapter_factor),
      subject_factor: Number(rankForm.subject_factor),
      multi_subject_factor: Number(rankForm.multi_subject_factor),

      bot_wait_ms: Number(rankForm.bot_wait_ms),
      bot_win_cap: Number(rankForm.bot_win_cap),
      bot_loss: Number(rankForm.bot_loss),
      bot_daily: Number(rankForm.bot_daily),

      pair_daily: Number(rankForm.pair_daily),
      streak_wins: Number(rankForm.streak_wins),
      streak_factor: Number(rankForm.streak_factor),
      abnormal_ms: Number(rankForm.abnormal_ms),
      abnormal_factor: Number(rankForm.abnormal_factor),
      shield_daily: Number(rankForm.shield_daily),

      max_players: Number(rankForm.max_players),
      division_lp: Number(rankForm.division_lp),
      divisions: Number(rankForm.divisions),
      placement_games: Number(rankForm.placement_games),
      placement_bonus: Number(rankForm.placement_bonus),
      visible_tier: Number(rankForm.visible_tier),
      narrow_ratio: Number(rankForm.narrow_ratio),
      ranked_lengths: parseNumArray(rankForm.ranked_lengths),
      self_created: Boolean(rankForm.self_created),
      tiers: parseStrArray(rankForm.tiers),
    };

    try {
      const res = await battleApi.adminUpdateSettings({
        battle_rank: cleanedRank,
      });
      if (res) applyServerSettings(res);
      showToast('Đã lưu cấu hình Xếp hạng học thuật (battle_rank).');
    } catch (err) {
      handleApiValidationError(err, 'Tham số battle_rank có trường chưa hợp lệ.');
    } finally {
      setSavingSection('');
    }
  };

  const handleRestoreDefaultRankGroup = (group) => {
    setRankForm((prev) => {
      const next = { ...prev };
      group.fields.forEach((f) => {
        const defVal = DEFAULT_BATTLE_RANK[f.key];
        next[f.key] = Array.isArray(defVal) ? defVal.join(', ') : defVal;
      });
      return next;
    });
  };

  const handleSaveLimits = async (e) => {
    e.preventDefault();
    if (!limitsForm) return;
    setSavingSection('limits');
    setGlobalError('');
    setFieldErrors({});
    try {
      const payloadLimits = {};
      Object.entries(limitsForm).forEach(([k, v]) => {
        payloadLimits[k] = Number(v);
      });
      const res = await battleApi.adminUpdateSettings({
        battle_limits: payloadLimits,
      });
      if (res) applyServerSettings(res);
      showToast('Đã lưu trần giới hạn tài nguyên (battle_limits).');
    } catch (err) {
      handleApiValidationError(err, 'Không lưu được giới hạn battle_limits.');
    } finally {
      setSavingSection('');
    }
  };

  // ===== 3. XỬ LÝ KHUNG GIỜ VÀNG & PHÂN QUYỀN GIÁO VIÊN =====
  const toggleWeekday = (dayNum) => {
    setGhWeekdays((prev) =>
      prev.includes(dayNum)
        ? prev.filter((d) => d !== dayNum)
        : [...prev, dayNum].sort((a, b) => a - b)
    );
  };

  const resetGoldenForm = () => {
    setEditingGoldenId(null);
    setGhGrade(9);
    setGhSubjectId('1');
    setGhStartsAt('2026-10-20T20:00');
    setGhMinutes(15);
    setGhRepeatMode('weekly');
    setGhWeekdays([2, 4]);
    setGhActive(true);
  };

  const handleStartEditGolden = (gh) => {
    setEditingGoldenId(gh.id);
    setGhGrade(Number(gh.grade) || 9);
    setGhSubjectId(gh.subject_id !== null && gh.subject_id !== undefined ? String(gh.subject_id) : '');
    setGhStartsAt(toDatetimeLocalValue(gh.starts_at));
    setGhMinutes(Number(gh.minutes) || 15);
    if (Array.isArray(gh.repeat_weekdays) && gh.repeat_weekdays.length > 0) {
      setGhRepeatMode('weekly');
      setGhWeekdays(gh.repeat_weekdays.map(Number));
    } else {
      setGhRepeatMode('once');
      setGhWeekdays([]);
    }
    setGhActive(Boolean(gh.active));
  };

  const handleSubmitGoldenHour = async (e) => {
    e.preventDefault();
    if (busyGolden) return;

    const payload = {
      grade: Number(ghGrade),
      subject_id: ghSubjectId === '' ? null : Number(ghSubjectId),
      starts_at: toIsoWithVnOffset(ghStartsAt),
      minutes: Math.min(60, Math.max(10, Number(ghMinutes) || 15)),
      repeat_weekdays:
        ghRepeatMode === 'weekly' && ghWeekdays.length > 0 ? ghWeekdays : null,
      active: Boolean(ghActive),
    };

    setBusyGolden(true);
    setGlobalError('');
    try {
      if (editingGoldenId !== null) {
        await battleApiFlex.updateGoldenHour(editingGoldenId, payload);
        showToast('Đã cập nhật khung Giờ vàng.');
      } else {
        await battleApiFlex.createGoldenHour(payload);
        showToast('Đã tạo khung Giờ vàng mới.');
      }
      const updated = await battleApiFlex.getGoldenHours();
      setGoldenList(Array.isArray(updated) ? updated : updated?.items || []);
      resetGoldenForm();
    } catch (err) {
      handleApiValidationError(err, 'Không lưu được khung Giờ vàng.');
    } finally {
      setBusyGolden(false);
    }
  };

  const handleDeleteGoldenHour = async (id) => {
    if (!id || busyGolden) return;
    setBusyGolden(true);
    setGlobalError('');
    try {
      await battleApiFlex.deleteGoldenHour(id);
      setGoldenList((prev) => prev.filter((item) => item.id !== id));
      if (editingGoldenId === id) resetGoldenForm();
      showToast('Đã xoá khung Giờ vàng.');
    } catch (err) {
      setGlobalError(err?.message || 'Không xoá được khung Giờ vàng.');
    } finally {
      setBusyGolden(false);
    }
  };

  const handleGrantGoldenHourSubmit = async (e) => {
    e.preventDefault();
    if (!grantUserId || busyGrant) return;
    setBusyGrant(true);
    setGlobalError('');
    try {
      await battleApiFlex.adminSetGoldenHourGrant({
        user_id: Number(grantUserId),
        grade: Number(grantGrade),
        subject_id: grantSubjectId === '' ? null : Number(grantSubjectId),
        enabled: Boolean(grantEnabled),
      });
      showToast(
        grantEnabled
          ? `Đã cấp quyền quản lý Giờ vàng cho giáo viên #${grantUserId}.`
          : `Đã gỡ quyền quản lý Giờ vàng của giáo viên #${grantUserId}.`
      );
      setGrantUserId('');
    } catch (err) {
      setGlobalError(err?.message || 'Không cập nhật được quyền Giờ vàng.');
    } finally {
      setBusyGrant(false);
    }
  };

  // ===== 4. XỬ LÝ HÀNG ĐỢI BÁO CÁO & XEM BẰNG CHỨNG =====
  const handleFilterReports = async (statusVal) => {
    setReportFilterStatus(statusVal);
    try {
      const res = await battleApi.adminGetReports(
        statusVal ? { status: statusVal } : {}
      );
      setReports(Array.isArray(res) ? res : res?.items || []);
    } catch (err) {
      setGlobalError(err?.message || 'Không lọc được danh sách báo cáo.');
    }
  };

  const handleUpdateReportStatus = async (reportId, nextStatus) => {
    if (!reportId || busyReportId) return;
    setBusyReportId(reportId);
    setGlobalError('');
    try {
      await battleApi.adminUpdateReportStatus(reportId, nextStatus);
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status: nextStatus } : r))
      );
      if (selectedReportDetail?.id === reportId) {
        setSelectedReportDetail((prev) =>
          prev ? { ...prev, status: nextStatus } : null
        );
      }
      showToast('Đã cập nhật trạng thái báo cáo.');
    } catch (err) {
      setGlobalError(err?.message || 'Không đổi được trạng thái báo cáo.');
    } finally {
      setBusyReportId(null);
    }
  };

  const handleOpenReportDetail = async (reportId) => {
    if (!reportId) return;
    setLoadingReportDetail(true);
    setGlobalError('');
    try {
      const detail = await battleApi.adminGetReportDetail(reportId);
      setSelectedReportDetail(detail);
    } catch (err) {
      setGlobalError(err?.message || 'Không tải được chi tiết bằng chứng báo cáo.');
    } finally {
      setLoadingReportDetail(false);
    }
  };

  // ===== 5. XỬ LÝ TẠM KHOÁ HỌC SINH =====
  const handleCreateSuspension = async (e) => {
    e.preventDefault();
    if (!suspUserId || !suspReason.trim() || busySuspend) return;
    setBusySuspend(true);
    setGlobalError('');
    try {
      await battleApi.adminCreateSuspension({
        user_id: Number(suspUserId),
        days: Number(suspDays),
        reason: suspReason.trim(),
      });
      const updated = await battleApi.adminGetSuspensions();
      setSuspensions(Array.isArray(updated) ? updated : updated?.items || []);
      setSuspUserId('');
      setSuspReason('');
      showToast('Đã áp dụng lệnh tạm khoá tính năng Đấu.');
    } catch (err) {
      handleApiValidationError(err, 'Không thể tạo lệnh tạm khoá.');
    } finally {
      setBusySuspend(false);
    }
  };

  // Chặn người dùng không phải Admin
  if (!isAdmin) {
    return (
      <div className="arena-page">
        <div className="arena-container">
          <div className="arena-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <h1 className="arena-title-lg">Khu vực dành riêng cho Quản trị viên</h1>
            <p className="arena-subtitle" style={{ marginBottom: '20px' }}>
              Tài khoản của bạn không có quyền truy cập trang cấu hình hệ thống Đấu Trường.
            </p>
            <Link to="/practice/battle" className="arena-btn arena-btn--primary">
              Về sảnh Đấu
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="arena-page">
      <div className="arena-container arena-admin-container">
        {/* Header Quản trị */}
        <header className="arena-card arena-card--dark" style={{ marginBottom: '18px' }}>
          <div className="arena-finish-strip" style={{ marginBottom: '14px' }} aria-hidden="true" />
          <div className="arena-row arena-row--between">
            <div>
              <div className="arena-row" style={{ gap: '8px', marginBottom: '6px' }}>
                <span className="arena-chip arena-chip--amber">QUẢN TRỊ HỆ THỐNG ĐẤU V6.9.2</span>
                <span
                  className={`arena-chip ${
                    emergencyStop
                      ? 'arena-chip--danger'
                      : battleEnabled
                      ? 'arena-chip--live'
                      : ''
                  }`}
                >
                  {emergencyStop
                    ? '🚨 ĐANG DỪNG KHẨN CẤP'
                    : battleEnabled
                    ? '● Đang mở nhận ván mới'
                    : '⏸ Ngừng nhận ván mới'}
                </span>
              </div>
              <h1 className="arena-title-lg" style={{ color: '#FFFFFF' }}>
                Bảng điều khiển Đấu Trường KHTN
              </h1>
              <p className="arena-subtitle">
                Quản lý công tắc tính năng, tham số ghép linh hoạt, bậc học thuật, Giờ vàng và an toàn học đường.
              </p>
            </div>

            <div className="arena-row" style={{ gap: '10px' }}>
              <button
                type="button"
                className="arena-btn arena-btn--ghost-light arena-btn--sm"
                onClick={loadAllAdminData}
                disabled={loading}
              >
                ↻ Làm mới dữ liệu
              </button>
              <Link
                to="/practice/battle"
                className="arena-btn arena-btn--amber arena-btn--sm"
              >
                Mở Sảnh Đấu →
              </Link>
            </div>
          </div>

          {/* Thanh chuyển khu vực quản trị */}
          <nav className="arena-admin-tabs" aria-label="Các phân khu quản trị">
            {[
              { id: 'switches', label: '1. Trạng thái & Công tắc' },
              { id: 'params', label: '2. Tham số Ghép & Xếp hạng' },
              { id: 'golden', label: `3. Giờ vàng (${goldenList.length})` },
              {
                id: 'moderation',
                label: `4. Báo cáo (${reports.length}) & Tạm khoá (${suspensions.length})`,
              },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                className={`arena-admin-tab ${
                  activeTab === t.id ? 'arena-admin-tab--active' : ''
                }`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        {globalError && (
          <div className="arena-alert arena-alert--error" role="alert">
            <span>⚠️ {globalError}</span>
            <button
              type="button"
              className="arena-btn arena-btn--sm arena-btn--secondary"
              onClick={() => setGlobalError('')}
            >
              Đóng
            </button>
          </div>
        )}

        {globalSuccess && (
          <div className="arena-alert arena-alert--ok" role="status" aria-live="polite">
            <span>✓ {globalSuccess}</span>
          </div>
        )}

        {loading ? (
          <div className="arena-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div
              className="arena-spinner arena-spinner--dark"
              style={{ width: '28px', height: '28px', margin: '0 auto 12px' }}
            />
            <p className="arena-title-md">Đang tải cấu hình hệ thống Đấu…</p>
          </div>
        ) : (
          <>
            {/* ===== KHỐI 1: TRẠNG THÁI HỆ THỐNG & CÁC CỜ KHẢ NĂNG (battle_modes) ===== */}
            {activeTab === 'switches' && (
              <div className="arena-admin-section-stack">
                <div className="arena-grid-2">
                  {/* Công tắc nhận ván mới battle_enabled */}
                  <section className="arena-card">
                    <div className="arena-row arena-row--between">
                      <div>
                        <span className="arena-chip arena-chip--accent arena-mono">
                          battle_enabled
                        </span>
                        <h2 className="arena-title-md" style={{ marginTop: '6px' }}>
                          {battleEnabled ? 'Đang cho phép chơi' : 'Đang ngừng nhận ván mới'}
                        </h2>
                      </div>
                      <button
                        type="button"
                        className={`arena-btn ${
                          battleEnabled ? 'arena-btn--secondary' : 'arena-btn--amber'
                        }`}
                        onClick={handleToggleBattleEnabled}
                        disabled={savingSection === 'enabled'}
                      >
                        {battleEnabled ? 'Tạm ngừng nhận ván mới' : 'Bật Cho chơi'}
                      </button>
                    </div>
                    <p className="arena-subtitle" style={{ marginTop: '10px' }}>
                      Khi tắt: học sinh và giáo viên không tạo/vào/bắt đầu ván mới, nhưng các ván đang diễn ra vẫn được chơi nốt tới khi kết thúc.
                    </p>
                  </section>

                  {/* Công tắc Dừng khẩn cấp battle_emergency_stop */}
                  <section
                    className="arena-card"
                    style={{
                      borderColor: emergencyStop
                        ? 'var(--danger, #A5281B)'
                        : 'var(--line, #E2DFD6)',
                      backgroundColor: emergencyStop ? '#FDECEB' : undefined,
                    }}
                  >
                    <div className="arena-row arena-row--between">
                      <div>
                        <span className="arena-chip arena-chip--danger arena-mono">
                          battle_emergency_stop
                        </span>
                        <h2 className="arena-title-md" style={{ marginTop: '6px' }}>
                          {emergencyStop
                            ? '🚨 ĐANG DỪNG KHẨN CẤP'
                            : 'Chế độ Dừng khẩn cấp (Đang tắt)'}
                        </h2>
                      </div>
                      <button
                        type="button"
                        className={`arena-btn ${
                          emergencyStop ? 'arena-btn--primary' : 'arena-btn--danger'
                        }`}
                        onClick={() => setConfirmEmergencyModal(!emergencyStop)}
                        disabled={savingSection === 'emergency'}
                      >
                        {emergencyStop ? 'Gỡ dừng khẩn cấp' : '🚨 Dừng khẩn cấp'}
                      </button>
                    </div>
                    <p className="arena-subtitle" style={{ marginTop: '10px' }}>
                      Dùng khi cần ngắt toàn bộ Đấu Trường ngay lập tức: chặn mọi thao tác chơi, kết thúc gián đoạn mọi ván đang chạy và đóng toàn bộ luồng SSE.
                    </p>
                  </section>
                </div>

                {/* Danh sách 11 cờ khả năng battle_modes */}
                <section className="arena-card">
                  <div className="arena-row arena-row--between" style={{ marginBottom: '14px' }}>
                    <div>
                      <h2 className="arena-title-md">
                        Các khả năng & Chế độ thi đấu (<span className="arena-mono">battle_modes</span>)
                      </h2>
                      <p className="arena-subtitle">
                        Bật/tắt độc lập từng tính năng. Lưu ý: Phòng lớp và thẻ ghim của lớp hoạt động độc lập, không phụ thuộc cờ <code className="arena-mono">lobby</code>.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="arena-btn arena-btn--amber"
                      onClick={handleSaveBattleModes}
                      disabled={savingSection === 'modes'}
                    >
                      {savingSection === 'modes' ? 'Đang lưu…' : '💾 Lưu các cờ khả năng'}
                    </button>
                  </div>

                  <div className="arena-admin-modes-grid">
                    {BATTLE_MODE_ITEMS.map((item) => {
                      const isOn = Boolean(battleModes[item.key]);
                      return (
                        <label
                          key={item.key}
                          className={`arena-admin-mode-card ${
                            isOn ? 'arena-admin-mode-card--on' : ''
                          }`}
                        >
                          <div className="arena-row arena-row--between">
                            <span className="arena-chip arena-mono">{item.key}</span>
                            <input
                              type="checkbox"
                              checked={isOn}
                              onChange={() => handleToggleModeFlag(item.key)}
                            />
                          </div>
                          <div className="arena-admin-mode-card__title">{item.title}</div>
                          <div className="arena-admin-mode-card__desc">{item.desc}</div>
                        </label>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}

            {/* ===== KHỐI 2: THAM SỐ GHÉP TRẬN (battle_flex) & XẾP HẠNG (battle_rank) ===== */}
            {activeTab === 'params' && (
              <div className="arena-admin-section-stack">
                {/* Biểu mẫu battle_flex */}
                <form className="arena-card" onSubmit={handleSaveFlexSettings}>
                  <div className="arena-row arena-row--between" style={{ marginBottom: '16px' }}>
                    <div>
                      <h2 className="arena-title-md">
                        Tham số Ghép trận linh hoạt & Đối thủ máy (<span className="arena-mono">battle_flex</span>)
                      </h2>
                      <p className="arena-subtitle">
                        Đơn vị các khoá <code className="arena-mono">_ms</code> là mili-giây (1000 ms = 1 giây).
                      </p>
                    </div>
                    <button
                      type="submit"
                      className="arena-btn arena-btn--amber"
                      disabled={savingSection === 'flex'}
                    >
                      {savingSection === 'flex'
                        ? 'Đang lưu…'
                        : '💾 Lưu toàn bộ battle_flex'}
                    </button>
                  </div>

                  <div className="arena-admin-param-groups">
                    {FLEX_FIELD_GROUPS.map((grp) => (
                      <div key={grp.id} className="arena-admin-param-box">
                        <div className="arena-row arena-row--between" style={{ marginBottom: '12px' }}>
                          <h3 className="arena-title-md">{grp.title}</h3>
                          <button
                            type="button"
                            className="arena-btn arena-btn--secondary arena-btn--sm"
                            onClick={() => handleRestoreDefaultFlexGroup(grp)}
                          >
                            ↺ Khôi phục mặc định nhóm này
                          </button>
                        </div>

                        <div className="arena-admin-fields-grid">
                          {grp.fields.map((f) => {
                            const errText =
                              fieldErrors[f.key] ||
                              fieldErrors[`battle_flex.${f.key}`];
                            return (
                              <div key={f.key} className="arena-admin-field">
                                <label
                                  htmlFor={`flex-${f.key}`}
                                  className="arena-field-label"
                                >
                                  {f.label}{' '}
                                  <span className="arena-admin-key-hint arena-mono">
                                    ({f.key})
                                  </span>
                                </label>
                                {f.type === 'select' ? (
                                  <select
                                    id={`flex-${f.key}`}
                                    className="arena-select"
                                    value={flexForm[f.key] ?? ''}
                                    onChange={(e) =>
                                      setFlexForm((prev) => ({
                                        ...prev,
                                        [f.key]: e.target.value,
                                      }))
                                    }
                                  >
                                    {f.options.map((o) => (
                                      <option key={o.value} value={o.value}>
                                        {o.label}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    id={`flex-${f.key}`}
                                    type="number"
                                    step={f.step || '1'}
                                    className="arena-input arena-mono"
                                    value={flexForm[f.key] ?? ''}
                                    onChange={(e) =>
                                      setFlexForm((prev) => ({
                                        ...prev,
                                        [f.key]: e.target.value,
                                      }))
                                    }
                                  />
                                )}
                                {errText && (
                                  <span className="arena-field-error">{errText}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </form>

                {/* Biểu mẫu battle_rank */}
                <form className="arena-card" onSubmit={handleSaveRankSettings}>
                  <div className="arena-row arena-row--between" style={{ marginBottom: '16px' }}>
                    <div>
                      <h2 className="arena-title-md">
                        Tham số Xếp hạng học thuật (<span className="arena-mono">battle_rank</span>)
                      </h2>
                      <p className="arena-subtitle">
                        Cấu hình mùa giải, cửa sổ MMR, điểm LP, chống cày điểm và 6 bậc học thuật.
                      </p>
                    </div>
                    <button
                      type="submit"
                      className="arena-btn arena-btn--amber"
                      disabled={savingSection === 'rank'}
                    >
                      {savingSection === 'rank'
                        ? 'Đang lưu…'
                        : '💾 Lưu toàn bộ battle_rank'}
                    </button>
                  </div>

                  <div className="arena-admin-param-groups">
                    {RANK_FIELD_GROUPS.map((grp) => (
                      <div key={grp.id} className="arena-admin-param-box">
                        <div className="arena-row arena-row--between" style={{ marginBottom: '12px' }}>
                          <h3 className="arena-title-md">{grp.title}</h3>
                          <button
                            type="button"
                            className="arena-btn arena-btn--secondary arena-btn--sm"
                            onClick={() => handleRestoreDefaultRankGroup(grp)}
                          >
                            ↺ Khôi phục mặc định nhóm này
                          </button>
                        </div>

                        <div className="arena-admin-fields-grid">
                          {grp.fields.map((f) => {
                            const errText =
                              fieldErrors[f.key] ||
                              fieldErrors[`battle_rank.${f.key}`];

                            if (f.type === 'boolean') {
                              return (
                                <div key={f.key} className="arena-admin-field">
                                  <label className="arena-filter-checkbox" style={{ width: '100%', marginTop: '22px' }}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(rankForm[f.key])}
                                      onChange={(e) =>
                                        setRankForm((prev) => ({
                                          ...prev,
                                          [f.key]: e.target.checked,
                                        }))
                                      }
                                    />
                                    <span>
                                      {f.label}{' '}
                                      <small className="arena-mono">({f.key})</small>
                                    </span>
                                  </label>
                                  {errText && (
                                    <span className="arena-field-error">{errText}</span>
                                  )}
                                </div>
                              );
                            }

                            return (
                              <div key={f.key} className="arena-admin-field">
                                <label
                                  htmlFor={`rank-${f.key}`}
                                  className="arena-field-label"
                                >
                                  {f.label}{' '}
                                  <span className="arena-admin-key-hint arena-mono">
                                    ({f.key})
                                  </span>
                                </label>
                                <input
                                  id={`rank-${f.key}`}
                                  type={f.type === 'number' ? 'number' : 'text'}
                                  step={f.step || '1'}
                                  className="arena-input arena-mono"
                                  value={rankForm[f.key] ?? ''}
                                  onChange={(e) =>
                                    setRankForm((prev) => ({
                                      ...prev,
                                      [f.key]: e.target.value,
                                    }))
                                  }
                                />
                                {errText && (
                                  <span className="arena-field-error">{errText}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </form>

                {/* Biểu mẫu battle_limits (Nếu máy chủ trả về) */}
                {limitsForm && (
                  <form className="arena-card" onSubmit={handleSaveLimits}>
                    <div className="arena-row arena-row--between" style={{ marginBottom: '12px' }}>
                      <div>
                        <h3 className="arena-title-md">
                          Trần tài nguyên hệ thống (<span className="arena-mono">battle_limits</span>)
                        </h3>
                        <p className="arena-subtitle">
                          Cho phép hạ trần từ mặc định, không nâng vượt mức đã nghiệm thu tải.
                        </p>
                      </div>
                      <button
                        type="submit"
                        className="arena-btn arena-btn--primary arena-btn--sm"
                        disabled={savingSection === 'limits'}
                      >
                        Lưu battle_limits
                      </button>
                    </div>
                    <div className="arena-admin-fields-grid">
                      {Object.keys(limitsForm).map((lKey) => (
                        <div key={lKey} className="arena-admin-field">
                          <label htmlFor={`limit-${lKey}`} className="arena-field-label arena-mono">
                            {lKey}
                          </label>
                          <input
                            id={`limit-${lKey}`}
                            type="number"
                            className="arena-input arena-mono"
                            value={limitsForm[lKey] ?? ''}
                            onChange={(e) =>
                              setLimitsForm((prev) => ({
                                ...prev,
                                [lKey]: e.target.value,
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* ===== KHỐI 3: QUẢN LÝ GIỜ VÀNG & PHÂN QUYỀN GIÁO VIÊN ===== */}
            {activeTab === 'golden' && (
              <div className="arena-admin-section-stack">
                <div className="arena-grid-2">
                  {/* Biểu mẫu Tạo / Sửa khung Giờ vàng */}
                  <form className="arena-card" onSubmit={handleSubmitGoldenHour}>
                    <div className="arena-row arena-row--between" style={{ marginBottom: '12px' }}>
                      <h2 className="arena-title-md">
                        {editingGoldenId !== null
                          ? `Chỉnh sửa khung Giờ vàng #${editingGoldenId}`
                          : '+ Tạo khung Giờ vàng mới'}
                      </h2>
                      {editingGoldenId !== null && (
                        <button
                          type="button"
                          className="arena-btn arena-btn--secondary arena-btn--sm"
                          onClick={resetGoldenForm}
                        >
                          Huỷ sửa
                        </button>
                      )}
                    </div>

                    <div className="arena-grid-2">
                      <div>
                        <label htmlFor="gh-grade" className="arena-field-label">
                          Khối lớp
                        </label>
                        <select
                          id="gh-grade"
                          className="arena-select"
                          value={ghGrade}
                          onChange={(e) => setGhGrade(Number(e.target.value))}
                        >
                          {[6, 7, 8, 9, 10, 11, 12].map((g) => (
                            <option key={g} value={g}>
                              Khối {g}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="gh-subject" className="arena-field-label">
                          Mã môn (subject_id, để trống = toàn khối)
                        </label>
                        <input
                          id="gh-subject"
                          type="number"
                          className="arena-input arena-mono"
                          placeholder="VD: 1 (KHTN)"
                          value={ghSubjectId}
                          onChange={(e) => setGhSubjectId(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="arena-grid-2" style={{ marginTop: '12px' }}>
                      <div>
                        <label htmlFor="gh-starts" className="arena-field-label">
                          Thời điểm bắt đầu (UTC+7)
                        </label>
                        <input
                          id="gh-starts"
                          type="datetime-local"
                          className="arena-input arena-mono"
                          value={ghStartsAt}
                          onChange={(e) => setGhStartsAt(e.target.value)}
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="gh-minutes" className="arena-field-label">
                          Thời lượng (10 – 60 phút)
                        </label>
                        <input
                          id="gh-minutes"
                          type="number"
                          min={10}
                          max={60}
                          className="arena-input arena-mono"
                          value={ghMinutes}
                          onChange={(e) => setGhMinutes(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: '12px' }}>
                      <span className="arena-field-label">Chế độ lặp</span>
                      <div className="arena-row" style={{ gap: '8px', marginBottom: '10px' }}>
                        <button
                          type="button"
                          className={`arena-btn arena-btn--sm ${
                            ghRepeatMode === 'weekly'
                              ? 'arena-btn--primary'
                              : 'arena-btn--secondary'
                          }`}
                          onClick={() => setGhRepeatMode('weekly')}
                        >
                          Lặp hàng tuần
                        </button>
                        <button
                          type="button"
                          className={`arena-btn arena-btn--sm ${
                            ghRepeatMode === 'once'
                              ? 'arena-btn--primary'
                              : 'arena-btn--secondary'
                          }`}
                          onClick={() => setGhRepeatMode('once')}
                        >
                          Chỉ diễn ra 1 lần
                        </button>
                      </div>

                      {ghRepeatMode === 'weekly' && (
                        <div className="arena-row" style={{ gap: '6px' }}>
                          {WEEKDAYS_VN.map((w) => {
                            const active = ghWeekdays.includes(w.day);
                            return (
                              <button
                                key={w.day}
                                type="button"
                                aria-pressed={active}
                                className={`arena-btn arena-btn--sm arena-mono ${
                                  active
                                    ? 'arena-btn--amber'
                                    : 'arena-btn--secondary'
                                }`}
                                onClick={() => toggleWeekday(w.day)}
                              >
                                {w.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="arena-row arena-row--between" style={{ marginTop: '16px' }}>
                      <label className="arena-filter-checkbox">
                        <input
                          type="checkbox"
                          checked={ghActive}
                          onChange={(e) => setGhActive(e.target.checked)}
                        />
                        <span>Đang kích hoạt</span>
                      </label>

                      <button
                        type="submit"
                        className="arena-btn arena-btn--amber"
                        disabled={busyGolden}
                      >
                        {busyGolden
                          ? 'Đang lưu…'
                          : editingGoldenId !== null
                          ? 'Lưu thay đổi'
                          : 'Tạo khung Giờ vàng'}
                      </button>
                    </div>
                  </form>

                  {/* Phân quyền Giáo viên quản lý Giờ vàng */}
                  <form className="arena-card" onSubmit={handleGrantGoldenHourSubmit}>
                    <h2 className="arena-title-md" style={{ marginBottom: '6px' }}>
                      Phân quyền Giáo viên quản lý Giờ vàng
                    </h2>
                    <p className="arena-subtitle" style={{ marginBottom: '14px' }}>
                      Để trống Mã môn nếu muốn cấp/gỡ quyền toàn bộ các môn trong khối đó.
                    </p>

                    <div className="arena-grid-2">
                      <div>
                        <label htmlFor="grant-user-id" className="arena-field-label">
                          ID Giáo viên (user_id)
                        </label>
                        <input
                          id="grant-user-id"
                          type="number"
                          className="arena-input arena-mono"
                          placeholder="VD: 45"
                          value={grantUserId}
                          onChange={(e) => setGrantUserId(e.target.value)}
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="grant-grade" className="arena-field-label">
                          Khối lớp
                        </label>
                        <select
                          id="grant-grade"
                          className="arena-select"
                          value={grantGrade}
                          onChange={(e) => setGrantGrade(Number(e.target.value))}
                        >
                          {[6, 7, 8, 9, 10, 11, 12].map((g) => (
                            <option key={g} value={g}>
                              Khối {g}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="arena-grid-2" style={{ marginTop: '12px' }}>
                      <div>
                        <label htmlFor="grant-subject" className="arena-field-label">
                          Mã môn (subject_id, tuỳ chọn)
                        </label>
                        <input
                          id="grant-subject"
                          type="number"
                          className="arena-input arena-mono"
                          placeholder="Trống = Toàn khối"
                          value={grantSubjectId}
                          onChange={(e) => setGrantSubjectId(e.target.value)}
                        />
                      </div>

                      <div>
                        <label htmlFor="grant-action" className="arena-field-label">
                          Thao tác quyền
                        </label>
                        <select
                          id="grant-action"
                          className="arena-select"
                          value={grantEnabled ? 'true' : 'false'}
                          onChange={(e) => setGrantEnabled(e.target.value === 'true')}
                        >
                          <option value="true">Cấp quyền quản lý</option>
                          <option value="false">Gỡ quyền quản lý</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ marginTop: '16px', textAlign: 'right' }}>
                      <button
                        type="submit"
                        className="arena-btn arena-btn--primary"
                        disabled={busyGrant || !grantUserId}
                      >
                        {busyGrant ? 'Đang cập nhật…' : 'Cập nhật quyền Giáo viên'}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Danh sách khung Giờ vàng hiện có */}
                <section className="arena-card">
                  <h2 className="arena-title-md" style={{ marginBottom: '12px' }}>
                    Danh sách khung Giờ vàng ({goldenList.length})
                  </h2>

                  {goldenList.length === 0 ? (
                    <p className="arena-empty-hint">Chưa có khung Giờ vàng nào được tạo.</p>
                  ) : (
                    <div className="arena-history-list">
                      {goldenList.map((gh) => {
                        const repeatText =
                          Array.isArray(gh.repeat_weekdays) &&
                          gh.repeat_weekdays.length > 0
                            ? `Lặp: ${gh.repeat_weekdays
                                .map(
                                  (d) =>
                                    WEEKDAYS_VN.find((w) => w.day === Number(d))
                                      ?.label || d
                                )
                                .join(', ')}`
                            : 'Một lần';

                        return (
                          <div key={gh.id} className="arena-history-row">
                            <div>
                              <div className="arena-row" style={{ gap: '8px' }}>
                                <span
                                  className={`arena-chip ${
                                    gh.active ? 'arena-chip--live' : ''
                                  }`}
                                >
                                  {gh.active ? '● Đang bật' : 'Đã tắt'}
                                </span>
                                <strong>
                                  Khối {gh.grade} ·{' '}
                                  {gh.subject_id
                                    ? `Môn #${gh.subject_id}`
                                    : 'Toàn bộ môn'}
                                </strong>
                                <span className="arena-chip arena-chip--amber arena-mono">
                                  {gh.minutes} phút
                                </span>
                                <span className="arena-chip">{repeatText}</span>
                              </div>
                              <span className="arena-subtitle">
                                Bắt đầu: {formatDateTimeVN(gh.starts_at)}
                              </span>
                            </div>

                            <div className="arena-row" style={{ gap: '8px' }}>
                              <button
                                type="button"
                                className="arena-btn arena-btn--secondary arena-btn--sm"
                                onClick={() => handleStartEditGolden(gh)}
                              >
                                Sửa
                              </button>
                              <button
                                type="button"
                                className="arena-btn arena-btn--danger-outline arena-btn--sm"
                                onClick={() => handleDeleteGoldenHour(gh.id)}
                                disabled={busyGolden}
                              >
                                Xoá
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* ===== KHỐI 4 & 5: HÀNG ĐỢI BÁO CÁO & QUẢN LÝ TẠM KHOÁ ===== */}
            {activeTab === 'moderation' && (
              <div className="arena-admin-section-stack">
                {/* Hàng đợi báo cáo vi phạm */}
                <section className="arena-card">
                  <div className="arena-row arena-row--between" style={{ marginBottom: '14px' }}>
                    <div>
                      <h2 className="arena-title-md">
                        🚩 Hàng đợi Báo cáo vi phạm (Gộp theo học sinh trong 24h)
                      </h2>
                      <p className="arena-subtitle">
                        Xem bằng chứng ảnh chụp ván đấu và cập nhật trạng thái xử lý.
                      </p>
                    </div>

                    <div className="arena-row" style={{ gap: '8px' }}>
                      {[
                        { val: '', label: 'Tất cả' },
                        { val: 'reviewing', label: 'Đang xem' },
                        { val: 'resolved', label: 'Đã xử lý' },
                        { val: 'dismissed', label: 'Không vi phạm' },
                      ].map((f) => (
                        <button
                          key={f.val}
                          type="button"
                          className={`arena-btn arena-btn--sm ${
                            reportFilterStatus === f.val
                              ? 'arena-btn--primary'
                              : 'arena-btn--secondary'
                          }`}
                          onClick={() => handleFilterReports(f.val)}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {reports.length === 0 ? (
                    <p className="arena-empty-hint">
                      Không có báo cáo nào trong hàng đợi.
                    </p>
                  ) : (
                    <div className="arena-table-scroll">
                      <table className="arena-question-table">
                        <thead>
                          <tr>
                            <th>Mục tiêu bị báo cáo</th>
                            <th>Lý do & Mức độ</th>
                            <th>Số báo cáo gộp (24h)</th>
                            <th>Trạng thái</th>
                            <th>Hành động</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reports.map((rep) => {
                            const count = Number(rep.report_count ?? rep.count ?? 1);
                            const isHigh = count >= 3 || rep.severity === 'high';
                            return (
                              <tr key={rep.id}>
                                <td>
                                  <strong>
                                    {rep.target_name || `Học sinh #${rep.target_id}`}
                                  </strong>
                                  <div className="arena-subtitle">
                                    ID: <span className="arena-mono">{rep.target_id}</span>
                                    {rep.class_name ? ` · Lớp ${rep.class_name}` : ''}
                                  </div>
                                </td>
                                <td>
                                  <div className="arena-row" style={{ gap: '6px' }}>
                                    <span
                                      className={`arena-chip ${
                                        isHigh
                                          ? 'arena-chip--danger'
                                          : 'arena-chip--warn'
                                      }`}
                                    >
                                      {isHigh ? 'Mức cao' : 'Cần kiểm tra'}
                                    </span>
                                    <span>
                                      {REPORT_REASON_LABELS[rep.reason] ||
                                        rep.reason ||
                                        'Báo cáo'}
                                    </span>
                                  </div>
                                  {rep.note && (
                                    <div className="arena-subtitle" style={{ marginTop: '4px' }}>
                                      &ldquo;{rep.note}&rdquo;
                                    </div>
                                  )}
                                </td>
                                <td className="arena-mono">
                                  <strong>{count}</strong> lượt
                                </td>
                                <td>
                                  <span
                                    className={`arena-chip ${
                                      rep.status === 'resolved'
                                        ? 'arena-chip--live'
                                        : rep.status === 'dismissed'
                                        ? ''
                                        : 'arena-chip--amber'
                                    }`}
                                  >
                                    {rep.status === 'resolved'
                                      ? '✓ Đã xử lý'
                                      : rep.status === 'dismissed'
                                      ? 'Không vi phạm'
                                      : 'Đang xem'}
                                  </span>
                                </td>
                                <td>
                                  <div className="arena-row" style={{ gap: '6px' }}>
                                    <button
                                      type="button"
                                      className="arena-btn arena-btn--secondary arena-btn--sm"
                                      onClick={() => handleOpenReportDetail(rep.id)}
                                    >
                                      🔍 Chi tiết
                                    </button>
                                    <button
                                      type="button"
                                      className="arena-btn arena-btn--sm arena-btn--secondary"
                                      disabled={busyReportId === rep.id}
                                      onClick={() =>
                                        handleUpdateReportStatus(rep.id, 'reviewing')
                                      }
                                    >
                                      Đang xem
                                    </button>
                                    <button
                                      type="button"
                                      className="arena-btn arena-btn--sm arena-btn--primary"
                                      disabled={busyReportId === rep.id}
                                      onClick={() =>
                                        handleUpdateReportStatus(rep.id, 'resolved')
                                      }
                                    >
                                      Đã xử lý
                                    </button>
                                    <button
                                      type="button"
                                      className="arena-btn arena-btn--sm arena-btn--secondary"
                                      disabled={busyReportId === rep.id}
                                      onClick={() =>
                                        handleUpdateReportStatus(rep.id, 'dismissed')
                                      }
                                    >
                                      Không vi phạm
                                    </button>
                                    {rep.target_id && (
                                      <button
                                        type="button"
                                        className="arena-btn arena-btn--sm arena-btn--danger-outline"
                                        onClick={() => {
                                          setSuspUserId(String(rep.target_id));
                                          setSuspReason(
                                            `Xử lý báo cáo #${rep.id} (${
                                              REPORT_REASON_LABELS[rep.reason] ||
                                              rep.reason ||
                                              'Vi phạm quy tắc'
                                            })`
                                          );
                                        }}
                                      >
                                        Tạm khoá
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* Khu vực Tạm khoá học sinh (Tạo mới + Danh sách đang khoá) */}
                <div className="arena-grid-2">
                  <form className="arena-card" onSubmit={handleCreateSuspension}>
                    <h2 className="arena-title-md" style={{ marginBottom: '12px' }}>
                      🔒 Tạo lệnh Tạm khoá mới
                    </h2>

                    <div className="arena-grid-2">
                      <div>
                        <label htmlFor="susp-user-id" className="arena-field-label">
                          Mã học sinh (user_id)
                        </label>
                        <input
                          id="susp-user-id"
                          type="number"
                          className="arena-input arena-mono"
                          placeholder="Nhập user_id…"
                          value={suspUserId}
                          onChange={(e) => setSuspUserId(e.target.value)}
                          required
                        />
                      </div>

                      <div>
                        <span className="arena-field-label">Thời hạn tạm khoá</span>
                        <div className="arena-row" style={{ gap: '8px' }}>
                          {[1, 3, 7].map((d) => (
                            <button
                              key={d}
                              type="button"
                              className={`arena-btn arena-btn--sm arena-mono ${
                                Number(suspDays) === d
                                  ? 'arena-btn--danger'
                                  : 'arena-btn--secondary'
                              }`}
                              onClick={() => setSuspDays(d)}
                            >
                              {d} ngày
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: '12px' }}>
                      <label htmlFor="susp-reason" className="arena-field-label">
                        Lý do tạm khoá (bắt buộc, hiển thị cho học sinh)
                      </label>
                      <textarea
                        id="susp-reason"
                        className="arena-textarea"
                        rows={3}
                        placeholder="Nêu rõ lý do để học sinh rút kinh nghiệm…"
                        value={suspReason}
                        onChange={(e) => setSuspReason(e.target.value)}
                        required
                      />
                    </div>

                    <div style={{ marginTop: '14px', textAlign: 'right' }}>
                      <button
                        type="submit"
                        className="arena-btn arena-btn--danger"
                        disabled={busySuspend || !suspUserId || !suspReason.trim()}
                      >
                        {busySuspend ? 'Đang khoá…' : `Tạm khoá ${suspDays} ngày`}
                      </button>
                    </div>
                  </form>

                  <section className="arena-card">
                    <h2 className="arena-title-md" style={{ marginBottom: '12px' }}>
                      Danh sách đang tạm khoá ({suspensions.length})
                    </h2>
                    {suspensions.length === 0 ? (
                      <p className="arena-empty-hint">
                        Hiện không có học sinh nào bị tạm khoá.
                      </p>
                    ) : (
                      <div className="arena-history-list">
                        {suspensions.map((s, idx) => (
                          <div key={s.id || `${s.user_id}-${idx}`} className="arena-history-row">
                            <div>
                              <div className="arena-row" style={{ gap: '8px' }}>
                                <span className="arena-chip arena-chip--danger arena-mono">
                                  User #{s.user_id}
                                </span>
                                {s.user_name && <strong>{s.user_name}</strong>}
                                {s.days && (
                                  <span className="arena-chip arena-mono">
                                    {s.days} ngày
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.9rem', marginTop: '4px' }}>
                                Lý do: {s.reason}
                              </div>
                              <span className="arena-subtitle">
                                Hết hạn: {formatDateTimeVN(s.until || s.expires_at)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* HỘP XÁC NHẬN DỪNG KHẨN CẤP */}
      {confirmEmergencyModal !== null && (
        <div
          className="arena-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="arena-emergency-confirm-title"
        >
          <div className="arena-sheet" style={{ maxWidth: '480px' }}>
            <div className="arena-sheet__header">
              <h3 id="arena-emergency-confirm-title" className="arena-title-md">
                {confirmEmergencyModal
                  ? '🚨 Xác nhận KÍCH HOẠT Dừng khẩn cấp?'
                  : 'Xác nhận GỠ trạng thái Dừng khẩn cấp?'}
              </h3>
            </div>
            <div className="arena-sheet__body">
              {confirmEmergencyModal ? (
                <div className="arena-alert arena-alert--error" style={{ marginBottom: 0 }}>
                  <div>
                    <strong>Hậu quả khi kích hoạt Dừng khẩn cấp:</strong>
                    <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
                      <li>Kết thúc gián đoạn toàn bộ các ván đấu đang chạy (không trừ/cộng LP).</li>
                      <li>Đóng ngay lập tức mọi luồng SSE của học sinh và màn chiếu giáo viên.</li>
                      <li>Chặn tạo phòng, vào phòng và ghép trận mới trên toàn trường.</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0 }}>
                  Hệ thống sẽ cho phép kết nối lại bình thường theo cấu hình{' '}
                  <code className="arena-mono">battle_enabled</code> hiện tại.
                </p>
              )}
            </div>
            <div className="arena-sheet__footer">
              <button
                type="button"
                className="arena-btn arena-btn--secondary"
                onClick={() => setConfirmEmergencyModal(null)}
              >
                Huỷ
              </button>
              <button
                type="button"
                className={`arena-btn ${
                  confirmEmergencyModal ? 'arena-btn--danger' : 'arena-btn--amber'
                }`}
                onClick={handleConfirmEmergencyStop}
                disabled={savingSection === 'emergency'}
              >
                {confirmEmergencyModal
                  ? '🚨 Xác nhận Dừng khẩn cấp ngay'
                  : 'Xác nhận gỡ dừng khẩn cấp'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XEM CHI TIẾT BÁO CÁO & ẢNH CHỤP VÁN ĐẤU */}
      {(selectedReportDetail || loadingReportDetail) && (
        <div
          className="arena-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="arena-report-detail-title"
        >
          <div className="arena-sheet" style={{ maxWidth: '720px' }}>
            <div className="arena-sheet__header">
              <h3 id="arena-report-detail-title" className="arena-title-md">
                🔍 Chi tiết báo cáo & Bằng chứng ván đấu
              </h3>
              <button
                type="button"
                className="arena-btn arena-btn--secondary arena-btn--sm"
                onClick={() => setSelectedReportDetail(null)}
              >
                Đóng
              </button>
            </div>

            <div className="arena-sheet__body">
              {loadingReportDetail ? (
                <p className="arena-empty-hint">Đang tải ảnh chụp ván đấu…</p>
              ) : (
                selectedReportDetail && (
                  <div className="arena-admin-section-stack">
                    <div className="arena-card arena-card--subtle">
                      <div className="arena-row arena-row--between">
                        <strong>
                          Báo cáo #{selectedReportDetail.id} · Học sinh bị báo cáo:{' '}
                          {selectedReportDetail.target_name ||
                            `#${selectedReportDetail.target_id}`}
                        </strong>
                        <span className="arena-chip arena-mono">
                          Phòng: {selectedReportDetail.room_id || '—'}
                        </span>
                      </div>
                      <p style={{ margin: '8px 0 0', fontSize: '0.92rem' }}>
                        Lý do:{' '}
                        <strong>
                          {REPORT_REASON_LABELS[selectedReportDetail.reason] ||
                            selectedReportDetail.reason}
                        </strong>{' '}
                        · Ghi chú: {selectedReportDetail.note || 'Không có ghi chú'}
                      </p>
                    </div>

                    {Array.isArray(selectedReportDetail.evidence || selectedReportDetail.events) && (
                      <div>
                        <h4 className="arena-field-label">
                          Nhật ký sự kiện an toàn & Bằng chứng
                        </h4>
                        <pre className="arena-admin-json-view arena-mono">
                          {JSON.stringify(
                            selectedReportDetail.evidence ||
                              selectedReportDetail.events,
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    )}

                    {selectedReportDetail.snapshot && (
                      <div>
                        <h4 className="arena-field-label">
                          Ảnh chụp ván đấu theo pha (Snapshot)
                        </h4>
                        <pre className="arena-admin-json-view arena-mono">
                          {JSON.stringify(selectedReportDetail.snapshot, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>

            {selectedReportDetail && (
              <div className="arena-sheet__footer">
                <button
                  type="button"
                  className="arena-btn arena-btn--secondary"
                  onClick={() =>
                    handleUpdateReportStatus(selectedReportDetail.id, 'dismissed')
                  }
                >
                  Đánh dấu Không vi phạm
                </button>
                <button
                  type="button"
                  className="arena-btn arena-btn--primary"
                  onClick={() =>
                    handleUpdateReportStatus(selectedReportDetail.id, 'resolved')
                  }
                >
                  ✓ Đánh dấu Đã xử lý
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
