import 'dotenv/config';
import { pool } from './pool.js';

const KHTN9_CURRICULUM = [
  { branch: 'Vật lí', bai: 'Bài 1', name: 'Nhận biết một số dụng cụ, hoá chất. Thuyết trình một vấn đề khoa học', goal: 'Nhận biết dụng cụ - hoá chất cơ bản và trình bày ngắn gọn một vấn đề khoa học.' },
  { branch: 'Vật lí', bai: 'Bài 2', name: 'Động năng. Thế năng', goal: 'Nêu được khái niệm động năng, thế năng và yếu tố ảnh hưởng đến chúng.' },
  { branch: 'Vật lí', bai: 'Bài 3', name: 'Cơ năng', goal: 'Mô tả cơ năng, sự chuyển hoá giữa động năng và thế năng trong các tình huống đơn giản.' },
  { branch: 'Vật lí', bai: 'Bài 4', name: 'Công và công suất', goal: 'Tính được công, công suất và liên hệ với hiệu quả hoạt động của thiết bị.' },
  { branch: 'Vật lí', bai: 'Bài 5', name: 'Khúc xạ ánh sáng', goal: 'Nhận biết hiện tượng khúc xạ và mô tả đường truyền của tia sáng qua mặt phân cách.' },
  { branch: 'Vật lí', bai: 'Bài 6', name: 'Phản xạ toàn phần', goal: 'Nêu điều kiện xảy ra phản xạ toàn phần và vận dụng vào một số thiết bị quang.' },
  { branch: 'Vật lí', bai: 'Bài 7', name: 'Lăng kính', goal: 'Mô tả tác dụng của lăng kính và đường truyền tia sáng qua lăng kính.' },
  { branch: 'Vật lí', bai: 'Bài 8', name: 'Thấu kính', goal: 'Phân biệt thấu kính hội tụ, phân kì và nêu tính chất tạo ảnh cơ bản.' },
  { branch: 'Vật lí', bai: 'Bài 9', name: 'Thực hành đo tiêu cự của thấu kính hội tụ', goal: 'Thực hành xác định tiêu cự thấu kính hội tụ bằng phương pháp đo phù hợp.' },
  { branch: 'Vật lí', bai: 'Bài 10', name: 'Kính lúp. Bài tập thấu kính', goal: 'Giải thích công dụng kính lúp và vận dụng công thức, tia sáng để giải bài tập thấu kính.' },
  { branch: 'Vật lí', bai: 'Bài 11', name: 'Điện trở. Định luật Ohm', goal: 'Nêu được điện trở, phát biểu định luật Ohm và tính các đại lượng trong mạch điện.' },
  { branch: 'Vật lí', bai: 'Bài 12', name: 'Đoạn mạch nối tiếp, song song', goal: 'So sánh đoạn mạch nối tiếp và song song, tính điện trở tương đương đơn giản.' },
  { branch: 'Vật lí', bai: 'Bài 13', name: 'Năng lượng của dòng điện và công suất điện', goal: 'Tính điện năng tiêu thụ, công suất điện và liên hệ với sử dụng điện an toàn, tiết kiệm.' },
  { branch: 'Vật lí', bai: 'Bài 14', name: 'Cảm ứng điện từ. Nguyên tắc tạo ra dòng điện xoay chiều', goal: 'Mô tả hiện tượng cảm ứng điện từ và nguyên tắc tạo ra dòng điện xoay chiều.' },
  { branch: 'Vật lí', bai: 'Bài 15', name: 'Tác dụng của dòng điện xoay chiều', goal: 'Nêu các tác dụng của dòng điện xoay chiều và một số ứng dụng thực tiễn.' },
  { branch: 'Hóa học', bai: 'Bài 16', name: 'Vòng năng lượng trên Trái Đất. Năng lượng hoá thạch', goal: 'Mô tả vòng năng lượng trên Trái Đất và vai trò, hạn chế của năng lượng hoá thạch.' },
  { branch: 'Hóa học', bai: 'Bài 17', name: 'Một số dạng năng lượng tái tạo', goal: 'Nhận biết một số nguồn năng lượng tái tạo và ưu điểm đối với phát triển bền vững.' },
  { branch: 'Hóa học', bai: 'Bài 18', name: 'Tính chất chung của kim loại', goal: 'Nêu được một số tính chất vật lí, hoá học chung của kim loại.' },
  { branch: 'Hóa học', bai: 'Bài 19', name: 'Dãy hoạt động hoá học', goal: 'Sử dụng dãy hoạt động hoá học để dự đoán khả năng phản ứng của kim loại.' },
  { branch: 'Hóa học', bai: 'Bài 20', name: 'Tách kim loại và việc sử dụng hợp kim', goal: 'Trình bày cách tách một số kim loại và vai trò của hợp kim trong đời sống.' },
  { branch: 'Hóa học', bai: 'Bài 21', name: 'Sự khác nhau cơ bản giữa phi kim và kim loại', goal: 'So sánh đặc điểm cơ bản giữa phi kim và kim loại về cấu tạo, tính chất, ứng dụng.' },
  { branch: 'Hóa học', bai: 'Bài 22', name: 'Giới thiệu về hợp chất hữu cơ', goal: 'Nêu khái niệm hợp chất hữu cơ, hoá học hữu cơ và đặc điểm cấu tạo cơ bản.' },
  { branch: 'Hóa học', bai: 'Bài 23', name: 'Alkane', goal: 'Nêu công thức chung, tính chất cơ bản và ứng dụng của alkane.' },
  { branch: 'Hóa học', bai: 'Bài 24', name: 'Alkene', goal: 'Nêu đặc điểm liên kết đôi, phản ứng đặc trưng và ứng dụng của alkene.' },
  { branch: 'Hóa học', bai: 'Bài 25', name: 'Nguồn nhiên liệu', goal: 'Phân loại nhiên liệu, nêu nguồn gốc và cách sử dụng nhiên liệu hiệu quả, an toàn.' },
  { branch: 'Hóa học', bai: 'Bài 26', name: 'Ethylic alcohol', goal: 'Nêu tính chất, ứng dụng và phản ứng đặc trưng của ethylic alcohol.' },
  { branch: 'Hóa học', bai: 'Bài 27', name: 'Acetic acid', goal: 'Nêu tính chất, ứng dụng và phản ứng đặc trưng của acetic acid.' },
  { branch: 'Hóa học', bai: 'Bài 28', name: 'Lipid', goal: 'Nhận biết lipid, vai trò dinh dưỡng và lưu ý khi sử dụng chất béo.' },
  { branch: 'Hóa học', bai: 'Bài 29', name: 'Carbohydrate. Glucose và saccharose', goal: 'Phân biệt một số carbohydrate thông dụng và nêu tính chất, ứng dụng của glucose, saccharose.' },
  { branch: 'Hóa học', bai: 'Bài 30', name: 'Tinh bột và cellulose', goal: 'Nêu cấu tạo khái quát, tính chất và ứng dụng của tinh bột, cellulose.' },
  { branch: 'Hóa học', bai: 'Bài 31', name: 'Protein', goal: 'Nêu thành phần, vai trò và biến đổi của protein trong đời sống.' },
  { branch: 'Hóa học', bai: 'Bài 32', name: 'Polymer', goal: 'Nhận biết polymer, một số vật liệu polymer phổ biến và vấn đề môi trường liên quan.' },
  { branch: 'Hóa học', bai: 'Bài 33', name: 'Sơ lược về hoá học vỏ Trái Đất và khai thác tài nguyên từ vỏ Trái Đất', goal: 'Khái quát thành phần hoá học của vỏ Trái Đất và định hướng khai thác tài nguyên hợp lí.' },
  { branch: 'Hóa học', bai: 'Bài 34', name: 'Khai thác đá vôi. Công nghiệp silicate', goal: 'Nêu cách khai thác đá vôi, sản xuất vật liệu silicate và ứng dụng thực tiễn.' },
  { branch: 'Hóa học', bai: 'Bài 35', name: 'Khai thác nhiên liệu hoá thạch. Nguồn carbon. Chu trình carbon và sự ấm lên toàn cầu', goal: 'Liên hệ khai thác nhiên liệu hoá thạch với chu trình carbon và biến đổi khí hậu.' },
  { branch: 'Sinh học', bai: 'Bài 36', name: 'Khái quát về di truyền học', goal: 'Nêu đối tượng, nhiệm vụ cơ bản của di truyền học và ý nghĩa trong đời sống.' },
  { branch: 'Sinh học', bai: 'Bài 37', name: 'Các quy luật di truyền của Mendel', goal: 'Vận dụng các quy luật Mendel để giải thích kết quả lai đơn giản.' },
  { branch: 'Sinh học', bai: 'Bài 38', name: 'Nucleic acid và gene', goal: 'Mô tả thành phần, cấu trúc cơ bản của nucleic acid và vai trò của gene.' },
  { branch: 'Sinh học', bai: 'Bài 39', name: 'Tái bản DNA và phiên mã tạo RNA', goal: 'Trình bày khái quát quá trình tái bản DNA và phiên mã.' },
  { branch: 'Sinh học', bai: 'Bài 40', name: 'Dịch mã và mối quan hệ từ gene đến tính trạng', goal: 'Mô tả dịch mã và giải thích mối liên hệ từ gene đến protein, tính trạng.' },
  { branch: 'Sinh học', bai: 'Bài 41', name: 'Đột biến gene', goal: 'Nêu khái niệm, nguyên nhân, hậu quả và ý nghĩa của đột biến gene.' },
  { branch: 'Sinh học', bai: 'Bài 42', name: 'Nhiễm sắc thể và bộ nhiễm sắc thể', goal: 'Nhận biết cấu trúc nhiễm sắc thể và bộ nhiễm sắc thể của loài.' },
  { branch: 'Sinh học', bai: 'Bài 43', name: 'Nguyên phân và giảm phân', goal: 'So sánh nguyên phân với giảm phân và ý nghĩa sinh học của mỗi quá trình.' },
  { branch: 'Sinh học', bai: 'Bài 44', name: 'Nhiễm sắc thể giới tính và cơ chế xác định giới tính', goal: 'Giải thích vai trò NST giới tính và cơ chế xác định giới tính ở sinh vật.' },
  { branch: 'Sinh học', bai: 'Bài 45', name: 'Di truyền liên kết', goal: 'Nêu khái niệm di truyền liên kết và ý nghĩa trong chọn giống.' },
  { branch: 'Sinh học', bai: 'Bài 46', name: 'Đột biến nhiễm sắc thể', goal: 'Phân biệt các dạng đột biến NST và nêu hậu quả, ý nghĩa của chúng.' },
  { branch: 'Sinh học', bai: 'Bài 47', name: 'Di truyền học với con người', goal: 'Nhận biết một số bệnh, tật di truyền và vai trò của tư vấn di truyền.' },
  { branch: 'Sinh học', bai: 'Bài 48', name: 'Ứng dụng công nghệ di truyền vào đời sống', goal: 'Trình bày một số ứng dụng, lợi ích và vấn đề đạo đức của công nghệ di truyền.' },
  { branch: 'Sinh học', bai: 'Bài 49', name: 'Khái niệm tiến hoá và các hình thức chọn lọc', goal: 'Nêu khái niệm tiến hoá và vai trò của các hình thức chọn lọc.' },
  { branch: 'Sinh học', bai: 'Bài 50', name: 'Cơ chế tiến hoá', goal: 'Mô tả một số cơ chế cơ bản làm biến đổi tần số allele và thành phần kiểu gene.' },
  { branch: 'Sinh học', bai: 'Bài 51', name: 'Sự phát sinh và phát triển sự sống trên Trái Đất', goal: 'Khái quát các giai đoạn phát sinh, phát triển sự sống trên Trái Đất.' },
];

