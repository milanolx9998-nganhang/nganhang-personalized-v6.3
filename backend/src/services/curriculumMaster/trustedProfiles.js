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

// Gán số thứ tự Outcome trong từng phân môn và số thứ tự YCCĐ trong từng Outcome, theo đúng thứ tự
// xuất hiện trong văn bản nguồn. Đây chính là nghĩa của "Outcome số 2 của phân môn Vật lí".
export function assignOrdinals(rows) {
  const outcomes = new Map(), counters = new Map();
  return rows.map(row => {
    const branch = normalizeBranchCode(row.domain);
    const title = flat(row.outcome_title || row.group);
    const outcomeKey = branch + '|' + title;
    if (!outcomes.has(outcomeKey)) {
      const next = (counters.get(branch) || 0) + 1;
      counters.set(branch, next);
      outcomes.set(outcomeKey, {ordinal: next, yccd: 0});
    }
    const entry = outcomes.get(outcomeKey);
    entry.yccd += 1;
    return {...row, branch_code: branch, outcome_ordinal: entry.ordinal, yccd_ordinal: entry.yccd};
  });
}
