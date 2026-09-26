import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {api, uploadFile, downloadFile} from '../../api/client.js';
import {base, useLoad, ErrorBox} from './shared.jsx';
import {Rich} from './Rich.jsx';
import {QuestionEditor} from './Teacher.jsx';
import WorkspaceShell from './workspace/WorkspaceShell.jsx';
import MachineChecks, {importChecks} from './workspace/MachineChecks.jsx';
import {FORM_SHORT} from './workspace/labels.js';
import CommandPalette from './workspace/CommandPalette.jsx';
import {useHotkeys} from './workspace/useHotkeys.js';
import CopyPrompt from '../../components/CopyPrompt.jsx';

const DECISIONS = {import: 'Nhập thành câu mới', skip: 'Bỏ qua', version: 'Tạo bản mới cho câu trùng', replace: 'Thay thế câu trùng'};
const LEVEL_NAMES = ['NB', 'TH', 'VD', 'VDC'];
const TYPES = {multiple_choice: 'TN', true_false: 'ĐS', short_answer: 'TLN', matching: 'GN', essay: 'TL'};
const BRANCHES = {L: 'Vật lí', H: 'Hóa học', S: 'Sinh học'};
// Bốn nhóm kết quả sau khi đọc tệp (§19). "Tự nhận diện" chỉ dành cho câu mà mã thật sự resolve ra chuẩn.
const CATEGORIES = {
  AUTO_RESOLVED: {label: 'Tự nhận diện từ mã', tone: 'ok', icon: '✓'},
  VALID_METADATA: {label: 'Hợp lệ theo metadata', tone: 'ok', icon: '✓'},
  NEEDS_REVIEW: {label: 'Cần xem', tone: 'warn', icon: '!'},
  ERROR: {label: 'Lỗi', tone: 'danger', icon: '×'},
};
const TEMPLATES = {
  excel: ['question-import.xlsx', 'Mẫu Excel nâng cao'],
};
// Cả hành trình của một câu, để người nhập biết đang ở đâu và còn gì phía sau (V6.6.7.4): học sinh chỉ nhận câu đã duyệt.
const JOURNEY = [
  ['Tải tệp', 'Chọn Môn, Khối, thả tệp Word'],
  ['Kiểm tra & sửa', 'Hệ thống đọc mã, báo lỗi từng câu'],
  ['Lưu vào kho', 'Câu ở dạng nháp, chưa giao được'],
  ['Gửi duyệt', 'Gửi tổ trưởng / người duyệt'],
  ['Được duyệt', 'Dùng để giao bài, tạo đề'],
];
const CONTEXT_KEY = 'nganhang.import.context';

const excerpt = (text, length = 150) => {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > length ? flat.slice(0, length) + '…' : flat;
};
// Lần nhập tạo trước V6.6.5.2 chưa có `category`: suy tạm từ trạng thái cũ.
const categoryOf = item => {
  const v = item.validation || {};
  if (v.category) return v.category;
  if (v.status === 'ERROR') return 'ERROR';
  if (v.status === 'VALID') return v.resolution?.state === 'RESOLVED' ? 'AUTO_RESOLVED' : 'VALID_METADATA';
  return 'NEEDS_REVIEW';
};
const isBlocked = item => item.validation.status === 'ERROR';
const issuesOf = item => item.validation.issues
  || [...(item.validation.errors || []).map(message => ({severity: 'blocking', message})), ...(item.validation.warnings || []).map(message => ({severity: 'review', message}))];
const isCoded = item => /^Câu [A-ZĐ]{1,3}\./u.test(item.draft.display_code || '') || !!item.draft.code_raw;

// Ngữ cảnh lần trước (Môn/Khối/Kho) được nhớ trên máy này để lần sau chỉ cần thả tệp.
function rememberedContext() {
  try { return JSON.parse(localStorage.getItem(CONTEXT_KEY)) || {}; } catch { return {}; }
}
function remember(context) {
  try { localStorage.setItem(CONTEXT_KEY, JSON.stringify({subject_id: context.subject_id, grade: context.grade, bank_id: context.bank_id || null})); } catch { /* bộ nhớ trình duyệt bị chặn: bỏ qua */ }
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
function exportIssues(job) {
  const rows = [['STT', 'Mã câu', 'Nhóm', 'Mức', 'Loại vấn đề', 'Nội dung']];
  for (const item of job.items) {
    for (const issue of issuesOf(item).filter(i => i.severity !== 'info')) {
      rows.push([item.sequence, item.draft.display_code || item.draft.code_raw || '', CATEGORIES[categoryOf(item)].label,
        issue.severity === 'blocking' ? 'Chặn' : 'Cần xem', issue.code || '', issue.message]);
    }
  }
  const blob = new Blob(['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\n')], {type: 'text/csv;charset=utf-8'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `loi-nhap-${(job.source_name || 'tep').replace(/\.[^.]+$/, '')}.csv`;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(link.href);
}

function TemplateButton({kind}) {
  const [file, label] = TEMPLATES[kind];
  return (
    <button type="button" className="btn" onClick={() => downloadFile(`${base}/templates/${file}`, file).catch(e => alert(e.message))}>
      {label}
    </button>
  );
}

// Mẫu Word theo Môn + Khối: chữ đầu mã đúng môn, mã ví dụ lấy từ chương trình đang dùng (V6.6.7.4).
function WordTemplateButton({context}) {
  const ready = !!(context.subject_id && context.grade);
  return (
    <button type="button" className="btn primary" disabled={!ready} title={ready ? undefined : 'Chọn Môn và Khối trước: mẫu có sẵn mã đúng môn'}
            onClick={() => downloadFile(`/api/curriculum/template/word?subject_id=${context.subject_id}&grade=${context.grade}`, `Mau_Word_nhap_cau_khoi${context.grade}.docx`).catch(e => alert(e.message))}>
      ⬇ Tải mẫu Word
    </button>
  );
}

// Mã câu của môn đang chọn + lệnh AI thêm mã cho câu có sẵn. Không đọc được (chưa có quyền xem chương trình môn/khối) thì ẩn.
function CodeHelp({context}) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    setInfo(null);
    if (!context.subject_id || !context.grade) return undefined;
    let alive = true;
    api.get(`/api/curriculum/template/prompts?subject_id=${context.subject_id}&grade=${context.grade}`).then(d => { if (alive) setInfo(d); }).catch(() => {});
    return () => { alive = false; };
  }, [context.subject_id, context.grade]);
  if (!info) return null;
  return (
    <div className="code-help">
      <p>Mã câu môn {info.subject.name}: <code className="code-hint">{info.sample_code}</code> — chữ đầu mã {info.subject.letter_hint}, sau đó là Chủ đề · YCCĐ · Mức · Số câu · Dạng.</p>
      {!info.has_curriculum && (
        <p className="warn-box">Chưa có chương trình {info.subject.name} khối {info.grade}: mã câu chưa tự nhận được Chủ đề, YCCĐ, Bài. Nhờ tổ trưởng nạp ở trang <Link to="/curriculum">Chương trình môn học</Link>.</p>
      )}
      <details>
        <summary>Câu hỏi có sẵn chưa có mã? Nhờ AI thêm mã đúng mẫu</summary>
        <CopyPrompt title="Lệnh cho AI (ChatGPT, Gemini…)" text={info.prompts.questions} rows={6}
                    hint="Dán lệnh, gửi kèm câu hỏi và file Chương trình (tải ở trang Chương trình môn học). Kiểm tra lại mã trước khi nhập."/>
      </details>
    </div>
  );
}

