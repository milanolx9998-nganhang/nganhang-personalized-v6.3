import React, { useState } from 'react';
import { Rich } from '../../practice/Rich.jsx';
import { battleApi } from '../battleApi.js';

const MC_SHAPES = { A: '▲', B: '●', C: '■', D: '◆' };

function getVerdictMeta(myAnswer) {
  const hasAnswered =
    myAnswer &&
    myAnswer.received &&
    !myAnswer.skipped &&
    myAnswer.response !== undefined &&
    myAnswer.response !== null;

  if (!hasAnswered) {
    return {
      statusClass: 'arena-verdict--unanswered',
      badgeIcon: '—',
      title: 'Em chưa chốt — câu này không tính',
      points: 0,
    };
  }

  const score = typeof myAnswer.score === 'number' ? myAnswer.score : 0;
  const earnedPoints = Math.round(score * 100);

  if (score >= 1) {
    return {
      statusClass: 'arena-verdict--correct',
      badgeIcon: '✓',
      title: 'Đúng',
      points: earnedPoints,
    };
  }
  if (score > 0 && score < 1) {
    return {
      statusClass: 'arena-verdict--partial',
      badgeIcon: '◐',
      title: 'Đúng một phần',
      points: earnedPoints,
    };
  }
  return {
    statusClass: 'arena-verdict--wrong',
    badgeIcon: '✕',
    title: 'Chưa đúng',
    points: 0,
  };
}

/**
 * Hiển thị đáp án đúng và bài làm của học sinh cho cả 4 loại câu hỏi.
 */