function getChapterGroup(bai, branchName) {
  const num = parseInt(bai.replace('Bài ', ''), 10);
  if (branchName === 'Vật lí') {
    if (num <= 4) return 'KHTN 9 — Vật lí: Năng lượng & Cơ năng';
    if (num <= 10) return 'KHTN 9 — Vật lí: Quang học';
    return 'KHTN 9 — Vật lí: Điện từ';
  }
  if (branchName === 'Hóa học') {
    if (num <= 17) return 'KHTN 9 — Hóa học: Năng lượng';
    if (num <= 21) return 'KHTN 9 — Hóa học: Kim loại & Phi kim';
    if (num <= 25) return 'KHTN 9 — Hóa học: Hợp chất hữu cơ cơ bản';
    if (num <= 32) return 'KHTN 9 — Hóa học: Hợp chất sinh học';
    return 'KHTN 9 — Hóa học: Trái Đất & Môi trường';
  }
  if (branchName === 'Sinh học') {
    if (num <= 41) return 'KHTN 9 — Sinh học: Di truyền phân tử';
    if (num <= 48) return 'KHTN 9 — Sinh học: Di truyền & Ứng dụng';
    return 'KHTN 9 — Sinh học: Tiến hóa';
  }
  return 'KHTN 9 — Khác';
}

