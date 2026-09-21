import { useState, useMemo } from 'react';
import MathText from './MathText.jsx';

const QTYPE_LABEL = {
  mcq4: 'TN 4 lựa chọn',
  true_false: 'Đúng-Sai',
  short: 'Trả lời ngắn',
  essay: 'Tự luận',
};

export default function ImportPreviewModal({ preview, file, onClose, onImport }) {
  const [tab, setTab] = useState('all');
  const [resolutions, setResolutions] = useState({});
  const [importing, setImporting] = useState(false);

  const resolved = useMemo(() =>
    preview.rows.filter(r => r.topicMatch.status === 'resolved'), [preview]);
  const needsRes = useMemo(() =>
    preview.rows.filter(r => r.topicMatch.status === 'needs_resolution'), [preview]);
  const noTopics = useMemo(() =>
    preview.rows.filter(r => r.topicMatch.status === 'no_topics' || r.topicMatch.status === 'no_subject'), [preview]);
  const duplicates = useMemo(() =>
    preview.rows.filter(r => r.isDuplicate), [preview]);

  const setResolution = (rowNum, resolution) => {
    setResolutions(prev => ({ ...prev, [rowNum]: resolution }));
  };

  // Áp dụng 1 lựa chọn cho tất cả dòng cùng chủ đề lớn
  const applyToAllSameChapter = (rowNum, resolution) => {
    const row = needsRes.find(r => r.rowNum === rowNum);
    if (!row) return;
    const updates = {};
    for (const r of needsRes) {
      if (r.mainTopic === row.mainTopic && r.subTopic === row.subTopic) {
        updates[r.rowNum] = resolution;
      }
    }
    setResolutions(prev => ({ ...prev, ...updates }));
  };

  const allNeedsResResolved = needsRes.every(r => resolutions[r.rowNum]);

  const handleImport = async () => {
    setImporting(true);
    try {
      await onImport(resolutions);
    } finally {
      setImporting(false);
    }
  };

  // Gom nhóm các dòng cần resolution theo chủ đề lớn + chủ đề con
  const groupedNeedsRes = useMemo(() => {
    const groups = {};
    for (const r of needsRes) {
      const key = `${r.mainTopic}|||${r.subTopic}`;
      if (!groups[key]) {
        groups[key] = { mainTopic: r.mainTopic, subTopic: r.subTopic, rows: [], candidates: r.topicMatch.candidates || [] };
      }
      groups[key].rows.push(r);
    }
    return Object.values(groups);
  }, [needsRes]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ margin: '0 0 4px' }}>📋 Xem trước nhập liệu</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 12px' }}>
          File: <b>{file?.name}</b>
        </p>

        {/* Tóm tắt */}
        <div className="import-summary">
          <div className="import-stat">
            <div className="import-stat-value" style={{ color: 'var(--success)' }}>{resolved.length}</div>
            <div className="import-stat-label">✅ Tự động khớp</div>
          </div>
          <div className="import-stat">
            <div className="import-stat-value" style={{ color: 'var(--warning)' }}>{needsRes.length}</div>
            <div className="import-stat-label">⚠️ Cần xử lý</div>
          </div>
          <div className="import-stat">
            <div className="import-stat-value" style={{ color: 'var(--text-muted)' }}>{duplicates.length}</div>
            <div className="import-stat-label">🔄 Trùng mã (bỏ qua)</div>
          </div>
          <div className="import-stat">
            <div className="import-stat-value" style={{ color: 'var(--danger)' }}>{preview.errors.length}</div>
            <div className="import-stat-label">❌ Lỗi</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="wizard-tabs" style={{ marginTop: 12 }}>
          <button className={`wizard-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
            Tất cả ({preview.totalRows})
          </button>
          {needsRes.length > 0 && (
            <button className={`wizard-tab ${tab === 'resolve' ? 'active' : ''}`} onClick={() => setTab('resolve')}
                    style={tab !== 'resolve' ? { borderColor: 'var(--warning)', color: '#92400e', background: '#fef3c7' } : {}}>
              ⚠️ Cần xử lý ({needsRes.length})
            </button>
          )}
          {preview.errors.length > 0 && (
            <button className={`wizard-tab ${tab === 'errors' ? 'active' : ''}`} onClick={() => setTab('errors')}>
              ❌ Lỗi ({preview.errors.length})
            </button>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
          {tab === 'all' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Dòng</th>
                    <th>Môn</th>
                    <th>Nội dung</th>
                    <th>Chủ đề con</th>
                    <th>Mức·Dạng</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map(r => (
                    <tr key={r.rowNum} style={r.isDuplicate ? { opacity: 0.5 } : {}}>
                      <td>{r.rowNum}</td>
                      <td>{r.subjectText} · L{r.grade}</td>
                      <td style={{ maxWidth: 300 }}>
                        <div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                           <MathText text={r.stem} />
                        </div>
                      </td>
                      <td style={{ maxWidth: 180 }}>
                        {r.topicMatch.status === 'resolved' && (
                          <span className="badge success" style={{ fontSize: 10 }}>✅ {r.topicMatch.topicName}</span>
                        )}
                        {r.topicMatch.status === 'needs_resolution' && (
                          resolutions[r.rowNum]
                            ? <span className="badge info" style={{ fontSize: 10 }}>📌 {resolutions[r.rowNum].action === 'use_existing' ? 'Đã chọn' : resolutions[r.rowNum].action === 'create_new' ? 'Tạo mới' : 'Bỏ qua'}</span>
                            : <span className="badge warning" style={{ fontSize: 10 }}>⚠️ Chưa chọn</span>
                        )}
                        {(r.topicMatch.status === 'no_topics' || r.topicMatch.status === 'no_subject') && (
                          <span className="badge" style={{ fontSize: 10 }}>— Không có chủ đề</span>
                        )}
                      </td>
                      <td>
                        <span className={`level-chip ${r.level}`}>{r.level}</span>{' '}
                        <span className="q-type-chip">{QTYPE_LABEL[r.qType]?.slice(0, 8)}</span>
                      </td>
                      <td>
                        {r.isDuplicate ? <span className="badge">Trùng mã</span> : <span className="badge success">OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'resolve' && (
            <div className="resolve-section">
              {groupedNeedsRes.length === 0 ? (
                <div className="ok-box">✅ Tất cả chủ đề đã được khớp tự động!</div>
              ) : (
                groupedNeedsRes.map((group, gi) => (
                  <div key={gi} className="resolve-group">
                    <div className="resolve-group-header">
                      <div>
                        <strong>📂 {group.mainTopic || '(Không rõ chủ đề lớn)'}</strong>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: 12 }}>
                          → "{group.subTopic || '(trống)'}" · {group.rows.length} câu
                        </span>
                      </div>
                    </div>

                    <div className="resolve-options">
                      {/* Option 1: Chọn chủ đề con có sẵn */}
                      <div className="resolve-opt">
                        <label className="label">Chọn chủ đề có sẵn:</label>
                        <select
                          value={resolutions[group.rows[0].rowNum]?.action === 'use_existing' ? resolutions[group.rows[0].rowNum].topicId : ''}
                          onChange={e => {
                            if (!e.target.value) return;
                            const topicId = Number(e.target.value);
                            const topic = group.candidates.find(c => c.id === topicId);
                            const resolution = { action: 'use_existing', topicId, topicName: topic?.name };
                            applyToAllSameChapter(group.rows[0].rowNum, resolution);
                          }}
                        >
                          <option value="">-- Chọn chủ đề con --</option>
                          {group.candidates.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Option 2: Tạo chủ đề con mới */}
                      <div className="resolve-opt">
                        <button
                          className={`btn sm ${resolutions[group.rows[0].rowNum]?.action === 'create_new' ? 'primary' : 'secondary'}`}
                          onClick={() => {
                            const resolution = {
                              action: 'create_new',
                              name: group.subTopic || `${group.mainTopic} (mới)`,
                              chapter: group.candidates[0]?.chapter || group.mainTopic,
                            };
                            applyToAllSameChapter(group.rows[0].rowNum, resolution);
                          }}
                        >
                          ➕ Tạo mới: "{group.subTopic || `${group.mainTopic} (mới)`}"
                        </button>
                      </div>

                      {/* Option 3: Nhập không gán chủ đề */}
                      <div className="resolve-opt">
                        <button
                          className={`btn sm ${resolutions[group.rows[0].rowNum]?.action === 'skip_topic' ? 'ghost' : 'ghost'}`}
                          style={resolutions[group.rows[0].rowNum]?.action === 'skip_topic' ? { background: '#f3f4f6', fontWeight: 600 } : {}}
                          onClick={() => {
                            const resolution = { action: 'skip_topic' };
                            applyToAllSameChapter(group.rows[0].rowNum, resolution);
                          }}
                        >
                          ⏭️ Nhập không gán chủ đề
                        </button>
                      </div>
                    </div>

                    {/* Hiện trạng thái đã chọn */}
                    {resolutions[group.rows[0].rowNum] && (
                      <div className="info-box" style={{ marginTop: 6, padding: '6px 10px', fontSize: 11 }}>
                        {resolutions[group.rows[0].rowNum].action === 'use_existing' && `✅ Đã chọn: ${resolutions[group.rows[0].rowNum].topicName}`}
                        {resolutions[group.rows[0].rowNum].action === 'create_new' && `➕ Sẽ tạo mới: "${resolutions[group.rows[0].rowNum].name}"`}
                        {resolutions[group.rows[0].rowNum].action === 'skip_topic' && `⏭️ Sẽ nhập không gán chủ đề`}
                        <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>({group.rows.length} câu)</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'errors' && (
            <div>
              {preview.errors.map((e, i) => (
                <div key={i} className="error-box" style={{ marginBottom: 6, fontSize: 12 }}>
                  <strong>Dòng {e.row}:</strong> {e.error}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="row space-between" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Sẽ nhập: <b>{preview.totalRows - duplicates.length - preview.errors.length}</b> câu
            {duplicates.length > 0 && <span> · Bỏ qua {duplicates.length} trùng</span>}
          </div>
          <div className="row">
            <button className="btn secondary" onClick={onClose}>Hủy</button>
            <button
              className="btn primary"
              onClick={handleImport}
              disabled={importing || (needsRes.length > 0 && !allNeedsResResolved)}
            >
              {importing ? '⏳ Đang nhập...' : `📥 Nhập ${preview.totalRows - duplicates.length} câu`}
            </button>
          </div>
        </div>

        {needsRes.length > 0 && !allNeedsResResolved && (
          <div className="warn-box" style={{ marginTop: 8, fontSize: 11, textAlign: 'center' }}>
            ⚠️ Cần xử lý {needsRes.length - Object.keys(resolutions).filter(k => needsRes.some(r => r.rowNum === Number(k))).length} chủ đề chưa khớp trước khi nhập
          </div>
        )}
      </div>
    </div>
  );
}
