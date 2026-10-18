import React, { useState, useEffect, useMemo } from 'react';
import { battleApi, battleApiFlex } from '../battleApi.js';
import ScopeLabel from './ScopeLabel.jsx';

export default function FindMatchSheet({
  flags = {},
  initialOptions = null,
  onClose,
  onMatchedRoom,
  onQueued,
}) {
  // 1. Kiểu đấu: chọn 1 hoặc cả 2 ('duel', 'ffa')
  const [kinds, setKinds] = useState(() => {
    const def = ['duel'];
    if (flags.ffa !== false) def.push('ffa');
    return def;
  });

  // 2. Danh sách tối đa 3 lựa chọn nội dung (rỗng = Môn nào cũng được)
  const [choices, setChoices] = useState([]);

  // Bộ chọn thêm 1 lựa chọn nội dung vào danh sách choices (tối đa 3)
  const [catalog, setCatalog] = useState(initialOptions);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [pickSubjectId, setPickSubjectId] = useState('');
  const [pickBranchId, setPickBranchId] = useState('');
  const [pickChapter, setPickChapter] = useState('');
  const [pickTopicId, setPickTopicId] = useState('');

  // 3. Độ dài ván đấu ('any' hoặc mảng [10, 7, ...])
  const [lengthMode, setLengthMode] = useState('any'); // 'any' | 'custom'
  const [selectedLengths, setSelectedLengths] = useState([7, 10]);

  // 4. Độ linh hoạt phạm vi ('gradual' mặc định bật | 'strict')
  const [flexMode, setFlexMode] = useState('gradual');

  // 5. Công tắc Tính hạng & Cho đối thủ máy lấp chỗ
  const [ranked, setRanked] = useState(true);
  const [botFill, setBotFill] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (catalog) return undefined;
    let cancelled = false;
    setLoadingCatalog(true);
    battleApi
      .getOptions({ count: 7 })
      .then((res) => {
        if (!cancelled && res) setCatalog(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalog]);

  const subjects = Array.isArray(catalog?.subjects) ? catalog.subjects : [];
  const branches = useMemo(() => {
    if (!catalog?.branches) return [];
    return catalog.branches.filter(
      (b) => !pickSubjectId || !b.subject_id || Number(b.subject_id) === Number(pickSubjectId)
    );
  }, [catalog, pickSubjectId]);

  const chapters = useMemo(() => {
    if (!catalog?.chapters) return [];
    return catalog.chapters.filter((ch) => {
      if (pickSubjectId && ch.subject_id && Number(ch.subject_id) !== Number(pickSubjectId)) {
        return false;
      }
      if (pickBranchId && ch.branch_id && Number(ch.branch_id) !== Number(pickBranchId)) {
        return false;
      }
      return true;
    });
  }, [catalog, pickSubjectId, pickBranchId]);

  const topics = useMemo(() => {
    if (!catalog?.topics) return [];
    return catalog.topics.filter((tp) => {
      if (pickSubjectId && tp.subject_id && Number(tp.subject_id) !== Number(pickSubjectId)) {
        return false;
      }
      if (pickBranchId && tp.branch_id && Number(tp.branch_id) !== Number(pickBranchId)) {
        return false;
      }
      return true;
    });
  }, [catalog, pickSubjectId, pickBranchId]);

  const suggestions = useMemo(() => {
    const raw = Array.isArray(catalog?.suggestions) ? catalog.suggestions : [];
    const allTopics = Array.isArray(catalog?.topics) ? catalog.topics : [];
    return raw
      .map((sug) => {
        const tp = allTopics.find((t) => Number(t.id) === Number(sug.topic_id));
        if (!tp) return null;
        return {
          ...sug,
          topic: tp,
        };
      })
      .filter(Boolean);
  }, [catalog]);

  const toggleKind = (k) => {
    setKinds((prev) => {
      if (prev.includes(k)) {
        return prev.length > 1 ? prev.filter((item) => item !== k) : prev;
      }
      return [...prev, k];
    });
  };

  const toggleLengthNumber = (num) => {
    setSelectedLengths((prev) => {
      if (prev.includes(num)) {
        return prev.length > 1 ? prev.filter((n) => n !== num) : prev;
      }
      return [...prev, num];
    });
  };

  const addChoiceScope = (newScope) => {
    setErrorMsg('');
    setChoices((prev) => {
      if (prev.length >= 3) {
        setErrorMsg('Tối đa 3 lựa chọn nội dung trong một vé tìm trận.');
        return prev;
      }
      return [...prev, newScope];
    });
  };

  const handleAddCurrentPicker = () => {
    if (!pickSubjectId) {
      setErrorMsg('Em hãy chọn một Môn học trước khi thêm vào danh sách.');
      return;
    }
    const scope = { subject_id: Number(pickSubjectId) };
    if (pickBranchId) scope.branch_id = Number(pickBranchId);
    if (pickTopicId) {
      scope.topic_ids = [Number(pickTopicId)];
    } else if (pickChapter) {
      scope.chapter = pickChapter;
    }
    addChoiceScope(scope);
    setPickChapter('');
    setPickTopicId('');
  };

  const handleApplySuggestion = (sug) => {
    if (!sug?.topic) return;
    const scope = {
      subject_id: Number(sug.topic.subject_id || subjects[0]?.id || 1),
      topic_ids: [Number(sug.topic.id)],
    };
    if (sug.topic.branch_id) {
      scope.branch_id = Number(sug.topic.branch_id);
    }
    addChoiceScope(scope);
  };

  const handleRandomDrawTopic = () => {
    const allTopics = Array.isArray(catalog?.topics) ? catalog.topics : [];
    if (allTopics.length === 0) return;
    const randomTp = allTopics[Math.floor(Math.random() * allTopics.length)];
    const scope = {
      subject_id: Number(randomTp.subject_id || subjects[0]?.id || 1),
      topic_ids: [Number(randomTp.id)],
    };
    if (randomTp.branch_id) {
      scope.branch_id = Number(randomTp.branch_id);
    }
    addChoiceScope(scope);
  };

  const handleRemoveChoice = (idx) => {
    setChoices((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');

    const ticket = {
      kinds,
      choices,
      lengths: lengthMode === 'any' ? 'any' : selectedLengths,
      flex: flexMode,
      ranked: Boolean(ranked),
      bot_fill: Boolean(botFill),
    };

    setSubmitting(true);
    try {
      const res = await battleApiFlex.startFlexMatch(ticket);
      if (res?.current_room_id) {
        if (typeof onMatchedRoom === 'function') {
          onMatchedRoom(res.current_room_id);
        }
        return;
      }
      if (typeof onQueued === 'function') {
        onQueued(res?.queue || ticket);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Không thể bắt đầu tìm đối thủ lúc này.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="arena-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="find-match-sheet-title"
    >
      <form className="arena-sheet" onSubmit={handleSubmit}>
        <div className="arena-sheet__header">
          <h2 id="find-match-sheet-title" className="arena-title-md">
            ⚡ Tìm đối thủ cùng khối
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

          {/* 1. Kiểu đấu (chọn nhiều) */}
          <div style={{ marginBottom: '16px' }}>
            <span className="arena-field-label">
              1. Kiểu thi đấu (có thể chọn cả hai để ghép nhanh hơn)
            </span>
            <div className="arena-row" style={{ gap: '8px' }}>
              <button
                type="button"
                aria-pressed={kinds.includes('duel')}
                className={`arena-btn arena-btn--sm ${
                  kinds.includes('duel') ? 'arena-btn--primary' : 'arena-btn--secondary'
                }`}
                onClick={() => toggleKind('duel')}
              >
                {kinds.includes('duel') ? '✓ ' : ''}Đấu đôi (1v1)
              </button>
              {flags.ffa !== false && (
                <button
                  type="button"
                  aria-pressed={kinds.includes('ffa')}
                  className={`arena-btn arena-btn--sm ${
                    kinds.includes('ffa')
                      ? 'arena-btn--primary'
                      : 'arena-btn--secondary'
                  }`}
                  onClick={() => toggleKind('ffa')}
                >
                  {kinds.includes('ffa') ? '✓ ' : ''}Nhiều người (FFA)
                </button>
              )}
            </div>
          </div>

          {/* 2. Nội dung thi đấu (tối đa 3 lựa chọn hoặc Môn nào cũng được) */}
          <div style={{ marginBottom: '16px' }}>
            <div className="arena-row arena-row--between" style={{ marginBottom: '6px' }}>
              <span className="arena-field-label" style={{ margin: 0 }}>
                2. Nội dung muốn đấu ({choices.length}/3 lựa chọn)
              </span>
              {choices.length > 0 && (
                <button
                  type="button"
                  className="arena-link-inline"
                  onClick={() => setChoices([])}
                >
                  Đặt lại &ldquo;Môn nào cũng được&rdquo;
                </button>
              )}
            </div>

            {choices.length === 0 ? (
              <div className="arena-selected-choices-empty">
                🌟 Đang chọn: <strong>Môn nào cũng được</strong> (ghép nhanh nhất trong phần em đã học)
              </div>
            ) : (
              <div className="arena-selected-choices">
                {choices.map((sc, idx) => (
                  <span key={idx} className="arena-chip arena-chip--accent">
                    <ScopeLabel scope={sc} options={catalog} />
                    <button
                      type="button"
                      className="arena-chip-remove"
                      aria-label="Xoá lựa chọn này"
                      onClick={() => handleRemoveChoice(idx)}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Bộ chọn thêm phạm vi */}
            {choices.length < 3 && (
              <div className="arena-card arena-card--subtle" style={{ marginTop: '10px' }}>
                <div className="arena-grid-2">
                  <div>
                    <label htmlFor="fm-subject" className="arena-field-label">
                      Môn học
                    </label>
                    <select
                      id="fm-subject"
                      className="arena-select"
                      value={pickSubjectId}
                      onChange={(e) => {
                        setPickSubjectId(e.target.value);
                        setPickBranchId('');
                        setPickChapter('');
                        setPickTopicId('');
                      }}
                    >
                      <option value="">-- Chọn môn để thêm --</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="fm-branch" className="arena-field-label">
                      Phân môn (tuỳ chọn)
                    </label>
                    <select
                      id="fm-branch"
                      className="arena-select"
                      value={pickBranchId}
                      onChange={(e) => {
                        setPickBranchId(e.target.value);
                        setPickChapter('');
                        setPickTopicId('');
                      }}
                      disabled={!pickSubjectId}
                    >
                      <option value="">Tất cả phân môn</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {pickSubjectId && (
                  <div className="arena-grid-2" style={{ marginTop: '10px' }}>
                    <div>
                      <label htmlFor="fm-chapter" className="arena-field-label">
                        Chương (tuỳ chọn)
                      </label>
                      <select
                        id="fm-chapter"
                        className="arena-select"
                        value={pickChapter}
                        onChange={(e) => {
                          setPickChapter(e.target.value);
                          setPickTopicId('');
                        }}
                      >
                        <option value="">Cả môn / phân môn</option>
                        {chapters.map((ch, idx) => (
                          <option key={ch.name || idx} value={ch.name}>
                            {ch.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="fm-topic" className="arena-field-label">
                        Hoặc chọn 1 Bài cụ thể
                      </label>
                      <select
                        id="fm-topic"
                        className="arena-select"
                        value={pickTopicId}
                        onChange={(e) => {
                          setPickTopicId(e.target.value);
                          setPickChapter('');
                        }}
                      >
                        <option value="">-- Không chọn bài lẻ --</option>
                        {topics.map((tp) => (
                          <option key={tp.id} value={tp.id}>
                            {tp.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: '10px', textAlign: 'right' }}>
                  <button
                    type="button"
                    className="arena-btn arena-btn--secondary arena-btn--sm"
                    disabled={!pickSubjectId}
                    onClick={handleAddCurrentPicker}
                  >
                    + Thêm vào lựa chọn ({choices.length}/3)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 3. Khối "Chưa biết đấu phần nào?" (Gợi ý + Bốc thăm) */}
          <div className="arena-card arena-suggestions-box" style={{ marginBottom: '16px' }}>
            <div className="arena-row arena-row--between" style={{ marginBottom: '8px' }}>
              <span className="arena-field-label" style={{ margin: 0 }}>
                💡 Chưa biết đấu phần nào?
              </span>
              <button
                type="button"
                className="arena-btn arena-btn--secondary arena-btn--sm"
                onClick={handleRandomDrawTopic}
                disabled={loadingCatalog || (catalog?.topics || []).length === 0}
              >
                🎲 Bốc thăm
              </button>
            </div>

            {suggestions.length === 0 ? (
              <p className="arena-subtitle" style={{ margin: 0 }}>
                Bấm &ldquo;Bốc thăm&rdquo; để chọn ngẫu nhiên một Bài học đủ câu hỏi.
              </p>
            ) : (
              <div className="arena-suggestions-list">
                {suggestions.map((sug, idx) => {
                  const reasonLabel =
                    sug.reason === 'weak'
                      ? 'Bài em đang vướng'
                      : 'Bài em đang luyện';
                  const chipClass =
                    sug.reason === 'weak'
                      ? 'arena-chip--warn'
                      : 'arena-chip--accent';

                  return (
                    <button
                      key={`${sug.topic_id}-${idx}`}
                      type="button"
                      className="arena-suggestion-item"
                      onClick={() => handleApplySuggestion(sug)}
                    >
                      <span className={`arena-chip ${chipClass}`}>
                        {reasonLabel}
                      </span>
                      <span className="arena-suggestion-item__name">
                        {sug.topic.name}
                      </span>
                      <span className="arena-suggestion-item__add">+ Chọn</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4. Độ dài ván đấu (7 / 10 / 15 / Bất kỳ) */}
          <div style={{ marginBottom: '16px' }}>
            <span className="arena-field-label">3. Độ dài ván đấu</span>
            <div className="arena-row" style={{ gap: '8px' }}>
              <button
                type="button"
                className={`arena-btn arena-btn--sm ${
                  lengthMode === 'any' ? 'arena-btn--primary' : 'arena-btn--secondary'
                }`}
                onClick={() => setLengthMode('any')}
              >
                Bất kỳ (7 / 10 / 15 câu)
              </button>
              {[7, 10, 15].map((num) => {
                const isActive =
                  lengthMode === 'custom' && selectedLengths.includes(num);
                return (
                  <button
                    key={num}
                    type="button"
                    className={`arena-btn arena-btn--sm arena-mono ${
                      isActive ? 'arena-btn--primary' : 'arena-btn--secondary'
                    }`}
                    onClick={() => {
                      if (lengthMode !== 'custom') {
                        setLengthMode('custom');
                        setSelectedLengths([num]);
                      } else {
                        toggleLengthNumber(num);
                      }
                    }}
                  >
                    {num} câu
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Cách mở rộng phạm vi (gradual vs strict) */}
          <div style={{ marginBottom: '16px' }}>
            <span className="arena-field-label">4. Cách tìm đối thủ</span>
            <div className="arena-grid-2">
              <button
                type="button"
                aria-pressed={flexMode === 'gradual'}
                className={`arena-choice-tile ${
                  flexMode === 'gradual' ? 'arena-choice-tile--active' : ''
                }`}
                onClick={() => setFlexMode('gradual')}
              >
                <div className="arena-choice-tile__title">
                  Mở rộng dần nếu chờ lâu (Khuyên dùng)
                </div>
                <div className="arena-choice-tile__desc">
                  Tự nới dần trong những Chương/Bài em đã học để gặp bạn nhanh hơn.
                </div>
              </button>

              <button
                type="button"
                aria-pressed={flexMode === 'strict'}
                className={`arena-choice-tile ${
                  flexMode === 'strict' ? 'arena-choice-tile--active' : ''
                }`}
                onClick={() => setFlexMode('strict')}
              >
                <div className="arena-choice-tile__title">Chỉ đúng phần này</div>
                <div className="arena-choice-tile__desc">
                  Giữ cố định phạm vi đã chọn, không tự mở rộng khi chờ.
                </div>
              </button>
            </div>
          </div>

          {/* 6. Công tắc Tính hạng & Cho đối thủ máy lấp chỗ */}
          <div className="arena-card arena-card--subtle">
            <label className="arena-toggle-row">
              <div>
                <div className="arena-toggle-row__title">🏅 Tính hạng học thuật</div>
                <div className="arena-subtitle" style={{ margin: 0 }}>
                  Lưu ý: Ván tính hạng cần phạm vi từ cả Chương trở lên.
                </div>
              </div>
              <input
                type="checkbox"
                checked={ranked}
                onChange={(e) => setRanked(e.target.checked)}
              />
            </label>

            {kinds.includes('ffa') && (
              <label
                className="arena-toggle-row"
                style={{
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--line, #E2DFD6)',
                }}
              >
                <div>
                  <div className="arena-toggle-row__title">
                    🤖 Cho đối thủ máy lấp chỗ nếu vắng
                  </div>
                  <div className="arena-subtitle" style={{ margin: 0 }}>
                    Áp dụng cho phòng Nhiều người khi chờ lâu và cả nhóm đều đồng ý.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={botFill}
                  onChange={(e) => setBotFill(e.target.checked)}
                />
              </label>
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
            disabled={submitting}
          >
            {submitting ? 'Đang ghép…' : '⚡ Bắt đầu tìm đối thủ'}
          </button>
        </div>
      </form>
    </div>
  );
}