export function QuestionSolutionDetail({ question, myResponse, mySkipped, hideMine = false }) {
  if (!question) return null;
  // Máy chủ gửi đáp án theo dạng {correct} / {values} / {pairs} / {numeric, aliases, unit}.
  const raw = question.answer;
  const correctAnswer =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? question.type === 'multiple_choice'
        ? raw.correct
        : question.type === 'true_false'
        ? raw.values
        : question.type === 'matching'
        ? raw.pairs
        : raw.numeric !== undefined
        ? String(raw.numeric).replace('.', ',')
        : Array.isArray(raw.aliases) && raw.aliases.length
        ? raw.aliases
        : null
      : raw;

  // 1. Trắc nghiệm 4 lựa chọn
  if (question.type === 'multiple_choice') {
    const options = Array.isArray(question.options) ? question.options : [];
    const letters = ['A', 'B', 'C', 'D'];
    const myChoice = !mySkipped && myResponse ? String(myResponse) : null;
    const correctChoice =
      correctAnswer !== undefined && correctAnswer !== null
        ? String(correctAnswer)
        : null;

    return (
      <div className="arena-options-grid">
        {options.map((opt, idx) => {
          const letter = letters[idx] || String(opt.id || idx + 1);
          const optId = String(opt.id ?? letter);
          const shape = MC_SHAPES[letter] || '●';
          const isCorrect = correctChoice === optId;
          const isMine = myChoice === optId;

          let stateClass = '';
          if (isCorrect) stateClass = 'arena-option-btn--correct';
          else if (isMine && !isCorrect) stateClass = 'arena-option-btn--wrong';

          return (
            <div
              key={optId}
              className={`arena-option-btn arena-option-btn--${letter} ${stateClass}`}
            >
              <span className="arena-option-badge" aria-hidden="true">
                <span>{letter}</span>
                <span>{shape}</span>
              </span>
              <div className="arena-option-content">
                <Rich text={opt.text || opt.label || ''} />
              </div>
              <div className="arena-reveal-opt-tags">
                {isCorrect && (
                  <span className="arena-chip arena-chip--live">✓ Đáp án đúng</span>
                )}
                {isMine && !isCorrect && (
                  <span className="arena-chip arena-chip--danger">✕ Em chọn</span>
                )}
                {isMine && isCorrect && (
                  <span className="arena-chip arena-chip--accent">Em chọn</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // 2. Đúng / Sai nhiều ý
  if (question.type === 'true_false') {
    const statements = Array.isArray(question.statements) ? question.statements : [];
    const ansMap =
      correctAnswer && typeof correctAnswer === 'object' ? correctAnswer : {};
    const myMap =
      !mySkipped && myResponse && typeof myResponse === 'object' ? myResponse : {};

    return (
      <div className="arena-tf-list">
        {statements.map((st, idx) => {
          const stId = String(st.id ?? String.fromCharCode(97 + idx));
          const rightVal = ansMap[stId];
          const myVal = myMap[stId];
          const isMatch = typeof myVal === 'boolean' && myVal === rightVal;

          return (
            <div key={stId} className="arena-tf-row">
              <div className="arena-tf-row__statement">
                <span className="arena-tf-row__index arena-mono">
                  {st.label || `${stId})`}
                </span>
                <div className="arena-tf-row__text">
                  <Rich text={st.text || st.stem || ''} />
                </div>
              </div>
              <div className="arena-row" style={{ gap: '8px' }}>
                <span className="arena-chip arena-chip--live">
                  Đáp án: {rightVal ? 'Đúng' : 'Sai'}
                </span>
                {!hideMine && (<span
                  className={`arena-chip ${
                    typeof myVal !== 'boolean'
                      ? ''
                      : isMatch
                      ? 'arena-chip--accent'
                      : 'arena-chip--danger'
                  }`}
                >
                  {typeof myVal !== 'boolean'
                    ? 'Em bỏ trống'
                    : `Em chọn: ${myVal ? 'Đúng' : 'Sai'} ${isMatch ? '✓' : '✕'}`}
                </span>)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // 3. Trả lời ngắn
  if (question.type === 'short_answer') {
    const unit = question.unit ? ` ${question.unit}` : '';
    const formatShort = (val) => {
      if (val === null || val === undefined || val === '') return 'Chưa trả lời';
      if (Array.isArray(val)) return val.join(' hoặc ') + unit;
      if (typeof val === 'object') {
        return `${val.value ?? ''}${val.unit ? ` ${val.unit}` : unit}`;
      }
      return `${val}${unit}`;
    };

    return (
      <div className="arena-grid-2">
        {!hideMine && (<div className="arena-card arena-card--subtle">
          <span className="arena-field-label">Câu trả lời của em</span>
          <p className="arena-mono" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
            {mySkipped ? 'Đã bỏ qua' : formatShort(myResponse)}
          </p>
        </div>)}
        <div className="arena-card" style={{ borderColor: 'var(--ok, #256D43)', backgroundColor: '#E6F4EC' }}>
          <span className="arena-field-label" style={{ color: 'var(--ok, #256D43)' }}>
            ✓ Đáp án đúng
          </span>
          <p
            className="arena-mono"
            style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--ok, #256D43)' }}
          >
            {formatShort(correctAnswer)}
          </p>
        </div>
      </div>
    );
  }

  // 4. Ghép đôi
  if (question.type === 'matching') {
    const leftItems = Array.isArray(question.left) ? question.left : [];
    const rightItems = Array.isArray(question.right) ? question.right : [];
    const ansMap =
      correctAnswer && typeof correctAnswer === 'object' ? correctAnswer : {};
    const myMap =
      !mySkipped && myResponse && typeof myResponse === 'object' ? myResponse : {};

    const findRightText = (rid) => {
      if (!rid) return null;
      const found = rightItems.find((r) => String(r.id) === String(rid));
      return found ? found.text || String(rid) : String(rid);
    };

    return (
      <div className="arena-tf-list">
        {leftItems.map((lItem, idx) => {
          const lid = String(lItem.id ?? idx + 1);
          const correctRid = ansMap[lid];
          const myRid = myMap[lid];
          const isCorrectPair =
            myRid !== undefined && String(myRid) === String(correctRid);

          return (
            <div key={lid} className="arena-card arena-card--subtle">
              <div style={{ fontWeight: 700, marginBottom: '8px' }}>
                <span className="arena-mono">{lItem.label || `${idx + 1}.`} </span>
                <Rich text={lItem.text || ''} />
              </div>
              <div className="arena-row" style={{ gap: '8px' }}>
                <span className="arena-chip arena-chip--live">
                  ✓ Đáp án ghép với: {correctRid} ({findRightText(correctRid)})
                </span>
                {!hideMine && (<span
                  className={`arena-chip ${
                    !myRid
                      ? ''
                      : isCorrectPair
                      ? 'arena-chip--accent'
                      : 'arena-chip--danger'
                  }`}
                >
                  {!myRid
                    ? 'Em chưa ghép'
                    : `Em ghép: ${myRid} ${isCorrectPair ? '✓' : '✕'}`}
                </span>)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}

export default function RevealPanel({
  snapshot,
  roomId,
  isTeacher = false,
  onError,
}) {
  const [busyNext, setBusyNext] = useState(false);

  if (!snapshot) return null;

  const question = snapshot.question;
  const myAnswer = snapshot.my_answer;
  const distribution = snapshot.distribution || {};
  const isClassRoom = snapshot.kind === 'class';

  const verdict = getVerdictMeta(myAnswer);
  const explanationText =
    question?.explanation && String(question.explanation).trim()
      ? String(question.explanation)
      : '';

  const handleNext = async () => {
    if (!roomId || busyNext) return;
    setBusyNext(true);
    try {
      await battleApi.nextQuestion(roomId);
    } catch (err) {
      if (typeof onError === 'function') {
        onError(err?.message || 'Chưa thể chuyển sang câu tiếp theo.');
      }
      setBusyNext(false);
    }
  };

  // Chuẩn bị dữ liệu biểu đồ "Cả phòng chọn gì"
  const renderDistribution = () => {
    if (!question) return null;

    if (question.type === 'multiple_choice') {
      const options = Array.isArray(question.options) ? question.options : [];
      const letters = ['A', 'B', 'C', 'D'];
      const counts = options.map((opt, idx) => {
        const key = String(opt.id ?? letters[idx]);
        const c = Number(
          distribution.choices?.[key] ??
            distribution[key] ??
            distribution.options?.[key] ??
            distribution.counts?.[key] ??
            0
        );
        return { key, letter: letters[idx] || key, count: c };
      });
      const total = Math.max(
        1,
        counts.reduce((acc, item) => acc + item.count, 0)
      );
      const correctId =
        question.answer !== undefined && question.answer !== null
          ? String(question.answer?.correct ?? question.answer)
          : null;

      return (
        <div className="arena-dist-list">
          {counts.map((item) => {
            const pct = Math.round((item.count / total) * 100);
            const isRight = correctId === item.key;
            return (
              <div key={item.key} className="arena-dist-row">
                <span className="arena-dist-row__label arena-mono">
                  {item.letter} {MC_SHAPES[item.letter] || ''}
                  {isRight ? ' ✓' : ''}
                </span>
                <div className="arena-dist-row__track">
                  <div
                    className={`arena-dist-row__fill ${
                      isRight ? 'arena-dist-row__fill--correct' : ''
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="arena-dist-row__value arena-mono">
                  {item.count} bạn ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      );
    }

    // Các loại câu khác: đúng / một phần / chưa đúng / bỏ trống
    const buckets = [
      {
        key: 'correct',
        label: '✓ Đúng hoàn toàn',
        count: Number(distribution.correct ?? distribution.full ?? 0),
        correct: true,
      },
      {
        key: 'partial',
        label: '◐ Đúng một phần',
        count: Number(distribution.partial ?? 0),
        correct: false,
      },
      {
        key: 'wrong',
        label: '✕ Chưa đúng',
        count: Number(distribution.wrong ?? distribution.incorrect ?? 0),
        correct: false,
      },
      {
        key: 'empty',
        label: '— Bỏ trống / Chưa chốt',
        count: Number(
          distribution.blank ??
            distribution.empty ??
            distribution.unanswered ??
            distribution.skipped ??
            0
        ),
        correct: false,
      },
    ];

    const total = Math.max(
      1,
      buckets.reduce((acc, b) => acc + b.count, 0)
    );

    return (
      <div className="arena-dist-list">
        {buckets.map((b) => {
          const pct = Math.round((b.count / total) * 100);
          return (
            <div key={b.key} className="arena-dist-row">
              <span className="arena-dist-row__label">{b.label}</span>
              <div className="arena-dist-row__track">
                <div
                  className={`arena-dist-row__fill ${
                    b.correct ? 'arena-dist-row__fill--correct' : ''
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="arena-dist-row__value arena-mono">
                {b.count} bạn ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="arena-reveal-wrap">
      {/* Thẻ kết quả câu vừa làm của học sinh */}
      {!isTeacher && (
        <section
          className={`arena-card arena-verdict-banner ${verdict.statusClass}`}
          role="status"
          aria-live="polite"
        >
          <div className="arena-verdict-banner__left">
            <span className="arena-verdict-banner__icon" aria-hidden="true">
              {verdict.badgeIcon}
            </span>
            <div>
              <h2 className="arena-title-md">{verdict.title}</h2>
              <span className="arena-subtitle">
                Câu {(question?.index ?? 0) + 1}/
                {question?.total || snapshot.question_count || 7}
                {question?.topic_name ? ` · ${question.topic_name}` : ''}
              </span>
            </div>
          </div>

          <div className="arena-verdict-banner__points arena-mono">
            +{verdict.points} điểm
          </div>
        </section>
      )}

      {/* Đề bài & Chi tiết đáp án đúng */}
      {question && (
        <section className="arena-card" style={{ marginTop: '14px' }}>
          <div className="arena-question-stem" style={{ marginBottom: '14px' }}>
            <Rich text={question.stem || ''} />
          </div>

          <QuestionSolutionDetail
            question={question}
            myResponse={myAnswer?.response}
            mySkipped={myAnswer?.skipped}
          />
        </section>
      )}

      {/* Khối Lời giải chi tiết */}
      <section className="arena-card arena-explanation-card" style={{ marginTop: '14px' }}>
        <h3 className="arena-title-md" style={{ marginBottom: '8px' }}>
          💡 Lời giải & Ghi nhớ kiến thức
        </h3>
        {explanationText ? (
          <div className="arena-explanation-body">
            <Rich text={explanationText} />
          </div>
        ) : (
          <p className="arena-subtitle" style={{ margin: 0 }}>
            Câu này chưa có lời giải
          </p>
        )}
      </section>

      {/* Biểu đồ Cả phòng chọn gì */}
      <section className="arena-card" style={{ marginTop: '14px' }}>
        <h3 className="arena-title-md" style={{ marginBottom: '12px' }}>
          📊 Cả phòng chọn gì
        </h3>
        {renderDistribution()}
      </section>

      {/* Nút chuyển câu tiếp theo */}
      <section className="arena-reveal-footer" style={{ marginTop: '18px' }}>
        {!isClassRoom || isTeacher ? (
          <button
            type="button"
            className="arena-btn arena-btn--amber arena-btn--lg arena-btn--block"
            onClick={handleNext}
            disabled={busyNext}
          >
            {busyNext ? 'Đang chuyển câu…' : 'Câu tiếp →'}
          </button>
        ) : (
          <div className="arena-card arena-card--subtle" style={{ textAlign: 'center' }} role="status">
            <div className="arena-waiting-host-note" style={{ justifyContent: 'center' }}>
              <span className="arena-pulse-dot" aria-hidden="true" />
              <span>Chờ thầy cô chuyển câu</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