function RecentJobs({onOpen}) {
  const jobs = useLoad(base + '/imports');
  const open = (jobs.data || []).filter(j => j.status !== 'confirmed');
  if (!jobs.data?.length) return null;
  return (
    <details className="practice-card" open={open.length > 0}>
      <summary>Mở lần nhập gần đây ({jobs.data.length})</summary>
      <ErrorBox error={jobs.error}/>
      <ul className="recent-jobs">
        {jobs.data.map(job => (
          <li key={job.id}>
            <span>
              <strong>{job.source_name}</strong>
              {' · '}{[job.subject_name, job.grade ? 'Khối ' + job.grade : null].filter(Boolean).join(' · ') || 'Chưa rõ môn/khối'}
              {' · '}{job.item_count} câu
              {job.error_count > 0 && <> · <span className="tone-danger">{job.error_count} lỗi</span></>}
              {job.review_count > 0 && <> · <span className="tone-warn">{job.review_count} cần xem</span></>}
              {' · '}{new Date(job.created_at).toLocaleString('vi-VN')}
            </span>
            <span>{job.status === 'confirmed' ? `Đã nhập ${job.imported_count}` : 'Đang soạn'}</span>
            {job.status !== 'confirmed' && <button className="btn" onClick={() => onOpen(job.id)}>Mở tiếp</button>}
          </li>
        ))}
      </ul>
    </details>
  );
}

// Kéo thả hoặc bấm để chọn. Word là đường mặc định; Excel/QTI vẫn nhận.
function Dropzone({file, onFile}) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div className={'dropzone' + (over ? ' over' : '') + (file ? ' has-file' : '')}
         onDragOver={e => { e.preventDefault(); setOver(true); }}
         onDragLeave={() => setOver(false)}
         onDrop={e => { e.preventDefault(); setOver(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}
         onClick={() => input.current?.click()}
         onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
         role="button" tabIndex={0} aria-label="Chọn hoặc kéo thả tệp câu hỏi">
      <input ref={input} type="file" accept=".docx,.xlsx,.zip" hidden onChange={e => onFile(e.target.files[0] || null)}/>
      {file
        ? <p><strong>{file.name}</strong> · {(file.size / 1024).toFixed(0)} KB <span className="muted">(bấm để đổi tệp)</span></p>
        : <p><strong>Kéo thả tệp Word vào đây</strong> hoặc bấm để chọn · nhận .docx, .xlsx, .zip</p>}
    </div>
  );
}

// Hành động gắn với từng loại vấn đề — sửa ngay tại chỗ, không phải mở trình soạn thảo đầy đủ.
function IssueList({item, onApply, onAck, onClearExpectations, onEditCode}) {
  const issues = issuesOf(item);
  if (!issues.length) return null;
  const order = {blocking: 0, review: 1, info: 2};
  return (
    <ul className="issue-list">
      {[...issues].sort((a, b) => order[a.severity] - order[b.severity]).map((issue, i) => (
        <li key={i} className={'issue-' + issue.severity}>
          <span className="issue-text">{issue.message}</span>
          <span className="issue-actions">
            {issue.code === 'CODE_METADATA_CONFLICT' && <>
              <button className="btn" onClick={() => onApply(item.validation.resolution?.code_values || {})}>Theo mã</button>
              <button className="btn" onClick={onEditCode}>Sửa mã câu</button>
            </>}
            {['INVALID_CODE', 'UNKNOWN_OUTCOME', 'UNKNOWN_YCCD', 'CURRICULUM_RETIRED'].includes(issue.code) &&
              <button className="btn" onClick={onEditCode}>Sửa mã câu</button>}
            {issue.code?.startsWith('OPTIONAL_') && <>
              <button className="btn" onClick={() => onAck(issue.code)}>Giữ theo mã</button>
              <button className="btn" onClick={onClearExpectations}>Bỏ tùy chọn cho cả lô</button>
            </>}
          </span>
        </li>
      ))}
    </ul>
  );
}

// V6.6.6 — "Sửa theo nhóm vấn đề": câu cùng một vấn đề được gom lại để sửa cả nhóm một lần, hoặc mở
// ra sửa từng câu. Mọi thao tác vẫn gửi về máy chủ và kiểm lại — giao diện không tự kết luận.
const FIELD_NAMES = {outcome_id: 'Outcome', yccd_id: 'YCCĐ', type: 'dạng câu', cognitive_level: 'mức'};
const GROUP_TITLES = {
  INVALID_CODE: 'Mã câu viết sai cấu trúc',
  UNKNOWN_OUTCOME: 'Mã trỏ tới Outcome không có trong chương trình',
  UNKNOWN_YCCD: 'Mã trỏ tới YCCĐ không có trong chương trình',
  CURRICULUM_RETIRED: 'Mã trỏ tới chuẩn đã ngừng dùng',
  GRADE_CONTEXT_MISSING: 'Thiếu Môn/Khối để đọc mã câu',
  SESSION_CONTEXT_MISMATCH: 'Dòng khai môn/khối khác phiên nhập',
  OPTIONAL_LESSON_MISMATCH: 'Mã dẫn tới Bài khác Bài đã chọn cho phiên',
  OPTIONAL_BRANCH_MISMATCH: 'Câu khác phân môn đã chọn cho phiên',
  OPTIONAL_LEVEL_MISMATCH: 'Mức theo mã khác mức đã chọn cho phiên',
  OPTIONAL_TYPE_MISMATCH: 'Dạng theo mã khác dạng đã chọn cho phiên',
  LESSON_AMBIGUOUS: 'YCCĐ nằm ở nhiều Bài — cần chọn Bài',
  LESSON_UNMAPPED: 'YCCĐ chưa gắn Bài',
  LESSON_UNMAPPED_MASTER: 'Chưa có dữ liệu Bài cho phân môn này (dữ liệu nền, không phải lỗi tệp)',
  LESSON_NOT_LINKED: 'Bài chọn tay chưa liên kết với YCCĐ',
  DUPLICATE_SUSPECT: 'Nghi trùng câu đã có trong kho',
};
const CODE_FIXES = new Set(['INVALID_CODE', 'UNKNOWN_OUTCOME', 'UNKNOWN_YCCD', 'CURRICULUM_RETIRED']);
const SKIP = new Set(['NOTE', 'LEGACY_CODE_FORMAT', 'LESSON_KEPT_BY_CODE']);

