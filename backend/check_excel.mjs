import XLSX from 'xlsx';
const wb = XLSX.readFile('C:\\Users\\Duong Hieu\\Downloads\\Ngan_Hang_Cau_Hoi_3_Mon_KHTN9_KNTT_sua_chu_de.xlsx');
const sheet = wb.Sheets['Nhap_lieu'];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
// Row 4 (index 3) - first data row
const row = rows[3];
for (let c = 0; c < row.length; c++) {
  console.log(`Col${c}: (${typeof row[c]}) ${JSON.stringify(String(row[c]).slice(0,100))}`);
}
// Check if any cell contains UUID pattern
console.log('\n--- Searching for UUID pattern in all rows ---');
for (let i = 3; i < Math.min(rows.length, 6); i++) {
  const r = rows[i];
  for (let c = 0; c < r.length; c++) {
    const v = String(r[c]);
    if (v.match(/[0-9a-f]{8}-[0-9a-f]{4}/)) {
      console.log(`Row${i+1} Col${c}: UUID found: ${v}`);
    }
  }
}
