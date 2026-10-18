import React, { useState, useEffect, useMemo } from 'react';
import { Rich } from '../../practice/Rich.jsx';

const MC_SHAPES = {
  A: '▲',
  B: '●',
  C: '■',
  D: '◆',
};

const MC_COLOR_CLASSES = {
  A: 'arena-option-btn--A',
  B: 'arena-option-btn--B',
  C: 'arena-option-btn--C',
  D: 'arena-option-btn--D',
};

function isEditableElementFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName ? el.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  return false;
}

export default function AnswerInput({
  question,
  value,
  onChange,
  disabled = false,
  onSubmit,
}) {
  const [activeLeftId, setActiveLeftId] = useState(null);

  // Reset ý đang chọn của câu ghép đôi khi đổi câu hỏi
  useEffect(() => {
    setActiveLeftId(null);
  }, [question?.index]);

  // Hỗ trợ bàn phím A/B/C/D để chọn và Enter để Chốt cho câu trắc nghiệm
  useEffect(() => {
    if (!question || question.type !== 'multiple_choice' || disabled) {
      return undefined;
    }

    const options = Array.isArray(question.options) ? question.options : [];

    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (isEditableElementFocused()) return;

      const keyUpper = e.key ? e.key.toUpperCase() : '';
      if (['A', 'B', 'C', 'D'].includes(keyUpper)) {
        const matched = options.find(
          (opt, idx) =>
            String(opt.id || ['A', 'B', 'C', 'D'][idx]).toUpperCase() === keyUpper
        );
        if (matched) {
          e.preventDefault();
          const optId = String(matched.id ?? keyUpper);
          onChange(optId);
        }
      } else if (e.key === 'Enter' && value) {
        // Nếu người dùng đang focus vào một nút khác (VD nút Bỏ qua), không cướp phím Enter
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        const isActionBtn =
          activeTag === 'button' &&
          !document.activeElement.classList.contains('arena-option-btn');
        if (!isActionBtn && typeof onSubmit === 'function') {
          e.preventDefault();
          onSubmit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [question, disabled, value, onChange, onSubmit]);

  const pairOrderMap = useMemo(() => {
    if (question?.type !== 'matching' || !value || typeof value !== 'object') {
      return {};
    }
    const leftList = Array.isArray(question.left) ? question.left : [];
    const map = {};
    let num = 1;
    leftList.forEach((item) => {
      const lid = String(item.id);
      if (value[lid] !== undefined && value[lid] !== null) {
        map[lid] = num;
        num += 1;
      }
    });
    return map;
  }, [question, value]);

  if (!question) return null;

  // 1. TRẮC NGHIỆM 4 LỰA CHỌN (multiple_choice)
  if (question.type === 'multiple_choice') {
    const options = Array.isArray(question.options) ? question.options : [];
    const letters = ['A', 'B', 'C', 'D'];

    return (
      <div
        className="arena-options-grid"
        role="radiogroup"
        aria-label="Các phương án trả lời"
      >
        {options.map((opt, idx) => {
          const letter = letters[idx] || String(opt.id || idx + 1);
          const optId = String(opt.id ?? letter);
          const shape = MC_SHAPES[letter] || '●';
          const colorClass = MC_COLOR_CLASSES[letter] || 'arena-option-btn--A';
          const isSelected = String(value ?? '') === optId;

          return (
            <button
              key={optId}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`arena-option-btn ${colorClass} ${
                isSelected ? 'arena-option-btn--selected' : ''
              }`}
              disabled={disabled}
              onClick={() => onChange(optId)}
            >
              <span className="arena-option-badge" aria-hidden="true">
                <span>{letter}</span>
                <span>{shape}</span>
              </span>

              <div className="arena-option-content">
                <Rich text={opt.text || opt.label || ''} />
              </div>

              {isSelected && (
                <span className="arena-option-tag">
                  {disabled ? 'Đã chốt' : 'Đang chọn'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // 2. ĐÚNG / SAI NHIỀU Ý (true_false)
  if (question.type === 'true_false') {
    const statements = Array.isArray(question.statements)
      ? question.statements
      : [];
    const currentMap = value && typeof value === 'object' ? value : {};

    const handleToggleStatement = (stId, boolVal) => {
      if (disabled) return;
      onChange({
        ...currentMap,
        [stId]: boolVal,
      });
    };

    return (
      <div className="arena-tf-list" role="group" aria-label="Chọn Đúng hoặc Sai cho từng phát biểu">
        {statements.map((st, idx) => {
          const stId = String(st.id ?? String.fromCharCode(97 + idx));
          const chosen = currentMap[stId];

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

              <div className="arena-tf-row__buttons">
                <button
                  type="button"
                  aria-pressed={chosen === true}
                  className={`arena-btn arena-tf-btn ${
                    chosen === true ? 'arena-tf-btn--true-active' : 'arena-btn--secondary'
                  }`}
                  disabled={disabled}
                  onClick={() => handleToggleStatement(stId, true)}
                >
                  ✓ Đúng
                </button>
                <button
                  type="button"
                  aria-pressed={chosen === false}
                  className={`arena-btn arena-tf-btn ${
                    chosen === false ? 'arena-tf-btn--false-active' : 'arena-btn--secondary'
                  }`}
                  disabled={disabled}
                  onClick={() => handleToggleStatement(stId, false)}
                >
                  ✕ Sai
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // 3. TRẢ LỜI NGẮN (short_answer)
  if (question.type === 'short_answer') {
    const unit = question.unit ? String(question.unit).trim() : '';
    const isNumericHint = Boolean(
      unit || question.numeric || question.input_mode === 'decimal'
    );

    const rawText =
      value && typeof value === 'object'
        ? String(value.value ?? '')
        : String(value ?? '');

    const handleTextChange = (e) => {
      const nextVal = e.target.value;
      if (unit) {
        onChange({ value: nextVal, unit });
      } else {
        onChange(nextVal);
      }
    };

    const handleInputKeyDown = (e) => {
      if (e.key === 'Enter' && rawText.trim() && typeof onSubmit === 'function') {
        e.preventDefault();
        onSubmit();
      }
    };

    return (
      <div className="arena-card arena-short-answer-card">
        <label htmlFor="arena-short-answer-input" className="arena-field-label">
          Nhập đáp án của em {isNumericHint ? '(có thể dùng dấu phẩy thập phân, VD: 12,5)' : ''}
        </label>
        <div className="arena-short-answer-box">
          <input
            id="arena-short-answer-input"
            type="text"
            inputMode={isNumericHint ? 'decimal' : 'text'}
            className="arena-input arena-short-answer-input arena-mono"
            placeholder="Nhập câu trả lời…"
            value={rawText}
            onChange={handleTextChange}
            onKeyDown={handleInputKeyDown}
            disabled={disabled}
            autoComplete="off"
          />
          {unit && (
            <span className="arena-short-answer-unit arena-mono" aria-label={`Đơn vị ${unit}`}>
              {unit}
            </span>
          )}
        </div>
      </div>
    );
  }

  // 4. GHÉP ĐÔI (matching)
  if (question.type === 'matching') {
    const leftItems = Array.isArray(question.left) ? question.left : [];
    const rightItems = Array.isArray(question.right) ? question.right : [];
    const pairings = value && typeof value === 'object' ? value : {};

    // Tìm xem một ý bên phải đang được ghép với ý bên trái nào
    const findLinkedLeftId = (rightId) => {
      const rStr = String(rightId);
      return (
        Object.keys(pairings).find((lid) => String(pairings[lid]) === rStr) ||
        null
      );
    };

    const handleSelectLeft = (leftId) => {
      if (disabled) return;
      const lid = String(leftId);
      // Nếu ý trái đã ghép và đang không chọn ý trái khác => chạm lại để huỷ cặp
      if (pairings[lid] !== undefined && activeLeftId !== lid) {
        const next = { ...pairings };
        delete next[lid];
        onChange(next);
        setActiveLeftId(null);
        return;
      }
      setActiveLeftId((prev) => (prev === lid ? null : lid));
    };

    const handleSelectRight = (rightId) => {
      if (disabled) return;
      const rid = String(rightId);
      const existingLeft = findLinkedLeftId(rid);

      // Nếu đang chọn một ý trái -> ghép ý trái đó với ý phải này
      if (activeLeftId) {
        const next = { ...pairings };
        if (existingLeft && existingLeft !== activeLeftId) {
          delete next[existingLeft];
        }
        next[activeLeftId] = rid;
        onChange(next);
        setActiveLeftId(null);
        return;
      }

      // Nếu chưa chọn ý trái mà chạm vào ý phải đã ghép -> huỷ cặp đó
      if (existingLeft) {
        const next = { ...pairings };
        delete next[existingLeft];
        onChange(next);
      }
    };

    return (
      <div className="arena-matching-wrap">
        <p className="arena-matching-instruction">
          Chạm một ý ở <strong>Cột A</strong> rồi chạm ý tương ứng ở <strong>Cột B</strong> để ghép cặp (chạm lại cặp đã ghép để huỷ).
        </p>

        <div className="arena-matching-grid">
          {/* Cột Trái */}
          <div className="arena-matching-col" role="group" aria-label="Cột A">
            <h4 className="arena-matching-col__title">Cột A</h4>
            {leftItems.map((item, idx) => {
              const lid = String(item.id ?? idx + 1);
              const pairedRightId = pairings[lid];
              const pairNum = pairOrderMap[lid];
              const isSelecting = activeLeftId === lid;
              const isPaired = pairedRightId !== undefined;

              const ariaDesc = isPaired
                ? `Ý ${idx + 1} cột A, đang ghép cặp số ${pairNum} với ý ${pairedRightId} cột B. Bấm để huỷ cặp.`
                : isSelecting
                ? `Ý ${idx + 1} cột A, đang chọn để ghép.`
                : `Ý ${idx + 1} cột A, chưa ghép.`;

              return (
                <button
                  key={lid}
                  type="button"
                  aria-label={ariaDesc}
                  aria-pressed={isSelecting || isPaired}
                  className={`arena-match-item ${
                    isSelecting ? 'arena-match-item--selecting' : ''
                  } ${isPaired ? 'arena-match-item--paired' : ''}`}
                  disabled={disabled}
                  onClick={() => handleSelectLeft(lid)}
                >
                  <span className="arena-match-item__index arena-mono">
                    {item.label || `${idx + 1}.`}
                  </span>
                  <div className="arena-match-item__content">
                    <Rich text={item.text || ''} />
                  </div>
                  {isPaired && (
                    <span className="arena-match-pair-badge arena-mono">
                      Cặp #{pairNum}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Cột Phải */}
          <div className="arena-matching-col" role="group" aria-label="Cột B">
            <h4 className="arena-matching-col__title">Cột B</h4>
            {rightItems.map((item, idx) => {
              const rid = String(item.id ?? String.fromCharCode(65 + idx));
              const linkedLeftId = findLinkedLeftId(rid);
              const pairNum = linkedLeftId ? pairOrderMap[linkedLeftId] : null;
              const isPaired = Boolean(linkedLeftId);

              const ariaDesc = isPaired
                ? `Ý ${rid} cột B, đang ghép cặp số ${pairNum} với ý ${linkedLeftId} cột A. Bấm để huỷ hoặc đổi cặp.`
                : activeLeftId
                ? `Ý ${rid} cột B, bấm để ghép với ý đang chọn ở cột A.`
                : `Ý ${rid} cột B, chưa ghép.`;

              return (
                <button
                  key={rid}
                  type="button"
                  aria-label={ariaDesc}
                  aria-pressed={isPaired}
                  className={`arena-match-item ${
                    isPaired ? 'arena-match-item--paired' : ''
                  } ${activeLeftId && !isPaired ? 'arena-match-item--target' : ''}`}
                  disabled={disabled}
                  onClick={() => handleSelectRight(rid)}
                >
                  <span className="arena-match-item__index arena-mono">
                    {item.label || `${rid}.`}
                  </span>
                  <div className="arena-match-item__content">
                    <Rich text={item.text || ''} />
                  </div>
                  {isPaired && (
                    <span className="arena-match-pair-badge arena-mono">
                      Cặp #{pairNum}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