function groupIssues(items) {
  const groups = new Map();
  for (const item of items) {
    for (const issue of item.validation.issues || []) {
      if (issue.severity === 'info' || SKIP.has(issue.code)) continue;
      let key = issue.code, title = GROUP_TITLES[issue.code] || issue.message;
      if (issue.code === 'CODE_METADATA_CONFLICT') { key += ':' + issue.field; title = `Mã câu và phân loại lệch ở ${FIELD_NAMES[issue.field] || issue.field}`; }
      if (issue.code === 'LESSON_AMBIGUOUS') {
        const ids = (item.validation.resolution?.lesson_candidates || []).map(t => t.id).sort((a, b) => a - b);
        key += ':' + ids.join(',');
      }
      if (issue.code === 'LESSON_UNMAPPED' && item.validation.resolution?.master_data_missing) { key = 'LESSON_UNMAPPED_MASTER'; title = GROUP_TITLES.LESSON_UNMAPPED_MASTER; }
      if (issue.code === 'METADATA_INCOMPLETE') { key += ':' + issue.message; title = issue.message; }
      if (!groups.has(key)) groups.set(key, {key, code: issue.code, severity: issue.severity, title, entries: []});
      const group = groups.get(key);
      if (!group.entries.some(e => e.item.id === item.id)) group.entries.push({item, issue});
    }
  }
  const order = {blocking: 0, review: 1};
  return [...groups.values()].sort((a, b) => order[a.severity] - order[b.severity] || b.entries.length - a.entries.length);
}

