// Hồ sơ nhập tin cậy cho bộ 4 workbook Outcome/YCCĐ KHTN 6–9 chính thức.
//
// Chỉ riêng hồ sơ này mới được coi cột "Chủ đề" là Outcome. Importer tổng quát vẫn phải để người dùng
// bật `topic_as_outcome` một cách tường minh, vì một bảng bất kỳ có cột "Chủ đề" không có nghĩa nó là
// chuẩn chương trình.

export const TRUSTED_PROFILE = 'KHTN_OUTCOME_YCCD_OFFICIAL_V1';

const HEADERS = {
  domain: ['môn', 'phân môn', 'mon'],
  group: ['chủ đề', 'chu de', 'chude'],
  text: ['yêu cầu cần đạt', 'yeu cau can dat', 'yccđ', 'yccd'],
  page: ['trang nguồn', 'trang nguon', 'trang'],
};

const BRANCHES = {
  L: ['l', 'vl', 'vật lí', 'vật lý', 'vat li', 'vat ly'],
  H: ['h', 'hh', 'hóa học', 'hoá học', 'hoa hoc'],
  S: ['s', 'sh', 'sinh học', 'sinh hoc'],
};

const flat = value => String(value ?? '').normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();

export function normalizeBranchCode(value) {
  const text = flat(value);
  if (!text) return null;
  for (const [code, aliases] of Object.entries(BRANCHES)) if (aliases.includes(text)) return code;
  for (const [code, aliases] of Object.entries(BRANCHES)) if (aliases.some(a => a.length > 2 && text.startsWith(a))) return code;
  return null;
}

// Khối lấy từ tên sheet ("YCCĐ lớp 7"), không lấy từ tên tệp viết tắt.
export function gradeFromSheetName(name) {
  const match = /lớp\s*(\d{1,2})/i.exec(String(name || '').normalize('NFC'));
  const grade = match ? Number(match[1]) : null;
  return grade >= 1 && grade <= 12 ? grade : null;
}

function matchHeader(cells) {
  const columns = {};
  for (let i = 0; i < cells.length; i++) {
    const cell = flat(cells[i]);
    if (!cell) continue;
    for (const [field, aliases] of Object.entries(HEADERS)) {
      if (columns[field] === undefined && aliases.some(a => cell === a || cell.startsWith(a))) columns[field] = i;
    }
  }
  return columns;
}

// Trả về mô tả áp dụng được ngay cho mapImport(), cho từng sheet nhận diện được.
export function detectTrustedProfile(workbook) {
  const sheets = [];
  for (const sheet of workbook?.sheets || []) {
    const grade = gradeFromSheetName(sheet.name);
    if (!grade) continue;
    for (let row = 0; row < Math.min(5, sheet.rows.length); row++) {
      const columns = matchHeader(sheet.rows[row] || []);
      if (columns.text === undefined || columns.group === undefined || columns.domain === undefined) continue;
      sheets.push({
        sheet: sheet.name,
        grade,
        header_row: row + 1,
        topic_as_outcome: true,
        columns: {
          domain: columns.domain,
          group: columns.group,
          outcome_title: columns.group,
          text: columns.text,
          ...(columns.page !== undefined ? {page: columns.page} : {}),
        },
        rows: Math.max(0, sheet.rows.length - row - 1),
      });
      break;
    }
  }
  return sheets.length ? {profile: TRUSTED_PROFILE, sheets} : null;
}

// ---------------------------------------------------------------------------------------------
// Chuẩn hóa nguồn.
//
// Số thứ tự Outcome và YCCĐ ĐÃ nằm sẵn trong văn bản nguồn và phải được tôn trọng tuyệt đối.
// Quy ước đánh số khác nhau giữa các tệp: lớp 8 đánh YCCĐ liên tục theo phân môn (1,2,3 rồi 4..11),
// lớp 7 đánh lại từ 1 trong từng Chủ đề. Nếu hệ thống tự đếm lại thì "Câu H. 2. 4" sẽ trỏ nhầm sang
// YCCĐ khác. Vì vậy: luôn đọc số từ nguồn, chỉ đếm tuần tự khi nguồn thực sự không có số, và khi đó
// phải cảnh báo để người dùng xác nhận.
// ---------------------------------------------------------------------------------------------

// "2.Phản ứng hóa học" -> {ordinal: 2, title: "Phản ứng hóa học"}
export function parseOutcomeOrdinal(raw) {
  const text = String(raw ?? '').replace(/ /g, ' ').trim();
  const match = /^(\d+)\s*[.)]\s*(.*)$/s.exec(text);
  if (match) return {ordinal: Number(match[1]), title: match[2].trim() || text, flags: []};
  return {ordinal: null, title: text, flags: text ? ['SOURCE_OUTCOME_NUMBER_MISSING'] : []};
}

