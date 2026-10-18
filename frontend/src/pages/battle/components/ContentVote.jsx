import React, { useState, useEffect, useMemo } from 'react';
import { battleApi } from '../battleApi.js';

export default function ContentVote({ roomId, snapshot, userId, onError }) {
  const vote = snapshot?.vote;

  const [remainingSec, setRemainingSec] = useState(null);
  const [busyOptionId, setBusyOptionId] = useState(null);

  // Sheet đề cử phạm vi (dành cho vòng 2 hoặc khi chủ phòng chọn phạm vi sau 2 lượt không phiếu)
  const [showNominateSheet, setShowNominateSheet] = useState(false);
  const [optionsCatalog, setOptionsCatalog] = useState(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [scopeMode, setScopeMode] = useState('chapter'); // 'all' | 'chapter' | 'topics'
  const [selectedChapter, setSelectedChapter] = useState('');
  const [selectedTopicIds, setSelectedTopicIds] = useState([]);
  const [nominating, setNominating] = useState(false);

  const isHost = Boolean(
    snapshot && userId !== undefined && Number(snapshot.host_id) === Number(userId)
  );

  // Đồng hồ đếm ngược tới vote.deadline
  useEffect(() => {
    const deadline = vote?.deadline;
    if (typeof deadline !== 'number') {
      setRemainingSec(null);
      return undefined;
    }

    const offset =
      typeof snapshot?.server_now === 'number'
        ? snapshot.server_now - Date.now()
        : 0;

    const tick = () => {
      const now = Date.now() + offset;
      const sec = Math.max(0, Math.ceil((deadline - now) / 1000));
      setRemainingSec(sec);
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [vote?.deadline, snapshot?.server_now]);

  // Nạp dữ liệu /options khi mở hộp Đề cử phạm vi
  const lockedSubjectId =
    vote?.subject_id ?? snapshot?.scope?.subject_id ?? null;

  useEffect(() => {
    if (!showNominateSheet || !lockedSubjectId) return undefined;
    let cancelled = false;
    setLoadingCatalog(true);
    battleApi
      .getOptions({
        count: snapshot?.question_count || 7,
        subject_id: lockedSubjectId,
      })
      .then((res) => {
        if (!cancelled) {
          setOptionsCatalog(res);
        }
      })
      .catch((err) => {
        if (!cancelled && typeof onError === 'function') {
          onError(err?.message || 'Không tải được danh sách chương/bài.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showNominateSheet, lockedSubjectId, snapshot?.question_count, onError]);

  const branches = useMemo(() => {
    if (!optionsCatalog?.branches) return [];
    return optionsCatalog.branches.filter(
      (b) =>
        !b.subject_id || Number(b.subject_id) === Number(lockedSubjectId)
    );
  }, [optionsCatalog, lockedSubjectId]);

  const chapters = useMemo(() => {
    if (!optionsCatalog?.chapters) return [];
    return optionsCatalog.chapters.filter((ch) => {
      if (ch.subject_id && Number(ch.subject_id) !== Number(lockedSubjectId)) {
        return false;
      }
      if (selectedBranchId && ch.branch_id) {
        return Number(ch.branch_id) === Number(selectedBranchId);
      }
      return true;
    });
  }, [optionsCatalog, lockedSubjectId, selectedBranchId]);

  const topics = useMemo(() => {
    if (!optionsCatalog?.topics) return [];
    return optionsCatalog.topics.filter((tp) => {
      if (tp.subject_id && Number(tp.subject_id) !== Number(lockedSubjectId)) {
        return false;
      }
      if (selectedBranchId && tp.branch_id) {
        return Number(tp.branch_id) === Number(selectedBranchId);
      }
      return true;
    });
  }, [optionsCatalog, lockedSubjectId, selectedBranchId]);

  if (!vote) return null;

  const stage = vote.stage || 'subject'; // 'subject' | 'scope'
  const optionsList = Array.isArray(vote.options) ? vote.options : [];
  const countsMap = vote.counts && typeof vote.counts === 'object' ? vote.counts : {};
  const myOptionId = vote.mine !== undefined && vote.mine !== null ? String(vote.mine) : null;
  const eligible = vote.eligible !== false;
  const voterTotal =
    typeof vote.voter_count === 'number'
      ? vote.voter_count
      : typeof vote.eligible_count === 'number'
      ? vote.eligible_count
      : Array.isArray(snapshot?.players)
      ? snapshot.players.length
      : 1;

  const nominationsCount =
    typeof vote.nominations_count === 'number'
      ? vote.nominations_count
      : optionsList.filter((o) => o.nominated).length;

  const canNominate =
    stage === 'scope' &&
    Boolean(lockedSubjectId) &&
    (nominationsCount < 3 || vote.host_pick || isHost);

  const handleCastVote = async (optionId, force = false) => {
    if (!roomId || busyOptionId) return;
    if (!eligible && !force) return;

    setBusyOptionId(String(optionId));
    try {
      await battleApi.voteContent(roomId, optionId, force);
    } catch (err) {
      if (typeof onError === 'function') {
        onError(err?.message || 'Không gửi được phiếu bầu.');
      }
    } finally {
      setBusyOptionId(null);
    }
  };

  const handleToggleTopicId = (topicId) => {
    const idNum = Number(topicId);
    setSelectedTopicIds((prev) =>
      prev.includes(idNum) ? prev.filter((x) => x !== idNum) : [...prev, idNum]
    );
  };

  const handleSubmitNomination = async (e) => {
    e.preventDefault();
    if (!roomId || !lockedSubjectId || nominating) return;

    const scopePayload = {
      subject_id: Number(lockedSubjectId),
    };

    if (selectedBranchId) {
      scopePayload.branch_id = Number(selectedBranchId);
    }

    if (scopeMode === 'chapter') {
      if (!selectedChapter) {
        if (typeof onError === 'function') {
          onError('Em hãy chọn một Chương để đề cử.');
        }
        return;
      }
      scopePayload.chapter = selectedChapter;
    } else if (scopeMode === 'topics') {
      if (selectedTopicIds.length === 0) {
        if (typeof onError === 'function') {
          onError('Em hãy chọn ít nhất một Bài để đề cử.');
        }
        return;
      }
      scopePayload.topic_ids = selectedTopicIds;
    }

    setNominating(true);
    try {
      await battleApi.nominateScope(roomId, scopePayload);
      setShowNominateSheet(false);
      setSelectedChapter('');
      setSelectedTopicIds([]);
    } catch (err) {
      if (typeof onError === 'function') {
        onError(err?.message || 'Không thể đề cử phạm vi này.');
      }
    } finally {
      setNominating(false);
    }
  };

  const voteResult = vote.vote_result || snapshot?.vote_result;

  return (
    <div className="arena-card arena-vote-card">
      <div className="arena-vote-header">
        <div>
          <div className="arena-row" style={{ gap: '8px', marginBottom: '4px' }}>
            <span className="arena-chip arena-chip--amber">
              {stage === 'subject' ? 'Vòng 1 · Chọn môn' : 'Vòng 2 · Thu hẹp phạm vi'}
            </span>
            {remainingSec !== null && (
              <span className="arena-chip arena-mono">
                ⏱ Còn {remainingSec}s
              </span>
            )}
          </div>
          <h3 className="arena-title-md">
            {stage === 'subject'
              ? 'Cả phòng cùng bỏ phiếu chọn môn thi đấu'
              : 'Thu hẹp phạm vi câu hỏi trong môn đã chốt'}
          </h3>
        </div>

        {canNominate && (
          <button
            type="button"
            className="arena-btn arena-btn--secondary arena-btn--sm"
            onClick={() => setShowNominateSheet(true)}
          >
            + Đề cử phạm vi ({Math.min(nominationsCount, 3)}/3)
          </button>
        )}
      </div>

      {!eligible && (
        <div
          className="arena-alert arena-alert--info"
          style={{ marginTop: '10px', marginBottom: '10px' }}
          role="status"
        >
          <span>
            Em vào phòng khi lượt bỏ phiếu này đã mở — em xem trực tiếp và sẽ tham gia ở vòng tiếp theo.
          </span>
        </div>
      )}

      {vote.host_pick && isHost && (
        <div
          className="arena-alert arena-alert--warn"
          style={{ marginTop: '10px', marginBottom: '10px' }}
          role="status"
        >
          <span>
            Hai lượt bỏ phiếu chưa có phiếu nào. Chủ phòng hãy bấm &ldquo;Đề cử phạm vi&rdquo; để chốt nội dung cho phòng.
          </span>
        </div>
      )}

      {/* Kết quả vòng bầu chọn / thông báo bốc thăm khi hoà phiếu */}
      {voteResult && (
        <div
          className="arena-alert arena-alert--ok"
          style={{ marginTop: '10px', marginBottom: '10px' }}
          role="status"
          aria-live="polite"
        >
          <span>
            {voteResult.tied ? (
              <>
                🎲 <strong>Bốc thăm giữa</strong>{' '}
                {Array.isArray(voteResult.candidates)
                  ? voteResult.candidates.join(', ')
                  : 'các lựa chọn đồng phiếu'}{' '}
                → Chốt: <strong>{voteResult.winner_label || voteResult.label || 'Đã chọn'}</strong>
              </>
            ) : (
              <>
                ✓ Đã chốt bầu chọn:{' '}
                <strong>{voteResult.winner_label || voteResult.label || 'Hoàn tất'}</strong>
              </>
            )}
          </span>
        </div>
      )}

      {/* Danh sách các phương án bỏ phiếu */}
      <div className="arena-vote-list" role="group" aria-label="Danh sách lựa chọn bỏ phiếu">
        {optionsList.length === 0 ? (
          <p className="arena-empty-hint">
            Chưa có đề cử nào. Hãy bấm &ldquo;Đề cử phạm vi&rdquo; để thêm lựa chọn cho cả phòng.
          </p>
        ) : (
          optionsList.map((opt) => {
            const optId = String(opt.id);
            const voteCount = Number(countsMap[optId] ?? opt.count ?? 0);
            const isMine = myOptionId === optId;
            const isMajority = voterTotal > 0 && voteCount > voterTotal / 2;
            const percent =
              voterTotal > 0
                ? Math.min(100, Math.round((voteCount / voterTotal) * 100))
                : 0;

            return (
              <div
                key={optId}
                className={`arena-vote-option ${
                  isMine ? 'arena-vote-option--mine' : ''
                }`}
              >
                <button
                  type="button"
                  className="arena-vote-option__main"
                  disabled={!eligible || Boolean(busyOptionId)}
                  onClick={() => handleCastVote(optId, false)}
                  aria-pressed={isMine}
                >
                  <div className="arena-vote-option__bar" style={{ width: `${percent}%` }} />
                  <div className="arena-vote-option__content">
                    <div className="arena-vote-option__title-wrap">
                      <span className="arena-vote-option__label">
                        {opt.label || opt.name || `Lựa chọn ${optId}`}
                      </span>
                      {isMine && (
                        <span className="arena-chip arena-chip--accent">
                          ✓ Phiếu của em
                        </span>
                      )}
                    </div>

                    <span className="arena-vote-option__count arena-mono">
                      {voteCount} phiếu
                    </span>
                  </div>
                </button>

                {isHost && isMajority && (
                  <button
                    type="button"
                    className="arena-btn arena-btn--amber arena-btn--sm arena-vote-force-btn"
                    disabled={Boolean(busyOptionId)}
                    onClick={() => handleCastVote(optId, true)}
                  >
                    Chốt luôn
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Hộp thoại Đề cử phạm vi (Chương / Bài trong môn đã chốt) */}
      {showNominateSheet && (
        <div
          className="arena-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="arena-nominate-title"
        >
          <form className="arena-sheet" onSubmit={handleSubmitNomination}>
            <div className="arena-sheet__header">
              <h3 id="arena-nominate-title" className="arena-title-md">
                Đề cử phạm vi câu hỏi
              </h3>
              <button
                type="button"
                className="arena-btn arena-btn--secondary arena-btn--sm"
                onClick={() => setShowNominateSheet(false)}
              >
                Đóng
              </button>
            </div>

            <div className="arena-sheet__body">
              {loadingCatalog ? (
                <p className="arena-empty-hint">Đang tải danh sách Chương / Bài đủ câu…</p>
              ) : (
                <>
                  {branches.length > 0 && (
                    <div style={{ marginBottom: '14px' }}>
                      <label htmlFor="nominate-branch" className="arena-field-label">
                        Phân môn (tuỳ chọn)
                      </label>
                      <select
                        id="nominate-branch"
                        className="arena-select"
                        value={selectedBranchId}
                        onChange={(e) => {
                          setSelectedBranchId(e.target.value);
                          setSelectedChapter('');
                          setSelectedTopicIds([]);
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

                  <div style={{ marginBottom: '14px' }}>
                    <span className="arena-field-label">Cách chọn phạm vi</span>
                    <div className="arena-row" style={{ gap: '8px' }}>
                      <button
                        type="button"
                        className={`arena-btn arena-btn--sm ${
                          scopeMode === 'chapter'
                            ? 'arena-btn--primary'
                            : 'arena-btn--secondary'
                        }`}
                        onClick={() => setScopeMode('chapter')}
                      >
                        Theo Chương
                      </button>
                      <button
                        type="button"
                        className={`arena-btn arena-btn--sm ${
                          scopeMode === 'topics'
                            ? 'arena-btn--primary'
                            : 'arena-btn--secondary'
                        }`}
                        onClick={() => setScopeMode('topics')}
                      >
                        Theo Bài học
                      </button>
                      {selectedBranchId && (
                        <button
                          type="button"
                          className={`arena-btn arena-btn--sm ${
                            scopeMode === 'all'
                              ? 'arena-btn--primary'
                              : 'arena-btn--secondary'
                          }`}
                          onClick={() => setScopeMode('all')}
                        >
                          Cả phân môn
                        </button>
                      )}
                    </div>
                  </div>

                  {scopeMode === 'chapter' && (
                    <div>
                      <label htmlFor="nominate-chapter" className="arena-field-label">
                        Chọn Chương đủ câu hỏi
                      </label>
                      <select
                        id="nominate-chapter"
                        className="arena-select"
                        value={selectedChapter}
                        onChange={(e) => setSelectedChapter(e.target.value)}
                      >
                        <option value="">-- Chọn một chương --</option>
                        {chapters.map((ch, idx) => (
                          <option key={ch.name || idx} value={ch.name}>
                            {ch.name} ({ch.count} câu)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {scopeMode === 'topics' && (
                    <div>
                      <span className="arena-field-label">
                        Chọn một hoặc nhiều Bài học ({selectedTopicIds.length} bài đã chọn)
                      </span>
                      <div className="arena-topic-check-list">
                        {topics.length === 0 ? (
                          <p className="arena-empty-hint">
                            Không có bài lẻ đủ câu ở mục này.
                          </p>
                        ) : (
                          topics.map((tp) => {
                            const checked = selectedTopicIds.includes(Number(tp.id));
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
                                  onChange={() => handleToggleTopicId(tp.id)}
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
                </>
              )}
            </div>

            <div className="arena-sheet__footer">
              <button
                type="button"
                className="arena-btn arena-btn--secondary"
                onClick={() => setShowNominateSheet(false)}
              >
                Huỷ
              </button>
              <button
                type="submit"
                className="arena-btn arena-btn--amber"
                disabled={nominating || loadingCatalog}
              >
                {nominating ? 'Đang gửi…' : 'Gửi đề cử'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
