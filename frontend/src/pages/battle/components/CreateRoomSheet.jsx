import React, { useState, useEffect, useMemo } from 'react';
import { battleApi } from '../battleApi.js';

const ROOM_STYLE_Presets = [
  {
    id: 'private_code',
    title: 'Phòng riêng — rủ bạn bằng mã',
    desc: 'Chỉ những bạn có mã phòng 6 số mới vào được.',
    visibility: 'code',
    open_slots: false,
  },
  {
    id: 'public_open',
    title: 'Phòng mở — chơi với bạn cùng khối',
    desc: 'Hiện công khai ở Sảnh Đấu để các bạn cùng khối bấm vào ngay.',
    visibility: 'public',
    open_slots: false,
  },
  {
    id: 'code_open_slots',
    title: 'Phòng riêng + mở chỗ trống',
    desc: 'Rủ bạn bằng mã trước, đồng thời mời thêm bạn cùng khối vào chỗ còn trống.',
    visibility: 'code',
    open_slots: true,
  },
];

export default function CreateRoomSheet({ flags = {}, onClose, onCreated }) {
  const availableKinds = useMemo(() => {
    const list = [];
    if (flags.duel_code !== false) list.push({ id: 'duel', label: 'Đấu đôi (1v1)' });
    if (flags.team !== false) list.push({ id: 'team', label: 'Đấu đội (2 đội)' });
    if (flags.ffa !== false) list.push({ id: 'ffa', label: 'Nhiều người (4–20 bạn)' });
    return list.length > 0 ? list : [{ id: 'duel', label: 'Đấu đôi (1v1)' }];
  }, [flags.duel_code, flags.team, flags.ffa]);

  const [kind, setKind] = useState(availableKinds[0].id);
  const [roomStyleId, setRoomStyleId] = useState('private_code');
  const [questionCount, setQuestionCount] = useState(7);
  const [seconds, setSeconds] = useState(30);
  const [contentMode, setContentMode] = useState('fixed'); // 'fixed' | 'vote'
  const [rankedRoom, setRankedRoom] = useState(false);

  // Dữ liệu /options?count=<questionCount>
  const [catalog, setCatalog] = useState(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [scopeSubMode, setScopeSubMode] = useState('chapter'); // 'chapter' | 'topics'
  const [chapter, setChapter] = useState('');
  const [topicIds, setTopicIds] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Tải lại danh mục mỗi khi đổi Số câu (7 / 10 / 15)
  useEffect(() => {
    let cancelled = false;
    setLoadingCatalog(true);
    battleApi
      .getOptions({ count: questionCount })
      .then((res) => {
        if (cancelled) return;
        setCatalog(res);
        const subjects = Array.isArray(res?.subjects) ? res.subjects : [];
        if (subjects.length > 0 && !subjectId) {
          setSubjectId(String(subjects[0].id));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err?.message || 'Không tải được danh sách môn học.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });
    return () => {
      cancelled = true;
    };
  }, [questionCount]);

  const subjects = Array.isArray(catalog?.subjects) ? catalog.subjects : [];
  const branches = useMemo(() => {
    if (!catalog?.branches) return [];
    return catalog.branches.filter(
      (b) => !b.subject_id || Number(b.subject_id) === Number(subjectId)
    );
  }, [catalog, subjectId]);

  const chapters = useMemo(() => {
    if (!catalog?.chapters) return [];
    return catalog.chapters.filter((ch) => {
      if (ch.subject_id && Number(ch.subject_id) !== Number(subjectId)) return false;
      if (branchId && ch.branch_id) return Number(ch.branch_id) === Number(branchId);
      return true;
    });
  }, [catalog, subjectId, branchId]);

  const topics = useMemo(() => {
    if (!catalog?.topics) return [];
    return catalog.topics.filter((tp) => {
      if (tp.subject_id && Number(tp.subject_id) !== Number(subjectId)) return false;
      if (branchId && tp.branch_id) return Number(tp.branch_id) === Number(branchId);
      return true;
    });
  }, [catalog, subjectId, branchId]);

  const handleToggleTopic = (id) => {
    const num = Number(id);
    setTopicIds((prev) =>
      prev.includes(num) ? prev.filter((x) => x !== num) : [...prev, num]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');

    const preset =
      ROOM_STYLE_Presets.find((p) => p.id === roomStyleId) ||
      ROOM_STYLE_Presets[0];

    const payload = {
      kind,
      visibility: preset.visibility,
      open_slots: preset.open_slots,
      content_mode: contentMode,
      question_count: Number(questionCount),
      seconds: Number(seconds),
      ranked: Boolean(flags.self_created_ranked && rankedRoom && kind !== 'team'),
    };

    if (contentMode === 'fixed') {
      if (!subjectId) {
        setErrorMsg('Em hãy chọn một Môn học.');
        return;
      }
      const scope = { subject_id: Number(subjectId) };
      if (branchId) {
        scope.branch_id = Number(branchId);
      }
      if (scopeSubMode === 'chapter') {
        if (!chapter) {
          setErrorMsg('Em hãy chọn một Chương đủ câu hỏi.');
          return;
        }
        scope.chapter = chapter;
      } else {
        if (topicIds.length === 0) {
          setErrorMsg('Em hãy chọn ít nhất một Bài học.');
          return;
        }
        scope.topic_ids = topicIds;
      }
      payload.scope = scope;
    }

    setSubmitting(true);
    try {
      const created = await battleApi.createRoom(payload);
      if (typeof onCreated === 'function') {
        onCreated(created);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Không tạo được phòng đấu. Em hãy thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="arena-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-room-sheet-title"
    >
      <form className="arena-sheet" onSubmit={handleSubmit}>
        <div className="arena-sheet__header">
          <h2 id="create-room-sheet-title" className="arena-title-md">
            + Tạo phòng đấu mới
          </h2>
          <button
            type="button"
            className="arena-btn arena-btn--secondary arena-btn--sm"
            onClick={onClose}
          >
            Đóng
          </button>
        </div>

        <div className="arena-sheet__body">
          {errorMsg && (
            <div className="arena-alert arena-alert--error" role="alert">
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Kiểu đấu */}
          <div style={{ marginBottom: '16px' }}>
            <span className="arena-field-label">1. Kiểu thi đấu</span>
            <div className="arena-row" style={{ gap: '8px' }}>
              {availableKinds.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={kind === k.id}
                  className={`arena-btn arena-btn--sm ${
                    kind === k.id ? 'arena-btn--primary' : 'arena-btn--secondary'
                  }`}
                  onClick={() => setKind(k.id)}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Ba kiểu phòng (Phòng riêng / Phòng mở / Phòng riêng + mở chỗ trống) */}
          <div style={{ marginBottom: '16px' }}>
            <span className="arena-field-label">2. Chế độ phòng</span>
            <div className="arena-room-style-list">
              {ROOM_STYLE_Presets.map((preset) => {
                // Nếu cờ lobby tắt thì chỉ cho phép tạo phòng qua mã
                const disabledPreset =
                  !flags.lobby && preset.visibility === 'public';
                if (disabledPreset) return null;

                const active = roomStyleId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={active}
                    className={`arena-choice-tile ${
                      active ? 'arena-choice-tile--active' : ''
                    }`}
                    onClick={() => setRoomStyleId(preset.id)}
                  >
                    <div className="arena-choice-tile__title">{preset.title}</div>
                    <div className="arena-choice-tile__desc">{preset.desc}</div>
                  </button>
                );
              })}
            </div>
            <p className="arena-subtitle" style={{ marginTop: '6px' }}>
              ℹ️ Phòng tự tạo mặc định không tính hạng (dành để giao lưu và ôn tập cùng bạn bè).
            </p>
            {flags.self_created_ranked && kind !== 'team' && (
              <label className="arena-filter-checkbox" style={{ marginTop: '8px' }}>
                <input
                  type="checkbox"
                  checked={rankedRoom}
                  onChange={(e) => setRankedRoom(e.target.checked)}
                />
                <span>Đăng ký tính hạng cho bản thân ở phòng này (nếu đủ phạm vi Chương)</span>
              </label>
            )}
          </div>

          {/* 3. Số câu & Thời gian mỗi câu */}
          <div className="arena-grid-2" style={{ marginBottom: '16px' }}>
            <div>
              <span className="arena-field-label">3. Số câu hỏi</span>
              <div className="arena-row" style={{ gap: '8px' }}>
                {[7, 10, 15].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    className={`arena-btn arena-btn--sm arena-mono ${
                      questionCount === cnt
                        ? 'arena-btn--primary'
                        : 'arena-btn--secondary'
                    }`}
                    onClick={() => {
                      setQuestionCount(cnt);
                      setChapter('');
                      setTopicIds([]);
                    }}
                  >
                    {cnt} câu
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="arena-field-label">4. Thời gian mỗi câu</span>
              <div className="arena-row" style={{ gap: '8px' }}>
                {[20, 30, 45].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    className={`arena-btn arena-btn--sm arena-mono ${
                      seconds === sec
                        ? 'arena-btn--primary'
                        : 'arena-btn--secondary'
                    }`}
                    onClick={() => setSeconds(sec)}
                  >
                    {sec} giây
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4. Nội dung câu hỏi: Chọn ngay hoặc Để cả phòng cùng chọn */}
          <div>
            <span className="arena-field-label">5. Nội dung câu hỏi</span>
            <div className="arena-row" style={{ gap: '8px', marginBottom: '12px' }}>
              <button
                type="button"
                className={`arena-btn arena-btn--sm ${
                  contentMode === 'fixed'
                    ? 'arena-btn--primary'
                    : 'arena-btn--secondary'
                }`}
                onClick={() => setContentMode('fixed')}
              >
                Chọn ngay
              </button>

              {flags.vote && (
                <button
                  type="button"
                  className={`arena-btn arena-btn--sm ${
                    contentMode === 'vote'
                      ? 'arena-btn--primary'
                      : 'arena-btn--secondary'
                  }`}
                  onClick={() => setContentMode('vote')}
                >
                  Để cả phòng cùng chọn (Bỏ phiếu)
                </button>
              )}
            </div>

            {contentMode === 'vote' ? (
              <div className="arena-card arena-card--subtle">
                <p style={{ margin: 0, fontSize: '0.92rem' }}>
                  Khi các bạn đã vào phòng chờ, cả phòng sẽ bỏ phiếu 2 vòng (Chọn Môn → Thu hẹp Chương/Bài).
                </p>
              </div>
            ) : loadingCatalog ? (
              <p className="arena-empty-hint">Đang tải danh mục câu hỏi…</p>
            ) : (
              <div className="arena-card arena-card--subtle">
                <div style={{ marginBottom: '12px' }}>
                  <label htmlFor="cr-subject" className="arena-field-label">
                    Môn học
                  </label>
                  <select
                    id="cr-subject"
                    className="arena-select"
                    value={subjectId}
                    onChange={(e) => {
                      setSubjectId(e.target.value);
                      setBranchId('');
                      setChapter('');
                      setTopicIds([]);
                    }}
                  >
                    <option value="">-- Chọn môn --</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.count} câu)
                      </option>
                    ))}
                  </select>
                </div>

                {branches.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <label htmlFor="cr-branch" className="arena-field-label">
                      Phân môn (tuỳ chọn)
                    </label>
                    <select
                      id="cr-branch"
                      className="arena-select"
                      value={branchId}
                      onChange={(e) => {
                        setBranchId(e.target.value);
                        setChapter('');
                        setTopicIds([]);
                      }}
                    >
                      <option value="">Tất cả phân môn</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="arena-row" style={{ gap: '8px', marginBottom: '10px' }}>
                  <button
                    type="button"
                    className={`arena-btn arena-btn--sm ${
                      scopeSubMode === 'chapter'
                        ? 'arena-btn--primary'
                        : 'arena-btn--secondary'
                    }`}
                    onClick={() => setScopeSubMode('chapter')}
                  >
                    Theo Chương
                  </button>
                  <button
                    type="button"
                    className={`arena-btn arena-btn--sm ${
                      scopeSubMode === 'topics'
                        ? 'arena-btn--primary'
                        : 'arena-btn--secondary'
                    }`}
                    onClick={() => setScopeSubMode('topics')}
                  >
                    Theo Bài học
                  </button>
                </div>

                {scopeSubMode === 'chapter' ? (
                  <div>
                    <label htmlFor="cr-chapter" className="arena-field-label">
                      Chọn Chương (đủ {questionCount} câu)
                    </label>
                    <select
                      id="cr-chapter"
                      className="arena-select"
                      value={chapter}
                      onChange={(e) => setChapter(e.target.value)}
                    >
                      <option value="">-- Chọn Chương --</option>
                      {chapters.map((ch, idx) => (
                        <option key={ch.name || idx} value={ch.name}>
                          {ch.name} ({ch.count} câu)
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <span className="arena-field-label">
                      Chọn Bài học ({topicIds.length} bài đã chọn)
                    </span>
                    <div className="arena-topic-check-list">
                      {topics.length === 0 ? (
                        <p className="arena-empty-hint">
                          Không có bài học nào đủ {questionCount} câu.
                        </p>
                      ) : (
                        topics.map((tp) => {
                          const checked = topicIds.includes(Number(tp.id));
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
                                onChange={() => handleToggleTopic(tp.id)}
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
            )}
          </div>
        </div>

        <div className="arena-sheet__footer">
          <button
            type="button"
            className="arena-btn arena-btn--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Huỷ
          </button>
          <button
            type="submit"
            className="arena-btn arena-btn--amber"
            disabled={submitting || loadingCatalog}
          >
            {submitting ? 'Đang tạo phòng…' : 'Tạo phòng ngay'}
          </button>
        </div>
      </form>
    </div>
  );
}