async function seedKHTN9() {
  console.log('═══ SEED KHUNG CHƯƠNG TRÌNH KHTN 9 ═══');

  const { rows: [khtnSub] } = await pool.query(
    "SELECT id FROM subjects WHERE code = 'KHTN' LIMIT 1"
  );
  if (!khtnSub) {
    console.error('❌ Chưa có môn KHTN. Chạy `npm run db:seed` trước.');
    process.exit(1);
  }

  const { rows: branches } = await pool.query(
    'SELECT id, name FROM branches WHERE subject_id = $1',
    [khtnSub.id]
  );
  const branchMap = Object.fromEntries(branches.map(b => [b.name, b.id]));

  const existing = await pool.query(
    'SELECT COUNT(*)::int AS n FROM topics WHERE subject_id = $1 AND grade = 9',
    [khtnSub.id]
  );
  if (existing.rows[0].n > 0) {
    console.log(`⚠ Đã có ${existing.rows[0].n} bài KHTN 9. Bỏ qua để tránh trùng.`);
    await pool.end();
    return;
  }

  let order = 0;
  for (const item of KHTN9_CURRICULUM) {
    order++;
    const branchId = branchMap[item.branch];
    const chapter = getChapterGroup(item.bai, item.branch);
    await pool.query(
      `INSERT INTO topics (subject_id, branch_id, grade, chapter, name, order_index, learning_goal)
       VALUES ($1, $2, 9, $3, $4, $5, $6)`,
      [khtnSub.id, branchId, chapter, `${item.bai}: ${item.name}`, order, item.goal]
    );
  }

  const { rows: [{ n }] } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM topics WHERE subject_id = $1 AND grade = 9',
    [khtnSub.id]
  );
  console.log(`✓ Đã nạp ${n} bài KHTN 9 (Vật lí + Hóa học + Sinh học)`);

  console.log('\n📌 Hoàn tất. Có thể tạo ma trận KHTN 9 ngay.');
  await pool.end();
}

seedKHTN9().catch(err => { console.error(err); process.exit(1); });
