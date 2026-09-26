import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

async function seed() {
  console.log('═══ SEED CORE DATA ═══');

  await pool.query(`
    INSERT INTO departments (name, code) VALUES
      ('Tổ Toán - Tin', 'TOAN_TIN'),
      ('Tổ KHTN', 'KHTN'),
      ('Tổ Ngữ Văn', 'NGU_VAN'),
      ('Tổ Ngoại Ngữ', 'NGOAI_NGU'),
      ('Tổ Sử - Địa - GDCD', 'XA_HOI')
    ON CONFLICT (code) DO NOTHING;
  `);
  console.log('✓ Tổ bộ môn');

  const { rows: depts } = await pool.query('SELECT id, code FROM departments');
  const getDeptId = (code) => depts.find(d => d.code === code)?.id;

  const subjects = [
    { code: 'Toan',     name: 'Toán',      integrated: false, dept: 'TOAN_TIN' },
    { code: 'TinHoc',   name: 'Tin học',   integrated: false, dept: 'TOAN_TIN' },
    { code: 'KHTN',     name: 'KHTN',      integrated: true,  dept: 'KHTN' },
    { code: 'VatLi',    name: 'Vật Lí',    integrated: false, dept: 'KHTN' },
    { code: 'HoaHoc',   name: 'Hóa Học',   integrated: false, dept: 'KHTN' },
    { code: 'SinhHoc',  name: 'Sinh Học',  integrated: false, dept: 'KHTN' },
    { code: 'NguVan',   name: 'Ngữ Văn',   integrated: false, dept: 'NGU_VAN' },
    { code: 'TiengAnh', name: 'Tiếng Anh', integrated: false, dept: 'NGOAI_NGU' },
    { code: 'IELTS',    name: 'IELTS',     integrated: false, dept: 'NGOAI_NGU' },
    { code: 'LichSu',   name: 'Lịch Sử',   integrated: false, dept: 'XA_HOI' },
    { code: 'DiaLi',    name: 'Địa Lí',    integrated: false, dept: 'XA_HOI' },
    { code: 'GDKTPL',   name: 'GDKT&PL',   integrated: false, dept: 'XA_HOI' },
    { code: 'GDCD',     name: 'GDCD',      integrated: false, dept: 'XA_HOI' },
    { code: 'CongNghe', name: 'Công Nghệ', integrated: false, dept: 'TOAN_TIN' },
  ];

  for (const s of subjects) {
    await pool.query(
      `INSERT INTO subjects (code, name, is_integrated, department_id)
       VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING`,
      [s.code, s.name, s.integrated, getDeptId(s.dept)]
    );
  }
  console.log(`✓ ${subjects.length} môn học`);

  const { rows: subs } = await pool.query('SELECT id, code FROM subjects');
  const khtnSub = subs.find(s => s.code === 'KHTN');

  // Chỉ KHTN có 3 phân môn (Vật lí, Hóa học, Sinh học)
  if (khtnSub) {
    const branches = [
      { code: 'VL', name: 'Vật lí',   color: '#4f8eff', order: 1 },
      { code: 'HH', name: 'Hóa học',  color: '#7c3aed', order: 2 },
      { code: 'SH', name: 'Sinh học', color: '#10b981', order: 3 },
    ];
    const existing = await pool.query('SELECT COUNT(*)::int AS n FROM branches WHERE subject_id = $1', [khtnSub.id]);
    if (existing.rows[0].n === 0) {
      for (const b of branches) {
        await pool.query(
          'INSERT INTO branches (subject_id, code, name, color, order_index) VALUES ($1, $2, $3, $4, $5)',
          [khtnSub.id, b.code, b.name, b.color, b.order]
        );
      }
      console.log('✓ 3 phân môn KHTN (Vật lí, Hóa học, Sinh học)');
    }
  }

  const adminHash = await bcrypt.hash('admin123', 10);
  const teacherHash = await bcrypt.hash('teacher123', 10);
  const khtnDept = getDeptId('KHTN');
  const toanDept = getDeptId('TOAN_TIN');

  const users = [
    ['admin', adminHash, 'Quản trị hệ thống', 'admin', null, null],
    ['bgh', adminHash, 'Ban Giám Hiệu', 'board', null, null],
    ['to_khtn', teacherHash, 'Tổ trưởng KHTN', 'dept_leader', khtnDept, khtnSub?.id || null],
    ['to_toan', teacherHash, 'Tổ trưởng Toán', 'dept_leader', toanDept, subs.find(s=>s.code==='Toan')?.id || null],
    ['nhom_khtn9', teacherHash, 'Nhóm trưởng KHTN 9', 'grade_leader', khtnDept, khtnSub?.id || null],
    // THCS: Lí / Hoá / Sinh là phân môn của KHTN (khối 6–9) — gắn môn KHTN, nếu không GV không mở được Bài/câu KHTN.
    ['gv_ly_01', teacherHash, 'Nguyễn Văn An (GV Vật lí)', 'teacher', khtnDept, khtnSub?.id || null],
    ['gv_hoa_01', teacherHash, 'Trần Thị Bình (GV Hóa)', 'teacher', khtnDept, khtnSub?.id || null],
    ['gv_sinh_01', teacherHash, 'Lê Văn Cường (GV Sinh)', 'teacher', khtnDept, khtnSub?.id || null],
    ['gv_toan_01', teacherHash, 'Phạm Thị Dung (GV Toán)', 'teacher', toanDept, subs.find(s=>s.code==='Toan')?.id || null],
  ];

  for (const [u, p, f, r, d, s] of users) {
    await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role, department_id, subject_id)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (username) DO NOTHING`,
      [u, p, f, r, d, s]
    );
  }
  console.log(`✓ ${users.length} users mẫu`);

  console.log(`
═══════════════════════════════════════════════════
Tài khoản mẫu:
  admin       / admin123   (Quản trị)
  bgh         / admin123   (BGH)
  to_khtn     / teacher123 (Tổ trưởng KHTN)
  to_toan     / teacher123 (Tổ trưởng Toán)
  nhom_khtn9  / teacher123 (Nhóm trưởng KHTN 9)
  gv_ly_01    / teacher123 (GV Vật lí)
  gv_hoa_01   / teacher123 (GV Hóa)
  gv_sinh_01  / teacher123 (GV Sinh)
  gv_toan_01  / teacher123 (GV Toán)

Dữ liệu:
  5 tổ bộ môn
  14 môn học (KHTN tích hợp 3 phân môn)
  
Bước tiếp theo:
  npm run db:seed-khtn9   # Seed khung chương trình KHTN 9 (51 bài)
═══════════════════════════════════════════════════
`);

  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
