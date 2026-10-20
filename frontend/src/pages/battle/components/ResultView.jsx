import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Rich } from '../../practice/Rich.jsx';
import { battleApi } from '../battleApi.js';
import { QuestionSolutionDetail } from './RevealPanel.jsx';
import { ResultScoreSummary } from './SpeedPoints.jsx';

const END_REASON_TEXT = {
  host_ended: 'Chủ phòng hoặc thầy cô đã kết thúc sớm ván đấu.',
  emergency: 'Hệ thống tạm dừng khẩn cấp.',
  server_restart: 'Máy chủ khởi động lại giữa ván.',
  all_left: 'Tất cả người chơi khác đã rời phòng.',
};

export default function ResultView({ snapshot, roomId }) {
  const navigate = useNavigate();

  const [expandedIndexes, setExpandedIndexes] = useState({});
  const [busyRetry, setBusyRetry] = useState(false);
  const [retryFeedback, setRetryFeedback] = useState('');
  const [busyRematch, setBusyRematch] = useState(false);
  const [actionError, setActionError] = useState('');

  const questions = useMemo(
    () => (Array.isArray(snapshot?.questions) ? snapshot.questions : []),
    [snapshot?.questions]
  );

  const reviewItems = useMemo(() => {
    const rawReview = Array.isArray(snapshot?.review) ? snapshot.review : [];
    if (rawReview.length > 0) {
      return rawReview
        .map((item) => {
          const idx = typeof item === 'number' ? item : item?.index;
          const q = questions.find((qItem) => Number(qItem.index) === Number(idx));
          return q || (typeof item === 'object' && item.stem ? item : null);
        })
        .filter(Boolean);
    }
    return questions.filter(
      (q) => typeof q.score !== 'number' || q.score < 1 || q.skipped
    );
  }, [snapshot?.review, questions]);

  // Nhóm kết quả các câu trong ván theo Bài (topic_name)
  const groupedByTopic = useMemo(() => {
    const groups = new Map();
    questions.forEach((q) => {
      const topicKey = q.topic_name || 'Kiến thức tổng hợp';
      if (!groups.has(topicKey)) {
        groups.set(topicKey, []);
      }
      groups.get(topicKey).push(q);
    });
    return Array.from(groups.entries());
  }, [questions]);

  if (!snapshot) return null;

  const isInterrupted = snapshot.phase === 'interrupted';
  const askedCount =
    typeof snapshot.asked_count === 'number'
      ? snapshot.asked_count
      : questions.length;

  const podium = Array.isArray(snapshot.podium)
    ? snapshot.podium.slice(0, 3)
    : [];
  const me = snapshot.me || null;
  const badges = snapshot.badges || {};
  const teams = Array.isArray(snapshot.teams) ? snapshot.teams : [];

  const toggleExpand = (qIndex) => {
    setExpandedIndexes((prev) => ({
      ...prev,
      [qIndex]: !prev[qIndex],
    }));
  };

  const handleRetryWrong = async () => {
    if (!roomId || busyRetry) return;
    setBusyRetry(true);
    setRetryFeedback('');
    setActionError('');
    try {
      const attempt = await battleApi.retryWrong(roomId);
      if (attempt?.id) {
        navigate(`/practice/attempts/${encodeURIComponent(attempt.id)}`);
      }
    } catch (err) {
      // Xử lý 409 bằng đúng thông báo của máy chủ (VD: "Em không sai câu nào trong ván này")
      setRetryFeedback(
        err?.message ||
          err?.error ||
          'Không thể tạo lượt luyện lại cho ván đấu này.'
      );
    } finally {
      setBusyRetry(false);
    }
  };

  const handleRematch = async () => {
    if (!roomId || busyRematch) return;
    setBusyRematch(true);
    setActionError('');
    try {
      const newRoom = await battleApi.rematch(roomId);
      if (newRoom?.id) {
        navigate(`/practice/battle/rooms/${encodeURIComponent(newRoom.id)}`);
      }
    } catch (err) {
      setActionError(err?.message || 'Không tạo được phòng đấu lại.');
    } finally {
      setBusyRematch(false);
    }
  };

  const renderQuestionStatusBadge = (q) => {
    if (q.skipped || q.response === undefined || q.response === null) {
      return <span className="arena-chip">— Chưa chốt (0 điểm)</span>;
    }
    const sc = typeof q.score === 'number' ? q.score : 0;
    const pts = Math.round(sc * 100);
    if (sc >= 1) {
      return <span className="arena-chip arena-chip--live">✓ Đúng (+{pts} điểm)</span>;
    }
    if (sc > 0) {
      return (
        <span className="arena-chip arena-chip--amber">
          ◐ Đúng một phần (+{pts} điểm)
        </span>
      );
    }
    return <span className="arena-chip arena-chip--danger">✕ Chưa đúng (0 điểm)</span>;
  };

  const renderExpandableQuestion = (q) => {
    const qIdx = q.index ?? 0;
    const isOpen = Boolean(expandedIndexes[qIdx]);

    return (
      <div key={qIdx} className="arena-review-item">
        <button
          type="button"
          className="arena-review-item__header"
          aria-expanded={isOpen}
          onClick={() => toggleExpand(qIdx)}
        >
          <div className="arena-review-item__title-wrap">
            <span className="arena-chip arena-chip--accent arena-mono">
              Câu {qIdx + 1}
            </span>
            {q.topic_name && (
              <span className="arena-review-item__topic">{q.topic_name}</span>
            )}
          </div>
          <div className="arena-row" style={{ gap: '8px' }}>
            {renderQuestionStatusBadge(q)}
            <span className="arena-review-item__chevron" aria-hidden="true">
              {isOpen ? '▲ Thu gọn' : '▼ Xem chi tiết'}
            </span>
          </div>
        </button>

        {isOpen && (
          <div className="arena-review-item__body">
            <div className="arena-question-stem" style={{ marginBottom: '12px' }}>
              <Rich text={q.stem || ''} />
            </div>

            <QuestionSolutionDetail
              question={q}
              myResponse={q.response}
              mySkipped={q.skipped}
            />

            <div className="arena-review-explanation">
              <strong>💡 Lời giải: </strong>
              {q.explanation && String(q.explanation).trim() ? (
                <Rich text={q.explanation} />
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
    <div className="arena-result-view">
      {/* Dải thông báo nếu ván đấu bị gián đoạn */}
      {isInterrupted && (
        <div className="arena-alert arena-alert--warn" role="alert">
          <div>
            <strong>Ván bị gián đoạn ở câu {askedCount}</strong>
            <div style={{ fontSize: '0.88rem', marginTop: '2px' }}>
              {END_REASON_TEXT[snapshot.end_reason] ||
                snapshot.end_reason ||
                'Kết quả được tính dựa trên các câu đã hoàn thành.'}
            </div>
          </div>
        </div>
      )}

      {actionError && (
        <div className="arena-alert arena-alert--error" role="alert">
          <span>{actionError}</span>
        </div>
      )}

      {me && (snapshot.scoring === 'speed' || snapshot.pacing === 'self') && (
        <ResultScoreSummary me={me} scoring={snapshot.scoring} />
      )}

      {/* (1) KHỐI 1: CÂU EM CẦN XEM LẠI + NÚT CHÍNH LUYỆN LẠI CÁC CÂU VỪA SAI */}
      <section className="arena-card arena-result-section">
        <div className="arena-finish-strip" style={{ marginBottom: '14px' }} aria-hidden="true" />
        <div className="arena-row arena-row--between" style={{ marginBottom: '12px' }}>
          <div>
            <h1 className="arena-title-lg">Câu em cần xem lại</h1>
            <p className="arena-subtitle">
              Đúng là chính — ôn lại ngay lúc vừa làm xong giúp em nhớ bài lâu nhất.
            </p>
          </div>
          <span className="arena-chip arena-chip--warn arena-mono">
            {reviewItems.length} câu cần ôn
          </span>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <button
            type="button"
            className="arena-btn arena-btn--amber arena-btn--lg arena-btn--block"
            onClick={handleRetryWrong}
            disabled={busyRetry}
          >
            {busyRetry
              ? 'Đang tạo lượt luyện tập…'
              : '🎯 Luyện lại các câu em vừa sai'}
          </button>
        </div>

        {retryFeedback && (
          <div className="arena-alert arena-alert--info" role="status" aria-live="polite">
            <span>{retryFeedback}</span>
          </div>
        )}

        {reviewItems.length === 0 ? (
          <div className="arena-alert arena-alert--ok" style={{ marginBottom: 0 }}>
            <span>🎉 Xuất sắc! Em đã trả lời đúng toàn bộ các câu hỏi trong ván này.</span>
          </div>
        ) : (
          <div className="arena-review-list">
            {reviewItems.map(renderExpandableQuestion)}
          </div>
        )}
      </section>

      {/* (2) KHỐI 2: KẾT QUẢ CÁC CÂU TRONG VÁN THEO BÀI */}
      <section className="arena-card arena-result-section" style={{ marginTop: '16px' }}>
        <h2 className="arena-title-md" style={{ marginBottom: '12px' }}>
          Kết quả các câu trong ván theo Bài ({questions.length} câu)
        </h2>

        {groupedByTopic.length === 0 ? (
          <p className="arena-empty-hint">Chưa có câu hỏi nào được phát trong ván này.</p>
        ) : (
          <div className="arena-topic-groups">
            {groupedByTopic.map(([topicName, topicQuestions]) => {
              const correctInTopic = topicQuestions.filter(
                (q) => typeof q.score === 'number' && q.score >= 1
              ).length;

              return (
                <div key={topicName} className="arena-topic-group">
                  <div className="arena-topic-group__header">
                    <h3 className="arena-topic-group__title">{topicName}</h3>
                    <span className="arena-chip arena-mono">
                      Đúng {correctInTopic}/{topicQuestions.length} câu
                    </span>
                  </div>
                  <div className="arena-review-list">
                    {topicQuestions.map(renderExpandableQuestion)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* (3) KHỐI 3: PODIUM TỐI ĐA 3 THẺ + THỨ HẠNG CỦA EM (KHÔNG CÓ BẢNG XẾP HẠNG ĐẦY ĐỦ) */}
      <section className="arena-card arena-card--dark arena-result-section" style={{ marginTop: '16px' }}>
        <div className="arena-row arena-row--between" style={{ marginBottom: '14px' }}>
          <h2 className="arena-title-md" style={{ color: '#FFFFFF' }}>
            🏆 Bục vinh danh ván đấu
          </h2>
          {me && typeof me.rank === 'number' && (
            <span className="arena-chip arena-chip--amber arena-mono">
              Em hạng {me.rank}/{me.total || podium.length}
              {typeof me.points === 'number' ? ` · ${me.points} điểm` : ''}
            </span>
          )}
        </div>

        {/* Nếu là phòng Đấu đội, hiển thị thêm tổng kết 2 đội */}
        {teams.length > 0 && (
          <div className="arena-grid-2" style={{ marginBottom: '16px' }}>
            {teams.map((t, idx) => {
              const teamNo = t.team ?? t.id ?? idx + 1;
              return (
                <div
                  key={teamNo}
                  className="arena-podium-team-card"
                >
                  <span style={{ fontWeight: 700 }}>Đội {teamNo}</span>
                  <strong className="arena-mono" style={{ color: 'var(--arena-amber)' }}>
                    {t.points ?? 0} điểm
                  </strong>
                </div>
              );
            })}
          </div>
        )}

        {podium.length > 0 ? (
          <div className="arena-podium-grid">
            {podium.map((p, idx) => {
              const rankNum = p.rank ?? idx + 1;
              return (
                <div
                  key={p.id || idx}
                  className={`arena-podium-card arena-podium-card--rank-${rankNum}`}
                >
                  <div className="arena-podium-card__medal arena-mono">
                    Hạng {rankNum}
                  </div>
                  <div className="arena-podium-card__name">{p.name}</div>
                  {p.class_name && (
                    <div className="arena-podium-card__class">
                      Lớp {p.class_name}
                    </div>
                  )}
                  <div className="arena-podium-card__points arena-mono">
                    {p.points ?? 0} điểm
                  </div>
                  {typeof p.correct === 'number' && (
                    <div className="arena-podium-card__sub">
                      Đúng {p.correct} câu
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="arena-subtitle" style={{ margin: 0 }}>
            Đã ghi nhận kết quả ván đấu của em.
          </p>
        )}
      </section>

      {/* (4) KHỐI 4: HUY HIỆU CỦA EM */}
      {(badges.accurate || badges.quick_and_sure) && (
        <section className="arena-card arena-result-section" style={{ marginTop: '16px' }}>
          <h2 className="arena-title-md" style={{ marginBottom: '12px' }}>
            🎖️ Huy hiệu của em trong ván này
          </h2>
          <div className="arena-badges-row">
            {badges.accurate && (
              <div className="arena-badge-card">
                <span className="arena-badge-card__icon" aria-hidden="true">🎯</span>
                <div>
                  <div className="arena-badge-card__title">Chính xác nhất</div>
                  <div className="arena-subtitle">
                    Tỉ lệ trả lời đúng cao và cẩn thận trong từng câu hỏi.
                  </div>
                </div>
              </div>
            )}
            {badges.quick_and_sure && (
              <div className="arena-badge-card">
                <span className="arena-badge-card__icon" aria-hidden="true">⚡</span>
                <div>
                  <div className="arena-badge-card__title">Nhanh mà chắc</div>
                  <div className="arena-subtitle">
                    Chốt đáp án vững vàng và chính xác ngay từ lượt đầu.
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* (5) KHỐI 5: ĐẤU VÁN NỮA · VỀ SẢNH + GHI CHÚ ĐIỂM THÀNH THẠO */}
      <section className="arena-result-actions" style={{ marginTop: '18px' }}>
        <div className="arena-result-actions__buttons">
          <button
            type="button"
            className="arena-btn arena-btn--primary arena-btn--lg"
            onClick={handleRematch}
            disabled={busyRematch}
          >
            {busyRematch ? 'Đang tạo phòng…' : '🔄 Đấu ván nữa'}
          </button>
          <Link
            to="/practice/battle"
            className="arena-btn arena-btn--secondary arena-btn--lg"
          >
            Về sảnh
          </Link>
        </div>

        <p className="arena-mastery-note">
          Kết quả ván đấu không ảnh hưởng điểm thành thạo.
        </p>
      </section>
    </div>
  );
}