// Một ô "Yêu cầu cần đạt" có thể chứa nhiều YCCĐ đánh số. Tách theo ranh giới đầu dòng "<số>." —
// KHÔNG tách theo "+", vì "+" là gạch đầu dòng nối tiếp bên trong cùng một yêu cầu.
export function parseYccdSegments(raw) {
  const text = String(raw ?? '').replace(/ /g, ' ').replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const lines = text.split('\n');
  const segments = [];
  let leadIn = '';
  for (const line of lines) {
    const started = /^\s*(\d+)\s*[.)]\s*(.*)$/s.exec(line);
    // Các dạng hỏng có thật trong nguồn, đều nhận ra được nhưng luôn phải gắn cờ để người dùng xác
    // nhận: ". 5Nêu được..." (số dính chữ, có dấu chấm đứng trước), "6 Trình bày..." (thiếu dấu
    // chấm), "5Nêu..." (số dính thẳng vào chữ). Yêu cầu chữ cái viết hoa ngay sau số để không cắt
    // nhầm những dòng nối tiếp có chứa số.
    const malformed = /^\s*[.)]\s*(\d+)\s*(\p{Lu}.*)$/su.exec(line)
      || /^\s*(\d+)\s+(\p{Lu}.*)$/su.exec(line)
      || /^\s*(\d+)(\p{Lu}.*)$/su.exec(line);
    if (started) {
      segments.push({ordinal: Number(started[1]), text: started[2].trim(), flags: []});
    } else if (malformed) {
      segments.push({ordinal: Number(malformed[1]), text: malformed[2].trim(), flags: ['SOURCE_NUMBER_MALFORMED']});
    } else if (segments.length) {
      // Dòng nối tiếp (thường bắt đầu bằng "+") thuộc về yêu cầu ngay trước nó.
      segments[segments.length - 1].text += '\n' + line.trim();
    } else {
      leadIn += (leadIn ? '\n' : '') + line.trim();
    }
  }

  if (!segments.length) {
    return [{ordinal: null, text: text, flags: ['SOURCE_YCCD_NUMBER_MISSING']}];
  }
  if (leadIn) {
    // Câu dẫn không đánh số đứng trước danh sách: giữ lại làm ngữ cảnh của mục đầu tiên và báo để
    // người dùng quyết định, thay vì âm thầm vứt đi.
    segments[0].text = leadIn + '\n' + segments[0].text;
    segments[0].flags = [...new Set([...segments[0].flags, 'SOURCE_LEADIN_TEXT'])];
  }
  if (segments.length > 1) {
    for (const s of segments) s.flags = [...new Set([...s.flags, 'SOURCE_ROW_SPLIT'])];
  }
  return segments;
}

// Mở rộng các dòng nguồn thành đúng một YCCĐ mỗi dòng, mang theo số thứ tự thật của nguồn.
export function normalizeSourceRows(rows) {
  const fallback = new Map();
  const out = [];
  for (const row of rows) {
    const branch = normalizeBranchCode(row.domain);
    const outcome = parseOutcomeOrdinal(row.outcome_title || row.group);
    const segments = parseYccdSegments(row.text);
    if (!segments.length) { out.push({...row, branch_code: branch, outcome_ordinal: outcome.ordinal, yccd_ordinal: null, source_flags: outcome.flags}); continue; }

    for (const segment of segments) {
      const flags = [...outcome.flags, ...segment.flags];
      let outcomeOrdinal = outcome.ordinal;
      if (outcomeOrdinal == null) {
        // Nguồn không đánh số Chủ đề: đếm tuần tự trong phân môn, nhưng phải nói rõ là suy ra.
        const key = 'outcome|' + branch;
        const seen = fallback.get(key) || new Map();
        const title = flat(outcome.title);
        if (!seen.has(title)) seen.set(title, seen.size + 1);
        fallback.set(key, seen);
        outcomeOrdinal = seen.get(title);
        flags.push('SOURCE_ORDINAL_FALLBACK');
      }
      let yccdOrdinal = segment.ordinal;
      if (yccdOrdinal == null) {
        const key = 'yccd|' + branch + '|' + outcomeOrdinal;
        const next = (fallback.get(key) || 0) + 1;
        fallback.set(key, next);
        yccdOrdinal = next;
        flags.push('SOURCE_ORDINAL_FALLBACK');
      }
      out.push({
        ...row,
        outcome_title: outcome.title,
        text: segment.text,
        branch_code: branch,
        outcome_ordinal: outcomeOrdinal,
        yccd_ordinal: yccdOrdinal,
        source_flags: [...new Set(flags)],
      });
    }
  }

  // Nguồn chính thức có chỗ đánh trùng số (đã gặp: hai YCCĐ khác nhau cùng số 1 trong một Chủ đề).
  // Không được tự đánh lại số để "chữa" — đó là quyết định của người phụ trách chương trình. Đánh dấu
  // để chặn commit cho tới khi có người sửa.
  const seen = new Map();
  for (const row of out) {
    if (row.yccd_ordinal == null) continue;
    const key = [row.branch_code, row.outcome_ordinal, row.yccd_ordinal].join(':');
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(row);
  }
  for (const rows of seen.values()) {
    if (rows.length > 1) for (const row of rows) row.source_flags = [...new Set([...row.source_flags, 'SOURCE_ORDINAL_DUPLICATE'])];
  }
  return out;
}

// Giữ tên cũ cho các nơi đang gọi; nay uỷ quyền cho bộ chuẩn hóa tôn trọng số nguồn.
export const assignOrdinals = normalizeSourceRows;

// Cờ buộc người dùng xác nhận trước khi commit: không để dữ liệu chương trình sai lọt vào DRAFT.
export const BLOCKING_SOURCE_FLAGS = new Set([
  'SOURCE_NUMBER_MALFORMED', 'SOURCE_ORDINAL_FALLBACK', 'SOURCE_YCCD_NUMBER_MISSING', 'SOURCE_OUTCOME_NUMBER_MISSING',
]);

// Trùng số trong nguồn thì không thể "xác nhận cho qua": hai YCCĐ sẽ đụng cùng một khóa tra cứu,
// nên bắt buộc phải có người sửa số trước khi commit.
export const HARD_BLOCK_SOURCE_FLAGS = new Set(['SOURCE_ORDINAL_DUPLICATE']);