function IssueGroups({items, topics, busy, push, onOpen}) {
  const groups = useMemo(() => groupIssues(items), [items]);
  const [expanded, setExpanded] = useState(null);
  const [deferred, setDeferred] = useState({});
  const [choice, setChoice] = useState({});
  const [codes, setCodes] = useState({});
  if (!groups.length) return null;
  const pending = groups.filter(g => !deferred[g.key]);
  const ids = group => group.entries.map(e => e.item.id);
  const ack = group => push({items: group.entries.map(({item}) => ({id: item.id, draft: {ack_codes: [...new Set([...(item.draft.ack_codes || []), group.code])]}}))});
  const saveCode = item => {
    const code = String(codes[item.id] ?? '').trim();
    if (!code) return;
    push({items: [{id: item.id, draft: {display_code: code, code_raw: null, outcome_id: null, yccd_id: null, cognitive_level: null, type: null, q_type: null, topic_id: null, lesson_status: null}}]});
  };
  const uncoded = group => group.entries.filter(({item}) => !/^Câu [A-ZĐ]{1,3}\./u.test(item.draft.display_code || '') && !item.draft.code_raw);

  return (
    <section className="issue-groups" aria-label="Sửa theo nhóm vấn đề">
      <header className="section-heading">
        <h3>Sửa theo nhóm vấn đề</h3>
        <span className="muted small">{pending.length} nhóm cần xử lý · câu cùng vấn đề sửa một lần, hoặc mở ra sửa từng câu</span>
      </header>
      {groups.map(group => {
        const open = expanded === group.key, later = !!deferred[group.key];
        const candidates = group.code === 'LESSON_AMBIGUOUS' ? group.entries[0].item.validation.resolution?.lesson_candidates || [] : topics;
        const loose = uncoded(group);
        return (
          <article key={group.key} className={'issue-group ' + group.severity + (later ? ' done' : '')}>
            <div className="issue-group-head">
              <span className="issue-count" aria-label={group.entries.length + ' câu'}>{group.entries.length}</span>
              <div className="issue-group-title">
                <strong>{group.title}</strong>
                <span className={'small ' + (group.severity === 'blocking' ? 'tone-danger' : 'tone-warn')}>{group.severity === 'blocking' ? 'Chặn nhập' : 'Cần xem'}{later ? ' · đã để sau' : ''}</span>
              </div>
              <div className="issue-group-actions">
                {group.code === 'CODE_METADATA_CONFLICT' &&
                  <button className="btn primary" disabled={busy}
                          onClick={() => push({items: group.entries.map(({item}) => ({id: item.id, draft: item.validation.resolution?.code_values || {}}))})}>
                    Theo mã cho cả nhóm</button>}
                {group.code.startsWith('OPTIONAL_') && <>
                  <button className="btn primary" disabled={busy} onClick={() => ack(group)}>Giữ theo mã cho cả nhóm</button>
                  <button className="btn" disabled={busy} onClick={() => push({expectations: {}})}>Bỏ tùy chọn cho cả lô</button>
                </>}
                {group.code === 'LESSON_NOT_LINKED' && <button className="btn primary" disabled={busy} onClick={() => ack(group)}>Giữ Bài đã chọn cho cả nhóm</button>}
                {(group.code === 'LESSON_AMBIGUOUS' || (group.code === 'LESSON_UNMAPPED' && group.key !== 'LESSON_UNMAPPED_MASTER')) && candidates.length > 0 && <>
                  <select aria-label={'Bài cho nhóm ' + group.title} value={choice[group.key] || ''} onChange={e => setChoice({...choice, [group.key]: e.target.value})}>
                    <option value="">Chọn Bài…</option>
                    {candidates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button className="btn primary" disabled={busy || !choice[group.key]}
                          onClick={() => push({items: ids(group).map(id => ({id, draft: {topic_id: Number(choice[group.key]), lesson_status: 'MANUAL'}}))})}>
                    Gắn cho cả nhóm</button>
                </>}
                {group.code === 'DUPLICATE_SUSPECT' && <>
                  <button className="btn primary" disabled={busy} onClick={() => push({items: ids(group).map(id => ({id, decision: 'skip'}))})}>Bỏ qua cả nhóm</button>
                  <button className="btn" disabled={busy} onClick={() => push({items: ids(group).map(id => ({id, decision: 'version'}))})}>Tạo bản mới cho câu cũ</button>
                </>}
                {group.code === 'METADATA_INCOMPLETE' && /mức/i.test(group.title) && loose.length > 0 && <>
                  <select aria-label={'Mức cho nhóm ' + group.title} value={choice[group.key] || ''} onChange={e => setChoice({...choice, [group.key]: e.target.value})}>
                    <option value="">Chọn mức…</option>
                    {['NB', 'TH', 'VD', 'VDC'].map((l, i) => <option key={l} value={i + 1}>{l}</option>)}
                  </select>
                  <button className="btn primary" disabled={busy || !choice[group.key]}
                          onClick={() => push({bulk: {cognitive_level: Number(choice[group.key])}, bulk_ids: loose.map(e => e.item.id)})}>
                    Đặt cho {loose.length} câu không mã</button>
                </>}
                {group.severity === 'review' && <button className="btn" onClick={() => setDeferred({...deferred, [group.key]: !later})}>{later ? 'Bỏ để sau' : 'Để sau'}</button>}
                <button className="btn" aria-expanded={open} onClick={() => setExpanded(open ? null : group.key)}>{open ? 'Thu gọn' : CODE_FIXES.has(group.code) ? 'Sửa từng câu' : 'Xem từng câu'}</button>
              </div>
            </div>
            {open && (
              <ul className="issue-group-items">
                {group.entries.map(({item, issue}) => (
                  <li key={item.id}>
                    <span className="mono">{item.draft.display_code || item.draft.code_raw || 'Câu ' + item.sequence}</span>
                    {CODE_FIXES.has(group.code)
                      ? <>
                          <input aria-label={'Mã mới cho câu ' + item.sequence} value={codes[item.id] ?? (item.draft.display_code || item.draft.code_raw || '')}
                                 onChange={e => setCodes({...codes, [item.id]: e.target.value})}
                                 onKeyDown={e => { if (e.key === 'Enter') saveCode(item); }} placeholder="Câu L. 2. 1. NB. 1. TN"/>
                          <button className="btn" disabled={busy} onClick={() => saveCode(item)}>Lưu mã</button>
                        </>
                      : <span className="small">{issue.message}</span>}
                    {group.code === 'CODE_METADATA_CONFLICT' &&
                      <button className="btn" disabled={busy} onClick={() => push({items: [{id: item.id, draft: item.validation.resolution?.code_values || {}}]})}>Theo mã</button>}
                    {group.code.startsWith('OPTIONAL_') &&
                      <button className="btn" disabled={busy} onClick={() => ack({...group, entries: [{item, issue}]})}>Giữ theo mã</button>}
                    <button className="btn link" onClick={() => onOpen(item.id)}>Mở câu</button>
                  </li>
                ))}
              </ul>
            )}
          </article>
        );
      })}
    </section>
  );
}

export default function ImportCenter() {
  const catalog = useLoad(base + '/catalog');
  const banks = useLoad(base + '/banks');
  const [context, setContext] = useState(() => ({subject_id: null, grade: null, bank_id: null, ...rememberedContext()}));
  const [expectations, setExpectations] = useState({});
  const [sheet, setSheet] = useState('');
  const [file, setFile] = useState(null);
  const [job, setJob] = useState(null);
  const [selected, setSelected] = useState([]);
  const [tab, setTab] = useState('ALL');
  const [activeId, setActiveId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [codeDraft, setCodeDraft] = useState(null);
  const [bulkTopic, setBulkTopic] = useState('');
  const [bulkLevel, setBulkLevel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();

  const items = job?.items || [];
  const counts = useMemo(() => {
    const by = {AUTO_RESOLVED: 0, VALID_METADATA: 0, NEEDS_REVIEW: 0, ERROR: 0};
    for (const item of items) by[categoryOf(item)]++;
    return {...by, total: items.length};
  }, [items]);
  const visible = useMemo(() => tab === 'ALL' ? items : items.filter(i => categoryOf(i) === tab), [items, tab]);
  const active = items.find(i => i.id === activeId) || null;
  const confirmable = useMemo(() => selected.filter(id => { const it = items.find(i => i.id === id); return it && !isBlocked(it) && it.decision !== 'skip'; }), [selected, items]);
  const selectedItems = items.filter(i => selected.includes(i.id));
  const uncodedSelected = selectedItems.filter(i => !isCoded(i)).length;

  const subjects = catalog.data?.subjects || [];
  const jobContext = job?.context || {};
  const lessonSubject = job ? jobContext.subject_id : context.subject_id, lessonGrade = job ? jobContext.grade : context.grade;
  const topics = useMemo(() => (catalog.data?.topics || []).filter(t => t.subject_id === lessonSubject && t.grade === lessonGrade), [catalog.data, lessonSubject, lessonGrade]);
  // Chương / Chủ đề lấy từ chính danh sách Bài của môn + khối; chọn Chương thì thu hẹp danh sách Bài.
  const chapters = useMemo(() => [...new Set(topics.map(t => t.chapter).filter(Boolean))], [topics]);
  const lessonChoices = expectations.chapter ? topics.filter(t => t.chapter === expectations.chapter) : topics;
  const topicName = id => topics.find(t => t.id === id)?.name;
  const subjectName = id => subjects.find(s => s.id === id)?.name;

  const loadJob = useCallback(async (id, {keepActive = false} = {}) => {
    setBusy(true); setError(''); setResult(null);
    try {
      const detail = await api.get(`${base}/imports/${id}`);
      setJob(detail);
      // Mở lại một lần nhập dở thì khôi phục đúng ngữ cảnh lúc nhập.
      if (detail.context?.subject_id) setContext(prev => ({...prev, subject_id: detail.context.subject_id, grade: detail.context.grade, bank_id: detail.context.bank_id || prev.bank_id}));
      setSelected(detail.items.filter(i => !isBlocked(i)).map(i => i.id));
      if (!keepActive) {
        const firstIssue = detail.items.find(i => ['ERROR', 'NEEDS_REVIEW'].includes(categoryOf(i)));
        setActiveId(firstIssue?.id || detail.items[0]?.id || null);
        setTab(detail.items.some(i => categoryOf(i) === 'ERROR') ? 'ERROR' : 'ALL');
      }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }, []);

  async function parse() {
    if (!context.subject_id || !context.grade) { setError('Chọn Môn và Khối trước khi tải tệp'); return; }
    setBusy(true); setError(''); setResult(null);
    try {
      // Môn + Khối là ngữ cảnh quyết định; phần "Tùy chọn thêm" chỉ gửi như kỳ vọng để đối chiếu.
      const metadata = {
        subject_id: context.subject_id, grade: context.grade,
        ...(context.bank_id ? {bank_id: context.bank_id} : {}),
        ...(sheet ? {sheet_name: sheet} : {}),
        expectations: Object.fromEntries(Object.entries(expectations).filter(([, v]) => v !== '' && v != null)),
      };
      remember(context);
      const created = await uploadFile(base + '/imports', file, {metadata: JSON.stringify(metadata)});
      await loadJob(created.id);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  // Gửi thay đổi lên máy chủ rồi đọc lại: mọi kiểm tra đều chạy ở máy chủ, giao diện không tự kết luận.
  const push = useCallback(async body => {
    if (!job) return false;
    setBusy(true); setError('');
    try {
      await api.put(`${base}/imports/${job.id}`, body);
      const updated = await api.get(`${base}/imports/${job.id}`);
      setJob(updated);
      setSelected(prev => prev.filter(id => { const it = updated.items.find(i => i.id === id); return it && !isBlocked(it); }));
      return true;
    } catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  }, [job]);
  const patchDraft = (item, draft) => push({items: [{id: item.id, draft}]});
  const setDecision = (ids, decision) => push({items: ids.map(id => ({id, decision}))});

  function saveCode(item) {
    const code = String(codeDraft || '').trim();
    // Đổi mã thì để mã mới quyết định lại Outcome/YCCĐ/Mức/Dạng/Bài, tránh xung đột với giá trị theo mã cũ.
    patchDraft(item, {display_code: code, code_raw: null, outcome_id: null, yccd_id: null, cognitive_level: null, type: null, q_type: null, topic_id: null, lesson_status: null})
      .then(ok => ok && setCodeDraft(null));
  }

  // Gửi thật các câu vừa nhập đi duyệt. Máy chủ tự chia phần ≤ 500 câu, gửi phần đủ điều kiện và báo phần
  // chưa gửi được — lô nhập lớn hơn giới hạn thao tác hàng loạt vẫn gửi được trong một lần bấm.
  async function submitImported() {
    if (!result?.job_id || !(result.unique_questions ?? result.imported)) return;
    setBusy(true); setError('');
    try {
      const sent = await api.post(`${base}/imports/${result.job_id}/submit`, {});
      // Gọi lại an toàn: câu đã gửi / đã duyệt từ trước được máy chủ đếm riêng, không tính là "chưa gửi được".
      setResult(r => ({...r, submitted: sent.submitted_now, alreadySubmitted: sent.already_submitted,
        alreadyHandled: sent.already_handled, notSubmitted: sent.not_submitted}));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function confirm() {
    setBusy(true); setError('');
    const summary = {...counts};
    try {
      const done = await api.post(`${base}/imports/${job.id}/confirm`, {ids: confirmable});
      // Máy chủ đếm gắn Bài trên cả lô (không đếm trên một trang của hàng đợi).
      const lessons = done.lessons || {assigned: null, unassigned: null};
      setResult({...done, lessons, summary, skipped: items.length - confirmable.length});
      setJob(null); setSelected([]); setActiveId(null);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  // Phím tắt khi không gõ trong ô nhập: J/K đi xuống/lên, X chọn/bỏ chọn, E sửa chi tiết, Ctrl+K bảng lệnh.
  const go = step => {
    const index = visible.findIndex(i => i.id === activeId);
    const next = visible[Math.min(visible.length - 1, Math.max(0, index + step))];
    if (next) { setActiveId(next.id); setEditing(false); setCodeDraft(null); }
  };
  useHotkeys({
    'j': () => go(1), 'arrowdown': () => go(1),
    'k': () => go(-1), 'arrowup': () => go(-1),
    'x': () => { if (active && !isBlocked(active)) setSelected(s => s.includes(active.id) ? s.filter(id => id !== active.id) : [...s, active.id]); },
    'e': () => active && setEditing(true),
    'mod+k': () => setPaletteOpen(true),
    'escape': () => setPaletteOpen(false),
  }, !!job && !paletteOpen && !editing);

  const commands = query => {
    const list = [];
    for (const [key, c] of [['ALL', {label: 'Tất cả'}], ...Object.entries(CATEGORIES)]) {
      list.push({id: 'tab-' + key, group: 'Xem nhóm', label: `${c.label} (${key === 'ALL' ? counts.total : counts[key]})`, keywords: 'xem loc', run: () => setTab(key)});
    }
    for (const group of groupIssues(items)) {
      const ids = group.entries.map(e => e.item.id);
      if (group.code === 'CODE_METADATA_CONFLICT') list.push({id: 'fix-' + group.key, group: 'Sửa theo nhóm', label: `Theo mã cho ${ids.length} câu: ${group.title}`, keywords: 'theo ma sua',
        run: () => push({items: group.entries.map(({item}) => ({id: item.id, draft: item.validation.resolution?.code_values || {}}))})});
      if (group.code.startsWith('OPTIONAL_')) list.push({id: 'ack-' + group.key, group: 'Sửa theo nhóm', label: `Giữ theo mã cho ${ids.length} câu: ${group.title}`, keywords: 'giu theo ma',
        run: () => push({items: group.entries.map(({item}) => ({id: item.id, draft: {ack_codes: [...new Set([...(item.draft.ack_codes || []), group.code])]}}))})});
      if (group.code === 'DUPLICATE_SUSPECT') list.push({id: 'skip-' + group.key, group: 'Sửa theo nhóm', label: `Bỏ qua ${ids.length} câu nghi trùng`, keywords: 'bo qua trung',
        run: () => push({items: ids.map(id => ({id, decision: 'skip'}))})});
    }
    if (jobContext.expectations && Object.keys(jobContext.expectations).length) list.push({id: 'clear-exp', group: 'Lần nhập', label: 'Bỏ tùy chọn thêm cho cả lô', keywords: 'bo tuy chon ky vong', run: () => push({expectations: {}})});
    list.push({id: 'select-valid', group: 'Lần nhập', label: 'Chọn tất cả câu hợp lệ', keywords: 'chon', run: () => setSelected(items.filter(i => !isBlocked(i)).map(i => i.id))});
    list.push({id: 'clear-sel', group: 'Lần nhập', label: 'Bỏ chọn', keywords: 'bo chon', run: () => setSelected([])});
    if (counts.ERROR + counts.NEEDS_REVIEW > 0) list.push({id: 'csv', group: 'Lần nhập', label: 'Xuất danh sách lỗi (CSV)', keywords: 'xuat loi csv', run: () => exportIssues(job)});
    if (confirmable.length) list.push({id: 'confirm', group: 'Lần nhập', label: `Lưu ${confirmable.length} câu vào kho`, keywords: 'xac nhan nhap luu kho', run: confirm});
    list.push({id: 'banks', group: 'Đi tới', label: 'Bàn làm việc (Kho câu hỏi)', keywords: 'kho', run: () => navigate('/practice/banks')});
    const text = query.trim();
    if (text) list.push({id: 'find', group: 'Tìm', label: `Tới câu có mã/nội dung “${text}”`, keywords: text, run: () => {
      const needle = text.toLowerCase();
      const hit = items.find(i => `${i.draft.display_code || ''} ${i.draft.code_raw || ''} ${i.draft.stem || ''}`.toLowerCase().includes(needle));
      if (hit) { setTab('ALL'); setActiveId(hit.id); }
    }});
    return list;
  };

  const step = result ? 3 : job ? 2 : 1;
  // Bước đang làm trên hành trình 5 bước: đã lưu vào kho thì việc tiếp theo là gửi duyệt; đã gửi thì chờ duyệt.
  const journey = result ? (result.submitted == null ? 4 : 5) : job ? 2 : 1;
  const imported = result ? result.unique_questions ?? result.imported : 0;
  const expectationChips = [
    jobContext.expectations?.branch_code && 'Phân môn ' + BRANCHES[jobContext.expectations.branch_code],
    jobContext.expectations?.chapter && jobContext.expectations.chapter,
    jobContext.expectations?.topic_id && (topicName(jobContext.expectations.topic_id) || 'Bài đã chọn'),
    jobContext.expectations?.cognitive_level && 'Mức ' + LEVEL_NAMES[jobContext.expectations.cognitive_level - 1],
    jobContext.expectations?.type && 'Dạng ' + TYPES[jobContext.expectations.type],
  ].filter(Boolean);

  return (
    <WorkspaceShell>
      <ol className="journey" aria-label="Hành trình câu hỏi: từ nhập đến dùng được">
        {JOURNEY.map(([label, hint], i) => (
          <li key={label} className={journey === i + 1 ? 'active' : journey > i + 1 ? 'done' : ''} aria-current={journey === i + 1 ? 'step' : undefined}>
            <b>{journey > i + 1 ? '✓' : i + 1}. {label}</b><span>{hint}</span>
          </li>
        ))}
      </ol>
      <ErrorBox error={error}/>

      {step === 3 && (
        <article className="ok-box" role="status">
          <h2>{result.submitted == null ? `Đã lưu ${imported} câu vào kho (dạng nháp)` : 'Đã gửi đi duyệt'}</h2>
          {result.processed_items != null && result.processed_items !== result.unique_questions && (
            <p>Đã xử lý {result.processed_items} mục nhập · {result.unique_questions} câu trong kho (có mục cập nhật vào cùng một câu).</p>
          )}
          <p>
            {result.summary.AUTO_RESOLVED} tự nhận diện từ mã · {result.summary.VALID_METADATA} hợp lệ theo metadata
            {' · '}{result.summary.NEEDS_REVIEW} cần xem{result.skipped > 0 ? ` · ${result.skipped} câu không nhập` : ''}
          </p>
          {result.lessons.assigned !== null && (
            <p>{result.lessons.assigned} câu đã gắn Bài · {result.lessons.unassigned} câu chưa gắn Bài.</p>
          )}
          {result.submitted == null && (
            <p className="next-step">
              <b>Bước tiếp theo:</b> câu nháp chưa dùng được cho học sinh. Bấm <b>Gửi đi duyệt</b> để tổ trưởng / người duyệt kiểm tra;
              câu được duyệt mới dùng để giao bài, tạo đề.
              {result.lessons.unassigned > 0 && ` Nên gắn Bài cho ${result.lessons.unassigned} câu chưa có Bài trước khi gửi (báo cáo theo Bài cần thông tin này).`}
            </p>
          )}
          {result.submitted != null && (
            <p className="ok-box" role="status">
              {[`Đã gửi thêm ${result.submitted} câu đi duyệt`,
                result.alreadySubmitted ? `${result.alreadySubmitted} câu đã gửi trước đó` : '',
                result.alreadyHandled ? `${result.alreadyHandled} câu đã được duyệt` : '',
                result.notSubmitted ? `${result.notSubmitted} câu chưa gửi được (mở để xem lý do)` : ''].filter(Boolean).join(' · ')}.
              {' '}Người duyệt thấy các câu này ở màn <b>Duyệt</b> → tab <b>Chờ duyệt</b>; duyệt xong, câu dùng được để giao bài.
            </p>
          )}
          <div className="practice-actions">
            {result.submitted == null
              ? <button className="btn primary" disabled={busy} onClick={submitImported}>Gửi {imported} câu đi duyệt</button>
              : <Link className="btn primary" to={`/practice/reviews?tab=${result.notSubmitted ? 'author' : 'pending'}&import_job_id=${result.job_id}`}>
                  {result.notSubmitted ? `Mở ${result.notSubmitted} câu chưa gửi` : 'Mở màn Duyệt'}
                </Link>}
            {result.lessons.unassigned > 0 &&
              <Link className="btn" to={`/practice/banks?import_job_id=${result.job_id}&lesson_status=UNASSIGNED`}>
                Gắn Bài cho {result.lessons.unassigned} câu
              </Link>}
            <Link className="btn" to={`/practice/banks?import_job_id=${result.job_id}`}>Xem trong kho</Link>
            <button className="btn" onClick={() => setResult(null)}>Nhập tệp khác</button>
          </div>
        </article>
      )}

      {step === 1 && <>
        <article className="practice-card import-context">
          <header className="section-heading">
            <h2>Nhập câu hỏi từ Word</h2>
            <WordTemplateButton context={context}/>
          </header>
          <p>Chỉ cần chọn <strong>Môn</strong>, <strong>Khối</strong> và thả tệp. Mã câu tự cho biết Chủ đề (Outcome), YCCĐ, mức, dạng — và Bài nếu chương trình môn đã gắn Bài với YCCĐ.</p>
          <div className="practice-grid">
            <label>Môn
              <select aria-label="Môn" value={context.subject_id || ''} onChange={e => setContext({...context, subject_id: Number(e.target.value) || null})}>
                <option value="">Chọn môn</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>Khối
              <select aria-label="Khối" value={context.grade || ''} onChange={e => setContext({...context, grade: Number(e.target.value) || null})}>
                <option value="">Chọn khối</option>
                {[6, 7, 8, 9, 10, 11, 12].map(g => <option key={g} value={g}>Khối {g}</option>)}
              </select>
            </label>
          </div>
          <CodeHelp context={context}/>
          <Dropzone file={file} onFile={setFile}/>

          <details className="import-options">
            <summary>Tùy chọn thêm</summary>
            <p className="muted">Chỉ để đối chiếu và điền cho câu không có mã. Mã câu luôn được ưu tiên — hệ thống báo khi lệch, không tự đè.</p>
            <div className="practice-grid">
              <label>Phân môn
                <select aria-label="Phân môn kỳ vọng" value={expectations.branch_code || ''} onChange={e => setExpectations({...expectations, branch_code: e.target.value || null})}>
                  <option value="">Không giới hạn</option>
                  {Object.entries(BRANCHES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label>Chương / Chủ đề
                <select aria-label="Chương kỳ vọng" value={expectations.chapter || ''} disabled={!chapters.length}
                        onChange={e => setExpectations({...expectations, chapter: e.target.value || null, topic_id: null})}>
                  <option value="">{context.subject_id && context.grade && !chapters.length ? 'Chưa có dữ liệu Chương' : 'Không chọn'}</option>
                  {chapters.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label>Bài
                <select aria-label="Bài kỳ vọng" value={expectations.topic_id || ''} disabled={!lessonChoices.length}
                        onChange={e => setExpectations({...expectations, topic_id: Number(e.target.value) || null})}>
                  <option value="">{context.subject_id && context.grade && !topics.length ? 'Chưa có dữ liệu Bài cho môn/khối này' : 'Không chọn'}</option>
                  {lessonChoices.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label>Mức
                <select aria-label="Mức kỳ vọng" value={expectations.cognitive_level || ''} onChange={e => setExpectations({...expectations, cognitive_level: Number(e.target.value) || null})}>
                  <option value="">Không chọn</option>
                  {LEVEL_NAMES.map((l, i) => <option key={l} value={i + 1}>{l}</option>)}
                </select>
              </label>
              <label>Dạng
                <select aria-label="Dạng kỳ vọng" value={expectations.type || ''} onChange={e => setExpectations({...expectations, type: e.target.value || null})}>
                  <option value="">Không chọn</option>
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label>Kho đích
                <select aria-label="Kho đích" value={context.bank_id || ''} onChange={e => setContext({...context, bank_id: Number(e.target.value) || null})}>
                  <option value="">Kho cá nhân</option>
                  {(banks.data || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label>Sheet Excel
                <select aria-label="Sheet Excel" value={sheet} onChange={e => setSheet(e.target.value)}>
                  <option value="">Tự nhận diện</option>
                  <option value="04_QUESTION_UPLOAD_SIMPLE">SIMPLE — câu mới</option>
                  <option value="05_QUESTION_UPLOAD_ADV">ADV — nhập/cập nhật có phiên bản</option>
                </select>
              </label>
            </div>
            <div className="practice-actions">
              <TemplateButton kind="excel"/>
              <Link className="btn" to="/curriculum">Chương trình môn học (Chủ đề · YCCĐ · Bài)</Link>
            </div>
          </details>

          <button className="btn primary" disabled={!file || busy || !context.subject_id || !context.grade} onClick={parse}>
            {busy ? 'Đang đọc tệp…' : 'Đọc tệp và kiểm tra'}
          </button>
        </article>
        <RecentJobs onOpen={loadJob}/>
      </>}

      {step === 2 && <>
        <header className="section-heading">
          <h2>Tìm thấy {counts.total} câu</h2>
          <span className="context-chip">
            {subjectName(jobContext.subject_id) || 'Chưa rõ môn'}{jobContext.grade ? ' · Khối ' + jobContext.grade : ''}
            {expectationChips.length > 0 && <> · kỳ vọng: {expectationChips.join(', ')}
              <button className="btn link" disabled={busy} onClick={() => push({expectations: {}})}>Bỏ tùy chọn</button></>}
          </span>
          <button className="btn" onClick={() => { setJob(null); setSelected([]); setActiveId(null); }}>Đóng lần nhập</button>
        </header>

        <div className="status-tabs" role="tablist" aria-label="Lọc theo kết quả kiểm tra">
          {[['ALL', {label: 'Tất cả', tone: 'muted', icon: ''}], ...Object.entries(CATEGORIES)].map(([key, c]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={'status-tab tone-' + c.tone + (tab === key ? ' active' : '')}
                    onClick={() => setTab(key)}>
              {c.icon} {c.label} <strong>{key === 'ALL' ? counts.total : counts[key]}</strong>
            </button>
          ))}
        </div>

        {job.warnings?.length > 0 && (
          <details className="warn-box">
            <summary>{job.warnings.length} lưu ý về cả lô (không chặn nhập)</summary>
            <ul>{job.warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
            <p>Hệ thống không tự sửa mã câu người soạn đã đặt.</p>
          </details>
        )}

        <IssueGroups items={items} topics={topics} busy={busy} push={push}
                     onOpen={id => { setTab('ALL'); setActiveId(id); setEditing(false); setCodeDraft(null); }}/>

        <div className="practice-actions select-actions">
          <button className="btn" onClick={() => setSelected(items.filter(i => !isBlocked(i)).map(i => i.id))}>Chọn tất cả hợp lệ</button>
          <button className="btn" onClick={() => setSelected(visible.filter(i => !isBlocked(i)).map(i => i.id))}>Chọn theo tab</button>
          <button className="btn" onClick={() => setSelected([])}>Bỏ chọn</button>
          {counts.ERROR + counts.NEEDS_REVIEW > 0 && <button className="btn" onClick={() => exportIssues(job)}>Xuất danh sách lỗi (CSV)</button>}
          <span><strong>{confirmable.length}</strong> câu sẽ được nhập · <kbd>J</kbd>/<kbd>K</kbd> chuyển câu, <kbd>X</kbd> chọn, <button className="btn link" onClick={() => setPaletteOpen(true)}>bảng lệnh <kbd>Ctrl K</kbd></button></span>
        </div>

        {/* Hàng loạt chỉ cho những gì không nằm trong mã câu: Bài, mức/dạng của câu không mã, xử lý trùng. */}
        {selected.length > 0 && (
          <div className="bulk-bar import-bulk" role="toolbar" aria-label="Thao tác cho câu đang chọn">
            <strong>{selected.length} câu đang chọn</strong>
            <label className="inline-field">Gắn Bài
              <select aria-label="Bài cho câu đang chọn" value={bulkTopic} onChange={e => setBulkTopic(e.target.value)}>
                <option value="">Chọn Bài</option>
                {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <button className="btn" disabled={busy || !bulkTopic} title="Câu đã tự gắn Bài theo liên kết chuẩn vẫn giữ Bài theo mã"
                    onClick={() => push({bulk: {topic_id: Number(bulkTopic)}, bulk_ids: selected})}>Áp dụng</button>
            {uncodedSelected > 0 && <>
              <label className="inline-field">Mức ({uncodedSelected} câu không mã)
                <select aria-label="Mức cho câu không mã" value={bulkLevel} onChange={e => setBulkLevel(e.target.value)}>
                  <option value="">Chọn mức</option>
                  {LEVEL_NAMES.map((l, i) => <option key={l} value={i + 1}>{l}</option>)}
                </select>
              </label>
              <button className="btn" disabled={busy || !bulkLevel} onClick={() => push({bulk: {cognitive_level: Number(bulkLevel)}, bulk_ids: selected})}>Áp dụng</button>
            </>}
            {selectedItems.some(i => i.duplicate_candidates.length > 0) && (
              <label className="inline-field">Câu nghi trùng
                <select aria-label="Xử lý câu nghi trùng" value="" onChange={e => e.target.value && setDecision(selectedItems.filter(i => i.duplicate_candidates.length).map(i => i.id), e.target.value)}>
                  <option value="">Chọn cách xử lý</option>
                  {Object.entries(DECISIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            )}
          </div>
        )}

        <div className="queue-layout">
          <div className="queue-table-wrap">
            <table className="queue-table">
              <thead>
                <tr>
                  <th scope="col" className="queue-check">
                    <input type="checkbox" aria-label="Chọn tất cả dòng đang hiển thị"
                           checked={visible.length > 0 && visible.filter(i => !isBlocked(i)).every(i => selected.includes(i.id))}
                           onChange={e => {
                             const ids = visible.filter(i => !isBlocked(i)).map(i => i.id);
                             setSelected(e.target.checked ? [...new Set([...selected, ...ids])] : selected.filter(id => !ids.includes(id)));
                           }}/>
                  </th>
                  <th scope="col">Câu</th><th scope="col" className="col-lesson">Bài · YCCĐ</th>
                  <th scope="col" className="col-level">Mức</th><th scope="col" className="col-form">Dạng</th><th scope="col" className="col-result">Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(item => {
                  const d = item.draft, r = item.validation.resolution, c = CATEGORIES[categoryOf(item)];
                  const top = issuesOf(item).find(i => i.severity === 'blocking') || issuesOf(item).find(i => i.severity === 'review');
                  return (
                    <tr key={item.id} className={'queue-row' + (item.id === activeId ? ' active' : '') + (selected.includes(item.id) ? ' selected' : '')}
                        onClick={() => { setActiveId(item.id); setEditing(false); setCodeDraft(null); }}>
                      <td className="queue-check" data-label="Chọn" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" aria-label={'Chọn câu ' + item.sequence}
                               disabled={isBlocked(item)} checked={selected.includes(item.id)}
                               onChange={e => setSelected(e.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))}/>
                      </td>
                      <td data-label="Câu" className="queue-question">
                        <div className="q-line"><span className={'q-code' + (d.display_code ? '' : ' is-raw')}>{d.display_code || d.code_raw || 'Câu ' + item.sequence}</span></div>
                        <div className="q-stem">{excerpt(d.stem, 220)}</div>
                      </td>
                      <td data-label="Bài · YCCĐ" className={'col-lesson' + (r?.lesson?.name || topicName(d.topic_id) ? '' : ' is-missing')}>
                        {r?.lesson?.name || topicName(d.topic_id) || (r?.lesson_status === 'AMBIGUOUS' ? 'Nhiều Bài — cần chọn' : r?.master_data_missing ? 'Chưa có dữ liệu Bài' : r?.lesson_status === 'UNMAPPED' ? 'Chưa gắn Bài' : '—')}
                        {r?.outcome && <small className="q-curriculum">{[r.outcome, r.yccd].filter(Boolean).join(' · ')}</small>}
                      </td>
                      <td data-label="Mức" className="col-level">{r?.level || LEVEL_NAMES[(d.cognitive_level || 0) - 1] || '—'}</td>
                      <td data-label="Dạng" className="col-form">{r?.form || FORM_SHORT[d.q_type] || TYPES[d.type] || '—'}</td>
                      <td data-label="Kết quả" className="col-result">
                        <span className={'status-pill tone-' + c.tone}>{c.label}</span>
                        {top && <small className="row-issue">{excerpt(top.message, 60)}</small>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!visible.length && <p role="status" className="queue-empty">Không có dòng nào trong nhóm này.</p>}
          </div>

          <aside className="queue-preview" aria-live="polite">
            {!active && <p className="queue-preview-empty">Chọn một dòng để xem trước.</p>}
            {active && <div className="queue-preview-scroll">
              <header className="preview-head">
                <span className="q-code">{active.draft.display_code || active.draft.code_raw || 'Câu ' + active.sequence}</span>
                <span className={'status-pill tone-' + CATEGORIES[categoryOf(active)].tone}>{CATEGORIES[categoryOf(active)].label}</span>
              </header>
              <MachineChecks checks={importChecks(active)} compact/>
              {active.validation.resolution?.state && active.validation.resolution.outcome && (
                <p className="ok-box">
                  {active.validation.resolution.branch} · {active.validation.resolution.outcome} · {active.validation.resolution.yccd}
                  {active.validation.resolution.lesson ? ` · ${active.validation.resolution.lesson.name}` : ''}
                  {active.validation.resolution.yccd_text && <><br/><small>{active.validation.resolution.yccd_text}</small></>}
                </p>
              )}

              <IssueList item={active}
                         onApply={values => patchDraft(active, values)}
                         onAck={code => patchDraft(active, {ack_codes: [...new Set([...(active.draft.ack_codes || []), code])]})}
                         onClearExpectations={() => push({expectations: {}})}
                         onEditCode={() => setCodeDraft(active.draft.display_code || active.draft.code_raw || '')}/>

              {codeDraft !== null && (
                <div className="inline-code-edit">
                  <label>Mã câu
                    <input aria-label="Sửa mã câu" value={codeDraft} autoFocus onChange={e => setCodeDraft(e.target.value)}
                           onKeyDown={e => { if (e.key === 'Enter') saveCode(active); if (e.key === 'Escape') setCodeDraft(null); }}
                           placeholder="Câu L. 2. 1. NB. 1. TN"/>
                  </label>
                  <button className="btn primary" disabled={busy} onClick={() => saveCode(active)}>Lưu mã và kiểm lại</button>
                  <button className="btn" onClick={() => setCodeDraft(null)}>Hủy</button>
                </div>
              )}

              {active.validation.resolution?.lesson_candidates?.length > 1 && (
                <label>Chọn Bài cho câu này
                  <select value={active.draft.topic_id || ''} onChange={e => patchDraft(active, {topic_id: Number(e.target.value) || null, lesson_status: 'MANUAL'})}>
                    <option value="">Chưa chọn</option>
                    {active.validation.resolution.lesson_candidates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              )}
              {active.duplicate_candidates.length > 0 && (
                <label>Có thể trùng: {active.duplicate_candidates.map(c => `${c.display_code || c.question_code}${c.similarity != null ? ` (${c.similarity}%)` : ''}`).join(', ')}
                  <select value={active.decision} onChange={e => setDecision([active.id], e.target.value)}>
                    {Object.entries(DECISIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              )}

              {!editing && <>
                <Rich text={active.draft.stem}/>
                {(active.draft.type === 'true_false' ? active.draft.statements : active.draft.options)?.map(o => (
                  <p key={o.id}><strong>{o.id}.</strong> {o.text}</p>
                ))}
                <button className="btn" onClick={() => setEditing(true)}>Sửa chi tiết (E)</button>
              </>}
              {editing && <EditDraft item={active} catalog={catalog.data} busy={busy}
                                     onSave={draft => patchDraft(active, draft).then(ok => ok && setEditing(false))}
                                     onClose={() => setEditing(false)}/>}
            </div>}
          </aside>
        </div>

        <div className="practice-actions import-confirm">
          <button className="btn primary" disabled={busy || !confirmable.length} onClick={confirm}>
            Lưu {confirmable.length} câu vào kho
          </button>
          <span className="muted">Câu được lưu ở dạng nháp; bước sau là gửi duyệt.</span>
          {counts.ERROR > 0 && <span className="tone-danger">{counts.ERROR} câu lỗi chưa được nhập cho tới khi sửa</span>}
        </div>
      </>}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands}/>
    </WorkspaceShell>
  );
}

// Sửa chi tiết một câu trên bản sao cục bộ; chỉ gửi lên khi bấm lưu.
function EditDraft({item, catalog, busy, onSave, onClose}) {
  const [draft, setDraft] = useState(item.draft);
  useEffect(() => setDraft(item.draft), [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>
    <QuestionEditor value={draft} catalog={catalog} onChange={setDraft}/>
    <div className="practice-actions">
      <button className="btn primary" disabled={busy} onClick={() => onSave(draft)}>Lưu và kiểm lại</button>
      <button className="btn" onClick={onClose}>Đóng</button>
    </div>
  </>;
}
